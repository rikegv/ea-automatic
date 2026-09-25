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

/**
 * O FILTRO POR VEREDITO: SÓ O APROVADO SOBE AO PRONTUÁRIO (decisão do diretor).
 *
 * O DEFEITO QUE ISTO FECHA, e ele era ativo em produção. O arquivamento montava o lote a partir de
 * TODO arquivo que estivesse na pasta temporária no instante em que a régua fechava, sem consultar o
 * estado de documento nenhum. Um arquivo REPROVADO pela IA, cujos bytes ainda estivessem lá, subia
 * para o prontuário do funcionário lado a lado com os aprovados, e nada falhava: do ponto de vista
 * do sistema o lote tinha ido inteiro. Três coisas atenuavam (trocar o arquivo apaga os anteriores
 * daquele tipo, reclassificar o ASO limpa o tipo, e o prazo de 48h apaga o que envelheceu) e
 * NENHUMA fechava.
 *
 * A RÉGUA, EM UMA FRASE: vai ao prontuário o documento cujo veredito é ENTREGUE. INCONFORME
 * (reprovado) e não decidido (PENDENTE, AGUARDANDO_AUDITORIA) NÃO vão.
 *
 * CONSEQUÊNCIA INTENCIONAL, E ELA ESTÁ ESCRITA AQUI DE PROPÓSITO: documento FACULTATIVO REPROVADO
 * deixa de subir. Isso é o objetivo, não efeito colateral. "Facultativo" diz que ele não era
 * exigido, não que ele possa entrar no prontuário reprovado.
 *
 * O QUE NÃO MUDA: o aprovado sobe exatamente como sempre subiu. O comportamento novo alcança SÓ o
 * arquivo cujo documento não está ENTREGUE.
 *
 * A COMPARAÇÃO É PELO CÓDIGO SANITIZADO, e é por isso que quem chama passa os códigos já
 * sanitizados: o nome do arquivo na pasta temporária carrega o código saneado (`{codigo}__{uuid}`),
 * e comparar contra o código cru erraria por diferença de grafia em todo tipo com caractere fora de
 * `[A-Za-z0-9_-]`, deixando de subir justamente o que estava aprovado.
 *
 * O LIMITE DESTE FILTRO, ESCRITO COM TODAS AS LETRAS PARA NINGUÉM VENDER CORREÇÃO COMPLETA. O
 * estado é por TIPO; a pasta temporária guarda HISTÓRICO por ARQUIVO e NÃO apaga as tentativas
 * anteriores do mesmo tipo (a limpeza por tipo só existe no reenvio do ASO e no descarte manual).
 * Então: o candidato manda a carteira de trabalho, a IA reprova, ele manda de novo e a IA aprova. O
 * tipo fica ENTREGUE e os bytes da tentativa REPROVADA continuam na pasta, com o MESMO código, e
 * passam por este filtro.
 *
 *   ESTE FILTRO FECHA o caso do tipo reprovado que NUNCA foi reenviado.
 *   ESTE FILTRO NÃO FECHA o caso do reprovado que FOI reenviado e depois aprovado.
 *
 * Fechar o segundo exige apagar as tentativas anteriores, o que tira do consultor a visualização
 * delas no modal, e isso é decisão do diretor, não da fábrica.
 *
 * ESTE FILTRO MORA EM UM LUGAR SÓ, `arquivarNoDriveSemTrava`, e a restrição é de aceitação. Ele NÃO
 * pode descer para `AiClientService.arquivarDrive` nem para o `POST /drive/arquivar` do serviço de
 * IA: por ali passam TAMBÉM o CONTRATO ASSINADO da INT-4 (cujo tipo não é do catálogo e nunca terá
 * estado ENTREGUE, então ele pararia de ser arquivado em 100% dos casos) e o VT coletado FORA da
 * régua (que o diretor decidiu arquivar sem criar pendência).
 *
 * §A.6: só código de tipo. Nada de nome de arquivo, nome de pessoa ou CPF atravessa esta função.
 */
export function somenteAprovadosVaoAoProntuario<T extends { codigoTipo: string }>(
  arquivos: readonly T[],
  entreguesSanitizados: readonly string[],
): T[] {
  const aprovados = new Set(entreguesSanitizados);
  return arquivos.filter((a) => aprovados.has(a.codigoTipo));
}
