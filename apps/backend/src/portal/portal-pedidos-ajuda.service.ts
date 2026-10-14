import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { PedidoDeAjudaDoPortal } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  cargos,
  clientes,
  frentesAdmissao,
  portalEventos,
  portalLinks,
} from "../db/schema";
import { FAROIS_FORA_DO_PAINEL } from "./portal-painel.service";

/**
 * OS PEDIDOS DE AJUDA PARA ENTRAR, para o Gerenciador do Portal.
 *
 * O candidato que não consegue passar pela identificação clica "Não consigo entrar", e o serviço de
 * identidade grava um `PORTAL_RECUPERACAO_SOLICITADA` na trilha (`portal-identidade.service.ts`).
 * Aquilo é ESCRITA; esta é a LEITURA que faltava, a fila que o RH abre para ver quem está batendo
 * na porta e agir (reemitir, contatar).
 *
 * ┌─ POR QUE UM SERVIÇO PRÓPRIO, E NÃO UM MÉTODO NO `PortalPainelService` ──────────────────────────┐
 * │ O painel tem uma condição travada em teste: ele NÃO lê `portal_eventos` em lugar nenhum, porque │
 * │ o contador de acesso dele é carimbo na LINHA, e a trilha engole falha de gravação de propósito. │
 * │ Esta leitura é o oposto: ela EXISTE para ler a trilha. Misturá-la ao painel reabriria a porta   │
 * │ que aquela condição fechou. Serviço separado, controller irmã, MESMO menu.                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6, O QUE ESTA LEITURA NÃO DEVOLVE ─────────────────────────────────────────────────────────┐
 * │ Sem CPF (ele é só a CHAVE DE JUNÇÃO `admissoes.candidatoCpf` -> `candidatos.cpf`, nunca         │
 * │ projetado), sem IP, sem `ua_hash` e sem o token. `nome`, `cargo` e `cliente` são os mesmos que  │
 * │ o Gerenciador do Portal já mostra para o mesmo time, sob o mesmo menu autenticado. `linkJti` é  │
 * │ o `id` da linha de `portal_links` (o `jti`), que a lista do painel já entrega, e não a          │
 * │ credencial assinada.                                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class PortalPedidosAjudaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * A lista, agregada por LINK e ordenada pelo pedido mais recente.
   *
   * A JUNÇÃO ENTRE A TRILHA E O LINK É POR `jti`, e a coluna `portal_eventos.jti_link` é `varchar`
   * contra o `uuid` de `portal_links.id`. O Postgres não casa os dois tipos por conta própria, então
   * o `uuid` é comparado como TEXTO (`::text`), e não o `jti_link` como `uuid`: um `::uuid` no lado
   * do log estouraria se ALGUM outro evento tivesse um `jti_link` que não fosse UUID, mesmo os que o
   * filtro de tipo descarta. Comparar o UUID como texto nunca falha por dado.
   *
   * §A.16: o declínio fica de fora, EM CÓDIGO (a mesma lista `FAROIS_FORA_DO_PAINEL` da tela irmã):
   * quem declinou não deixa fila de trabalho ativa, e um pedido de ajuda antigo dele não é mais
   * tarefa. A junção é `innerJoin`, então evento cujo link foi apagado (cascade) já não aparece.
   */
  async listar(): Promise<PedidoDeAjudaDoPortal[]> {
    const linhas = await this.db
      .select({
        admissaoId: portalLinks.admissaoId,
        linkJti: portalLinks.id,
        nome: candidatos.nome,
        cargo: sql<string>`coalesce(${cargos.nome}, 'não informado')`,
        cliente: sql<string>`coalesce(${clientes.nomeOperacao}, 'não informado')`,
        vezes: sql<number>`count(*)::int`,
        primeiroPedidoEm: sql<Date>`min(${portalEventos.ocorridoEm})`,
        ultimoPedidoEm: sql<Date>`max(${portalEventos.ocorridoEm})`,
      })
      .from(portalEventos)
      .innerJoin(portalLinks, sql`${portalLinks.id}::text = ${portalEventos.jtiLink}`)
      .innerJoin(admissoes, eq(admissoes.id, portalLinks.admissaoId))
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .where(
        and(
          eq(portalEventos.tipo, "PORTAL_RECUPERACAO_SOLICITADA"),
          notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]),
          // ┌─ QUEM JÁ FINALIZOU A ANÁLISE SAI DO PEDIDOS DE AJUDA (AJUSTE 5) ──────────────────────────┐
          // │ Pedir ajuda "para entrar" só é tarefa enquanto a pessoa ainda está no começo do Portal.    │
          // │ Resquício da migração Pandapé: candidatos que já tiveram a AUDITORIA levada a ANALISE_OK    │
          // │ (análise finalizada na esteira) continuavam na lista, como a Ana Paula, que o time nem      │
          // │ acha mais ao pesquisar o painel (ela está na aba de finalizados). Análise finalizada = não  │
          // │ é mais "ajuda para entrar". É `not exists` correlacionado (sem join, preserva a forma da     │
          // │ consulta e o grupo); §A.6 lê só tipo e status da frente, nenhuma PII. Isto é ADITIVO ao     │
          // │ corte do AJUSTE 2 (acessou depois do pedido): um pega o timing do acesso, o outro o estágio. │
          // └────────────────────────────────────────────────────────────────────────────────────────────┘
          sql`not exists (
            select 1 from ${frentesAdmissao} fa
            where fa.admissao_id = ${admissoes.id}
              and fa.tipo = 'AUDITORIA'
              and fa.status = 'ANALISE_OK'
          )`,
        ),
      )
      .groupBy(
        portalLinks.id,
        portalLinks.admissaoId,
        candidatos.nome,
        cargos.nome,
        clientes.nomeOperacao,
      )
      // ┌─ O CANDIDATO QUE JÁ VOLTOU A ENTRAR SAI DA LISTA (regra nova do diretor) ──────────────────┐
      // │ O pedido de ajuda é uma foto do momento em que a pessoa não conseguiu entrar. Se depois     │
      // │ disso ela ACESSOU, o pedido virou passado e não é mais tarefa; se pedir DE NOVO depois do   │
      // │ acesso, volta (o `max` do pedido passa a ser mais recente que o acesso). O corte é o acesso │
      // │ ESTRITAMENTE posterior ao último pedido: `is null` ou `<=` MANTÉM (nunca acessou, ou o      │
      // │ último acesso não é mais novo que o último pedido), e `>` ESCONDE (acessou depois de pedir). │
      // │                                                                                            │
      // │ POR QUE A SUBCONSULTA CORRELACIONADA, E POR QUE SOBRE `admissao_id`. O acesso é da ADMISSÃO, │
      // │ não do link do evento: reemissão revoga o link antigo e o candidato pode ter entrado pelo   │
      // │ link NOVO, cujo `ultimo_acesso_em` não está nas linhas deste grupo (que é por link do       │
      // │ pedido). Olhar só o link do evento devolveria um falso "não acessou". Por isso o MÁXIMO de  │
      // │ `ultimo_acesso_em` sobre TODOS os links da admissão (`pl2.admissao_id = ` o `admissao_id` do │
      // │ grupo, que está no `groupBy`). §A.6: a subconsulta lê só `admissao_id` e `ultimo_acesso_em`, │
      // │ nenhuma PII. O recorte é SÓ um filtro: forma do retorno, granularidade por link e ordenação │
      // │ ficam iguais.                                                                              │
      // └────────────────────────────────────────────────────────────────────────────────────────────┘
      .having(
        sql`(
          select max(pl2.ultimo_acesso_em) from ${portalLinks} pl2
          where pl2.admissao_id = ${portalLinks.admissaoId}
        ) is null or (
          select max(pl2.ultimo_acesso_em) from ${portalLinks} pl2
          where pl2.admissao_id = ${portalLinks.admissaoId}
        ) <= max(${portalEventos.ocorridoEm})`,
      )
      .orderBy(desc(sql`max(${portalEventos.ocorridoEm})`));

    return linhas.map((l) => ({
      admissaoId: l.admissaoId,
      linkJti: l.linkJti,
      nome: l.nome,
      cargo: l.cargo,
      cliente: l.cliente,
      vezes: l.vezes,
      primeiroPedidoEm: new Date(l.primeiroPedidoEm).toISOString(),
      ultimoPedidoEm: new Date(l.ultimoPedidoEm).toISOString(),
    }));
  }
}
