/**
 * De/Para best-effort: rótulo de documento do Pandapé → `codigo` do TipoDocumento no catálogo do EA
 * (§A.3). O mapa REAL depende de insumo do diretor (§A.9) e do payload real do Pandapé; este é um
 * ponto de partida configurável por nome normalizado. Documento sem correspondência é PULADO no pull
 * (sem erro — regra 5/não-bloqueio), logando só um rótulo genérico (NUNCA a URL, NUNCA CPF — §A.6).
 *
 * TODO confirmar/expandir o mapa quando o token e o payload real chegarem (OST §4 / §A.9).
 */

/** Normaliza: minúsculas, sem acento, sem pontuação, espaços colapsados. */
export function normalizarLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Chaves já normalizadas (via `normalizarLabel`) → `codigo` do catálogo. */
export const MAPA_TIPO_DOCUMENTO: Readonly<Record<string, string>> = {
  rg: "RG",
  "documento de identidade": "RG",
  identidade: "RG",
  cpf: "CPF",
  ctps: "CTPS",
  "carteira de trabalho": "CTPS",
  "titulo de eleitor": "TITULO_ELEITOR",
  "comprovante de residencia": "COMPROVANTE_RESIDENCIA",
  "comprovante de endereco": "COMPROVANTE_RESIDENCIA",
  "certidao de nascimento": "CERTIDAO_NASCIMENTO",
  "certidao de casamento": "CERTIDAO_CASAMENTO",
  "comprovante de escolaridade": "COMPROVANTE_ESCOLARIDADE",
  escolaridade: "COMPROVANTE_ESCOLARIDADE",
  "foto 3x4": "FOTO_3X4",
  foto: "FOTO_3X4",
  pis: "PIS_PASEP",
  pasep: "PIS_PASEP",
  "pis pasep": "PIS_PASEP",
  reservista: "RESERVISTA",
  "carteira de reservista": "RESERVISTA",
  cnh: "CNH",
  "certidao de nascimento dos filhos": "CERTIDAO_NASCIMENTO_FILHOS",
  "carteira de vacinacao dos filhos": "VACINA_FILHOS",
  "vacinacao dependente": "VACINA_FILHOS",
  "dados bancarios": "DADOS_BANCARIOS",
  "conta bancaria": "DADOS_BANCARIOS",
  "comprovante de conta bancaria": "DADOS_BANCARIOS",
  aso: "ASO",
  "atestado de saude ocupacional": "ASO",
  antecedentes: "ANTECEDENTES",
  "certidao de antecedentes criminais": "ANTECEDENTES",
  "vinculo esocial": "VINCULO_ESOCIAL",
  "dependentes ir": "DEPENDENTES_IR",
  "vacina covid": "VACINA_COVID",
  "vacinacao covid 19": "VACINA_COVID",
  curriculo: "CURRICULO",
};

/**
 * Resolve o `codigo` do TipoDocumento a partir do rótulo do Pandapé. Devolve `undefined` quando não
 * há correspondência — o chamador deve PULAR o documento (não-bloqueio). NÃO inventa tipo.
 */
export function resolverTipoDocumento(label: string | undefined): string | undefined {
  if (!label) return undefined;
  return MAPA_TIPO_DOCUMENTO[normalizarLabel(label)];
}
