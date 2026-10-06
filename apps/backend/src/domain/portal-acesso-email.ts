import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { MOTIVOS_DA_TRAVA_DE_ACESSO, type MotivoDaTravaDeAcesso } from "@ea/shared-types";

/**
 * PORTAL, A PORTA DE E-MAIL: a régua pura do código de verificação e da trava de divergência.
 *
 * Fonte NORMATIVA: `docs/CONTRATO-PORTAL-ACESSO-EMAIL.md` (v2), seções 2 e 3. A v1 foi VETADA e
 * nada dela sobreviveu aqui. `docs/MAPA-ALCANCE-PORTAL-ACESSO-POR-EMAIL.md` traz a medição.
 *
 * ┌─ O QUE ESTA PORTA É, E O QUE ELA DELIBERADAMENTE NÃO É ─────────────────────────────────────┐
 * │ Ela NÃO emite sessão e NÃO abre o Portal. Ela prova a posse da CAIXA e, com isso, dispara o  │
 * │ envio do LINK para aquela mesma caixa. A chave de acesso continua sendo link + CPF +         │
 * │ nascimento em `POST portal/identificar`, byte a byte como antes.                             │
 * │                                                                                             │
 * │ A v1 abria o Portal achando a admissão PELO CPF DIGITADO, e a auditoria provou a tomada de   │
 * │ conta: candidato sem CPF tem `cpf` nulo, nulo não discorda de nada, então a trava de         │
 * │ divergência era VAZIA justamente na população-alvo. Quem tivesse a caixa de um candidato do  │
 * │ funil digitava o CPF DE UM TERCEIRO e abria o prontuário dele.                               │
 * │                                                                                             │
 * │ E-MAIL NÃO É CHAVE DE IDENTIDADE, medido em produção e não temido: 6 e-mails compartilhados  │
 * │ por 12 CPFs distintos, 5 deles com DOIS NOMES diferentes. É por isso que o passo da          │
 * │ confirmação não devolve nada da pessoa, nem o nome mascarado, e é por isso que e-mail que    │
 * │ resolve para mais de um candidato TRAVA em vez de escolher um.                               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE ARQUIVO É SÓ FUNÇÃO PURA (mesmo argumento de `domain/portal-identidade.ts`) ──┐
 * │ Sem banco, sem relógio implícito, sem ambiente e SEM LOGGER. Cada régua daqui é provável em │
 * │ teste sem `.env` e sem Postgres, e é isso que permite varrer a precedência degrau por degrau │
 * │ em vez de confiar nos três caminhos que alguém lembrou de exercitar.                         │
 * │                                                                                             │
 * │ A AUSÊNCIA DO LOGGER É §A.6 EM FORMA DE ARQUIVO: aqui passam o código de verificação (que é  │
 * │ credencial) e o CPF informado (que é dado pessoal). Sem `Logger` importado, não há por onde  │
 * │ nenhum dos dois vazar, nem hoje nem na refatoração de quem não leu este bloco.               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ══ OS NÚMEROS, TODOS NORMATIVOS (seção 2 do contrato, da auditoria) ═════════════════════════════

/**
 * SEIS DÍGITOS, e a conta que os sustenta está aqui porque ela depende do "morre na quinta":
 * 10 códigos por dia x 5 tentativas = 50 chutes em 10^6, ou 5 x 10^-5 por dia por alvo, ou ~1.380
 * dias para 50% de chance, GERANDO 10 E-MAILS POR DIA na caixa da vítima (ou seja, o ataque é
 * ruidoso muito antes de ser viável).
 *
 * TIRAR O `CODIGO_TENTATIVAS_LIMITE` DESTRÓI A CONTA e passaria a exigir 8 dígitos. Quem for
 * afrouxar um dos dois números tem de refazer a conta inteira, não só o que está mexendo.
 */
export const TAMANHO_CODIGO = 6;

/** Dez minutos. Tempo de a mensagem chegar e a pessoa digitar, e não mais que isso. */
export const CODIGO_TTL_MS = 10 * 60_000;

/**
 * CINCO TENTATIVAS, E NA QUINTA O CÓDIGO É DESTRUÍDO, não só bloqueado.
 *
 * A diferença não é de palavra: código bloqueado que continua no banco volta a valer no dia em que
 * alguém "conserte" a contagem; código destruído (`invalidado_em` carimbado) não volta por conserto
 * nenhum, e é ele que fecha a conta dos 6 dígitos acima.
 */
export const CODIGO_TENTATIVAS_LIMITE = 5;

/** Três pedidos por hora e dez por dia, POR E-MAIL. O balde é o hash, nunca o endereço. */
export const SOLICITACOES_POR_HORA = 3;
export const SOLICITACOES_POR_DIA = 10;
export const SOLICITACAO_JANELA_MS = 60 * 60_000;
export const SOLICITACAO_JANELA_DIA_MS = 24 * 60 * 60_000;

// ══ O CÓDIGO ════════════════════════════════════════════════════════════════════════════════════

/**
 * SORTEIA O CÓDIGO COM `crypto.randomInt`, e as duas alternativas óbvias estão PROIBIDAS:
 *
 *  - `Math.random` não é criptográfico. O estado do gerador do V8 é recuperável a partir de algumas
 *    saídas, e aqui a saída é a credencial que abre a porta de outra pessoa.
 *  - `randomBytes(n) % 10` tem VIÉS DE MÓDULO: 256 não é múltiplo de 10, então os dígitos 0 a 5
 *    saem 26 vezes em 256 e os dígitos 6 a 9 saem 25. O viés não quebra nada sozinho, mas encolhe o
 *    espaço efetivo de busca de graça, e o conserto custa uma linha.
 *
 * `randomInt(0, 10)` faz a rejeição de amostra por dentro, então o dígito é uniforme por
 * construção. O `padStart` não é decoração: sorteando um número de 6 dígitos inteiro, todo sorteio
 * abaixo de 100000 perderia o zero à esquerda e viraria um código de 5 dígitos, o que reduziria o
 * espaço em 10% sem ninguém notar.
 */
export function gerarCodigo(): string {
  let digitos = "";
  for (let i = 0; i < TAMANHO_CODIGO; i += 1) digitos += String(randomInt(0, 10));
  return digitos.padStart(TAMANHO_CODIGO, "0");
}

/**
 * HMAC-SHA256 DO CÓDIGO, e o que se guarda é ISTO, nunca o código.
 *
 * ┌─ POR QUE HMAC COM SEGREDO, E NÃO UM `sha256` SIMPLES ──────────────────────────────────────┐
 * │ O espaço é de UM MILHÃO de valores. Um `sha256` sem segredo é percorrível inteiro em menos  │
 * │ de um segundo, então a coluna "hasheada" seria o código em claro com passos a mais: quem    │
 * │ lesse a tabela (dump, réplica, backup) leria os códigos vivos. Com HMAC, sem o segredo a    │
 * │ tabela não diz nada, e o segredo não mora no banco.                                         │
 * │                                                                                             │
 * │ O SEGREDO É O `PORTAL_CODIGO_PEPPER`, VARIÁVEL PRÓPRIA, e JAMAIS o `PORTAL_LOG_PEPPER`.     │
 * │ Aquele pepper é o da TRILHA: ele deriva `candidato_hash` a partir do CPF, e a trilha é lida  │
 * │ por gente do time. Compartilhar o segredo faria quem enxerga um dos dois derivar o outro, e  │
 * │ o pior sentido é justamente o que parece inofensivo: com o pepper da trilha em mãos, um      │
 * │ milhão de HMACs revela o código vivo de qualquer pessoa.                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Devolve 64 hex, que é exatamente o `varchar(64)` de `portal_acesso_codigos.codigo_hash`.
 *
 * ┌─ OS DOIS PARÂMETROS PARECEM SIMÉTRICOS E NÃO SÃO, e é por isso que só um é coagido ─────────┐
 * │ `codigo` VEM DO CORPO DO POST: é dado de fora, e dado de fora pode chegar ausente, nulo ou   │
 * │ como número. `createHmac(...).update(undefined)` LANÇA `ERR_INVALID_ARG_TYPE`, e isso viraria │
 * │ um 500 no lugar da recusa neutra. O 500 é informação: ele distingue "corpo estranho" de       │
 * │ "código errado, tente de novo", que é exatamente o oráculo que a porta existe para não ser.   │
 * │ Por isso ele é coagido para texto, e ausente vira string VAZIA. Vazia nunca é código válido   │
 * │ (o código tem `TAMANHO_CODIGO` dígitos), então o digest simplesmente não casa com nada e a    │
 * │ resposta é a mesma de sempre.                                                                 │
 * │                                                                                             │
 * │ `segredo` VEM DO AMBIENTE e é CREDENCIAL: ele continua QUEBRANDO, e alto. Silenciá-lo faria a │
 * │ porta funcionar com HMAC de chave vazia, que é pior do que não funcionar, porque nada falha e │
 * │ a coluna "hasheada" volta a ser percorrível em um segundo. A ausência dele é verificada ANTES,│
 * │ na rota, que responde 503 (fail-closed do `PORTAL_CODIGO_PEPPER`).                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function hashDoCodigo(codigo: string, segredo: string): string {
  const cru = codigo === null || codigo === undefined ? "" : String(codigo);
  return createHmac("sha256", segredo).update(cru, "utf8").digest("hex");
}

/**
 * COMPARAÇÃO EM TEMPO CONSTANTE SOBRE OS DIGESTS, E ELA NÃO VAZA O TAMANHO.
 *
 * `timingSafeEqual` LANÇA quando os buffers têm tamanhos diferentes, e é aí que mora a armadilha:
 * quem tratasse isso com um `if (a.length !== b.length) return false` estaria devolvendo na primeira
 * instrução para um valor e percorrendo 32 bytes para o outro, ou seja, fazendo da própria defesa um
 * canal de tempo sobre o comprimento. Por isso os dois lados passam por um `sha256` antes: a
 * comparação acontece sempre sobre 32 bytes, qualquer que seja a entrada, e o tamanho do que veio
 * de fora deixa de ser observável.
 *
 * Nada aqui compara o CÓDIGO: o que entra são DIGESTS (`hashDoCodigo`). O código cru não atravessa
 * esta função, e é por isso que ela não tem como o expor em mensagem de erro.
 *
 * DOIS VAZIOS DEVOLVEM `false`, e a decisão é deliberada. A requisição nunca produz dois vazios (o
 * lado do candidato é sempre um HMAC de verdade), então isto não é caminho de produção: é a
 * identidade acidental que um refatorador transforma em bypass no dia em que o digest guardado vier
 * nulo de uma coluna nova. `true` para "nada contra nada" é o tipo de resposta que ninguém testa até
 * ela abrir a porta. A conferência de vazio NÃO retorna antes: ela entra no `&&` depois da
 * comparação, então todos os caminhos fazem o mesmo trabalho.
 */
export function codigosIguais(digestA: string, digestB: string): boolean {
  const cruA = digestA === null || digestA === undefined ? "" : String(digestA);
  const cruB = digestB === null || digestB === undefined ? "" : String(digestB);
  const algumVazio = cruA.length === 0 || cruB.length === 0;
  const a = createHash("sha256").update(cruA, "utf8").digest();
  const b = createHash("sha256").update(cruB, "utf8").digest();
  const iguais = timingSafeEqual(a, b);
  return iguais && !algumVazio;
}

/**
 * NORMALIZA O E-MAIL: `trim` e minúsculas, e MAIS NADA.
 *
 * ┌─ ELA NÃO É "GMAIL-AWARE", E ISSO É DECISÃO, NÃO PREGUIÇA ──────────────────────────────────┐
 * │ Remover ponto (`j.silva` = `jsilva`) e cortar no `+` (`j+ea` = `j`) é comportamento DO       │
 * │ GMAIL, e não do e-mail: em muitos provedores `j.silva` e `jsilva` são DUAS PESSOAS           │
 * │ DIFERENTES. Aplicar a régua do Gmail a todos os domínios faria a porta resolver o e-mail de  │
 * │ um candidato para a caixa de outro, que é exatamente a tomada de conta que a v2 existe para  │
 * │ fechar. O que se perde é o candidato que digita `J.Silva@` tendo se cadastrado com `jsilva@`,│
 * │ e esse caso cai na resposta neutra e vai ao RH, que é o lado certo de errar.                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A PARTE LOCAL É SENSÍVEL A MAIÚSCULAS PELA RFC, e mesmo assim baixamos as duas metades: nenhum
 * provedor sério distingue, e o cadastro da casa tem endereço digitado à mão pelo consultor, com
 * maiúscula onde o teclado do celular pôs. Distinguir aqui recusaria gente de verdade.
 */
export function normalizarEmail(email: string): string {
  // COAGIDO PELO MESMO MOTIVO DE `hashDoCodigo`: o endereço vem do corpo do POST, e `undefined.trim`
  // seria um 500 no lugar da resposta única que esta porta promete.
  return (email === null || email === undefined ? "" : String(email)).trim().toLowerCase();
}

/**
 * HASH DO E-MAIL PARA O BALDE, e JAMAIS para a coluna `candidato_hash` da trilha.
 *
 * ┌─ A LINHA QUE NÃO SE CRUZA ─────────────────────────────────────────────────────────────────┐
 * │ `candidato_hash` é `sha256(pepper:"cpf":cpf)` e nada mais, e é ele que indexa                │
 * │ `idx_portal_eventos_candidato`. Escrever hash de E-MAIL naquela coluna envenenaria o índice: │
 * │ a Sala De Segurança passaria a somar, sob uma chave só, eventos de pessoas diferentes (6     │
 * │ e-mails medidos apontam para 12 CPFs), e a pergunta "o que aconteceu com esta pessoa"        │
 * │ passaria a responder sobre um punhado delas. Sem CPF verificado, a coluna fica NULA, que é a │
 * │ resposta honesta.                                                                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RÓTULO `email` ENTRA NO HMAC de propósito: com o mesmo segredo e sem rótulo, o hash de um
 * e-mail e o hash de um código de 6 dígitos vivem no mesmo espaço, e um vale de confirmação para o
 * outro no dia em que alguém trocar os argumentos de lugar.
 */
export function hashDoEmail(email: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`email:${normalizarEmail(email)}`).digest("hex");
}

// ══ A TRAVA DE DIVERGÊNCIA ══════════════════════════════════════════════════════════════════════

export type CampoDivergente = "CPF" | "DATA_NASCIMENTO";

/** Só dígitos: o candidato digita com ponto e traço, e a base guarda só número. */
function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** `yyyy-mm-dd` aparado. A coluna `date` do Postgres chega assim pelo driver. */
function dataNormalizada(valor: string | null | undefined): string {
  return (valor ?? "").trim().slice(0, 10);
}

/**
 * O QUE O CANDIDATO INFORMOU DISCORDA DO QUE A FICHA DO FUNIL JÁ TEM?
 *
 * ┌─ CAMPO AUSENTE NO REGISTRO NÃO É DIVERGÊNCIA: É DADO SENDO PREENCHIDO ─────────────────────┐
 * │ É o caso NORMAL desta porta, e não a exceção: a população-alvo é exatamente quem tem `cpf`  │
 * │ nulo. Tratar nulo como discordância travaria todo mundo que a porta existe para atender.     │
 * │                                                                                             │
 * │ E É PRECISAMENTE POR ISSO QUE A TRAVA SOZINHA NÃO SEGURA NADA, o que a auditoria provou      │
 * │ contra a v1: com os dois campos nulos, `divergencias` devolve lista VAZIA para QUALQUER CPF  │
 * │ digitado. O que segura é a estrutura da v2 (a admissão vem do VÍNCULO, nunca de busca por    │
 * │ CPF) mais a consulta de `CPF_DE_OUTRO_CANDIDATO`. Quem ler esta função como "a defesa" vai   │
 * │ reintroduzir o furo.                                                                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM RETORNO ANTECIPADO, e os DOIS campos são avaliados SEMPRE. Um `if (cpf diverge) return` faria
 * o tempo da resposta contar qual campo bateu: quem varre datas de nascimento saberia, pelo relógio,
 * que o CPF que digitou é o certo. O trabalho extra é de duas comparações de string, e o que se
 * compra é um oráculo a menos.
 *
 * NOME NÃO ENTRA, e não é esquecimento: o candidato não digita nome nesta porta, então não há o que
 * comparar. Acrescentá-lo exigiria pedir o nome, e pedir o nome transformaria a recusa neutra num
 * teste de adivinhação sobre o cadastro.
 */
export function divergencias(
  informado: { cpf: string; dataNascimento: string },
  registrado: { cpf?: string | null; dataNascimento?: string | null },
): CampoDivergente[] {
  const cpfRegistrado = soDigitos(registrado.cpf);
  const nascimentoRegistrado = dataNormalizada(registrado.dataNascimento);

  const cpfDiverge = cpfRegistrado.length > 0 && cpfRegistrado !== soDigitos(informado.cpf);
  const nascimentoDiverge =
    nascimentoRegistrado.length > 0 && nascimentoRegistrado !== dataNormalizada(informado.dataNascimento);

  const achados: CampoDivergente[] = [];
  if (cpfDiverge) achados.push("CPF");
  if (nascimentoDiverge) achados.push("DATA_NASCIMENTO");
  return achados;
}

/**
 * OS MOTIVOS DA TRAVA, REUSADOS DO CONTRATO COMPARTILHADO e NÃO redigitados aqui.
 *
 * Duas cópias do mesmo vocabulário concordam por coincidência e param de concordar em silêncio: a
 * tela lê `MOTIVO_DA_TRAVA_LABEL` de `@ea/shared-types`, e um motivo novo escrito só aqui chegaria
 * lá sem rótulo. O contrato usa o nome curto (`MOTIVOS_DA_TRAVA`) dentro do domínio, então o
 * apelido fica explícito, com um dono só do lado do valor.
 */
export const MOTIVOS_DA_TRAVA = MOTIVOS_DA_TRAVA_DE_ACESSO;
export type MotivoDaTrava = MotivoDaTravaDeAcesso;

export type DecisaoDaIdentidade =
  | { tipo: "OK" }
  | { tipo: "TRAVAR"; motivo: MotivoDaTrava }
  | { tipo: "CPF_INVALIDO" }
  | { tipo: "BILHETE_MORTO" };

/**
 * ══ A DECISÃO, E A ORDEM DAS PERGUNTAS É A REGRA (precedência NORMATIVA do contrato, seção 3) ══
 *
 * Ela decide SEM CONSULTAR NADA: recebe o estado já lido. É o mesmo desenho de
 * `decisaoDaIdentificacao` (`domain/portal-identidade.ts`), e pelo mesmo motivo: régua que faz I/O
 * só se prova com banco, e aí ninguém varre a tabela de combinações.
 *
 * A ORDEM FOI FECHADA PELO `tester` A PARTIR DO REQUISITO, ANTES DE EXISTIR CÓDIGO, e cada degrau
 * tem razão própria. Quem for reordenar precisa derrubar a razão, não só achar outra ordem mais
 * bonita:
 *
 * 1. `BILHETE_MORTO` PRIMEIRO, autenticação antes de tudo. Se a divergência vencesse, quem NÃO tem
 *    bilhete válido conseguiria GRAVAR TRAVA no candidato de outra pessoa: negação de serviço COM
 *    ESCRITA, e a fila de destrave do time viraria brinquedo de quem quisesse enchê-la.
 * 2. `TRAVA_ANTERIOR`, porque estando travado nada é reavaliado. Reavaliar permitiria SOBRESCREVER
 *    o motivo original e apagar da trilha o que de fato travou, que é justamente o que a fila
 *    precisa saber para destravar com conhecimento.
 * 3. `CPF_INVALIDO` antes das comparações: comparar dígito verificador errado com o cadastro não
 *    quer dizer nada, e travar por erro de digitação do PRÓPRIO candidato encheria a fila de ruído.
 *    Isso ele corrige sozinho na tela, e é o único desfecho desta função que não custa trabalho a
 *    ninguém do time.
 * 4. `CPF_DE_OUTRO_CANDIDATO` antes da divergência: é o caso mais grave (dois candidatos disputando
 *    o mesmo CPF) e ele é CONSULTADO antes de tentar escrever, em vez de esperar a violação de
 *    `uq_as_candidatos_cpf`. O `catch` do 23505 continua existindo no serviço, como rede, e
 *    desemboca nesta MESMA linha.
 * 5. `DIVERGENCIA_CADASTRO`, por último entre as travas.
 * 6. `OK` só quando tudo está limpo.
 *
 * `EMAIL_AMBIGUO` NÃO ENTRA AQUI: ele é decidido em `solicitar`, quando o e-mail resolve para mais
 * de um candidato, e naquele ponto não existe bilhete nem CPF. Pôr um degrau para ele nesta função
 * criaria um caminho morto que alguém tentaria alimentar depois.
 *
 * O CAMPO DIVERGENTE NÃO ATRAVESSA. A decisão diz que travou e por qual MOTIVO de catálogo, nunca
 * qual campo bateu: dizer "o CPF divergiu" é confirmar a quem tentou que o outro dado está certo.
 */
export function decisaoDaIdentidade(entrada: {
  bilheteVivo: boolean;
  cpfValido: boolean;
  jaTravado: boolean;
  cpfDeOutro: boolean;
  divergentes: readonly CampoDivergente[];
}): DecisaoDaIdentidade {
  if (!entrada.bilheteVivo) return { tipo: "BILHETE_MORTO" };
  if (entrada.jaTravado) return { tipo: "TRAVAR", motivo: "TRAVA_ANTERIOR" };
  if (!entrada.cpfValido) return { tipo: "CPF_INVALIDO" };
  if (entrada.cpfDeOutro) return { tipo: "TRAVAR", motivo: "CPF_DE_OUTRO_CANDIDATO" };
  if (entrada.divergentes.length > 0) return { tipo: "TRAVAR", motivo: "DIVERGENCIA_CADASTRO" };
  return { tipo: "OK" };
}
