import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { GiDeParaService } from "./gi-depara.service";

/**
 * A PROVA DOS DOIS DE/PARA PREENCHIDOS COM DADO REAL (frente do GI, 02/10/2026).
 *
 * Escrito pelo `tester`, independente de quem gerou o dado e de quem escreveu o serviço (§A.38).
 * O resto da suíte do `GiDeParaService` (`gi-depara.service.spec.ts`) mede o COMPORTAMENTO com mapas
 * de brinquedo, de 1 ou 2 chaves. Este arquivo mede outra pergunta, que nenhum spec de brinquedo
 * alcança: **o dado que vai para o `.env` está CERTO, e o serviço carregado com ele responde o que
 * a produção do fornecedor respondeu.**
 *
 * ═══ AS DUAS FONTES, e o que cada uma vale como prova ═══
 *
 *  1. `fixtures/gi-depara-municipios-ibge.json`: 5571 chaves `"UF|CIDADE"` -> código IBGE de 7
 *     dígitos, 27 UFs, gerado da API pública do IBGE (`localidades/municipios`). Cópia byte a byte do
 *     artefato gerado, para a prova não depender de rede nem de regerar nada.
 *  2. `fixtures/gi-pares-empresa-filial.json`: 127 pares `"empresa|filial"`, 47 empresas, filial 0
 *     presente para todas as 47, MEDIDOS de `Empresa/GetAll` do GI.
 *
 * **A ÂNCORA, e é a única amostra com confirmação EXTERNA: Campinas/SP = `3509502`.** Esse número não
 * é "o que o IBGE diz": é o que **o GI guardou** em `codMunicipioNascto` no registro 27 da rodada 4.
 * É o único ponto em que o espaço de código do fornecedor foi observado de fora, e é por isso que ele
 * é asserido isolado, com nome próprio, em vez de diluído num laço sobre as 5571 linhas.
 *
 * ═══ A PORTA CERTA, e esta é a CORREÇÃO de 02/10/2026 ═══
 *
 * O mapa IBGE entra por **`GI_DEPARA_MUNICIPIOS_IBGE`** e sai por **`codigoMunicipioIbge`**, que são a
 * env e o método do **NASCIMENTO** (`codMunicipioNascto`). **Não** por `GI_DEPARA_CIDADES` /
 * `codigoCidade`, que são os da **RESIDÊNCIA** (`codigoCidadeResid`), cujo espaço de código é
 * DESCONHECIDO e que **permanece VAZIA em produção** até ser observável.
 *
 * ⚠️ A primeira versão deste arquivo alimentava o IBGE em `GI_DEPARA_CIDADES` e asseria por
 * `codigoCidade`, e ficou **VERDE** depois da separação, porque o serviço resolve qualquer mapa que
 * receba em qualquer das duas envs. **É esse o perigo que justifica esta nota:** o verde continuava
 * aceso enquanto a âncora era validada pela porta errada, e o cabeçalho descrevia o mundo anterior, em
 * que um método só servia os dois campos. Teste verde pela porta errada não prova o que diz provar.
 *
 * ⚠️ O QUE ESTA PROVA **NÃO** PROVA, e continua valendo (achado 0 do
 * `docs/MAPA-GI-FECHAR-A-PONTE.md`): nada aqui diz que o espaço de código da RESIDÊNCIA é IBGE. A
 * separação existe exatamente porque ele é desconhecido, e quem prova a separação ponta a ponta, no
 * payload, é o `gi-cidade-separada.tester.spec.ts`. **Verde aqui não é licença para colar este JSON em
 * `GI_DEPARA_CIDADES`.**
 *
 * §A.6: NENHUM dado de pessoa. Código de município, de empresa e de filial é catálogo PÚBLICO, não
 * PII, e nenhum valor de pessoa aparece em asserção ou em mensagem de falha.
 */

const DIR_FIXTURES = join(__dirname, "fixtures");

function lerFixture(nome: string): string {
  return readFileSync(join(DIR_FIXTURES, nome), "utf8");
}

/** O JSON do IBGE, exatamente como iria para `GI_DEPARA_MUNICIPIOS_IBGE` (NASCIMENTO). */
const IBGE_JSON = lerFixture("gi-depara-municipios-ibge.json");
/** O JSON dos pares, exatamente como iria para `GI_PARES_EMPRESA_FILIAL`. */
const PARES_JSON = lerFixture("gi-pares-empresa-filial.json");

const IBGE = JSON.parse(IBGE_JSON) as Record<string, string>;
const PARES = JSON.parse(PARES_JSON) as string[];

function svc(env: Record<string, string>): GiDeParaService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new GiDeParaService(config);
}

/**
 * O serviço carregado com os dois mapas que a produção VAI ter: o IBGE na env do NASCIMENTO e os pares.
 * `GI_DEPARA_CIDADES` (RESIDÊNCIA) fica de fora de propósito, porque é assim que a produção fica.
 */
function servicoPreenchido(): GiDeParaService {
  return svc({ GI_DEPARA_MUNICIPIOS_IBGE: IBGE_JSON, GI_PARES_EMPRESA_FILIAL: PARES_JSON });
}

/** As 27 unidades federativas, escritas à mão: lista FECHADA, não derivada do próprio dado. */
const UFS_ESPERADAS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

describe("de/para IBGE preenchido: a âncora medida contra a produção do GI", () => {
  it("Campinas/SP resolve 3509502, o código que o GI GUARDOU no registro 27 da rodada 4", () => {
    expect(servicoPreenchido().codigoMunicipioIbge("Campinas", "SP")).toBe("3509502");
  });

  it("a âncora também está no DADO, não só na resposta do serviço", () => {
    // Blinda contra um mapa que resolvesse por acidente (fallback, palpite, normalização torta).
    expect(IBGE["SP|CAMPINAS"]).toBe("3509502");
  });

  it("o mapa IBGE na env do NASCIMENTO NÃO responde pela RESIDÊNCIA", () => {
    // A asserção que a primeira versão deste arquivo não tinha, e que é a razão de ele ter ficado
    // verde pela porta errada.
    expect(servicoPreenchido().codigoCidade("Campinas", "SP")).toBeNull();
  });
});

describe("de/para IBGE preenchido: a mesma chave com acento, sem acento e em qualquer caixa", () => {
  const VARIANTES: ReadonlyArray<readonly [string, string]> = [
    ["São Paulo", "SP"],
    ["SÃO PAULO", "SP"],
    ["sao paulo", "sp"],
    ["Sao Paulo", "sp"],
    ["SAO PAULO", "Sp"],
    ["  São   Paulo  ", " sp "],
  ];

  for (const [nome, uf] of VARIANTES) {
    it(`"${nome}" + "${uf}" -> 3550308`, () => {
      expect(servicoPreenchido().codigoMunicipioIbge(nome, uf)).toBe("3550308");
    });
  }

  it("acento no MEIO e cedilha também casam (Açailandia/MA, Brasilia/DF)", () => {
    const s = servicoPreenchido();
    expect(s.codigoMunicipioIbge("Açailândia", "MA")).toBe(s.codigoMunicipioIbge("ACAILANDIA", "ma"));
    expect(s.codigoMunicipioIbge("Açailândia", "MA")).not.toBeNull();
    expect(s.codigoMunicipioIbge("Brasília", "df")).toBe("5300108");
  });
});

describe("de/para IBGE preenchido: FAIL-CLOSED, não se inventa código", () => {
  it("cidade que NÃO existe devolve null", () => {
    const s = servicoPreenchido();
    expect(s.codigoMunicipioIbge("Xapurizinho Do Norte Inexistente", "SP")).toBeNull();
  });

  it("cidade REAL em OUTRA UF devolve null: Campinas/RJ não é palpite de Campinas/SP", () => {
    const s = servicoPreenchido();
    expect(s.codigoMunicipioIbge("Campinas", "RJ")).toBeNull();
    // E não é que a UF toda falte: o Rio de Janeiro resolve na mesma chamada.
    expect(s.codigoMunicipioIbge("Rio de Janeiro", "RJ")).toBe("3304557");
  });

  it("UF que não existe devolve null, mesmo com nome de cidade real", () => {
    expect(servicoPreenchido().codigoMunicipioIbge("Campinas", "XX")).toBeNull();
  });

  it("nome PARCIAL não casa: sem busca por prefixo, sem 'o mais parecido'", () => {
    const s = servicoPreenchido();
    expect(s.codigoMunicipioIbge("Campin", "SP")).toBeNull();
    expect(s.codigoMunicipioIbge("Campinas Do Sul", "SP")).toBeNull();
    // "Campinas do Sul" existe, mas no RS: a chave composta é que decide.
    expect(s.codigoMunicipioIbge("Campinas do Sul", "RS")).not.toBeNull();
  });

  it("nome ou UF vazio devolve null", () => {
    const s = servicoPreenchido();
    expect(s.codigoMunicipioIbge("", "SP")).toBeNull();
    expect(s.codigoMunicipioIbge("Campinas", "")).toBeNull();
    expect(s.codigoMunicipioIbge(null, null)).toBeNull();
  });
});

describe("de/para IBGE preenchido: a FORMA do dado (5571 / 7 dígitos / 27 UFs)", () => {
  it("são 5571 municípios", () => {
    expect(Object.keys(IBGE)).toHaveLength(5571);
  });

  it("TODOS os 5571 códigos têm 7 dígitos e são numéricos", () => {
    const fora = Object.entries(IBGE).filter(([, v]) => !/^\d{7}$/.test(String(v)));
    expect(fora.map(([k]) => k)).toEqual([]);
  });

  it("NENHUM código começa com zero: o payload tira zero à esquerda e encurtaria o código", () => {
    // `inteiroGi`, na emissão do payload, remove zero à esquerda. Um código IBGE iniciado por `0`
    // chegaria ao GI com 6 dígitos, apontando para outro município. Nenhum começa, e isto trava o dia
    // em que a fixture for regerada de outra fonte.
    expect(Object.entries(IBGE).filter(([, v]) => String(v).startsWith("0")).map(([k]) => k)).toEqual(
      [],
    );
  });

  it("as 27 UFs estão presentes, e NENHUMA a mais", () => {
    const ufs = [...new Set(Object.keys(IBGE).map((k) => k.split("|")[0]))].sort();
    expect(ufs).toEqual([...UFS_ESPERADAS].sort());
  });

  it("a CHAVE é 'UF|CIDADE', nessa ordem: UF de 2 letras na PRIMEIRA posição", () => {
    // A ordem é o contrato com o `.env`. Invertê-la em um dos dois lados (dado ou serviço) só
    // aparece aqui: a inversão nos DOIS lados é renomeação interna e não muda resposta nenhuma.
    const malformadas = Object.keys(IBGE).filter((k) => {
      const partes = k.split("|");
      return partes.length !== 2 || !/^[A-Z]{2}$/.test(partes[0]) || partes[1].length === 0;
    });
    expect(malformadas).toEqual([]);
  });

  it("mapa com a chave INVERTIDA ('CIDADE|UF') NÃO resolve: a convenção é exigida", () => {
    const s = svc({ GI_DEPARA_MUNICIPIOS_IBGE: JSON.stringify({ "CAMPINAS|SP": "3509502" }) });
    expect(s.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
  });

  it("ZERO colisão após normalizar: as 5571 chaves resolvem CADA UMA o seu próprio código", () => {
    // Se duas chaves cruas normalizassem para a mesma, uma sobrescreveria a outra em silêncio e o
    // município perdido passaria a responder o código do vizinho. Este laço é a prova de que não há.
    const s = servicoPreenchido();
    const divergentes: string[] = [];
    for (const [chave, codigo] of Object.entries(IBGE)) {
      const [uf, cidade] = chave.split("|");
      if (s.codigoMunicipioIbge(cidade, uf) !== String(codigo)) divergentes.push(chave);
    }
    expect(divergentes).toEqual([]);
  });

  it("os 5571 códigos são DISTINTOS entre si (um município, um código)", () => {
    expect(new Set(Object.values(IBGE).map(String)).size).toBe(5571);
  });
});

describe("de/para de PARES (empresa, filial) preenchido: os pares reais da rodada 4", () => {
  it("aceita 2/4 e 1/4, os dois pares usados na rodada 4", () => {
    const s = servicoPreenchido();
    expect(s.parEmpresaFilialConhecido(2, 4)).toBe(true);
    expect(s.parEmpresaFilialConhecido(1, 4)).toBe(true);
  });

  it("aceita FILIAL 0 (1/0): zero é par LEGÍTIMO no GI, não ausência", () => {
    expect(servicoPreenchido().parEmpresaFilialConhecido(1, 0)).toBe(true);
  });

  it("RECUSA 1/37: válido nos dois campos em separado e INEXISTENTE no GI", () => {
    // É o caso exato que validar campo a campo NÃO pega. `1` é empresa real, `37` é filial real
    // (de outra empresa), o par não existe, e sem esta recusa o registro nasce apontando para um
    // estabelecimento que não há.
    expect(servicoPreenchido().parEmpresaFilialConhecido(1, 37)).toBe(false);
    expect(PARES).not.toContain("1|37");
  });

  it("recusa tudo o que está FORA da lista medida, e aceita tudo o que está DENTRO", () => {
    const s = servicoPreenchido();
    const dentro = PARES.map((p) => p.split("|").map(Number) as [number, number]);
    expect(dentro.filter(([e, f]) => !s.parEmpresaFilialConhecido(e, f))).toEqual([]);

    const conhecidos = new Set(PARES);
    const forasteiros: string[] = [];
    for (let empresa = 1; empresa <= 60; empresa += 1) {
      for (const filial of [0, 4, 37, 60, 123]) {
        const chave = `${empresa}|${filial}`;
        if (!conhecidos.has(chave) && s.parEmpresaFilialConhecido(empresa, filial)) {
          forasteiros.push(chave);
        }
      }
    }
    expect(forasteiros).toEqual([]);
  });
});

describe("de/para de PARES preenchido: a FORMA do dado (127 pares / 47 empresas / filial 0)", () => {
  it("são 127 pares, de 47 empresas", () => {
    expect(PARES).toHaveLength(127);
    expect(new Set(PARES.map((p) => p.split("|")[0])).size).toBe(47);
  });

  it("a filial 0 existe para TODAS as 47 empresas", () => {
    const s = servicoPreenchido();
    const empresas = [...new Set(PARES.map((p) => Number(p.split("|")[0])))];
    expect(empresas).toHaveLength(47);
    expect(empresas.filter((e) => !s.parEmpresaFilialConhecido(e, 0))).toEqual([]);
  });

  it("nenhum par declara empresa 0 (empresa 0 não existe no GI)", () => {
    expect(PARES.filter((p) => p.startsWith("0|"))).toEqual([]);
  });

  it("todo par é 'inteiro|inteiro' e cabe no int16", () => {
    const fora = PARES.filter((p) => {
      const partes = p.split("|");
      if (partes.length !== 2) return true;
      return partes.some((n) => !/^(?:0|[1-9]\d*)$/.test(n) || Number(n) > 32767);
    });
    expect(fora).toEqual([]);
  });

  it("os 127 pares são distintos (a lista não tem repetição)", () => {
    expect(new Set(PARES).size).toBe(127);
  });
});

/**
 * O FAIL-CLOSED DA RESIDÊNCIA É O ESTADO DE PRODUÇÃO, não um caso de borda: `GI_DEPARA_CIDADES` fica
 * VAZIA até o espaço de código do fornecedor ser observável, e `codigoCidadeResid` sai NULO. Estas
 * asserções ficam aqui, intactas da primeira versão, porque é esse o mundo que vai para o ar.
 */
describe("FAIL-CLOSED preservado: sem env, nada resolve e nada é conhecido", () => {
  it("SEM env: os DOIS resolvedores de cidade são null, até para a âncora", () => {
    const s = svc({});
    expect(s.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
    expect(s.codigoMunicipioIbge("Sao Paulo", "SP")).toBeNull();
    expect(s.codigoCidade("Campinas", "SP")).toBeNull();
    expect(s.codigoCidade("Sao Paulo", "SP")).toBeNull();
  });

  it("SEM env: `parEmpresaFilialConhecido` é false para QUALQUER par, inclusive os reais", () => {
    const s = svc({});
    for (const [e, f] of [[1, 4], [2, 4], [1, 0], [1, 37]] as const) {
      expect(s.parEmpresaFilialConhecido(e, f)).toBe(false);
    }
  });

  it("uma env preenchida NÃO abre a outra: os TRÊS mapas são independentes", () => {
    const soIbge = svc({ GI_DEPARA_MUNICIPIOS_IBGE: IBGE_JSON });
    expect(soIbge.codigoMunicipioIbge("Campinas", "SP")).toBe("3509502");
    expect(soIbge.codigoCidade("Campinas", "SP")).toBeNull();
    expect(soIbge.parEmpresaFilialConhecido(1, 4)).toBe(false);

    const soPares = svc({ GI_PARES_EMPRESA_FILIAL: PARES_JSON });
    expect(soPares.parEmpresaFilialConhecido(1, 4)).toBe(true);
    expect(soPares.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
    expect(soPares.codigoCidade("Campinas", "SP")).toBeNull();

    // E a env da RESIDÊNCIA, se um dia for preenchida, não alcança o NASCIMENTO.
    const soResidencia = svc({ GI_DEPARA_CIDADES: JSON.stringify({ "SP|CAMPINAS": "7107" }) });
    expect(soResidencia.codigoCidade("Campinas", "SP")).toBe("7107");
    expect(soResidencia.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
  });

  it("env CORROMPIDA volta ao fail-closed, não a um mapa meio carregado", () => {
    const s = svc({
      GI_DEPARA_MUNICIPIOS_IBGE: `${IBGE_JSON.slice(0, 500)}`,
      GI_DEPARA_CIDADES: `${IBGE_JSON.slice(0, 500)}`,
      GI_PARES_EMPRESA_FILIAL: `${PARES_JSON.slice(0, 50)}`,
    });
    expect(s.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
    expect(s.codigoCidade("Campinas", "SP")).toBeNull();
    expect(s.parEmpresaFilialConhecido(1, 4)).toBe(false);
  });
});
