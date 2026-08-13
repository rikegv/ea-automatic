import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { AiClientService } from "../ai/ai-client.service";
import { AiModule } from "../ai/ai.module";
import { montarNomePasta } from "../ai/drive-routing";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { StagingService } from "../staging/staging.service";
import { DrizzleModule } from "./drizzle.module";
import { createDb } from "./client";
import {
  admissoes,
  candidatos,
  clientes,
  documentosAdmissao,
  frentesAdmissao,
  tiposDocumento,
} from "./schema";

/**
 * CARGA ÚNICA: leva ao prontuário os ASOs que ficaram para trás (aprovada pelo diretor, 13/08/2026).
 *
 * POR QUE EXISTE. A correção `64d706b` fechou o buraco do APTO da I.A, mas só age em ASO NOVO: ela
 * dispara no upload. As admissões que já passaram pelo APTO antes dela têm o ASO parado na staging,
 * e a staging tem TTL de 48h. Sem esta carga, esses documentos somem sem nunca terem chegado ao
 * Drive. É passivo, não fluxo: roda uma vez e não vira rotina.
 *
 * NÃO É EDIÇÃO MANUAL DE DADO, e isso é o ponto (§A.26). O runner NÃO escreve no banco nem fala com
 * o Drive: ele sobe o contexto do Nest e chama `AuditoriaService.arquivarAso`, exatamente o mesmo
 * método que o APTO manual e o APTO da I.A chamam no fluxo vivo, já provado ao vivo. Quem decide se
 * arquiva, para onde vai, o que gravar e o que apagar continua sendo o código de produção; o runner
 * só escolhe EM QUAIS admissões ele roda.
 *
 * O RECORTE, e por que ele é mais estreito que o do método:
 *  - EXAME em APTO e concluída. É a regra do diretor ("no APTO o ASO vai para o prontuário"), então
 *    quem ainda não chegou lá não entra nesta carga.
 *  - `drive_aso_url` nulo. Já arquivado não se re-arquiva (o próprio método também barra, por
 *    `precisaArquivarDrive`; o filtro aqui é só para o relatório não mentir sobre o tamanho da fila).
 *  - Documento ASO em ENTREGUE. É a trava que o método NÃO tem, porque no fluxo vivo quem a aplica é
 *    o chamador (só arquiva com `asoValidado`). Sem ela, uma carga em lote poderia mandar ao
 *    prontuário um ASO REPROVADO. ENTREGUE inclui o documento aprovado pela I.A e o validado à mão,
 *    e a validação humana não é tocada nem reavaliada: ela é lida como veredito e respeitada.
 *  - Com arquivo de ASO na staging. Sem binário não há o que subir.
 *
 * IDEMPOTENTE. Rodar duas vezes não abre segunda pasta nem sobe segunda cópia: a guarda vive dentro
 * do método (`precisaArquivarDrive`), e ele ainda tira o ASO da staging ao subir, então o fechamento
 * da régua também não o reenvia depois.
 *
 * BEST-EFFORT POR ADMISSÃO: uma falha de Drive não derruba as demais, é contada e segue.
 *
 * Uso:  pnpm db:carga-aso-prontuario            # DRY-RUN, lista e não escreve
 *       pnpm db:carga-aso-prontuario --aplicar  # executa
 *
 * §A.6: relatório e log por id de admissão, código de cliente e tipo de contrato. Nunca nome de
 * candidato, CPF ou caminho de arquivo.
 */

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DrizzleModule, AiModule, AuditoriaModule],
})
class CargaAsoModule {}

/**
 * O QUE FAZER COM CADA ADMISSÃO, decidido pela conferência no Drive.
 *
 * `VINCULAR` é a regra do diretor: se o time já salvou o ASO à mão, a carga NÃO sobe nada e apenas
 * grava a referência da pasta, para o sistema saber que está arquivado e parar de pedir. Lote nunca
 * passa por cima de trabalho humano.
 *
 * `PULAR` cobre a dúvida: sem rota de pasta-pai, ou com o Drive indisponível na hora da conferência,
 * a carga não escreve. Não saber se já existe é motivo para NÃO subir, nunca para subir assim mesmo.
 */
type Acao = "SUBIR" | "VINCULAR" | "PULAR";

/** Uma admissão elegível, já com o destino resolvido para o relatório do dry-run. */
interface Alvo {
  admissaoId: string;
  codCliente: string | null;
  operacao: string | null;
  tipoContrato: string | null;
  /** Pasta-pai do Drive resolvida por contrato/cliente. Nulo = sem rota, o método não arquivaria. */
  pastaPaiId: string | null;
  /** Já existe pasta do prontuário para ancorar (evita abrir uma segunda). */
  temProntuario: boolean;
  acao: Acao;
  /** Por que essa ação, em uma linha, para o relatório. */
  motivo: string;
  /** Quantos documentos a subpasta ASO já tem no Drive. */
  asosNoDrive: number;
  /** URL da pasta do prontuário achada na conferência (usada no VINCULAR). */
  pastaUrl?: string;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");

  const app = await NestFactory.createApplicationContext(CargaAsoModule, {
    // `log` incluído de propósito: é o nível em que o `AuditoriaService` reporta "ASO arquivado no
    // Drive", que é a prova que se quer ver saindo do próprio código de produção.
    logger: ["log", "warn", "error"],
  });

  const { sql, db } = createDb(url, 1);
  try {
    const staging = app.get(StagingService);
    const pastaPai = app.get(DrivePastaPaiService);

    // 1) QUEM ESTÁ NA STAGING. Começa pelo disco porque é o conjunto mais estreito e o único que
    // decide de verdade: sem arquivo não há carga, por mais que o banco diga que o ASO existe.
    const asoNaStaging: string[] = [];
    const todas = await db.select({ id: admissoes.id }).from(admissoes);
    for (const a of todas) {
      const arquivos = await staging.listar(a.id).catch(() => []);
      if (arquivos.some((f) => f.codigoTipo === "ASO")) asoNaStaging.push(a.id);
    }
    console.log(`Admissões com ASO na staging: ${asoNaStaging.length}`);
    if (asoNaStaging.length === 0) {
      console.log("Nada a fazer.");
      return;
    }

    // 2) O RECORTE NO BANCO: APTO concluído, sem URL de ASO e com o documento em ENTREGUE.
    const tipoAso = await db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "ASO"),
    });
    if (!tipoAso) throw new Error("Tipo de documento ASO não cadastrado");

    const elegiveis = await db
      .select({
        admissaoId: admissoes.id,
        codCliente: admissoes.codCliente,
        operacao: clientes.nomeOperacao,
        tipoContrato: admissoes.tipoContrato,
        drivePastaUrl: admissoes.drivePastaUrl,
        // ENTRA SÓ PARA MONTAR O NOME DA PASTA do prontuário, que é a chave de busca no Drive
        // (`{NOME} — {operação}`, exceção já registrada da §A.6). NUNCA é impresso no relatório nem
        // em log: as linhas saem por id de admissão.
        candidatoNome: candidatos.nome,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .innerJoin(
        frentesAdmissao,
        and(
          eq(frentesAdmissao.admissaoId, admissoes.id),
          eq(frentesAdmissao.tipo, "EXAME"),
          eq(frentesAdmissao.status, "APTO"),
          eq(frentesAdmissao.concluida, true),
        ),
      )
      .innerJoin(
        documentosAdmissao,
        and(
          eq(documentosAdmissao.admissaoId, admissoes.id),
          eq(documentosAdmissao.tipoDocumentoId, tipoAso.id),
          eq(documentosAdmissao.estado, "ENTREGUE"),
        ),
      )
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .where(and(inArray(admissoes.id, asoNaStaging), isNull(admissoes.driveAsoUrl)));

    // 3) CONFERÊNCIA NO DRIVE, ANTES DE QUALQUER ESCRITA (regra do diretor). Para cada admissão,
    // olha se a subpasta ASO do prontuário já tem documento. Achando, a carga não sobe: o ASO já foi
    // salvo à mão pelo time, e o lote só grava a referência.
    //
    // NÃO BASTA O md5 DO ARQUIVAMENTO. Aquela checagem ignora o arquivo IDÊNTICO, o que resolve a
    // cópia byte a byte, mas o mesmo ASO escaneado ou reexportado tem outros bytes e viraria uma
    // SEGUNDA cópia na subpasta. A conferência aqui é por PRESENÇA, que é a régua do diretor.
    const ai = app.get(AiClientService);
    const alvos: Alvo[] = [];
    for (const e of elegiveis) {
      const pastaPaiId = await pastaPai.resolver(e.tipoContrato, e.codCliente);
      const base = {
        admissaoId: e.admissaoId,
        codCliente: e.codCliente,
        operacao: e.operacao,
        tipoContrato: e.tipoContrato,
        pastaPaiId,
        temProntuario: Boolean(e.drivePastaUrl),
      };

      if (!pastaPaiId) {
        alvos.push({
          ...base,
          acao: "PULAR",
          motivo: "sem rota de pasta-pai para contrato/cliente",
          asosNoDrive: 0,
        });
        continue;
      }

      const nomePasta = montarNomePasta(e.candidatoNome, e.operacao);
      const olhada = await ai.inspecionarSubpastaDrive(pastaPaiId, nomePasta, "ASO");

      if (olhada.indisponivel) {
        alvos.push({
          ...base,
          acao: "PULAR",
          motivo: "Drive não respondeu a conferência, na dúvida não sobe",
          asosNoDrive: 0,
        });
      } else if (olhada.subpastaEncontrada && olhada.arquivos > 0) {
        alvos.push({
          ...base,
          acao: "VINCULAR",
          motivo: `já tem ${olhada.arquivos} documento(s) na subpasta ASO, salvo à mão`,
          asosNoDrive: olhada.arquivos,
          pastaUrl: olhada.pastaUrl,
        });
      } else {
        alvos.push({
          ...base,
          acao: "SUBIR",
          motivo: olhada.pastaEncontrada
            ? "prontuário existe e a subpasta ASO está vazia"
            : "prontuário ainda não existe no Drive",
          asosNoDrive: 0,
          pastaUrl: olhada.pastaUrl,
        });
      }
    }

    console.log(`Elegíveis (APTO concluído, ASO ENTREGUE, sem drive_aso_url): ${alvos.length}`);
    console.log(
      `Fora do recorte: ${asoNaStaging.length - alvos.length} ` +
        `(exame não APTO, ASO sem veredito favorável ou já arquivado).\n`,
    );

    const por = (a: Acao) => alvos.filter((t) => t.acao === a);
    const rotulo: Record<Acao, string> = {
      SUBIR: "SOBEM de verdade (subpasta ASO vazia no Drive)",
      VINCULAR: "JÁ ESTAVAM NO DRIVE (salvas à mão): só vinculam, nada sobe",
      PULAR: "PULADAS (nada é escrito)",
    };
    for (const acao of ["SUBIR", "VINCULAR", "PULAR"] as const) {
      const lista = por(acao);
      console.log(`${rotulo[acao]}: ${lista.length}`);
      for (const t of lista) {
        console.log(
          `  ${t.admissaoId} | cliente ${t.codCliente ?? "não informado"} ` +
            `(${t.operacao ?? "não informado"}) | ${t.tipoContrato ?? "não informado"} | ` +
            `${t.motivo}` +
            `${t.pastaPaiId ? ` | pasta-pai ${t.pastaPaiId}` : ""}`,
        );
      }
      console.log("");
    }

    if (!aplicar) {
      console.log("DRY-RUN. Nada foi escrito. Rode com --aplicar para executar a carga.");
      return;
    }

    // 4) EXECUÇÃO. Duas escritas diferentes, e a distinção é a regra do diretor: quem já tem ASO no
    // Drive NÃO recebe upload nenhum, só a referência, para o sistema parar de considerar pendente.
    const auditoria = app.get(AuditoriaService);
    let arquivadas = 0;
    let vinculadas = 0;
    let semAcao = 0;
    let falhas = 0;

    for (const t of por("VINCULAR")) {
      try {
        // SEM PASSAR PELO ARQUIVAMENTO: grava só a referência da pasta que a conferência achou. O
        // ASO segue na staging e cai pelo TTL, como todo documento já arquivado.
        await db
          .update(admissoes)
          .set({ driveAsoUrl: t.pastaUrl, atualizadoEm: new Date() })
          .where(eq(admissoes.id, t.admissaoId));
        vinculadas += 1;
        console.log(`  [vinculado ao que já estava no Drive] admissão ${t.admissaoId}`);
      } catch (e) {
        falhas += 1;
        console.log(
          `  [erro ao vincular] admissão ${t.admissaoId}: ${e instanceof Error ? e.message : "erro"}`,
        );
      }
    }

    for (const t of por("SUBIR")) {
      try {
        const r = await auditoria.arquivarAso(t.admissaoId);
        if (r) {
          arquivadas += 1;
          console.log(`  [arquivado] admissão ${t.admissaoId}`);
        } else {
          semAcao += 1;
          console.log(`  [sem ação] admissão ${t.admissaoId}`);
        }
      } catch (e) {
        falhas += 1;
        console.log(
          `  [erro] admissão ${t.admissaoId}: ${e instanceof Error ? e.message : "erro"}`,
        );
      }
    }

    console.log(
      `\nResumo: ${arquivadas} arquivado(s), ${vinculadas} vinculado(s) ao que já estava no Drive, ` +
        `${falhas} com falha, ${semAcao} sem ação, ${por("PULAR").length} pulada(s).`,
    );
  } finally {
    await sql.end({ timeout: 5 });
    await app.close();
  }
}

// SAÍDA EXPLÍCITA: o contexto do Nest levanta a fila do Pandapé (Redis) junto, e as conexões dela
// seguram o processo vivo mesmo depois do `app.close()`. Sem isto o runner termina o trabalho e fica
// pendurado, o que num script de carga parece falha e convida a matá-lo no meio.
void main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
