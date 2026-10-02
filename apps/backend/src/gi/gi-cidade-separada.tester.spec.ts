import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import {
  DE_PARA_GI_VAZIO,
  montarContratacaoGi,
  montarFuncionarioSelecao,
  type ContratacaoGi,
  type DeParaGi,
  type FuncionarioSelecao,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";
import { GiDeParaService } from "./gi-depara.service";

/**
 * A SEPARAÇÃO DOS DOIS RESOLVEDORES DE CIDADE: nascimento e residência deixam de dividir o mesmo mapa.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO (§A.38/§A.40 regra 2), **em paralelo à construção** e
 * ANTES de o código existir. É esperado que este arquivo nasça VERMELHO; ele é a definição executável
 * do que o `backend` tem de entregar.
 *
 * ═══ POR QUE A SEPARAÇÃO, e é o achado 0 do `docs/MAPA-GI-FECHAR-A-PONTE.md` ═══
 *
 * Um de/para alimentava DOIS campos de espaços de código possivelmente DIFERENTES:
 *
 *  - `codMunicipioNascto` (NASCIMENTO): espaço **IBGE, 7 dígitos**, e isso é MEDIDO, não deduzido. O GI
 *    guardou `3509502` (Campinas/SP) nesse campo no registro 27 da rodada 4. É a única amostra com
 *    confirmação externa, e por isso ela é a âncora de toda esta prova.
 *  - `codigoCidadeResid` (RESIDÊNCIA): espaço **DESCONHECIDO**, possivelmente FK do catálogo interno do
 *    fornecedor (`DePara/GetAll` do GI responde 200 com **0 itens**, e `FuncionarioSelecao/GetAll`
 *    responde 200 com **0 registros**, porque o GI consome a fila em menos de 10 min: não há de onde ler
 *    o par cidade->código).
 *
 * Com UM mapa só, encher o IBGE fazia o nascimento sair CERTO e a residência sair com um código de OUTRO
 * espaço, apontando para a cidade errada na folha, **em silêncio e sem nada falhar**. A decisão do
 * diretor é separar: duas envs, dois métodos, e a da residência **fica VAZIA em produção** até o espaço
 * do fornecedor ser observável. Fail-closed não mente; palpite mente.
 *
 * ═══ O DESENHO DO EXPERIMENTO, que é o que dá força a este arquivo ═══
 *
 * A pessoa sintética nasceu e mora **na MESMA cidade** (Campinas/SP), e os dois mapas, quando os dois
 * aparecem, trazem **códigos DIFERENTES para essa mesma cidade**. Assim nenhuma asserção pode passar por
 * coincidência: qualquer cruzamento de fios (o método do nascimento lendo a env da residência, os dois
 * lendo a mesma env, um campo emitido pelo resolvedor do outro) troca um valor por outro e fica vermelho.
 * Com cidades diferentes ou códigos iguais, essa classe de erro passaria verde, que é como ela sobrevive.
 *
 * §A.6: toda entrada é SINTÉTICA (CPF de faixa reservada 999, nome inventado, domínio de homologação).
 * Código de município é catálogo PÚBLICO, não PII, e nenhum valor de pessoa é asserido em mensagem.
 */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// O VOCABULÁRIO FIXO DO REQUISITO. Nomes DADOS, não escolhidos aqui.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Env NOVA: mapa IBGE, alimenta SÓ `codMunicipioNascto`. */
const ENV_IBGE = "GI_DEPARA_MUNICIPIOS_IBGE";
/** Env que JÁ EXISTE: alimenta SÓ `codigoCidadeResid`, e fica VAZIA em produção. */
const ENV_RESIDENCIA = "GI_DEPARA_CIDADES";

/**
 * A assinatura ESPERADA da interface depois da separação. Declarada aqui porque a construção ainda não
 * terminou: `codigoCidade` continua sendo o da RESIDÊNCIA, e `codigoMunicipioIbge` é o novo, do
 * NASCIMENTO. A presença do método **na interface de verdade** não fica confiando nesta declaração:
 * é asserida abaixo, contra o `DE_PARA_GI_VAZIO` e contra a fonte.
 */
type DeParaGiSeparado = DeParaGi & {
  codigoMunicipioIbge(nome: string | null | undefined, uf: string | null | undefined): string | null;
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// O DADO: a fixture IBGE real, já commitada, e um mapa de residência de OUTRO espaço de código
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** O mapa IBGE real (5571 municípios, 27 UFs), reusado da trava do de/para preenchido. */
const IBGE_JSON = readFileSync(
  join(__dirname, "fixtures", "gi-depara-municipios-ibge.json"),
  "utf8",
);

/** A âncora: o que o GI GUARDOU em `codMunicipioNascto` no registro 27 da rodada 4. */
const CODIGO_IBGE_CAMPINAS = "3509502";

/**
 * O mapa da RESIDÊNCIA, sintético e de UM código só, deliberadamente de OUTRO espaço: `7107` é o valor
 * que aparecia no `.env.example` e que **nunca foi lido da produção do GI** (São Paulo no IBGE é
 * `3550308`, não `7107`). Aqui ele serve de MARCADOR: se este número aparecer no campo do nascimento,
 * os fios estão cruzados.
 */
const CODIGO_RESIDENCIA_MARCADOR = "7107";
const RESIDENCIA_JSON = JSON.stringify({ "SP|CAMPINAS": CODIGO_RESIDENCIA_MARCADOR });

const CPF_SINTETICO = "99988877766";

/** Nasceu e MORA na mesma cidade: é isso que torna a troca de fios visível. */
const PESSOA: PessoaParaGi = {
  nome: "Zarolina Trevisanto Quembe",
  cpf: CPF_SINTETICO,
  email: "zarolina@homolog.local",
  cidadeNascimento: "Campinas",
  naturalidade: "SP",
  cidade: "Campinas",
  uf: "SP",
};

function contratacao(): ContratacaoGi {
  return montarContratacaoGi({
    salario: "1500.50",
    salarioUnidade: "MENSAL",
    dataAdmissao: "2026-11-03",
    tipoContrato: "Temporário",
    vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "4", ativo: true }],
    codCliente: "57460",
  });
}

function servico(env: Record<string, string>): DeParaGiSeparado {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new GiDeParaService(config) as unknown as DeParaGiSeparado;
}

/** O payload, montado pelo caminho REAL (`montarFuncionarioSelecao`), com o de/para injetado. */
function payloadCom(env: Record<string, string>): FuncionarioSelecao {
  return montarFuncionarioSelecao(PESSOA, servico(env), contratacao());
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1. A SEPARAÇÃO. O teste que vale mais que todos os outros deste arquivo.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("A SEPARACAO: o mapa IBGE enche o NASCIMENTO e NAO enche a RESIDENCIA", () => {
  it("IBGE preenchida + residencia VAZIA: nascimento 3509502 e `codigoCidadeResid` NULO", () => {
    // ESTA É A DECISÃO DO DIRETOR ESCRITA EM ASSERÇÃO: é o estado que a produção vai ter.
    const f = payloadCom({ [ENV_IBGE]: IBGE_JSON, [ENV_RESIDENCIA]: "" });
    expect(f.codMunicipioNascto).toBe(CODIGO_IBGE_CAMPINAS);
    expect(
      f.codigoCidadeResid,
      "o mapa IBGE encheu a RESIDENCIA: e o achado 0, codigo de outro espaco na folha",
    ).toBeNull();
  });

  it("a env da residencia AUSENTE (nem declarada) tem o mesmo efeito que vazia", () => {
    const f = payloadCom({ [ENV_IBGE]: IBGE_JSON });
    expect(f.codMunicipioNascto).toBe(CODIGO_IBGE_CAMPINAS);
    expect(f.codigoCidadeResid).toBeNull();
  });

  it("a cidade por TEXTO continua saindo nos dois campos: a separacao e do CODIGO, nao do nome", () => {
    const f = payloadCom({ [ENV_IBGE]: IBGE_JSON });
    expect(f.cidadeNascimento).toBe("Campinas");
    expect(f.cidadeResid).toBe("Campinas");
    expect(f.ufResid).toBe("SP");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2. O INVERSO. Prova que os mapas não se misturam, nos DOIS sentidos.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("O INVERSO: a env da RESIDENCIA nao alcanca o campo do NASCIMENTO", () => {
  it("residencia preenchida + IBGE vazia: `codMunicipioNascto` NULO", () => {
    const f = payloadCom({ [ENV_RESIDENCIA]: RESIDENCIA_JSON, [ENV_IBGE]: "" });
    expect(
      f.codMunicipioNascto,
      "o campo do NASCIMENTO leu a env da RESIDENCIA: os fios estao cruzados",
    ).toBeNull();
    // E a residência resolveu pelo mapa dela: não é que nada funcione.
    expect(f.codigoCidadeResid).toBe(CODIGO_RESIDENCIA_MARCADOR);
  });

  it("AS DUAS preenchidas com codigos DIFERENTES: cada campo sai com o SEU, e eles nao se tocam", () => {
    /**
     * A asserção que mata as três trocas de uma vez (método do nascimento lendo a env da residência,
     * os dois métodos lendo a MESMA env, e um campo emitido pelo resolvedor do outro): mesma cidade,
     * dois códigos, e cada campo tem de sair com o seu.
     */
    const f = payloadCom({ [ENV_IBGE]: IBGE_JSON, [ENV_RESIDENCIA]: RESIDENCIA_JSON });
    expect(f.codMunicipioNascto).toBe(CODIGO_IBGE_CAMPINAS);
    expect(f.codigoCidadeResid).toBe(CODIGO_RESIDENCIA_MARCADOR);
    expect(f.codMunicipioNascto).not.toBe(f.codigoCidadeResid);
  });

  it("TROCAR o conteudo de UMA env nao mexe no campo da outra (isolamento de entrada)", () => {
    const outraResidencia = JSON.stringify({ "SP|CAMPINAS": "4242" });
    const f = payloadCom({ [ENV_IBGE]: IBGE_JSON, [ENV_RESIDENCIA]: outraResidencia });
    expect(f.codigoCidadeResid).toBe("4242");
    expect(f.codMunicipioNascto).toBe(CODIGO_IBGE_CAMPINAS);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3. OS DOIS RESOLVEDORES NO SERVIÇO: cada método em sua env, e nenhum lê a do outro.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("GiDeParaService: `codigoMunicipioIbge` e `codigoCidade` leem envs DIFERENTES", () => {
  it("`codigoMunicipioIbge` le a env IBGE; `codigoCidade` NAO ve nada", () => {
    const s = servico({ [ENV_IBGE]: IBGE_JSON });
    expect(s.codigoMunicipioIbge("Campinas", "SP")).toBe(CODIGO_IBGE_CAMPINAS);
    expect(s.codigoCidade("Campinas", "SP")).toBeNull();
  });

  it("`codigoCidade` le a env da residencia; `codigoMunicipioIbge` NAO ve nada", () => {
    const s = servico({ [ENV_RESIDENCIA]: RESIDENCIA_JSON });
    expect(s.codigoCidade("Campinas", "SP")).toBe(CODIGO_RESIDENCIA_MARCADOR);
    expect(s.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
  });

  it("o NOVO metodo herdou a normalizacao: acento, caixa e espaco casam a mesma chave", () => {
    const s = servico({ [ENV_IBGE]: IBGE_JSON });
    expect(s.codigoMunicipioIbge("São Paulo", "sp")).toBe("3550308");
    expect(s.codigoMunicipioIbge("  SAO   PAULO ", " SP ")).toBe("3550308");
  });

  it("o NOVO metodo tambem NAO INVENTA: cidade de outra UF e cidade inexistente dao null", () => {
    const s = servico({ [ENV_IBGE]: IBGE_JSON });
    expect(s.codigoMunicipioIbge("Campinas", "RJ")).toBeNull();
    expect(s.codigoMunicipioIbge("Xapurizinho Do Norte Inexistente", "SP")).toBeNull();
    expect(s.codigoMunicipioIbge(null, "SP")).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4. FAIL-CLOSED nos DOIS, e o no-op da interface implementando os DOIS.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("FAIL-CLOSED preservado nos DOIS resolvedores", () => {
  it("SEM env nenhuma: os DOIS campos do payload saem NULOS", () => {
    const f = payloadCom({});
    expect(f.codMunicipioNascto).toBeNull();
    expect(f.codigoCidadeResid).toBeNull();
    // E o nulo não é `0`: `0` seria referência a município inexistente, o default do campo no GI.
    expect(f.codMunicipioNascto).not.toBe("0");
    expect(f.codigoCidadeResid).not.toBe("0");
  });

  it("SEM env nenhuma: os DOIS metodos do servico devolvem null", () => {
    const s = servico({});
    expect(s.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
    expect(s.codigoCidade("Campinas", "SP")).toBeNull();
  });

  it("env CORROMPIDA nas duas volta ao fail-closed, nao a um mapa meio carregado", () => {
    const s = servico({ [ENV_IBGE]: "{nao é json", [ENV_RESIDENCIA]: "{nao é json" });
    expect(s.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
    expect(s.codigoCidade("Campinas", "SP")).toBeNull();
  });

  it("o NO-OP da interface (`DE_PARA_GI_VAZIO`) implementa os DOIS metodos e devolve null nos dois", () => {
    const vazio = DE_PARA_GI_VAZIO as DeParaGiSeparado;
    expect(typeof vazio.codigoCidade, "`codigoCidade` saiu do no-op").toBe("function");
    expect(
      typeof vazio.codigoMunicipioIbge,
      "`codigoMunicipioIbge` NAO esta no no-op: todo chamador que cai no fake quebra em runtime",
    ).toBe("function");
    expect(vazio.codigoCidade("Campinas", "SP")).toBeNull();
    expect(vazio.codigoMunicipioIbge("Campinas", "SP")).toBeNull();
  });

  it("o de/para OMITIDO cai no no-op e os dois campos saem nulos (nunca quebra o envio)", () => {
    const f = montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, contratacao());
    expect(f.codMunicipioNascto).toBeNull();
    expect(f.codigoCidadeResid).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5. O MÉTODO ESTÁ NA INTERFACE, e não só no objeto que passou no teste.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ POR QUE ESTA VARREDURA DE FONTE EXISTE: este arquivo acessa o método novo por um tipo declarado
 * localmente (`DeParaGiSeparado`), para não deixar a árvore VERMELHA no `tsc` das outras sessões
 * enquanto o `backend` constrói. O preço é que, assim, um `codigoMunicipioIbge` que exista no serviço
 * mas NÃO na interface `DeParaGi` passaria verde, e o próximo implementador de `DeParaGi` descobriria
 * isso em runtime. As duas asserções abaixo pagam esse preço.
 *
 * COMENTÁRIO NÃO CONTA: o nome aparece na prosa deste arquivo e na do montador, então a fonte é lida
 * SEM comentários antes de qualquer `includes`.
 */
function fonteSemComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

const FONTE_DOMINIO = fonteSemComentarios(join(__dirname, "..", "domain", "portal-dados-gi.ts"));

describe("o contrato: `codigoMunicipioIbge` esta na INTERFACE `DeParaGi`, nao so no servico", () => {
  it("a interface `DeParaGi` DECLARA os dois metodos", () => {
    const bloco = /export interface DeParaGi\s*\{([\s\S]*?)\n\}/.exec(FONTE_DOMINIO)?.[1] ?? "";
    expect(bloco, "nao achei a interface `DeParaGi` na fonte").not.toBe("");
    expect(bloco).toContain("codigoCidade");
    expect(bloco, "`codigoMunicipioIbge` nao esta na interface `DeParaGi`").toContain(
      "codigoMunicipioIbge",
    );
  });

  /**
   * A EMISSÃO, não a DECLARAÇÃO. O mesmo nome de campo aparece duas vezes na fonte: como tipo na
   * `FuncionarioSelecao` (`codMunicipioNascto: string | null;`) e como atribuição no montador. Pegar a
   * primeira ocorrência lê o tipo e não mede nada, então a linha boa é a que chama o `depara`.
   */
  function emissaoDe(campo: string): string {
    const linhas = [...FONTE_DOMINIO.matchAll(new RegExp(`${campo}:\\s*([^\\n]*)`, "g"))]
      .map((m) => m[1])
      .filter((l) => l.includes("depara."));
    expect(linhas, `nao achei EXATAMENTE uma emissao de \`${campo}\` chamando o de/para`).toHaveLength(
      1,
    );
    return linhas[0] ?? "";
  }

  it("o campo do NASCIMENTO e emitido pelo metodo do NASCIMENTO (a linha do payload)", () => {
    // Redundante com o teste de comportamento do bloco 2, e DE PROPÓSITO: se alguém trocar o método
    // na linha do `codMunicipioNascto`, os dois vermelhos juntos dizem onde está o erro.
    const linha = emissaoDe("codMunicipioNascto");
    expect(linha).toContain("codigoMunicipioIbge");
    expect(linha, "o NASCIMENTO esta sendo emitido pelo resolvedor da RESIDENCIA").not.toMatch(
      /depara\.codigoCidade\(/,
    );
  });

  it("o campo da RESIDENCIA continua sendo emitido por `codigoCidade`", () => {
    const linha = emissaoDe("codigoCidadeResid");
    expect(linha).toContain("depara.codigoCidade(");
    expect(linha).not.toContain("codigoMunicipioIbge");
  });
});
