/**
 * DOMÍNIO PURO do ARQUIVAMENTO NO DRIVE (OST re-baixar do Pandapé). Sem I/O, sem banco, sem rede.
 *
 * POR QUE EXISTE. O arquivamento no Drive lia SÓ a staging efêmera. Quando a régua fechava depois do
 * TTL de 48h (o caso real: documento validado à mão dias após a coleta), a staging já estava vazia e
 * o `arquivarNoDrive` devolvia `undefined` em silêncio: prontuário vazio, nenhum aviso, ninguém
 * sabia. As duas decisões que fecham esse buraco moram aqui, separadas do I/O para poderem ser
 * testadas sozinhas:
 *
 *  1. QUAIS TIPOS FALTAM para o prontuário ficar completo (o insumo do re-baixar);
 *  2. QUAL MOTIVO gravar quando o arquivamento não conclui (o fim do silêncio).
 *
 * §A.6: só CÓDIGO de tipo de documento e texto de motivo. Nada de CPF, nome de pessoa, nome de
 * arquivo ou URL do Pandapé, nem aqui nem no que estas funções devolvem.
 */

/** Teto de tamanho do motivo gravado em `admissoes.drive_falha_motivo`. */
export const MAX_MOTIVO_DRIVE = 500;

/**
 * O que o prontuário ainda não tem. Regra, em uma frase: **vai para o Drive TODO documento ENTREGUE**
 * (obrigatório E facultativo, decisão do diretor: se foi coletado e validado, vai), e falta o que
 * está ENTREGUE mas não tem arquivo disponível para subir.
 *
 * `jaNoDrive` cobre o ASO, único documento que sobe sozinho (ao ser validado) e é removido da staging
 * logo depois, de propósito. Sem esta exclusão o ASO seria contado como faltante em toda admissão que
 * já o arquivou, gastando uma re-baixa por nada (o md5 do Drive deduplicaria, mas a cota do Pandapé
 * não se recupera).
 *
 * Devolve códigos ÚNICOS e ORDENADOS: a saída alimenta log e motivo de falha, que precisam ser
 * estáveis entre execuções.
 */
export function tiposFaltantesNoArquivamento(entrada: {
  /** Códigos de tipo com estado ENTREGUE na admissão. */
  entregues: readonly string[];
  /** Códigos de tipo que têm arquivo na staging efêmera agora. */
  naStaging: readonly string[];
  /** Códigos já arquivados fora deste lote (hoje: o ASO). */
  jaNoDrive?: readonly string[];
  /**
   * Códigos ACEITOS SEM ARQUIVO (decisão do diretor): documento que uma PESSOA validou à mão.
   *
   * Por que isto existe. Quem valida à mão está justamente decidindo "considere entregue" para um
   * documento que o sistema não conseguiu auditar, e na prática isso acontece quando NÃO HÁ arquivo:
   * não veio na coleta e não está no Pandapé. O arquivamento continuava cobrando o binário, o
   * prontuário ficava marcado como incompleto e o sinal do diagnóstico acendia para sempre, porque a
   * condição nunca mudaria sozinha. Foi o caso dos quatro prontuários travados (CTPS, Reservista e
   * Escolaridade), todos exatamente nos documentos validados à mão.
   *
   * O documento NÃO some e o veredito humano não é tocado: ele apenas deixa de ser exigido como
   * arquivo. Se o arquivo existir na staging, sobe normalmente.
   */
  aceitosSemArquivo?: readonly string[];
}): string[] {
  const temArquivo = new Set(entrada.naStaging);
  const fora = new Set(entrada.jaNoDrive ?? []);
  const semArquivo = new Set(entrada.aceitosSemArquivo ?? []);
  const faltantes = new Set<string>();
  for (const codigo of entrada.entregues) {
    if (!codigo) continue;
    if (temArquivo.has(codigo) || fora.has(codigo) || semArquivo.has(codigo)) continue;
    faltantes.add(codigo);
  }
  return [...faltantes].sort();
}

/**
 * Motivos FIXOS de arquivamento não concluído. Texto dirigido a quem lê o diagnóstico: diz o que
 * aconteceu e o que dá para fazer. §A.11: sem travessão.
 */
export const MOTIVO_DRIVE = {
  SEM_PASTA_PAI:
    "Sem pasta-pai do Drive mapeada para o contrato/cliente desta admissão: cadastre a pasta e o arquivamento tenta de novo.",
  SEM_ARQUIVO_SEM_PANDAPE:
    "Sem arquivo na staging e sem origem Pandapé para re-baixar: os documentos precisam ser reenviados nesta admissão.",
  QUOTA_PANDAPE:
    "Pandapé recusou por limite de requisições (HTTP 429): a re-baixa foi abortada na hora, sem insistir. Tente de novo mais tarde.",
  TIMEOUT_PANDAPE:
    "Pandapé não respondeu no tempo limite ao re-baixar os documentos: nada foi perdido, a próxima tentativa refaz a busca.",
  API_PANDAPE_FORA:
    "API do Pandapé não respondeu ao re-baixar os documentos: nada foi perdido, a próxima tentativa refaz a busca.",
  PANDAPE_INERTE:
    "Integração com o Pandapé inerte (sem credencial configurada): não foi possível re-baixar os documentos.",
  /**
   * A régua fechou e não havia NENHUM arquivo para enviar. A pasta é criada assim mesmo (decisão do
   * diretor: régua fechada = prontuário existe, SEMPRE), e este aviso diz que ela nasceu vazia.
   */
  PASTA_CRIADA_SEM_ARQUIVO:
    "A régua obrigatória fechou sem nenhum arquivo disponível para enviar: a pasta do prontuário foi criada mesmo assim, e os documentos podem ser anexados depois.",
} as const;

/**
 * Motivo de quando parte dos arquivos não subiu, mas a PASTA e o que subiu foram preservados.
 *
 * Antes isto era uma exceção que derrubava o lote inteiro e fazia o EA perder o link de uma pasta que
 * já existia no Drive. Agora é aviso: o prontuário está lá, incompleto, e a próxima tentativa
 * completa sozinha (a checagem por md5 não reenvia o que já subiu).
 */
export function motivoEnvioParcial(falhas: number, motivos: readonly string[]): string {
  const causa = motivos.length ? ` Causa: ${[...motivos].join(", ")}.` : "";
  return limitar(
    `${falhas} arquivo(s) não subiram ao Drive nesta tentativa.${causa} ` +
      "A pasta e os demais arquivos foram preservados, e o sistema completa o envio sozinho na próxima ação desta admissão.",
  );
}

/** Motivo de quando o Pandapé respondeu mas não devolveu os anexos de alguns tipos. */
export function motivoPandapeSemTipos(codigos: readonly string[]): string {
  return limitar(
    `Pandapé não devolveu arquivo para: ${[...codigos].join(", ")}. ` +
      "O prontuário ficaria incompleto, então nada foi enviado ao Drive.",
  );
}

/** Motivo de quando o envio ao Drive em si falhou (erro do Google, rede, credencial). */
export function motivoFalhaEnvioDrive(detalhe: string): string {
  return limitar(`Falha no envio ao Drive: ${detalhe}`);
}

/** Aplica o teto de tamanho do motivo (mesma disciplina do motivo de auditoria). */
export function limitar(motivo: string): string {
  return motivo.slice(0, MAX_MOTIVO_DRIVE);
}
