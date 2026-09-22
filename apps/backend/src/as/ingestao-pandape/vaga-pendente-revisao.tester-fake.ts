import type { VagaStatusItem, VagaStatusPapel } from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import { ReguaDeStatusDaVaga, type AsVagaStatusLinha } from "../vaga-status/vaga-status.service";
import { setDaEscrita, whereDaEscrita, cteQueEscreveEm } from "../candidatos/retencao-texto-livre.tester-fake";
import { ctesDaConsulta } from "../candidatos/retencao-sem-candidatura.tester-fake";
import {
  consultaQueCasa,
  partirPorVirgula,
  valorGravadoNoInsert,
} from "./ingestao-repositorio.tester-fake";
import type { Escrita } from "./ingestao-portas";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A VAGA ESPELHADA PENDENTE DE REVISÃO ────────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. Escrito A PARTIR DO REQUISITO (§A.40 regra 2), ANTES do
 * código existir: as afirmações que dependem da construção nascem VERMELHAS de propósito, e as que
 * são REGRESSÃO nascem verdes, porque medem o que já está certo e não pode deixar de estar.
 *
 * ┌─ A TRAVA MAIS CARA NÃO É O QUE A FRENTE CONSTRÓI, É O QUE ELA PODE DERRUBAR ────────────────┐
 * │ `encerrarAusentes` tem de continuar ALCANÇANDO a vaga no status novo. O alcance de hoje é    │
 * │ uma PROPRIEDADE do catálogo (`s.encerra = false`), e não uma lista de códigos: é por isso    │
 * │ que status novo entra no alcance sozinho. Trocar aquela propriedade por uma enumeração       │
 * │ ("RASCUNHO e ABERTA") deixaria a vaga pendente FORA do encerramento, e a cláusula            │
 * │ `... or v.encerrada_em is null` do expurgo passaria a proteger PARA SEMPRE toda pessoa viva  │
 * │ dentro dela, com CPF, e-mail, telefone e nascimento. Nada falha, nada fica vermelho, e é o   │
 * │ mesmo achado que já custou duas rodadas nesta frente, agora por uma porta nova.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O CONTRATO MEDE, E POR QUE NÃO É TEXTO ──────────────────────────────────────────────┐
 * │ O destino de um movimento NUNCA é conferido por nome. O contrato pega o valor que a          │
 * │ instrução grava em `status` e PERGUNTA AO CATÁLOGO o que aquele código significa: qual é o   │
 * │ papel dele, se ele recebe candidato, se ele encerra. Um literal digitado à mão não está no   │
 * │ catálogo sintético e cai no fail-closed da própria régua, que é a forma de medir "resolveu   │
 * │ pelo papel" sem procurar a palavra "ABERTA" em lugar nenhum.                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: dado 100% sintético. Aqui só há id de vaga, código de status, data e um usuário inventado.
 * §A.11: sem travessão em nenhuma frase.
 */

// ── 1. O CATÁLOGO SINTÉTICO, E A DIFERENÇA ENTRE OS DOIS TIPOS DE CÓDIGO ───────────────────────

/**
 * OS CÓDIGOS RESOLVÍVEIS POR PAPEL SÃO SINTÉTICOS E FEIOS DE PROPÓSITO, e o do status novo NÃO.
 *
 * ABERTURA, FECHAMENTO, RASCUNHO e ENTREGA têm papel de sistema, então quem precisa deles PERGUNTA
 * AO CATÁLOGO, e um código inventado prova que a pergunta aconteceu: "ABERTA" digitado à mão não
 * casa com `codigo-sintetico-abertura`.
 *
 * O `PENDENTE_REVISAO` é o caso OPOSTO, e a diferença é o achado central deste arquivo: ele NÃO tem
 * papel próprio para ser resolvido por (ver `violacoesDoStatusNovo`), então a identidade dele é o
 * PRÓPRIO CÓDIGO. O que se pode exigir de quem o escreve não é "resolva pelo papel", é
 * **CONFIRA NO CATÁLOGO ANTES DE GRAVAR**: sem a linha, a ingestão para com uma frase, em vez de
 * empurrar um código que a FK RESTRICT vai recusar no meio de uma varredura de 137 mil inscrições.
 */
export const CODIGO = {
  rascunho: "codigo-sintetico-rascunho",
  abertura: "codigo-sintetico-abertura",
  fechamento: "codigo-sintetico-fechamento",
  entrega: "codigo-sintetico-entrega",
  cancelamento: "codigo-sintetico-cancelamento",
  /** Um status LIVRE qualquer, do diretor, que serve de destino manual legítimo. */
  standBy: "codigo-sintetico-stand-by",
  /** O STATUS NOVO. O código é a identidade dele, e é o mesmo que a produção vai declarar. */
  pendenteRevisao: "PENDENTE_REVISAO",
} as const;

export const ROTULO_PENDENTE = "Pendente De Revisão";

/**
 * O QUE VEIO DO ATS, e que NÃO pode aparecer na trilha (§A.6). São os mesmos valores que
 * `escritaDaVaga` põe no item: título e código de vaga são digitados lá fora, por gente, e já
 * chegaram com nome de pessoa dentro.
 */
export const TEXTO_DO_ATS = ["codigo-que-veio-do-ats", "titulo-que-veio-do-ats"] as const;

/** Como o requisito descreve a linha nova do catálogo. `papel` é o que este contrato discute. */
export interface DesenhoDoStatusNovo {
  papel: VagaStatusPapel;
  encerra: boolean;
  recebeCandidato: boolean;
  daTrilha: boolean;
  movivelManualmente: boolean;
  rotulo: string;
}

/**
 * ─ O PAPEL DO STATUS NOVO, E POR QUE O CONTRATO CONTINUA NÃO PERGUNTANDO QUAL É ────────────────
 *
 * O briefing dizia "papel RASCUNHO", e a premissa CAIU: a migration 0102 cria
 * `unique index as_vaga_status_papel_unico on as_vaga_status (papel) where papel <> 'LIVRE'`, ou
 * seja existe EXATAMENTE UM status por papel de sistema, e o RASCUNHO já tem dono. A linha nem
 * entra: a migration da frente morreria no insert.
 *
 * O DIRETOR DECIDIU: papel `REVISAO`, novo, criado pela migration 0115, com o CHECK do banco e o
 * vocabulário compartilhado acompanhando. O candidato `LIVRE` foi descartado, e o motivo está
 * escrito em `PAPEIS_CANDIDATOS`, com os dois efeitos que foram MEDIDOS aqui antes da decisão.
 *
 * AS SEIS PROPRIEDADES CONTINUAM SEM PERGUNTAR QUAL É O PAPEL, e isso não é sobra do desenho
 * anterior: elas perguntam o que o status SIGNIFICA (`encerra`, `recebe_candidato`) e o que o
 * sistema FAZ com a vaga. Um teste que afirmasse o literal do papel viraria dívida na primeira
 * rodada, e mudaria de veredito sem que nada de comportamento tivesse mudado. A lista de candidatos
 * fica de pé, com um item só, porque é ela que torna barato medir de novo se o papel mudar.
 */
export interface PapelCandidato {
  nome: string;
  papel: VagaStatusPapel;
  observacao: string;
}

export const PAPEIS_CANDIDATOS: PapelCandidato[] = [
  /*
   * ┌─ O CANDIDATO `LIVRE` SAIU DAQUI, e o motivo fica escrito para não voltar ──────────────────┐
   * │ O diretor decidiu o papel `REVISAO`, novo (migration 0115), então `LIVRE` virou REQUISITO   │
   * │ MORTO. Requisito morto apagado sem explicação volta na próxima sessão, com o argumento de   │
   * │ que "é o papel que o banco já admite", que é verdade e é insuficiente.                       │
   * │                                                                                             │
   * │ OS DOIS EFEITOS MEDIDOS QUE O CONDENARAM, e os dois foram vistos vermelhos neste arquivo:   │
   * │  1. a guarda do `moverStatus` NÃO DISPARA. Ela pergunta o PAPEL da origem, e com `LIVRE` a  │
   * │     vaga sem cliente vira ABERTA por uma rota HTTP, pulando a fila inteira e a régua de     │
   * │     obrigatórios, sem nada falhar;                                                          │
   * │  2. o status novo fica SEM IDENTIDADE PERGUNTÁVEL. De `LIVRE` pode haver muitas linhas, e   │
   * │     por isso a régua nem o indexa: quem precisasse dele teria de casar pelo CÓDIGO LITERAL, │
   * │     ou deduzir "está na fila?" combinando flags que o DIRETOR edita na tela de              │
   * │     configuração. O literal é exatamente o que esta frente existe para eliminar, e a        │
   * │     dedução por flags põe a régua da fila nas mãos de quem só queria trocar uma cor.        │
   * │                                                                                             │
   * │ O PAPEL PRÓPRIO RESOLVE OS DOIS de uma vez, e é por isso que ele é a decisão: o índice      │
   * │ único parcial garante UMA linha por papel de sistema, então "qual é o status da revisão?"   │
   * │ passa a ter resposta, e a guarda volta a poder decidir por uma pergunta ao catálogo.        │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  {
    nome: "REVISAO",
    papel: "REVISAO",
    observacao: "decisão do diretor, migration 0115: papel próprio, com identidade perguntável.",
  },
];

/** O papel que os cenários usam quando o caso não é SOBRE o papel. Nunca é afirmado. */
export const PAPEL_PADRAO_DO_CONTRATO: VagaStatusPapel = PAPEIS_CANDIDATOS[0].papel;

/** O desenho da linha nova, com o papel como PARÂMETRO, e nunca como expectativa. */
export function desenhoDaFila(
  papel: VagaStatusPapel = PAPEL_PADRAO_DO_CONTRATO,
): DesenhoDoStatusNovo {
  return {
    papel,
    encerra: false,
    recebeCandidato: true,
    daTrilha: false,
    movivelManualmente: false,
    rotulo: ROTULO_PENDENTE,
  };
}

/** A premissa CAÍDA, guardada só para ser reprovada com o motivo medido. */
export const DESENHO_DO_MAPA: DesenhoDoStatusNovo = { ...desenhoDaFila("RASCUNHO"), daTrilha: true, movivelManualmente: true };

const BASE: readonly VagaStatusItem[] = [
  { codigo: CODIGO.rascunho, rotulo: "Rascunho", ordem: 1, tom: "nt", ativo: true, papel: "RASCUNHO", encerra: false, recebeCandidato: true, daTrilha: true, movivelManualmente: false },
  { codigo: CODIGO.abertura, rotulo: "Aberta", ordem: 2, tom: "wn", ativo: true, papel: "ABERTURA", encerra: false, recebeCandidato: true, daTrilha: true, movivelManualmente: true },
  { codigo: CODIGO.entrega, rotulo: "Entregue", ordem: 3, tom: "ok", ativo: true, papel: "ENTREGA", encerra: true, recebeCandidato: false, daTrilha: false, movivelManualmente: false },
  { codigo: CODIGO.fechamento, rotulo: "Fechada", ordem: 4, tom: "nt", ativo: true, papel: "FECHAMENTO", encerra: true, recebeCandidato: false, daTrilha: false, movivelManualmente: false },
  { codigo: CODIGO.cancelamento, rotulo: "Cancelada", ordem: 5, tom: "dg", ativo: true, papel: "CANCELAMENTO", encerra: true, recebeCandidato: false, daTrilha: false, movivelManualmente: false },
  { codigo: CODIGO.standBy, rotulo: "Stand By", ordem: 6, tom: "nt", ativo: true, papel: "LIVRE", encerra: false, recebeCandidato: true, daTrilha: false, movivelManualmente: true },
];

/** A linha do status novo, como o catálogo a devolveria. */
export function linhaDoStatusNovo(d: DesenhoDoStatusNovo = desenhoDaFila()): AsVagaStatusLinha {
  return { id: 99, codigo: CODIGO.pendenteRevisao, ordem: 7, tom: "dg", ativo: true, ...d };
}

export function linhasDaRevisao(
  opcoes: { semPendente?: boolean; desenho?: DesenhoDoStatusNovo } = {},
): AsVagaStatusLinha[] {
  const linhas: AsVagaStatusLinha[] = BASE.map((s, i) => ({ id: i + 1, ...s }));
  if (!opcoes.semPendente) linhas.push(linhaDoStatusNovo(opcoes.desenho));
  return linhas;
}

export interface CatalogoDaRevisao {
  servico: never;
  regua: ReguaDeStatusDaVaga;
  papeisPedidos: string[];
  linhas: AsVagaStatusLinha[];
}

/**
 * O catálogo que ANOTA os papéis pedidos.
 *
 * A RÉGUA DEVOLVIDA É A DE VERDADE, e não um dublê complacente: é ela que carrega o fail-closed
 * (código fora do catálogo LANÇA), que é justamente o que faz um literal digitado aparecer.
 */
export function catalogoDaRevisao(
  opcoes: { semPendente?: boolean; desenho?: DesenhoDoStatusNovo } = {},
): CatalogoDaRevisao {
  const linhas = linhasDaRevisao(opcoes);
  const regua = new ReguaDeStatusDaVaga(linhas);
  const papeisPedidos: string[] = [];
  /*
   * O PROXY, E NÃO UMA CÓPIA COM OS MÉTODOS ESCOLHIDOS A DEDO: a régua é a de verdade, com o
   * fail-closed dela, e o que muda é só a ANOTAÇÃO de qual papel foi perguntado. Uma cópia
   * parcial deixaria de fora o método que a implementação de amanhã resolver usar, e o teste
   * quebraria com um "não é função" em vez de dizer o que está errado.
   */
  const anotando = new Proxy(regua, {
    get(alvo, prop, receptor) {
      if (prop === "codigoDoPapel") {
        return (papel: VagaStatusPapel) => {
          papeisPedidos.push(papel);
          return alvo.codigoDoPapel(papel);
        };
      }
      const valor = Reflect.get(alvo, prop, receptor) as unknown;
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(alvo) : valor;
    },
  });
  const servico = {
    listar: (incluirInativos = false) =>
      Promise.resolve(incluirInativos ? linhas : linhas.filter((l) => l.ativo)),
    regua: () => Promise.resolve(anotando),
    codigoDoPapel: (p: VagaStatusPapel) => Promise.resolve(anotando.codigoDoPapel(p)),
  };
  return { servico: servico as never, regua, papeisPedidos, linhas };
}

// ── 2. LER A INSTRUÇÃO EMITIDA, COM OS VALORES, POR SENTIDO ────────────────────────────────────

/**
 * ─ POR QUE ESTE ARQUIVO NÃO REUSA O `bancoFingido` DO REPOSITÓRIO ──────────────────────────────
 *
 * O leitor daquele arquivo apaga os valores: `textoDaConsulta` trata chunk por chunk e um valor
 * interpolado que seja número ou texto cru vira STRING VAZIA. Para os contratos que medem a FORMA
 * da instrução (a fronteira, a guarda, a tupla comparada) isso está certo e até ajuda.
 *
 * ESTE CONTRATO MEDE OUTRA COISA: QUAL CÓDIGO a instrução grava em `status`. Com os valores
 * apagados, "nasceu na fila de revisão" e "nasceu no rascunho" produzem exatamente o mesmo texto, e
 * o teste ficaria VERDE sobre o defeito. Um teste que não consegue ficar vermelho não mede nada.
 *
 * Então aqui o leitor RESOLVE o valor interpolado, e só aqui. Medido contra o drizzle desta casa: no
 * `sql` template os valores chegam CRUS (número, texto, null), e não embrulhados em `Param`.
 */
function textoComValores(q: unknown): string {
  if (q === null || q === undefined) return "null";
  if (typeof q === "string" || typeof q === "number" || typeof q === "boolean") return String(q);
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no.queryChunks)) return no.queryChunks.map(textoComValores).join("");
  if (Array.isArray(no.value)) return no.value.join("");
  if (no.value !== undefined) return String(no.value);
  return "";
}

export interface RespostaDaRevisao {
  /** Responde por SENTIDO (um trecho do texto), nunca pela ordem das chamadas. */
  quando: RegExp;
  devolve: unknown[];
}

/** Um banco que ANOTA a instrução COM os valores e responde por sentido. */
export function bancoDaRevisao(respostas: RespostaDaRevisao[]): { db: never; consultas: string[] } {
  const consultas: string[] = [];
  const db = {
    execute: (q: unknown) => {
      const texto = textoComValores(q)
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      consultas.push(texto);
      const r = respostas.find((x) => x.quando.test(texto.toLowerCase()));
      return Promise.resolve(r ? r.devolve : []);
    },
  };
  return { db: db as never, consultas };
}

// ── 2. LER O QUE A INSTRUÇÃO GRAVA ────────────────────────────────────────────────────

/*
 * A LISTA POR VÍRGULA MORA NO ARQUIVO DO REPOSITÓRIO e é importada, e não copiada: duas cópias do
 * mesmo leitor divergem na primeira correção, e a divergência aparece como um contrato aprovando o
 * que o outro reprova, sobre o MESMO texto de instrução.
 */

/** O valor que o `set` de um update grava numa coluna. Nulo quer dizer "não escreve esta coluna". */
export function valorNoSet(sqlTexto: string, coluna: string): string | null {
  const partes = partirPorVirgula(setDaEscrita(sqlTexto.toLowerCase()));
  const parte = partes.find((p) => new RegExp(`^${coluna}\\s*=`).test(p.trim()));
  return parte ? parte.slice(parte.indexOf("=") + 1).trim().replace(/'/g, "") : null;
}

/** O código do catálogo que a instrução grava, casado sem caixa. Nulo quando não grava status. */
export function statusGravado(
  valor: string | null,
  linhas: readonly AsVagaStatusLinha[],
): AsVagaStatusLinha | null {
  if (valor === null) return null;
  const v = valor.trim().toLowerCase();
  return linhas.find((l) => l.codigo.toLowerCase() === v) ?? null;
}

export interface EmitidoDaVaga {
  consultas: string[];
  busca: string | null;
  insertDaVaga: string | null;
  update: string | null;
  /** O repositório RECUSOU a escrita. Recusar é uma forma legítima de não gravar coisa errada. */
  recusou: boolean;
}

export function lerEmitidoDaVaga(consultas: string[], recusou = false): EmitidoDaVaga {
  const baixas = consultas.map((c) => c.toLowerCase());
  return {
    recusou,
    consultas: baixas,
    busca: consultaQueCasa(consultas, /select[\s\S]*from\s+vagas\s+v\b/),
    insertDaVaga: consultaQueCasa(consultas, /insert\s+into\s+vagas\b/),
    update: consultaQueCasa(consultas, /update\s+vagas\b/),
  };
}

// ── 3. O CONTRATO 1: A LINHA NOVA DO CATÁLOGO ──────────────────────────────────────────────────

/**
 * ─ O ACHADO QUE DERRUBOU A PREMISSA DO BRIEFING ───────────────────────────────────────────────
 *
 * "Papel RASCUNHO" é inexequível, por duas razões independentes:
 *
 * 1. O BANCO NÃO DEIXA. A migration 0102 cria
 *    `CREATE UNIQUE INDEX as_vaga_status_papel_unico ON as_vaga_status (papel) WHERE papel <> 'LIVRE'`.
 *    Existe exatamente UMA linha por papel de sistema, e o RASCUNHO já tem dono. A segunda linha
 *    nem entra: a migration da frente morre no `insert`.
 * 2. E SE ENTRASSE, O ESTRAGO SERIA PIOR DO QUE O ERRO. `ReguaDeStatusDaVaga` indexa os papéis num
 *    `new Map(...)`, em que a ÚLTIMA linha vence, em silêncio. `codigoDoPapel("RASCUNHO")` passaria
 *    a devolver, dependendo da ordem de leitura, o código do status novo, e a vaga que nasce
 *    rascunho pela trilha humana nasceria na fila de revisão do espelho.
 *
 * A REGRA DAQUI NÃO ESCOLHE O SUBSTITUTO, ela mede a COLISÃO: papel de sistema que já tem dono é
 * recusado, papel próprio passa. `LIVRE` passa por admitir muitas linhas, e um papel NOVO passa por
 * não ter dono, e é decisão do diretor, porque mexe no vocabulário, no CHECK, no tipo compartilhado
 * e no mapa `porPapel`. As duas saídas são aceitas AQUI, e cada uma tem o seu preço travado em
 * outro lugar deste arquivo: o `LIVRE` desliga a guarda do mover status, e isso tem contrato próprio.
 */
export function violacoesDoStatusNovo(
  linha: AsVagaStatusLinha | undefined,
  outras: readonly AsVagaStatusLinha[],
): string[] {
  const v: string[] = [];
  if (!linha) {
    v.push(
      "STATUS_NOVO_AUSENTE: o catálogo não tem a linha do status novo. Sem ela a vaga espelhada não tem onde nascer, e quem tentar gravar o código leva RESTRICT da FK no meio da varredura.",
    );
    return v;
  }

  // O dono é comparado pelo CÓDIGO, e não pela identidade do objeto: o catálogo devolve cópias.
  const donoDoPapel = outras.find((l) => l.codigo !== linha.codigo && l.papel === linha.papel);
  if (linha.papel !== "LIVRE" && donoDoPapel) {
    v.push(
      `PAPEL_DE_SISTEMA_DISPUTADO: o status novo pede o papel ${linha.papel}, que já é de \`${donoDoPapel.codigo}\`. O banco tem \`unique index as_vaga_status_papel_unico ... where papel <> 'LIVRE'\` (migration 0102): a linha NÃO ENTRA, e a migration da frente morre no insert. E se entrasse seria pior: a régua indexa papel num Map em que a última linha vence EM SILÊNCIO, e \`codigoDoPapel\` passaria a devolver o código errado para quem pergunta pelo papel. As duas saídas possíveis são o papel LIVRE, que admite muitas linhas, e um papel NOVO, que o índice admite por não ter dono e que mexe no vocabulário (CHECK, tipo compartilhado, mapa \`porPapel\`), o que é decisão do diretor. Qualquer das duas serve para o expurgo, que decide por \`s.encerra = false\`, uma PROPRIEDADE, e não por papel.`,
    );
  }
  if (linha.encerra) {
    v.push(
      "STATUS_NOVO_ENCERRA: o status novo declara `encerra = true`. A vaga espelhada nasceria ENCERRADA sem nunca ter vivido: ela sai das filas, para de receber a candidatura que a varredura acabou de ler, e a ingestão deixa de funcionar em silêncio.",
    );
  }
  if (!linha.recebeCandidato) {
    v.push(
      "STATUS_NOVO_NAO_RECEBE_CANDIDATO: `recebe_candidato = false` na vaga em que TODA inscrição do ATS entra. A varredura lê as inscrições e não tem onde pendurá-las: a ingestão inteira para de funcionar, sem nada falhar, e ninguém vê porque a vaga continua lá.",
    );
  }
  if (linha.daTrilha) {
    v.push(
      "STATUS_NOVO_NA_TRILHA: `da_trilha = true` deixa a TRILHA DE ABERTURA humana gravar este código. A fila de revisão existe para o que o ATS espelhou sem cliente; com o flag ligado, um consultor publica uma vaga digitada direto dentro dela, e a fila passa a misturar duas histórias que se resolvem de jeitos diferentes.",
    );
  }
  if (linha.movivelManualmente) {
    v.push(
      "STATUS_NOVO_E_DESTINO_MANUAL: `movivel_manualmente = true` faz o status novo virar destino do mover status, que é uma porta SEM a régua de liberação. Qualquer vaga cai na fila de revisão por um clique, e o que a fila afirma (veio do ATS, falta vincular cliente) deixa de ser verdade.",
    );
  }
  if (linha.rotulo.trim() === "" || linha.rotulo === linha.codigo) {
    v.push(
      "ROTULO_E_O_CODIGO: a linha nasceu sem rótulo humano, então a tela mostra o código cru para o time. O rótulo é o nome da fila inteira.",
    );
  }
  if (linha.rotulo.includes(String.fromCharCode(0x2014))) {
    v.push("ROTULO_COM_TRAVESSAO: §A.11 proíbe o travessão em texto que chega ao usuário.");
  }
  const foraDoTitleCase = linha.rotulo
    .split(/\s+/)
    .filter((p) => p !== "")
    .filter((p) => p[0] !== p[0].toLocaleUpperCase("pt-BR"));
  if (foraDoTitleCase.length > 0) {
    v.push(
      `ROTULO_FORA_DO_TITLE_CASE: §A.24 manda a primeira letra de cada palavra em maiúscula em título e tag, e ${foraDoTitleCase.join(", ")} está em minúscula. O rótulo vira pill de status na Central de Vagas.`,
    );
  }
  return v;
}

// ── 4. O CONTRATO 2: O NASCIMENTO DA VAGA ESPELHADA ────────────────────────────────────────────

export function violacoesDoNascimento(
  e: EmitidoDaVaga,
  cat: CatalogoDaRevisao,
  temClienteResolvido = false,
): string[] {
  const v: string[] = [];
  if (!e.insertDaVaga) {
    v.push(
      "NASCIMENTO_NAO_ACONTECE: a vaga espelhada não foi inserida. Sem o espelho não há fila, não há candidatura e não há ingestão.",
    );
    return v;
  }
  const bruto = valorGravadoNoInsert(e.insertDaVaga, "vagas", "status");
  const gravado = statusGravado(bruto === null ? null : bruto.replace(/'/g, ""), cat.linhas);

  if (!gravado) {
    v.push(
      `STATUS_DE_NASCIMENTO_FORA_DO_CATALOGO: a vaga nasce com \`${String(bruto)}\`, que não é linha de \`as_vaga_status\`. É literal digitado: a FK RESTRICT derruba a varredura inteira, e derruba no meio de 137 mil inscrições, onde o chamador engole o erro e soma um contador.`,
    );
    return v;
  }
  if (gravado.codigo !== CODIGO.pendenteRevisao && !temClienteResolvido) {
    v.push(
      `NASCE_FORA_DA_FILA_DE_REVISAO: a vaga espelhada sem cliente nasceu em \`${gravado.codigo}\` (papel ${gravado.papel}). Nascendo no rascunho comum ela fica indistinguível da vaga que um consultor começou a digitar: não entra na fila de revisão, ninguém vincula o cliente que falta, e as ~600 vagas do espelho ficam paradas sem que nenhuma tela acuse.`,
    );
  }
  if (!gravado.recebeCandidato) {
    v.push(
      `NASCE_EM_STATUS_QUE_NAO_RECEBE_CANDIDATO: \`${gravado.codigo}\` tem \`recebe_candidato = false\`. A varredura acabou de ler as inscrições daquela vaga e não terá onde pendurá-las.`,
    );
  }
  if (gravado.encerra) {
    v.push(
      `NASCE_EM_STATUS_QUE_ENCERRA: \`${gravado.codigo}\` encerra a vaga. Ela nasce morta, some das filas e ainda leva o expurgo a olhar para ela com a régua de vaga encerrada.`,
    );
  }

  const cliente = (valorGravadoNoInsert(e.insertDaVaga, "vagas", "cod_cliente") ?? "").replace(/'/g, "").trim();
  if (!temClienteResolvido && cliente !== "" && cliente !== "null") {
    v.push(
      `CLIENTE_INVENTADO_NO_NASCIMENTO: o insert grava \`${cliente}\` em \`cod_cliente\` sem que a fonte tenha dito qual é. §A.5 é explícita: adiar em vez de inventar. Cliente inventado contamina régua, contagem por cliente e a fila de revisão, que passa a não ter o que revisar.`,
    );
  }
  if (temClienteResolvido && gravado.codigo === CODIGO.pendenteRevisao) {
    v.push(
      "PENDENTE_COM_CLIENTE: a vaga nasceu na fila de revisão MESMO tendo cliente resolvido. A fila é a lista do que falta vincular: enchê-la de vaga já vinculada faz o time trabalhar de graça e esconde as que precisam de gente.",
    );
  }
  return v;
}

/** O fail-closed: sem a linha no catálogo, a ingestão PARA, e não empurra código nenhum. */
export function violacoesDoFailClosed(e: EmitidoDaVaga): string[] {
  const v: string[] = [];
  if (e.insertDaVaga && !e.recusou) {
    v.push(
      "SEM_FAIL_CLOSED_DO_STATUS_NOVO: o catálogo não tem a linha do status novo e a ingestão gravou assim mesmo. Ou o código vai para a FK RESTRICT (e a varredura cai no meio), ou ele cai num rascunho qualquer por fallback, e aí ~600 vagas somem da fila de revisão sem que ninguém peça nada. O catálogo incompleto é problema de INSTALAÇÃO, e o modo de falha seguro é parar com uma frase.",
    );
  }
  return v;
}

// ── 5. O CONTRATO 3: A REABERTURA NÃO CONTORNA A FILA ──────────────────────────────────────────

/**
 * ─ O CONTRATO DA REABERTURA, REESCRITO PELO VETO DO `seguranca` ────────────────────────────────
 *
 * A PRIMEIRA REDAÇÃO PERGUNTAVA A COISA ERRADA, e a redação do contrato herdou o erro do código:
 * "tem cliente?". Existe exatamente UM caminho em que a vaga está na fila COM cliente preenchido, e
 * ele é o gesto mais deliberado que a frente tem: o Master devolveu a vaga para a fila SEM trocar o
 * cliente, dizendo "este vínculo está errado, alguém confira". Bastava a vaga sumir das ativas do
 * ATS e voltar para ela ressuscitar PUBLICADA, com o mesmo cliente posto em dúvida, sem autor, sem
 * data e sem trilha. O ATS desfazia sozinho, em silêncio, a decisão explícita de uma pessoa.
 *
 * A PERGUNTA CERTA É "DE ONDE ESTA VAGA FOI FECHADA?", e ela só tem resposta porque quem fecha
 * guarda o estado anterior (`as_varredura_vagas.status_antes_do_encerramento`). O contrato passa a
 * medir RETOMADA, e não dedução: vaga que estava na fila volta para a fila, vaga que estava aberta
 * volta para aberta, e nenhum campo da vaga tem voto nisso.
 *
 * `statusAntes` NULO é o caso fail-closed: sem memória do estado anterior (ou com um código que o
 * catálogo não tem mais), o destino é a FILA. Revisar de novo custa um clique; publicar sem revisão
 * custa o furo inteiro.
 */
export function violacoesDaReabertura(
  e: EmitidoDaVaga,
  cat: CatalogoDaRevisao,
  statusAntes: string | null,
): string[] {
  const v: string[] = [];
  if (e.busca !== null && !/\bstatus_antes_do_encerramento\b/.test(e.busca)) {
    v.push(
      "REABERTURA_NAO_LE_O_ESTADO_GUARDADO: a consulta que decide o destino não traz `status_antes_do_encerramento`. Sem o estado de onde a varredura fechou a vaga, o destino volta a ser DEDUZIDO, e toda dedução erra no caso do Master que devolveu a vaga para a fila sem trocar o cliente.",
    );
  }
  if (e.busca !== null && /\bcod_cliente\b/.test(e.busca)) {
    v.push(
      "REABERTURA_DECIDE_PELO_CLIENTE: a consulta do destino lê `cod_cliente`. Nada nesta escrita precisa do cliente, e tê-lo à mão é o que permite a decisão errada voltar: a vaga que o Master devolveu para a fila COM cliente seria republicada pelo ATS, sem autor e sem trilha.",
    );
  }
  const upd = e.update;
  if (!upd) {
    v.push(
      "REABERTURA_NAO_ACONTECE: a vaga do espelho que voltou às ativas do ATS não recebeu instrução nenhuma. O carimbo `encerrada_em` fica numa vaga VIVA, e o relógio de retenção de quem está dentro dela segue correndo.",
    );
    return v;
  }
  const gravado = statusGravado(valorNoSet(upd, "status"), cat.linhas);
  if (!gravado) {
    const bruto = valorNoSet(upd, "status");
    v.push(
      bruto === null
        ? "REABERTURA_SEM_DESTINO: o update não grava `status`. A vaga que voltou às ativas continua marcada como fechada."
        : `REABERTURA_POR_LITERAL: o destino \`${bruto}\` não é linha do catálogo. É código digitado à mão: no dia em que o diretor renomear o status, a FK RESTRICT derruba a varredura, e é exatamente o hardcode que a régua de papel existe para eliminar.`,
    );
    return v;
  }
  const guardadoNoCatalogo =
    statusAntes !== null && cat.linhas.some((l) => l.codigo === statusAntes) ? statusAntes : null;
  if (guardadoNoCatalogo !== null && gravado.codigo !== guardadoNoCatalogo) {
    v.push(
      `REABERTURA_NAO_RETOMA_O_ESTADO: a vaga foi fechada estando em \`${guardadoNoCatalogo}\` e voltou para \`${gravado.codigo}\` (papel ${gravado.papel}). A reabertura desfaz o que a varredura fez, e nada além disso: quem estava na fila volta para a fila, quem estava aberto volta para aberto. Qualquer destino que não seja o estado guardado é o ATS decidindo por cima de quem decidiu antes dele, de 30 em 30 minutos e sem ninguém pedir.`,
    );
  }
  if (guardadoNoCatalogo === null && gravado.codigo !== CODIGO.pendenteRevisao) {
    v.push(
      `REABERTURA_SEM_MEMORIA_FORA_DA_FILA: sem estado guardado (ou com um código que o catálogo não tem mais), a vaga foi para \`${gravado.codigo}\` (papel ${gravado.papel}). O fail-closed é a FILA DE REVISÃO: publicar sem revisão é o furo inteiro, e revisar de novo custa um clique.`,
    );
  }
  return [...v, ...violacoesDaTrilhaDaReabertura(upd, gravado.codigo)];
}

/**
 * ─ A REABERTURA NÃO PODE SER MUDA, E A TRILHA VAI NA MESMA INSTRUÇÃO ──────────────────────────
 *
 * Medida a cadeia ponta a ponta, a vaga terminava o cenário com os mesmos dois eventos de antes: o
 * ATS trocava o status dela e a linha do tempo não registrava nada. Quem for auditar depois não tem
 * como saber que aquele status não foi posto por gente, que é a pergunta inteira.
 *
 * NA MESMA INSTRUÇÃO porque o repositório escreve FORA de transação: em duas chamadas, a segunda
 * podendo falhar, existiria vaga movida sem o registro do movimento, que é o defeito com outro nome.
 *
 * `por_id` NULO é obrigatório, e não detalhe: quem moveu foi a varredura. Usuário de sistema já está
 * VETADO nesta frente, e faria a trilha afirmar que ALGUÉM moveu o que ninguém moveu.
 */
function violacoesDaTrilhaDaReabertura(upd: string, destino: string): string[] {
  const v: string[] = [];
  const evento = eventoGravado(upd);
  if (!evento) {
    v.push(
      "REABERTURA_MUDA: o movimento não grava evento em `as_vaga_status_eventos`, na mesma instrução que move a vaga. O ATS troca o status e a linha do tempo da vaga não registra nada: ninguém sabe quem moveu, quando, nem de onde para onde, e um movimento automático fica indistinguível de um movimento humano.",
    );
    return v;
  }
  if (evento.por_id !== "null") {
    v.push(
      `REABERTURA_COM_AUTOR_INVENTADO: o evento grava \`por_id = ${evento.por_id}\`. Não houve autor humano, e pendurar a reabertura automática em alguém faz a trilha afirmar que uma pessoa moveu o que o ATS moveu. O valor certo é NULO, que é a verdade.`,
    );
  }
  if (evento.para !== `'${destino.toLowerCase()}'` && evento.para !== destino.toLowerCase()) {
    v.push(
      `REABERTURA_COM_TRILHA_DIVERGENTE: a vaga foi para \`${destino}\` e o evento diz \`${evento.para}\`. Trilha que não bate com o efeito é pior do que trilha nenhuma: ela é lida como verdade.`,
    );
  }
  if (evento.de === null || evento.de === "null") {
    v.push(
      "REABERTURA_SEM_ORIGEM_NA_TRILHA: o evento não diz DE ONDE a vaga saiu. A pergunta que a trilha existe para responder é o par (de onde, para onde), e só o destino não desfaz nada nem explica nada.",
    );
  }
  const narrativa = (evento.observacao ?? "").toLowerCase();
  const desacompanhada = [evento.de, evento.para]
    .map((x) => (x ?? "").replace(/'/g, ""))
    .filter((c) => c !== "" && !narrativa.includes(c));
  if (narrativa === "" || narrativa === "null" || desacompanhada.length > 0) {
    v.push(
      "NARRATIVA_NAO_DIZ_O_MOVIMENTO: a observação do evento não conta, em palavras, que foi a VARREDURA que reabriu a vaga e de onde para onde. Quem lê a trilha lê a frase, e uma frase que não diz quem moveu devolve a reabertura automática ao mesmo silêncio de antes.",
    );
  }
  const doItem = TEXTO_DO_ATS.filter((s) => narrativa.includes(s.toLowerCase()));
  if (doItem.length > 0) {
    v.push(
      `NARRATIVA_COM_TEXTO_DO_ATS: a observação carrega \`${doItem.join(", ")}\`, que veio do item do ATS. §A.6: na trilha entram códigos de status e mais nada, porque título e descrição são digitados lá fora e já chegaram com nome de gente dentro.`,
    );
  }
  return v;
}

/** O evento de status gravado DENTRO da instrução do movimento, coluna a coluna. */
function eventoGravado(sqlTexto: string): Record<string, string | null> | null {
  const t = sqlTexto.toLowerCase();
  const m = /insert\s+into\s+as_vaga_status_eventos\s*\(([^)]*)\)\s*(?:select|values\s*\()([\s\S]*?)(?:\bfrom\b|\)\s*returning|$)/.exec(
    t,
  );
  if (!m) return null;
  const colunas = partirPorVirgula(m[1]).map((c) => c.trim());
  const partes = partirPorVirgula(m[2]).map((c) => c.trim());
  /*
   * A ÚLTIMA COLUNA FICA COM TUDO O QUE SOBRAR, e isso não é preguiça: o fake escreve os parâmetros
   * SEM ASPAS no texto, então uma vírgula dentro da narrativa vira uma coluna a mais e empurraria
   * todas as leituras uma casa para o lado, deixando o contrato verde por engano. A narrativa é a
   * última coluna do insert, e é ela que pode conter vírgula.
   */
  const valores =
    partes.length > colunas.length
      ? [...partes.slice(0, colunas.length - 1), partes.slice(colunas.length - 1).join(", ")]
      : partes;
  const linha: Record<string, string | null> = {};
  colunas.forEach((c, i) => {
    linha[c] = valores[i] ?? null;
  });
  return linha;
}

// ── 6. O CONTRATO 4: O ENCERRAMENTO CONTINUA ALCANÇANDO O STATUS NOVO ──────────────────────────

/**
 * ─ A TRAVA MAIS CARA DA FRENTE ────────────────────────────────────────────────────────────────
 *
 * O alcance do encerramento tem de ser uma PROPRIEDADE lida do catálogo (`s.encerra = false`), e
 * nunca uma lista de códigos nem de papéis. É a propriedade que faz o status novo entrar no alcance
 * SOZINHO, sem ninguém lembrar de acrescentá-lo. Uma enumeração deixa a vaga pendente de fora, e a
 * cláusula `... or v.encerrada_em is null` do expurgo passa a proteger para sempre toda pessoa viva
 * dentro dela.
 */
export function violacoesDoAlcanceDoEncerramento(
  sqlEncerramento: string,
  cat: CatalogoDaRevisao,
): string[] {
  const v: string[] = [];
  const t = sqlEncerramento.toLowerCase();
  const cte = cteQueEscreveEm(t, "vagas");
  const corpo = cte ? cte.corpo : t;
  const onde = whereDaEscrita(corpo);

  const escrevemEmVagas = ctesDaConsulta(t).filter((c) => /\bupdate\s+vagas\b/.test(c.corpo));
  if (escrevemEmVagas.length > 1) {
    v.push(
      "DUAS_ESCRITAS_EM_VAGAS: mais de uma CTE escreve em `vagas` na mesma instrução. O contrato acha a escrita PELA TABELA em que ela escreve, então duas tornam a leitura ambígua e as afirmações passam a cair sobre o bloco errado, ficando verdes com o furo aberto.",
    );
  }
  if (!/\bs\.encerra\s*=\s*false\b/.test(onde) && !/\bencerra\s*=\s*false\b/.test(onde)) {
    v.push(
      "ALCANCE_NAO_E_PELA_PROPRIEDADE: o encerramento não decide por `encerra = false` lido de `as_vaga_status`. A propriedade é o que faz status NOVO entrar no alcance sozinho; qualquer outra forma exige alguém lembrar, e ninguém lembra.",
    );
  }
  const codigosCitados = cat.linhas
    .map((l) => l.codigo)
    .filter((c) => c !== CODIGO.fechamento)
    .filter((c) => t.includes(c.toLowerCase()));
  if (codigosCitados.length > 0) {
    v.push(
      `ALCANCE_POR_LISTA_DE_CODIGOS: a instrução cita os códigos ${codigosCitados.join(", ")}. O alcance virou enumeração, então TODO status criado depois escapa do encerramento, a começar pelo da fila de revisão: a vaga nunca recebe \`encerrada_em\`, e a cláusula \`or v.encerrada_em is null\` do expurgo protege PARA SEMPRE quem está dentro dela, com CPF, e-mail, telefone e nascimento. Nada falha e nenhuma tela acusa.`,
    );
  }
  if (/\bs\.papel\b/.test(onde)) {
    v.push(
      "ALCANCE_POR_PAPEL: o alcance passou a olhar `s.papel`. O status da fila tem papel PRÓPRIO, seja ele qual for, então uma enumeração de papéis o deixa de fora por construção, e com ele fica de fora toda pessoa viva dentro daquelas vagas. A pergunta certa nunca foi qual papel: é se o status encerra.",
    );
  }
  return v;
}

/** O expurgo não pode passar a decidir por papel: é isso que mantém o status novo abrigado. */
export function violacoesDoAbrigoDoExpurgo(sqlDoExpurgo: string): string[] {
  const v: string[] = [];
  const t = sqlDoExpurgo.toLowerCase();
  if (!/s\.encerra\s*=\s*false/.test(t)) {
    v.push(
      "EXPURGO_NAO_PROTEGE_PELA_PROPRIEDADE: a proteção do expurgo deixou de ler `s.encerra = false`. É essa propriedade que faz o status novo ser tratado como qualquer status não encerrado, sem que a frente precise tocar no expurgo.",
    );
  }
  const papeis = [...t.matchAll(/s\.papel\s*(?:=|in)\s*\(?\s*'([a-z_]+)'/g)].map((m) => m[1]);
  const inesperados = papeis.filter((p) => p !== "entrega");
  if (inesperados.length > 0) {
    v.push(
      `EXPURGO_ENUMERA_PAPEIS: o expurgo passou a citar os papéis ${inesperados.join(", ")}. Enquanto ele só excetua ENTREGA, o status novo se comporta como o rascunho se comportava, QUALQUER que seja o papel dele, e é essa a razão pela qual a frente pode criar o status sem tocar no expurgo. Citar outro papel quebra essa garantia em silêncio.`,
    );
  }
  return v;
}

// ── 7. O CONTRATO 5: A LIBERAÇÃO É DO SERVIDOR ─────────────────────────────────────────────────

export interface EscritaObservada {
  verbo: "update" | "insert";
  tabela: string;
  valores: Record<string, unknown>;
}

export interface EmitidoDaLiberacao {
  /** A porta existe no servidor? Falso é o estado de hoje, e é o vermelho esperado. */
  existe: boolean;
  recusou: boolean;
  escritas: EscritaObservada[];
  papeisPedidos: string[];
}

export interface CenarioDaLiberacao {
  temCliente: boolean;
  /** A vaga está na fila de revisão? Falso é a vaga qualquer, que esta porta não pode mover. */
  naFila: boolean;
}

export function violacoesDaLiberacao(
  e: EmitidoDaLiberacao,
  cat: CatalogoDaRevisao,
  cenario: CenarioDaLiberacao,
): string[] {
  const v: string[] = [];
  if (!e.existe) {
    v.push(
      "LIBERACAO_NAO_EXISTE: não há porta de liberação no servidor. Enquanto a trava viver só na tela, ela é contornável pela rota, e a casa já registrou esse erro antes: a tela avisa, o servidor recusa.",
    );
    return v;
  }
  const escritasNaVaga = e.escritas.filter((x) => x.tabela === "vagas" && x.verbo === "update");
  const destino = escritasNaVaga
    .map((x) => statusGravado(String(x.valores.status ?? x.valores["status"] ?? ""), cat.linhas))
    .find((x) => x !== null);

  if (!cenario.temCliente) {
    if (!e.recusou) {
      v.push(
        "LIBERA_SEM_CLIENTE: o servidor liberou uma vaga sem cliente vinculado. O requisito é explícito e a razão é a rota: guarda só de tela é contornada por qualquer chamada direta, e a vaga sai da fila sem o dado que a pôs lá. Depois disso ninguém mais sabe que faltava.",
      );
    }
    if (escritasNaVaga.length > 0) {
      v.push(
        "LIBERACAO_ESCREVEU_AO_RECUSAR: a recusa aconteceu DEPOIS de escrever na vaga. Recusa que já gravou não é recusa: a vaga fica com o status novo e a mensagem de erro diz o contrário, que é o pior dos dois mundos para quem opera.",
      );
    }
    return v;
  }

  if (!cenario.naFila) {
    if (!e.recusou) {
      v.push(
        "LIBERA_VAGA_FORA_DA_FILA: a porta moveu uma vaga que não está na fila de revisão. Ela vira uma SEGUNDA porta para o papel ABERTURA, sem a régua de obrigatórios que a trilha de abertura cobra, que é exatamente o buraco que o `mover status` já teve de fechar.",
      );
    }
    return v;
  }

  if (e.recusou) {
    v.push(
      "LIBERACAO_COM_CLIENTE_NAO_ACONTECE: a vaga tinha cliente, estava na fila, e a liberação recusou assim mesmo. A trava não pode virar imobilidade: a fila que não esvazia é tão inútil quanto a que não existe.",
    );
    return v;
  }
  if (!destino) {
    v.push(
      "LIBERACAO_SEM_DESTINO: a liberação não gravou em `vagas` nenhum status que exista no catálogo. Ou ela não escreveu, e a vaga continua na fila depois de liberada, ou escreveu um LITERAL digitado à mão, que a FK RESTRICT recusa no dia da renomeação.",
    );
    return v;
  }
  if (destino.papel !== "ABERTURA") {
    v.push(
      `DESTINO_NAO_E_O_PAPEL_DE_ABERTURA: a vaga foi para \`${destino.codigo}\` (papel ${destino.papel}). O destino é sempre o código do papel ABERTURA, resolvido no servidor pelo catálogo, e nunca o literal "ABERTA": o diretor renomeia código, e o dia em que renomear, o literal vira FK RESTRICT no meio da operação.`,
    );
  }
  if (!e.papeisPedidos.includes("ABERTURA")) {
    v.push(
      "DESTINO_NAO_FOI_PERGUNTADO_AO_CATALOGO: a liberação não pediu o código do papel ABERTURA à régua. Acertar o código sem perguntar é acertar por coincidência, e a coincidência acaba na primeira renomeação.",
    );
  }
  return v;
}

// ── 8. O CONTRATO 6: O MOVER STATUS NÃO É A SEGUNDA PORTA ──────────────────────────────────────

/**
 * ─ A SEGUNDA PORTA: O STATUS NOVO NÃO SAI PARA ABERTURA POR MOVIMENTO MANUAL ──────────────────
 *
 * A PROPRIEDADE, e ela não depende de papel nenhum: a vaga que está na fila de revisão, sem cliente,
 * NÃO PODE virar aberta por uma rota de movimento manual. Se ela puder, a guarda do servidor no
 * liberar é verdadeira e inútil ao mesmo tempo, porque a mesma tela oferece o outro caminho, e o
 * outro caminho não pergunta nada.
 *
 * POR QUE ISSO ESTÁ ABERTO HOJE, e é o que o veto do `seguranca` revelou: `moverStatus` recusa a
 * saída com uma condição escrita POR PAPEL, `regua.ehDoPapel(vaga.status, "RASCUNHO")`, e o
 * comentário ao lado dela diz, com todas as letras, que ela existe porque "rascunho publica por UMA
 * porta, a que tem a régua". O status novo NÃO pode ter o papel RASCUNHO (o índice único impede),
 * então, qualquer que seja o papel que ele acabe tendo, ele nasce FORA daquela condição:
 * `podeSair` só olha `encerra`, e `ABERTA` é destino manual de propósito.
 *
 * O CONSERTO NÃO É ACRESCENTAR O SEGUNDO PAPEL À CONDIÇÃO, e o contrato não o exige: a condição
 * precisa decidir por uma PROPRIEDADE ("este status exige a régua de abertura"), senão o terceiro
 * status repete a história. O contrato mede o EFEITO, e deixa a forma para quem constrói.
 */
export interface EmitidoDoMover {
  recusou: boolean;
  escritas: EscritaObservada[];
}

export function violacoesDoMoverStatus(e: EmitidoDoMover, naFila: boolean): string[] {
  const v: string[] = [];
  const mexeuNaVaga = e.escritas.some((x) => x.tabela === "vagas" && x.verbo === "update");
  if (naFila) {
    if (!e.recusou || mexeuNaVaga) {
      v.push(
        "SEGUNDA_PORTA_DO_MOVER_STATUS: o mover status tirou da fila, sem cliente, uma vaga que só sai por liberação. A trava do servidor no liberar vira enfeite: a mesma tela oferece o outro caminho, e o outro caminho não pergunta nada. A guarda de hoje decide por PAPEL (`ehDoPapel(status, \"RASCUNHO\")`) e o status novo não pode ter aquele papel, então ele nasce fora dela QUALQUER que seja o papel escolhido. Acrescentar o segundo papel à condição resolve este caso e repete a história no terceiro status: a pergunta certa é se aquele status exige a régua de abertura.",
      );
    }
    return v;
  }
  if (e.recusou || !mexeuNaVaga) {
    v.push(
      "MOVER_STATUS_IMOBILIZADO: a vaga comum deixou de ser movida. A correção da segunda porta não pode fechar o movimento legítimo, ou o conserto vira outro defeito, do mesmo tamanho e mais difícil de ver.",
    );
  }
  return v;
}

// ── 9. RODAR O REPOSITÓRIO REAL ────────────────────────────────────────────────────────────────

export const ID_VACANCY = 9101;

export function escritaDaVaga(codCliente: string | null = null): Escrita {
  return {
    tabela: "vagas",
    acao: "upsert",
    chaveDeConflito: ["id_vacancy_pandape"],
    comparaAntes: ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"],
    valores: {
      id_vacancy_pandape: ID_VACANCY,
      codigo: "codigo-que-veio-do-ats",
      nome_divulgacao: "titulo-que-veio-do-ats",
      cidade_id: "Cidade Sintetica - SP",
      posicoes_oficiais: 2,
      cod_cliente: codCliente,
      cargo_id: null,
      status: "PENDENTE_REVISAO",
    },
  };
}

export interface EscritorDeVaga {
  escrever(e: Escrita): Promise<{ linhasAfetadas: number; id: string }>;
  encerrarAusentes(idsAtivos: number[]): Promise<number>;
}

export type CriarEscritor = (db: never, catalogo: never) => EscritorDeVaga;

const ID_DA_VAGA = "00000000-0000-4000-8000-0000000000aa";

/** O NASCIMENTO: a busca não acha nada e a vaga entra. */
export async function rodarNascimento(
  criar: CriarEscritor,
  opcoes: { catalogo?: CatalogoDaRevisao; codCliente?: string | null } = {},
): Promise<{ emitido: EmitidoDaVaga; catalogo: CatalogoDaRevisao }> {
  const cat = opcoes.catalogo ?? catalogoDaRevisao();
  const banco = bancoDaRevisao([
    { quando: /insert\s+into\s+vagas\b/, devolve: [{ id: ID_DA_VAGA }] },
  ]);
  let recusou = false;
  try {
    await criar(banco.db, cat.servico).escrever(escritaDaVaga(opcoes.codCliente ?? null));
  } catch {
    recusou = true;
  }
  return { emitido: lerEmitidoDaVaga(banco.consultas, recusou), catalogo: cat };
}

/**
 * A REABERTURA: a vaga do espelho existe, ENCERRADA PELA VARREDURA, e voltou às ativas.
 *
 * A linha devolvida carrega `cod_cliente` DE PROPÓSITO, mesmo que o destino não possa mais depender
 * dele: é assim que o cenário do Master (vaga na FILA, COM cliente) fica exprimível, e é nele que a
 * dedução pelo cliente aparece como violação em vez de passar despercebida.
 */
export async function rodarReabertura(
  criar: CriarEscritor,
  cenario: { statusAntes: string | null; temCliente?: boolean },
  catalogo?: CatalogoDaRevisao,
): Promise<{ emitido: EmitidoDaVaga; catalogo: CatalogoDaRevisao }> {
  const cat = catalogo ?? catalogoDaRevisao();
  const banco = bancoDaRevisao([
    {
      quando: /select[\s\S]*from\s+vagas\s+v\b/,
      devolve: [
        {
          id: ID_DA_VAGA,
          status: CODIGO.fechamento,
          da_varredura: true,
          encerrou: true,
          status_antes: cenario.statusAntes,
          cod_cliente: cenario.temCliente ? "CLI-SINTETICO" : null,
        },
      ],
    },
    { quando: /update\s+vagas\b/, devolve: [{ id: ID_DA_VAGA }] },
  ]);
  let recusou = false;
  try {
    await criar(banco.db, cat.servico).escrever(escritaDaVaga(null));
  } catch {
    recusou = true;
  }
  return { emitido: lerEmitidoDaVaga(banco.consultas, recusou), catalogo: cat };
}

/** O ENCERRAMENTO, com a lista de ativos dada. */
export async function rodarEncerramento(
  criar: CriarEscritor,
  idsAtivos: number[],
  catalogo?: CatalogoDaRevisao,
): Promise<{ sql: string | null; catalogo: CatalogoDaRevisao; devolvido: number }> {
  const cat = catalogo ?? catalogoDaRevisao();
  const banco = bancoDaRevisao([
    { quando: /update\s+vagas/, devolve: [{ id: "uma" }, { id: "outra" }] },
  ]);
  const devolvido = await criar(banco.db, cat.servico).encerrarAusentes(idsAtivos);
  return {
    sql: consultaQueCasa(banco.consultas, /update\s+vagas/),
    catalogo: cat,
    devolvido,
  };
}

// ── 10. O BANCO TOLERANTE, PARA O SERVIÇO DE VAGAS ─────────────────────────────────────────────

const NOME_DA_TABELA = Symbol.for("drizzle:Name");

function nomeDaTabela(t: unknown): string {
  return String((t as Record<symbol, unknown> | null)?.[NOME_DA_TABELA] ?? "?");
}

/**
 * Um banco que ANOTA as escritas e responde a leitura por SENTIDO (a tabela lida), nunca por ordem.
 *
 * ELE É TOLERANTE DE PROPÓSITO: o caminho de sucesso do serviço termina recarregando a vaga por uma
 * listagem grande, que este dublê não tem como servir. O que interessa aqui é o que foi ESCRITO
 * antes disso, então a exceção da recarga é capturada e o veredito recai sobre as escritas. Um fake
 * que tentasse servir a listagem inteira viraria uma segunda implementação, com os defeitos dela.
 */
export function bancoDeVagasFingido(linhaDaVaga: Record<string, unknown> | null): {
  db: never;
  escritas: EscritaObservada[];
} {
  const escritas: EscritaObservada[] = [];

  const cadeia = (tabela: string, resposta: unknown[]): Record<string, unknown> => {
    const eu: Record<string, unknown> = {};
    const devolveEu = () => eu;
    for (const m of [
      "from", "where", "for", "limit", "orderBy", "groupBy", "innerJoin", "leftJoin",
      "rightJoin", "having", "onConflictDoUpdate", "onConflictDoNothing", "returning", "as",
    ]) {
      eu[m] = devolveEu;
    }
    eu.set = (valores: Record<string, unknown>) => {
      escritas.push({ verbo: "update", tabela, valores });
      return eu;
    };
    eu.values = (valores: Record<string, unknown>) => {
      escritas.push({ verbo: "insert", tabela, valores });
      return eu;
    };
    eu.execute = () => Promise.resolve(resposta);
    eu.then = (ok: (v: unknown) => unknown) => Promise.resolve(resposta).then(ok);
    return eu;
  };

  const porta = {
    select: () => cadeia("?", linhaDaVaga ? [linhaDaVaga] : []),
    selectDistinct: () => cadeia("?", []),
    update: (t: unknown) => cadeia(nomeDaTabela(t), []),
    insert: (t: unknown) => cadeia(nomeDaTabela(t), []),
    delete: (t: unknown) => cadeia(nomeDaTabela(t), []),
    execute: () => Promise.resolve([]),
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(porta),
  };
  return { db: porta as never, escritas };
}

export const USUARIO_SINTETICO: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000ff",
  email: "consultor.sintetico@exemplo.invalido",
  papel: "MASTER",
  senhaTemporaria: false,
};

/** Os nomes que o contrato aceita para a porta de liberação, na ordem em que ele os procura. */
export const NOMES_DA_LIBERACAO = [
  "liberarPendenteRevisao",
  "liberarVagaPendenteRevisao",
  "liberarRevisao",
] as const;

export function nomeDaPortaDeLiberacao(prototipo: object): string | null {
  const p = prototipo as unknown as Record<string, unknown>;
  return NOMES_DA_LIBERACAO.find((n) => typeof p[n] === "function") ?? null;
}

// ── 11. OS MUTANTES: A PROVA DE QUE O ACUSADOR ACUSA ───────────────────────────────────────────

/**
 * Nenhum mutante daqui é uma implementação alternativa: todos são o EMITIDO, que é o que o contrato
 * lê. Um contrato que nunca foi visto reprovando alguém é uma opinião, não uma trava.
 */

export interface MutanteDoCatalogo {
  nome: string;
  dano: string;
  desenho: DesenhoDoStatusNovo;
  regraEsperada: string;
}

export const MUTANTES_DO_CATALOGO: MutanteDoCatalogo[] = [
  {
    nome: "1. o status novo pede o papel RASCUNHO (o desenho do mapa de alcance)",
    dano: "a linha NÃO ENTRA no banco: o índice único parcial da migration 0102 admite uma linha por papel de sistema. E se entrasse, a régua indexa papel num Map em que a última linha vence em silêncio, e `codigoDoPapel('RASCUNHO')` passaria a devolver o código errado.",
    desenho: DESENHO_DO_MAPA,
    regraEsperada: "PAPEL_DE_SISTEMA_DISPUTADO",
  },
  {
    nome: "2. o status novo não recebe candidato",
    dano: "a varredura lê as inscrições da vaga e não tem onde pendurá-las: a ingestão para de funcionar em silêncio, e a vaga continua na tela como se estivesse viva.",
    desenho: { ...desenhoDaFila(), recebeCandidato: false },
    regraEsperada: "STATUS_NOVO_NAO_RECEBE_CANDIDATO",
  },
  {
    nome: "3. o status novo encerra a vaga",
    dano: "a vaga espelhada nasce morta, sai das filas e ainda passa a ser lida pelo expurgo com a régua de vaga encerrada.",
    desenho: { ...desenhoDaFila(), encerra: true },
    regraEsperada: "STATUS_NOVO_ENCERRA",
  },
  {
    nome: "4. o status novo entra na trilha de abertura humana",
    dano: "um consultor publica uma vaga digitada direto dentro da fila do espelho, e a fila passa a misturar duas histórias que se resolvem de jeitos diferentes.",
    desenho: { ...desenhoDaFila(), daTrilha: true },
    regraEsperada: "STATUS_NOVO_NA_TRILHA",
  },
  {
    nome: "5. o status novo é destino de movimento manual",
    dano: "qualquer vaga cai na fila de revisão por um clique, sem a régua, e o que a fila afirma deixa de ser verdade.",
    desenho: { ...desenhoDaFila(), movivelManualmente: true },
    regraEsperada: "STATUS_NOVO_E_DESTINO_MANUAL",
  },
  {
    nome: "6. a linha nasce sem rótulo humano",
    dano: "a tela mostra o código cru para o time, e o rótulo é o nome da fila inteira.",
    desenho: { ...desenhoDaFila(), rotulo: CODIGO.pendenteRevisao },
    regraEsperada: "ROTULO_E_O_CODIGO",
  },
  {
    nome: "7. o rótulo sai do title case (§A.24)",
    dano: "a pill de status na Central de Vagas fica fora do padrão de toda tag do sistema.",
    desenho: { ...desenhoDaFila(), rotulo: "Pendente de revisão" },
    regraEsperada: "ROTULO_FORA_DO_TITLE_CASE",
  },
];

export interface MutanteDoEncerramento {
  nome: string;
  dano: string;
  sql: string;
  regraEsperada: string;
}

const ENCERRAMENTO_REFERENCIA = `with fechadas as (
  update vagas v set status = '${CODIGO.fechamento}', encerrada_em = now()
   where v.id_vacancy_pandape is not null
     and v.id_vacancy_pandape <> all(array['1']::text[])
     and exists (select 1 from as_varredura_vagas m where m.vaga_id = v.id)
     and exists (select 1 from as_vaga_status s where s.codigo = v.status and s.encerra = false)
  returning v.id
), marcadas as (
  update as_varredura_vagas m set encerrada_pela_varredura_em = now()
   where m.vaga_id in (select id from fechadas)
) select id from fechadas`;

export const SQL_ENCERRAMENTO_REFERENCIA = ENCERRAMENTO_REFERENCIA;

export const MUTANTES_DO_ENCERRAMENTO: MutanteDoEncerramento[] = [
  {
    nome: "1. o alcance vira lista de códigos (rascunho e aberta)",
    dano: "A TRAVA MAIS CARA DA FRENTE: a vaga da fila de revisão fica FORA do encerramento, `encerrada_em` nunca é carimbado, e a cláusula `or v.encerrada_em is null` do expurgo protege para sempre toda pessoa viva dentro dela, com CPF, e-mail, telefone e nascimento. Nada falha e nenhuma tela acusa.",
    sql: ENCERRAMENTO_REFERENCIA.replace(
      "and exists (select 1 from as_vaga_status s where s.codigo = v.status and s.encerra = false)",
      `and v.status in ('${CODIGO.rascunho}', '${CODIGO.abertura}')`,
    ),
    regraEsperada: "ALCANCE_POR_LISTA_DE_CODIGOS",
  },
  {
    nome: "2. o alcance deixa de ler a propriedade `encerra`",
    dano: "sem a propriedade, todo status criado depois depende de alguém lembrar de acrescentá-lo ao alcance, e ninguém lembra.",
    sql: ENCERRAMENTO_REFERENCIA.replace(
      "and exists (select 1 from as_vaga_status s where s.codigo = v.status and s.encerra = false)",
      "and v.encerrada_em is null",
    ),
    regraEsperada: "ALCANCE_NAO_E_PELA_PROPRIEDADE",
  },
  {
    nome: "3. o alcance passa a decidir por papel",
    dano: "o status da fila é do papel LIVRE, o único que admite linha nova, então ele fica de fora de qualquer enumeração de papéis, e com ele fica de fora toda pessoa viva dentro daquelas vagas.",
    sql: ENCERRAMENTO_REFERENCIA.replace(
      "and s.encerra = false)",
      "and s.encerra = false and s.papel in ('RASCUNHO', 'ABERTURA'))",
    ),
    regraEsperada: "ALCANCE_POR_PAPEL",
  },
  {
    nome: "4. uma segunda CTE passa a escrever em `vagas`",
    dano: "É O ERRO QUE A PRÓPRIA FRENTE PODE COMETER, porque ela acrescenta escrita: com duas, o contrato acha a escrita pela tabela e passa a cair sobre o bloco errado, ficando verde com o furo aberto.",
    sql: ENCERRAMENTO_REFERENCIA.replace(
      "), marcadas as (",
      `), tambem as (
  update vagas v2 set atualizado_em = now() where v2.id is not null
), marcadas as (`,
    ),
    regraEsperada: "DUAS_ESCRITAS_EM_VAGAS",
  },
];

export interface MutanteDaReabertura {
  nome: string;
  dano: string;
  emitido: EmitidoDaVaga;
  statusAntes: string | null;
  regraEsperada: string;
}

const BUSCA_COM_GUARDADO =
  "select v.id, v.status, m.status_antes_do_encerramento as status_antes, (m.vaga_id is not null) as da_varredura from vagas v left join as_varredura_vagas m on m.vaga_id = v.id where v.id_vacancy_pandape = '9101' limit 1";
const BUSCA_PELO_CLIENTE =
  "select v.id, v.status, v.cod_cliente, (m.vaga_id is not null) as da_varredura from vagas v left join as_varredura_vagas m on m.vaga_id = v.id where v.id_vacancy_pandape = '9101' limit 1";

/** A trilha que o movimento correto grava, na MESMA instrução, com autor nulo. */
function trilhaDe(de: string, para: string, autor = "null", observacao?: string): string {
  const frase =
    observacao ?? `a varredura do pandape reabriu a vaga: de ${de} para ${para}.`;
  return ` insert into as_vaga_status_eventos (vaga_id, de, para, por_id, observacao) select id, '${de}', '${para}', ${autor}, '${frase}' from movida returning vaga_id as id`;
}

function updateQueReabrePara(codigo: string, trilha = ""): string {
  return `with movida as (update vagas set codigo = 'x', nome_divulgacao = 'y', status = '${codigo}', encerrada_em = null, atualizado_em = now() where id = 'uuid'::uuid and true returning id)${trilha}`;
}

/** O movimento CERTO: retoma o estado guardado e grava a trilha, com autor nulo. */
export function reaberturaCorreta(guardado: string): EmitidoDaVaga {
  return lerEmitidoDaVaga([
    BUSCA_COM_GUARDADO,
    updateQueReabrePara(guardado, trilhaDe(CODIGO.fechamento, guardado)),
  ]);
}

export const MUTANTES_DA_REABERTURA: MutanteDaReabertura[] = [
  {
    nome: "1. a reabertura decide pelo cliente (o código vetado)",
    dano: "a vaga que o Master devolveu para a fila SEM trocar o cliente volta PUBLICADA na primeira volta do ATS, com o mesmo vínculo que ele pôs em dúvida. O ATS desfaz a decisão explícita de uma pessoa, sozinho e em silêncio.",
    emitido: lerEmitidoDaVaga([
      BUSCA_PELO_CLIENTE,
      updateQueReabrePara(CODIGO.abertura, trilhaDe(CODIGO.fechamento, CODIGO.abertura)),
    ]),
    statusAntes: CODIGO.pendenteRevisao,
    regraEsperada: "REABERTURA_NAO_RETOMA_O_ESTADO",
  },
  {
    nome: "2. a consulta do destino nem lê o estado guardado",
    dano: "sem a memória de onde a varredura fechou a vaga, o destino volta a ser deduzido de um campo, e toda dedução erra no caso do Master.",
    emitido: lerEmitidoDaVaga([
      BUSCA_PELO_CLIENTE,
      updateQueReabrePara(CODIGO.pendenteRevisao, trilhaDe(CODIGO.fechamento, CODIGO.pendenteRevisao)),
    ]),
    statusAntes: CODIGO.pendenteRevisao,
    regraEsperada: "REABERTURA_NAO_LE_O_ESTADO_GUARDADO",
  },
  {
    nome: "3. a consulta continua carregando `cod_cliente` para decidir",
    dano: "ter o cliente à mão nesta escrita é o que permite a decisão errada voltar por uma linha de código, meses depois, sem nada mais mudar.",
    emitido: lerEmitidoDaVaga([
      BUSCA_PELO_CLIENTE + " -- status_antes_do_encerramento",
      updateQueReabrePara(CODIGO.pendenteRevisao, trilhaDe(CODIGO.fechamento, CODIGO.pendenteRevisao)),
    ]),
    statusAntes: CODIGO.pendenteRevisao,
    regraEsperada: "REABERTURA_DECIDE_PELO_CLIENTE",
  },
  {
    nome: "4. a reabertura joga TODA vaga na fila, inclusive a que estava publicada",
    dano: "o trabalho de quem vinculou o cliente e liberou a vaga é desfeito a cada volta do ATS, e a fila nunca esvazia.",
    emitido: lerEmitidoDaVaga([
      BUSCA_COM_GUARDADO,
      updateQueReabrePara(CODIGO.pendenteRevisao, trilhaDe(CODIGO.fechamento, CODIGO.pendenteRevisao)),
    ]),
    statusAntes: CODIGO.abertura,
    regraEsperada: "REABERTURA_NAO_RETOMA_O_ESTADO",
  },
  {
    nome: "5. sem memória do estado anterior, a vaga vai para a abertura",
    dano: "o fail-closed invertido: a vaga sem memória nenhuma é publicada sem passar por ninguém, que é exatamente o que a fila existe para impedir.",
    emitido: lerEmitidoDaVaga([
      BUSCA_COM_GUARDADO,
      updateQueReabrePara(CODIGO.abertura, trilhaDe(CODIGO.fechamento, CODIGO.abertura)),
    ]),
    statusAntes: null,
    regraEsperada: "REABERTURA_SEM_MEMORIA_FORA_DA_FILA",
  },
  {
    nome: "6. o destino é um literal digitado à mão",
    dano: "no dia em que o diretor renomear o status, a FK RESTRICT derruba a varredura inteira, no meio de 137 mil inscrições, onde o chamador engole o erro e soma um contador.",
    emitido: lerEmitidoDaVaga([BUSCA_COM_GUARDADO, updateQueReabrePara("ABERTA")]),
    statusAntes: CODIGO.abertura,
    regraEsperada: "REABERTURA_POR_LITERAL",
  },
  {
    nome: "7. a correção vira imobilidade e o espelho nunca reabre",
    dano: "o avesso do defeito: `encerrada_em` fica carimbado numa vaga VIVA, e o relógio de retenção de quem está dentro dela segue correndo.",
    emitido: lerEmitidoDaVaga([BUSCA_COM_GUARDADO]),
    statusAntes: CODIGO.pendenteRevisao,
    regraEsperada: "REABERTURA_NAO_ACONTECE",
  },
  {
    nome: "8. o movimento é mudo: troca o status e não grava evento nenhum",
    dano: "o ATS move a vaga e a linha do tempo não registra nada. Movimento automático fica indistinguível de movimento humano, e ninguém sabe quem desfez o quê.",
    emitido: lerEmitidoDaVaga([BUSCA_COM_GUARDADO, updateQueReabrePara(CODIGO.pendenteRevisao)]),
    statusAntes: CODIGO.pendenteRevisao,
    regraEsperada: "REABERTURA_MUDA",
  },
  {
    nome: "9. a trilha inventa um autor para o movimento da varredura",
    dano: "a trilha passa a afirmar que uma PESSOA moveu a vaga, e usuário de sistema com poder de escrita fora do RBAC já está vetado nesta frente.",
    emitido: lerEmitidoDaVaga([
      BUSCA_COM_GUARDADO,
      updateQueReabrePara(
        CODIGO.pendenteRevisao,
        trilhaDe(CODIGO.fechamento, CODIGO.pendenteRevisao, "'usuario-de-sistema'::uuid"),
      ),
    ]),
    statusAntes: CODIGO.pendenteRevisao,
    regraEsperada: "REABERTURA_COM_AUTOR_INVENTADO",
  },
  {
    nome: "10. a narrativa carrega o título que veio do ATS",
    dano: "§A.6: título e descrição do ATS são digitados lá fora e já chegaram com nome de gente dentro. A trilha é permanente e consultável.",
    emitido: lerEmitidoDaVaga([
      BUSCA_COM_GUARDADO,
      updateQueReabrePara(
        CODIGO.pendenteRevisao,
        trilhaDe(
          CODIGO.fechamento,
          CODIGO.pendenteRevisao,
          "null",
          `reaberta a vaga ${TEXTO_DO_ATS[1]}: de ${CODIGO.fechamento} para ${CODIGO.pendenteRevisao}.`,
        ),
      ),
    ]),
    statusAntes: CODIGO.pendenteRevisao,
    regraEsperada: "NARRATIVA_COM_TEXTO_DO_ATS",
  },
];

/** Os dois sentidos que o contrato tem de APROVAR: quem estava na fila e quem estava publicado. */
export const REABERTURAS_CORRETAS: { nome: string; guardado: string }[] = [
  { nome: "a vaga que estava na FILA volta para a fila", guardado: CODIGO.pendenteRevisao },
  { nome: "a vaga que estava PUBLICADA volta para a abertura", guardado: CODIGO.abertura },
];

export interface MutanteDaLiberacao {
  nome: string;
  dano: string;
  emitido: EmitidoDaLiberacao;
  cenario: CenarioDaLiberacao;
  regraEsperada: string;
}

const escreveu = (status: string): EscritaObservada[] => [
  { verbo: "update", tabela: "vagas", valores: { status, atualizadoEm: new Date(0) } },
];

export const MUTANTES_DA_LIBERACAO: MutanteDaLiberacao[] = [
  {
    nome: "1. a liberação aceita `cod_cliente` nulo",
    dano: "a vaga sai da fila sem o dado que a pôs lá, e depois disso ninguém mais sabe que faltava. Guarda só de tela é contornada por qualquer chamada direta à rota.",
    emitido: { existe: true, recusou: false, escritas: escreveu(CODIGO.abertura), papeisPedidos: ["ABERTURA"] },
    cenario: { temCliente: false, naFila: true },
    regraEsperada: "LIBERA_SEM_CLIENTE",
  },
  {
    nome: "2. a recusa acontece depois de escrever",
    dano: "recusa que já gravou não é recusa: a vaga fica com o status novo e a mensagem de erro diz o contrário.",
    emitido: { existe: true, recusou: true, escritas: escreveu(CODIGO.abertura), papeisPedidos: ["ABERTURA"] },
    cenario: { temCliente: false, naFila: true },
    regraEsperada: "LIBERACAO_ESCREVEU_AO_RECUSAR",
  },
  {
    nome: "3. o destino é o literal 'ABERTA' em vez do papel do catálogo",
    dano: "acertar o código sem perguntar é acertar por coincidência, e a coincidência acaba na primeira renomeação, virando FK RESTRICT no meio da operação.",
    emitido: { existe: true, recusou: false, escritas: escreveu("ABERTA"), papeisPedidos: [] },
    cenario: { temCliente: true, naFila: true },
    regraEsperada: "LIBERACAO_SEM_DESTINO",
  },
  {
    nome: "4. o destino é um status qualquer do diretor, resolvido sem papel",
    dano: "a porta vira caminho livre para qualquer status, inclusive um que não recebe candidato, e a vaga liberada some da fila sem ter sido aberta.",
    emitido: { existe: true, recusou: false, escritas: escreveu(CODIGO.standBy), papeisPedidos: [] },
    cenario: { temCliente: true, naFila: true },
    regraEsperada: "DESTINO_NAO_E_O_PAPEL_DE_ABERTURA",
  },
  {
    nome: "5. o destino certo, mas sem perguntar ao catálogo",
    dano: "o mesmo dano do literal, só que disfarçado: o valor coincide hoje e deixa de coincidir na renomeação.",
    emitido: { existe: true, recusou: false, escritas: escreveu(CODIGO.abertura), papeisPedidos: [] },
    cenario: { temCliente: true, naFila: true },
    regraEsperada: "DESTINO_NAO_FOI_PERGUNTADO_AO_CATALOGO",
  },
  {
    nome: "6. a liberação move vaga que não está na fila",
    dano: "ela vira uma SEGUNDA porta para o papel ABERTURA, sem a régua de obrigatórios da trilha, que é o buraco que o mover status já teve de fechar.",
    emitido: { existe: true, recusou: false, escritas: escreveu(CODIGO.abertura), papeisPedidos: ["ABERTURA"] },
    cenario: { temCliente: true, naFila: false },
    regraEsperada: "LIBERA_VAGA_FORA_DA_FILA",
  },
  {
    nome: "7. a trava existe, mas só na tela",
    dano: "a rota continua aberta para quem chama direto, e a casa já registrou esse erro antes.",
    emitido: { existe: false, recusou: false, escritas: [], papeisPedidos: [] },
    cenario: { temCliente: true, naFila: true },
    regraEsperada: "LIBERACAO_NAO_EXISTE",
  },
  {
    nome: "8. a trava vira imobilidade e nada libera",
    dano: "a fila que não esvazia é tão inútil quanto a que não existe.",
    emitido: { existe: true, recusou: true, escritas: [], papeisPedidos: ["ABERTURA"] },
    cenario: { temCliente: true, naFila: true },
    regraEsperada: "LIBERACAO_COM_CLIENTE_NAO_ACONTECE",
  },
];

export interface MutanteDoNascimento {
  nome: string;
  dano: string;
  consultas: string[];
  temClienteResolvido: boolean;
  regraEsperada: string;
}

const insertDaVaga = (status: string, codCliente: string) =>
  `insert into vagas (id_vacancy_pandape, codigo, nome_divulgacao, cidade_id, posicoes_oficiais, cod_cliente, cargo_id, status) values ('9101', 'x', 'y', null, 2, ${codCliente}, null, '${status}') returning id`;

export const MUTANTES_DO_NASCIMENTO: MutanteDoNascimento[] = [
  {
    nome: "1. a vaga sem cliente nasce no rascunho comum (o código de hoje)",
    dano: "ela fica indistinguível da vaga que um consultor começou a digitar: não entra na fila, ninguém vincula o cliente, e ~600 vagas ficam paradas sem que nenhuma tela acuse.",
    consultas: [insertDaVaga(CODIGO.rascunho, "null")],
    temClienteResolvido: false,
    regraEsperada: "NASCE_FORA_DA_FILA_DE_REVISAO",
  },
  {
    nome: "2. o nascimento inventa um `cod_cliente`",
    dano: "§A.5 é explícita: adiar em vez de inventar. Cliente inventado contamina régua, contagem por cliente e a própria fila, que passa a não ter o que revisar.",
    consultas: [insertDaVaga(CODIGO.pendenteRevisao, "'CLI-INVENTADO'")],
    temClienteResolvido: false,
    regraEsperada: "CLIENTE_INVENTADO_NO_NASCIMENTO",
  },
  {
    nome: "3. a vaga COM cliente resolvido também nasce na fila",
    dano: "a fila é a lista do que falta vincular: enchê-la de vaga já vinculada faz o time trabalhar de graça e esconde as que precisam de gente.",
    consultas: [insertDaVaga(CODIGO.pendenteRevisao, "'CLI-SINTETICO'")],
    temClienteResolvido: true,
    regraEsperada: "PENDENTE_COM_CLIENTE",
  },
  {
    nome: "4. o status de nascimento é um literal fora do catálogo",
    dano: "a FK RESTRICT derruba a varredura no meio de 137 mil inscrições, onde o chamador engole o erro e soma um contador.",
    consultas: [insertDaVaga("PENDENTE-DE-REVISAO", "null")],
    temClienteResolvido: false,
    regraEsperada: "STATUS_DE_NASCIMENTO_FORA_DO_CATALOGO",
  },
];

// ── 12. RODAR O SERVIÇO DE VAGAS REAL ──────────────────────────────────────────────────────────

/**
 * RECUSAR É LANÇAR ANTES DE ESCREVER, e a distinção não é detalhe.
 *
 * O caminho de SUCESSO termina recarregando a vaga por uma listagem que o dublê não serve, então ele
 * também termina em exceção. Tratar as duas como "recusou" faria o cenário do movimento legítimo
 * acusar um defeito que não existe, e o cenário da recusa aprovar um que existe. O critério é o
 * EFEITO: lançou e não gravou em `vagas` é recusa; lançou depois de gravar não é.
 */
function houveRecusa(lancou: boolean, escritas: EscritaObservada[]): boolean {
  return lancou && !escritas.some((x) => x.tabela === "vagas" && x.verbo === "update");
}

export interface ServicoDeVagas {
  moverStatus(id: string, dto: { status: string }, user: AuthUser): Promise<unknown>;
}

export type CriarServicoDeVagas = (db: never, catalogo: never) => ServicoDeVagas;

/** O MOVER STATUS, com a vaga que o cenário descrever. */
export async function rodarMoverStatus(
  criar: CriarServicoDeVagas,
  statusDaVaga: string,
  destino: string,
  catalogo?: CatalogoDaRevisao,
): Promise<EmitidoDoMover> {
  const cat = catalogo ?? catalogoDaRevisao();
  const banco = bancoDeVagasFingido({ id: ID_DA_VAGA, status: statusDaVaga, cod_cliente: null });
  let lancou = false;
  try {
    await criar(banco.db, cat.servico).moverStatus(ID_DA_VAGA, { status: destino }, USUARIO_SINTETICO);
  } catch {
    lancou = true;
  }
  return { recusou: houveRecusa(lancou, banco.escritas), escritas: banco.escritas };
}

/** A LIBERAÇÃO, pela porta que o contrato procura. Sem porta, o emitido diz que ela não existe. */
export async function rodarLiberacao(
  prototipo: object,
  criar: CriarServicoDeVagas,
  cenario: CenarioDaLiberacao,
  catalogo?: CatalogoDaRevisao,
): Promise<EmitidoDaLiberacao> {
  const cat = catalogo ?? catalogoDaRevisao();
  const nome = nomeDaPortaDeLiberacao(prototipo);
  if (!nome) return { existe: false, recusou: false, escritas: [], papeisPedidos: [] };

  const banco = bancoDeVagasFingido({
    id: ID_DA_VAGA,
    status: cenario.naFila ? CODIGO.pendenteRevisao : CODIGO.abertura,
    cod_cliente: cenario.temCliente ? "CLI-SINTETICO" : null,
    codCliente: cenario.temCliente ? "CLI-SINTETICO" : null,
    /*
     * OS ONZE OBRIGATÓRIOS JÁ GRAVADOS, que é o estado de quem passou pela revisão e PODE sair da
     * fila. A liberação passou a cobrar a régua da abertura antes de mover a vaga (a vaga do
     * Pandapé chegava incompleta e saía incompleta), então uma vaga vazia aqui é recusada por um
     * motivo que este bloco não está medindo: o que ele mede é o CLIENTE e o DESTINO.
     */
    codigo: "PS-SINTETICO-1",
    nomeDivulgacao: "Vaga sintética já revisada",
    cargoId: "00000000-0000-4000-8000-0000000000aa",
    posicoesOficiais: 1,
    posicoesBanco: 0,
    natureza: "EFETIVA",
    sazonalidade: "OPERACAO_PADRAO",
    linhaServicoId: 1,
    dataAbertura: "2026-09-01",
    dataLimite: "2026-09-30",
  });
  const servico = criar(banco.db, cat.servico) as unknown as Record<
    string,
    (...a: unknown[]) => Promise<unknown>
  >;
  let lancou = false;
  try {
    await servico[nome](ID_DA_VAGA, USUARIO_SINTETICO);
  } catch {
    lancou = true;
  }
  return {
    existe: true,
    recusou: houveRecusa(lancou, banco.escritas),
    escritas: banco.escritas,
    papeisPedidos: cat.papeisPedidos,
  };
}

export interface MutanteDoMover {
  nome: string;
  dano: string;
  emitido: EmitidoDoMover;
  naFila: boolean;
  regraEsperada: string;
}

const MOVEU: EscritaObservada[] = [
  { verbo: "update", tabela: "vagas", valores: { status: CODIGO.abertura } },
];

export const MUTANTES_DO_MOVER: MutanteDoMover[] = [
  {
    nome: "1. a guarda só cobre o papel RASCUNHO (o código de hoje)",
    dano: "a vaga sem cliente vira ABERTA por uma rota HTTP, pulando a fila inteira e a régua de obrigatórios. A trava do liberar continua lá, verdadeira e inútil.",
    emitido: { recusou: false, escritas: MOVEU },
    naFila: true,
    regraEsperada: "SEGUNDA_PORTA_DO_MOVER_STATUS",
  },
  {
    nome: "2. a guarda recusa DEPOIS de escrever",
    dano: "a vaga já saiu da fila e a mensagem de erro diz o contrário: o pior dos dois mundos para quem opera.",
    emitido: { recusou: true, escritas: MOVEU },
    naFila: true,
    regraEsperada: "SEGUNDA_PORTA_DO_MOVER_STATUS",
  },
  {
    nome: "3. o conserto fecha o movimento legítimo junto",
    dano: "a vaga comum deixa de ser movida: o conserto vira outro defeito, do mesmo tamanho e mais difícil de ver, porque ninguém procura defeito no que acabou de ser corrigido.",
    emitido: { recusou: true, escritas: [] },
    naFila: false,
    regraEsperada: "MOVER_STATUS_IMOBILIZADO",
  },
];
