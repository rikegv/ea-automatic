/**
 * PORTAL: O TETO DE TENTATIVAS DO CANDIDATO, PURO.
 *
 * O QUE ESTE ARQUIVO RESOLVE. No Portal a IA audita na hora, com o candidato na tela: reprovando,
 * ele vê o motivo, corrige e reenvia. Isso é o ganho do desenho, e é também o laço: sem teto, o
 * candidato que não entende o motivo tenta para sempre, e cada tentativa é uma chamada PAGA ao motor
 * de IA, no mesmo projeto do Google que atende a esteira de admissão.
 *
 * O NÚMERO É 3, E O MOTIVO ESTÁ AQUI, NÃO NA CABEÇA DE QUEM ESCREVEU. Duas tentativas resolvem o
 * caso comum, que é foto cortada e página faltando: a primeira reprovação ensina o que faltou e a
 * segunda entrega certo. A terceira é a margem, para o candidato que leu o motivo tarde ou trocou o
 * arquivo errado. Quem erra três vezes na MESMA pendência normalmente tem problema de DOCUMENTO, e
 * não de foto, e a partir daí insistir sozinho não conserta nada: o que resolve é o time olhar.
 *
 * A CHAVE É (ADMISSÃO, TIPO DE DOCUMENTO), E ESSE É O PONTO MAIS FÁCIL DE ERRAR DA FRENTE INTEIRA.
 * Se a chave fosse a credencial, ou o `jti` do link, PEDIR UM LINK NOVO ZERARIA O TETO e ele viraria
 * teatro. A chave sobrevive a reemissão de credencial, a troca de aparelho e a link novo, porque ela
 * é a PENDÊNCIA, e não a sessão. Pela mesma razão, três reprovações no comprovante de residência não
 * tiram do candidato o direito de enviar a carteira de trabalho: a conta é de uma pendência só.
 *
 * ESTE TETO NÃO É A COTA DE EMISSÃO, E OS DOIS NÃO PODEM SER FUNDIDOS. A cota (25 arquivos, 60 MB,
 * ritmo, extrações) protege o SISTEMA contra abuso e conta por LINK; este protege o CANDIDATO de um
 * laço e conta por PENDÊNCIA. Fundidos, um protege mal e o outro pune errado: quem quisesse inundar
 * o balde teria muitas pendências disponíveis, e quem limita isso é a cota, nunca o teto.
 *
 * §A.6: nada aqui é dado pessoal. Contagem, código de motivo e booleano.
 */

/** O teto, por pendência (admissão + tipo de documento). Ver o porquê do número no topo. */
export const TETO_REPROVACOES_POR_PENDENCIA = 3;

/**
 * O QUE ACONTECEU COM O ENVIO, reduzido ao que a régua do teto precisa saber.
 *
 *  - `VEREDITO`: a IA (ou a decisão do sistema equivalente) julgou o DOCUMENTO.
 *  - `RECUSA_DO_LEITOR`: o leitor não conseguiu, ou não quis, processar o ARQUIVO.
 *  - `FALHA`: nada foi julgado. Leitor fora, tempo esgotado, cota estourada, rede caída.
 */
export type Desfecho =
  | { tipo: "VEREDITO"; valido: boolean }
  | { tipo: "RECUSA_DO_LEITOR"; codigo: string }
  | { tipo: "FALHA" };

/**
 * AS RECUSAS QUE SÃO JULGAMENTO DO DOCUMENTO, e por isso queimam tentativa. Lista FECHADA.
 *
 * `PROTEGIDO_SENHA` está aqui porque PDF que exige senha é decisão sobre o documento, não sobre o
 * arquivo: ninguém consegue auditar o que não abre, e o candidato resolve mandando a via sem senha.
 * É reprovação acionável, igual às que a IA dá, e ela é decidida SEM gastar IA.
 */
export const RECUSAS_QUE_QUEIMAM: readonly string[] = ["PROTEGIDO_SENHA"];

/**
 * QUEIMOU TENTATIVA DO CANDIDATO? A lista abaixo é o coração deste item, e errar nela é negação de
 * serviço contra a própria pessoa que o Portal existe para atender.
 *
 * QUEIMA:
 *  - veredito INCONFORME (viola uma regra, ou os dados não batem com o cadastro);
 *  - veredito PENDENTE (ilegível, insuficiente para decidir): os dois são reprovação no modelo;
 *  - PDF que exige senha, que o sistema reprova sem chamar IA.
 *
 * NÃO QUEIMA, NUNCA:
 *  - envio aprovado;
 *  - FALHA DE INFRAESTRUTURA: leitor indisponível, tempo esgotado, cota da IA estourada, rede caída.
 *    A auditoria da esteira tem cauda medida de até 79 segundos e o Portal mata o processo aos 20:
 *    um celular lento queimaria as três tentativas sem a pessoa jamais ter recebido um veredito;
 *  - RECUSA TÉCNICA do envio: acima de 10 MB, acima de 20 páginas, dimensão, tipo não aceito, HEIC.
 *    Isso é o arquivo que não coube, não o documento que não serve, e uma foto grande de celular
 *    derrubaria o candidato em três toques.
 *
 * ESTE COMENTÁRIO EXISTE PORQUE O ATALHO É TENTADOR: contar ENVIO em vez de REPROVAÇÃO é uma linha
 * mais curta e transforma o teto em punição a quem está com internet ruim.
 *
 * NA DÚVIDA, NÃO QUEIMA. A assimetria de dano decide, no espírito da §A.33: contar de menos custa
 * uma leitura a mais; contar de mais tranca a pessoa fora de um documento que ninguém disse que
 * estava errado.
 */
export function queimaTentativa(desfecho: Desfecho): boolean {
  switch (desfecho.tipo) {
    case "VEREDITO":
      return desfecho.valido === false;
    case "RECUSA_DO_LEITOR":
      return RECUSAS_QUE_QUEIMAM.includes(desfecho.codigo.toUpperCase());
    default:
      return false;
  }
}

export interface SituacaoDaPendencia {
  /** Verdadeiro quando o candidato não recebe mais credencial para este tipo de documento. */
  noTime: boolean;
  /** Quantas tentativas ainda restam. Nunca negativo. */
  restantes: number;
}

/**
 * A situação da pendência, do ponto de vista do candidato.
 *
 * "Caiu para o time" NÃO é punição e NÃO é erro. É o caminho humano que já existe, o modal da aba
 * Auditoria da Esteira, para onde o documento do Portal já vai de qualquer jeito: ele não fica
 * ENTREGUE por conta da chegada, e quem decide é o time. O que o teto muda é só que o candidato
 * para de tentar sozinho e passa a ser AVISADO disso, em vez de receber a mesma recusa pela quarta
 * vez. Nenhuma fila nova nasce daqui.
 */
export function situacaoDaPendencia(entrada: { reprovacoes: number }): SituacaoDaPendencia {
  const reprovacoes = Math.max(0, Math.trunc(entrada.reprovacoes || 0));
  return {
    noTime: reprovacoes >= TETO_REPROVACOES_POR_PENDENCIA,
    restantes: Math.max(0, TETO_REPROVACOES_POR_PENDENCIA - reprovacoes),
  };
}

/**
 * A pendência ACABOU de cair para o time nesta reprovação? É o gatilho do registro de QUANDO caiu, e
 * ele é de borda: verdadeiro só na tentativa que ATINGE o teto, nunca nas seguintes. Assim o carimbo
 * da queda é o da queda, e não o do último clique de quem insistiu.
 */
export function acabouDeCairParaOTime(reprovacoesDepois: number): boolean {
  return reprovacoesDepois === TETO_REPROVACOES_POR_PENDENCIA;
}

/**
 * A MENSAGEM AO CANDIDATO quando a pendência já é do time. Ela é o contrário de um erro seco: diz o
 * que aconteceu, diz que alguém vai agir e diz que ele não precisa fazer mais nada com este
 * documento. §A.11: sem travessão.
 */
export const AVISO_PENDENCIA_NO_TIME =
  "Recebemos os seus envios deste documento. A nossa equipe vai analisar e falar com você, não é preciso enviar de novo.";

/**
 * ══ A VOLTA: QUANTAS TENTATIVAS CADA REABERTURA DEVOLVE ════════════════════════════════════════
 *
 * O teto tirava o candidato do laço e não devolvia caminho nenhum de volta. Os itens 5 e 6 fecham o
 * ciclo por DOIS caminhos, e eles NÃO devolvem a mesma coisa, de propósito.
 *
 * A PERGUNTA QUE DECIDIU O RECORTE: se a reabertura do time devolvesse o teto inteiro, o
 * destravamento do Master viraria decorativo, porque quem quisesse o efeito dele bastava pedir ao
 * consultor. A régua então é assimétrica:
 *
 *  - **O TIME devolve UMA tentativa.** É fluxo normal e é informado: o consultor falou com a pessoa
 *    e sabe o que ela tem de mandar, então uma tentativa basta. E ela é CONTADA
 *    (`TETO_REABERTURAS_DO_TIME`), senão o consultor reabriria sem fim e o teto voltaria a ser teatro.
 *  - **O MASTER devolve o TETO INTEIRO.** É exceção, e ela admite que a RÉGUA pode estar errada
 *    (§A.9: as 91 regras ativas não foram validadas pelo RH). Quem foi trancado por regra errada não
 *    precisa de uma tentativa, precisa do teto de volta.
 *
 * AS DUAS SÓ VALEM COM A PENDÊNCIA JÁ NA FILA DO TIME (decisão do diretor: o zerar do Master aparece
 * quando o candidato cai na fila, e não antes). Destravar quem ainda tem tentativa não muda o que o
 * candidato pode fazer, só apaga a contagem que diz quantas vezes a régua o reprovou. A condição de
 * entrada é a mesma para as duas portas, `situacaoDaPendencia(...).noTime`; o que continua diferente
 * é quanto cada uma devolve e quem alcança cada uma.
 *
 * OS DOIS NÚMEROS SÃO CONSTANTES NOMEADAS para o diretor ajustar sem refatoração: a régua pode mudar
 * (a proposta ainda vai a ele), e mudar um número não pode significar reescrever o mecanismo.
 *
 * NADA É APAGADO POR NENHUM DOS DOIS CAMINHOS. A reabertura grava um MARCO DATADO na pendência e a
 * contagem passa a valer do marco para a frente. Apagar linha de `portal_credenciais` ou limpar
 * `reprovado_em` destruiria a trilha e, pior, desligaria o único vínculo entre o objeto no balde e a
 * admissão, fabricando documento órfão que ninguém consegue expurgar.
 */
export type TipoDeReabertura = "SOLICITACAO_REENVIO" | "DESTRAVAMENTO_MASTER";

/**
 * ══ O DESTRAVE DO MASTER SÓ VALE COM A PENDÊNCIA NA FILA, E A RECUSA É UMA REGRA PURA ═══════════
 *
 * O QUE ELA DEVOLVE, e cada peça tem motivo:
 *  - um CÓDIGO ESTÁVEL, no molde de `TENTATIVAS_ESGOTADAS` e `TIPO_FORA_DA_REGUA`, para a tela
 *    decidir pelo código e nunca interpretando texto. Frase é para humano; código é para máquina;
 *  - a CONTAGEM e o TETO, porque "ainda não pode" sem número manda quem operou adivinhar quanto
 *    falta, e quem adivinha abre chamado;
 *  - o CAMINHO que existe agora, para a recusa não ser só uma porta fechada.
 *
 * A CONTAGEM QUE ENTRA AQUI TEM DE SER A EFETIVA (`reprovacoesEfetivas`), a mesma que desconta o
 * marco da última reabertura. Duas contagens discordando fariam a tela mostrar um número e o
 * servidor recusar por outro, que é a divergência mais cara de depurar: as duas partes parecem
 * certas isoladamente.
 *
 * CONSEQUÊNCIA CONHECIDA E DECLARADA: logo depois de uma reabertura do TIME, a contagem efetiva volta
 * a `teto - 1`, então o Master NÃO destrava naquele instante. É coerente com "só na terceira" e é
 * diferente do que valia antes desta decisão.
 */
export const MOTIVO_DESTRAVE_FORA_DA_HORA = "DESTRAVE_FORA_DA_HORA";

export interface RecusaDoDestrave {
  codigo: typeof MOTIVO_DESTRAVE_FORA_DA_HORA;
  /** Lido pela tela como `message` do erro (é assim que o cliente do EA extrai a frase). */
  message: string;
  tentativas: { usadas: number; teto: number; restantes: number };
}

/**
 * A pendência ainda NÃO está na fila do time? Então o destrave é recusado, e esta é a recusa.
 * `null` significa que o destrave pode seguir.
 */
export function recusaDoDestrave(entrada: { reprovacoes: number }): RecusaDoDestrave | null {
  const situacao = situacaoDaPendencia(entrada);
  if (situacao.noTime) return null;

  const usadas = Math.max(0, Math.trunc(entrada.reprovacoes || 0));
  const semNenhuma =
    "Esta pendência não tem nenhuma reprovação, então não há tentativa a zerar. " +
    `O destravamento vale a partir da ${TETO_REPROVACOES_POR_PENDENCIA}ª reprovação, quando a pendência cai na fila do time.`;
  const cedoDemais =
    `Esta pendência tem ${usadas} de ${TETO_REPROVACOES_POR_PENDENCIA} reprovações. ` +
    `O destravamento vale a partir da ${TETO_REPROVACOES_POR_PENDENCIA}ª, quando o candidato para de enviar sozinho e a pendência cai na fila do time. ` +
    "Até lá ele ainda pode mandar o documento por conta própria, e o reenvio pode ser solicitado assim que a pendência cair.";

  return {
    codigo: MOTIVO_DESTRAVE_FORA_DA_HORA,
    message: usadas === 0 ? semNenhuma : cedoDemais,
    tentativas: { usadas, teto: TETO_REPROVACOES_POR_PENDENCIA, restantes: situacao.restantes },
  };
}

/** Quantas tentativas cada caminho devolve. Ver a assimetria explicada acima. */
export const TENTATIVAS_DEVOLVIDAS: Record<TipoDeReabertura, number> = {
  SOLICITACAO_REENVIO: 1,
  DESTRAVAMENTO_MASTER: TETO_REPROVACOES_POR_PENDENCIA,
};

/**
 * Quantas vezes o TIME pode reabrir a mesma pendência antes de precisar de um Master. Reabertura sem
 * limite devolve, em parcelas, o teto que o Master deveria decidir.
 */
export const TETO_REABERTURAS_DO_TIME = 3;

/**
 * A CONTAGEM QUE VALE, depois de descontado o que a última reabertura devolveu.
 *
 * `reprovacoesDepoisDoMarco` é o que o banco conta a partir de `liberado_em`; a reabertura entra como
 * um CRÉDITO de tentativas, não como um apagamento. Pendência nunca reaberta (`reabertura` nulo)
 * devolve a contagem crua, que é o comportamento de sempre.
 */
export function reprovacoesEfetivas(entrada: {
  reprovacoesDepoisDoMarco: number;
  reabertura: TipoDeReabertura | null;
}): number {
  const crua = Math.max(0, Math.trunc(entrada.reprovacoesDepoisDoMarco || 0));
  if (!entrada.reabertura) return crua;
  const devolvidas = TENTATIVAS_DEVOLVIDAS[entrada.reabertura] ?? 0;
  return Math.max(0, TETO_REPROVACOES_POR_PENDENCIA - devolvidas + crua);
}
