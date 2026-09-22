import { describe, expect, it } from "vitest";
import { isValidCpf } from "@ea/shared-types";
import {
  CPF_SINTETICO,
  exigirExport,
  fonteExigida,
  piiNaSaida,
  resultadoDigaiFingido,
  semComentario,
  describeSuspenso,
  sentinelaDoDigai,
} from "./digai.tester-fake";

/**
 * ┌─ SUITE SUSPENSA: A IMPLEMENTACAO DO DIGAI AINDA NAO EXISTE ─────────────────────────────────┐
 * │ Nada aqui foi apagado. Cada assercao, cada caso e cada `it` continua escrito, palavra por   │
 * │ palavra: este arquivo e o CONTRATO que a construcao vai ter de satisfazer, escrito antes do │
 * │ codigo de proposito (secao A.38 e secao A.40, regra 2). A frente esta parada por insumo do  │
 * │ diretor (o token do Digai, docs/PLATAFORMA-UNIFICADORA-DECISOES.md, secao 5).               │
 * │                                                                                             │
 * │ O QUE MUDA E SO QUANDO RODA. Os blocos abaixo usam `describeSuspenso`, que e `describe.skip` │
 * │ enquanto NENHUMA peca do Digai existir no disco, e vira `describe` de verdade sozinho no     │
 * │ minuto em que a primeira peca nascer. Nao ha interruptor para alguem esquecer de virar: a    │
 * │ suspensao e DERIVADA da ausencia medida (`pecasPresentes`, em digai.tester-fake.ts).         │
 * │                                                                                             │
 * │ A SENTINELA ABAIXO RODA SEMPRE, e e ela que impede este trabalho de dormir para sempre: no   │
 * │ dia em que a implementacao chegar, ela FICA VERMELHA dizendo o que fazer. `skip` puro        │
 * │ ninguem lembra de reativar, e cobertura esquecida e pior do que cobertura que nao existe,    │
 * │ porque parece que existe.                                                                   │
 * │                                                                                             │
 * │ UM bloco daqui segue RODANDO, o das fixtures: ele confere o digito verificador dos CPFs     │
 * │ sinteticos e nao depende de implementacao nenhuma, entao suspende-lo so tiraria verde real. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
sentinelaDoDigai("digai.zero-pii.tester.spec.ts");


/**
 * ─ ZERO PII: OS VETOS 1 E 4 DE 16/09, VIRADOS EM TESTE ──────────────────────────────────────────
 *
 * ESTE ARQUIVO E DO `tester`, escrito ANTES do codigo (secao A.38, secao A.40 regra 2).
 *
 * ┌─ A REGRA DE OURO DESTE ARQUIVO, e ela vem de um verde falso ────────────────────────────────┐
 * │ O TESTE DE MASCARAMENTO PROCURA O VALOR REAL NA SAIDA E EXIGE QUE ELE NAO ESTEJA LA.        │
 * │ Nao procura o placeholder. Em 16/09 o teste anterior procurava `<5`, o `<5` ESTAVA la, e o  │
 * │ valor real estava impresso ao lado, com o denominador: 33% de 3 e 1. O teste passava verde  │
 * │ afirmando exatamente o contrario do que queria afirmar.                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SECAO A.6 e protocolo secao 1: nada real entra aqui. O CPF e sintetico e tem digito verificador
 * valido de proposito (primeiro teste), porque um numero invalido seria recusado antes de chegar
 * na regra sob prova, e o verde viria pelo motivo errado.
 */

const NOME = "Fulano De Teste";
const EMAIL = "fulano.teste@exemplo.invalido";
const TELEFONE = "11900000001";
const CPF = CPF_SINTETICO.finalizou;

/** Tudo o que NAO pode aparecer, em nenhuma superficie, em nenhuma das suas formas. */
const OS_VALORES = [CPF, NOME, EMAIL, TELEFONE] as const;

describe("as fixtures sao sinteticas e validas", () => {
  it("os CPFs de fixture passam pelo validador da casa", () => {
    for (const cpf of Object.values(CPF_SINTETICO)) {
      expect(isValidCpf(cpf), `CPF de fixture '${cpf.slice(0, 3)}...' precisa ter digito verificador valido, senao a regra sob prova nunca e alcancada.`).toBe(true);
    }
  });
});

// ── 1. A MASCARA, PROCURANDO O VALOR ───────────────────────────────────────

describeSuspenso("a mascara tira o VALOR, e o teste procura o VALOR", () => {
  async function mascarar(): Promise<(texto: unknown) => string> {
    return exigirExport<(texto: unknown) => string>("dominio", "mascararParaLog");
  }

  it("o CPF nao sobrevive a mascara, em nenhuma das suas formas", async () => {
    const fn = await mascarar();
    const entrada = `falhou para ${CPF}, e tambem para 111.222.333-96 e 111 222 333 96`;
    expect(
      piiNaSaida(fn(entrada), [CPF]),
      "o CPF continua legivel depois de mascarado. A mascara e obrigatoria ANTES de o valor chegar a superficie, nao depois (protocolo, secao 1).",
    ).toEqual([]);
  });

  it("e-mail e telefone tambem nao sobrevivem", async () => {
    const fn = await mascarar();
    const saida = fn(`contato: ${EMAIL} / ${TELEFONE}`);
    expect(piiNaSaida(saida, [EMAIL, TELEFONE]), "e-mail e telefone sao dado sensivel pelo protocolo secao 1, na mesma linha do CPF.").toEqual([]);
  });

  it("a mascara aceita objeto, e nao so string", async () => {
    const fn = await mascarar();
    const saida = fn(resultadoDigaiFingido({ cpf: CPF, name: NOME, email: EMAIL, phoneNumber: TELEFONE }));
    expect(
      piiNaSaida(saida, OS_VALORES),
      "o caminho mais comum de vazamento e alguem interpolar o OBJETO cru numa mensagem de erro. A mascara tem de alcancar a serializacao inteira.",
    ).toEqual([]);
  });

  it("a pista de campo seguro e lista EXATA de nomes, nunca substring", async () => {
    /**
     * A ARMADILHA 3 DO PROTOCOLO (secao 1.1): `"titulo"` como pista de descricao fez
     * `tituloEleitor` ser impresso como se fosse rotulo. Substring casa o campo errado, e o campo
     * errado costuma ser justamente o documento.
     */
    const fn = await mascarar();
    const saida = fn({ tituloEleitor: "123456789012", nomeSocial: NOME, cpfDoResponsavel: CPF });
    expect(
      piiNaSaida(saida, [NOME, CPF, "123456789012"]),
      "campo cujo NOME apenas CONTEM uma palavra segura nao e campo seguro. A lista de campos liberados e EXATA.",
    ).toEqual([]);
  });
});

// ── 2. O VETO 4: SUPRESSAO COBRE CONTAGEM E PORCENTAGEM, JUNTAS ────────────

describeSuspenso("o piso de supressao cobre contagem E porcentagem, sempre juntas", () => {
  async function resumo(): Promise<
    (r: { rotulo: string; contagem: number; total: number }) => string
  > {
    return exigirExport("dominio", "resumoSeguro");
  }

  it("contagem pequena nao aparece, e a porcentagem tambem nao", async () => {
    const fn = await resumo();
    const saida = fn({ rotulo: "finalizaram", contagem: 1, total: 3 });

    expect(
      /\d+\s*%/.test(saida),
      "ESTE E O VETO 4: com o denominador ao lado, 33% de 3 reidentifica a pessoa. Suprimir a contagem e imprimir a porcentagem NAO e suprimir.",
    ).toBe(false);
    expect(
      /\b1\b/.test(saida),
      "a contagem real vazou na saida suprimida.",
    ).toBe(false);
    expect(
      /\b33\b/.test(saida),
      "a porcentagem reidentifica a contagem suprimida.",
    ).toBe(false);
  });

  it("o mesmo vale quando a contagem pequena e o COMPLEMENTO do total", async () => {
    const fn = await resumo();
    const saida = fn({ rotulo: "finalizaram", contagem: 99, total: 100 });
    expect(
      /\b99\b|\b1\b|\d+\s*%/.test(saida),
      "99 de 100 identifica UMA pessoa pela ausencia. O piso vale para os DOIS lados, e esquecer o complemento e a forma que a supressao toma quando volta a furar.",
    ).toBe(false);
  });

  it("contagem grande aparece normalmente, senao a supressao viraria cegueira", async () => {
    const fn = await resumo();
    const saida = fn({ rotulo: "finalizaram", contagem: 1656, total: 13248 });
    expect(saida, "contagem acima do piso e exatamente o que PODE ser reportado (protocolo, secao 1).").toContain("1656");
  });
});

// ── 3. NENHUM LOG, NENHUM ERRO E NENHUMA LISTA CARREGA PII ─────────────────

describeSuspenso("log, erro e retorno de lista nao carregam dado pessoal", () => {
  it("o modulo nao loga campo de pessoa", async () => {
    const fonte = semComentario(fonteExigida());
    const suspeitos = [
      ...fonte.matchAll(
        /\b(?:log|warn|error|debug|verbose)\s*\([^)]{0,200}?\b(cpf|email|phoneNumber|telefone|nome|name|documento)\b/gi,
      ),
    ].map((m) => m[0].slice(0, 90));
    expect(
      suspeitos,
      "log de aplicacao nao carrega dado sensivel, nem em erro, nem em debug, nem em stack trace (protocolo, secao 1). O que se loga e id tecnico e contagem.",
    ).toEqual([]);
  });

  it("o erro por registro nao repete o dado da pessoa", async () => {
    const montarErro = await exigirExport<(r: unknown, motivo: string) => string>(
      "dominio",
      "erroDoRegistro",
    );
    const saida = montarErro(
      resultadoDigaiFingido({ cpf: CPF, name: NOME, email: EMAIL, phoneNumber: TELEFONE }),
      "partnerJobId nao resolve para vaga",
    );
    expect(
      piiNaSaida(saida, OS_VALORES),
      "mensagem de erro devolvida ao usuario nao carrega dado sensivel (protocolo, secao 1). O que ela diz e o id tecnico e o motivo.",
    ).toEqual([]);
    expect(saida, "o erro tem de ser UTIL: sem o id tecnico, ninguem consegue investigar a falha.").toContain("usr-sintetico-1");
  });

  it("o retorno da importacao e contagem e id tecnico, nunca identificador direto", async () => {
    const resumir = await exigirExport<(rs: unknown[]) => unknown>("dominio", "resumoDaImportacao");
    const saida = resumir([
      resultadoDigaiFingido({ cpf: CPF, name: NOME, email: EMAIL, phoneNumber: TELEFONE }),
      resultadoDigaiFingido({ userId: "usr-sintetico-2", name: "Beltrano De Teste" }),
    ]);
    expect(
      piiNaSaida(saida, [...OS_VALORES, "Beltrano De Teste"]),
      "retorno de LISTA nao carrega identificador direto: ele sai so na ficha individual (protocolo, secao 1). Lista e onde o vazamento vem multiplicado pelo tamanho da pagina.",
    ).toEqual([]);
  });
});

// ── 4. MINIMIZACAO: campo que a funcao nao usa nao e coletado ──────────────

describeSuspenso("minimizacao: so o que a funcao usa de verdade", () => {
  it("deficiencia, antecedentes criminais e julgamento sobre a pessoa ficam FORA", async () => {
    const campos = await exigirExport<readonly string[]>("dominio", "CAMPOS_COLETADOS_DO_DIGAI");
    const proibidos = [
      "disability",
      "deficiencia",
      "criminalRecord",
      "antecedentes",
      "matchLevel",
      "matchPct",
      "dnaScore",
      "proficiencyTest",
      "likelyReading",
      "rating",
    ];
    const achados = campos.filter((c) => proibidos.some((p) => c.toLowerCase() === p.toLowerCase()));
    expect(
      achados,
      "deficiencia e antecedentes sairam de TODA coleta por minimizacao, nem contagem; `matchLevel`, `proficiencyTest` e `likelyReading` sairam por serem JULGAMENTO SOBRE A PESSOA (protocolo, secao 3). Decisao imposta pelo `seguranca` em 16/09 e acatada.",
    ).toEqual([]);
  });
});
