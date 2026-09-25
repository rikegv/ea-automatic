/**
 * PORTAL, G3 E VETO V11: O DOCUMENTO NÃO FICA ENTREGUE PELA PALAVRA DO NAVEGADOR.
 *
 * Se o candidato avisa "subi" e o EA acredita, o EA mente. Um cliente hostil, ou um 4G que caiu no
 * meio da subida, produz uma admissão com documento marcado como ENTREGUE e objeto nenhum no
 * armazenamento, e ninguém descobre até a assinatura do contrato. É a versão silenciosa do dano da
 * §A.33, e o remédio é o mesmo: não carimbar o que não se verificou.
 *
 * `avisoDoNavegador` entra no contrato DE PROPÓSITO e não decide nada. Ele existe para que a
 * ausência de efeito seja TESTÁVEL: sem o parâmetro, o dia em que alguém voltar a confiar no cliente
 * não quebra teste nenhum, porque não haveria o que comparar.
 *
 * A conferência é sobre METADADO, que é uma chamada barata e NÃO é baixar o arquivo. Nenhum byte do
 * documento passa por aqui.
 *
 * LIMITE CONHECIDO, E ELE É DO DIRETOR, NÃO DA FÁBRICA: o metadado prova que existe um objeto com o
 * tamanho e o tipo que o PRÓPRIO CLIENTE declarou ao subir. Quem decide o tipo pelo CONTEÚDO é o
 * leitor, depois (a régua de `pandape/mime-documento` e `auditoria/conteudo-documento`). Do jeito
 * que está, um compactado renomeado para `.pdf` passa nesta conferência e entra como ENTREGUE.
 * Fechar isso significa segurar a entrega até a leitura terminar, que é decisão de produto e está
 * registrada para o diretor.
 *
 * §A.6: o veredito devolve bytes e formato, e mais nada. Nome original, URL e token não entram nem
 * de passagem, porque o que sai daqui vai direto para a trilha.
 */

export type MotivoChegada = "OBJETO_AUSENTE" | "OBJETO_DIVERGENTE" | "TAMANHO" | "FORMATO";

/** O que o armazenamento devolve na consulta de metadado feita PELO SERVIDOR. */
export interface MetadadoObjeto {
  objeto: string;
  bytes: number;
  contentType: string;
  /**
   * Geração do objeto no armazenamento. OPCIONAL de propósito: a confirmação NÃO a usa para decidir
   * (o que decide é existir, o nome, o tamanho e o tipo), então exigi-la quebraria o contrato de
   * quem já constrói este metadado. Ela existe para o CONFRONTO posterior: o leitor devolve a
   * geração que ELE viu, e geração diferente da que nós confirmamos significa que o objeto foi
   * trocado entre a nossa conferência e a leitura dele, que é evento de segurança e não empate.
   */
  geracao?: number | null;
}

/** A parte da credencial que a confirmação precisa. Nunca a URL assinada, que é credencial. */
export interface CredencialParaChegada {
  objeto: string;
  tipoAssinado: string;
  bytesMax: number;
}

export interface EntradaChegada {
  credencial: CredencialParaChegada;
  /** `null` significa que a consulta do servidor não achou objeto nenhum. */
  metadado: MetadadoObjeto | null;
  /** Entra e não decide. Ver o comentário da seção. */
  avisoDoNavegador: boolean;
}

export type ResultadoChegada =
  | { entregue: true; bytes: number; formato: string }
  | { entregue: false; motivoCodigo: MotivoChegada };

export function confirmarChegadaObjeto(entrada: EntradaChegada): ResultadoChegada {
  const { credencial, metadado } = entrada;

  if (!metadado) return { entregue: false, motivoCodigo: "OBJETO_AUSENTE" };

  // O nome do objeto foi escolhido por NÓS e assinado. Metadado de outro caminho significa que a
  // confirmação está prestes a validar o arquivo de outra pessoa, que é o pior desfecho possível.
  if (metadado.objeto !== credencial.objeto) {
    return { entregue: false, motivoCodigo: "OBJETO_DIVERGENTE" };
  }

  // Zero byte é o 4G que caiu no meio da subida: o objeto existe e o documento não chegou.
  if (!Number.isFinite(metadado.bytes) || metadado.bytes <= 0) {
    return { entregue: false, motivoCodigo: "TAMANHO" };
  }
  if (metadado.bytes > credencial.bytesMax) {
    return { entregue: false, motivoCodigo: "TAMANHO" };
  }

  const formato = (metadado.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (formato !== credencial.tipoAssinado) {
    return { entregue: false, motivoCodigo: "FORMATO" };
  }

  return { entregue: true, bytes: metadado.bytes, formato };
}
