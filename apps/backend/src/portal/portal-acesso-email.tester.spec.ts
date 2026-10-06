import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOTIVOS_DA_TRAVA_DE_ACESSO,
  SITUACOES_DO_ACESSO_POR_EMAIL,
  isValidCpf,
  type ConfirmacaoDeCodigoResposta,
  type IdentidadeDoAcessoResposta,
  type SolicitacaoDeCodigoResposta,
} from "@ea/shared-types";
import {
  CODIGO_TENTATIVAS_LIMITE,
  CODIGO_TTL_MS,
  MOTIVOS_DA_TRAVA,
  SOLICITACAO_JANELA_DIA_MS,
  SOLICITACAO_JANELA_MS,
  SOLICITACOES_POR_DIA,
  SOLICITACOES_POR_HORA,
  TAMANHO_CODIGO,
  codigosIguais,
  decisaoDaIdentidade,
  divergencias,
  gerarCodigo,
  hashDoCodigo,
  hashDoEmail,
  normalizarEmail,
  type CampoDivergente,
  type DecisaoDaIdentidade,
} from "../domain/portal-acesso-email";

/**
 * COBERTURA INDEPENDENTE (§A.38) do acesso ao Portal por e-mail, CONTRATO v2.
 *
 * Escrito pelo `tester` a partir do REQUISITO e de `docs/CONTRATO-PORTAL-ACESSO-EMAIL.md` (v2, a
 * que a auditoria aceitou) e de `docs/MAPA-ALCANCE-PORTAL-ACESSO-POR-EMAIL.md`, ANTES de
 * `domain/portal-acesso-email.ts` existir (§A.40 regra 2). Falhar na importação enquanto o módulo
 * não existe é o comportamento esperado deste arquivo, não defeito dele: nenhum import está
 * comentado e nenhum stub foi criado, porque teste que se acomoda à ausência do código não prova
 * nada.
 *
 * O REQUISITO, na redação do diretor: o candidato sem CPF não consegue entrar no Portal. Ele informa
 * o e-mail, recebe um código naquele e-mail, informa CPF e data de nascimento (que passam a ser
 * GRAVADOS), e dado que DIVERGIR trava. Qualquer usuário do Soul ADM destrava, com trilha. O caminho
 * de hoje (link + CPF + nascimento) não muda.
 *
 * O QUE A v2 MUDOU, e que este arquivo passa a trancar: o desfecho de sucesso NÃO é sessão do
 * Portal, é LINK ENVIADO por e-mail. A v1 foi vetada por emitir sessão a partir da posse da caixa,
 * e a medição da auditoria explica por quê: 6 e-mails são compartilhados por 12 CPFs em produção, 5
 * deles com dois nomes diferentes. Posse de caixa não prova identidade. Por isso `mascararNome`
 * saiu do contrato, e no lugar dela este arquivo tranca a AUSÊNCIA dos campos da pessoa na resposta.
 *
 * ┌─ POR QUE NENHUM NÚMERO DE POLÍTICA APARECE ESCRITO AQUI ─────────────────────────────────────┐
 * │ TTL, tetos e tamanho do código são normativos da auditoria e podem ser reajustados. Este      │
 * │ arquivo IMPORTA as constantes e asserta PROPRIEDADES sobre elas (relações entre tetos,        │
 * │ divisibilidade, orçamento de força bruta). Teste que fixa "6 dígitos" ou "10 minutos" quebra  │
 * │ sozinho no dia do reajuste, e teste que quebra sem defeito treina o time a ignorar vermelho.  │
 * │ O que ele NÃO deixa reajustar em silêncio é a CONTA: afrouxar um teto sem mexer no tamanho do │
 * │ código quebra a propriedade de força bruta, que é exatamente o efeito desejado.               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Espaço de códigos possíveis. Derivado da constante, nunca escrito à mão. */
const ESPACO_DO_CODIGO = 10 ** TAMANHO_CODIGO;

/** Conversões de unidade, não números de política. */
const UM_MINUTO_MS = 60_000;

/**
 * Volume da amostra estatística. É número de HARNESS (poder da medição), não de política: mudar este
 * valor não muda regra nenhuma do sistema.
 *
 * ┌─ POR QUE 20.000, E ONDE ESTAVAM OS 27 SEGUNDOS (medido, não estimado) ──────────────────────┐
 * │ O custo NÃO era a amostra. Gerar 60.000 códigos com `crypto.randomInt` custa 244 ms medidos;  │
 * │ o que custava 10,2 s era UM teste que chamava `expect` duas vezes POR CÓDIGO, 120.000 vezes,  │
 * │ e cada `expect` do vitest tem custo próprio. Os laços passaram a CONTAR os desvios e a asserir│
 * │ UMA vez, o que resolve o tempo sem tirar nada da prova.                                       │
 * │ A amostra caiu para 20.000 por cima disso, e a conta do poder está no bloco abaixo.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const AMOSTRA = 20_000;

/**
 * Limite do chi-quadrado com 9 graus de liberdade (10 dígitos possíveis menos 1) no quantil 0,9999.
 * Sob uniformidade, a chance de ESTE teste acusar viés sem haver viés é de 1 em 10.000 execuções,
 * que é o que mantém a suíte estável.
 *
 * ┌─ A CONTA DO PODER COM 20.000 AMOSTRAS, para ninguém achar que a amostra caiu só por pressa ─┐
 * │ O poder do chi-quadrado depende do parâmetro de não centralidade λ = N * Σ (p_i - 1/10)² * 10.│
 * │                                                                                              │
 * │  - um dígito que NUNCA sai:            Σ = 0,1111  ->  λ = 2.222   -> detecção praticamente 1 │
 * │  - último dígito sempre PAR:           Σ = 1,0     ->  λ = 20.000  -> detecção 1              │
 * │  - gerador que cobre metade da faixa:  Σ = 1,0     ->  λ = 20.000  -> detecção 1              │
 * │  - par de dígitos desviando 1,4 ponto percentual (14% relativo): λ ≈ 75 -> detecção 99%       │
 * │                                                                                              │
 * │ Ou seja: com 20.000 o teste pega, com 99% de chance, qualquer desvio de cerca de 14% relativo │
 * │ para cima em um dígito; com 60.000 pegaria a partir de 8%. A diferença entre 14% e 8% NÃO é o │
 * │ que este teste existe para achar, e a razão é medida: o único viés realista mais fino que     │
 * │ isso é o de módulo de BYTE (256 % 10, que privilegia 0 a 5 em 4%), e ele dá λ = 7,3 em 20.000 │
 * │ contra λ = 22 em 60.000, ou seja detecção de 1% contra 40%. Nem com 60.000 havia prova ali,   │
 * │ havia moeda ao ar, então a redução não perdeu garantia nenhuma: perdeu um sorteio.            │
 * │                                                                                              │
 * │ Quem garante a ausência DESSE viés é outra coisa, e ela é determinística: o `crypto.randomInt`│
 * │ exigido pelo contrato, provado pelo teste de fonte (o gerador não pode nem TOCAR em           │
 * │ `Math.random`) e pela leitura estrutural do módulo.                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const CHI_QUADRADO_LIMITE_9GL = 33.72;

const MODULO_DO_DOMINIO = join(__dirname, "../domain/portal-acesso-email.ts");
const FONTE_DO_SHARED_TYPES = join(__dirname, "../../../../packages/shared-types/src/index.ts");

let cacheDaAmostra: string[] | null = null;

/** Gera a amostra grande uma única vez, sob demanda, para não pesar a coleta dos outros testes. */
function amostraDeCodigos(): string[] {
  if (!cacheDaAmostra) cacheDaAmostra = Array.from({ length: AMOSTRA }, () => gerarCodigo());
  return cacheDaAmostra;
}

function contarPorDigito(valores: string[], posicao: "primeiro" | "ultimo"): number[] {
  const contagem = new Array<number>(10).fill(0);
  for (const v of valores) {
    const d = Number(posicao === "primeiro" ? v[0] : v[v.length - 1]);
    if (Number.isInteger(d) && d >= 0 && d <= 9) contagem[d] += 1;
  }
  return contagem;
}

function chiQuadrado(contagem: number[], total: number): number {
  const esperado = total / contagem.length;
  return contagem.reduce((acc, obs) => acc + (obs - esperado) ** 2 / esperado, 0);
}

/** Lê o corpo de uma interface do `shared-types` e devolve só os NOMES dos campos declarados. */
function camposDaInterface(nome: string): string[] {
  const fonte = readFileSync(FONTE_DO_SHARED_TYPES, "utf8");
  const marca = `export interface ${nome} {`;
  const inicio = fonte.indexOf(marca);
  expect(inicio, `interface ${nome} não encontrada no shared-types`).toBeGreaterThan(-1);
  const corpo = fonte.slice(inicio + marca.length);
  const fim = corpo.indexOf("\n}");
  expect(fim, `fim da interface ${nome} não encontrado`).toBeGreaterThan(-1);
  return corpo
    .slice(0, fim)
    .split("\n")
    .map((linha) => /^\s*(\w+)\??\s*:/.exec(linha))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]);
}

const SEGREDO_A = "segredo-de-teste-A-8f3c1d2e4b5a6978";
const SEGREDO_B = "segredo-de-teste-B-1a2b3c4d5e6f7089";

/** CPFs de dígito verificador CORRETO, os dois clássicos de teste, distintos entre si. */
const CPF_VALIDO = "52998224725";
const OUTRO_CPF_VALIDO = "11144477735";
const DATA_REGISTRADA = "1990-05-17";

type EntradaDaDecisao = {
  bilheteVivo: boolean;
  cpfValido: boolean;
  jaTravado: boolean;
  cpfDeOutro: boolean;
  divergentes: readonly CampoDivergente[];
};

/**
 * PRECEDÊNCIA DE REFERÊNCIA, derivada do requisito e da seção 5 da v2, não copiada da implementação
 * (que ainda não existe). O contrato manda "PRECEDENCIA FIXA, testada item a item" e lista os
 * resultados, mas NÃO escreve a ordem entre eles. A ordem abaixo é a que a segurança impõe, e está
 * reportada ao coordenador como lacuna do contrato: se a construção escolher outra, é conversa com
 * ele, não ajuste silencioso deste arquivo.
 *
 * 1. BILHETE MORTO vence tudo. Autenticação antes de qualquer avaliação: se a divergência vencesse
 *    aqui, um chamador SEM bilhete válido GRAVARIA trava no candidato de outra pessoa, que é
 *    negação de serviço com escrita, e a fila do time viraria brinquedo de quem quisesse enchê-la.
 * 2. JÁ TRAVADO em seguida. Enquanto travado nada é reavaliado: reavaliar permitiria sobrescrever o
 *    motivo original, apagando da trilha o que de fato travou (a tabela guarda UMA trava por
 *    candidato, `unique` em `as_candidato_id`).
 * 3. CPF INVÁLIDO antes de comparar com a base, e é a primeira linha da tabela da seção 5. Comparar
 *    dígito verificador errado com o cadastro não tem sentido, e travar por erro de digitação do
 *    próprio candidato encheria a fila de destrave de ruído que ele corrige sozinho na tela.
 * 4. CPF DE OUTRO CANDIDATO antes da divergência: é o achado mais grave (dois candidatos disputando
 *    o mesmo CPF, `uq_as_candidatos_cpf`) e é o que a gravação consulta ANTES de tentar escrever.
 * 5. DIVERGÊNCIA de cadastro por último.
 * 6. OK somente quando absolutamente tudo está limpo.
 */
function decisaoEsperada(e: EntradaDaDecisao): DecisaoDaIdentidade {
  if (!e.bilheteVivo) return { tipo: "BILHETE_MORTO" };
  if (e.jaTravado) return { tipo: "TRAVAR", motivo: "TRAVA_ANTERIOR" };
  if (!e.cpfValido) return { tipo: "CPF_INVALIDO" };
  if (e.cpfDeOutro) return { tipo: "TRAVAR", motivo: "CPF_DE_OUTRO_CANDIDATO" };
  if (e.divergentes.length > 0) return { tipo: "TRAVAR", motivo: "DIVERGENCIA_CADASTRO" };
  return { tipo: "OK" };
}

const LIMPO: EntradaDaDecisao = {
  bilheteVivo: true,
  cpfValido: true,
  jaTravado: false,
  cpfDeOutro: false,
  divergentes: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("constantes: propriedades, nunca valores", () => {
  it("REQUISITO: todas as constantes da v2 existem como inteiro positivo e finito (sem elas o caminho novo não tem régua)", () => {
    for (const [nome, valor] of Object.entries({
      TAMANHO_CODIGO,
      CODIGO_TTL_MS,
      CODIGO_TENTATIVAS_LIMITE,
      SOLICITACOES_POR_HORA,
      SOLICITACOES_POR_DIA,
      SOLICITACAO_JANELA_MS,
      SOLICITACAO_JANELA_DIA_MS,
    })) {
      expect(Number.isFinite(valor), nome).toBe(true);
      expect(Number.isInteger(valor), nome).toBe(true);
      expect(valor, nome).toBeGreaterThan(0);
    }
  });

  it("REQUISITO (a conta que sustenta o tamanho do código): 1 dia de chutes fica abaixo de 1 em 10.000", () => {
    // Esta é a conta da auditoria, seção 2 da v2: solicitações por dia vezes tentativas por código,
    // contra o espaço do código. Ela é o que impede alguém de afrouxar UM teto sozinho depois:
    // subir as solicitações diárias ou as tentativas sem aumentar o tamanho do código quebra aqui,
    // e quebra ANTES de chegar em produção.
    const chutesPorDia = SOLICITACOES_POR_DIA * CODIGO_TENTATIVAS_LIMITE;
    expect(chutesPorDia / ESPACO_DO_CODIGO).toBeLessThanOrEqual(1e-4);
  });

  it("REQUISITO: a mesma conta na janela de HORA também fecha (o teto curto não pode ser mais frouxo que o diário)", () => {
    const chutesPorHora = SOLICITACOES_POR_HORA * CODIGO_TENTATIVAS_LIMITE;
    expect(chutesPorHora / ESPACO_DO_CODIGO).toBeLessThanOrEqual(1e-4);
    expect(chutesPorHora).toBeLessThanOrEqual(SOLICITACOES_POR_DIA * CODIGO_TENTATIVAS_LIMITE);
  });

  it("REQUISITO: o tempo até 50% de chance de acerto é de MILHARES de dias, e cada dia custa e-mail na caixa da vítima", () => {
    // Forma equivalente da conta, expressa como a auditoria a escreveu (tempo para 50%). Fica como
    // propriedade derivada das constantes. NOTA REPORTADA AO COORDENADOR: o número citado no
    // contrato (cerca de 1.380 dias) corresponde a um espaço de 10^5, não de 10^6; com 6 dígitos o
    // resultado é cerca de dez vezes maior. O erro é para o lado conservador, então a escolha de 6
    // dígitos continua de pé, mas a conta escrita lá não fecha com os próprios números dela.
    const probabilidadePorDia = (SOLICITACOES_POR_DIA * CODIGO_TENTATIVAS_LIMITE) / ESPACO_DO_CODIGO;
    const diasPara50 = Math.log(2) / probabilidadePorDia;
    expect(diasPara50).toBeGreaterThan(1_000);
  });

  it("REQUISITO (resposta única anti-enumeração): o TTL é minuto exato, porque `expiraEmMinutos` volta igual nos dois caminhos", () => {
    // A rota `solicitar` devolve `{ enviado: true, expiraEmMinutos }` sempre idêntico, calculado na
    // PRIMEIRA linha do método (seção 1 da v2). TTL que não fosse múltiplo de minuto exigiria
    // arredondamento, e arredondamento é o tipo de detalhe que difere entre dois caminhos de código
    // e vira canal de enumeração.
    expect(CODIGO_TTL_MS % UM_MINUTO_MS).toBe(0);
    expect(CODIGO_TTL_MS / UM_MINUTO_MS).toBeGreaterThanOrEqual(1);
  });

  it("REQUISITO: o código morre DENTRO da janela curta de solicitação (senão os códigos se acumulam entre janelas)", () => {
    // Se o TTL passasse da janela, um alvo acumularia códigos vivos de janelas diferentes e o número
    // de chutes simultâneos deixaria de ser o que a conta acima mede.
    expect(CODIGO_TTL_MS).toBeLessThanOrEqual(SOLICITACAO_JANELA_MS);
  });

  it("REQUISITO: as duas janelas são coerentes, e o teto diário de fato MORDE", () => {
    // Teto diário maior que o horário multiplicado pelas horas do dia seria letra morta: nunca
    // dispararia, e a conta de força bruta por dia passaria a valer só no papel.
    expect(SOLICITACAO_JANELA_MS).toBeLessThan(SOLICITACAO_JANELA_DIA_MS);
    expect(SOLICITACAO_JANELA_DIA_MS % SOLICITACAO_JANELA_MS).toBe(0);
    const janelasPorDia = SOLICITACAO_JANELA_DIA_MS / SOLICITACAO_JANELA_MS;
    expect(SOLICITACOES_POR_DIA).toBeLessThan(SOLICITACOES_POR_HORA * janelasPorDia);
    expect(SOLICITACOES_POR_HORA).toBeLessThanOrEqual(SOLICITACOES_POR_DIA);
  });

  it("REQUISITO (a porta precisa ser USÁVEL): os tetos admitem ao menos um pedido e uma tentativa", () => {
    // Teto zero deixaria o caminho novo inerte, e candidato sem CPF continuaria sem entrar, que é o
    // problema que a frente existe para resolver.
    expect(CODIGO_TENTATIVAS_LIMITE).toBeGreaterThanOrEqual(1);
    expect(SOLICITACOES_POR_HORA).toBeGreaterThanOrEqual(1);
    expect(SOLICITACOES_POR_DIA).toBeGreaterThanOrEqual(1);
  });

  it("REQUISITO: um único palpite é improvável no espaço escolhido", () => {
    expect(1 / ESPACO_DO_CODIGO).toBeLessThanOrEqual(1e-3);
  });
});

describe("gerarCodigo", () => {
  it("REQUISITO: o código tem exatamente TAMANHO_CODIGO dígitos e só dígitos", () => {
    // O laço CONTA e asserta UMA vez, e isso não é estilo: `expect` por item custava 10,2 s aqui
    // (duas chamadas vezes a amostra). Quando quebra, a mensagem carrega o primeiro contraexemplo,
    // que é a única coisa que o `expect` por item dava de útil.
    const soDigitos = new RegExp(`^[0-9]{${TAMANHO_CODIGO}}$`);
    const fora = amostraDeCodigos().filter((c) => !soDigitos.test(c));
    expect(fora.length, `códigos fora do formato, primeiro: ${fora[0] ?? "(nenhum)"}`).toBe(0);
  });

  it("REQUISITO: zeros à esquerda são preservados (código é TEXTO, não número)", () => {
    // Implementação que formata um inteiro sem preencher à esquerda produz código curto e encolhe o
    // espaço dez vezes por zero perdido, o que arruina a conta de força bruta sem falhar em nada.
    expect(amostraDeCodigos().filter((c) => c.startsWith("0")).length).toBeGreaterThan(0);
  });

  it("REQUISITO (contrato: `crypto.randomInt`, nunca `Math.random`): o gerador nem TOCA em Math.random", () => {
    // Math.random não é fonte de credencial: é previsível a partir de saídas observadas. A asserção é
    // dupla de propósito: o espião não pode ser chamado, E o resultado tem de variar mesmo com o
    // Math.random preso num valor fixo, que é o que denunciaria um gerador disfarçado.
    const espiao = vi.spyOn(Math, "random").mockReturnValue(0.4242424242);
    const codigos = Array.from({ length: 200 }, () => gerarCodigo());
    expect(espiao).not.toHaveBeenCalled();
    expect(new Set(codigos).size).toBeGreaterThan(1);
  });

  it("REQUISITO (sem viés): a distribuição do PRIMEIRO dígito não se afasta do uniforme", () => {
    const contagem = contarPorDigito(amostraDeCodigos(), "primeiro");
    expect(contagem.reduce((a, b) => a + b, 0)).toBe(AMOSTRA);
    for (let d = 0; d <= 9; d += 1) expect(contagem[d], `digito ${d}`).toBeGreaterThan(0);
    expect(chiQuadrado(contagem, AMOSTRA)).toBeLessThan(CHI_QUADRADO_LIMITE_9GL);
  });

  it("REQUISITO (sem viés): a distribuição do ÚLTIMO dígito não se afasta do uniforme", () => {
    // O último dígito é onde o viés costuma aparecer, porque é nele que cai a implementação que faz
    // resto de divisão por 10 sobre um intervalo que não é múltiplo de 10.
    const contagem = contarPorDigito(amostraDeCodigos(), "ultimo");
    expect(contagem.reduce((a, b) => a + b, 0)).toBe(AMOSTRA);
    for (let d = 0; d <= 9; d += 1) expect(contagem[d], `digito ${d}`).toBeGreaterThan(0);
    expect(chiQuadrado(contagem, AMOSTRA)).toBeLessThan(CHI_QUADRADO_LIMITE_9GL);
  });

  it("REQUISITO (entropia real, não contador): a variedade da amostra bate com o esperado do aniversário", () => {
    // Fonte uniforme com reposição repete alguns valores em amostra grande, e quantos DISTINTOS ela
    // produz é conhecido: ESPACO * (1 - e^(-N/ESPACO)). A régua é derivada da constante, então
    // continua valendo se o tamanho do código mudar.
    const distintos = new Set(amostraDeCodigos()).size;
    const esperado = ESPACO_DO_CODIGO * -Math.expm1(-AMOSTRA / ESPACO_DO_CODIGO);
    expect(distintos).toBeGreaterThanOrEqual(Math.floor(esperado * 0.98));
    expect(distintos).toBeLessThanOrEqual(AMOSTRA);
  });

  it("REQUISITO (entropia real, não contador): a sequência não é crescente nem tem passo constante", () => {
    // Um contador passa no teste de tamanho, no de dígitos e até no de variedade quando o espaço é
    // grande. O que o denuncia é a ORDEM: sequência aleatória desce em cerca de metade dos pares
    // consecutivos, e contador nunca desce.
    const numeros = amostraDeCodigos().map((c) => Number(c));
    let descidas = 0;
    let passosIguais = 0;
    for (let i = 1; i < numeros.length; i += 1) {
      if (numeros[i] < numeros[i - 1]) descidas += 1;
      if (i > 1 && numeros[i] - numeros[i - 1] === numeros[i - 1] - numeros[i - 2]) passosIguais += 1;
    }
    expect(descidas).toBeGreaterThan(numeros.length * 0.2);
    expect(passosIguais).toBeLessThan(numeros.length * 0.5);
  });

  it("REQUISITO (entropia real): códigos CONSECUTIVOS praticamente não se repetem, dentro do esperado do espaço", () => {
    // Repetição consecutiva é possível numa fonte honesta, e a régua é o esperado de Poisson da
    // própria amostra com folga de seis desvios. Exigir zero obrigaria o gerador a guardar o código
    // anterior, o que é estado desnecessário, e tornaria o teste instável em espaço pequeno.
    const codigos = amostraDeCodigos();
    let iguaisSeguidos = 0;
    for (let i = 1; i < codigos.length; i += 1) if (codigos[i] === codigos[i - 1]) iguaisSeguidos += 1;
    const esperado = (codigos.length - 1) / ESPACO_DO_CODIGO;
    expect(iguaisSeguidos).toBeLessThanOrEqual(esperado + 6 * Math.sqrt(esperado) + 6);
  });
});

describe("hashDoCodigo: HMAC-SHA256, e o código nunca guardado", () => {
  it("REQUISITO (§A.6): o digest NUNCA contém o código", () => {
    // Mesma razão do laço anterior: conta e asserta uma vez, com o contraexemplo na mensagem.
    const vazando = amostraDeCodigos()
      .slice(0, 2_000)
      .filter((codigo) => hashDoCodigo(codigo, SEGREDO_A).includes(codigo));
    expect(vazando.length, `digests contendo o código, primeiro: ${vazando[0] ?? "(nenhum)"}`).toBe(0);
  });

  it("REQUISITO: segredo diferente muda o digest (o segredo participa de verdade)", () => {
    const codigo = amostraDeCodigos()[0];
    expect(hashDoCodigo(codigo, SEGREDO_A)).not.toBe(hashDoCodigo(codigo, SEGREDO_B));
    // E um segredo vazio não pode dar o mesmo que um segredo de verdade, senão a ausência de
    // configuração passaria despercebida em vez de deixar a rota inerte (seção 2 da v2, 503).
    expect(hashDoCodigo(codigo, "")).not.toBe(hashDoCodigo(codigo, SEGREDO_A));
  });

  it("REQUISITO: mesmo par código e segredo é estável (a conferência do código depende disso)", () => {
    expect(hashDoCodigo("098765", SEGREDO_A)).toBe(hashDoCodigo("098765", SEGREDO_A));
  });

  it("REQUISITO: é HMAC, e NÃO sha256 simples de concatenação", () => {
    // A v2 trocou sha256 por HMAC-SHA256 com segredo próprio. Sha256 de concatenação é o que se faz
    // por engano, e além de não ser HMAC abre extensão de comprimento. As quatro receitas abaixo são
    // as que aparecem quando alguém "só hasheia com o pepper".
    const codigo = "123456";
    const digest = hashDoCodigo(codigo, SEGREDO_A);
    const receitasIngenuas = [
      createHash("sha256").update(`${SEGREDO_A}${codigo}`).digest("hex"),
      createHash("sha256").update(`${SEGREDO_A}:${codigo}`).digest("hex"),
      createHash("sha256").update(`${codigo}${SEGREDO_A}`).digest("hex"),
      createHash("sha256").update(codigo).digest("hex"),
    ];
    for (const ingenua of receitasIngenuas) expect(digest).not.toBe(ingenua);
  });

  it("REQUISITO: é a construção canônica do contrato, HMAC-SHA256 com o SEGREDO como chave e o CÓDIGO como mensagem", () => {
    // Leitura literal de "HMAC-SHA256(segredo, codigo)" (seção 2 da v2). Se a construção decidir
    // etiquetar a mensagem com um domínio (algo como "portal-acesso-email:" antes do código), o que
    // seria uma melhoria, ESTE é o único teste a rever, e a revisão passa pelo coordenador, não por
    // ajuste silencioso. Reportado.
    const codigo = "123456";
    expect(hashDoCodigo(codigo, SEGREDO_A)).toBe(
      createHmac("sha256", SEGREDO_A).update(codigo, "utf8").digest("hex"),
    );
  });

  it("REQUISITO: o código é tratado como TEXTO (zero à esquerda não colapsa)", () => {
    // Implementação que converte para número antes de hashear faz "000123" e "123" virarem a mesma
    // coisa, e o teto de tentativas passaria a valer para vários códigos ao mesmo tempo.
    expect(hashDoCodigo("000123", SEGREDO_A)).not.toBe(hashDoCodigo("123", SEGREDO_A));
    expect(hashDoCodigo("000123", SEGREDO_A)).not.toBe(hashDoCodigo("0123", SEGREDO_A));
  });

  it("REQUISITO: códigos diferentes dão digests diferentes (o hash não achata a entrada)", () => {
    const entradas = amostraDeCodigos().slice(0, 2_000);
    expect(new Set(entradas.map((c) => hashDoCodigo(c, SEGREDO_A))).size).toBe(new Set(entradas).size);
  });

  it("REQUISITO: o digest tem tamanho FIXO, hexadecimal minúsculo, e cabe em `varchar(64)`", () => {
    const entradas = ["", "1", "000000", "9".repeat(5_000), "ç ã +"];
    const tamanhos = new Set<number>();
    for (const entrada of entradas) {
      const h = hashDoCodigo(entrada, SEGREDO_A);
      expect(h).toMatch(/^[0-9a-f]+$/);
      tamanhos.add(h.length);
    }
    expect(tamanhos.size, "tamanho do digest varia com a entrada").toBe(1);
    const tamanho = [...tamanhos][0];
    expect(tamanho).toBeLessThanOrEqual(64);
    expect(tamanho).toBeGreaterThanOrEqual(32);
  });

  it("BORDA: entrada vazia, nula e com espaço não estouram (o corpo do POST vem de fora)", () => {
    const nulo = null as unknown as string;
    const indefinido = undefined as unknown as string;
    for (const entrada of ["", "   ", nulo, indefinido]) {
      expect(() => hashDoCodigo(entrada, SEGREDO_A)).not.toThrow();
      expect(hashDoCodigo(entrada, SEGREDO_A)).toMatch(/^[0-9a-f]+$/);
    }
  });
});

describe("codigosIguais: comparação em tempo constante", () => {
  it("REQUISITO: digests iguais devolvem true, e a comparação é simétrica", () => {
    const digest = hashDoCodigo("123456", SEGREDO_A);
    expect(codigosIguais(digest, digest)).toBe(true);
    expect(codigosIguais(digest, hashDoCodigo("123456", SEGREDO_A))).toBe(true);
    expect(codigosIguais(hashDoCodigo("123456", SEGREDO_A), digest)).toBe(true);
  });

  it("REQUISITO: digests de códigos diferentes devolvem false, nos dois sentidos", () => {
    const a = hashDoCodigo("123456", SEGREDO_A);
    const b = hashDoCodigo("123457", SEGREDO_A);
    expect(codigosIguais(a, b)).toBe(false);
    expect(codigosIguais(b, a)).toBe(false);
  });

  it("REQUISITO: digests de TAMANHOS DIFERENTES devolvem false SEM ESTOURAR", () => {
    // Este é o defeito clássico do caminho de tempo constante: `crypto.timingSafeEqual` LANÇA quando
    // os buffers têm tamanhos diferentes. Sem a guarda de tamanho, um `codigo_hash` truncado na
    // coluna, ou um valor herdado de outro formato, viraria erro 500 em vez de recusa, e o 500 é
    // informação a mais para quem sonda. A guarda tem de comparar tamanho ANTES, e sem lançar.
    const digest = hashDoCodigo("123456", SEGREDO_A);
    for (const outro of [digest.slice(0, 10), `${digest}00`, "a", ""]) {
      expect(() => codigosIguais(digest, outro), outro).not.toThrow();
      expect(codigosIguais(digest, outro), outro).toBe(false);
      expect(codigosIguais(outro, digest), outro).toBe(false);
    }
  });

  it("BORDA: valor nulo, indefinido e texto que não é hexadecimal não estouram e não passam por igual", () => {
    const digest = hashDoCodigo("123456", SEGREDO_A);
    const nulo = null as unknown as string;
    const indefinido = undefined as unknown as string;
    for (const lixo of [nulo, indefinido, "não é digest", "ZZZZ"]) {
      expect(() => codigosIguais(digest, lixo), String(lixo)).not.toThrow();
      expect(codigosIguais(digest, lixo), String(lixo)).toBe(false);
    }
    // Dois vazios não são alcançáveis pela requisição (o lado do candidato é sempre um HMAC real),
    // então aqui a exigência é só não estourar. Qual booleano devolver nesse caso é decisão do
    // coordenador, e está reportada.
    expect(() => codigosIguais("", "")).not.toThrow();
  });

  it("REQUISITO ESTRUTURAL: o módulo usa `timingSafeEqual` e não usa `Math.random`", () => {
    // Tempo constante não se mede de forma estável dentro de uma suíte (o relógio de teste tem
    // ruído maior que a diferença que se quer detectar). Então a régua aqui é estrutural, e é a que
    // o contrato escreveu em letras: `crypto.timingSafeEqual` sobre os digests, e `crypto.randomInt`
    // no sorteio. Comparação com `===` entre digests vaza o índice do primeiro byte diferente.
    //
    // FALSO VERMELHO CONSERTADO PELO COORDENADOR: a asserção lia o arquivo CRU e casava com o
    // COMENTÁRIO do módulo, que cita `Math.random` justamente para PROIBI-LO. O teste reprovava o
    // módulo por ele documentar a própria regra, que é o oposto do que se quer incentivar. A régua
    // estrutural agora olha só o CÓDIGO: comentários de bloco e de linha saem antes da conferência.
    const fonte = readFileSync(MODULO_DO_DOMINIO, "utf8");
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(codigo).toContain("timingSafeEqual");
    expect(codigo).toContain("randomInt");
    expect(codigo).not.toContain("Math.random");
    // E a proibição continua sendo cobrada do arquivo inteiro onde ela NÃO pode ser contornada por
    // comentário: o sorteio não pode chamar `Math.random` nem por caminho indireto.
    expect(codigo).not.toMatch(/Math\s*\.\s*random/);
  });
});

describe("hashDoEmail", () => {
  it("REQUISITO (§A.6): o digest NUNCA contém o e-mail, nem a conta, nem o domínio", () => {
    for (const email of [
      "maria.souza@exemplo.com.br",
      "j@x.co",
      "NOME.SOBRENOME+vaga@empresa-do-cliente.com.br",
    ]) {
      const h = hashDoEmail(email, SEGREDO_A);
      const normalizado = normalizarEmail(email);
      expect(h).not.toContain(email);
      expect(h).not.toContain(normalizado);
      expect(h).not.toContain(normalizado.split("@")[0]);
      expect(h).not.toContain(normalizado.split("@")[1]);
    }
  });

  it("REQUISITO: o digest é sobre a forma NORMALIZADA (caixa e espaço não criam chave nova)", () => {
    // Se a caixa mudasse o digest, o mesmo candidato teria duas chaves de balde e o teto por e-mail
    // seria contornado só alternando maiúsculas.
    const canonico = hashDoEmail("maria.souza@exemplo.com.br", SEGREDO_A);
    for (const variante of [
      "  maria.souza@exemplo.com.br  ",
      "MARIA.SOUZA@EXEMPLO.COM.BR",
      "Maria.Souza@Exemplo.Com.Br",
      "\tmaria.souza@exemplo.com.br\n",
    ]) {
      expect(hashDoEmail(variante, SEGREDO_A), variante).toBe(canonico);
    }
  });

  it("REQUISITO: e-mails diferentes dão digests diferentes, inclusive diferindo só por ponto ou por mais (+)", () => {
    // Contraparte da normalização: normalizar demais (jeito Gmail) faria dois candidatos DISTINTOS
    // colidirem na mesma chave, e um receberia o código do outro.
    const digests = [
      "maria.souza@exemplo.com.br",
      "mariasouza@exemplo.com.br",
      "maria.souza+vaga@exemplo.com.br",
      "maria.souza@exemplo.com",
    ].map((e) => hashDoEmail(e, SEGREDO_A));
    expect(new Set(digests).size).toBe(digests.length);
  });

  it("REQUISITO: segredo diferente muda o digest, e o digest é estável para o mesmo par", () => {
    expect(hashDoEmail("maria@exemplo.com", SEGREDO_A)).not.toBe(
      hashDoEmail("maria@exemplo.com", SEGREDO_B),
    );
    expect(hashDoEmail("maria@exemplo.com", SEGREDO_A)).toBe(
      hashDoEmail("maria@exemplo.com", SEGREDO_A),
    );
  });

  it("REQUISITO: tamanho fixo, hexadecimal minúsculo, e cabe em `varchar(64)`", () => {
    const tamanhos = new Set<number>();
    for (const entrada of ["", "a@b.co", "x".repeat(5_000), "sem-arroba", "ç@ã.br"]) {
      const h = hashDoEmail(entrada, SEGREDO_A);
      expect(h).toMatch(/^[0-9a-f]+$/);
      tamanhos.add(h.length);
    }
    expect(tamanhos.size).toBe(1);
    expect([...tamanhos][0]).toBeLessThanOrEqual(64);
    expect([...tamanhos][0]).toBeGreaterThanOrEqual(32);
  });

  it("SEPARAÇÃO DE DOMÍNIO: o digest do e-mail e o do código, da MESMA string, não coincidem", () => {
    // A v2 é explícita: o hash de e-mail serve ao BALDE e jamais à coluna `candidato_hash` da
    // trilha, que é `sha256(pepper:"cpf":cpf)`. Sem separação de domínio, `email_hash` e
    // `codigo_hash` conviveriam no mesmo banco casáveis coluna a coluna, o que transforma duas
    // tabelas independentes numa só. Não está escrito no contrato e está reportado.
    for (const valor of ["123456", "maria@exemplo.com", "000000"]) {
      expect(hashDoEmail(valor, SEGREDO_A)).not.toBe(hashDoCodigo(valor, SEGREDO_A));
    }
  });

  it("BORDA: vazio, nulo, indefinido e texto sem arroba não estouram (validade de formato não é papel deste módulo)", () => {
    const nulo = null as unknown as string;
    const indefinido = undefined as unknown as string;
    for (const entrada of ["", "   ", nulo, indefinido, "sem-arroba"]) {
      expect(() => hashDoEmail(entrada, SEGREDO_A), String(entrada)).not.toThrow();
      expect(hashDoEmail(entrada, SEGREDO_A)).toMatch(/^[0-9a-f]+$/);
    }
  });
});

describe("normalizarEmail", () => {
  it("REQUISITO: apara espaço e baixa a caixa", () => {
    expect(normalizarEmail("  Maria.Souza@Exemplo.COM.BR ")).toBe("maria.souza@exemplo.com.br");
    expect(normalizarEmail("\t MARIA@X.CO \n")).toBe("maria@x.co");
  });

  it("REQUISITO: NÃO remove pontos e NÃO trata o mais (+), porque não é Gmail-aware", () => {
    // Remover ponto ou cortar no mais faria "maria.souza@" e "mariasouza@" virarem a mesma chave. São
    // duas caixas distintas e podem ser de DUAS pessoas distintas, e a auditoria mediu exatamente
    // esse mundo: 6 e-mails para 12 CPFs. Colidir aqui manda o código de um candidato para a
    // identidade do outro.
    expect(normalizarEmail("maria.souza@exemplo.com.br")).toBe("maria.souza@exemplo.com.br");
    expect(normalizarEmail("maria.souza+vaga2026@exemplo.com.br")).toBe(
      "maria.souza+vaga2026@exemplo.com.br",
    );
    expect(normalizarEmail("M.A.R.I.A@exemplo.com.br")).toBe("m.a.r.i.a@exemplo.com.br");
  });

  it("REQUISITO: é idempotente (senão a chave depende de quantas vezes foi chamada)", () => {
    const uma = normalizarEmail("  Maria+Vaga@Exemplo.COM ");
    expect(normalizarEmail(uma)).toBe(uma);
  });

  it("REQUISITO: não mexe no meio do endereço (não remove acento nem inventa recorte)", () => {
    expect(normalizarEmail("JOSÉ@EXEMPLO.COM.BR")).toBe("josé@exemplo.com.br");
  });

  it("BORDA: vazio, só espaço, nulo e indefinido devolvem texto vazio sem estourar", () => {
    expect(normalizarEmail("")).toBe("");
    expect(normalizarEmail("     ")).toBe("");
    expect(normalizarEmail(null as unknown as string)).toBe("");
    expect(normalizarEmail(undefined as unknown as string)).toBe("");
  });

  it("BORDA: texto sem arroba é normalizado como qualquer outro (quem recusa formato é o serviço)", () => {
    expect(normalizarEmail("  SEM-ARROBA  ")).toBe("sem-arroba");
  });
});

describe("divergencias: só CPF e data, e sem retorno antecipado", () => {
  const REGISTRADO = { cpf: CPF_VALIDO, dataNascimento: DATA_REGISTRADA };

  it("REQUISITO: o catálogo de campos tem só CPF e DATA_NASCIMENTO (a v2 tirou o NOME)", () => {
    // O candidato não digita nome nesta porta, então não havia com o que confrontar. Um "NOME"
    // voltando para cá significaria que a tela voltou a pedir nome, o que a auditoria proibiu.
    const achados = divergencias(
      { cpf: OUTRO_CPF_VALIDO, dataNascimento: "1985-01-02" },
      REGISTRADO,
    );
    expect([...achados].sort()).toEqual(["CPF", "DATA_NASCIMENTO"]);
    for (const campo of achados) expect(["CPF", "DATA_NASCIMENTO"]).toContain(campo);
  });

  it("REQUISITO: campo AUSENTE no registro NÃO é divergência, é dado sendo preenchido", () => {
    // É o caso da frente inteira: o candidato sem CPF está preenchendo o que falta. Acusar
    // divergência do que está vazio travaria exatamente quem a porta nova existe para atender. É
    // também o que a auditoria apontou como vazio por construção (nulo não discorda de nada), e por
    // isso a v2 não confia SÓ nesta função: o vínculo é que manda.
    const informado = { cpf: CPF_VALIDO, dataNascimento: DATA_REGISTRADA };
    expect(divergencias(informado, { cpf: null, dataNascimento: null })).toEqual([]);
    expect(divergencias(informado, {})).toEqual([]);
    expect(divergencias(informado, { cpf: "", dataNascimento: "" })).toEqual([]);
    expect(divergencias(informado, { cpf: "   ", dataNascimento: "   " })).toEqual([]);
    expect(divergencias(informado, { cpf: undefined, dataNascimento: undefined })).toEqual([]);
  });

  it("REQUISITO: CPF compara só DÍGITOS, então a máscara casa com a forma crua", () => {
    expect(
      divergencias({ cpf: "529.982.247-25", dataNascimento: DATA_REGISTRADA }, REGISTRADO),
    ).toEqual([]);
    expect(
      divergencias({ cpf: " 529 982 247 25 ", dataNascimento: DATA_REGISTRADA }, REGISTRADO),
    ).toEqual([]);
    expect(
      divergencias({ cpf: CPF_VALIDO, dataNascimento: DATA_REGISTRADA }, { ...REGISTRADO, cpf: "529.982.247-25" }),
    ).toEqual([]);
  });

  it("REQUISITO (contraprova): CPF de outra pessoa diverge, e prefixo não passa por igual", () => {
    // O caso do prefixo é o que uma comparação frouxa (`startsWith`, ou "contém") deixaria passar:
    // CPF truncado casaria com o do cadastro e a trava nunca dispararia.
    for (const cpf of [OUTRO_CPF_VALIDO, "5299822472", "529982247250"]) {
      expect(divergencias({ cpf, dataNascimento: DATA_REGISTRADA }, REGISTRADO), cpf).toEqual(["CPF"]);
    }
  });

  it("REQUISITO: a data compara só a parte ISO, então timestamp do banco casa com a data digitada", () => {
    // `as_candidatos.data_nascimento` pode chegar como timestamp e o candidato digita só a data.
    // Comparar o texto inteiro acusaria divergência em 100% dos casos e travaria todo mundo.
    expect(
      divergencias({ cpf: CPF_VALIDO, dataNascimento: "1990-05-17" }, { ...REGISTRADO, dataNascimento: "1990-05-17T00:00:00.000Z" }),
    ).toEqual([]);
    expect(
      divergencias({ cpf: CPF_VALIDO, dataNascimento: "1990-05-17T03:00:00.000Z" }, REGISTRADO),
    ).toEqual([]);
    expect(divergencias({ cpf: CPF_VALIDO, dataNascimento: "  1990-05-17  " }, REGISTRADO)).toEqual([]);
  });

  it("REQUISITO (contraprova): data de outro dia diverge", () => {
    expect(divergencias({ cpf: CPF_VALIDO, dataNascimento: "1990-05-18" }, REGISTRADO)).toEqual([
      "DATA_NASCIMENTO",
    ]);
  });

  it("REQUISITO: divergência nos DOIS campos devolve os dois", () => {
    const achados = divergencias({ cpf: OUTRO_CPF_VALIDO, dataNascimento: "1985-01-02" }, REGISTRADO);
    expect(achados).toHaveLength(2);
    expect([...achados].sort()).toEqual(["CPF", "DATA_NASCIMENTO"]);
  });

  it("REQUISITO: SEM retorno antecipado, o segundo campo é avaliado mesmo com o primeiro já divergindo", () => {
    // Retorno antecipado é canal de tempo (quem responde mais rápido divergiu no primeiro campo) e,
    // pior, empobrece a contagem de tentativas e a análise de quem destrava, que deixa de saber o
    // tamanho do problema.
    const soData = divergencias({ cpf: CPF_VALIDO, dataNascimento: "1985-01-02" }, REGISTRADO);
    const soCpf = divergencias({ cpf: OUTRO_CPF_VALIDO, dataNascimento: DATA_REGISTRADA }, REGISTRADO);
    const ambos = divergencias({ cpf: OUTRO_CPF_VALIDO, dataNascimento: "1985-01-02" }, REGISTRADO);
    expect(soData).toEqual(["DATA_NASCIMENTO"]);
    expect(soCpf).toEqual(["CPF"]);
    expect(ambos).toHaveLength(2);
  });

  it("REQUISITO (propriedade): o resultado é exatamente a UNIÃO das divergências de cada campo, nas 4 combinações", () => {
    // Prova mais forte que um caso de dois: cada campo é avaliado de forma independente do outro. Se
    // qualquer um curto-circuitasse o outro, alguma das quatro combinações quebraria.
    const combinacoes: CampoDivergente[][] = [[], ["CPF"], ["DATA_NASCIMENTO"], ["CPF", "DATA_NASCIMENTO"]];
    for (const alvo of combinacoes) {
      const informado = {
        cpf: alvo.includes("CPF") ? OUTRO_CPF_VALIDO : CPF_VALIDO,
        dataNascimento: alvo.includes("DATA_NASCIMENTO") ? "1985-01-02" : DATA_REGISTRADA,
      };
      expect([...divergencias(informado, REGISTRADO)].sort(), alvo.join("+") || "(nenhuma)").toEqual(
        [...alvo].sort(),
      );
    }
  });

  it("REQUISITO (§A.6): o retorno só carrega NOMES de campo, nunca o valor informado nem o registrado", () => {
    // A tabela de travas da v2 não tem sequer coluna de campo divergente, e as colunas de valor são
    // PROIBIDAS nominalmente (seção 4). Função que devolvesse valor faria o vazamento chegar lá pelo
    // caminho natural, e à trilha junto.
    const informado = { cpf: OUTRO_CPF_VALIDO, dataNascimento: "1985-01-02" };
    const achados = divergencias(informado, REGISTRADO);
    const texto = JSON.stringify(achados);
    for (const segredo of [informado.cpf, informado.dataNascimento, REGISTRADO.cpf, REGISTRADO.dataNascimento]) {
      expect(texto).not.toContain(segredo);
    }
    expect(new Set(achados).size, "campo repetido no retorno").toBe(achados.length);
  });

  it("BORDA: entrada vazia e nula não estouram e não inventam divergência contra registro vazio", () => {
    const vazio = { cpf: "", dataNascimento: "" };
    expect(() => divergencias(vazio, {})).not.toThrow();
    expect(divergencias(vazio, {})).toEqual([]);
    const nulo = { cpf: null as unknown as string, dataNascimento: null as unknown as string };
    expect(() => divergencias(nulo, { cpf: null, dataNascimento: null })).not.toThrow();
    expect(divergencias(nulo, { cpf: null, dataNascimento: null })).toEqual([]);
  });

  it("BORDA: informado VAZIO contra registro PREENCHIDO diverge, e não passa por igual", () => {
    // Campo vazio de quem informa não pode ser lido como "igual ao que já existe", senão bastaria
    // mandar o corpo em branco para a conferência passar.
    expect([...divergencias({ cpf: "", dataNascimento: "" }, REGISTRADO)].sort()).toEqual([
      "CPF",
      "DATA_NASCIMENTO",
    ]);
  });

  it("BORDA: data impossível e data futura são comparadas como texto ISO e divergem do cadastro", () => {
    // A seção 3 da v2 NÃO tem função de validade de data, então quem recusa 2026-02-31 ou data
    // futura é o DTO ou o serviço. Reportado ao coordenador: com o cadastro vazio, nada neste módulo
    // impede que uma data impossível seja gravada em `as_candidatos.data_nascimento`.
    expect(divergencias({ cpf: CPF_VALIDO, dataNascimento: "2026-02-31" }, REGISTRADO)).toEqual([
      "DATA_NASCIMENTO",
    ]);
    expect(divergencias({ cpf: CPF_VALIDO, dataNascimento: "2031-12-31" }, REGISTRADO)).toEqual([
      "DATA_NASCIMENTO",
    ]);
  });

  it("BORDA: a função não altera os objetos que recebe (o chamador grava a partir deles)", () => {
    const informado = { cpf: "529.982.247-25", dataNascimento: "1990-05-17T00:00:00.000Z" };
    const registrado = { ...REGISTRADO };
    divergencias(informado, registrado);
    expect(informado).toEqual({ cpf: "529.982.247-25", dataNascimento: "1990-05-17T00:00:00.000Z" });
    expect(registrado).toEqual(REGISTRADO);
  });
});

describe("decisaoDaIdentidade: precedência item a item", () => {
  it("REQUISITO: OK só sai quando TUDO está limpo", () => {
    expect(decisaoDaIdentidade(LIMPO)).toEqual({ tipo: "OK" });
  });

  it("REQUISITO: bilhete morto devolve BILHETE_MORTO", () => {
    expect(decisaoDaIdentidade({ ...LIMPO, bilheteVivo: false })).toEqual({ tipo: "BILHETE_MORTO" });
  });

  it("REQUISITO: já travado devolve TRAVAR com TRAVA_ANTERIOR", () => {
    expect(decisaoDaIdentidade({ ...LIMPO, jaTravado: true })).toEqual({
      tipo: "TRAVAR",
      motivo: "TRAVA_ANTERIOR",
    });
  });

  it("REQUISITO: CPF de dígito verificador errado devolve CPF_INVALIDO, e NÃO trava", () => {
    // Primeira linha da tabela da seção 5. Erro de digitação do candidato é corrigível na tela;
    // virar trava encheria a fila de destrave de trabalho que ninguém do time precisa fazer.
    expect(decisaoDaIdentidade({ ...LIMPO, cpfValido: false })).toEqual({ tipo: "CPF_INVALIDO" });
  });

  it("REQUISITO: CPF que pertence a outro candidato devolve TRAVAR com CPF_DE_OUTRO_CANDIDATO", () => {
    expect(decisaoDaIdentidade({ ...LIMPO, cpfDeOutro: true })).toEqual({
      tipo: "TRAVAR",
      motivo: "CPF_DE_OUTRO_CANDIDATO",
    });
  });

  it("REQUISITO: divergência devolve TRAVAR com DIVERGENCIA_CADASTRO", () => {
    expect(decisaoDaIdentidade({ ...LIMPO, divergentes: ["CPF"] })).toEqual({
      tipo: "TRAVAR",
      motivo: "DIVERGENCIA_CADASTRO",
    });
    expect(decisaoDaIdentidade({ ...LIMPO, divergentes: ["CPF", "DATA_NASCIMENTO"] })).toEqual({
      tipo: "TRAVAR",
      motivo: "DIVERGENCIA_CADASTRO",
    });
  });

  it("CONFLITO: bilhete morto vence a divergência (sem autenticação ninguém trava candidato alheio)", () => {
    expect(decisaoDaIdentidade({ ...LIMPO, bilheteVivo: false, divergentes: ["CPF"] })).toEqual({
      tipo: "BILHETE_MORTO",
    });
  });

  it("CONFLITO: bilhete morto vence TUDO ao mesmo tempo", () => {
    expect(
      decisaoDaIdentidade({
        bilheteVivo: false,
        cpfValido: false,
        jaTravado: true,
        cpfDeOutro: true,
        divergentes: ["CPF", "DATA_NASCIMENTO"],
      }),
    ).toEqual({ tipo: "BILHETE_MORTO" });
  });

  it("CONFLITO: já travado vence CPF inválido, CPF de outro e divergência (a trava original não é reescrita)", () => {
    expect(
      decisaoDaIdentidade({
        bilheteVivo: true,
        cpfValido: false,
        jaTravado: true,
        cpfDeOutro: true,
        divergentes: ["CPF"],
      }),
    ).toEqual({ tipo: "TRAVAR", motivo: "TRAVA_ANTERIOR" });
  });

  it("CONFLITO: CPF inválido vence CPF de outro e divergência (comparar CPF malformado com a base não tem sentido)", () => {
    expect(
      decisaoDaIdentidade({
        bilheteVivo: true,
        cpfValido: false,
        jaTravado: false,
        cpfDeOutro: true,
        divergentes: ["CPF", "DATA_NASCIMENTO"],
      }),
    ).toEqual({ tipo: "CPF_INVALIDO" });
  });

  it("CONFLITO: CPF de outro candidato vence a divergência (é o achado mais grave dos dois)", () => {
    expect(
      decisaoDaIdentidade({ ...LIMPO, cpfDeOutro: true, divergentes: ["DATA_NASCIMENTO"] }),
    ).toEqual({ tipo: "TRAVAR", motivo: "CPF_DE_OUTRO_CANDIDATO" });
  });

  it("PROPRIEDADE: a precedência vale nas 48 combinações possíveis, e OK nunca aparece com nada sujo", () => {
    const listas: CampoDivergente[][] = [[], ["CPF"], ["CPF", "DATA_NASCIMENTO"]];
    let combinacoes = 0;
    for (const bilheteVivo of [true, false])
      for (const cpfValido of [true, false])
        for (const jaTravado of [true, false])
          for (const cpfDeOutro of [true, false])
            for (const divergentes of listas) {
              const entrada: EntradaDaDecisao = {
                bilheteVivo,
                cpfValido,
                jaTravado,
                cpfDeOutro,
                divergentes,
              };
              const rotulo = JSON.stringify(entrada);
              const obtida = decisaoDaIdentidade(entrada);
              expect(obtida, rotulo).toEqual(decisaoEsperada(entrada));
              const limpo =
                bilheteVivo && cpfValido && !jaTravado && !cpfDeOutro && divergentes.length === 0;
              if (!limpo) expect(obtida.tipo, `OK indevido em ${rotulo}`).not.toBe("OK");
              combinacoes += 1;
            }
    expect(combinacoes).toBe(48);
  });

  it("REQUISITO: `MOTIVOS_DA_TRAVA` é o catálogo FECHADO da v2, com EMAIL_AMBIGUO incluído", () => {
    // `EMAIL_AMBIGUO` é motivo de trava mas NÃO é alcançável por esta função: a entrada dela não tem
    // esse sinal, porque o e-mail ambíguo nem chega a emitir código (seção 5). Quem grava essa trava
    // é o passo `solicitar`, e é ele que precisa de teste no serviço. Reportado.
    expect([...MOTIVOS_DA_TRAVA].sort()).toEqual([
      "CPF_DE_OUTRO_CANDIDATO",
      "DIVERGENCIA_CADASTRO",
      "EMAIL_AMBIGUO",
      "TRAVA_ANTERIOR",
    ]);
  });

  it("REQUISITO (uma fonte da verdade): o catálogo do domínio e o do `shared-types` não podem divergir", () => {
    // O mesmo catálogo existe em dois lugares: `MOTIVOS_DA_TRAVA` (que vira o CHECK da tabela) e
    // `MOTIVOS_DA_TRAVA_DE_ACESSO` (que vira rótulo na tela). Divergirem significa motivo gravado
    // que a tela não sabe rotular, ou rótulo para motivo que o banco recusa. Este teste é a ponte, e
    // a duplicidade em si está reportada ao coordenador, que é o dono dos dois arquivos.
    expect([...MOTIVOS_DA_TRAVA].sort()).toEqual([...MOTIVOS_DA_TRAVA_DE_ACESSO].sort());
  });

  it("BORDA: a régua de CPF é a MESMA do resto do sistema, e é ela que alimenta `cpfValido`", () => {
    // O módulo não valida CPF (recebe o booleano já resolvido), e a seção 5 é explícita: "o mesmo
    // validador, nunca um segundo". Este teste amarra DE ONDE o booleano vem, e cobre 10 dígitos, 12
    // dígitos, dígito verificador errado e repetido.
    for (const invalido of ["5299822472", "529982247250", "52998224724", "11111111111", "", "abc"]) {
      expect(isValidCpf(invalido), invalido).toBe(false);
      expect(decisaoDaIdentidade({ ...LIMPO, cpfValido: isValidCpf(invalido) })).toEqual({
        tipo: "CPF_INVALIDO",
      });
    }
    expect(isValidCpf(CPF_VALIDO)).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  it("BORDA: lista congelada de divergências é aceita sem estouro e sem ser modificada", () => {
    const congelada = Object.freeze<CampoDivergente[]>(["CPF", "DATA_NASCIMENTO"]);
    expect(() => decisaoDaIdentidade({ ...LIMPO, divergentes: congelada })).not.toThrow();
    expect(congelada).toEqual(["CPF", "DATA_NASCIMENTO"]);
  });
});

describe("o desfecho de sucesso é LINK ENVIADO, e nunca sessão (o veto da v1)", () => {
  it("REQUISITO: `SITUACOES_DO_ACESSO_POR_EMAIL` tem exatamente LINK_ENVIADO e DADOS_RECEBIDOS", () => {
    // A v1 morreu por emitir sessão do Portal a partir da posse da caixa. A chave de acesso continua
    // sendo link + CPF + nascimento, e o sucesso desta porta é "olhe o seu e-mail", não "entre
    // agora". O catálogo fechado é o que torna a regressão impossível de passar em silêncio.
    expect([...SITUACOES_DO_ACESSO_POR_EMAIL].sort()).toEqual(["DADOS_RECEBIDOS", "LINK_ENVIADO"]);
    expect(SITUACOES_DO_ACESSO_POR_EMAIL).toHaveLength(2);
  });

  it("REQUISITO: nenhuma situação do catálogo sugere entrega de sessão, token ou Portal aberto", () => {
    // Trava o nome também, e não só a quantidade: uma variante chamada `PORTAL_ABERTO` ou
    // `SESSAO_EMITIDA` seria a v1 voltando com outro rótulo.
    for (const situacao of SITUACOES_DO_ACESSO_POR_EMAIL) {
      expect(situacao, situacao).not.toMatch(/SESS|TOKEN|BILHETE|ABERT|ENTRAR|LOGIN|ACESSO_LIBERADO/i);
    }
  });

  it("REQUISITO: a resposta do passo de identidade não declara campo de sessão nem de minutos de sessão", () => {
    // Leitura estrutural do vocabulário compartilhado: a v1 devolvia `{ situacao, sessao, minutos }`.
    // Se um campo desses reaparecer na interface, o veto foi desfeito no tipo antes de ser desfeito
    // no código, e é aqui que isso é pego.
    const campos = camposDaInterface("IdentidadeDoAcessoResposta");
    expect(campos).toContain("situacao");
    for (const proibido of ["sessao", "sessão", "token", "minutos", "url", "link", "bilhete"]) {
      expect(campos.map((c) => c.toLowerCase()), proibido).not.toContain(proibido);
    }
  });

  it("REQUISITO: o desfecho declara SÓ a situação, sem e-mail mascarado e sem nome", () => {
    // O `emailMascarado` EXISTIU nesta interface e a auditoria o tirou (condição 1): ele entregava o
    // DOMÍNIO de um endereço cuja posse o chamador não provou, e "para a pessoa saber onde procurar"
    // é exatamente a frase com que ele volta. Quem precisa saber para onde o link foi é quem tem a
    // caixa, e essa pessoa já recebeu a mensagem.
    //
    // A ausência do campo É a defesa, e uma lista EXATA é a única asserção que a tranca: proibir
    // nomes um a um não pega o campo que ninguém pensou em proibir.
    expect(camposDaInterface("IdentidadeDoAcessoResposta")).toEqual(["situacao"]);
    type ChaveExtra = Exclude<keyof IdentidadeDoAcessoResposta, "situacao">;
    const semChaveExtra: ChaveExtra extends never ? true : false = true;
    expect(semChaveExtra).toBe(true);
  });
});

describe("a confirmação do código não devolve NADA da pessoa (proibição O10)", () => {
  it("REQUISITO: `ConfirmacaoDeCodigoResposta` declara só o bilhete e o prazo", () => {
    // A ausência do campo É a defesa. A auditoria mediu 6 e-mails para 12 CPFs, 5 com dois nomes
    // diferentes: devolver nome, mesmo mascarado, confirmaria a identidade de um terceiro a quem só
    // tem a caixa. Este teste existe para impedir que alguém reintroduza o campo depois, quando a
    // razão do veto não estiver mais fresca.
    const campos = camposDaInterface("ConfirmacaoDeCodigoResposta");
    expect([...campos].sort()).toEqual(["bilhete", "expiraEmMinutos"]);
  });

  it("REQUISITO: nenhum campo de pessoa, de vaga ou de documento na confirmação", () => {
    const campos = camposDaInterface("ConfirmacaoDeCodigoResposta").map((c) => c.toLowerCase());
    for (const proibido of [
      "nome",
      "nomeparcial",
      "nomemascarado",
      "email",
      "emailmascarado",
      "cliente",
      "cargo",
      "cpf",
      "datanascimento",
      "nascimento",
      "telefone",
      "matricula",
      "admissaoid",
      "candidatoid",
      "documentos",
      "precisacpf",
      "precisanascimento",
    ]) {
      expect(campos, proibido).not.toContain(proibido);
    }
  });

  it("REQUISITO (tipo, não só texto): a confirmação não aceita chave além de bilhete e prazo", () => {
    // Guarda de TIPO, que o `pnpm typecheck` do gate cobra. O teste de texto acima pega o campo
    // acrescentado no `shared-types`; este pega qualquer chave extra que apareça no tipo por
    // herança ou interseção, inclusive vindo de outro arquivo.
    type ChaveExtra = Exclude<keyof ConfirmacaoDeCodigoResposta, "bilhete" | "expiraEmMinutos">;
    const semChaveExtra: ChaveExtra extends never ? true : false = true;
    expect(semChaveExtra).toBe(true);
  });

  it("REQUISITO (resposta única): a solicitação declara só `enviado` e `expiraEmMinutos`", () => {
    // Qualquer campo a mais aqui é o oráculo de enumeração: "achei", "naoAchei", "candidato",
    // "elegivel". A resposta é a MESMA para e-mail que existe e para e-mail que não existe, e é
    // calculada na primeira linha do método, antes de qualquer consulta.
    const campos = camposDaInterface("SolicitacaoDeCodigoResposta");
    expect([...campos].sort()).toEqual(["enviado", "expiraEmMinutos"]);
    type ChaveExtra = Exclude<keyof SolicitacaoDeCodigoResposta, "enviado" | "expiraEmMinutos">;
    const semChaveExtra: ChaveExtra extends never ? true : false = true;
    expect(semChaveExtra).toBe(true);
  });

  it("REQUISITO (C9): o código não pode viajar em resposta nenhuma, em nenhum ambiente", () => {
    // Nenhuma das três respostas do fluxo declara campo de código. É proibido expor o código fora do
    // e-mail, inclusive "para teste" e inclusive na homologação, e a ausência do campo no tipo é o
    // que impede o atalho de nascer.
    for (const nome of [
      "SolicitacaoDeCodigoResposta",
      "ConfirmacaoDeCodigoResposta",
      "IdentidadeDoAcessoResposta",
    ]) {
      const campos = camposDaInterface(nome).map((c) => c.toLowerCase());
      for (const proibido of ["codigo", "code", "codigohash", "hash", "digest", "segredo", "pepper"]) {
        expect(campos, `${nome}.${proibido}`).not.toContain(proibido);
      }
    }
  });
});

describe("anti-oráculo: o domínio não distingue e-mail cadastrado de não cadastrado", () => {
  it("REQUISITO: o digest do e-mail tem a MESMA forma para endereço que existe e para o que não existe", () => {
    // Todo o anti-enumeração depende de os dois caminhos produzirem artefatos indistinguíveis. No
    // domínio puro o artefato é o digest: mesmo tamanho, mesmo alfabeto, nada derivado de haver ou
    // não candidato por trás. O módulo nem RECEBE essa informação, e isso é desenho.
    const cadastrado = hashDoEmail("maria.souza@exemplo.com.br", SEGREDO_A);
    const inexistente = hashDoEmail("ninguem-aqui-nunca@exemplo.com.br", SEGREDO_A);
    expect(inexistente.length).toBe(cadastrado.length);
    expect(inexistente).toMatch(/^[0-9a-f]+$/);
    expect(inexistente).not.toBe(cadastrado);
  });

  it("REQUISITO: `expiraEmMinutos` sai da CONSTANTE, então é idêntico nos dois caminhos", () => {
    // O número que a tela mostra não pode vir da linha gravada, porque no caminho "não achou" não
    // existe linha, e qualquer diferença (campo ausente, zero, nulo) responde exatamente a pergunta
    // que a resposta única existe para não responder.
    const minutos = CODIGO_TTL_MS / UM_MINUTO_MS;
    expect(Number.isInteger(minutos)).toBe(true);
    expect(minutos).toBeGreaterThan(0);
  });

  it("REQUISITO: a decisão só devolve `tipo` e `motivo`, de listas FECHADAS, sem campo livre para vazar dado", () => {
    // Forma da resposta é o que o candidato consegue observar. Enquanto chaves e valores saem de
    // conjuntos fechados, nenhuma recusa carrega CPF, data, e-mail nem qual campo divergiu.
    const tipos = new Set(["OK", "TRAVAR", "CPF_INVALIDO", "BILHETE_MORTO"]);
    const motivos = new Set<string>(MOTIVOS_DA_TRAVA);
    const listas: CampoDivergente[][] = [[], ["CPF"], ["CPF", "DATA_NASCIMENTO"]];
    for (const bilheteVivo of [true, false])
      for (const cpfValido of [true, false])
        for (const jaTravado of [true, false])
          for (const cpfDeOutro of [true, false])
            for (const divergentes of listas) {
              const r = decisaoDaIdentidade({
                bilheteVivo,
                cpfValido,
                jaTravado,
                cpfDeOutro,
                divergentes,
              }) as Record<string, unknown>;
              for (const chave of Object.keys(r)) expect(["tipo", "motivo"]).toContain(chave);
              expect(tipos).toContain(r.tipo);
              if (r.tipo === "TRAVAR") expect(motivos).toContain(r.motivo as string);
              else expect(Object.keys(r)).toEqual(["tipo"]);
            }
  });

  it("REQUISITO: as duas recusas que o candidato provoca de propósito têm a MESMA forma", () => {
    // Travar por divergência e travar por CPF de outra pessoa diferem por um código de motivo, que é
    // para a TRILHA e para a fila do time. A forma é a mesma, e é isso que permite ao serviço
    // devolver a frase neutra única sem achatar o dado de quem vai destravar.
    const porDivergencia = decisaoDaIdentidade({ ...LIMPO, divergentes: ["CPF"] });
    const porCpfDeOutro = decisaoDaIdentidade({ ...LIMPO, cpfDeOutro: true });
    expect(Object.keys(porDivergencia)).toEqual(Object.keys(porCpfDeOutro));
    expect(porDivergencia.tipo).toBe(porCpfDeOutro.tipo);
  });

  it("REQUISITO (§A.6): nada que o módulo devolve carrega PII, em nenhuma das combinações", () => {
    const PII = [CPF_VALIDO, OUTRO_CPF_VALIDO, "529.982.247-25", DATA_REGISTRADA, "maria.souza@exemplo.com.br"];
    const saidas = [
      JSON.stringify(decisaoDaIdentidade(LIMPO)),
      JSON.stringify(decisaoDaIdentidade({ ...LIMPO, bilheteVivo: false })),
      JSON.stringify(decisaoDaIdentidade({ ...LIMPO, jaTravado: true })),
      JSON.stringify(decisaoDaIdentidade({ ...LIMPO, cpfValido: false })),
      JSON.stringify(decisaoDaIdentidade({ ...LIMPO, cpfDeOutro: true })),
      JSON.stringify(decisaoDaIdentidade({ ...LIMPO, divergentes: ["CPF", "DATA_NASCIMENTO"] })),
      JSON.stringify(divergencias({ cpf: OUTRO_CPF_VALIDO, dataNascimento: "1985-01-02" }, { cpf: CPF_VALIDO, dataNascimento: DATA_REGISTRADA })),
    ];
    for (const saida of saidas) for (const segredo of PII) expect(saida).not.toContain(segredo);
  });

  /**
   * O QUE ESTE ARQUIVO NÃO CONSEGUE PROVAR, E TEM DE SER PROVADO NO SERVIÇO (lacuna declarada, não
   * esquecida). O domínio é puro, não faz I/O e nem recebe a informação de existência, então:
   *
   * 1. `solicitar` devolve o MESMO corpo e o MESMO status para e-mail que existe e que não existe,
   *    com o valor calculado na PRIMEIRA linha do método, antes de qualquer consulta.
   * 2. O TEMPO das duas respostas não separa os caminhos (um consulta, grava e chama o Gmail; o
   *    outro não faz nada).
   * 3. "Morre na QUINTA tentativa", que é o que sustenta a conta dos 6 dígitos: o registro do código
   *    é DESTRUÍDO, não só bloqueado. Sem isso a conta cai e o contrato exigiria 8 dígitos.
   * 4. Um código vivo por candidato, e emitir invalida o anterior.
   * 5. Os tetos de 3 por hora e 10 por 24h valem nos DOIS caminhos, senão o balde só existe para
   *    quem existe e o próprio teto passa a ser o oráculo.
   * 6. `EMAIL_AMBIGUO` trava e NÃO emite código, e a recusa usa a mesma frase neutra.
   * 7. Sem `PORTAL_CODIGO_PEPPER`, sem pepper da trilha ou sem correio, a rota nasce INERTE com 503,
   *    e o segredo do código nunca é o `PORTAL_LOG_PEPPER`.
   * 8. A admissão vem do VÍNCULO do registro, nunca de busca pelo CPF digitado, que é a correção
   *    estrutural que a auditoria exigiu para matar a tomada de conta da v1.
   * 9. A escrita alcança DUAS colunas, `cpf` e `data_nascimento`, e o `update` não é montado a
   *    partir do corpo da requisição.
   * 10. `candidato_hash` da trilha nunca recebe hash de e-mail, e `CAMPOS_PERMITIDOS` não é alargada.
   * 11. O e-mail do código não carrega nome, CPF, link nem token, e o código não aparece em log.
   * 12. O destrave é idempotente, sem `@Roles`, alcançado pelo coringa do menu `portal-links`, e a
   *     tentativa recusada também vira linha de trilha.
   */
});
