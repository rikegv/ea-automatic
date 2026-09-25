/**
 * O QUE O CANDIDATO LÊ QUANDO O DOCUMENTO DELE É REPROVADO, E QUEM ESCREVE ESSE TEXTO É O EA.
 *
 * ══ POR QUE O MOTIVO DA IA NÃO ATRAVESSA COMO VEIO ═════════════════════════════════════════════
 *
 * O motivo que o modelo devolve é escrito para quem opera o RH e passa por UMA rede só, do lado do
 * serviço de IA, que troca PADRÃO DE CPF e o CPF do próprio candidato. Isso não cobre os dois riscos
 * que a tela do candidato cria:
 *
 *  1. **PII DE TERCEIRO.** A instrução do modelo prevê expressamente o caso do comprovante em nome de
 *     familiar, e nada impede o motivo de sair com o nome dessa pessoa, um endereço ou um número de
 *     conta. Confiar na instrução dada ao modelo é confiar em quem não é nosso.
 *  2. **O TEXTO DA REGRA INTERNA.** A instrução manda o modelo COPIAR LITERALMENTE o aviso da regra
 *     quando ela é violada. Regra é o CRITÉRIO de aprovação, e critério na mão de quem envia é o
 *     gabarito de como burlar. O candidato precisa saber O QUE CORRIGIR, nunca COMO é julgado.
 *
 * ══ O DESENHO: ALLOWLIST DE SAÍDA, NÃO FILTRO DE ENTRADA ═══════════════════════════════════════
 *
 * O motivo da IA é INSPECIONADO aqui e NUNCA REPASSADO. A saída é uma frase de uma LISTA FECHADA,
 * escrita por nós. É a mesma diferença que a trilha do Portal já adota (`domain/portal-evento.ts`):
 * blocklist barra o que alguém lembrou de proibir; allowlist só deixa sair o que foi escrito antes.
 * Um motivo novo, inesperado ou hostil cai no texto genérico, e o pior caso é uma frase menos
 * específica, nunca um vazamento.
 *
 * O MOTIVO COMPLETO CONTINUA EXISTINDO PARA QUEM OPERA, NOS DOIS CAMINHOS, e isso precisou ser
 * construído: na esteira ele sempre foi gravado em `documentos_admissao.observacao` e exibido no
 * modal de auditoria, mas no PORTAL nada escrevia aquele campo, então o documento caía na fila do
 * time sem motivo nenhum e o consultor não tinha o que dizer ao candidato ao pedir o reenvio. Hoje o
 * Portal grava o motivo inteiro no mesmo lugar (ver `PortalCredencialService`, no ramo do veredito),
 * sem mexer no estado do documento.
 *
 * A RÉGUA, EM UMA LINHA: completo para o time, recortado para o candidato.
 *
 * §A.11: sem travessão. As frases são de orientação, não títulos, então não levam Title Case (§A.24).
 */

/** Categorias da saída. Fechadas: é a lista inteira do que o candidato pode ouvir. */
export type MotivoParaOCandidato =
  | "ACEITO"
  | "ILEGIVEL"
  | "VENCIDO"
  | "FOTO_ASSINATURA"
  | "INCOMPLETO"
  | "NAO_CONFERE"
  | "DOCUMENTO_ERRADO"
  | "PROTEGIDO_SENHA"
  | "ARQUIVO_GRANDE"
  | "ARQUIVO_NAO_SUPORTADO"
  | "NAO_PROCESSADO"
  | "GENERICO";

/** As frases, e elas são o contrato: o que não está aqui não chega ao candidato. */
export const FRASE_PARA_O_CANDIDATO: Record<MotivoParaOCandidato, string> = {
  ACEITO: "Documento recebido e aceito.",
  ILEGIVEL:
    "Não conseguimos ler este documento. Envie uma foto nítida, com o documento inteiro na imagem e sem reflexo.",
  VENCIDO: "Este documento está fora da validade. Envie um documento atualizado.",
  FOTO_ASSINATURA:
    "Não conseguimos ver bem a foto ou a assinatura do documento. Envie uma foto nítida, com o rosto e a assinatura bem visíveis, sem reflexo.",
  INCOMPLETO:
    "Este envio está incompleto. Confira se enviou todas as partes do documento, como a frente e o verso.",
  NAO_CONFERE:
    "As informações deste documento não conferem com o seu cadastro. Confira e envie novamente.",
  DOCUMENTO_ERRADO:
    "Este arquivo não parece ser o documento pedido. Confira a lista e envie o documento correto.",
  PROTEGIDO_SENHA:
    "Este arquivo está protegido por senha e não pode ser aberto. Envie uma via sem senha.",
  ARQUIVO_GRANDE:
    "Este arquivo é grande demais para o envio. Reduza o tamanho ou envie uma foto de qualidade menor.",
  ARQUIVO_NAO_SUPORTADO: "Não conseguimos abrir este arquivo. Envie em PDF, JPG ou PNG.",
  NAO_PROCESSADO:
    "Não conseguimos processar este envio agora. Tente novamente em alguns instantes.",
  GENERICO:
    "Não foi possível aceitar este documento. Confira se a foto está nítida, completa e dentro da validade, e envie de novo.",
};

/**
 * A CLASSIFICAÇÃO, por termos do motivo interno. A ORDEM É A PRIORIDADE, e ela não é alfabética nem
 * arbitrária: cada posição aqui foi paga por um caso em que a frase CERTA de gramática seria a
 * ERRADA de conteúdo.
 *
 * ══ DIZER A COISA ERRADA CUSTA MAIS DO QUE NÃO DIZER NADA ══════════════════════════════════════
 *
 * Quem lê "confira se enviou a frente e o verso" depois de mandar uma foto tremida manda a MESMA
 * foto de novo, agora com o verso junto, e queima a segunda das três tentativas fazendo exatamente o
 * que o sistema mandou. Duas frases depois a pendência cai para a fila do time, e o documento sempre
 * esteve certo: faltava foco.
 *
 * Por isso `ILEGIVEL` vem ANTES de `INCOMPLETO`, e por isso `INCOMPLETO` NÃO carrega as palavras
 * `frente`, `falta` e `cortad`: elas aparecem em motivo de QUALQUER natureza, porque o modelo
 * descreve o documento antes de dizer o defeito dele ("a imagem da FRENTE está tremida", "FALTA
 * nitidez"). Palavra que descreve a peça não pode decidir o defeito.
 *
 * `VENCIDO` vem antes de todos porque documento vencido e mal fotografado continua vencido: o
 * reenvio útil é o do documento novo, não o da foto melhor.
 *
 * Os termos são fragmentos SEM acento e em minúsculas, comparados contra o motivo normalizado. São
 * usados só para ESCOLHER a frase: nenhum pedaço do texto inspecionado sai daqui.
 */
const TERMOS: Array<{ categoria: MotivoParaOCandidato; termos: string[] }> = [
  { categoria: "PROTEGIDO_SENHA", termos: ["senha", "protegid", "criptografad"] },
  {
    categoria: "VENCIDO",
    termos: ["vencid", "validade", "expirad", "fora do prazo", "desatualizad", "prazo de emissao"],
  },
  {
    categoria: "ILEGIVEL",
    termos: [
      "ilegiv",
      "legivel",
      "legiveis",
      "nao e possivel ler",
      "nao foi possivel ler",
      "borrad",
      "desfocad",
      "tremid",
      "nitidez",
      "nitid",
      "foco",
      "baixa qualidade",
      "sem qualidade",
      "escur",
      "reflex",
      "cortad",
      "recortad",
    ],
  },
  // `FOTO_ASSINATURA` fica DEPOIS de `VENCIDO` e `ILEGIVEL` e ANTES de `INCOMPLETO` e `NAO_CONFERE`,
  // e cada vizinho paga uma dívida distinta. Depois de `ILEGIVEL`: um documento que não dá para ler
  // e por isso não dá para ver a foto é problema de legibilidade, e o reenvio útil é o da foto
  // nítida, então `ilegiv`/`nitidez` decidem primeiro. Depois de `VENCIDO`: documento vencido cuja
  // foto também não aparece continua vencido. ANTES de `INCOMPLETO`: `INCOMPLETO` carrega `ausente`,
  // e `assinatura ausente` é defeito de assinatura, não de página faltando, então precisa ser
  // reivindicado aqui antes. ANTES de `NAO_CONFERE`: o motivo real "foto e/ou assinatura do titular
  // nao identificaveis" contém a palavra `titular`, que é termo de `NAO_CONFERE`; sem esta precedência
  // ele viraria "não confere com o cadastro", conselho errado. Os fragmentos vêm do DEFEITO
  // (`identificav`, `assinatura ausente`), nunca da peça: `foto` sozinha aparece em motivo de
  // qualquer natureza e não pode decidir.
  {
    categoria: "FOTO_ASSINATURA",
    termos: [
      "identificav",
      "nao identificad",
      "assinatura ausente",
      "sem assinatura",
      "assinatura nao",
    ],
  },
  {
    categoria: "INCOMPLETO",
    termos: [
      "incomplet",
      "faltando",
      "falta o ",
      "falta a ",
      "ausente",
      "verso",
      "pagina",
      "parcial",
      "apenas a frente",
      "somente a frente",
    ],
  },
  {
    categoria: "NAO_CONFERE",
    termos: [
      "nao confere",
      "nao conferem",
      "divergen",
      "diverge",
      "nao corresponde",
      "nao coincide",
      "difere",
      "titular",
      "em nome de",
      "terceiro",
      "familiar",
    ],
  },
  {
    categoria: "DOCUMENTO_ERRADO",
    termos: [
      "nao e um",
      "nao se trata",
      "outro documento",
      "documento diferente",
      "tipo de documento",
      "nao corresponde ao tipo",
    ],
  },
];

/** Tira acento e caixa, para o casamento não depender de como o modelo escreveu. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Traduz o veredito interno para o que o candidato vê.
 *
 * `motivo` entra e NÃO sai: ele é lido para escolher a categoria e descartado. Quem chama recebe o
 * código e a frase, e é só isso que pode viajar para fora do EA.
 */
export function motivoParaOCandidato(entrada: { status: string; motivo?: string | null }): {
  codigo: MotivoParaOCandidato;
  mensagem: string;
} {
  if (entrada.status === "VALIDADO") {
    return { codigo: "ACEITO", mensagem: FRASE_PARA_O_CANDIDATO.ACEITO };
  }

  const texto = normalizar((entrada.motivo ?? "").trim());
  if (texto) {
    for (const { categoria, termos } of TERMOS) {
      if (termos.some((t) => texto.includes(t))) {
        return { codigo: categoria, mensagem: FRASE_PARA_O_CANDIDATO[categoria] };
      }
    }
  }

  // `PENDENTE` é "ilegível ou insuficiente para decidir": o palpite útil é o da leitura, não o
  // genérico. Motivo vazio ou desconhecido cai no genérico, que é o comportamento seguro.
  const codigo: MotivoParaOCandidato = entrada.status === "PENDENTE" ? "ILEGIVEL" : "GENERICO";
  return { codigo, mensagem: FRASE_PARA_O_CANDIDATO[codigo] };
}

/**
 * O ARQUIVO QUE O LEITOR NÃO PROCESSOU, traduzido pelo CÓDIGO, nunca pelo texto que veio junto.
 *
 * Mesmo os textos do leitor sendo nossos e fixos hoje, a régua é a mesma do motivo da IA: a redação
 * do que chega ao candidato mora aqui, num lugar só, e não em cada serviço que produz um aviso.
 */
export function recusaParaOCandidato(codigo: string): {
  codigo: MotivoParaOCandidato;
  mensagem: string;
} {
  const porCodigo: Record<string, MotivoParaOCandidato> = {
    PROTEGIDO_SENHA: "PROTEGIDO_SENHA",
    TAMANHO: "ARQUIVO_GRANDE",
    PAGINAS: "ARQUIVO_GRANDE",
    DIMENSAO: "ARQUIVO_GRANDE",
    FORMATO: "ARQUIVO_NAO_SUPORTADO",
    HEIC: "ARQUIVO_NAO_SUPORTADO",
    CONTEUDO_ATIVO: "ARQUIVO_NAO_SUPORTADO",
    TEMPO: "NAO_PROCESSADO",
    EXTRACAO_FALHOU: "NAO_PROCESSADO",
  };
  const categoria = porCodigo[codigo.toUpperCase()] ?? "NAO_PROCESSADO";
  return { codigo: categoria, mensagem: FRASE_PARA_O_CANDIDATO[categoria] };
}
