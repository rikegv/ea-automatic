/**
 * ─ A RÉGUA DO STATUS DA VAGA NA PLANILHA VIVA DO TIME (F2/F3, 06/10/2026) ──────────────────────
 *
 * ┌─ O QUE ESTA RÉGUA DECIDE, EM UMA FRASE (OPÇÃO A, decisão do diretor em 07/10/2026) ─────────┐
 * │ A vaga ENTRA por padrão: a varredura do Pandapé ESPELHA/CRIA, e a fila de revisão MOSTRA,     │
 * │ toda vaga, e a planilha "Geral 2026" só serve para EXCLUIR. Sai apenas o código que a         │
 * │ planilha marca como FECHADO ou CANCELADO. Código AUSENTE da planilha, status nulo ou status    │
 * │ desconhecido (OUTRO): APARECE. É régua COMPARTILHADA entre o gate de ESCRITA (F2, no ciclo    │
 * │ da ingestão) e o filtro de LEITURA (F3, na fila de revisão), e por isso ela mora aqui, pura.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O FUNDAMENTO DO DIRETOR: O RISCO A EVITAR É PERDER VAGA DE VISTA ──────────────────────────┐
 * │ A régua ANTERIOR era a inversa ("só ABERTO/ENTREGUE entram; ausente não entra"), e ela fazia  │
 * │ vaga REAL sumir só porque o time ainda não tinha lançado o código na planilha. Vaga invisível │
 * │ é vaga que ninguém trabalha, e o custo disso é maior que o de ver uma vaga a mais na fila.    │
 * │ Conforme o time preenche o código, a planilha passa a governar: vindo FECHADO, a vaga sai.    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O TOKEN É CANÔNICO E FECHADO, E NÃO O TEXTO CRU DA PLANILHA ────────────────────────┐
 * │ O status é digitado por gente, com acento e caixa irregulares ("Aberto", "ENTREGUE",         │
 * │ "entregue "). `normalizarStatusDaPlanilha` reduz essa variação a um token FECHADO, e é ESSE   │
 * │ token que a sincronização grava em `as_depara_cliente_vaga.status_planilha`. Assim a          │
 * │ normalização mora em UM lugar (quem escreve), o gate e o filtro perguntam o mesmo conjunto     │
 * │ `STATUS_DE_PLANILHA_QUE_SAEM`, e os dois lados decidem pela MESMA função: régua compartilhada, │
 * │ zero duplicação. Status desconhecido vira `OUTRO`, que pela Opção A NÃO exclui: só os dois     │
 * │ tokens de encerramento excluem, e adivinhar o resto é justamente o que fazia vaga sumir.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6: O STATUS NÃO É DADO PESSOAL ──────────────────────────────────────────────────────────┐
 * │ Ao contrário do nome do cliente (razão social de MEI é nome de pessoa natural) e do código da  │
 * │ vaga, o STATUS da vaga é ciclo de vida (ABERTO/FECHADO/...), não identifica ninguém. Gravar o   │
 * │ token canônico na tabela de de/para é minimização respeitada, e por isso o gate pode lê-lo por │
 * │ ESPELHO (frescor ~1h) em vez de reler o Drive ao vivo.                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOMÍNIO PURO: sem Nest, sem banco, sem rede, sem relógio.
 */

/** O vocabulário FECHADO do status da vaga, já canônico. `OUTRO` é a vala de tudo que não casa. */
export type StatusDePlanilhaCanonico = "ABERTO" | "ENTREGUE" | "FECHADO" | "CANCELADO" | "OUTRO";

/**
 * OS STATUS QUE TIRAM A VAGA DE VISTA, em lista FECHADA e EXPORTADA (OPÇÃO A).
 *
 * ELA É A FONTE ÚNICA da decisão "sai?": `vagaDaPlanilhaSai` pergunta a ela, e tanto o gate de
 * escrita (F2) quanto o filtro da fila de revisão (F3) decidem por essa mesma função. Dois lugares
 * decidindo "quem sai" com listas escritas à mão divergiriam na primeira correção de um só, que é o
 * defeito que esta constante exportada existe para impedir.
 *
 * SÓ ENCERRAMENTO EXCLUI: FECHADO (inclui "encerrado") e CANCELADO são os dois tokens que afirmam
 * que aquela vaga terminou. Qualquer outro token, inclusive `OUTRO`, não afirma isso, então não tira
 * a vaga de vista.
 */
export const STATUS_DE_PLANILHA_QUE_SAEM: readonly StatusDePlanilhaCanonico[] = [
  "FECHADO",
  "CANCELADO",
];

/**
 * OS STATUS DE VAGA VIVA NA PLANILHA, em lista FECHADA e EXPORTADA.
 *
 * ELA NÃO É MAIS a régua de visibilidade (quem decide isso é `STATUS_DE_PLANILHA_QUE_SAEM`, pela
 * Opção A). Permanece porque `agregarStatusDaPlanilha` a usa para escolher o token que REPRESENTA
 * uma vaga com várias linhas na planilha, e essa agregação não foi alterada nesta frente.
 */
export const STATUS_DE_PLANILHA_QUE_ENTRAM: readonly StatusDePlanilhaCanonico[] = [
  "ABERTO",
  "ENTREGUE",
];

/**
 * O TEXTO CRU DA PLANILHA VIRANDO TOKEN CANÔNICO, tolerando acento, caixa e variação de gênero.
 *
 * `null`/vazio devolve `null` (ausência de status), que é diferente de `OUTRO` (status presente e
 * desconhecido). Pela Opção A nenhum dos dois exclui a vaga, mas a distinção continua valendo para
 * quem LÊ a coluna: "a planilha não disse" não é "a planilha disse algo que não reconheço".
 */
export function normalizarStatusDaPlanilha(bruto: unknown): StatusDePlanilhaCanonico | null {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (texto === "") return null;
  // O CASAMENTO É POR PREFIXO do radical, para absorver gênero ("aberta") e sufixo ("em aberto" não
  // casa de propósito: "aberto" é o radical, e um "em aberto" raríssimo cairia em OUTRO, fail-closed).
  if (/^abert[oa]/.test(texto)) return "ABERTO";
  if (/^entreg/.test(texto)) return "ENTREGUE";
  if (/^fechad[oa]/.test(texto) || /^encerrad[oa]/.test(texto)) return "FECHADO";
  if (/^cancelad[oa]/.test(texto) || /^cancelament/.test(texto)) return "CANCELADO";
  return "OUTRO";
}

/**
 * A VAGA SAI DE VISTA? A RÉGUA VIGENTE (OPÇÃO A), e a única consultada por F2 e F3.
 *
 * Devolve `true` SOMENTE quando o status normalizado está em `STATUS_DE_PLANILHA_QUE_SAEM`, ou seja,
 * FECHADO ou CANCELADO. Nulo, vazio, `OUTRO`, ABERTO e ENTREGUE devolvem `false`: a vaga não sai,
 * aparece. Ausência de informação nunca esconde vaga, que é o fundamento do diretor.
 *
 * Aceita texto CRU da planilha OU o token já canônico (a normalização é idempotente sobre o token),
 * então o gate (que lê o token gravado) e o teste puro (que passa "Fechado") usam a MESMA função.
 */
export function vagaDaPlanilhaSai(status: unknown): boolean {
  const canonico = normalizarStatusDaPlanilha(status);
  return canonico !== null && STATUS_DE_PLANILHA_QUE_SAEM.includes(canonico);
}

/**
 * A VAGA TEM STATUS DE VAGA VIVA NA PLANILHA? NÃO É MAIS A RÉGUA DE VISIBILIDADE.
 *
 * Mantida porque ela expressa "o status é ABERTO/ENTREGUE", pergunta que continua útil e que é a
 * base da escolha do token em `agregarStatusDaPlanilha`. Quem decide se a vaga aparece é
 * `vagaDaPlanilhaSai`: um "não entra" aqui NÃO significa mais "não aparece".
 */
export function vagaDaPlanilhaEntra(status: unknown): boolean {
  const canonico = normalizarStatusDaPlanilha(status);
  return canonico !== null && STATUS_DE_PLANILHA_QUE_ENTRAM.includes(canonico);
}

/**
 * O STATUS DE UMA VAGA A PARTIR DE VÁRIAS LINHAS DA PLANILHA, fail-closed no conflito.
 *
 * A planilha tem uma linha por CANDIDATO, então a mesma vaga aparece em muitas linhas, e o "Status" é
 * um atributo da VAGA repetido em cada uma. O normal é todas concordarem; quando NÃO concordam, a
 * régua é fail-closed na AGREGAÇÃO: qualquer linha fora de ABERTO/ENTREGUE domina o token reportado
 * (prefere CANCELADO a FECHADO a OUTRO). Só quando TODAS as linhas conhecidas são de vaga viva o
 * token é ENTREGUE se houver, senão ABERTO. `null` quando nenhuma linha tem status legível.
 *
 * ESTA FUNÇÃO NÃO FOI ALTERADA PELA OPÇÃO A, de propósito: ela escolhe o TOKEN, não a visibilidade.
 * Quem decide se a vaga aparece é `vagaDaPlanilhaSai` sobre o token escolhido aqui, então um conflito
 * que agrega em OUTRO deixa a vaga VISÍVEL, e só o que agrega em FECHADO/CANCELADO a tira de vista. O
 * comportamento da agregação no conflito é decisão pendente do diretor, e fica como está.
 */
export function agregarStatusDaPlanilha(brutos: readonly unknown[]): StatusDePlanilhaCanonico | null {
  const canonicos = brutos
    .map(normalizarStatusDaPlanilha)
    .filter((s): s is StatusDePlanilhaCanonico => s !== null);
  if (canonicos.length === 0) return null;
  const todosEntram = canonicos.every((s) => STATUS_DE_PLANILHA_QUE_ENTRAM.includes(s));
  if (todosEntram) return canonicos.includes("ENTREGUE") ? "ENTREGUE" : "ABERTO";
  if (canonicos.includes("CANCELADO")) return "CANCELADO";
  if (canonicos.includes("FECHADO")) return "FECHADO";
  return "OUTRO";
}
