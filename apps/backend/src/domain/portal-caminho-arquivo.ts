import type { CampoExtraidoPortal } from "@ea/shared-types";
import {
  confirmarChegadaObjeto,
  type CredencialParaChegada,
  type MetadadoObjeto,
} from "./portal-chegada";

/**
 * PORTAL: A ORDEM DO CAMINHO. GRAVA PRIMEIRO, LÊ DEPOIS, E FALHA DE LEITURA NÃO DESFAZ NADA.
 *
 * ORQUESTRADOR PURO, com as portas injetadas. A forma é parte do requisito e não preferência de
 * teste: sem estas portas, provar a ORDEM exigiria nuvem, banco e rede, e um teste assim ninguém
 * escreve, então a ordem passaria a ser garantida por lembrança. Aqui ela é garantida por teste.
 *
 * POR QUE A ORDEM É ESTA (seção 3 do desenho): a assimetria de dano decide. Ler primeiro pode
 * deixar campos na tela de um arquivo que NÃO subiu, que é entrega falsa e silenciosa, o mesmo
 * padrão da §A.33. Gravar primeiro, no pior caso, dá digitação manual.
 *
 * E É POR ISSO QUE A LEITURA QUE FALHA NÃO DESFAZ NADA: a chegada já foi confirmada pelo lado do
 * servidor, o arquivo está lá, e apagá-lo porque o leitor engasgou trocaria um incômodo (o
 * candidato digita à mão) por uma perda (o documento some e ele sobe de novo). A falha vira EVENTO
 * e a sugestão volta nula.
 */

export interface Sugestao {
  /**
   * LISTA, e não mais mapa: alinhado ao `SugestaoExtraida` do `shared-types`, que é o que a resposta
   * de `POST /portal/confirmar` emite e a tela do candidato consome. Cada item é um
   * `CampoExtraidoPortal` (`{ campo, rotulo, valor, confianca, lido }`), o mesmo shape que o
   * `ai-service` já produz. O catálogo INTEIRO atravessa (inclusive os não lidos, com `valor` vazio),
   * para a tela saber o que ainda tem de perguntar.
   */
  campos: CampoExtraidoPortal[];
  origem: "IA";
  /**
   * SEMPRE falso quando sai daqui, e o campo existe para isso (item G5, veto V12). Nenhum campo
   * vindo da IA escreve direto em dado autoritativo: quem confirma é humano, e a confirmação é o
   * que grava. Divergência entre o que a IA leu e o que a base diz é sinalização, nunca correção
   * automática.
   */
  confirmadoPorHumano: false;
}

/**
 * O VEREDITO DO DOCUMENTO, DEVOLVIDO A QUEM ENVIOU (item 4, decisão do diretor).
 *
 * O QUE MUDA: até aqui o `confirmar` do Portal DESCARTAVA o veredito. O documento ia a
 * AGUARDANDO_AUDITORIA, o candidato via "recebido" e a reprovação nunca chegava a ele; quem
 * descobria era o time, depois, e o time voltava a caçar a pessoa, que é exatamente o custo que o
 * Portal existe para eliminar. Agora o veredito atravessa, dizendo O QUE CORRIGIR.
 *
 * ══ NÃO EXISTE CAMPO COM O TEXTO DA IA AQUI, E A AUSÊNCIA É O DESENHO ══════════════════════════
 *
 * A `mensagem` é escrita PELO EA, escolhida numa lista fechada (`domain/portal-motivo-candidato.ts`).
 * O motivo do modelo é inspecionado lá e descartado, por dois motivos medidos: ele pode carregar PII
 * de TERCEIRO (a instrução do modelo prevê o comprovante em nome de familiar, e a única rede de
 * limpeza cobre padrão de CPF) e ele é instruído a COPIAR LITERALMENTE o texto da regra violada, que
 * é o critério interno de aprovação, ou seja, o gabarito de como burlar.
 *
 * Um campo de texto livre aqui seria reaberto por quem viesse depois: sem ele, não há como repassar.
 *
 * §A.6: nada disto é persistido, entra em trilha ou vai a log. Consequência aceita: repetir a
 * confirmação de um envio já confirmado devolve `veredito: null`, porque nada foi guardado.
 */
export interface VereditoDoDocumento {
  /** `VALIDADO`, `INCONFORME` ou `PENDENTE` (ilegível/insuficiente), o vocabulário da auditoria. */
  status: string;
  valido: boolean;
  /** Categoria fechada do que corrigir (`MotivoParaOCandidato`). É por ela que a tela decide o ícone. */
  codigo: string;
  /** A frase que o candidato lê. Escrita pelo EA, nunca pelo modelo. */
  mensagem: string;
}

/**
 * O ARQUIVO QUE NÃO PÔDE SER PROCESSADO, que é coisa DIFERENTE do documento reprovado, e por isso
 * não vem no mesmo campo. Arquivo com senha, com conteúdo ativo, com páginas ou dimensão demais:
 * ninguém julgou o documento, e a maioria destes casos nem queima tentativa
 * (`domain/portal-tentativas.ts`). Fundir os dois faria a tela dizer "reprovado" para quem só mandou
 * uma foto grande.
 *
 * A `mensagem` também é NOSSA, pela mesma porta única de redação: o texto que o leitor devolve é
 * fixo e sem PII hoje, e ainda assim não atravessa, porque a régua é "quem escreve o que o candidato
 * lê é o EA", num lugar só.
 */
export interface RecusaDoArquivo {
  /** Código fechado do vocabulário da trilha (`PORTAL_MOTIVOS`), para log e para a tela. */
  codigo: string;
  /** Categoria da frase (`MotivoParaOCandidato`). */
  codigoMensagem: string;
  mensagem: string;
}

/**
 * Erro que o `lerComIa` lança quando o LEITOR recusou o arquivo, carregando a recusa já traduzida.
 *
 * Existe porque o caminho já tratava essa recusa lançando um `Error` genérico, e o `catch` do
 * orquestrador engolia tudo: o candidato recebia "não deu para ler" sem saber que bastava mandar a
 * via sem senha. A classe é o mínimo para distinguir "o leitor recusou, e eu sei por quê" de "algo
 * caiu", sem que a exceção passe a carregar conteúdo de arquivo.
 */
export class RecusaDoLeitorErro extends Error {
  constructor(readonly recusa: RecusaDoArquivo) {
    super("leitor recusou o arquivo");
    this.name = "RecusaDoLeitorErro";
  }
}

export interface ContextoCaminhoDoArquivo {
  credencial: CredencialParaChegada;
  codigoTipoDocumento: string;
  avisoDoNavegador: boolean;
}

export interface PortasCaminhoDoArquivo {
  /** Consulta o metadado no armazenamento. `null` = não achou objeto. */
  consultarMetadado: (objeto: string) => Promise<MetadadoObjeto | null>;
  /** Manda o leitor separado ler o objeto. Ele roda fora do processo do EA (item G6). */
  lerComIa: (contexto: ContextoCaminhoDoArquivo) => Promise<{
    campos: CampoExtraidoPortal[];
    origem: "IA";
    /** O veredito da auditoria daquele envio. Nulo quando ninguém julgou (tipo sem regra ativa). */
    veredito?: VereditoDoDocumento | null;
  }>;
  /** Só STATUS, nunca campo lido: quem grava campo é a confirmação humana. */
  marcarEntregue: (dados: { objeto: string; codigoTipoDocumento: string; bytes: number; formato: string }) => Promise<void>;
  /**
   * Apaga o objeto RECUSADO e DIZ SE APAGOU. O booleano é o que permite registrar o objeto que
   * ficou para trás, em vez de supor que a remoção deu certo (condição B6).
   */
  apagarObjeto: (objeto: string) => Promise<boolean>;
  registrarEvento: (tipo: string, dados?: Record<string, unknown>) => Promise<void>;
}

export interface ResultadoCaminho {
  entregue: boolean;
  sugestao: Sugestao | null;
  motivoCodigo?: string;
  /** O veredito do documento, para a tela dizer O QUE corrigir. Ver `VereditoDoDocumento`. */
  veredito: VereditoDoDocumento | null;
  /** O arquivo que o leitor não processou. Diferente de documento reprovado. */
  recusa: RecusaDoArquivo | null;
}

export async function executarCaminhoDoArquivo(
  portas: PortasCaminhoDoArquivo,
  contexto: ContextoCaminhoDoArquivo,
): Promise<ResultadoCaminho> {
  // 1. A CONFIRMAÇÃO DO LADO DO SERVIDOR, ANTES DE QUALQUER OUTRA COISA.
  const metadado = await portas.consultarMetadado(contexto.credencial.objeto);
  const chegada = confirmarChegadaObjeto({
    credencial: contexto.credencial,
    metadado,
    avisoDoNavegador: contexto.avisoDoNavegador,
  });

  if (!chegada.entregue) {
    await portas.registrarEvento("PORTAL_OBJETO_NAO_CONFIRMADO", {
      codigoTipoDocumento: contexto.codigoTipoDocumento,
      motivoCodigo: chegada.motivoCodigo,
    });

    // O RECUSADO É APAGADO ATIVAMENTE (exigência 7), e só faz sentido quando existe objeto: com
    // OBJETO_AUSENTE não há o que apagar. Objeto que chegou fora do que foi assinado (tamanho ou
    // tipo divergente) é lixo no nosso armazenamento e ninguém mais vai buscá-lo.
    //
    // QUEM APAGA é a identidade de CURADORIA, no nosso projeto do Google, com permissão de remover
    // só neste balde. O EA não ganhou permissão de apagar, ele ganhou o direito de PEDIR, com
    // bilhete assinado e destino próprio: bilhete de escrita não serve para apagar (condição B3).
    //
    // CONDIÇÃO B6, E ELA É DE ACEITAÇÃO, NÃO DE ESTILO. Este ramo NUNCA assume que o objeto existe e
    // NUNCA derruba o caminho ao falhar. O estado do documento já foi decidido acima, e a remoção é
    // higiene do armazenamento, não parte da decisão. Falhar alto aqui devolveria erro ao candidato
    // por causa de um arquivo que ele nem vai usar. A falha vira EVENTO, visível na Sala De
    // Segurança, e a rede de proteção do ciclo de vida do balde pega o que ficou para trás. É o
    // mesmo padrão da INT-4: falha ao notificar não desfaz o envelope, vira ERRO no log.
    //
    // E o objeto pode NÃO estar mais lá por caminho nenhum deste arquivo: `documentos_admissao`
    // volta a PENDENTE por fora, sem guarda de estado, pela troca de arquivo da Reauditoria. Por
    // isso "não apagou" é resultado normal, e não anomalia.
    if (metadado) {
      let apagado = false;
      try {
        apagado = await portas.apagarObjeto(contexto.credencial.objeto);
      } catch {
        // A exceção MORRE AQUI, de propósito. Ver o parágrafo acima: a remoção não pode derrubar o
        // caminho, e a mensagem do erro não é registrada porque erro de transporte costuma trazer a
        // URL inteira (§A.6).
        apagado = false;
      }
      if (!apagado) {
        await portas.registrarEvento("PORTAL_OBJETO_NAO_APAGADO", {
          codigoTipoDocumento: contexto.codigoTipoDocumento,
          motivoCodigo: chegada.motivoCodigo,
        });
      }
    }

    // Nada foi julgado: o objeto nem chegou como o combinado. Sem veredito e sem recusa do leitor.
    return {
      entregue: false,
      sugestao: null,
      motivoCodigo: chegada.motivoCodigo,
      veredito: null,
      recusa: null,
    };
  }

  // 2. GRAVADO E CONFIRMADO. Só agora o documento vira ENTREGUE, e só com STATUS.
  await portas.registrarEvento("PORTAL_OBJETO_CONFIRMADO", {
    codigoTipoDocumento: contexto.codigoTipoDocumento,
    bytes: chegada.bytes,
    formato: chegada.formato,
  });
  await portas.marcarEntregue({
    objeto: contexto.credencial.objeto,
    codigoTipoDocumento: contexto.codigoTipoDocumento,
    bytes: chegada.bytes,
    formato: chegada.formato,
  });

  // 3. A LEITURA, no mesmo ciclo, com o candidato na tela. Ela é a última porque é a única que pode
  // falhar sem que nada do que veio antes precise ser desfeito.
  try {
    const lido = await portas.lerComIa(contexto);
    const campos = lido.campos ?? [];
    await portas.registrarEvento("PORTAL_EXTRACAO_IA", {
      codigoTipoDocumento: contexto.codigoTipoDocumento,
      // A QUANTIDADE de campos, nunca os valores (item L15). O texto extraído não vai para log,
      // nem em amostra, nem em mensagem de erro.
      camposExtraidosN: campos.length,
      resultado: "OK",
    });
    return {
      entregue: true,
      sugestao: { campos, origem: "IA", confirmadoPorHumano: false },
      // O VEREDITO VOLTA JUNTO COM A SUGESTÃO, e é a mesma resposta do leitor: uma leitura só
      // responde "este documento serve?" e "o que está escrito nele?".
      veredito: lido.veredito ?? null,
      recusa: null,
    };
  } catch (erro) {
    // O LEITOR RECUSOU O ARQUIVO, e ele disse por quê. Isto NÃO é falha nossa e NÃO pode virar o
    // silêncio de antes: quem mandou um PDF com senha precisa ouvir que basta mandar a via sem
    // senha. O texto é o do leitor, fixo e sem PII; nenhuma frase é inventada aqui.
    if (erro instanceof RecusaDoLeitorErro) {
      await portas.registrarEvento("PORTAL_EXTRACAO_IA", {
        codigoTipoDocumento: contexto.codigoTipoDocumento,
        resultado: "RECUSADO",
        motivoCodigo: erro.recusa.codigo,
      });
      return {
        entregue: true,
        sugestao: null,
        motivoCodigo: erro.recusa.codigo,
        veredito: null,
        recusa: erro.recusa,
      };
    }
    // A exceção MORRE AQUI. O candidato acabou de subir um documento que chegou de verdade: devolver
    // erro para ele seria dizer que deu errado o que deu certo. E a mensagem do erro não é
    // registrada: parser costuma citar o conteúdo do arquivo, que é justamente o que não pode ir
    // para a trilha (§A.6).
    await portas.registrarEvento("PORTAL_EXTRACAO_IA", {
      codigoTipoDocumento: contexto.codigoTipoDocumento,
      resultado: "RECUSADO",
      motivoCodigo: "EXTRACAO_FALHOU",
    });
    return {
      entregue: true,
      sugestao: null,
      motivoCodigo: "EXTRACAO_FALHOU",
      veredito: null,
      recusa: null,
    };
  }
}
