import { AS_VAGA_CAMPOS_DA_ADMISSAO, type AsVagaCampoDaAdmissao } from "@ea/shared-types";
import { excessoDePosicoes } from "./vaga";

/**
 * ─ A EDIÇÃO DA VAGA JÁ LIBERADA: AS REGRAS PURAS (Central de Vagas, 05/10/2026) ──────────────────
 *
 * Três perguntas, sem banco: o que a trilha pode guardar de cada campo (§A.6), o que mudou na
 * fronteira da admissão (decisão 3 do diretor) e o que fazer com as posições (decisões 5 e 6). O
 * mapa e o veto do `seguranca` estão em `docs/MAPA-CRUD-VAGA-LIBERADA.md`.
 */

/**
 * OS CAMPOS QUE GRAVAM VALOR NA TRILHA (`vaga_edicoes.de/para`), e só eles.
 *
 * A LISTA É FECHADA AO CONTRÁRIO (E-1 do veto): só TIPO FECHADO entra, isto é, referência a
 * catálogo, enum, data, número, salário, booleano e lista de catálogo. Tudo que é texto livre, e
 * qualquer campo que não esteja aqui, grava só "alterado". O texto livre fica de fora porque é por
 * ele que nome de gente, CPF, telefone e e-mail entram na vaga.
 *
 * `motivo` NÃO ESTÁ AQUI de propósito: a tela o escolhe do catálogo de motivos, mas o servidor só
 * confere que é texto de até 200 caracteres, então ele é texto livre para quem monta o corpo à mão.
 *
 * Toda entrada é COLUNA de `vagas`. Os dois fatos fechados que não são coluna estão na lista
 * irmã logo abaixo.
 */
export const VAGA_EDICAO_CAMPOS_COM_VALOR = [
  "cargoId",
  "codCliente",
  "cidadeId",
  "regiaoEstado",
  "linhaServicoId",
  "segmentoId",
  "comercialId",
  "consultorId",
  "recruiterId",
  "natureza",
  "vinculo",
  "sazonalidade",
  "escolaridade",
  "genero",
  "modeloTrabalho",
  "tipoSubstituicao",
  "tempoContrato",
  "dataAbertura",
  "dataLimite",
  "dataSolicitacao",
  "dataAlinhamento",
  "dataRealinhamento",
  "posicoesOficiais",
  "posicoesBanco",
  "salarioAbertura",
  "confidencial",
  "divulgarEmpresa",
  "testes",
  "etapasPs",
  "regioes",
  "idiomasExigidos",
] as const;

/**
 * OS DOIS FATOS FECHADOS QUE NÃO SÃO COLUNA DE `vagas`: os benefícios (ids do catálogo e valores,
 * em `vaga_beneficio`) e a CONTAGEM de entrevistas que a troca de cliente apagou.
 */
export const VAGA_EDICAO_FATOS_COM_VALOR = ["beneficios", "entrevistasRemovidas"] as const;

/**
 * TODO CAMPO QUE A EDIÇÃO PODE REGISTRAR NA TRILHA, com ou sem valor. É o CHECK da coluna
 * `vaga_edicoes.campo` (migration 0143), na mesma ordem.
 */
export const VAGA_EDICAO_CAMPOS_DA_TRILHA = [
  "cargoId",
  "nomeDivulgacao",
  "codCliente",
  "natureza",
  "vinculo",
  "sazonalidade",
  "linhaServicoId",
  "cidadeId",
  "segmentoId",
  "comercialId",
  "posicoesOficiais",
  "posicoesBanco",
  "escolaridade",
  "salarioAbertura",
  "dataAbertura",
  "dataLimite",
  "solicitanteNome",
  "solicitanteTelefone",
  "solicitanteEmail",
  "dataSolicitacao",
  "dataAlinhamento",
  "dataRealinhamento",
  "tempoContrato",
  "motivo",
  "justificativaMotivo",
  "tipoSubstituicao",
  "substituidoNome",
  "substituidoCpf",
  "localTrabalho",
  "regiaoEstado",
  "regioes",
  "regioesOutras",
  "horarioEscala",
  "modeloTrabalho",
  "detalheHibrido",
  "confidencial",
  "divulgarEmpresa",
  "faixaEtaria",
  "genero",
  "idiomasExigidos",
  "idiomasOutros",
  "cursosConhecimentos",
  "testes",
  "testesOutro",
  "experiencia",
  "atribuicoes",
  "perfilComportamental",
  "ambiente",
  "etapasPs",
  "etapasPsOutra",
  "observacoes",
  "consultorId",
  "recruiterId",
  "beneficios",
  "entrevistasRemovidas",
] as const;
export type VagaEdicaoCampoDaTrilha = (typeof VAGA_EDICAO_CAMPOS_DA_TRILHA)[number];

/**
 * Pertence à lista? Por `includes` num array congelado, e NUNCA por `in` num objeto: `in` aceitaria
 * "toString", "constructor" e "__proto__" pelo protótipo, e um desses viraria campo com valor.
 */
const COM_VALOR: readonly string[] = Object.freeze([
  ...VAGA_EDICAO_CAMPOS_COM_VALOR,
  ...VAGA_EDICAO_FATOS_COM_VALOR,
]);

/** Um valor de tipo fechado como texto da trilha. Vazio é nulo, nunca a palavra "null". */
function comoTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v) && v.length === 0) return null;
  return JSON.stringify(v);
}

/**
 * A LINHA DA TRILHA DE UM CAMPO. Campo fechado: de e para em texto. Qualquer outro: só "alterado",
 * com os dois valores nulos e `valorOmitido`. Fail-closed: o campo que ninguém classificou não grava
 * valor, e é assim que um campo novo de texto livre nasce protegido.
 */
export function trilhaDoCampo(
  campo: string,
  de: unknown,
  para: unknown,
): { campo: string; de: string | null; para: string | null; valorOmitido: boolean } {
  if (!COM_VALOR.includes(campo)) return { campo, de: null, para: null, valorOmitido: true };
  return { campo, de: comoTexto(de), para: comoTexto(para), valorOmitido: false };
}

/** Colunas `date`: "2026-10-05" e "2026-10-05T00:00:00Z" são o mesmo dia para a comparação. */
const CAMPOS_DE_DATA: readonly string[] = [
  "dataAbertura",
  "dataLimite",
  "dataSolicitacao",
  "dataAlinhamento",
  "dataRealinhamento",
  "envioShortlist",
];

/**
 * A FORMA COMPARÁVEL DE UM VALOR, para decidir se o campo mudou.
 *
 * Vazio (`null`, `undefined`, texto em branco, lista vazia) é um só. Texto é aparado. O SALÁRIO é
 * comparado como NÚMERO (o banco devolve "1500.00" e o corpo manda "1500"), e só ele: aplicar a
 * régua numérica a todo campo faria o cliente "0012" ser igual ao "12". Lista é comparada sem ordem
 * (são caixas de marcar), e o idioma pela chave dele.
 */
export function formaComparavel(campo: string, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (campo === "salarioAbertura") {
      const n = Number(t);
      if (Number.isFinite(n)) return `#${n}`;
    }
    if (campo === "substituidoCpf") return t.replace(/\D/g, "") || null;
    if (CAMPOS_DE_DATA.includes(campo) && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    return t;
  }
  if (typeof v === "number") return campo === "salarioAbertura" ? `#${v}` : String(v);
  if (typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    const itens = v.map((i) => (typeof i === "string" ? i.trim() : JSON.stringify(i)));
    return JSON.stringify([...itens].sort());
  }
  return JSON.stringify(v);
}

/** O campo mudou entre as duas formas? */
export function campoMudou(campo: string, de: unknown, para: unknown): boolean {
  return formaComparavel(campo, de) !== formaComparavel(campo, para);
}

/**
 * A FRONTEIRA A&S / ADM (decisão 3): quais campos copiados para a admissão o RESULTADO mudou.
 *
 * Compara a vaga atual com o RESULTADO, e não com o corpo: trocar o vínculo apaga o substituído sem
 * que o corpo o mencione, e esse apagamento também atravessa a fronteira. Devolve só NOMES de campo.
 */
export function camposDaAdmissaoAlterados(
  atual: Record<string, unknown>,
  resultado: Record<string, unknown>,
): AsVagaCampoDaAdmissao[] {
  return AS_VAGA_CAMPOS_DA_ADMISSAO.filter((campo) =>
    campoMudou(campo, atual[campo], resultado[campo]),
  );
}

/**
 * ─ AS POSIÇÕES NA EDIÇÃO (decisões 5 e 6) ──────────────────────────────────────────────────────
 *
 * ABAIXO DO ENTREGUE é a MESMA régua de `editarPosicoes`: `excessoDePosicoes`, por lado. Recusa
 * sempre, com ou sem confirmação.
 *
 * O LADO DA ENTREGA: quem chama pode mandar `entreguesPorLado` (o serviço manda, lido da ocupação
 * derivada). Sem ele, `entregues` inteiro conta no lado OFICIAL, que é o lado que segura o
 * fechamento: banco com sobra NÃO compensa entrega oficial acima da meta oficial nova.
 *
 * ABAIXO DO ALOCADO (mas acima do entregue) pede CONFIRMAÇÃO, e só quando a meta CAIU nesta edição:
 * salvar de novo uma vaga que já estava abaixo do alocado não é gesto novo. Com `alocadosPorLado`
 * (o serviço sempre manda) a conferência é POR LADO, oficial contra oficial e banco contra banco,
 * como a entrega. Sem ele, a soma dos dois lados da meta contra o total de `alocados`.
 */
export function decidirPosicoesDaEdicao(p: {
  oficialAtual: number | null;
  bancoAtual: number;
  oficialNovo: number | null;
  bancoNovo: number;
  alocados: number;
  entregues: number;
  confirmarAbaixoDoAlocado: boolean;
  entreguesPorLado?: { oficial: number; banco: number };
  alocadosPorLado?: { oficial: number; banco: number };
}):
  | { tipo: "OK"; reduziu: boolean }
  | { tipo: "ABAIXO_DO_ENTREGUE" }
  | { tipo: "CONFIRMAR_ABAIXO_DO_ALOCADO" } {
  const lado = p.entreguesPorLado ?? { oficial: p.entregues, banco: 0 };
  const excesso = excessoDePosicoes(
    { vagasFechadas: lado.oficial, vagasFechadasBanco: lado.banco },
    { posicoesOficiais: p.oficialNovo, posicoesBanco: p.bancoNovo },
  );
  if (excesso) return { tipo: "ABAIXO_DO_ENTREGUE" };

  const oficialCaiu =
    p.oficialAtual !== null && p.oficialNovo !== null && p.oficialNovo < p.oficialAtual;
  const bancoCaiu = p.bancoNovo < p.bancoAtual;
  const reduziu = oficialCaiu || bancoCaiu;

  if (reduziu && !p.confirmarAbaixoDoAlocado) {
    const abaixo = p.alocadosPorLado
      ? (oficialCaiu && p.oficialNovo !== null && p.oficialNovo < p.alocadosPorLado.oficial) ||
        (bancoCaiu && p.bancoNovo < p.alocadosPorLado.banco)
      : p.oficialNovo !== null && p.oficialNovo + p.bancoNovo < p.alocados;
    if (abaixo) return { tipo: "CONFIRMAR_ABAIXO_DO_ALOCADO" };
  }
  return { tipo: "OK", reduziu };
}
