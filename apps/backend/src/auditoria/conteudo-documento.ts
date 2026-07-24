/**
 * O QUE CHEGOU É MESMO UM DOCUMENTO? Triagem determinística ANTES de gastar chamada de IA.
 *
 * POR QUE EXISTE (OST motivo verdadeiro, Bloco 3). Responder EM TEXTO no formulário do Pandapé, em
 * vez de anexar arquivo, é caso LEGÍTIMO do acervo real e vai se repetir: o candidato digita os dados
 * da conta no campo e o Pandapé serve essa resposta pelo MESMO endpoint de anexo. O EA baixava aquilo,
 * não reconhecia o formato, e o documento ficava preso em `AGUARDANDO_AUDITORIA`, que é estado
 * reservado a falha de SISTEMA. Não é falha de sistema: é o arquivo que não serve, e isso é veredito.
 *
 * A REGRA, decidida pelo diretor: problema do ARQUIVO enviado vira **INCONFORME**, com motivo dirigido
 * ao CONSULTOR e ação clara. `AGUARDANDO_AUDITORIA` fica reservado a falha NOSSA (quota, motor fora,
 * credencial). É a mesma distinção que já valia para o PDF protegido por senha, agora estendida.
 *
 * A DECISÃO É PELO CONTEÚDO, NÃO PELO NOME. Magic bytes são autoritativos; extensão e `Content-Type`
 * são declarações de terceiro e mentem (foi assim que um texto puro chegou até o Vertex). Um arquivo
 * chamado `.pdf` com miolo de texto é texto, e é tratado como texto.
 *
 * Módulo PURO: sem I/O, sem Nest. §A.6: olha tamanho e os primeiros bytes para decidir FORMATO, nunca
 * interpreta nem registra o conteúdo, e nenhum motivo daqui carrega dado do candidato.
 */
import { extensaoPorMagicBytes } from "../pandape/mime-documento";

/** O que o arquivo é, do ponto de vista da auditoria. */
export type ClasseConteudo = "AUDITAVEL" | "TEXTO_DIGITADO" | "FORMATO_NAO_SUPORTADO";

/**
 * Teto para considerar "resposta digitada". Uma resposta de formulário tem dezenas ou centenas de
 * bytes (a que originou esta OST tinha 91). Um arquivo grande de texto é outra coisa, e cai no balde
 * genérico de formato não suportado, com motivo igualmente acionável.
 */
const TETO_TEXTO_DIGITADO = 64 * 1024;

/**
 * Parece texto puro? Decodifica como UTF-8 em modo estrito e recusa qualquer byte de controle que não
 * seja tabulação ou quebra de linha. Binário reprovado como imagem cai aqui e sai como `false`,
 * porque quase sempre tem NUL ou sequência UTF-8 inválida logo no começo.
 *
 * O conteúdo decodificado é usado SÓ para essa verificação estrutural e descartado na mesma linha:
 * nada é lido, guardado nem logado (§A.6).
 */
export function pareceTextoDigitado(buffer: Buffer): boolean {
  if (buffer.length === 0 || buffer.length > TETO_TEXTO_DIGITADO) return false;
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return false; // não é UTF-8 válido, então é binário de formato desconhecido.
  }
  // Controle proibido: qualquer coisa abaixo de 0x20 fora de \t \n \r, mais DEL.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(texto)) return false;
  return texto.trim().length > 0;
}

/**
 * Classifica UM arquivo. `AUDITAVEL` só quando os magic bytes dizem PDF, JPEG ou PNG, que são
 * exatamente os formatos que a auditoria sabe ler.
 */
export function classificarConteudo(buffer: Buffer): ClasseConteudo {
  if (extensaoPorMagicBytes(buffer) !== null) return "AUDITAVEL";
  return pareceTextoDigitado(buffer) ? "TEXTO_DIGITADO" : "FORMATO_NAO_SUPORTADO";
}

/**
 * Motivo por classe, dirigido ao CONSULTOR (o EA é sistema interno, o candidato não lê isto). Diz o
 * que houve e o que fazer, em uma frase cada.
 */
export const MOTIVO_CONTEUDO: Record<Exclude<ClasseConteudo, "AUDITAVEL">, string> = {
  TEXTO_DIGITADO:
    "Candidato digitou os dados em vez de anexar comprovante. Solicitar reenvio com foto ou PDF.",
  FORMATO_NAO_SUPORTADO:
    "O arquivo recebido não é um documento legível (esperado PDF, JPG ou PNG). Solicitar reenvio com " +
    "foto ou PDF.",
};

/** Veredito da triagem de um CONJUNTO (frente e verso, páginas da CTPS). */
export interface TriagemConjunto<T> {
  /** Arquivos que seguem para a IA. Vazio significa que não há o que auditar. */
  auditaveis: T[];
  /** Preenchido só quando NADA é auditável: o motivo que vai para o documento como INCONFORME. */
  motivoInconforme?: string;
}

/**
 * Triagem do CONJUNTO. Segue a mesma lógica do PDF protegido no ai-service: um arquivo ruim NÃO
 * condena a peça inteira (não-bloqueio), então audita-se o que dá. Só quando NENHUM arquivo serve é
 * que sai veredito INCONFORME, sem gastar chamada de IA.
 *
 * Quando nada serve e há mistura, o motivo escolhido é o de TEXTO DIGITADO: entre "não é documento" e
 * "o candidato digitou", o segundo é mais específico e leva o consultor direto à ação certa.
 */
export function triarConjunto<T extends { buffer: Buffer }>(arquivos: T[]): TriagemConjunto<T> {
  const auditaveis: T[] = [];
  let houveTextoDigitado = false;
  for (const a of arquivos) {
    const classe = classificarConteudo(a.buffer);
    if (classe === "AUDITAVEL") auditaveis.push(a);
    else if (classe === "TEXTO_DIGITADO") houveTextoDigitado = true;
  }
  if (auditaveis.length > 0) return { auditaveis };
  return {
    auditaveis,
    motivoInconforme: houveTextoDigitado
      ? MOTIVO_CONTEUDO.TEXTO_DIGITADO
      : MOTIVO_CONTEUDO.FORMATO_NAO_SUPORTADO,
  };
}
