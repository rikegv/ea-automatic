import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

/**
 * LEITOR DE PLANILHA, ÚNICO PARA O SISTEMA. FUNÇÕES PURAS, sem I/O, sem Nest e sem IA.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e o defeito que ele mata ───────────────────────────────────────┐
 * │ O leitor anterior tinha UM ternário binário: "é xlsx (magic PK)? então xlsx; SENÃO é CSV".     │
 * │ Qualquer coisa que não fosse zip virava `buffer.toString("utf8")`. A base real do diretor é    │
 * │ `.xls` LEGADO (OLE2/BIFF, magic `d0cf11e0`), então o BINÁRIO foi lido como texto e virou lixo: │
 * │ uma coluna só, com mojibake, e uma contagem de linhas inventada. NADA FALHOU, e é essa a parte │
 * │ grave: a importação seguiu em frente com a grade errada.                                       │
 * │                                                                                                │
 * │ A REGRA AQUI É O OPOSTO: o que não se reconhece é RECUSADO com mensagem acionável, nunca lido  │
 * │ "na melhor das hipóteses". Formato é decidido por MAGIC BYTE, jamais por extensão (extensão é o │
 * │ que o navegador disse; magic byte é o que o arquivo é).                                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As outras duas armadilhas da base real, medidas no arquivo do diretor:
 *  - o CABEÇALHO NÃO ESTÁ NA LINHA 1. A linha 1 é um TÍTULO de relatório de ERP ("Dados: ...") com
 *    uma célula só; o cabeçalho de verdade está na linha 2. Por isso `detectarLinhaCabecalho`.
 *  - o arquivo tem MAIS DE UMA ABA (`Candidatos` e `Carimbos`). Por isso a escolha automática da
 *    primeira aba utilizável, com `abasDisponiveis` devolvido para o time poder trocar.
 *
 * §A.6: nada daqui é logado. O leitor devolve a grade em memória; quem chama expurga o buffer.
 */

/** Teto de linhas por arquivo. Cobre o maior caso real com folga enorme. */
export const MAX_LINHAS_PLANILHA = 2000;

/**
 * TETO DE BYTES DO ARQUIVO, e ele é a defesa PRINCIPAL, não um detalhe de conveniência.
 *
 * O que ele mata, MEDIDO: um arquivo de 27,66 MB entrava aqui, virava 300.001 linhas materializadas,
 * 2 GB de RSS e 45,8 s de parse SÍNCRONO. Parse síncrono de 45 s é o EVENT LOOP PARADO: sessão de
 * quem está usando o sistema, worker do BullMQ, o webhook do Pandapé que a §A.5 manda não atrasar e o
 * tick do Clicksign, todos esperando na fila de um upload.
 *
 * POR QUE 10 MB: o teto de linhas é 2.000, e 2.000 linhas de candidato com 30 colunas dão ~400 KB em
 * CSV e ~250 KB em xlsx. 10 MB é ~25 vezes o maior caso real que a importação aceita processar, então
 * arquivo acima disso não é "planilha grande", é arquivo errado (base inteira, export de sistema,
 * planilha com imagem colada). Medido: 10 MB de CSV parseia em menos de 1 s, contra os 45,8 s do caso
 * que originou o veto.
 */
export const MAX_BYTES_PLANILHA = 10 * 1024 * 1024;

/** Quantas abas são processadas. Arquivo com mais abas que isto lê as primeiras e ignora o resto. */
export const MAX_ABAS_PLANILHA = 20;

/**
 * TETO DO CONTEÚDO DESCOMPRIMIDO de um xlsx/ods, e ele existe porque o teto de bytes NÃO BASTA no zip.
 *
 * MEDIDO, e é o furo que sobrava depois do teto de 10 MB: um xlsx de 4,69 MB com 300.001 linhas (zip
 * comprime texto repetitivo ~20 vezes) custava 12 s de CPU e 1,2 GB de RSS, porque tanto o exceljs
 * quanto o SheetJS precisam varrer o XML INTEIRO da aba antes de qualquer corte de linha nosso. Ou seja,
 * o event loop continuava travando, só com um arquivo 6 vezes menor. É o "zip bomb" involuntário de quem
 * exporta a base inteira.
 *
 * A conferência é o TAMANHO DECLARADO no diretório central do zip, que se lê sem descomprimir nada.
 *
 * POR QUE 8 MB, e não os 40 MB da primeira versão: 40 MB era folga de chute, e ela custava caro no
 * pior caso ACEITO (um zip que declara 39 MB ainda entrava e custava ~7 s de parse síncrono, que é o
 * event loop parado que esta guarda existe para evitar). O número foi MEDIDO contra o caso real: o
 * xlsx honesto de 2.000 linhas (o teto de linhas) declara ~0,5 MB descomprimidos numa base de
 * candidato comum, e ~2,3 MB no caso pesado de 12 colunas de texto longo (a fixture do teste); um
 * export de 20.000 linhas, muito acima do que a importação aceita, fica em ~4,35 MB. 8 MB mantém
 * folga de mais de uma ordem de grandeza sobre a planilha real e corta o pior caso ACEITO de ~7 s
 * para menos de 1,5 s.
 */
export const MAX_BYTES_DESCOMPRIMIDOS = 8 * 1024 * 1024;

/** Quantas linhas de exemplo vão para a IA. O que decide o mapeamento é o cabeçalho; a amostra confirma. */
export const LINHAS_DE_AMOSTRA = 15;

/** Quantas linhas do topo são candidatas a cabeçalho. Título/banner de ERP cabe de sobra nisto. */
const LINHAS_CANDIDATAS_A_CABECALHO = 10;

/**
 * Quantas linhas CRUAS cada aba materializa. É o corte DENTRO do laço de leitura, e existe para que o
 * arquivo inteiro nunca more em memória: antes, todas as abas inteiras eram materializadas e o teto de
 * linhas só era aplicado DEPOIS, no `gradeDaAba`, o que é o mesmo que não ter teto.
 *
 * É o teto de dado (2.000) mais a janela de candidatas a cabeçalho (10), porque a linha do cabeçalho
 * pode estar depois de um título e de linhas em branco: cortar exatamente em 2.000 tiraria linha de
 * dado de um arquivo que cabe. O que passa disto é CONTADO (para virar `descartadasPorTeto`) e jogado
 * fora sem ser guardado.
 */
const LIMITE_LINHAS_CRUAS = MAX_LINHAS_PLANILHA + LINHAS_CANDIDATAS_A_CABECALHO;

/** O formato que os magic bytes revelaram. `null` (desconhecido) não é lido, é recusado. */
export type FormatoPlanilha = "XLSX" | "XLS" | "TEXTO";

export interface GradePlanilha {
  /** A linha de cabeçalho encontrada (não necessariamente a primeira do arquivo). */
  cabecalho: string[];
  /** As linhas de dado depois do cabeçalho, já limitadas ao teto. */
  linhas: string[][];
  /** Quantas linhas o arquivo tinha além do teto (0 quando coube inteiro). */
  descartadasPorTeto: number;
  /** Linha do arquivo (base 1) onde o cabeçalho foi encontrado. 1 quando não há título antes. */
  linhaCabecalho: number;
  /** Aba lida, quando o arquivo tem abas (xlsx/xls). Ausente em CSV. */
  abaUsada?: string;
  /** Todas as abas do arquivo, para o time trocar quando a leitura pegou a aba errada. */
  abasDisponiveis?: string[];
}

// ── RECUSA EXPLÍCITA: cada motivo tem UMA mensagem, e ela diz o que fazer ────────────────────────

export type MotivoRecusaPlanilha =
  | "FORMATO_NAO_SUPORTADO"
  | "ILEGIVEL"
  | "VAZIA"
  | "SEM_CABECALHO"
  | "ABA_INEXISTENTE"
  | "GRANDE_DEMAIS";

/**
 * Erro de LEITURA, distinto de erro de regra. Quem chama traduz para 400 (é problema do arquivo que
 * a pessoa enviou, não falha do servidor), e a mensagem já está pronta para a tela.
 *
 * §A.11: nenhuma mensagem usa travessão.
 */
export class ErroLeituraPlanilha extends Error {
  constructor(
    readonly motivo: MotivoRecusaPlanilha,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroLeituraPlanilha";
  }
}

const MENSAGEM_DA_RECUSA: Record<MotivoRecusaPlanilha, string> = {
  FORMATO_NAO_SUPORTADO:
    "Este tipo de arquivo não é aceito. Envie a planilha em .xlsx, .xls ou .csv.",
  ILEGIVEL:
    "Não consegui ler este arquivo. Ele parece corrompido ou não é uma planilha. Tente salvar como .xlsx ou .csv.",
  VAZIA: "A planilha está vazia: não encontrei nenhuma linha de dados.",
  SEM_CABECALHO:
    "Não encontrei a linha de cabeçalho desta planilha. Confira se existe uma linha com os nomes das colunas e dados abaixo dela.",
  ABA_INEXISTENTE: "A aba escolhida não existe neste arquivo.",
  GRANDE_DEMAIS: `Este arquivo é grande demais para importar: o limite é ${Math.round(
    MAX_BYTES_PLANILHA / (1024 * 1024),
  )} MB de arquivo e ${MAX_LINHAS_PLANILHA} linhas por importação. Exporte só as colunas e as linhas que você vai importar, ou divida a planilha em partes.`,
};

/** A MENSAGEM do teto de bytes, para o controller recusar o upload com o mesmo texto da leitura. */
export const MENSAGEM_TETO_DE_BYTES = MENSAGEM_DA_RECUSA.GRANDE_DEMAIS;

function recusar(motivo: MotivoRecusaPlanilha, complemento?: string): never {
  const base = MENSAGEM_DA_RECUSA[motivo];
  throw new ErroLeituraPlanilha(motivo, complemento ? `${base} ${complemento}` : base);
}

// ── FORMATO POR MAGIC BYTE ───────────────────────────────────────────────────────────────────────

/** O arquivo é um zip (xlsx, xlsm, ods)? Decidido pelos MAGIC BYTES `PK`, não pela extensão. */
export function ehZip(buffer: Buffer): boolean {
  return buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * O TAMANHO DECLARADO do conteúdo descomprimido de um zip, lido do DIRETÓRIO CENTRAL, sem descomprimir.
 *
 * Cada entrada do diretório central começa com a assinatura `PK\x01\x02` e traz o tamanho descomprimido
 * em 4 bytes no deslocamento 24. Somar isso é o que permite recusar o xlsx que é pequeno no disco e
 * enorme por dentro ANTES de qualquer biblioteca abrir o arquivo.
 *
 * Devolve `Infinity` quando o zip usa ZIP64 (tamanho marcado como `0xFFFFFFFF`, isto é, acima de 4 GB
 * declarados no campo curto): não dá para conferir sem ler o cabeçalho estendido, e um zip desse
 * tamanho não é planilha de importação. O desconhecido aqui é recusado, não aceito.
 */
export function tamanhoDescomprimidoDoZip(buffer: Buffer): number {
  const ASSINATURA = 0x02014b50;
  const FIM_DO_DIRETORIO = 0x06054b50;

  // Onde o diretório central começa, pelo registro de fim do zip (que mora nos últimos bytes do
  // arquivo). Sem isto, a varredura percorreria o arquivo inteiro byte a byte: medido, 192 ms de event
  // loop para um arquivo de 4,69 MB, e o ponto desta função é justamente não gastar o event loop.
  let inicio = 0;
  const janela = Math.min(buffer.length, 66 * 1024);
  for (let i = buffer.length - 22; i >= buffer.length - janela && i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === FIM_DO_DIRETORIO) {
      const offset = buffer.readUInt32LE(i + 16);
      if (offset < buffer.length) inicio = offset;
      break;
    }
  }

  let total = 0;
  let entradas = 0;
  for (let i = inicio; i + 30 <= buffer.length; i += 1) {
    if (buffer.readUInt32LE(i) !== ASSINATURA) continue;
    const tamanho = buffer.readUInt32LE(i + 24);
    if (tamanho === 0xffffffff) return Number.POSITIVE_INFINITY;
    total += tamanho;
    entradas += 1;
    i += 45; // o cabeçalho fixo da entrada tem 46 bytes: nenhuma outra assinatura cabe dentro dele.
  }
  // Zip sem diretório central legível não é conferível: quem decide o que fazer é o chamador (as
  // bibliotecas ainda podem recusar o arquivo como ilegível).
  return entradas === 0 ? 0 : total;
}

/** O arquivo é um OLE2/BIFF (o `.xls` legado do Excel, e o que o ERP do diretor exporta)? */
export function ehXlsLegado(buffer: Buffer): boolean {
  return (
    buffer.length > 7 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

/**
 * O arquivo parece TEXTO? É a última hipótese, e ela precisa ser CONFERIDA, não assumida: é
 * exatamente o "assumiu" que transformou um `.xls` binário em uma coluna de mojibake.
 *
 * O critério é estrutural: byte NUL não existe em texto (e existe em praticamente todo binário), e
 * caractere de controle fora de tabulação, quebra de linha e o EOF do DOS é sinal de binário.
 */
export function pareceTexto(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const amostra = buffer.subarray(0, 8192);
  let controle = 0;
  for (const b of amostra) {
    if (b === 0x00) return false;
    const permitido = b === 0x09 || b === 0x0a || b === 0x0d || b === 0x0c || b === 0x1a;
    if (b < 0x20 && !permitido) controle += 1;
  }
  return controle / amostra.length < 0.01;
}

/**
 * O arquivo é UTF-16 COM BOM, isto é, o "Texto Unicode" que o PRÓPRIO EXCEL salva (e que é TSV)?
 *
 * Ele tem byte NUL a cada caractere ASCII, então o `pareceTexto` o reprova por construção, e antes
 * disto ele era recusado como formato desconhecido. A régua do diretor é aceitar os formatos que o
 * Excel gera, e este é um deles, então ele é reconhecido AQUI, pelo BOM, e decodificado.
 *
 * SÓ com BOM, de propósito: UTF-16 sem BOM é indistinguível de binário qualquer, e adivinhar ali é
 * exatamente o "lê na melhor das hipóteses" que esta frente existe para matar.
 */
export function ehUtf16(buffer: Buffer): "utf-16le" | "utf-16be" | null {
  if (buffer.length < 2) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return "utf-16le";
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return "utf-16be";
  return null;
}

/** O formato do arquivo, ou `null` quando não é nenhum dos que sabemos ler. */
export function formatoDaPlanilha(buffer: Buffer): FormatoPlanilha | null {
  if (ehZip(buffer)) return "XLSX";
  if (ehXlsLegado(buffer)) return "XLS";
  if (ehUtf16(buffer) !== null) return "TEXTO";
  return pareceTexto(buffer) ? "TEXTO" : null;
}

// ── TEXTO: encoding e separador FAREJADOS, nunca aceitos às cegas ────────────────────────────────

/**
 * Decodifica o texto: UTF-8 é a primeira tentativa (com BOM descartado), e quando ele produz
 * caractere de substituição o arquivo é de Windows, então cai em cp1252 (com latin1 de reserva).
 *
 * Sem isto, uma planilha salva como "CSV UTF-8" no Excel em português passa, e uma salva como "CSV
 * (separado por ponto e vírgula)" volta com "JosÃ©" no nome da pessoa.
 */
export function decodificarTexto(buffer: Buffer): string {
  // UTF-16 COM BOM (o "Texto Unicode" do Excel): o BOM já disse o encoding, não há o que farejar.
  const utf16 = ehUtf16(buffer);
  if (utf16 !== null) {
    try {
      return new TextDecoder(utf16).decode(buffer.subarray(2));
    } catch {
      return buffer.subarray(2).toString("utf16le");
    }
  }

  let bytes = buffer;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }
  const utf8 = bytes.toString("utf8");

  // A DECISÃO É POR PROPORÇÃO, e não por "achou um inválido, então é cp1252".
  //
  // O defeito que isto conserta, medido: UM byte solto (o 0x92, apóstrofo curvo que o Windows enfia no
  // meio de texto) fazia o arquivo INTEIRO cair no cp1252, e aí cada acento legítimo de UTF-8 virava
  // mojibake ("José" virava "JosÃ©") em TODAS as linhas. Um byte ruim estragava o arquivo todo.
  //
  // A régua: quando o UTF-8 decodificou MAIS caracteres acentuados VÁLIDOS do que inválidos, o arquivo
  // é UTF-8 com sujeira (o caractere sujo fica sujo, e só ele). Quando é o contrário (cp1252 puro, em
  // que TODO acento é byte inválido para UTF-8), a queda para cp1252 é a leitura certa.
  let invalidos = 0;
  let acentuadosValidos = 0;
  for (const ch of utf8) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfffd) invalidos += 1;
    else if (cp > 0x7f) acentuadosValidos += 1;
  }
  if (invalidos === 0 || acentuadosValidos > invalidos) return utf8;

  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return bytes.toString("latin1");
  }
}

/**
 * O separador, DETECTADO na primeira linha com conteúdo, e não aceito às cegas.
 *
 * Aceitar vírgula e ponto e vírgula ao mesmo tempo (como faz a importação de matrículas) QUEBRA aqui,
 * e o teste pegou: endereço tem vírgula quase sempre ("Av. Roque Petroni, 1089"), então aceitar os
 * dois parte o endereço no meio e empurra o resto para a coluna seguinte, em silêncio.
 *
 * A regra é contar: o separador de verdade aparece na linha de cabeçalho tantas vezes quantas forem
 * as colunas menos um, e o outro caractere, quando aparece, está dentro de um texto. Tabulação entra
 * na conta porque "copiar do Excel e colar no Bloco de Notas" gera TSV, que ninguém chama de TSV.
 */
export function detectarSeparador(conteudo: string): "," | ";" | "\t" {
  // A ESCOLHA É PELA TABELA QUE CADA SEPARADOR PRODUZ, e não pela contagem local de uma linha.
  //
  // Duas armadilhas MEDIDAS derrubaram as duas versões anteriores desta função, e são opostas:
  //  - "primeira linha com algum separador ganha": um título de ERP com UMA vírgula ("Dados:
  //    Candidatos, 01/09/2026") vencia um cabeçalho de ponto e vírgula logo abaixo, e o arquivo inteiro
  //    virava UMA COLUNA;
  //  - "o maior número de separadores ganha": um CSV de UMA coluna com vírgula no valor ("SILVA, JOSE
  //    DA") virava duas colunas, e a primeira pessoa era consumida como cabeçalho.
  //
  // As duas têm a mesma raiz: contar caractere não distingue separador de pontuação. Então monta-se a
  // grade com cada candidato e vence a que dá a TABELA MAIS COERENTE: mais colunas no cabeçalho, mais
  // linhas de dado com a largura do cabeçalho, e empate resolvido pelo cabeçalho mais ao alto (menos
  // linha descartada antes dele). No caso do título, o ponto e vírgula dá 3 colunas com dado de 3
  // colunas embaixo, e a vírgula dá um "cabeçalho" de 2 células com linhas de 1 célula embaixo, que não
  // é tabela nenhuma. No caso da coluna única, a vírgula não ganha nada em coerência e perde no
  // desempate, porque o cabeçalho dela ficaria na linha 2, engolindo a primeira pessoa.
  const linhas = conteudo
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .slice(0, LINHAS_CANDIDATAS_A_CABECALHO);
  if (linhas.length === 0) return ",";

  // Ordem = desempate final. A vírgula primeiro, que é o padrão do CSV.
  const candidatos: ("," | ";" | "\t")[] = [",", ";", "\t"];
  const ocorrencias = (sep: string, linha: string) => linha.split(sep).length - 1;

  /**
   * PONTUAÇÃO DE PROSA, não separador: o caractere que NÃO aparece na primeira linha, aparece UMA vez
   * nas de baixo e SEMPRE seguido de espaço é a vírgula de "SILVA, JOSE DA", não a vírgula do CSV.
   *
   * As três condições juntas, e não uma delas: separador de verdade aparece no cabeçalho (primeira
   * condição), costuma aparecer mais de uma vez por linha (terceira) e quase nunca vem colado a um
   * espaço (segunda). Exigir as três é o que deixa passar o CSV legítimo escrito com "Nome, Email".
   */
  const ehProsa = (sep: string): boolean => {
    if (ocorrencias(sep, linhas[0] ?? "") > 0) return false;
    let maximoPorLinha = 0;
    for (const linha of linhas) {
      maximoPorLinha = Math.max(maximoPorLinha, ocorrencias(sep, linha));
      for (let i = linha.indexOf(sep); i >= 0; i = linha.indexOf(sep, i + 1)) {
        const seguinte = linha[i + sep.length];
        if (seguinte !== undefined && seguinte.trim() !== "") return false;
      }
    }
    return maximoPorLinha === 1;
  };

  const elegiveis = candidatos.filter(
    (sep) => linhas.some((l) => ocorrencias(sep, l) > 0) && !ehProsa(sep),
  );
  if (elegiveis.length === 0) {
    // NENHUM candidato é grade: o arquivo é de UMA COLUNA. Devolver um separador que não existe no
    // texto é o que preserva a linha inteira como uma célula só; devolver a vírgula "por padrão"
    // partiria "SILVA, JOSE DA" no meio e consumiria a primeira pessoa como cabeçalho.
    return candidatos.find((sep) => linhas.every((l) => ocorrencias(sep, l) === 0)) ?? ",";
  }

  let melhor: { sep: "," | ";" | "\t"; pontos: number; cabecalho: number } | null = null;

  for (const sep of elegiveis) {
    const grade = linhas.map((l) => l.split(sep));
    const linhaCabecalho = detectarLinhaCabecalho(grade);
    if (linhaCabecalho === null) continue;

    const largura = naoVazias(grade[linhaCabecalho - 1]);
    const dadosCoerentes = grade
      .slice(linhaCabecalho)
      .filter((l) => l.length >= largura && l.some((c) => c.trim() !== "")).length;
    const pontos = largura * dadosCoerentes;

    const ganha =
      melhor === null ||
      pontos > melhor.pontos ||
      (pontos === melhor.pontos && linhaCabecalho < melhor.cabecalho);
    if (ganha) melhor = { sep, pontos, cabecalho: linhaCabecalho };
  }

  return melhor?.sep ?? ",";
}

// ── ABAS CRUAS: a grade como está no arquivo, 1 para 1 com as linhas ────────────────────────────

interface AbaCrua {
  nome: string;
  /** Linhas na POSIÇÃO do arquivo (índice 0 = linha 1), inclusive as vazias: é o que permite dizer "cabeçalho na linha 2". */
  linhas: string[][];
  /** Linhas COM CONTEÚDO que ficaram fora de `linhas` por causa do `LIMITE_LINHAS_CRUAS`: contadas, nunca guardadas. */
  descartadas: number;
}

/** Uma célula do exceljs em texto. TODA célula vira texto, senão "0012" volta como 12. */
function textoDaCelulaExcelJs(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return String((v as { result?: unknown }).result ?? "");
  if (typeof v === "object" && "text" in v) return String((v as { text?: unknown }).text ?? "");
  return String(v);
}

/**
 * XLSX/ODS por exceljs (o caminho já validado), com TETO DE ABAS e CORTE DE LINHAS DENTRO DO LAÇO.
 *
 * O corte mora aqui, e não no `gradeDaAba`, porque cortar depois é não cortar: era assim que um arquivo
 * grande materializava todas as abas inteiras antes de alguém olhar o teto.
 */
async function abasDeZipPorExcelJs(buffer: Buffer): Promise<AbaCrua[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets.slice(0, MAX_ABAS_PLANILHA).map((ws) => {
    const linhas: string[][] = [];
    let descartadas = 0;
    ws.eachRow({ includeEmpty: true }, (row) => {
      const celulas: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => celulas.push(textoDaCelulaExcelJs(cell.value)));
      if (row.number > LIMITE_LINHAS_CRUAS) {
        // ALÉM DO TETO: a linha é CONTADA (para a prévia declarar o descarte) e descartada sem entrar
        // na memória da grade. Nada de perda silenciosa, e nada de arquivo inteiro materializado.
        if (naoVazias(celulas) > 0) descartadas += 1;
        return;
      }
      linhas[row.number - 1] = celulas;
    });
    for (let i = 0; i < linhas.length; i += 1) if (!linhas[i]) linhas[i] = [];
    return { nome: ws.name, linhas, descartadas };
  });
}

/**
 * XLS LEGADO (e zip de reserva) por SheetJS, TODAS as abas.
 *
 * `raw: false` faz o SheetJS entregar o valor FORMATADO como texto, que é o que a pessoa vê na
 * célula: data sai "10/05/1990" (que o serviço sabe ler) em vez de um número de série do Excel, e
 * código com zero à esquerda não perde o zero. `blankrows: true` preserva a POSIÇÃO das linhas, sem
 * o que a linha do cabeçalho não poderia ser informada com fidelidade.
 *
 * A biblioteca é o pacote OFICIAL do CDN da SheetJS (0.20.3), NÃO o `xlsx` do npm, que está parado no
 * 0.18.5 e carrega CVE de prototype pollution e de ReDoS.
 */
function abasPorSheetJs(buffer: Buffer): AbaCrua[] {
  // `sheetRows` corta NO PARSE, e é o teto que mais importa: sem ele, a biblioteca materializa a aba
  // inteira antes de qualquer corte nosso. `!fullref` é o que o SheetJS guarda com a extensão REAL da
  // aba quando o corte acontece, e é dele que sai a contagem do que ficou de fora.
  const wb = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    cellFormula: false,
    sheetRows: LIMITE_LINHAS_CRUAS,
  });
  return wb.SheetNames.slice(0, MAX_ABAS_PLANILHA).map((nome) => {
    const ws = wb.Sheets[nome];
    const cruas = ws
      ? (XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: true,
        }) as unknown[][])
      : [];
    const linhas = cruas.map((l) =>
      (l ?? []).map((c) => (c === null || c === undefined ? "" : String(c))),
    );

    const refCheia = ws ? (ws as unknown as Record<string, unknown>)["!fullref"] : undefined;
    let descartadas = 0;
    if (typeof refCheia === "string") {
      const totalNoArquivo = XLSX.utils.decode_range(refCheia).e.r + 1;
      descartadas = Math.max(0, totalNoArquivo - linhas.length);
    }
    return { nome, linhas, descartadas };
  });
}

/**
 * Conta as linhas COM CONTEÚDO de um texto CSV, ciente de aspas, SEM materializar nada.
 *
 * Existe para o teto poder dizer quantas linhas ficaram de fora sem que o arquivo inteiro precise virar
 * array: é um laço de caracteres, memória constante. Separador solto não conta como conteúdo, senão uma
 * linha ";;" no fim do arquivo (que a grade descarta) apareceria como linha descartada pelo teto.
 */
function contarLinhasComConteudo(conteudo: string, separador: string): number {
  let total = 0;
  let entreAspas = false;
  let temConteudo = false;
  for (let i = 0; i < conteudo.length; i += 1) {
    const c = conteudo[i];
    if (c === '"') {
      entreAspas = !entreAspas;
      continue;
    }
    if (!entreAspas && (c === "\n" || c === "\r")) {
      if (c === "\r" && conteudo[i + 1] === "\n") i += 1;
      if (temConteudo) total += 1;
      temConteudo = false;
      continue;
    }
    if (c !== separador && c.trim() !== "") temConteudo = true;
  }
  if (temConteudo) total += 1;
  return total;
}

/**
 * CSV/TSV: tolerante a aspas, BOM e coluna a mais, com o separador DETECTADO e com TETO NO PARSE.
 *
 * `to_line` é o corte que importa aqui: o parse SÍNCRONO do arquivo inteiro é o que travava o event loop
 * por 45,8 s e consumia 2 GB num arquivo de 27,66 MB. Cortando no parse, o custo passa a ser proporcional
 * ao que a importação realmente aceita processar, e o excedente é apenas CONTADO.
 */
function abaDeTexto(conteudo: string): AbaCrua {
  const separador = detectarSeparador(conteudo);
  const linhas = parse(conteudo, {
    delimiter: separador,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
    trim: true,
    bom: true,
    to_line: LIMITE_LINHAS_CRUAS,
  }) as string[][];

  let descartadas = 0;
  if (linhas.length >= LIMITE_LINHAS_CRUAS) {
    const comConteudo = linhas.filter((l) => naoVazias(l) > 0).length;
    descartadas = Math.max(0, contarLinhasComConteudo(conteudo, separador) - comConteudo);
  }
  return { nome: "", linhas, descartadas };
}

// ── CABEÇALHO: achar a linha certa, não presumir a primeira ──────────────────────────────────────

function naoVazias(linha: string[] | undefined): number {
  return (linha ?? []).filter((c) => (c ?? "").trim() !== "").length;
}

/**
 * A LINHA DO CABEÇALHO (base 1), ou `null` quando não há nenhuma que sirva.
 *
 * A heurística, e cada pedaço dela tem um motivo medido:
 *  - só as primeiras linhas são candidatas: cabeçalho de planilha de ERP vem depois de um título ou
 *    de um banner, nunca depois de trezentas linhas;
 *  - a candidata precisa ter pelo menos DUAS células preenchidas e chegar perto da linha mais larga
 *    do topo. É isto que descarta o título "Dados: Candidatos" (uma célula, contra oito do cabeçalho)
 *    sem descartar um cabeçalho legítimo que tenha uma coluna a menos que alguma linha de dado;
 *  - a candidata precisa ter DADO DEPOIS. Cabeçalho sem nada abaixo não é cabeçalho, é planilha vazia;
 *  - o EMPATE fica com a linha mais de CIMA, porque o cabeçalho vem antes do dado;
 *  - RESERVA: planilha de uma coluna só ("NOME") nunca tem duas células preenchidas, então a primeira
 *    linha com conteúdo e dado abaixo vale como cabeçalho.
 */
export function detectarLinhaCabecalho(linhas: string[][]): number | null {
  const temDadoDepois = (i: number) => linhas.slice(i + 1).some((l) => naoVazias(l) > 0);
  const limite = Math.min(linhas.length, LINHAS_CANDIDATAS_A_CABECALHO);
  const contagens = Array.from({ length: limite }, (_, i) => naoVazias(linhas[i] ?? []));
  // A LARGURA DA TABELA É A MAIS REPETIDA no topo, e NÃO a maior.
  //
  // O defeito que isto conserta: com a maior largura e piso de 60%, um título de DUAS células
  // ("Emitido em:;01/09/2026") vencia um cabeçalho de TRÊS colunas, porque ceil(3 * 0,6) = 2. Subir o
  // percentual, sozinho, quebrava o caso oposto (cabeçalho de 2 colunas com UMA linha de dado que tem
  // uma célula sobrando), porque ali a maior largura é a da linha de dado, não a da tabela.
  //
  // A largura mais repetida resolve os dois: quando o cabeçalho e as linhas de dado concordam (o normal),
  // a moda é a largura real da tabela e o título estreito não alcança o piso; quando a largura maior
  // aparece UMA vez só (linha de dado com sobra), ela não é a moda e não empurra o piso para cima.
  // Empate na frequência fica com a maior largura, que é a leitura conservadora.
  const frequencia = new Map<number, number>();
  for (const n of contagens) if (n > 0) frequencia.set(n, (frequencia.get(n) ?? 0) + 1);
  let larguraDaTabela = 0;
  let repeticoes = 0;
  for (const [n, vezes] of frequencia) {
    if (vezes > repeticoes || (vezes === repeticoes && n > larguraDaTabela)) {
      larguraDaTabela = n;
      repeticoes = vezes;
    }
  }
  // Os 80% deixam um cabeçalho com UMA coluna a menos que a tabela passar a partir de 5 colunas, que é
  // onde isso acontece de verdade (coluna de dado sem nome no cabeçalho); abaixo disso, exigir a largura
  // cheia é o que impede o título de duas células de se passar por cabeçalho.
  const piso = Math.max(2, Math.ceil(larguraDaTabela * 0.8));

  for (let i = 0; i < limite; i += 1) {
    if (contagens[i] >= piso && temDadoDepois(i)) return i + 1;
  }
  for (let i = 0; i < limite; i += 1) {
    if (contagens[i] > 0 && temDadoDepois(i)) return i + 1;
  }
  return null;
}

/** Tira as colunas vazias do FIM do cabeçalho: célula formatada e sem texto viraria coluna fantasma na tela. */
function aparaCabecalho(linha: string[]): string[] {
  const celulas = (linha ?? []).map((c) => (c ?? "").trim());
  let fim = celulas.length;
  while (fim > 0 && celulas[fim - 1] === "") fim -= 1;
  return celulas.slice(0, fim);
}

/** A grade de UMA aba, ou `null` quando aquela aba não tem cabeçalho com dado abaixo. */
function gradeDaAba(aba: AbaCrua): GradePlanilha | null {
  const linhaCabecalho = detectarLinhaCabecalho(aba.linhas);
  if (linhaCabecalho === null) return null;

  const cabecalho = aparaCabecalho(aba.linhas[linhaCabecalho - 1] ?? []);
  if (cabecalho.length === 0) return null;

  const dados = aba.linhas
    .slice(linhaCabecalho)
    .map((l) => (l ?? []).map((c) => (c ?? "").trim()))
    .filter((l) => l.some((c) => c !== ""));

  return {
    cabecalho,
    linhas: dados.slice(0, MAX_LINHAS_PLANILHA),
    // O DESCARTE É A SOMA DOS DOIS CORTES: o que sobrou do teto dentro do que foi materializado, mais o
    // que a leitura nem materializou (`LIMITE_LINHAS_CRUAS`). Declarar só o primeiro voltaria a mentir a
    // contagem, que é o defeito que esta frente existe para matar.
    descartadasPorTeto: Math.max(0, dados.length - MAX_LINHAS_PLANILHA) + aba.descartadas,
    linhaCabecalho,
  };
}

// ── A PORTA ÚNICA ────────────────────────────────────────────────────────────────────────────────

export interface OpcoesLeitura {
  /** Aba a ler. Ausente, a leitura escolhe a primeira aba com cabeçalho e dado. */
  aba?: string;
}

/** Lê as abas cruas conforme o formato, e RECUSA o que não souber ler (nunca "tenta como texto"). */
async function abasCruas(buffer: Buffer): Promise<AbaCrua[]> {
  // ARQUIVO DE ZERO BYTE é planilha VAZIA, e não formato desconhecido: o formato dele não é estranho,
  // ele simplesmente não tem nada dentro, e é isso que a pessoa precisa ler na tela.
  if (buffer.length === 0) recusar("VAZIA");
  // TETO DE BYTES: a primeira coisa, ANTES de qualquer biblioteca tocar no arquivo. É a recusa que
  // impede o parse gigante de travar o event loop do backend inteiro.
  if (buffer.length > MAX_BYTES_PLANILHA) recusar("GRANDE_DEMAIS");

  const formato = formatoDaPlanilha(buffer);
  if (formato === null) recusar("FORMATO_NAO_SUPORTADO");

  if (formato === "XLSX") {
    // TETO DO CONTEÚDO DESCOMPRIMIDO, antes de o exceljs ou o SheetJS tocarem no zip: é o que impede o
    // arquivo pequeno no disco e gigante por dentro de travar o event loop mesmo dentro do teto de bytes.
    if (tamanhoDescomprimidoDoZip(buffer) > MAX_BYTES_DESCOMPRIMIDOS) {
      recusar("GRANDE_DEMAIS");
    }

    // O ODS PROVOU QUE "NÃO LANÇOU" NÃO É "LEU": o `exceljs.xlsx.load` aceita o zip do ODS sem erro e
    // devolve ZERO abas, então o `catch` nunca disparava, o SheetJS (que lê ODS) nunca rodava e a pessoa
    // recebia "a planilha está vazia" para um arquivo cheio de dados. A queda para o SheetJS passa a
    // olhar o RESULTADO, e não só a exceção.
    let porExcelJs: AbaCrua[] | null = null;
    try {
      porExcelJs = await abasDeZipPorExcelJs(buffer);
    } catch {
      porExcelJs = null;
    }
    const excelJsLeuAlgo =
      porExcelJs !== null && porExcelJs.some((a) => a.linhas.some((l) => naoVazias(l) > 0));
    if (excelJsLeuAlgo) return porExcelJs as AbaCrua[];

    try {
      const porSheetJs = abasPorSheetJs(buffer);
      if (porSheetJs.some((a) => a.linhas.some((l) => naoVazias(l) > 0))) return porSheetJs;
      // Nenhum dos dois achou conteúdo. Se o exceljs ao menos ABRIU o arquivo, o que ele devolveu é a
      // leitura mais fiel do zip (abas com nome e sem dado), e é ela que dá o VAZIA correto lá em cima.
      // Se ele nem abriu, o zip não é planilha: ILEGIVEL, e não "vazia".
      if (porExcelJs === null) recusar("ILEGIVEL");
      return porExcelJs;
    } catch (err) {
      if (err instanceof ErroLeituraPlanilha) throw err;
      if (porExcelJs !== null) return porExcelJs;
      recusar("ILEGIVEL");
    }
  }

  if (formato === "XLS") {
    try {
      return abasPorSheetJs(buffer);
    } catch {
      recusar("ILEGIVEL");
    }
  }

  try {
    return [abaDeTexto(decodificarTexto(buffer))];
  } catch {
    recusar("ILEGIVEL");
  }
}

/**
 * LÊ A PLANILHA: formato por magic byte, aba escolhida, cabeçalho localizado. Ou RECUSA, com motivo.
 *
 * O que ela NÃO faz mais, e é o ponto inteiro desta frente: devolver uma grade qualquer quando não
 * entendeu o arquivo. Silêncio aqui virou lixo importado lá.
 */
export async function lerPlanilha(
  buffer: Buffer,
  opcoes: OpcoesLeitura = {},
): Promise<GradePlanilha> {
  const abas = await abasCruas(buffer);
  const temAbas = abas.some((a) => a.nome !== "");
  const disponiveis = temAbas ? abas.map((a) => a.nome) : undefined;

  const comAba = (g: GradePlanilha, nome: string): GradePlanilha => ({
    ...g,
    abaUsada: nome === "" ? undefined : nome,
    abasDisponiveis: disponiveis,
  });

  // Aba PEDIDA pelo chamador: é o caminho da correção, quando a escolha automática pegou a errada.
  if (opcoes.aba !== undefined && opcoes.aba !== "") {
    const alvo = opcoes.aba.trim().toLowerCase();
    const escolhida = abas.find((a) => a.nome.trim().toLowerCase() === alvo);
    if (!escolhida) recusar("ABA_INEXISTENTE");
    const grade = gradeDaAba(escolhida);
    if (!grade) {
      if (escolhida.linhas.every((l) => naoVazias(l) === 0)) recusar("VAZIA");
      recusar("SEM_CABECALHO");
    }
    return comAba(grade, escolhida.nome);
  }

  for (const aba of abas) {
    const grade = gradeDaAba(aba);
    if (grade && grade.linhas.length > 0) return comAba(grade, aba.nome);
  }

  // Nenhuma aba serviu. A recusa distingue "não tem nada escrito" de "tem conteúdo que não dá grade":
  // são duas correções diferentes para quem enviou o arquivo.
  const totalmenteVazio = abas.every((a) => a.linhas.every((l) => naoVazias(l) === 0));
  if (totalmenteVazio) recusar("VAZIA");
  recusar(
    "SEM_CABECALHO",
    temAbas && abas.length > 1 ? `Abas encontradas: ${abas.map((a) => a.nome).join(", ")}.` : undefined,
  );
}

/**
 * Lê TEXTO já decodificado (CSV/TSV), SÍNCRONO. Existe porque os chamadores que já têm a string em
 * mão não precisam do `await` do caminho binário, e porque o teste do separador e do cabeçalho fica
 * direto. Recusa pelos mesmos motivos do caminho completo.
 */
export function lerTexto(conteudo: string): GradePlanilha {
  const aba = abaDeTexto(conteudo);
  const grade = gradeDaAba(aba);
  if (!grade) {
    if (aba.linhas.every((l) => naoVazias(l) === 0)) recusar("VAZIA");
    recusar("SEM_CABECALHO");
  }
  return grade;
}

/** A amostra que vai para a IA: poucas linhas, o suficiente para confirmar o que o cabeçalho diz. */
export function amostraParaIa(grade: GradePlanilha): string[][] {
  return grade.linhas.slice(0, LINHAS_DE_AMOSTRA);
}

/**
 * O número da linha NO ARQUIVO para o índice `i` das linhas de dado, para a pessoa achar o erro na
 * planilha dela. Cabeçalho na linha 1 dá o velho `i + 2`; cabeçalho na linha 2 dá `i + 3`.
 */
export function numeroDaLinhaNoArquivo(grade: GradePlanilha, i: number): number {
  return (grade.linhaCabecalho ?? 1) + 1 + i;
}

// ── ASSINATURA DO CABEÇALHO: o que amarra o mapa conferido à grade que será gravada ──────────────

/**
 * ASSINATURA DETERMINÍSTICA DA ABA + CABEÇALHO, e o defeito que ela fecha.
 *
 * O de/para de colunas é conferido pelo time contra UM cabeçalho específico (o da prévia). O
 * `aplicar` é OUTRA requisição, com OUTRO upload, e recebia a `aba` do cliente: mandar a aba B com o
 * mapa conferido na aba A fazia a importação gravar a COLUNA ERRADA sem nenhum erro (nome no lugar
 * do e-mail, telefone no lugar do CPF). Trocar o arquivo entre a conferência e a gravação dava o
 * mesmo estrago. Nada falhava, que é a parte grave.
 *
 * A assinatura é devolvida na prévia, ecoada pela tela e RECALCULADA no aplicar: diverge, recusa.
 *
 * §A.6: o que entra aqui é NOME DE ABA e RÓTULO DE COLUNA, nunca conteúdo de célula, e o que sai é
 * um hash. Não há PII no valor, então ele pode trafegar e voltar pelo formulário sem risco.
 *
 * A normalização (aparar, minúsculas, sem acento, espaços colapsados) existe para a assinatura não
 * mudar por causa de um espaço a mais que o leitor já apara: o que ela precisa detectar é a TROCA do
 * cabeçalho, não a diferença cosmética que não muda coluna nenhuma.
 */
export function assinaturaDoCabecalho(cabecalho: string[], aba?: string): string {
  const normalizar = (s: string): string =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  // O separador é um caractere de controle porque ele não existe em rótulo de coluna: sem isso,
  // ["a|b"] e ["a", "b"] dariam a MESMA assinatura, e a troca entre eles passaria despercebida.
  const material = [normalizar(aba ?? ""), ...cabecalho.map(normalizar)].join("\u0001");
  return createHash("sha256").update(material, "utf8").digest("hex").slice(0, 32);
}
