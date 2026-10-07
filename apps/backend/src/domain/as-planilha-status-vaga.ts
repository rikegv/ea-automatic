/**
 * ─ A RÉGUA DO STATUS DA VAGA NA PLANILHA VIVA DO TIME (F2/F3, 06/10/2026) ──────────────────────
 *
 * ┌─ O QUE ESTA RÉGUA DECIDE, EM UMA FRASE ─────────────────────────────────────────────────────┐
 * │ A varredura do Pandapé só ESPELHA/CRIA, e a fila de revisão só MOSTRA, a vaga que a planilha  │
 * │ "Geral 2026" marca como ABERTO ou ENTREGUE. FECHADO, CANCELADO, qualquer outro status, ou     │
 * │ ausência da planilha: NÃO entra. É régua COMPARTILHADA entre o gate de ESCRITA (F2, no ciclo  │
 * │ da ingestão) e o filtro de LEITURA (F3, na fila de revisão), e por isso ela mora aqui, pura.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O TOKEN É CANÔNICO E FECHADO, E NÃO O TEXTO CRU DA PLANILHA ────────────────────────┐
 * │ O status é digitado por gente, com acento e caixa irregulares ("Aberto", "ENTREGUE",         │
 * │ "entregue "). `normalizarStatusDaPlanilha` reduz essa variação a um token FECHADO, e é ESSE   │
 * │ token que a sincronização grava em `as_depara_cliente_vaga.status_planilha`. Assim a          │
 * │ normalização mora em UM lugar (quem escreve), o gate e o filtro perguntam o mesmo conjunto     │
 * │ `STATUS_DE_PLANILHA_QUE_ENTRAM`, e o SQL do filtro usa um `IN` derivado da mesma lista: régua  │
 * │ compartilhada, zero duplicação. Status desconhecido vira `OUTRO` (fail-closed: não entra), em  │
 * │ vez de ser adivinhado.                                                                         │
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
 * OS STATUS QUE DEIXAM A VAGA ENTRAR, em lista FECHADA e EXPORTADA.
 *
 * ELA É A FONTE ÚNICA da decisão "entra?": `vagaDaPlanilhaEntra` pergunta a ela, e o SQL do filtro
 * da fila de revisão (F3) monta o `IN (...)` a partir dela. Dois lugares decidindo "quais entram"
 * com listas escritas à mão divergiriam na primeira correção de um só, que é o defeito que esta
 * constante exportada existe para impedir.
 */
export const STATUS_DE_PLANILHA_QUE_ENTRAM: readonly StatusDePlanilhaCanonico[] = [
  "ABERTO",
  "ENTREGUE",
];

/**
 * O TEXTO CRU DA PLANILHA VIRANDO TOKEN CANÔNICO, tolerando acento, caixa e variação de gênero.
 *
 * `null`/vazio devolve `null` (ausência de status), que é diferente de `OUTRO` (status presente e
 * desconhecido): as duas não entram, mas quem escreve a coluna distingue "a planilha não disse" de
 * "a planilha disse algo que não reconheço", e o fail-closed é o mesmo nos dois.
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
 * A VAGA ENTRA? Pergunta à lista FECHADA, depois de normalizar.
 *
 * Aceita texto CRU da planilha OU o token já canônico (a normalização é idempotente sobre o token),
 * então o gate (que lê o token gravado) e o teste puro (que passa "Aberto") usam a MESMA função.
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
 * régua é fail-closed: se qualquer linha disser um status que NÃO entra, a vaga NÃO entra (prefere
 * CANCELADO a FECHADO a OUTRO ao reportar). Só quando TODAS as linhas conhecidas entram é que a vaga
 * entra, e aí o token reportado é ENTREGUE se houver, senão ABERTO. `null` quando nenhuma linha tem
 * status legível.
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
