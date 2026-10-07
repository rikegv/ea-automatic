/**
 * ─ A LISTA BRANCA DE COLUNAS DA PLANILHA VIVA DO TIME (§A.6) ───────────────────────────────────
 *
 * A planilha tem 65 COLUNAS. OITO podem atravessar a rede: QUATRO EXIGIDAS (o código da vaga, o
 * cliente, o cargo e o status) e QUATRO OPCIONAIS do pré-preenchimento da vaga em revisão (o tipo de
 * vaga, a célula de atendimento, a data de abertura e o SLA de entrega). Salário, consultor,
 * recrutador, telefone e nome de candidato aprovado NÃO SAEM de lá.
 *
 * ┌─ EXIGIDA x OPCIONAL É DIFERENÇA DE DISPONIBILIDADE, NUNCA DE SUPERFÍCIE (§A.6) ──────────────┐
 * │ As OITO estão na MESMA lista branca, e o que não está nela continua não atravessando. O que    │
 * │ muda é o que acontece quando o RÓTULO falta no cabeçalho:                                      │
 * │  . EXIGIDA ausente: a leitura FALHA (fail-closed), porque devolver "o que achou" é              │
 * │    indistinguível de planilha vazia e faria o de/para concluir que nada casa;                   │
 * │  . OPCIONAL ausente: o campo vira `null` e a leitura SEGUE.                                     │
 * │                                                                                                │
 * │ O MOTIVO É MEDIDO, e é o pior dano possível desta frente: o espelho que esta leitura alimenta   │
 * │ (`as_depara_cliente_vaga.status_planilha`) é o GATE DE ESCRITA da varredura do Pandapé e o       │
 * │ FILTRO da fila de revisão. Exigir uma coluna ACESSÓRIA faria um rótulo renomeado numa planilha  │
 * │ que o time edita à mão derrubar a leitura inteira, congelar o espelho e APAGAR VAGA REAL DA      │
 * │ TELA. Pré-preenchimento é enriquecimento; ele não pode ter poder de derrubar a leitura.          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LISTA BRANCA, E NUNCA LISTA NEGRA, E O MODO DE FALHA É POR OMISSÃO ─────────────────────────┐
 * │ A planilha é mantida pelo time, que acrescenta coluna quando precisa, e nenhuma lista negra    │
 * │ escrita hoje conhece a coluna de amanhã. No dia em que alguém criar "PRETENSÃO SALARIAL" ou    │
 * │ "CONTATO DO CANDIDATO", a lista negra DEIXA PASSAR, e o vazamento é silencioso: nada falha, o  │
 * │ dado só começa a aparecer do outro lado da rede e, de lá, em log de erro, que é permanente e   │
 * │ está fora do alcance de qualquer rotina de expurgo.                                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A PROJEÇÃO ACONTECE DUAS VEZES, E ISSO NÃO É REDUNDÂNCIA, É PROFUNDIDADE ───────────────────┐
 * │ `domain/pandape-varredura-projecao.ts` já carrega a doutrina por escrito para a entrada do     │
 * │ Pandapé, e a razão é mais concreta aqui: a primeira projeção é PYTHON, em outro deploy, com     │
 * │ outro ciclo de release. Um dia ele sobe com uma coluna a mais (por engano, por depuração, por   │
 * │ "o time pediu o consultor na tela") e o backend, confiando, grava e loga o que recebeu. Quem    │
 * │ recebe NÃO CONFIA em quem manda, mesmo sendo a mesma casa.                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CABEÇALHO É A ÚNICA ÂNCORA, E NUNCA A POSIÇÃO ────────────────────────────────────────────┐
 * │ Ler por posição ("as colunas 3, 7, 12 e 40") é o caminho mais curto num CSV de 65 colunas, e é │
 * │ o furo inteiro: a planilha é editada à mão, e INSERIR UMA COLUNA NO MEIO reordena tudo o que    │
 * │ vem depois. As "4 colunas permitidas" passam a ser salário e nome de candidato, e NADA FALHA.   │
 * │                                                                                                │
 * │ CABEÇALHO ESPERADO AUSENTE FAZ A LEITURA FALHAR, e não devolve "o que achou": devolver 3.532    │
 * │ linhas com o campo nulo faria o de/para concluir que a planilha não cobre nada, e o sintoma     │
 * │ ficaria indistinguível de "a planilha está vazia". Ninguém procura uma coluna renomeada a       │
 * │ partir disso. CÉLULA ausente é outra camada, e vira NULO: é o estado normal de 868 linhas.      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOMÍNIO PURO: sem Nest, sem banco, sem rede, sem relógio. Quem toca a planilha é o `ai-service`;
 * quem decide o que é chave, o que é ambíguo e o que é malformado é `as-depara-cliente-vaga.ts`.
 */

/**
 * OS QUATRO CAMPOS EXIGIDOS, e a cardinalidade é a superfície de auditoria desta frente.
 *
 * A COLUNA A MAIS É O PEDIDO MAIS NATURAL DO MUNDO ("o consultor responsável, para a tela de
 * revisão"), e é por isso que ela tem de passar por aqui, onde alguém muda um número e explica por
 * quê (§A.31: propõe, não entrega em silêncio).
 *
 * EXIGIDO SIGNIFICA FAIL-CLOSED: é SÓ esta lista que `conferirCabecalhoDaPlanilha` cobra.
 */
export const CAMPOS_EXIGIDOS_DA_PLANILHA_DE_CLIENTE = [
  "codigo",
  "cliente",
  "cargo",
  "status",
] as const;

/**
 * OS QUATRO CAMPOS OPCIONAIS DO PRÉ-PREENCHIMENTO (07/10/2026).
 *
 * ELES ENRIQUECEM A TELA, NÃO SUSTENTAM O ESPELHO, e é essa a razão de serem opcionais (ver o
 * cabeçalho do arquivo). §A.6: nenhum é dado pessoal. Tipo de vaga e célula de atendimento são
 * classificação de processo, e as duas datas são prazo; nenhum identifica ninguém. O cargo NÃO entra
 * aqui porque ele JÁ ERA exigido, sob o rótulo "Vaga".
 */
export const CAMPOS_OPCIONAIS_DA_PLANILHA_DE_CLIENTE = [
  "tipoVaga",
  "celulaAtendimento",
  "dataAbertura",
  "slaEntrega",
] as const;

/**
 * A LISTA BRANCA INTEIRA: oito campos, e o que não está aqui não atravessa.
 *
 * É ELA que a projeção percorre, e é por ela que a forma do resultado é ESTÁVEL. A separação em
 * exigidos e opcionais só governa a CONFERÊNCIA DE CABEÇALHO, nunca o que pode passar.
 */
export const CAMPOS_DA_PLANILHA_DE_CLIENTE = [
  ...CAMPOS_EXIGIDOS_DA_PLANILHA_DE_CLIENTE,
  ...CAMPOS_OPCIONAIS_DA_PLANILHA_DE_CLIENTE,
] as const;
export type CampoDaPlanilhaDeCliente = (typeof CAMPOS_DA_PLANILHA_DE_CLIENTE)[number];
export type CampoExigidoDaPlanilhaDeCliente =
  (typeof CAMPOS_EXIGIDOS_DA_PLANILHA_DE_CLIENTE)[number];

/**
 * OS CABEÇALHOS REAIS, medidos na leitura ao vivo de 01/10/2026 e confirmados pelo contrato da rota
 * do `ai-service` (`POST /planilha-viva/ler` devolve `colunas` com estes quatro nomes).
 *
 * ELES SÃO METADADO DE CONFIGURAÇÃO, não conteúdo (§A.46): nome de coluna não é dado de pessoa, e
 * sem eles a conferência de cabeçalho não tem contra o que conferir. O que não entra em arquivo
 * versionado é CÉLULA.
 *
 * "Vaga" É O CABEÇALHO DO CARGO, e isto é medido, não deduzido: o campo do domínio chama `cargo` e
 * a coluna da planilha chama "Vaga". Quem "consertar" isto para `"Cargo"` por coerência quebra o
 * reconhecimento e a leitura passa a FALHAR, que é o comportamento certo para cabeçalho ausente e
 * um defeito caro para um cabeçalho que existe.
 */
export const CABECALHOS_DA_PLANILHA_DE_CLIENTE: Record<CampoDaPlanilhaDeCliente, string> = {
  codigo: "Código da vaga",
  cliente: "Cliente",
  cargo: "Vaga",
  status: "Status",
  /*
   * OS QUATRO OPCIONAIS, e os rótulos são os MESMOS que o `ai-service` procura
   * (`COLUNAS_OPCIONAIS`, em `app/planilha_viva.py`). Divergir aqui não dá erro: o backend
   * simplesmente nunca reconheceria a coluna que o outro lado achou, e o pré-preenchimento ficaria
   * vazio em silêncio. É por isso que os dois lados ficam escritos lado a lado, não deduzidos.
   */
  tipoVaga: "Tipo de Vaga",
  celulaAtendimento: "Célula de Atendimento",
  dataAbertura: "Data de Abertura / Alinhamento",
  slaEntrega: "SLA acordado para entrega",
};

/**
 * A linha, depois da peneira. FORMA ESTÁVEL: as OITO chaves sempre presentes, nulo é ausência.
 *
 * `null` NOS OPCIONAIS JUNTA DUAS COISAS, de propósito: "o cabeçalho não existe na planilha" e "a
 * célula está vazia". Quem distingue as duas é a resposta do `ai-service` (o campo opcional ausente
 * não é DECLARADO em `colunas`), e quem precisa da distinção é a operação, não o de/para: para o
 * pré-preenchimento, as duas são ausência de informação e as duas levam à abstenção.
 */
export interface LinhaProjetadaDaPlanilha {
  codigo: string | null;
  cliente: string | null;
  cargo: string | null;
  status: string | null;
  tipoVaga: string | null;
  celulaAtendimento: string | null;
  dataAbertura: string | null;
  slaEntrega: string | null;
}

/**
 * O NOME DO CAMPO NA REDE, quando ele difere do nome do campo no domínio.
 *
 * A rota do `ai-service` manda `codigoVaga`; o domínio chama o campo de `codigo`. Os DOIS nomes são
 * reconhecidos, e isso NÃO alarga a lista branca: continua sendo um conjunto FECHADO de chaves
 * reconhecidas, e tudo que não está nele é descartado. Aceitar os dois é o que impede a frente de
 * depender de qual lado será renomeado primeiro.
 */
const ALIAS_NA_REDE: Record<CampoDaPlanilhaDeCliente, readonly string[]> = {
  codigo: ["codigoVaga", "codigo"],
  cliente: ["cliente"],
  cargo: ["cargo"],
  status: ["status"],
  /* O contrato acordado com o lado Python: estes QUATRO nomes de campo, exatamente. */
  tipoVaga: ["tipoVaga"],
  celulaAtendimento: ["celulaAtendimento"],
  dataAbertura: ["dataAbertura"],
  slaEntrega: ["slaEntrega"],
};

/**
 * A CHAVE DE RECONHECIMENTO DE UM CABEÇALHO: sem acento, sem caixa, sem espaço sobrando.
 *
 * A TOLERÂNCIA É NO RECONHECIMENTO, NUNCA NA ACEITAÇÃO. O export CSV do Google e a digitação humana
 * produzem cabeçalho com espaço em volta e caixa variável (o espaço à frente foi MEDIDO nos valores,
 * em `' 1587726'`), e um casamento por igualdade crua faria a frente inteira parar de funcionar no
 * dia em que alguém encostasse na primeira linha da planilha, com o sintoma "parou de casar tudo".
 * Alargar a lista é outra coisa, e continua proibido.
 */
function chaveDeCabecalho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Célula em branco é AUSÊNCIA, e ausência é `null`. Duas leituras de "vazio" é divergência futura. */
function celula(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * A LINHA CRUA DO CSV VIRANDO AS QUATRO COLUNAS, e MAIS NADA.
 *
 * O RESULTADO É UM OBJETO NOVO, montado campo a campo. Não existe espalhamento, não existe
 * `delete`, não existe desestruturação com resto: qualquer um dos três levaria as 65 colunas pela
 * rede e passaria verde numa conferência de chaves conhecidas.
 */
export function projetarLinhaDaPlanilha(crua: Record<string, unknown>): LinhaProjetadaDaPlanilha {
  const porChave = new Map<string, unknown>();
  for (const [cabecalho, valor] of Object.entries(crua ?? {})) {
    porChave.set(chaveDeCabecalho(cabecalho), valor);
  }
  const ler = (campo: CampoDaPlanilhaDeCliente) =>
    celula(porChave.get(chaveDeCabecalho(CABECALHOS_DA_PLANILHA_DE_CLIENTE[campo])));
  return {
    codigo: ler("codigo"),
    cliente: ler("cliente"),
    cargo: ler("cargo"),
    status: ler("status"),
    tipoVaga: ler("tipoVaga"),
    celulaAtendimento: ler("celulaAtendimento"),
    dataAbertura: ler("dataAbertura"),
    slaEntrega: ler("slaEntrega"),
  };
}

/**
 * O CABEÇALHO DA PLANILHA, CONFERIDO. Falta um dos quatro EXIGIDOS, a leitura FALHA.
 *
 * ┌─ O QUE SE COBRA SÃO OS EXIGIDOS, E SÓ ELES ──────────────────────────────────────────────────┐
 * │ Os quatro OPCIONAIS do pré-preenchimento NÃO são cobrados aqui, e isso é requisito, não        │
 * │ frouxidão: esta função é fail-closed, e o espelho que ela protege é o gate da varredura e o    │
 * │ filtro da fila. Cobrar uma coluna acessória faria um rótulo renomeado na planilha derrubar a   │
 * │ leitura inteira e VAGA REAL parar de aparecer. O que o opcional ausente produz é campo nulo.    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A MENSAGEM DIZ QUAL COLUNA FALTA e nada mais: o conserto é renomear uma coluna na planilha, e quem
 * vai fazer isso precisa saber qual. §A.6: nome de cabeçalho é metadado; o que não entra na mensagem
 * é CÉLULA, que é por onde o conteúdo vaza de boa-fé ("linha inválida: " + JSON.stringify(linha)).
 *
 * CABEÇALHO VAZIO TAMBÉM FALHA, e não é lido como "planilha sem linhas": a credencial perdendo
 * acesso, o export devolvendo corpo vazio ou uma página de erro dão zero colunas, e tratar isso como
 * planilha sem dado faria a frente parar de propor em silêncio.
 */
export function conferirCabecalhoDaPlanilha(cabecalhos: readonly string[]): void {
  const vistos = new Set((cabecalhos ?? []).map(chaveDeCabecalho));
  const faltando = CAMPOS_EXIGIDOS_DA_PLANILHA_DE_CLIENTE.filter(
    (campo) => !vistos.has(chaveDeCabecalho(CABECALHOS_DA_PLANILHA_DE_CLIENTE[campo])),
  );
  if (faltando.length === 0) return;
  const nomes = faltando.map((campo) => CABECALHOS_DA_PLANILHA_DE_CLIENTE[campo]).join(", ");
  throw new Error(
    `A planilha não tem a(s) coluna(s) esperada(s): ${nomes}. A leitura foi recusada em vez de ` +
      "devolver linha incompleta, porque coluna renomeada é indistinguível de planilha vazia.",
  );
}

/**
 * A SEGUNDA PENEIRA, do lado de quem RECEBE pela rede.
 *
 * NUNCA LANÇA, e isso é desenho: o `ai-service` fora do ar devolve HTML de erro e um proxy devolve
 * texto, e um `Object.keys(payload)` sobre `null` lançaria no meio da sincronização, onde o chamador
 * engole o erro e soma um contador. Payload que não é objeto vira `null`, que o chamador conta.
 *
 * E A RECUSA NÃO CARREGA O CONTEÚDO RECUSADO: não há interpolação de payload em mensagem nenhuma
 * aqui, porque é exatamente assim que 1,9 MB de dado operacional, com salário e nome de candidato
 * dentro, acaba em log permanente.
 */
export function lerLinhaProjetadaDoAiService(payload: unknown): LinhaProjetadaDaPlanilha | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const bruto = payload as Record<string, unknown>;
  const ler = (campo: CampoDaPlanilhaDeCliente) => {
    for (const alias of ALIAS_NA_REDE[campo]) {
      const valor = celula(bruto[alias]);
      if (valor !== null) return valor;
    }
    return null;
  };
  return {
    codigo: ler("codigo"),
    cliente: ler("cliente"),
    cargo: ler("cargo"),
    status: ler("status"),
    tipoVaga: ler("tipoVaga"),
    celulaAtendimento: ler("celulaAtendimento"),
    dataAbertura: ler("dataAbertura"),
    slaEntrega: ler("slaEntrega"),
  };
}
