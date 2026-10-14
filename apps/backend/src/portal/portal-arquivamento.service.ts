import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, candidatos, clientes, portalCredenciais, tiposDocumento } from "../db/schema";
import { FABRICIO_FORA_DO_LOTE } from "../domain/portal-reprocesso-lote";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { idDaPastaUrl, montarNomePasta, resolveSubpasta } from "../ai/drive-routing";
import { PortalArmazenamentoService } from "./portal-armazenamento.service";
import {
  PortalArquivadorService,
  type ObjetoParaArquivar,
} from "./portal-arquivador.service";

/**
 * O ORQUESTRADOR do arquivamento do Portal no prontuário (Desenho 1, frente Prontuário Drive).
 *
 * O PROBLEMA QUE ISTO RESOLVE: o documento entregue pelo Portal vive só no balde de entrada e nunca
 * chegava ao prontuário do Drive, porque o leitor (que lê o balde) não tem Drive e o arquivador da
 * esteira (que tem Drive) lê só a staging local. Este serviço é a ponte do lado do backend: resolve
 * a pasta do prontuário da admissão EXATAMENTE como a esteira (mesma `DrivePastaPaiService`, mesmo
 * `montarNomePasta`, mesma âncora, mesma subpasta por tipo), monta a lista de objetos confirmados
 * no balde e pede à instância ARQUIVADOR que copie cada um, cega. A dedup por md5 do arquivador faz
 * o conjunto ser IDEMPOTENTE: reprocessar não duplica.
 *
 * DOIS GATILHOS, UMA RÉGUA:
 *  - LIVE (`talvezArquivarDoVeredito`): chamado no ramo VALIDADO->ENTREGUE de
 *    `portal-credencial.service.ts`, por documento, logo que a confirmação chega. Só dispara quando
 *    ARMADO, nunca lança no caminho quente, e arquiva o objeto daquele tipo.
 *  - RETRO (`arquivarPortal`): o runner `db/rearquiva-portal.ts` chama por admissão, para cobrir o
 *    que entrou antes de a ponte existir. 100% de cobertura é a meta: toda admissão do Portal com
 *    objeto confirmado passa a ter prontuário.
 *
 * INERTE POR PADRÃO (condição 6): `armado()` exige `PORTAL_ARQUIVAMENTO_ARMADO=true` E o cliente
 * configurado (`PORTAL_ARQUIVADOR_URL`/`TOKEN`) E o balde nomeado. Em produção hoje, tudo isso está
 * ausente, então o gatilho LIVE é no-op e o runner recusa por falta de cliente. Nada dispara sem o
 * binding de IAM do diretor (§A.0). Espelha o padrão de armação do G.I (§A.48).
 *
 * §A.6: log por id de admissão e contagens, NUNCA nome, CPF ou nome de objeto.
 */

export interface ResultadoArquivamentoPortal {
  /** `false` quando a ponte está inerte (sem binding): nada foi tentado. */
  tentou: boolean;
  motivo?: "INERTE" | "SEM_PASTA_PAI" | "SEM_CLIENTE" | "SEM_OBJETO" | "OK";
  objetos: number;
  arquivados: number;
  ignorados: number;
  falhas: number;
  pastaUrl?: string;
}

const INERTE: ResultadoArquivamentoPortal = {
  tentou: false,
  motivo: "INERTE",
  objetos: 0,
  arquivados: 0,
  ignorados: 0,
  falhas: 0,
};

@Injectable()
export class PortalArquivamentoService {
  private readonly log = new Logger(PortalArquivamentoService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly arquivador: PortalArquivadorService,
    private readonly armazenamento: PortalArmazenamentoService,
    private readonly drivePastaPai: DrivePastaPaiService,
  ) {}

  /**
   * A ponte está ARMADA para o gatilho LIVE? Três travas, todas precisam estar verdes, e as três
   * dependem do binding do diretor. É esta a diferença entre "código pronto" e "ligado em produção".
   */
  armado(): boolean {
    const flag = (this.config.get<string>("PORTAL_ARQUIVAMENTO_ARMADO") ?? "").trim().toLowerCase();
    return flag === "true" && this.arquivador.configurado() && this.armazenamento.nomeDoBucket().length > 0;
  }

  /** O cliente do arquivador está configurado? Passagem pública para o runner retro não espiar o
   * membro privado. Sem isso (binding ausente), o runner recusa de copiar. */
  clienteConfigurado(): boolean {
    return this.arquivador.configurado();
  }

  /**
   * GATILHO LIVE: chamado no pós-veredito do Portal, por documento. NUNCA lança (o arquivamento é um
   * efeito, não pode derrubar a confirmação do candidato nem a trilha). Inerte enquanto não armado.
   */
  async talvezArquivarDoVeredito(admissaoId: string, tipoDocumentoId: string): Promise<void> {
    if (!this.armado()) return;
    try {
      await this.arquivarPortal(admissaoId, { tipoDocumentoId });
    } catch (e) {
      // §A.6: só a classe do erro e o id da admissão. O prontuário fica para a próxima (dedup md5).
      this.log.warn(
        `Arquivamento do Portal falhou para a admissão ${admissaoId} (${(e as Error).name}); ` +
          `será retentado. Nada foi perdido.`,
      );
    }
  }

  /**
   * REDE DE SEGURANÇA AGENDADA (AJUSTE B, fechar a lacuna do prontuário). Varre as admissões VIVAS
   * (EM_ADMISSAO/BANCO_AGUARDAR) que têm documento do Portal confirmado e não reprovado, e manda
   * arquivar cada uma. É IDEMPOTENTE: o arquivador deduplica por md5, então re-rodar sobre um
   * prontuário já completo é no-op ("já estavam"), nunca duplica. Garante que nenhum caminho de
   * conclusão (validação humana, reabertura) deixe documento fora do prontuário em silêncio.
   *
   * Inerte sem arme. Best-effort por admissão: a falha de uma não interrompe a varredura. §A.6: só
   * contagens e id de admissão (nunca nome/CPF/objeto). Exclui o Fabricio (resolvido à mão) por
   * construção, igual ao runner retro.
   */
  async reconciliarVivos(): Promise<{
    varridas: number;
    arquivados: number;
    falhas: number;
    armado: boolean;
  }> {
    if (!this.armado()) return { varridas: 0, arquivados: 0, falhas: 0, armado: false };
    const linhas = await this.db
      .select({ id: portalCredenciais.admissaoId })
      .from(portalCredenciais)
      .innerJoin(admissoes, eq(admissoes.id, portalCredenciais.admissaoId))
      .where(
        and(
          isNotNull(portalCredenciais.confirmadoEm),
          isNull(portalCredenciais.reprovadoEm),
          ne(portalCredenciais.admissaoId, FABRICIO_FORA_DO_LOTE),
          inArray(admissoes.farolGlobal, ["EM_ADMISSAO", "BANCO_AGUARDAR"]),
        ),
      );
    // Uma admissão aparece uma vez por documento confirmado; dedup em JS (uma varredura por admissão).
    const ids = [...new Set(linhas.map((l) => l.id))];

    let arquivados = 0;
    let falhas = 0;
    for (const id of ids) {
      try {
        const r = await this.arquivarPortal(id);
        arquivados += r.arquivados;
        falhas += r.falhas;
      } catch (e) {
        falhas += 1;
        this.log.warn(
          `Reconciliação do Portal: admissão ${id} falhou (${(e as Error).name}); ` +
            `a próxima cadência tenta de novo.`,
        );
      }
    }
    this.log.log(
      `Reconciliação do Portal: ${ids.length} admissão(ões) viva(s) varrida(s), ` +
        `${arquivados} objeto(s) novo(s) arquivado(s), ${falhas} falha(s).`,
    );
    return { varridas: ids.length, arquivados, falhas, armado: true };
  }

  /**
   * NÚCLEO reusável (usado pelo runner retro e pelo gatilho LIVE). Resolve a pasta do prontuário
   * como a esteira, monta os objetos confirmados do balde e manda copiar. Lança se o cliente do
   * arquivador não estiver configurado (quem chama trata), mas um objeto que falha NÃO derruba o
   * conjunto (isso o arquivador já resolve e devolve em `falhas`).
   *
   * `tipoDocumentoId` restringe ao objeto daquele tipo (gatilho LIVE); sem ele, arquiva TODOS os
   * objetos confirmados e não reprovados da admissão (runner retro).
   */
  async arquivarPortal(
    admissaoId: string,
    opts?: { tipoDocumentoId?: string },
  ): Promise<ResultadoArquivamentoPortal> {
    if (!this.arquivador.configurado()) return INERTE;
    const bucket = this.armazenamento.nomeDoBucket();
    if (!bucket) return INERTE;

    const [adm] = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        tipoContrato: admissoes.tipoContrato,
        drivePastaUrl: admissoes.drivePastaUrl,
        candidatoNome: candidatos.nome,
        clienteOperacao: clientes.nomeOperacao,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .where(eq(admissoes.id, admissaoId));

    if (!adm || !adm.codCliente) {
      return { ...INERTE, tentou: false, motivo: "SEM_CLIENTE" };
    }

    const pastaPaiId = await this.drivePastaPai.resolver(adm.tipoContrato, adm.codCliente);
    if (!pastaPaiId) {
      this.log.warn(
        `Arquivamento do Portal ignorado: sem pasta-pai do Drive para a admissão ${admissaoId}.`,
      );
      return { ...INERTE, tentou: false, motivo: "SEM_PASTA_PAI" };
    }

    // OBJETOS confirmados e NÃO reprovados do balde. `confirmado_em` não-nulo é a prova de chegada
    // (metadado do objeto); `reprovado_em` nulo exclui o que a IA recusou. Opcionalmente, só o tipo
    // do documento recém-confirmado (gatilho LIVE).
    const filtros = [
      eq(portalCredenciais.admissaoId, admissaoId),
      isNotNull(portalCredenciais.confirmadoEm),
      isNull(portalCredenciais.reprovadoEm),
    ];
    if (opts?.tipoDocumentoId) {
      filtros.push(eq(portalCredenciais.tipoDocumentoId, opts.tipoDocumentoId));
    }
    const credenciais = await this.db
      .select({
        objeto: portalCredenciais.objeto,
        nomeTipo: tiposDocumento.nome,
        codigoTipo: tiposDocumento.codigo,
      })
      .from(portalCredenciais)
      .innerJoin(tiposDocumento, eq(portalCredenciais.tipoDocumentoId, tiposDocumento.id))
      .where(and(...filtros));

    if (credenciais.length === 0) {
      return { ...INERTE, tentou: false, motivo: "SEM_OBJETO" };
    }

    const itens: ObjetoParaArquivar[] = credenciais.map((c) => ({
      objeto: c.objeto,
      nomeFinal: `${c.nomeTipo}_${adm.candidatoNome.toUpperCase()}`,
      subpasta: resolveSubpasta(c.codigoTipo),
    }));

    const ancora = idDaPastaUrl(adm.drivePastaUrl);
    const resposta = await this.arquivador.arquivar({
      bucket,
      parentFolderId: pastaPaiId,
      pastaNome: montarNomePasta(adm.candidatoNome, adm.clienteOperacao),
      itens,
      ...(ancora ? { pastaId: ancora } : {}),
    });

    // SELF-HEAL DO LINK: quando a admissão ainda não tinha pasta gravada, grava agora. É
    // exatamente o que faltava (o documento do Portal nunca criava a pasta). Idempotente: se já
    // tinha, não reescreve. §A.6: a URL do Drive é referência, não PII.
    if (resposta.pastaUrl && !adm.drivePastaUrl) {
      await this.db
        .update(admissoes)
        .set({ drivePastaUrl: resposta.pastaUrl, atualizadoEm: new Date() })
        .where(and(eq(admissoes.id, admissaoId), isNull(admissoes.drivePastaUrl)));
    }

    this.log.log(
      `Arquivamento do Portal (admissão ${admissaoId}): ${itens.length} objeto(s), ` +
        `${resposta.arquivados} arquivado(s), ${resposta.ignorados} já estavam, ${resposta.falhas} falha(s).`,
    );

    return {
      tentou: true,
      motivo: "OK",
      objetos: itens.length,
      arquivados: resposta.arquivados,
      ignorados: resposta.ignorados,
      falhas: resposta.falhas,
      pastaUrl: resposta.pastaUrl,
    };
  }
}
