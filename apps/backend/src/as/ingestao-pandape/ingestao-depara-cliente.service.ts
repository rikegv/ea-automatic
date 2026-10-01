import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  montarMapaDePara,
  resolverClienteDaVaga,
  normalizarCodigoDeVaga,
  type LinhaDoDeParaDeCliente,
} from "../../domain/as-depara-cliente-vaga";
import { FONTE_DO_DEPARA_DE_CLIENTE } from "../depara-cliente/depara-cliente.fonte";
import type { PortaPropostaDeClienteDaVaga, ResumoDoCiclo } from "./ingestao-portas";

/**
 * ─ O ÚNICO ESCRITOR DA PROPOSTA DE CLIENTE DA VAGA, E ELE NÃO ALCANÇA `cod_cliente` ────────────
 *
 * ┌─ O QUE ESTE ARQUIVO ESCREVE, EM LISTA FECHADA ───────────────────────────────────────────────┐
 * │ `vagas.cliente_proposto`, `vagas.cliente_proposto_nome`, `vagas.cliente_proposto_origem` e    │
 * │ `vagas.cliente_proposto_estado`. MAIS NADA. Nem `cod_cliente`, nem `cargo_id`, nem `status`,   │
 * │ nem `atualizado_em`.                                                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `atualizado_em` FICA DE FORA, E ISSO NÃO É DETALHE: É O RELÓGIO DO EXPURGO ─────────────────┐
 * │ `vagas.atualizado_em` é o que o expurgo lê para contar o prazo de retenção de quem está DENTRO │
 * │ da vaga. A varredura dá uma volta a cada 30 minutos, então empurrá-lo aqui renovaria a         │
 * │ retenção de todo mundo 48 vezes por dia, para sempre, sem nada ficar vermelho. É a mesma trava │
 * │ do DIARIO que mantém `cargo_id` fora do `comparaAntes` do ciclo.                               │
 * │                                                                                               │
 * │ PELA MESMA RAZÃO O `update` É CONDICIONAL (`is distinct from`): em regime estável, 470 vagas   │
 * │ com a mesma proposta de ontem produzem ZERO escrita. A volta que não tem o que mudar não manda │
 * │ instrução de escrita nenhuma.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NUNCA LANÇA, E O FAIL-CLOSED AQUI É NULO MAIS CONTAGEM (bloqueio 5 da auditoria) ───────────┐
 * │ Dado de planilha NÃO pode derrubar a ingestão da vaga. A alternativa (um `throw` por código    │
 * │ órfão, por linha torta, por consulta que falhou) seria paga de 30 em 30 minutos: o ciclo engole │
 * │ a exceção, soma `resumo.erros`, e a frente de PREENCHIMENTO viraria perda de INGESTÃO, que é    │
 * │ muito pior do que não propor. Falha de leitura deixa a proposta ANTERIOR intacta: planilha      │
 * │ ilegível hoje não destrói a proposta de ontem.                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: este arquivo NÃO LOGA. O que sobe para o ciclo é contagem, e o nome do cliente (razão social
 * vinda de célula de texto livre, que em MEI é nome de pessoa natural) não sai daqui para lugar
 * nenhum além da própria coluna, que a tela de revisão lê atrás do menu.
 */
@Injectable()
export class IngestaoDeParaCliente implements PortaPropostaDeClienteDaVaga {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async resolverERegistrar(
    vagaId: string,
    chaves: { idVacancy: number; reference: string | null },
    resumo: ResumoDoCiclo,
  ): Promise<void> {
    const chaveId = normalizarCodigoDeVaga(chaves.idVacancy);
    const chaveRef = normalizarCodigoDeVaga(chaves.reference);
    const procurar = [...new Set([chaveId, chaveRef].filter((c): c is string => c !== null))];
    if (procurar.length === 0) return;

    const linhas = await this.lerDePara(procurar);
    /*
     * A CONSULTA QUE FALHOU NÃO É "A PLANILHA NÃO TEM ESTA VAGA", e por isso ela não conta nem
     * apaga: devolver `null` aqui faz a volta seguir sem tocar na proposta que já está gravada.
     */
    if (linhas === null) return;

    /*
     * O CATÁLOGO VEM DA PRÓPRIA CONSULTA (`left join clientes`), e não de uma segunda ida ao banco:
     * é a conferência do bloqueio 5 feita no mesmo acesso que lê a tradução. Código que o catálogo
     * não tem MAIS chega aqui como nulo, e o domínio degrada a proposta para SÓ NOME.
     */
    const { mapa, resumo: resumoDoMapa } = montarMapaDePara(
      linhas.map((l) => l.linha),
      { clientesDoCatalogo: linhas.map((l) => l.codigoNoCatalogo ?? "") },
    );
    resumo.codigosDeClienteForaDoCatalogo =
      (resumo.codigosDeClienteForaDoCatalogo ?? 0) + resumoDoMapa.clientesForaDoCatalogo;

    const r = resolverClienteDaVaga(mapa, {
      idVacancy: chaves.idVacancy,
      reference: chaves.reference,
    });

    if (r.proposta === "NENHUMA") {
      /*
       * LIMPA A PROPOSTA, e isso é deliberado: a linha da planilha pode ter sido corrigida, apagada
       * ou desligada pelo diretor, e uma proposta ERRADA que sobrevive na tela é pior do que
       * proposta nenhuma, porque vem com cara de trabalho feito. O caso em que isso seria perigoso
       * (a leitura falhou) já voltou acima, sem escrever.
       */
      await this.limpar(vagaId);
      if (r.motivo === "NAO_CASOU") {
        resumo.propostasDeClienteSemLinhaNaPlanilha =
          (resumo.propostasDeClienteSemLinhaNaPlanilha ?? 0) + 1;
      }
      return;
    }

    if (r.discordanciaEntreChaves) {
      resumo.chavesDaPlanilhaDiscordantes = (resumo.chavesDaPlanilhaDiscordantes ?? 0) + 1;
    }
    const origem = r.chave === "ID_VACANCY" ? "PLANILHA_ID_VAGA" : "PLANILHA_REQUISICAO";
    await this.gravar(vagaId, {
      codigo: r.proposta === "COM_CODIGO" ? r.codCliente : null,
      nome: r.nomeCliente,
      origem,
    });
    if (r.proposta === "COM_CODIGO") {
      resumo.propostasDeClienteComCodigo = (resumo.propostasDeClienteComCodigo ?? 0) + 1;
    } else {
      resumo.propostasDeClienteSoNome = (resumo.propostasDeClienteSoNome ?? 0) + 1;
    }
  }

  /**
   * AS LINHAS DO DE/PARA DAS DUAS CHAVES, com `ativo = true` e com o código conferido contra o
   * catálogo no MESMO acesso.
   *
   * `ativo = true` É A SEGUNDA FECHADURA do gesto do diretor ("pare de confiar nesta tradução"), e
   * ela é de propósito: a primeira é a própria sincronização, que não religa linha desligada.
   *
   * DEVOLVE `null` QUANDO A CONSULTA FALHA, e `[]` quando ela respondeu e não achou nada. A
   * diferença é o que separa "a planilha não tem esta vaga" (que limpa a proposta) de "o banco não
   * respondeu" (que não toca em nada).
   */
  private async lerDePara(procurar: readonly string[]): Promise<
    | { linha: LinhaDoDeParaDeCliente; codigoNoCatalogo: string | null }[]
    | null
  > {
    const lista = sql.join(
      procurar.map((c) => sql`${c}`),
      sql`, `,
    );
    try {
      const linhas = (await this.db.execute(sql`
        select d.codigo_externo,
               d.nome_cliente,
               d.cod_cliente,
               (d.confirmado_em is not null) as confirmado,
               c.cod_cliente as codigo_no_catalogo
          from as_depara_cliente_vaga d
          left join clientes c on c.cod_cliente = d.cod_cliente
         where d.fonte = ${FONTE_DO_DEPARA_DE_CLIENTE}
           and d.ativo = true
           and d.codigo_externo in (${lista})
      `)) as unknown as {
        codigo_externo: string;
        nome_cliente: string | null;
        cod_cliente: string | null;
        confirmado: boolean;
        codigo_no_catalogo: string | null;
      }[];
      return linhas.map((l) => ({
        linha: {
          codigo: l.codigo_externo,
          nomeCliente: l.nome_cliente,
          codCliente: l.cod_cliente,
          confirmado: l.confirmado === true,
        },
        codigoNoCatalogo: l.codigo_no_catalogo,
      }));
    } catch {
      /*
       * §A.6 NO CAMINHO MENOS VIGIADO: o erro do driver carrega `detail` com o VALOR que violou a
       * restrição e `query` com os parâmetros. Aqui não há nem `log.erro(mensagem)`, porque este
       * arquivo não loga: quem conta é o ciclo, e o que ele conta é número.
       */
      return null;
    }
  }

  /**
   * A ESCRITA DA PROPOSTA, condicional, nas quatro colunas e em nenhuma outra.
   *
   * O ESTADO VOLTA A `PROPOSTO` QUANDO A PROPOSTA MUDA, e só então: a condição compara as TRÊS
   * primeiras colunas, então uma proposta idêntica não escreve nada e o `CONFIRMADO` que uma pessoa
   * carimbou na liberação sobrevive. Proposta NOVA nunca nasce confirmada, porque ninguém a
   * conferiu: é a condição C1 da auditoria, aplicada à coluna.
   */
  private async gravar(
    vagaId: string,
    proposta: { codigo: string | null; nome: string; origem: string },
  ): Promise<void> {
    try {
      await this.db.execute(sql`
        update vagas
           set cliente_proposto = ${proposta.codigo},
               cliente_proposto_nome = ${proposta.nome},
               cliente_proposto_origem = ${proposta.origem},
               cliente_proposto_estado = 'PROPOSTO'
         where id = ${vagaId}::uuid
           and (cliente_proposto, cliente_proposto_nome, cliente_proposto_origem)
               is distinct from (${proposta.codigo}, ${proposta.nome}, ${proposta.origem})
      `);
    } catch {
      /* Ver `lerDePara`: dado de planilha não derruba a ingestão da vaga, e não se loga payload. */
    }
  }

  /** Apaga a proposta, nas quatro colunas de uma vez (o CHECK de coerência exige tudo ou nada). */
  private async limpar(vagaId: string): Promise<void> {
    try {
      await this.db.execute(sql`
        update vagas
           set cliente_proposto = null,
               cliente_proposto_nome = null,
               cliente_proposto_origem = null,
               cliente_proposto_estado = null
         where id = ${vagaId}::uuid
           and cliente_proposto_nome is not null
      `);
    } catch {
      /* Mesma razão de `gravar`. */
    }
  }
}
