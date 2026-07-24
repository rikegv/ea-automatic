import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { createDb } from "./client";
import { regrasAuditoria, tiposDocumento } from "./schema";

/**
 * Seed das REGRAS DE AUDITORIA (critério de validade da IA por tipo de documento — Fase 4 / INT-3).
 * Idempotente por (tipoDocumento + descrição): roda quantas vezes for preciso sem duplicar. Loga só
 * contagens (§A.6). Casa o tipo por CÓDIGO ou NOME, tolerante a acento/caixa; tipo ausente é pulado
 * com aviso (não quebra o seed).
 *
 * ATENÇÃO (§A.9): o critério oficial de aprovação da IA é uma PENDÊNCIA DO DIRETOR ("regra mais
 * pesada"). O OST descreveu apenas a QUANTIDADE de regras por tipo — NÃO o texto literal. Os textos
 * abaixo são baselines operacionais claros, com a contagem exata pedida, prontos para o diretor
 * revisar/editar pelo CRUD (admin/regras). A "DOCUMENTOS EM GERAL" é aplicada a TODOS os tipos
 * (a tabela exige tipo_documento_id; não há slot "global" no schema congelado) — um baseline por
 * tipo, editável individualmente. Trocar os textos depois é seguro (idempotência preserva).
 */

/**
 * OST B1 / Bloco 2 — REGRAS DE SOBREPOSIÇÃO, no mesmo padrão inaugurado pelo PIS. Quando um mesmo
 * documento do mundo real comprova mais de uma exigência da régua, a IA não pode reprovar por "tipo
 * incorreto": ela leu certo, quem estava errada era a régua. O texto é compartilhado entre os tipos
 * de uma mesma família para os três slots julgarem igual.
 */
const REGRA_CERTIDOES =
  "Certidão de nascimento e certidão de casamento são aceitas indistintamente nesta exigência: a certidão de casamento comprova o estado civil de quem casou e a de nascimento vale para quem é solteiro. NÃO reprove por 'tipo de documento incorreto' quando o arquivo for uma dessas certidões e estiver legível.";

/**
 * OST B3 / Blocos 1 e 3 — critério ÚNICO de foto, compartilhado por `FOTO_3X4` e `FOTO_CRACHA`.
 *
 * O QUE SAIU E POR QUÊ. O conjunto anterior vinha do seed original e cobrava "foto recente (até 6
 * meses)". Essa informação NÃO EXISTE numa imagem: não há data no arquivo, então a IA nunca conseguia
 * confirmar e empurrava QUALQUER foto para PENDENTE. Foi o que derrubou a foto da Silvia quando as
 * duas réguas foram unificadas. Também saiu a exigência de identificar o TITULAR na foto: uma foto de
 * rosto não traz nome nem número de documento. Regra que a IA não tem como satisfazer não é rigor, é
 * ruído, e transformaria todo documento deste tipo em caso de validação humana, o que o diretor
 * descartou: se um tipo só passa no braço, quem está errada é a regra.
 *
 * O QUE ENTROU. Em vez de afrouxar até não valer nada, o critério ficou MAIS DESCRITIVO sobre o que a
 * IA consegue de fato ver: enquadramento, fundo, rosto descoberto, nitidez, e uma lista explícita do
 * que REPROVA. A última regra fecha a sobreposição entre os dois tipos.
 */
const REGRAS_FOTO: readonly string[] = [
  "A imagem deve ser uma FOTO DO ROSTO do candidato, enquadrada aproximadamente dos ombros para cima, no padrão de foto 3x4 ou de foto para crachá.",
  "O fundo deve ser claro e uniforme.",
  "O rosto deve estar descoberto e inteiramente visível, sem óculos escuros e sem boné, chapéu, capuz, máscara ou qualquer item que cubra parte do rosto. Óculos de grau são aceitos normalmente.",
  "A imagem deve estar nítida e bem iluminada, sem filtros, recortes ou distorções.",
  "REPROVE a foto quando ocorrer qualquer um destes casos: rosto cortado ou parcialmente fora do quadro; foto de corpo inteiro ou tirada de muito longe; mais de uma pessoa na imagem; fotografia de outra foto impressa ou de uma tela; imagem escura, desfocada ou ilegível.",
  "NÃO avalie a DATA em que a foto foi tirada e NÃO exija nome, número de documento ou qualquer identificação do titular na imagem: uma foto de rosto não carrega essas informações. Julgue SOMENTE o que é visível na própria imagem.",
  "Foto 3x4 e foto para crachá são o MESMO documento para efeito de auditoria: uma serve no lugar da outra. NÃO reprove por 'tipo de documento incorreto' quando o arquivo for uma foto do rosto do candidato.",
];

/**
 * OST B3 / Bloco 1 — regras REVOGADAS, desativadas em qualquer ambiente onde já tenham sido semeadas.
 * O seed é aditivo (só insere), então tirar o texto da lista acima não bastaria: a linha antiga
 * continuaria ATIVA no banco. Aqui elas são marcadas `ativo = false`, preservando o histórico em vez
 * de apagar. Casadas pelo texto exato com que foram gravadas.
 */
const REGRAS_REVOGADAS: readonly string[] = [
  // Não verificável numa imagem: não há data de captura no arquivo (ver o bloco acima).
  "A foto deve ser recente (até 6 meses).",
  // Substituída por texto mais descritivo (fundo, rosto descoberto e enquadramento separados).
  "Fundo claro e rosto descoberto, com a face inteira visível.",
  "Imagem nítida, sem filtros, recortes ou distorções.",
];

const REGRA_VACINAS =
  "O cartão de vacinação do funcionário e o comprovante de vacinação de COVID-19 são o mesmo acervo: a COVID-19 costuma constar no próprio cartão de vacina. NÃO reprove por 'tipo de documento incorreto' quando o arquivo for um cartão ou comprovante de vacinação legível.";

/** Grupo de regras → código do tipo de documento (chave estável). */
const REGRAS_POR_CODIGO: Array<{ codigo: string; regras: string[] }> = [
  {
    codigo: "RG",
    regras: [
      "O RG deve estar legível, sem cortes ou reflexos que ocultem informações.",
      "Nome completo, número do registro e órgão expedidor devem estar visíveis.",
      "A foto e a assinatura do titular devem estar identificáveis.",
      "Documento deve estar dentro do prazo de validade, quando houver.",
      // OST B1 / Bloco 2 — mesmo padrão da regra do CPF e do PIS. A CNH é documento de identidade
      // com fé pública e traz RG e CPF impressos; sem esta regra, uma CNH enviada aqui reprovava por
      // "tipo incorreto", exatamente como o PIS reprovava ao receber um RG.
      "Podem ser considerados como documento de identidade: o RG, a CNH e a Carteira de Identidade Profissional. NÃO reprove por 'tipo de documento incorreto' quando o arquivo for um desses e os dados de identificação estiverem visíveis.",
    ],
  },
  {
    codigo: "CPF",
    regras: [
      "O número do CPF deve estar legível e completo (11 dígitos).",
      "O nome no CPF deve coincidir com o nome informado no cadastro do candidato.",
      // OST B2 / Bloco 3 — a CTPS DIGITAL traz os dados do candidato e o número identificador dela É
      // o CPF, então ela comprova o CPF. A regra anterior (no banco) já admitia CNH e RG; a CTPS
      // digital entra na mesma lista, no padrão inaugurado pelo PIS.
      "São aceitos como comprovante de CPF: o cartão/comprovante de inscrição no CPF, a CNH, o RG que traga o número do CPF e a CTPS DIGITAL (cujo número identificador é o próprio CPF). NÃO reprove por 'tipo de documento incorreto' quando o arquivo for um desses e o número do CPF estiver legível.",
    ],
  },
  {
    codigo: "COMPROVANTE_RESIDENCIA",
    regras: [
      "O comprovante deve ter no máximo 90 dias desde a emissão.",
      'O endereço deve estar legível e completo. O comprovante PODE estar em nome do candidato ou de um familiar (cônjuge, pai ou mãe): NÃO reprove por estar em nome de terceiro. Se o titular não for o candidato, retorne VALIDADO e inclua no motivo EXATAMENTE o aviso: "Documento em nome de terceiro — consultor deve verificar se é familiar do candidato." A decisão final é do consultor.',
    ],
  },
  {
    codigo: "FOTO_3X4",
    regras: [...REGRAS_FOTO],
  },
  {
    // OST B2 / Bloco 4 — MESMO objeto, MESMO critério. Os dois tipos existem por decisão do diretor
    // (tipo próprio para a foto de crachá), mas a foto é a mesma e não pode ser julgada por réguas
    // diferentes: FOTO_3X4 tinha 4 regras e FOTO_CRACHA só a geral, então a mesma imagem passava ou
    // reprovava conforme o slot em que caiu. Prevaleceu o conjunto do FOTO_3X4 (ver diário).
    codigo: "FOTO_CRACHA",
    regras: [...REGRAS_FOTO],
  },
  {
    codigo: "CTPS",
    regras: [
      "As páginas de identificação (foto e qualificação civil) devem estar legíveis.",
      "Número, série e dados do titular devem estar visíveis.",
    ],
  },
  {
    codigo: "COMPROVANTE_ESCOLARIDADE",
    regras: [
      "O comprovante deve indicar a conclusão ou a matrícula no grau de escolaridade exigido.",
    ],
  },
  {
    codigo: "DADOS_BANCARIOS",
    regras: [
      "Banco, agência e número da conta devem estar legíveis.",
      "A conta deve estar em nome do candidato.",
      "O tipo de conta (corrente, poupança ou salário) deve estar identificado.",
      "Os dados bancários devem coincidir com os informados no cadastro.",
      // OST B2 / Bloco 2 — a régua não dizia O QUE serve como comprovante, e a IA reprovava por
      // "tipo incorreto" documentos legítimos, de forma inconsistente. Lista definida pelo diretor.
      "São aceitos como comprovante de conta bancária: foto do cartão, print da tela do banco, comprovante de transferência entre contas, carta de abertura de conta e extrato bancário. NÃO reprove por 'tipo de documento incorreto' quando o arquivo for um desses e os dados da conta estiverem legíveis.",
    ],
  },
  {
    codigo: "RESERVISTA",
    regras: [
      "Para candidatos do sexo masculino, o documento de reservista/quitação militar deve estar legível e válido.",
    ],
  },
  {
    codigo: "CERTIDAO_NASC_CASAMENTO",
    regras: [
      "A certidão de nascimento ou casamento deve estar legível e atualizada.",
      "O estado civil indicado deve ser coerente com o informado no cadastro.",
      REGRA_CERTIDOES,
    ],
  },
  {
    // OST B1 / Bloco 2 — os três tipos de certidão cobrem território sobreposto: uma certidão de
    // casamento satisfaz qualquer um dos três slots. Sem a regra, a IA reprovava por "tipo incorreto"
    // quando o candidato mandava a certidão que TEM, e não a que o rótulo do slot pedia.
    codigo: "CERTIDAO_NASCIMENTO",
    regras: [REGRA_CERTIDOES],
  },
  {
    codigo: "CERTIDAO_CASAMENTO",
    regras: [REGRA_CERTIDOES],
  },
  {
    // OST B1 / Bloco 2 — os dois tipos de vacinação se sobrepõem: o cartão de vacina do funcionário
    // é o mesmo documento onde consta a vacinação de COVID-19.
    codigo: "VACINA_COVID",
    regras: [REGRA_VACINAS],
  },
  {
    codigo: "VACINA_FUNCIONARIO",
    regras: [REGRA_VACINAS],
  },
  {
    // PIS/PASEP (OST A / Bloco 2). O documento foi reprovado com "tipo incorreto, recebido Carteira
    // de Identidade" — e a IA tinha lido certo, ERA um RG. Só que o número do PIS consta no VERSO do
    // RG, então o RG É comprovante válido de PIS. Mesmo padrão já usado na regra do CPF, que aceita
    // CNH e RG. A regra vale para o CONJUNTO (frente e verso vão juntos à IA).
    codigo: "PIS_PASEP",
    regras: [
      "O número do PIS/PASEP/NIT deve estar legível e completo.",
      "Podem ser considerados como comprovante do PIS: o Cartão do PIS, a CTPS e o RG (o número do PIS consta no verso do RG). NÃO reprove por 'tipo de documento incorreto' quando o arquivo for um desses e o número do PIS estiver visível.",
    ],
  },
  {
    // ASO (Atestado de Saúde Ocupacional) — auditado na aba Exame (Fase 4 complemento, item 3).
    // A 3ª regra mapeia o resultado para o veredito: INAPTO → INCONFORME; APTO + dados ok → VALIDADO.
    codigo: "ASO",
    regras: [
      "Verificar se o nome no documento confere com o candidato cadastrado.",
      "O documento deve estar legível.",
      "Verificar se o resultado do exame é APTO ou INAPTO e reportar no motivo. Se o resultado for INAPTO, classifique o documento como INCONFORME; se for APTO e os dados conferem, VALIDADO.",
    ],
  },
];

/** Regra baseline aplicada a TODOS os tipos ("DOCUMENTOS EM GERAL"). */
const REGRA_GERAL =
  "O documento deve estar legível, completo, sem rasuras e dentro do prazo de validade, quando aplicável.";

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  const tipos = await db
    .select({ id: tiposDocumento.id, codigo: tiposDocumento.codigo, nome: tiposDocumento.nome })
    .from(tiposDocumento);

  // Índice tolerante por código e por nome normalizados.
  const idPorChave = new Map<string, string>();
  for (const t of tipos) {
    idPorChave.set(norm(t.codigo), t.id);
    idPorChave.set(norm(t.nome), t.id);
  }

  // Pares (tipoId, descricao) a garantir.
  const pares: Array<{ tipoId: string; descricao: string }> = [];
  const pulados: string[] = [];

  for (const grupo of REGRAS_POR_CODIGO) {
    const tipoId = idPorChave.get(norm(grupo.codigo));
    if (!tipoId) {
      pulados.push(grupo.codigo);
      continue;
    }
    for (const descricao of grupo.regras) pares.push({ tipoId, descricao });
  }

  // "DOCUMENTOS EM GERAL" — baseline para todos os tipos.
  for (const t of tipos) pares.push({ tipoId: t.id, descricao: REGRA_GERAL });

  // Idempotência manual por (tipo + descrição) — não há índice único nessa dupla.
  let inseridos = 0;
  for (const p of pares) {
    const existe = await db
      .select({ id: regrasAuditoria.id })
      .from(regrasAuditoria)
      .where(
        and(
          eq(regrasAuditoria.tipoDocumentoId, p.tipoId),
          eq(regrasAuditoria.descricaoRegra, p.descricao),
        ),
      )
      .limit(1);
    if (existe.length === 0) {
      await db
        .insert(regrasAuditoria)
        .values({ tipoDocumentoId: p.tipoId, descricaoRegra: p.descricao });
      inseridos++;
    }
  }

  // OST B3 / Bloco 1 — REVOGAÇÃO. O seed é aditivo, então tirar um texto da lista acima não desativa
  // a linha que já foi semeada: ela seguiria ATIVA e continuaria indo para a IA. Aqui as regras
  // revogadas são marcadas `ativo = false` (histórico preservado, nada é apagado). Idempotente: rodar
  // de novo não muda nada, porque só toca o que ainda está ativo.
  let revogadas = 0;
  for (const texto of REGRAS_REVOGADAS) {
    const alvo = await db
      .update(regrasAuditoria)
      .set({ ativo: false })
      .where(and(eq(regrasAuditoria.descricaoRegra, texto), eq(regrasAuditoria.ativo, true)))
      .returning({ id: regrasAuditoria.id });
    revogadas += alvo.length;
  }

  await sql.end();
  console.log(
    `[seed-regras] regras garantidas: ${pares.length} (${inseridos} novas, ${revogadas} revogadas) | regra geral em ${tipos.length} tipos.`,
  );
  if (pulados.length > 0) {
    console.warn(`[seed-regras] tipos não encontrados (pulados): ${pulados.join(", ")}.`);
  }
}

main().catch((err) => {
  console.error("[seed-regras] falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
