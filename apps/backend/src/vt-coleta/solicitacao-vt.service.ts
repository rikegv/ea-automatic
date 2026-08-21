import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, candidatos, formulariosVt, solicitacoesVt, usuarios } from "../db/schema";
import { VtLinkService } from "./vt-link.service";

/**
 * SOLICITAÇÃO DE VT: o time pede, o funcionário responde, e fica o rastro de quem pediu.
 *
 * POR QUE ESTE SERVIÇO EXISTE, e não é só um wrapper do gerador de link: `VtLinkService` emite a
 * credencial e não guarda nada (o controller antigo recebia o usuário e o descartava). Sem registro,
 * ninguém consegue responder "quem mandou este link, e quando?", que é a pergunta que a operação faz
 * quando um funcionário aparece dizendo que recebeu um pedido.
 *
 * OS DOIS CAMINHOS CONVIVEM, e a diferença fica AQUI (decisão do diretor). O "Gerar link do VT" da
 * ficha continua chamando o `VtLinkService` direto e segue SEM rastro, como sempre foi. Só quem
 * passa por este serviço grava a solicitação. Quem lê o código precisa conseguir dizer, olhando a
 * chamada, se aquele caminho registra ou não, e é por isso que a gravação não foi enfiada dentro do
 * gerador: lá ela seria invisível e os dois caminhos deixariam de ser distinguíveis.
 *
 * §A.6: o TOKEN não é persistido nem logado, em nenhuma hipótese. Ele é a credencial de acesso do
 * candidato, e guardá-lo seria guardar a senha dele. Do link fica só a validade, que basta para a
 * tela dizer "expirou, peça de novo".
 */
@Injectable()
export class SolicitacaoVtService {
  private readonly logger = new Logger(SolicitacaoVtService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly link: VtLinkService,
  ) {}

  /**
   * Gera o link E registra o pedido. Vale para admissão VIVA ou CONCLUÍDA: o VT continua mudando
   * depois da admissão, e é justamente o caso de quem muda de endereço meses depois.
   *
   * O LINK NÃO É ENVIADO pelo sistema (decisão do diretor): ele volta para a tela, o time copia e
   * manda pelo canal que já usa. Enviar seria assumir um canal de comunicação com o candidato que o
   * EA não tem.
   */
  async solicitar(admissaoId: string, user: AuthUser) {
    // A emissão vem PRIMEIRO: ela é quem recusa (candidato sem CPF ou sem data de nascimento, chave
    // não configurada). Registrar antes criaria pedido para um link que não existe.
    const { link, expiraEm } = await this.link.gerarParaAdmissao(admissaoId);

    const [registro] = await this.db
      .insert(solicitacoesVt)
      .values({
        admissaoId,
        solicitadoPorId: user.id,
        expiraEm: new Date(expiraEm),
      })
      .returning({ id: solicitacoesVt.id, solicitadoEm: solicitacoesVt.solicitadoEm });

    // §A.6: id da admissão e do pedido não são dado pessoal; o link e o CPF nunca entram no log.
    this.logger.log(`Solicitação de VT registrada (admissão ${admissaoId}, pedido ${registro.id}).`);
    return { link, expiraEm, solicitacaoId: registro.id, solicitadoEm: registro.solicitadoEm };
  }

  /**
   * Solicita para VÁRIAS admissões de uma vez, devolvendo nome, CPF e link de cada uma.
   *
   * É O INSUMO DO RELATÓRIO em lote (decisão do diretor): o time exporta a lista e dispara os
   * pedidos pelo canal dele. Sem isso, pedir para trinta pessoas seria abrir trinta fichas.
   *
   * UMA FALHA NÃO DERRUBA O LOTE. Candidato sem CPF cadastrado volta em `falhas`, com o motivo, e as
   * demais seguem. O contrário faria uma pessoa incompleta cancelar o pedido das outras vinte e
   * nove, sem dizer qual delas.
   *
   * §A.6: o CPF SAI daqui porque é exatamente o que o relatório precisa levar (o time confere a
   * pessoa antes de mandar o link). Ele não é logado em nenhum ponto, e o retorno é a resposta de
   * uma rota autenticada, não um arquivo público.
   */
  async solicitarEmLote(admissaoIds: string[], user: AuthUser) {
    const ids = [...new Set(admissaoIds)];
    const itens: {
      admissaoId: string;
      nome: string;
      cpf: string;
      link: string;
      expiraEm: string;
    }[] = [];
    const falhas: { admissaoId: string; nome: string | null; motivo: string }[] = [];

    const pessoas = ids.length
      ? await this.db
          .select({ admissaoId: admissoes.id, nome: candidatos.nome, cpf: candidatos.cpf })
          .from(admissoes)
          .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
          .where(inArray(admissoes.id, ids))
      : [];
    const porId = new Map(pessoas.map((p) => [p.admissaoId, p]));

    for (const admissaoId of ids) {
      const pessoa = porId.get(admissaoId);
      try {
        const { link, expiraEm } = await this.solicitar(admissaoId, user);
        itens.push({
          admissaoId,
          nome: pessoa?.nome ?? "não informado",
          cpf: pessoa?.cpf ?? "",
          link,
          expiraEm,
        });
      } catch (erro) {
        falhas.push({
          admissaoId,
          nome: pessoa?.nome ?? null,
          motivo: erro instanceof Error ? erro.message : "Não foi possível gerar o link.",
        });
      }
    }
    return { itens, falhas };
  }

  /**
   * Liga a versão que acabou de chegar ao pedido que a esperava.
   *
   * FECHA TODOS OS PEDIDOS ABERTOS daquela admissão, não só o último: se o time pediu duas vezes
   * (porque o funcionário não respondeu de primeira), o formulário que chegou responde os dois. Um
   * pedido que ficasse aberto para sempre viraria uma cobrança eterna de algo já feito.
   *
   * NUNCA LEVANTA. É trilha, não é a entrega: uma falha aqui não pode impedir que o formulário do
   * candidato seja gravado. O pior caso é um pedido seguir marcado como aberto, que a tela mostra e
   * alguém resolve, em vez de perder a declaração da pessoa.
   */
  async marcarRespondida(admissaoId: string, formularioId: string): Promise<void> {
    try {
      await this.db
        .update(solicitacoesVt)
        .set({
          respondidaPorFormularioId: formularioId,
          respondidaEm: new Date(),
          atualizadoEm: new Date(),
        })
        .where(
          and(eq(solicitacoesVt.admissaoId, admissaoId), isNull(solicitacoesVt.respondidaEm)),
        );
    } catch (erro) {
      this.logger.warn(
        `Não foi possível fechar a solicitação de VT (admissão ${admissaoId}): ` +
          `${erro instanceof Error ? erro.name : "erro desconhecido"}. O formulário foi gravado.`,
      );
    }
  }

  /**
   * Histórico de pedidos de uma admissão, do mais novo para o mais velho, com quem pediu.
   *
   * Serve à tela para responder as duas perguntas da operação: "já pediram para esta pessoa?" e
   * "quem pediu?". Traz no máximo 10: a tela mostra os últimos, e ninguém audita trinta pedidos
   * dentro de um modal.
   */
  async historico(admissaoId: string) {
    return this.db
      .select({
        id: solicitacoesVt.id,
        solicitadoEm: solicitacoesVt.solicitadoEm,
        expiraEm: solicitacoesVt.expiraEm,
        respondidaEm: solicitacoesVt.respondidaEm,
        solicitadoPorNome: usuarios.nome,
      })
      .from(solicitacoesVt)
      .leftJoin(usuarios, eq(usuarios.id, solicitacoesVt.solicitadoPorId))
      .where(eq(solicitacoesVt.admissaoId, admissaoId))
      .orderBy(desc(solicitacoesVt.solicitadoEm))
      .limit(10);
  }

  /** Admissões com pedido ABERTO (sem resposta), para a tela sinalizar quem está devendo. */
  async abertasPorAdmissao(ids: string[]): Promise<Map<string, Date>> {
    const mapa = new Map<string, Date>();
    if (ids.length === 0) return mapa;
    const linhas = await this.db
      .select({
        admissaoId: solicitacoesVt.admissaoId,
        solicitadoEm: solicitacoesVt.solicitadoEm,
      })
      .from(solicitacoesVt)
      .where(
        and(inArray(solicitacoesVt.admissaoId, ids), isNull(solicitacoesVt.respondidaEm)),
      )
      .orderBy(desc(solicitacoesVt.solicitadoEm));
    // O MAIS RECENTE de cada admissão: é a data que a tela mostra ("pedido em ...").
    for (const l of linhas) if (!mapa.has(l.admissaoId)) mapa.set(l.admissaoId, l.solicitadoEm);
    return mapa;
  }

  /** Só para o teste do fluxo: a versão vigente da admissão (a que responde um pedido). */
  async versaoVigente(admissaoId: string) {
    return this.db.query.formulariosVt.findFirst({
      where: eq(formulariosVt.admissaoId, admissaoId),
      orderBy: (t, { desc: d }) => [d(t.criadoEm)],
    });
  }
}
