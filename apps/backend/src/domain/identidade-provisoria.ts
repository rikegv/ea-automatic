import { createHash } from "node:crypto";
import {
  PREFIXO_CPF_PROVISORIO,
  ehCpfProvisorio,
  isValidCpf,
  normalizeCpf,
  type FarolGlobal,
} from "@ea/shared-types";

/**
 * FONTE ÚNICA do detector e do prefixo: o `shared-types`. A TELA precisa reconhecer o marcador para
 * mostrar "CPF Pendente", então o detector e o prefixo moram no pacote compartilhado; aqui eles são
 * só REEXPORTADOS, nunca redefinidos, para não existirem duas verdades sobre o que é um provisório.
 */
export { ehCpfProvisorio };

/**
 * IDENTIDADE PROVISÓRIA para declínio sem CPF (decisão do diretor, Opção 1a).
 *
 * O CPF é a chave de identidade do candidato (§A.3), e por isso linha sem CPF válido não vira
 * admissão. Isso deixou de fora 48 declínios da base de 03-08-2026, que o diretor quer registrados
 * como HISTÓRICO: declínio não trabalha na esteira, não conta em KPI e não gera fila (§A.16), então
 * o valor é ter o registro, não trabalhar a admissão.
 *
 * O identificador é `PROV` + 7 caracteres em base 36, 11 no total, que é exatamente a largura de
 * `candidatos.cpf`. NÃO precisou alargar coluna nenhuma.
 *
 * POR QUE ELE É SEGURO, e isto não é opinião, é mecânica que já existe no sistema:
 *  - `isValidCpf` devolve false para ele (tem letra, nunca tem 11 dígitos);
 *  - os TRÊS pontos que formatam ou exportam CPF (a exibição e o CSV da Esteira, o mascaramento do
 *    Clicksign e o modal do frontend) fazem a MESMA verificação, "se não tem 11 dígitos, devolve cru
 *    ou omite". Nenhum deles precisou ser alterado;
 *  - hoje 100% dos candidatos têm exatamente 11 dígitos, então `cpf !~ '^[0-9]{11}$'` isola os
 *    provisórios para sempre.
 *
 * DETERMINÍSTICO de propósito. A chave é nome + cliente + data de admissão, então:
 *  - rodar a carga duas vezes deriva o MESMO identificador e a dedup normal (cpf + cliente + cargo +
 *    data) reconhece o registro, em vez de criar um segundo;
 *  - quando o CPF real aparecer numa carga futura, ela deriva o mesmo provisório a partir dos mesmos
 *    três campos e ACHA o registro por chave primária, para reconciliar em vez de duplicar.
 */
export const PREFIXO_PROVISORIO = PREFIXO_CPF_PROVISORIO;

/** Quantos caracteres de hash vão depois do prefixo. 4 + 7 = 11 = largura de `candidatos.cpf`. */
const TAMANHO_HASH = 7;
const ESPACO = 36n ** BigInt(TAMANHO_HASH);

/**
 * Faróis que PODEM receber identidade provisória: só os terminais de encerramento.
 *
 * Esta é a trava que mantém o provisório fora de fila, KPI e envelope de assinatura, e ela funciona
 * por consequência, não por remendo: `DECLINOU` e `RESCISAO` já são excluídos por farol na Esteira
 * (filas e KPIs), no KPI do Gerenciador e no gate F12 do kit. Um registro que só pode nascer nesses
 * dois faróis herda todas essas exclusões de graça.
 */
export const FAROL_COM_IDENTIDADE_PROVISORIA: ReadonlySet<FarolGlobal> = new Set<FarolGlobal>([
  "DECLINOU",
  "RESCISAO",
]);

/** Nome normalizado para a chave: caixa alta, sem acento, espaços colapsados. */
function normalizarNome(nome: string): string {
  return (nome ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/**
 * Deriva o identificador provisório de forma determinística.
 *
 * Mesma tripla de entrada devolve sempre a mesma saída, e é isso que sustenta as duas garantias:
 * não duplicar ao repetir a carga e conseguir reconciliar depois.
 */
export function derivarCpfProvisorio(
  nome: string,
  codCliente: string,
  dataAdmissao?: string | null,
): string {
  const chave = `${normalizarNome(nome)}|${(codCliente ?? "").trim()}|${dataAdmissao ?? ""}`;
  const hex = createHash("sha256").update(chave, "utf8").digest("hex").slice(0, 16);
  const sufixo = (BigInt(`0x${hex}`) % ESPACO).toString(36).toUpperCase().padStart(TAMANHO_HASH, "0");
  return `${PREFIXO_PROVISORIO}${sufixo}`;
}

/**
 * DERIVAÇÃO POR CANDIDATO, para o ENVIO VIVO sem CPF (destravamento da ponte A&S → Esteira).
 *
 * POR QUE NÃO REUSAR `derivarCpfProvisorio` (nome + cliente + data): no envio vivo a data de admissão
 * é NULA, então a chave da carga degenera para (nome, cliente), e MEDIDO em produção há 18 pares
 * (nome, cliente) com 2+ candidatos A&S DISTINTOS sem CPF. Reusar aquela derivação FUNDIRIA essas
 * pessoas numa linha só de `candidatos` e quebraria `uq_admissao_cpf_vaga_viva` quando fossem para a
 * mesma vaga. A unicidade POR CANDIDATO (`as_candidatos.id`) é o ponto, e por isso a entrada é o id.
 *
 * DETERMINÍSTICO por candidato: reenviar o mesmo candidato deriva o MESMO marcador, e a idempotência
 * da ponte (unique parcial + reuso da admissão viva) reconhece em vez de duplicar.
 *
 * O `sal` SÓ ENTRA NA COLISÃO: o espaço é 36^7 = 78 bilhões, então colisão entre uuids é desprezível,
 * mas quando dois candidatos distintos derivarem o MESMO marcador o chamador transacional re-deriva
 * com sal incremental até achar um livre, para a identidade de um nunca contaminar a do outro. Com
 * `sal = 0` a saída é a base, e é por isso que o caminho normal nunca paga o custo do sal.
 */
export function derivarCpfProvisorioPorCandidato(candidatoId: string, sal = 0): string {
  const chave = sal > 0 ? `${candidatoId}|${sal}` : candidatoId;
  const hex = createHash("sha256").update(chave, "utf8").digest("hex").slice(0, 16);
  const sufixo = (BigInt(`0x${hex}`) % ESPACO).toString(36).toUpperCase().padStart(TAMANHO_HASH, "0");
  return `${PREFIXO_PROVISORIO}${sufixo}`;
}

/**
 * Porta única de entrada do caminho provisório. O runner só pode criar identidade provisória quando
 * ESTA função disser sim, e ela só diz sim para farol de encerramento e CPF de fato inaproveitável.
 */
export function podeReceberIdentidadeProvisoria(
  farol: FarolGlobal,
  cpfBruto: string | null | undefined,
): boolean {
  if (!FAROL_COM_IDENTIDADE_PROVISORIA.has(farol)) return false;
  return !isValidCpf(normalizeCpf(cpfBruto ?? ""));
}
