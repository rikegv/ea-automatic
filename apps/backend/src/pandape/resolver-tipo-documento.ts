/**
 * De/Para: rótulo de documento do Pandapé → `codigo` do TipoDocumento no catálogo do EA (§A.3).
 *
 * A FONTE do rótulo é o **nome do FORMULÁRIO** da API do Pandapé (`forms[].name`), que é o que
 * identifica o TIPO do documento. O nome do ARQUIVO não serve para isso (vem como
 * "IMG-<numeros>.jpg", "Screenshot_<numeros>.png") e ainda por cima carrega PII: já foi visto CPF no
 * nome do arquivo. Rótulo/nome de arquivo NUNCA vai para log (§A.6).
 *
 * Documento sem correspondência é PULADO no pull (sem erro, regra 5/não-bloqueio), logando só um
 * rótulo genérico.
 *
 * Mapa consolidado com o diretor a partir dos 23 formulários reais (§A.9). As EXCLUSÕES são
 * deliberadas, não esquecimento (ver `EXCLUIDOS_DE_PROPOSITO` no fim do arquivo).
 */

/**
 * Normaliza: minúsculas, sem acento, sem pontuação, espaços colapsados. Também **remove o conteúdo
 * entre parênteses**, que no Pandapé é decoração ou instrução ao candidato, não parte do tipo:
 *   "CTPS (Carteira de Trabalho e Previdência Social)"  vira  "ctps"
 *   "CNH (Carteira Nacional de Habilitação)"            vira  "cnh"
 * O `trim` final também mata o espaço em branco à direita que a API manda em alguns formulários
 * (o da foto para crachá vem com trailing space).
 */
export function normalizarLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ") // decoração entre parênteses não faz parte do tipo
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

  // ── Formulários REAIS do Pandapé, confirmados pelo diretor (§A.9) ────────────────────────────
  // Os nomes abaixo são âncoras específicas: entram porque o formulário do Pandapé diz mais do que
  // o tipo do catálogo e a correspondência precisa ser explícita, não adivinhada.
  "cartao de inscricao no pis": "PIS_PASEP",
  "cartao sus": "CARTAO_SUS",
  // Formulário único do Pandapé que cobre os DOIS casos: casa com o tipo combinado do catálogo,
  // NUNCA com "certidao de nascimento" sozinho (por isso a âncora inteira, mais longa, vence).
  "comprovante de estado civil ou certidao de nascimento": "CERTIDAO_NASC_CASAMENTO",
  "certificado de reservista": "RESERVISTA",
  // Foto de crachá tem tipo PRÓPRIO no catálogo (decisão do diretor). A âncora é mais longa que a
  // chave "foto", então vence o FOTO_3X4 na desambiguação por especificidade.
  "foto do rosto para cracha": "FOTO_CRACHA",
  "comprovante de frequencia escolar dos dependentes": "FREQUENCIA_ESCOLAR_DEPENDENTES",
};

/**
 * Formulários do Pandapé que NÃO entram no de/para, por decisão registrada. Ficam listados para que
 * a ausência seja lida como deliberada, e não como um mapeamento esquecido.
 *
 *  - "Informações de Vale Transporte": o VT é atacado por outra frente (§A.17). Sem destino de propósito.
 *  - "Consulta de Qualificação Cadastral - eSocial": não trazer.
 *  - "Atestado Médico Admissional": é o ASO, controlado pela frente EXAME (§A.16). Fora da régua
 *    para não duplicar exigência do mesmo documento em duas frentes.
 *  - "Dados Contratuais" / "Dados Pessoais" / "Dependentes": NÃO são documento, são as seções que
 *    carregam os campos estruturados do formulário.
 */
export const EXCLUIDOS_DE_PROPOSITO: readonly string[] = [
  "informacoes de vale transporte",
  "consulta de qualificacao cadastral esocial",
  "atestado medico admissional",
  "dados contratuais",
  "dados pessoais",
  "dependentes",
];

/**
 * Resolve o `codigo` do TipoDocumento a partir do rótulo do Pandapé. Devolve `undefined` quando não
 * há correspondência: o chamador deve PULAR o documento (não-bloqueio). NÃO inventa tipo.
 *
 * Duas passadas, nesta ordem:
 *  1. **Exata** sobre o rótulo normalizado (com os parênteses já removidos).
 *  2. **Âncora mais específica**: entre as chaves do mapa que aparecem no rótulo como sequência de
 *     palavras inteiras, vence a MAIS LONGA. É o que faz "Certidão de Nascimento dos filhos até 21
 *     anos de idade" cair em CERTIDAO_NASCIMENTO_FILHOS, e não no CERTIDAO_NASCIMENTO genérico.
 *
 * A comparação é por palavra inteira de propósito: casar por pedaço de palavra faria "pis" bater
 * dentro de qualquer palavra que contivesse essas letras.
 */
export function resolverTipoDocumento(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const alvo = normalizarLabel(label);
  if (!alvo) return undefined;

  const exato = MAPA_TIPO_DOCUMENTO[alvo];
  if (exato) return exato;

  if (EXCLUIDOS_DE_PROPOSITO.includes(alvo)) return undefined;

  let melhorChave = "";
  for (const chave of Object.keys(MAPA_TIPO_DOCUMENTO)) {
    if (chave.length <= melhorChave.length) continue;
    if (contemPalavrasInteiras(alvo, chave)) melhorChave = chave;
  }
  return melhorChave ? MAPA_TIPO_DOCUMENTO[melhorChave] : undefined;
}

/** `chave` aparece em `texto` como sequência de palavras INTEIRAS (nunca como pedaço de palavra). */
function contemPalavrasInteiras(texto: string, chave: string): boolean {
  const palavras = texto.split(" ");
  const alvo = chave.split(" ");
  for (let i = 0; i + alvo.length <= palavras.length; i++) {
    let bate = true;
    for (let j = 0; j < alvo.length; j++) {
      if (palavras[i + j] !== alvo[j]) {
        bate = false;
        break;
      }
    }
    if (bate) return true;
  }
  return false;
}
