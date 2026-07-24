import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { candidatoAlteracoesLog, documentosAdmissao, tiposDocumento, usuarios } from "../db/schema";
import { AuditoriaService } from "../auditoria/auditoria.service";

/**
 * VALIDAÇÃO HUMANA DE DOCUMENTO (OST B1, Blocos 3 e 4).
 *
 * POR QUE EXISTE. Até aqui todo write em `documentos_admissao` passava pela IA, e não havia veredito
 * humano nenhum. Quando a IA errava e o consultor sabia que o documento estava certo, não havia saída
 * a não ser reauditar e torcer. Esta é a exceção manual: o consultor assume o documento como válido,
 * assina com o nome, e o fluxo destrava.
 *
 * QUEM PODE: qualquer consultor, sem restrição de perfil (decisão do diretor). Por isso o controller
 * não tem `@Roles`, igual à auditoria.
 *
 * PRECEDÊNCIA SOBRE A IA (Bloco 4), garantida em três lugares distintos:
 *  1. AQUI, gravando `validadoPorId` + `validadoEm`, que é a marcação que faltava;
 *  2. na COLETA AUTOMÁTICA e no LOTE (`pandape-sync`), que PULAM o documento sem exceção, porque lá
 *     não existe ninguém para confirmar nada;
 *  3. na REAUDITORIA manual, que exige aceite explícito de quem clicou (o nome do validador vai no
 *     erro, para a tela perguntar "validado por Fulano, reanalisar mesmo assim?").
 *
 * §A.6: a trilha guarda código do tipo, estados e o autor. Nenhum dado pessoal do candidato.
 */
@Injectable()
export class ValidacaoHumanaService {
  private readonly logger = new Logger("ValidacaoHumanaService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Marca o documento como ENTREGUE por decisão humana. Idempotente: validar de novo só reafirma a
   * marca (e atualiza quem/quando). Devolve o progresso da régua para a tela atualizar a barra.
   */
  async validar(admissaoId: string, tipoDocumentoId: string, user: AuthUser) {
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.id, tipoDocumentoId),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento não encontrado");

    const anterior = await this.db.query.documentosAdmissao.findFirst({
      where: and(
        eq(documentosAdmissao.admissaoId, admissaoId),
        eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
      ),
    });
    const estadoAntes = anterior?.estado ?? "PENDENTE";

    const autor = await this.db.query.usuarios.findFirst({ where: eq(usuarios.id, user.id) });
    const nomeAutor = autor?.nome ?? autor?.email ?? "não informado";
    const agora = new Date();
    // O motivo exibido diz QUEM assumiu: é a leitura que o próximo consultor precisa ter na tela.
    const observacao = `Validado manualmente por ${nomeAutor}.`;

    await this.db
      .insert(documentosAdmissao)
      .values({
        admissaoId,
        tipoDocumentoId,
        estado: "ENTREGUE",
        observacao,
        validadoPorId: user.id,
        validadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [documentosAdmissao.admissaoId, documentosAdmissao.tipoDocumentoId],
        set: {
          estado: "ENTREGUE",
          observacao,
          validadoPorId: user.id,
          validadoEm: agora,
          atualizadoEm: agora,
        },
      });

    await this.db.insert(candidatoAlteracoesLog).values({
      admissaoId,
      campo: `validacao-humana:${tipo.codigo}`.slice(0, 60),
      valorAnterior: estadoAntes,
      valorNovo: "ENTREGUE",
      autorId: user.id,
    });

    this.logger.log(`Documento validado por humano: tipo=${tipo.codigo}, estado anterior=${estadoAntes}.`);

    // OST visualização/descarte, BLOCO 1 — O BURACO FECHADO AQUI.
    //
    // Até esta OST o método parava na linha acima: gravava ENTREGUE com autor e data e devolvia só o
    // progresso. Quem chamava `autoConcluirAuditoria` e `arquivarNoDrive` era exclusivamente o
    // `auditarConjunto`, ou seja, SÓ o caminho da IA. Resultado real: quando a validação humana era o
    // documento que FECHAVA a régua, a frente AUDITORIA não ia para "Análise finalizada" e nada subia
    // para o Drive; a admissão ficava completa e parada, sem aviso.
    //
    // Agora o veredito humano passa pelo MESMO pós-veredito da IA (`aplicarPosVeredito`). Não há
    // código duplicado: os dois caminhos chamam o mesmo método.
    const pos = await this.posVeredito(admissaoId, user);

    return {
      documento: { tipoDocumentoId, estado: "ENTREGUE" as const, observacao },
      validadoPor: { id: user.id, nome: nomeAutor, em: agora },
      estadoAntes,
      ...(pos?.progresso ? { progresso: pos.progresso } : {}),
      ...(pos?.sinalizador ? { sinalizador: pos.sinalizador } : {}),
      ...(pos?.auditoriaAuto ? { auditoriaAuto: pos.auditoriaAuto } : {}),
      ...(pos?.arquivado ? { arquivado: pos.arquivado } : {}),
      ...(pos?.avisoDrive ? { avisoDrive: pos.avisoDrive } : {}),
    };
  }

  /**
   * Quem validou este documento à mão? `undefined` quando não houve validação humana. Consultado
   * pela reauditoria antes de deixar a IA sobrescrever (Bloco 4).
   */
  async validadorDe(
    admissaoId: string,
    tipoDocumentoId: string,
  ): Promise<{ nome: string; em: Date } | undefined> {
    const [linha] = await this.db
      .select({ nome: usuarios.nome, email: usuarios.email, em: documentosAdmissao.validadoEm })
      .from(documentosAdmissao)
      .leftJoin(usuarios, eq(usuarios.id, documentosAdmissao.validadoPorId))
      .where(
        and(
          eq(documentosAdmissao.admissaoId, admissaoId),
          eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
        ),
      );
    if (!linha?.em) return undefined;
    return { nome: linha.nome ?? linha.email ?? "não informado", em: linha.em };
  }

  /**
   * Erro de conflito da reauditoria sobre documento validado por humano (Bloco 4). A mensagem carrega
   * o NOME de quem validou, porque é o que a tela precisa para perguntar antes de prosseguir.
   */
  static conflitoValidacaoHumana(nome: string): ConflictException {
    return new ConflictException(
      `Este documento foi validado por ${nome}. Deseja reanalisar mesmo assim?`,
    );
  }

  /**
   * Pós-veredito da validação humana: MESMO tratamento do veredito da IA (progresso, sinalizador,
   * conclusão automática da frente e arquivamento no Drive).
   *
   * `undefined` para admissão sem cliente/cargo (pré-admissão, que não tem régua e nunca é auditada).
   * O guard vive aqui porque `aplicarPosVeredito` recusa esse caso com 404, e a validação humana não
   * pode virar erro por causa de um estado que ela nem alcança.
   */
  private async posVeredito(admissaoId: string, user: AuthUser) {
    const adm = await this.db.query.admissoes.findFirst({
      where: (a, { eq: igual }) => igual(a.id, admissaoId),
    });
    if (!adm?.codCliente || !adm.cargoId) return undefined;
    return this.auditoria.aplicarPosVeredito(admissaoId, user);
  }
}
