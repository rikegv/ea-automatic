import {
  ESTADO_DA_PROPOSTA_LABEL,
  ORIGEM_DA_PROPOSTA_LABEL,
  type CasoDaPropostaDeCliente,
  type EstadoDaPropostaDeCliente,
  type OrigemDaPropostaDeCliente,
  type PropostaDeClienteDaVaga,
} from "@ea/shared-types";

/**
 * ─ A PROPOSTA DE CLIENTE NA TELA DE REVISÃO, DO LADO DE QUEM CONFERE ───────────────────────────
 *
 * O QUE ESTE MÓDULO RESOLVE. A fábrica lê a planilha viva do time e PROPÕE o cliente de 312 das 470
 * vagas abertas. A proposta NÃO escreve `vagas.cod_cliente` (o fundamento está no comentário do
 * `PropostaDeClienteDaVaga`, no shared-types): ela desce para a tela, e quem escreve o cliente
 * continua sendo o caminho que já tem trilha, a liberação da vaga, com autor e data.
 *
 * ┌─ CONDIÇÃO C1 DA AUDITORIA, E ELA É A RAZÃO DESTE MÓDULO EXISTIR SEPARADO ───────────────────┐
 * │ A proposta NÃO PODE chegar pré-preenchida no seletor de cliente. Pré-preenchida, ela fica    │
 * │ indistinguível de um valor já gravado por gente: quem libera não mexe no campo, o formulário │
 * │ completo grava o que estava lá, e a trilha passa a AFIRMAR que uma pessoa escolheu aquele    │
 * │ cliente. O risco já não é caminho de código, é gesto humano desatento, e é por isso que      │
 * │ CONFIRMAR precisa ser um gesto DISTINTO de "não mexer no campo".                             │
 * │                                                                                              │
 * │ Daí a forma: o seletor nasce VAZIO, como hoje, e a proposta aparece ao lado, marcada como    │
 * │ proposta, com a procedência dita em texto e um botão próprio para adotá-la.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÃO TRÊS CASOS NA FILA, E ELES PRECISAM SER DISTINGUÍVEIS ─────────────────────────────────┐
 * │ Medido em 01/10/2026, das 470 vagas abertas:                                                 │
 * │   . 158 têm proposta COM CÓDIGO do catálogo: a tela propõe o código, a pessoa confere;        │
 * │   . 154 têm proposta SÓ COM O NOME: o catálogo `clientes` é da ADMISSÃO e A&S trabalha com   │
 * │     outro universo, então 59 dos 95 nomes da planilha não existem lá (as ONZE variantes de   │
 * │     Gerdau, nenhuma cadastrada). A tela diz QUEM é o cliente e a pessoa ainda escolhe o       │
 * │     código. CONTINUA sendo o ganho que o diretor pediu: a parte caríssima era descobrir QUAL │
 * │     cliente é, não clicar;                                                                   │
 * │   . 158 não têm proposta: a tela fica exatamente como estava.                                │
 * │                                                                                              │
 * │ O segundo caso NÃO pode parecer defeito nem parecer o primeiro, e é por isso que ele tem     │
 * │ estado próprio aqui em vez de ser um `if` na tela.                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: `nomeClienteProposto` vem de célula de TEXTO LIVRE, e razão social de MEI ou de empresário
 * individual É nome de pessoa natural ("Loja Dona Cida"). Ele desce para a TELA, atrás do menu, e
 * isso está aprovado. NADA deste módulo entra em `console`, em mensagem de erro ou em telemetria.
 */

/**
 * O CAMPO QUE A VAGA CARREGA, declarado AQUI e não no contrato da vaga, por uma razão de processo:
 * `packages/shared-types/src/index.ts` é arquivo de DONO ÚNICO (§A.39), e o dono é o coordenador.
 *
 * A FORMA É A MESMA que o contrato vai ter (`propostaDeCliente?: PropostaDeClienteDaVaga | null`),
 * então o dia em que o campo entrar no `VagaListItem` esta declaração deixa de ser necessária e
 * nada aqui muda de comportamento: a leitura abaixo continua achando o campo pelo mesmo nome.
 */
export interface ComPropostaDeCliente {
  propostaDeCliente?: PropostaDeClienteDaVaga | null;
}

/**
 * A LEITURA, E ELA É FAIL-CLOSED. Proposta sem NOME não é proposta: é linha quebrada, e mostrar uma
 * caixa vazia dizendo "a planilha diz que é este cliente" seria pior do que não mostrar nada.
 *
 * O `unknown` é deliberado e TEMPORÁRIO: enquanto o campo não está no `VagaListItem`, tipar o
 * parâmetro como o objeto de campo opcional cairia na checagem de "tipo fraco" do TypeScript (a vaga
 * não tem nenhuma propriedade em comum com ele) e o typecheck recusaria a chamada. Validar a forma
 * aqui vale de qualquer modo, porque o que chega vem da rede.
 */
export function propostaDaVaga(vaga: unknown): PropostaDeClienteDaVaga | null {
  const p = (vaga as ComPropostaDeCliente | null | undefined)?.propostaDeCliente;
  if (!p || typeof p.nomeClienteProposto !== "string" || p.nomeClienteProposto.trim() === "") {
    return null;
  }
  return p;
}

/**
 * ─ O ESTADO DA CONFERÊNCIA: a proposta CRUZADA com o que a pessoa já escolheu no seletor ───────
 *
 * Cinco estados, e cada um é uma frase diferente na tela. Eles existem como união e não como três
 * booleanos porque "tem proposta", "tem código" e "já escolheu" se combinam em casos que dizem
 * coisas opostas, e booleano solto deixa a tela montar a combinação errada sem nada ficar vermelho.
 */
export type ConferenciaDaProposta =
  /** Nada a mostrar: a vaga não tem proposta. A tela fica como estava. */
  | { tipo: "SEM_PROPOSTA" }
  /** Proposta com código do catálogo, e NINGUÉM conferiu ainda. É aqui que o botão aparece. */
  | { tipo: "COM_CODIGO"; proposta: PropostaDeClienteDaVaga; codigo: string }
  /**
   * Proposta só com o nome: o cliente da planilha não está no catálogo da Admissão. Não há código
   * para confirmar, então NÃO HÁ BOTÃO: a pessoa escolhe no seletor qual cadastrado corresponde.
   */
  | { tipo: "SO_NOME"; proposta: PropostaDeClienteDaVaga }
  /** A pessoa adotou a proposta. O cliente do formulário é o proposto. */
  | { tipo: "CONFIRMADA"; proposta: PropostaDeClienteDaVaga }
  /**
   * A pessoa escolheu um cliente, e ele NÃO é o proposto. Dizer isto é honestidade com quem confere,
   * não aviso de erro: trocar a proposta é exatamente o que a conferência existe para permitir.
   */
  | { tipo: "ESCOLHA_PROPRIA"; proposta: PropostaDeClienteDaVaga; codigoEscolhido: string };

/**
 * ─ O CRUZAMENTO ────────────────────────────────────────────────────────────────────────────────
 *
 * `codigosDoCatalogo` entra porque o código proposto pode ter saído do catálogo (cliente inativado
 * depois de a planilha ser escrita). Nesse caso NÃO SE OFERECE CONFIRMAR: o seletor não tem aquela
 * opção, confirmar gravaria um código que a tela não sabe nomear, e o servidor recusaria no fim.
 * A vaga cai no caso do nome, que é o que ela de fato é: sabe-se QUEM é, falta o cadastro.
 *
 * O `codigosDoCatalogo` OPCIONAL é para a tela que só LISTA (a coluna da fila), que não tem o
 * catálogo na mão e não oferece gesto nenhum.
 */
export function conferenciaDaProposta(
  proposta: PropostaDeClienteDaVaga | null,
  codClienteEscolhido: string | null | undefined,
  codigosDoCatalogo?: ReadonlySet<string>,
): ConferenciaDaProposta {
  if (!proposta) return { tipo: "SEM_PROPOSTA" };

  const escolhido = (codClienteEscolhido ?? "").trim();
  const proposto = (proposta.codClienteProposto ?? "").trim();

  if (escolhido) {
    if (proposto && escolhido === proposto) return { tipo: "CONFIRMADA", proposta };
    return { tipo: "ESCOLHA_PROPRIA", proposta, codigoEscolhido: escolhido };
  }

  const noCatalogo = !codigosDoCatalogo || codigosDoCatalogo.has(proposto);
  if (proposto && noCatalogo) return { tipo: "COM_CODIGO", proposta, codigo: proposto };
  return { tipo: "SO_NOME", proposta };
}

/**
 * O CASO DA PROPOSTA NO VOCABULÁRIO DO CONTRATO (`CasoDaPropostaDeCliente`), para a tela e o
 * servidor contarem a mesma coisa com a mesma palavra. A CONFERÊNCIA acima é um superconjunto dele:
 * ela cruza o caso com o que a pessoa já escolheu, que é informação que só existe na tela.
 */
export function casoDaProposta(proposta: PropostaDeClienteDaVaga): CasoDaPropostaDeCliente {
  return proposta.codClienteProposto ? "COM_CODIGO" : "SO_NOME";
}

/**
 * O RÓTULO DO ESTADO (a TAG da caixa), que é do CONTRATO: `ESTADO_DA_PROPOSTA_LABEL`.
 *
 * O TEXTO DE RESERVA EXISTE POR UM MOTIVO MECÂNICO, e não por desconfiança do contrato: valor novo
 * do `shared-types` só existe em runtime depois do `build` do pacote (o typecheck resolve pela
 * fonte, o navegador carrega o `dist`). Sem a reserva, a TAG da caixa escreveria "undefined" na cara
 * de quem confere, que é o pior lugar possível para esse defeito aparecer. O teste de `spec` compara
 * as duas listas assim que o pacote está construído, então elas não têm como divergir em silêncio.
 */
const ROTULO_DO_ESTADO_RESERVA: Record<EstadoDaPropostaDeCliente, string> = {
  PROPOSTO: "Proposta Da Planilha",
  CONFIRMADO: "Cliente Confirmado",
};

export function rotuloDoEstado(estado: EstadoDaPropostaDeCliente): string {
  return ESTADO_DA_PROPOSTA_LABEL?.[estado] ?? ROTULO_DO_ESTADO_RESERVA[estado];
}

/** Exposto só para o teste de convergência com o contrato. */
export const ROTULOS_DE_ESTADO_DE_RESERVA = ROTULO_DO_ESTADO_RESERVA;

/**
 * COMO A ORIGEM SE LÊ NA TELA. O rótulo é do contrato (§A.24, title case: é TAG), e a tolerância ao
 * valor ausente é prática: `ORIGEM_DA_PROPOSTA_LABEL` é um VALOR do `shared-types`, e valor novo
 * desse pacote só existe em runtime depois do `build` dele. Sem a tolerância, a linha da
 * procedência escreveria "undefined" na cara de quem confere.
 */
export function rotuloDaOrigem(origem: OrigemDaPropostaDeCliente | undefined): string {
  if (!origem) return "";
  return ORIGEM_DA_PROPOSTA_LABEL?.[origem] ?? "";
}

/**
 * O QUE A COLUNA DA FILA ESCREVE, em UMA função, para a tabela e o card não discordarem do nome do
 * caso. A fila não tem o catálogo na mão, então ela distingue os três casos que o diretor pediu:
 * cliente já vinculado, proposta com código, proposta só com nome, e nada.
 */
export type MarcaDaPropostaNaFila =
  | { tipo: "VINCULADO"; nome: string }
  | { tipo: "PROPOSTA_COM_CODIGO"; nome: string }
  | { tipo: "PROPOSTA_SEM_CODIGO"; nome: string }
  | { tipo: "SEM_CLIENTE" };

export function marcaDaPropostaNaFila(vaga: {
  codCliente?: string | null;
  clienteNome?: string | null;
  propostaDeCliente?: PropostaDeClienteDaVaga | null;
}): MarcaDaPropostaNaFila {
  if (vaga.codCliente) return { tipo: "VINCULADO", nome: vaga.clienteNome ?? vaga.codCliente };
  const p = propostaDaVaga(vaga);
  if (!p) return { tipo: "SEM_CLIENTE" };
  return {
    tipo: p.codClienteProposto ? "PROPOSTA_COM_CODIGO" : "PROPOSTA_SEM_CODIGO",
    nome: p.nomeClienteProposto,
  };
}
