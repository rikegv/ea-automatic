import { describe, expect, it } from "vitest";
import type { PassoDaTrilhaPortal } from "@ea/shared-types";
import {
  CATALOGO_DE_FILTROS_VAZIO,
  DICA_DOCUMENTO_TEXTO_MAX,
  ROTULO_DA_SITUACAO,
  SITUACOES_DA_DICA,
  contarFiltrosDasDicas,
  dicaDoPasso,
  queryDasDicas,
  situacaoDaLinha,
  validarTextoDaDica,
  type LinhaDeDicaDeDocumento,
} from "./dicas-documento";

/**
 * O PASSO COM UMA FORMA QUE O CONTRATO NÃO PREVÊ, fabricado de propósito.
 *
 * O campo `dica` agora é OFICIAL (`PassoDaTrilhaPortal.dica`), então o parâmetro é tipado e o cast
 * saiu da biblioteca. Ele reaparece AQUI, e só aqui, porque é aqui que se fabrica a entrada hostil:
 * o que chega do servidor atravessa `JSON.parse`, e o compilador não fiscaliza o outro lado do fio.
 * A guarda de runtime é a régua do produto ("sem dica, sem ícone"), e é ela que estes testes travam.
 */
const passoCru = (v: unknown) => v as Pick<PassoDaTrilhaPortal, "dica">;

/**
 * A REGRA DURA DO ÍCONE DE DICAS: sem dica, sem ícone.
 *
 * O que estes testes protegem não é o parser, é a PROMESSA da tela do candidato. Um ícone que abre
 * um painel vazio é pior do que ícone nenhum, e o caminho até ele é curto: basta alguém trocar a
 * checagem por `passo.dica !== undefined` e uma dica salva como espaços em branco passa a acender
 * o ícone. A tela é pública e é o celular do candidato: ela não pode prometer ajuda e abrir o
 * silêncio.
 *
 * O terceiro teste é o do PASSO SEM O CAMPO: se um dia ele voltar a faltar no fio (uma versão
 * antiga do servidor, uma rota nova que esqueceu o `leftJoin`), a leitura devolve `null` e a trilha
 * fica exatamente como está hoje. Não há estado intermediário quebrado.
 */
describe("dicaDoPasso", () => {
  it("devolve o texto quando a dica existe", () => {
    expect(dicaDoPasso({ dica: "Frente e verso no mesmo arquivo." })).toBe(
      "Frente e verso no mesmo arquivo.",
    );
  });

  it("apara o texto, e as quebras internas sobrevivem (o portal as preserva)", () => {
    expect(dicaDoPasso({ dica: "  linha um\nlinha dois  " })).toBe("linha um\nlinha dois");
  });

  it("passo SEM o campo não acende o ícone", () => {
    expect(dicaDoPasso(passoCru({ codigoTipoDocumento: "RG", nome: "RG" }))).toBeNull();
  });

  it("texto em branco é a MESMA coisa que dica ausente", () => {
    expect(dicaDoPasso({ dica: "   " })).toBeNull();
    expect(dicaDoPasso({ dica: "" })).toBeNull();
  });

  it("valor que não é texto não vira dica (nulo, número, objeto)", () => {
    expect(dicaDoPasso({ dica: null })).toBeNull();
    expect(dicaDoPasso(passoCru({ dica: 42 }))).toBeNull();
    expect(dicaDoPasso(passoCru({ dica: { texto: "x" } }))).toBeNull();
  });

  it("passo ausente não quebra a trilha", () => {
    expect(dicaDoPasso(undefined)).toBeNull();
    expect(dicaDoPasso(null)).toBeNull();
  });
});

/**
 * A RECUSA DITA ANTES DO ENVIO, e o que ela protege é a CONFIANÇA NO CONTADOR.
 *
 * O servidor mede o teto sobre o texto JÁ NORMALIZADO (`sanitizar`, `dicas-documento.service.ts`) e
 * RECUSA `<` e `>` em vez de limpá-los. Se a tela medisse o texto cru, um texto no limite cheio de
 * espaço passaria no contador e voltaria recusado, e quem escreveu não teria como entender por quê.
 * Estes testes travam a tela na MESMA régua do servidor, que é a única que vale.
 */
describe("validarTextoDaDica", () => {
  it("aceita o texto comum, aparado, e devolve o que vai no corpo", () => {
    expect(validarTextoDaDica("  Frente e verso no mesmo arquivo.  ")).toEqual({
      texto: "Frente e verso no mesmo arquivo.",
      erro: null,
    });
  });

  it("preserva a quebra de parágrafo, que é como a dica lista itens", () => {
    expect(validarTextoDaDica("linha um\n\nlinha dois").texto).toBe("linha um\n\nlinha dois");
  });

  it("colapsa espaço e quebra de linha em excesso, igual ao servidor", () => {
    expect(validarTextoDaDica("a   b\r\nc\n\n\n\nd").texto).toBe("a b\nc\n\nd");
  });

  it("recusa o vazio e o que só tem espaço", () => {
    expect(validarTextoDaDica("").erro).toBe("Escreva a dica antes de salvar.");
    expect(validarTextoDaDica("   \n  ").erro).toBe("Escreva a dica antes de salvar.");
  });

  it("RECUSA marcação, em vez de limpar em silêncio", () => {
    expect(validarTextoDaDica("mande o <b>RG</b>").erro).toContain("sinais < e >");
    expect(validarTextoDaDica("valor > 100").erro).toContain("sinais < e >");
  });

  it("mede o teto sobre o texto NORMALIZADO, e não sobre o cru", () => {
    // Cru passa de 1000 só por causa do espaço repetido; normalizado, cabe.
    const comEspaco = "a".repeat(600) + "  ".repeat(300) + "b".repeat(200);
    expect(comEspaco.length).toBeGreaterThan(DICA_DOCUMENTO_TEXTO_MAX);
    expect(validarTextoDaDica(comEspaco).erro).toBeNull();

    const longoDeVerdade = "a".repeat(DICA_DOCUMENTO_TEXTO_MAX + 1);
    expect(validarTextoDaDica(longoDeVerdade).erro).toContain("Encurte o texto");
  });

  it("nenhuma mensagem usa travessão (§A.11)", () => {
    const mensagens = [
      validarTextoDaDica("").erro,
      validarTextoDaDica("<x>").erro,
      validarTextoDaDica("a".repeat(DICA_DOCUMENTO_TEXTO_MAX + 1)).erro,
    ];
    for (const m of mensagens) expect(m).not.toContain("\u2014");
  });
});

/**
 * OS DOIS FILTROS (§A.30), e o que estes testes travam é a régua, não a marcação.
 *
 * A tela manda o recorte ao servidor, então a QUERY é a fronteira: um nome de parâmetro trocado ou
 * uma lista vazia que viaja fazem a tabela mentir sem nada falhar. É o mesmo formato de vírgula que
 * o `parseMulti` do backend lê no sistema inteiro.
 */
describe("queryDasDicas", () => {
  it("sem filtro, não monta query nenhuma", () => {
    expect(queryDasDicas({})).toBe("");
    expect(queryDasDicas({ situacoes: [], documentos: [] })).toBe("");
  });

  it("serializa a lista múltipla por vírgula (§A.28)", () => {
    const q = new URLSearchParams(
      queryDasDicas({ situacoes: ["SEM_DICA", "DICA_INATIVA"], documentos: ["a", "b"] }),
    );
    expect(q.get("situacoes")).toBe("SEM_DICA,DICA_INATIVA");
    expect(q.get("documentos")).toBe("a,b");
  });

  it("valor em branco não vira filtro por nada", () => {
    expect(queryDasDicas({ documentos: ["  ", ""] })).toBe("");
  });
});

describe("contarFiltrosDasDicas", () => {
  it("cada seletor conta uma vez, por mais valores que tenha dentro", () => {
    expect(contarFiltrosDasDicas({})).toBe(0);
    expect(contarFiltrosDasDicas({ situacoes: ["COM_DICA"] })).toBe(1);
    expect(contarFiltrosDasDicas({ documentos: ["a", "b", "c"] })).toBe(1);
    expect(contarFiltrosDasDicas({ situacoes: ["COM_DICA", "SEM_DICA"], documentos: ["a"] })).toBe(
      2,
    );
  });
});

/**
 * A SITUAÇÃO, e o caso que importa é o TERCEIRO: `SEM_DICA` é a AUSÊNCIA do registro. Sem a
 * primeira pergunta, a linha sem dica (com `ativo` nulo) cairia em "Dica Inativa" e a tela diria
 * que existe uma dica oculta onde nunca houve dica nenhuma.
 */
describe("situacaoDaLinha", () => {
  const linha = (dicaId: string | null, ativo: boolean | null): LinhaDeDicaDeDocumento => ({
    tipoDocumentoId: "t1",
    codigo: "RG",
    nome: "RG",
    dicaId,
    texto: dicaId ? "texto" : null,
    ativo,
    atualizadoEm: null,
  });

  it("sem dica é a ausência do registro, não um estado gravado", () => {
    expect(situacaoDaLinha(linha(null, null))).toBe("SEM_DICA");
  });

  it("dica ocultada continua existindo, e não é Com Dica", () => {
    expect(situacaoDaLinha(linha("d1", false))).toBe("DICA_INATIVA");
  });

  it("dica ativa", () => {
    expect(situacaoDaLinha(linha("d1", true))).toBe("COM_DICA");
  });
});

/** §A.24: pill e opção de filtro são etiqueta, e leem do mesmo lugar. */
describe("ROTULO_DA_SITUACAO", () => {
  it("cobre as três situações do contrato, em Title Case", () => {
    for (const s of SITUACOES_DA_DICA) {
      const rotulo = ROTULO_DA_SITUACAO[s];
      expect(rotulo).toBeTruthy();
      for (const palavra of rotulo.split(" ")) {
        expect(palavra[0]).toBe(palavra[0]?.toUpperCase());
      }
    }
  });

  it("a reserva do catálogo traz as três situações e nenhum documento (§A.37)", () => {
    expect(CATALOGO_DE_FILTROS_VAZIO.situacoes.map((o) => o.valor)).toEqual([...SITUACOES_DA_DICA]);
    expect(CATALOGO_DE_FILTROS_VAZIO.documentos).toEqual([]);
  });
});
