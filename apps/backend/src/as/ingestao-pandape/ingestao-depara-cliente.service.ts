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
import {
  PROCEDENCIA_DA_PLANILHA,
  temAlgoAPrePreencher,
  type ValoresDoPrePreenchimento,
} from "../../domain/as-planilha-prepreenchimento";
import { FONTE_DO_DEPARA_DE_CLIENTE } from "../depara-cliente/depara-cliente.fonte";
import type { PortaPropostaDeClienteDaVaga, ResumoDoCiclo } from "./ingestao-portas";

/** Uma linha do espelho, com a tradução de cliente e o pré-preenchimento daquele código. */
interface LinhaLidaDoEspelho {
  linha: LinhaDoDeParaDeCliente;
  codigoNoCatalogo: string | null;
  prePreenchimento: ValoresDoPrePreenchimento;
}

/**
 * A `date` DO DRIVER EM `AAAA-MM-DD`.
 *
 * O driver devolve `date` como string ou como `Date` dependendo da configuração, e os dois chegam
 * aqui. `date` NÃO TEM HORA, então `toISOString` não desloca nada e não há fuso a considerar: o
 * valor é o literal da planilha, que é o que o diretor decidiu gravar, inclusive vencido.
 */
function emIso(valor: string | Date | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const texto = String(valor).trim();
  return texto === "" ? null : texto.slice(0, 10);
}

/**
 * ─ O ÚNICO ESCRITOR DA PROPOSTA DE CLIENTE DA VAGA, E ELE NÃO ALCANÇA `cod_cliente` ────────────
 *
 * ┌─ O QUE ESTE ARQUIVO ESCREVE, EM LISTA FECHADA (atualizada em 07/10/2026) ────────────────────┐
 * │ 1. A PROPOSTA DE CLIENTE: `vagas.cliente_proposto`, `cliente_proposto_nome`,                  │
 * │    `cliente_proposto_origem` e `cliente_proposto_estado`.                                     │
 * │ 2. O PRÉ-PREENCHIMENTO DA VAGA EM REVISÃO: `natureza`, `linha_servico_id`, `cargo_id`,        │
 * │    `data_abertura`, `data_limite` e as cinco procedências correspondentes                     │
 * │    (`natureza_origem`, `linha_servico_origem`, `cargo_origem`, `data_abertura_origem`,        │
 * │    `data_limite_origem`).                                                                     │
 * │                                                                                               │
 * │ MAIS NADA. Em particular NÃO: `cod_cliente`, `status`, `status_manual_em`, `encerrada_em`,     │
 * │ `recusada_em` e `atualizado_em`.                                                               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ PRÉ-PREENCHER NÃO É LIBERAR, E ESTA É A LINHA QUE NÃO SE CRUZA ────────────────────────────┐
 * │ A vaga continua em REVISÃO. Este arquivo não toca `status`, não toca `status_manual_em`, não  │
 * │ chama nada que mova PAPEL e não conhece `liberarPendenteRevisao`. Ele preenche campo que uma  │
 * │ pessoa teria de digitar, e quem libera continua sendo gente, por rota própria, com autor,     │
 * │ data e trilha. Encher os obrigatórios NÃO avança a vaga: a derivação de status lê o FUNIL      │
 * │ (presença de candidato) e o carimbo manual, nunca a completude do formulário.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PRÉ-PREENCHIMENTO SÓ ESCREVE ONDE A COLUNA ESTÁ NULA, E A TRAVA MORA NA INSTRUÇÃO ───────┐
 * │ Medido: 9 vagas já têm natureza, 7 já têm linha de serviço e 94 já têm cargo. O que uma       │
 * │ PESSOA preencheu não é reescrito, e a garantia é `coalesce(coluna, valor)` no `set` mais o     │
 * │ `coluna is null` no `where`, as duas EM SQL. Um `if` em TypeScript dependeria de uma leitura   │
 * │ anterior, e entre a leitura e a escrita cabe o salvamento de outra pessoa; além disso um `if`  │
 * │ se perde numa refatoração (é o argumento da §A.33 sobre o fallback removido) e a instrução     │
 * │ não. A PROCEDÊNCIA é carimbada no MESMO `case`, então ela só aparece no campo que de fato      │
 * │ veio da planilha, nunca no que a pessoa já havia digitado.                                     │
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
     * ─ O PRÉ-PREENCHIMENTO VEM ANTES, E É INDEPENDENTE DA PROPOSTA DE CLIENTE ────────────────────
     *
     * ┌─ POR QUE ELE NÃO ENTRA NO `update` DA PROPOSTA, e isso é CORREÇÃO, não preferência ──────┐
     * │ Duas razões, as duas medidas no próprio desenho:                                          │
     * │                                                                                           │
     * │ 1. O `update` DA PROPOSTA É CONDICIONAL AO CLIENTE TER MUDADO (`is distinct from` nas três │
     * │    colunas), e em regime estável ele NÃO RODA. Pendurar o pré-preenchimento nele faria o   │
     * │    pré-preenchimento nunca acontecer em nenhuma vaga cuja proposta já estivesse gravada,   │
     * │    que são todas elas a partir da segunda volta. A frente nasceria inerte.                 │
     * │                                                                                           │
     * │ 2. A PROPOSTA DE CLIENTE TEM CAMINHOS DE SAÍDA PRÓPRIOS (`NENHUMA` por ambiguidade de      │
     * │    cliente, por não casar, por falta de chave), e todos eles RETORNAM antes da escrita. A  │
     * │    ambiguidade do NOME DO CLIENTE não pode esconder a célula de atendimento do mesmo       │
     * │    código: a abstenção desta frente é POR CAMPO, e acoplar as duas escritas a transformaria │
     * │    em abstenção por linha, que é exatamente o que a régua proíbe.                           │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * É UMA INSTRUÇÃO SÓ, CONDICIONAL, e ela não roda quando não há o que preencher.
     */
    await this.prePreencher(vagaId, this.prePreenchimentoDaChave(linhas, chaves));

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
  private async lerDePara(procurar: readonly string[]): Promise<LinhaLidaDoEspelho[] | null> {
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
               d.natureza_planilha,
               d.linha_servico_id_planilha,
               d.cargo_id_planilha,
               d.data_abertura_planilha,
               d.data_limite_planilha,
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
        natureza_planilha: string | null;
        linha_servico_id_planilha: number | string | null;
        cargo_id_planilha: string | null;
        data_abertura_planilha: string | Date | null;
        data_limite_planilha: string | Date | null;
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
        prePreenchimento: {
          natureza: (l.natureza_planilha ?? null) as ValoresDoPrePreenchimento["natureza"],
          linhaServicoId:
            l.linha_servico_id_planilha === null || l.linha_servico_id_planilha === undefined
              ? null
              : Number(l.linha_servico_id_planilha),
          cargoId: l.cargo_id_planilha ?? null,
          dataAbertura: emIso(l.data_abertura_planilha),
          dataLimite: emIso(l.data_limite_planilha),
        },
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

  /**
   * O PRÉ-PREENCHIMENTO DA CHAVE QUE VALE, com a MESMA precedência da proposta de cliente.
   *
   * `IdVacancy` GANHA DA `reference`, e não é arbitrário: a `reference` casa por CADEIA DE
   * REABERTURA, que é inferência mais fraca. A régua precisa ser a MESMA da proposta de cliente,
   * senão a vaga receberia o cliente de um código e o cargo de outro, e a linha ficaria montada de
   * pedaços de duas vagas diferentes.
   *
   * NÃO SE EMPRESTA CAMPO DE UMA CHAVE PARA A OUTRA. Quando a chave que venceu tem o campo nulo, o
   * campo fica nulo, mesmo que a outra chave tenha valor: completar com a chave mais fraca seria
   * escolher por conveniência, e a abstenção é o comportamento seguro.
   */
  private prePreenchimentoDaChave(
    linhas: readonly LinhaLidaDoEspelho[],
    chaves: { idVacancy: number; reference: string | null },
  ): ValoresDoPrePreenchimento | null {
    const chaveId = normalizarCodigoDeVaga(chaves.idVacancy);
    const chaveRef = normalizarCodigoDeVaga(chaves.reference);
    const achar = (chave: string | null) =>
      chave === null ? undefined : linhas.find((l) => l.linha.codigo === chave);
    const escolhida = achar(chaveId) ?? achar(chaveRef);
    return escolhida?.prePreenchimento ?? null;
  }

  /**
   * O PRÉ-PREENCHIMENTO GRAVADO NA VAGA: UMA instrução, condicional, e SÓ onde a coluna está NULA.
   *
   * ┌─ AS DUAS TRAVAS, E AS DUAS VIVEM NA INSTRUÇÃO, NUNCA EM `if` DE TYPESCRIPT ───────────────┐
   * │ 1. `coalesce(coluna, valor)` no `set`: a coluna preenchida recebe ela mesma, então o que uma │
   * │    PESSOA digitou nunca é reescrito (9 vagas já têm natureza, 7 linha de serviço, 94 cargo). │
   * │ 2. O `where` exige que ALGUMA das cinco esteja nula E tenha valor a oferecer: em regime      │
   * │    estável, a volta de 30 em 30 minutos sobre 470 vagas manda ZERO escrita.                   │
   * │                                                                                              │
   * │ A PROCEDÊNCIA É CARIMBADA NO MESMO `case` DA CONDIÇÃO, então ela marca exatamente o campo que │
   * │ ACABOU de ser preenchido pela planilha, e preserva o carimbo anterior nos outros. Carimbar    │
   * │ fora dessa condição faria a procedência afirmar "veio da planilha" sobre um valor digitado.    │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NÃO TOCA `atualizado_em`, e isso é a mesma trava do `gravar` (ver o cabeçalho do arquivo): o
   * carimbo é o relógio do expurgo de quem está DENTRO da vaga, e empurrá-lo 48 vezes por dia
   * renovaria a retenção de todo mundo sem nada ficar vermelho (§A.6).
   *
   * NÃO TOCA `status` NEM NADA QUE MOVA PAPEL: pré-preencher não é liberar.
   */
  private async prePreencher(
    vagaId: string,
    valores: ValoresDoPrePreenchimento | null,
  ): Promise<void> {
    if (valores === null || !temAlgoAPrePreencher(valores)) return;
    const procedencia = PROCEDENCIA_DA_PLANILHA;
    try {
      await this.db.execute(sql`
        update vagas
           set natureza = coalesce(natureza, ${valores.natureza}::vaga_natureza),
               natureza_origem = case
                 when natureza is null and ${valores.natureza}::vaga_natureza is not null
                 then ${procedencia} else natureza_origem end,
               linha_servico_id = coalesce(linha_servico_id, ${valores.linhaServicoId}::int),
               linha_servico_origem = case
                 when linha_servico_id is null and ${valores.linhaServicoId}::int is not null
                 then ${procedencia} else linha_servico_origem end,
               cargo_id = coalesce(cargo_id, ${valores.cargoId}::uuid),
               cargo_origem = case
                 when cargo_id is null and ${valores.cargoId}::uuid is not null
                 then ${procedencia} else cargo_origem end,
               data_abertura = coalesce(data_abertura, ${valores.dataAbertura}::date),
               data_abertura_origem = case
                 when data_abertura is null and ${valores.dataAbertura}::date is not null
                 then ${procedencia} else data_abertura_origem end,
               data_limite = coalesce(data_limite, ${valores.dataLimite}::date),
               data_limite_origem = case
                 when data_limite is null and ${valores.dataLimite}::date is not null
                 then ${procedencia} else data_limite_origem end
         where id = ${vagaId}::uuid
           and ((natureza is null and ${valores.natureza}::vaga_natureza is not null)
             or (linha_servico_id is null and ${valores.linhaServicoId}::int is not null)
             or (cargo_id is null and ${valores.cargoId}::uuid is not null)
             or (data_abertura is null and ${valores.dataAbertura}::date is not null)
             or (data_limite is null and ${valores.dataLimite}::date is not null))
      `);
    } catch {
      /*
       * Ver `lerDePara`: dado de planilha NÃO derruba a ingestão da vaga, e não se loga payload. O
       * caso concreto aqui é a FK de `cargo_id` recusando um cargo que o catálogo perdeu entre a
       * sincronização e esta volta: a vaga continua entrando, sem cargo, e a volta seguinte tenta
       * de novo. Fail-closed é NULO, nunca perda de ingestão.
       */
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
