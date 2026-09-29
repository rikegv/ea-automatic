/**
 * ─ A ASSERÇÃO DE POPULAÇÃO **DEPOIS** DO DESLIGAMENTO DO LÉXICO (veto do `seguranca`, rodada 5) ───
 *
 * ESCRITO PELO `tester` (§A.38), contra o REQUISITO, com linhas INJETADAS e com o conserto ainda em
 * voo (§A.40 regra 2). Vermelho aqui, enquanto a chave alcançar `linhaForaDoPadrao`, é o teste
 * funcionando.
 *
 * ┌─ O BURACO, E POR QUE ELE PASSOU POR MIM ────────────────────────────────────────────────────────┐
 * │ O desligamento do detector de nome foi implementado como CHAVE GLOBAL dentro de `auditarTexto`.   │
 * │ Só que `auditarTexto` tem QUATRO consumidores, e o segundo é `linhaForaDoPadrao` (`lote.ts`), que  │
 * │ é a ASSERÇÃO DE POPULAÇÃO: a trava que decide se o lote COMEÇA. A chave, pensada para o gate da    │
 * │ IMAGEM, atravessou para a trava da BASE, que o diretor não liberou e nem foi consultado sobre.     │
 * │                                                                                                  │
 * │ MEDIDO PELO `seguranca`: base com linha de pessoa nas três tabelas, sem CPF e sem e-mail, devolve  │
 * │ `aprovado=true, foraDoPadrao=0`, quando antes reprovava.                                         │
 * │                                                                                                  │
 * │ A MINHA FALHA FOI DE ALCANCE, e vale escrita: os meus 25 testes do desligamento medem             │
 * │ `auditarTexto` e não tocam `lote.ts`, e os meus testes de `lote.ts` usavam linha cuja sujeira era  │
 * │ NOME, então ficariam VERDES POR VACUIDADE depois do desligamento. Eu já tinha visto esse padrão    │
 * │ uma vez nesta frente (troquei a fixture por um e-mail de domínio reservado), e não o procurei no   │
 * │ arquivo vizinho. Este arquivo existe para que a dimensão NOME da população tenha teste PRÓPRIO,    │
 * │ que não depende da fixture de nenhum outro.                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A COBERTURA É PELA SUPERFÍCIE PÚBLICA, E NÃO PELA CHAVE ──────────────────────────────┐
 * │ Tudo aqui passa por `conferirBaseAntesDoLote`. Não me interessa COMO o léxico volta a valer para  │
 * │ a população (outro argumento, função dedicada, chave por chamador): interessa o RESULTADO, e é ele │
 * │ que o diretor mandou manter. Teste amarrado à forma do conserto vira retrabalho no próximo ajuste. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS QUATRO FONTES `ASSERCAO` SÃO DADO DE **TERCEIRO**, mesma classe do gestor ─────────────────┐
 * │ `dados_vaga_folha.substituido` (a pessoa substituída, §A.3 regra 10), `assinante_empresa`,        │
 * │ `admissao_dados_gi.filiacao` (nome da mãe e do pai) e `vagas.solicitante`. Nenhuma delas é o       │
 * │ candidato, e o fundamento que liberou o candidato (o time já manipula o dado dele na FONTE) NÃO as │
 * │ alcança. Hoje elas têm 0, 1, 0 e 0 linhas, e é exatamente por isso que o controle precisa estar de │
 * │ pé: ele foi escrito para o dia do RE-CLONE, que é o cenário inteiro pelo qual a asserção existe.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nomes inventados; a linha suja NÃO tem CPF nem e-mail, de propósito (ver `SO_O_NOME`).
 */
import { describe, expect, it, vi } from "vitest";
import {
  COLUNAS_DE_PESSOA,
  type ColunaDePessoa,
  conferirBaseAntesDoLote,
  type DependenciasLote,
  type LinhaPessoa,
  REGUA_DAS_COLUNAS_DE_PESSOA,
  type TabelaDePessoas,
} from "./lote";
import type { AllowlistArnes } from "./pii";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["mariana.alves@exemplo.invalid"],
};

/** A população limpa: nome DECLARADO pelo arnês mais CPF de família sintética. */
const CANDIDATOS_LIMPOS: LinhaPessoa[] = [
  { nome: "Mariana Alves Ribeiro", cpf: "99900000191", email: "mariana.alves@exemplo.invalid" },
];
const USUARIOS_LIMPOS: LinhaPessoa[] = [
  { nome: "Mariana Alves Ribeiro", email: "mariana.alves@exemplo.invalid" },
];

/**
 * ─ A FIXTURE É O TESTE: **SÓ O NOME**, sem CPF e sem e-mail ──────────────────────────────────────
 *
 * Toda linha "suja" dos meus outros arquivos carrega CPF fora da família sintética ou e-mail fora de
 * `.invalid`, e por isso elas continuaram reprovando depois do desligamento: quem as pegava era a
 * régua de FORMA, não o léxico. É justamente isso que escondia o buraco.
 *
 * Aqui a linha tem UM campo só. Se a asserção de população aprovar esta linha, ela perdeu a dimensão
 * NOME, e nenhuma outra régua do arquivo pode compensar, porque não há mais nada nela para pegar.
 */
const SO_O_NOME: LinhaPessoa = { nome: "Juliana Petrocelli Barbosa" };

type Amostras = Partial<Record<ColunaDePessoa, LinhaPessoa[]>>;

function montar(amostras: Amostras = {}, over: Partial<DependenciasLote> = {}) {
  const amostrarColunaDePessoa = vi.fn(async (fonte: ColunaDePessoa) => amostras[fonte] ?? []);
  const deps: DependenciasLote = {
    allowlist: ALLOWLIST,
    amostrarColunaDePessoa,
    amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
      t === "candidatos" ? CANDIDATOS_LIMPOS : USUARIOS_LIMPOS,
    ),
    reguaDeUsuarios: "DETECCAO_POR_IMAGEM",
    ...over,
  };
  return { deps, amostrarColunaDePessoa };
}

const comRegua = (r: string) =>
  COLUNAS_DE_PESSOA.filter((f) => REGUA_DAS_COLUNAS_DE_PESSOA[f] === r);

describe("1. `candidatos`: a régua ESTRITA não podia afrouxar, e nome é a dimensão que ela perdeu", () => {
  /**
   * CANDIDATO REAL NÃO PRECISA EXISTIR na homologação para o manual funcionar, e ele aparece em quase
   * toda tela. Esta é a trava mais antiga do desenho, e a que o re-clone ataca primeiro: a base volta
   * cheia de gente, sem CPF nenhum na tela de listagem, e o lote arranca.
   */
  it("UMA linha com SÓ O NOME em `candidatos` REPROVA a base", async () => {
    const { deps } = montar(
      {},
      {
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "candidatos" ? [...CANDIDATOS_LIMPOS, SO_O_NOME] : USUARIOS_LIMPOS,
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(
      v.aprovado,
      "linha de pessoa sem CPF e sem e-mail: se isto aprova, a asserção perdeu a dimensão NOME",
    ).toBe(false);
    expect(v.tabelas).toContain("candidatos");
    expect(v.totalForaDoPadrao).toBeGreaterThan(0);
  });

  /**
   * E O MOTIVO CONTINUA SEM PII (§A.6): ele vai para o log do CI, que é onde o dado sobrevive. A
   * asserção fica aqui também porque a mensagem é montada no mesmo caminho que está sendo consertado.
   */
  it("o motivo aponta a base sem carregar o nome encontrado", async () => {
    const { deps } = montar(
      {},
      { amostrarPessoas: vi.fn(async () => [SO_O_NOME]) },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(String(v.motivo ?? "")).not.toContain("Juliana");
  });
});

describe("2. AS QUATRO FONTES `ASSERCAO`: dado de TERCEIRO, uma asserção por fonte", () => {
  /**
   * A VARREDURA É PELO MAPA, e não pela lista escrita à mão: fonte nova em régua `ASSERCAO` entra
   * neste teste sozinha, que é a única forma de a cobertura não envelhecer junto com a lista.
   */
  it("linha com SÓ O NOME em cada fonte de régua ASSERCAO REPROVA a base", async () => {
    const fontes = comRegua("ASSERCAO");
    expect(fontes.length, "sem fonte em ASSERCAO este teste seria vácuo").toBeGreaterThan(0);
    for (const fonte of fontes) {
      const { deps } = montar({ [fonte]: [SO_O_NOME] });
      const v = await conferirBaseAntesDoLote(deps);
      expect(v.aprovado, `${fonte} é ASSERCAO e tem de reprovar com nome de pessoa`).toBe(false);
      expect(v.colunas ?? [], `${fonte} tem de ser nomeada no veredito`).toContain(fonte);
    }
  });

  /**
   * AS QUATRO JUNTAS, que é a forma do re-clone: não é uma fonte suja, é a base inteira voltando com
   * gente. A contagem tem de somar as quatro, e não parar na primeira.
   */
  it("as quatro sujas ao mesmo tempo: todas nomeadas, contagem somada", async () => {
    const fontes = comRegua("ASSERCAO");
    const amostras: Amostras = {};
    for (const f of fontes) amostras[f] = [SO_O_NOME];
    const { deps } = montar(amostras);
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(false);
    for (const f of fontes) expect(v.colunas ?? []).toContain(f);
    expect(v.totalForaDoPadrao).toBe(fontes.length);
  });
});

describe("3. O CONTRASTE que prova que o teste mede o que diz", () => {
  /**
   * SEM ESTE BLOCO, o teste acima poderia estar verde por o conserto ter religado o léxico PARA TUDO,
   * inclusive para as fontes que o diretor LIBEROU. Aí a frente inteira voltaria a ser barrada pelas
   * 42 + 53 + 13 linhas que a OST do desbloqueio existiu para liberar, e o sintoma seria um lote que
   * não começa, com a causa escondida atrás de um teste verde.
   */
  it("a MESMA linha nas fontes LIBERADAS continua NÃO reprovando", async () => {
    const fontes = comRegua("LIBERADA");
    expect(fontes.length).toBeGreaterThan(0);
    for (const fonte of fontes) {
      const { deps } = montar({ [fonte]: [SO_O_NOME] });
      const v = await conferirBaseAntesDoLote(deps);
      expect(v.aprovado, `${fonte} foi LIBERADA por ato do diretor`).toBe(true);
      expect(v.colunas ?? []).not.toContain(fonte);
    }
  });

  it("a MESMA linha na fonte DENYLIST não reprova e alimenta `nomesDeColuna`", async () => {
    const fontes = comRegua("DENYLIST");
    expect(fontes.length).toBeGreaterThan(0);
    for (const fonte of fontes) {
      const { deps } = montar({ [fonte]: [SO_O_NOME] });
      const v = await conferirBaseAntesDoLote(deps);
      expect(v.aprovado, `${fonte} é DENYLIST: protege a imagem, não barra o lote`).toBe(true);
      expect(v.negados.nomesDeColuna ?? []).toContain(SO_O_NOME.nome);
      // E NÃO em `nomes`, que é o conjunto que poda o catálogo (ver a rodada 4).
      expect(v.negados.nomes).not.toContain(SO_O_NOME.nome);
    }
  });
});

describe("4. O FAIL-CLOSED das tabelas de gente, também na dimensão NOME", () => {
  /**
   * ─ ESQUECER DE DECLARAR A RÉGUA TEM DE FALHAR PARA O LADO SEGURO ─────────────────────────────
   *
   * `reguaDeUsuarios` ausente significa "as três tabelas na régua ESTRITA", e isso é desenho: afrouxar
   * `usuarios` é um ATO DECLARADO por quem chama, e ele vem acompanhado da denylist que substitui a
   * trava. Com o léxico desligado atravessando para cá, o fail-closed virava fail-OPEN silencioso:
   * quem esquecesse a declaração passaria a receber APROVADO, que é o oposto do que a omissão tem de
   * produzir.
   */
  it("sem `reguaDeUsuarios`, linha com SÓ O NOME em `usuarios` REPROVA", async () => {
    const { deps } = montar(
      {},
      {
        reguaDeUsuarios: undefined,
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "usuarios" ? [SO_O_NOME] : CANDIDATOS_LIMPOS,
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(false);
    expect(v.tabelas).toContain("usuarios");
  });

  it("sem `reguaDeUsuarios`, linha com SÓ O NOME em `comerciais` REPROVA", async () => {
    const { deps } = montar(
      {},
      {
        reguaDeUsuarios: undefined,
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "comerciais" ? [SO_O_NOME] : CANDIDATOS_LIMPOS,
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(false);
    expect(v.tabelas).toContain("comerciais");
  });

  /**
   * O PAR DO FAIL-CLOSED: com a régua DECLARADA, nome de colega deixa de barrar o lote e passa a ser
   * o que o gate PROCURA em cada imagem. As duas metades juntas são o contrato; uma sozinha não é.
   */
  it("com `DETECCAO_POR_IMAGEM` declarada, o nome de colega NÃO barra e vai para a denylist", async () => {
    const { deps } = montar(
      {},
      {
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "candidatos" ? CANDIDATOS_LIMPOS : [SO_O_NOME],
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(true);
    expect(v.negados.nomes).toContain(SO_O_NOME.nome);
  });
});
