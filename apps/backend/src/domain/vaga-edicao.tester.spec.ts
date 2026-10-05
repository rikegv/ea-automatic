import { AS_VAGA_CAMPOS_DA_ADMISSAO, AS_VAGA_CAMPOS_NUNCA_EDITAVEIS } from "@ea/shared-types";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { vagas } from "../db/schema";
import { excessoDePosicoes } from "./vaga";
import {
  VAGA_EDICAO_CAMPOS_COM_VALOR,
  camposDaAdmissaoAlterados,
  decidirPosicoesDaEdicao,
  trilhaDoCampo,
} from "./vaga-edicao";

/**
 * TESTER INDEPENDENTE (§A.38, §A.40 regra 2): escrito a partir do REQUISITO, sem ler o código da
 * construção. Fontes: `docs/MAPA-CRUD-VAGA-LIBERADA.md` (com a EMENDA pós-veto, E-1 e E-4) e o
 * contrato "EDITAR E EXCLUIR VAGA JÁ LIBERADA" de `packages/shared-types/src/index.ts`.
 *
 * Três regras puras da edição da vaga liberada:
 *  1. a trilha (§A.6): só campo de TIPO FECHADO grava valor; texto livre e campo desconhecido
 *     gravam só "alterado" (fail-closed);
 *  2. a fronteira da admissão (decisão 3): o que foi copiado para a admissão é do ADM, e a conferência
 *     é sobre o RESULTADO, não sobre o corpo;
 *  3. as posições (decisões 5 e 6): abaixo do entregue é recusa sempre; abaixo do alocado pede
 *     confirmação. A recusa tem de coincidir com `excessoDePosicoes`, a régua já validada.
 */

/** CPF de dígito válido (sintético, exemplo de documentação). Nunca pode sair da trilha. */
const CPF = "52998224725";
const CPF_FORMATADO = "529.982.247-25";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A TRILHA (§A.6, E-1 da emenda)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Texto livre nominalmente listado pelo veto do `seguranca` e pelo briefing do coordenador. */
const TEXTO_LIVRE = [
  "substituidoNome",
  "substituidoCpf",
  "solicitanteNome",
  "solicitanteTelefone",
  "solicitanteEmail",
  "justificativaMotivo",
  "observacoes",
  "atribuicoes",
  "perfilComportamental",
  "ambiente",
  "experiencia",
  "cursosConhecimentos",
  "localTrabalho",
  "horarioEscala",
  "nomeDivulgacao",
] as const;

/** E-1: "e os campos 'outros'". São varchar livres na tabela `vagas`. */
const CAMPOS_OUTROS = ["regioesOutras", "idiomasOutros", "testesOutro", "etapasPsOutra"] as const;

/**
 * Nomes que NÃO são campo da edição. Incluem as armadilhas de quem implementa a lista com um objeto
 * literal e `in` (herdados do protótipo) e as variações de grafia do campo mais sensível.
 */
const DESCONHECIDOS = [
  "campoQueNaoExiste",
  "",
  "SubstituidoCpf",
  "SUBSTITUIDOCPF",
  "substituido_cpf",
  "substituidoCpf ",
  " substituidoCpf",
  "cpf",
  "toString",
  "constructor",
  "__proto__",
  "hasOwnProperty",
  "valueOf",
] as const;

/** Campos de TIPO FECHADO que o requisito manda gravar com valor (referência, data, número, salário). */
const FECHADOS_ESPERADOS = [
  "cargoId",
  "codCliente",
  "cidadeId",
  "linhaServicoId",
  "segmentoId",
  "comercialId",
  "consultorId",
  "recruiterId",
  "dataLimite",
  "posicoesOficiais",
  "posicoesBanco",
  "salarioAbertura",
] as const;

const lista = (): readonly string[] => VAGA_EDICAO_CAMPOS_COM_VALOR as readonly string[];

describe("vaga-edicao: a lista dos campos que gravam valor na trilha (§A.6)", () => {
  it("nenhum campo de texto livre está na lista dos que gravam valor", () => {
    for (const campo of [...TEXTO_LIVRE, ...CAMPOS_OUTROS]) {
      expect(lista(), `${campo} é texto livre e não pode gravar valor`).not.toContain(campo);
    }
  });

  it("nenhum nome desconhecido está na lista (a lista é fechada, não um espelho da tabela)", () => {
    for (const campo of DESCONHECIDOS) {
      expect(lista(), JSON.stringify(campo)).not.toContain(campo);
    }
  });

  it("os campos de tipo fechado do requisito ESTÃO na lista (sem eles a trilha perde o de/para)", () => {
    for (const campo of FECHADOS_ESPERADOS) {
      expect(lista(), `${campo} é referência/data/número e deve gravar valor`).toContain(campo);
    }
  });

  /**
   * Toda entrada da lista tem de ser uma coluna REAL da vaga. Um nome com grafia errada não vaza
   * nada (cai em "alterado"), mas apaga em silêncio o de/para que a trilha prometeu.
   */
  it("toda entrada da lista é uma coluna real de `vagas`", () => {
    const colunas = new Set(Object.keys(getTableColumns(vagas)));
    for (const campo of lista()) {
      expect(colunas.has(campo), `${campo} não é coluna de vagas`).toBe(true);
    }
  });

  /**
   * O que a edição nunca escreve não tem por que gravar valor na trilha. Em particular a identidade
   * do Pandapé e os campos derivados (E-2).
   */
  it("a identidade e os derivados não aparecem como campo de trilha com valor", () => {
    for (const campo of ["codigo", "idVacancyPandape", "contraparteId", "envioShortlist"]) {
      expect(lista(), campo).not.toContain(campo);
    }
  });
});

describe("vaga-edicao: trilhaDoCampo", () => {
  it("campo de tipo fechado grava de e para", () => {
    const r = trilhaDoCampo("cargoId", "cargo-antigo", "cargo-novo");
    expect(r).toEqual({ campo: "cargoId", de: "cargo-antigo", para: "cargo-novo", valorOmitido: false });
  });

  it("número grava o valor como texto", () => {
    const r = trilhaDoCampo("posicoesOficiais", 10, 4);
    expect(r.valorOmitido).toBe(false);
    expect(r.de).toBe("10");
    expect(r.para).toBe("4");
  });

  it("data grava o valor (o prazo anterior só fica na trilha, E-7)", () => {
    const r = trilhaDoCampo("dataLimite", "2026-10-01", "2026-11-15");
    expect(r.valorOmitido).toBe(false);
    expect(r.de).toContain("2026-10-01");
    expect(r.para).toContain("2026-11-15");
  });

  it("campo fechado esvaziado grava nulo, não a string 'null' nem 'undefined'", () => {
    const a = trilhaDoCampo("recruiterId", "rec-1", null);
    expect(a.para).toBeNull();
    const b = trilhaDoCampo("recruiterId", undefined, "rec-2");
    expect(b.de).toBeNull();
    expect(b.para).toBe("rec-2");
  });

  it("de e para são sempre string ou nulo (o contrato da coluna)", () => {
    for (const [de, para] of [
      [1500, "1600.50"],
      [true, false],
      [0, 3],
    ] as const) {
      for (const campo of lista()) {
        const r = trilhaDoCampo(campo, de, para);
        for (const v of [r.de, r.para]) {
          expect(v === null || typeof v === "string", `${campo}: ${typeof v}`).toBe(true);
        }
      }
    }
  });

  it("texto livre grava só 'alterado': valorOmitido, de e para nulos", () => {
    for (const campo of [...TEXTO_LIVRE, ...CAMPOS_OUTROS]) {
      const r = trilhaDoCampo(campo, "valor antigo de teste", "valor novo de teste");
      expect(r.valorOmitido, campo).toBe(true);
      expect(r.de, campo).toBeNull();
      expect(r.para, campo).toBeNull();
    }
  });

  it("campo desconhecido é fail-closed: omite o valor", () => {
    for (const campo of DESCONHECIDOS) {
      const r = trilhaDoCampo(campo, "valor antigo de teste", "valor novo de teste");
      expect(r.valorOmitido, JSON.stringify(campo)).toBe(true);
      expect(r.de, JSON.stringify(campo)).toBeNull();
      expect(r.para, JSON.stringify(campo)).toBeNull();
    }
  });

  /**
   * O VETO DO `seguranca` EM UMA LINHA: um CPF não sai da trilha, em nenhuma forma (cru, formatado,
   * como número), passado como `de` ou como `para`, em nenhum campo de texto livre ou desconhecido.
   * Confere o objeto inteiro serializado, não só `de`/`para`: um campo extra de "resumo" vazaria igual.
   */
  it("CPF válido passado como de ou para nunca sai no retorno", () => {
    const formas: unknown[] = [CPF, CPF_FORMATADO, Number(CPF), `CPF ${CPF_FORMATADO} do substituído`];
    for (const campo of [...TEXTO_LIVRE, ...CAMPOS_OUTROS, ...DESCONHECIDOS]) {
      for (const forma of formas) {
        for (const [de, para] of [
          [forma, null],
          [null, forma],
          [forma, forma],
          ["outro", forma],
        ]) {
          const saida = JSON.stringify(trilhaDoCampo(campo, de, para));
          expect(saida, `${JSON.stringify(campo)}`).not.toContain(CPF);
          expect(saida, `${JSON.stringify(campo)}`).not.toContain(CPF_FORMATADO);
          expect(saida, `${JSON.stringify(campo)}`).not.toContain("529982247");
        }
      }
    }
  });

  it("telefone e e-mail do solicitante não saem no retorno", () => {
    const tel = trilhaDoCampo("solicitanteTelefone", "(11) 98888-7777", "(11) 97777-6666");
    expect(JSON.stringify(tel)).not.toMatch(/9888|7777|6666/);
    const mail = trilhaDoCampo("solicitanteEmail", "fulano@homolog.local", "beltrano@homolog.local");
    expect(JSON.stringify(mail)).not.toMatch(/fulano|beltrano|@homolog/);
  });

  it("a trilha não muta a lista pública (ninguém acrescenta campo em tempo de execução)", () => {
    const antes = [...lista()];
    trilhaDoCampo("substituidoCpf", CPF, null);
    trilhaDoCampo("campoQueNaoExiste", "a", "b");
    expect([...lista()]).toEqual(antes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2. A FRONTEIRA DA ADMISSÃO (decisão 3)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

type Vaga = Record<string, unknown>;

function vagaBase(): Vaga {
  return {
    codCliente: "C001",
    cargoId: "cargo-1",
    salarioAbertura: "1500.00",
    horarioEscala: "6x1 das 8h às 16h",
    tempoContrato: 90,
    motivo: "SUBSTITUICAO",
    substituidoNome: "Pessoa Sintetica",
    substituidoCpf: CPF,
    localTrabalho: "Loja centro",
    observacoes: "qualquer coisa",
    posicoesOficiais: 5,
    dataLimite: "2026-11-30",
  };
}

const conjunto = (xs: readonly string[]): Set<string> => new Set(xs);

describe("vaga-edicao: camposDaAdmissaoAlterados", () => {
  it("resultado igual ao atual não acusa nada", () => {
    expect(camposDaAdmissaoAlterados(vagaBase(), vagaBase())).toEqual([]);
  });

  it("detecta cada um dos campos da admissão, um por vez", () => {
    for (const campo of AS_VAGA_CAMPOS_DA_ADMISSAO) {
      const resultado = { ...vagaBase(), [campo]: campo === "tempoContrato" ? 180 : "valor-diferente" };
      expect(camposDaAdmissaoAlterados(vagaBase(), resultado), campo).toEqual([campo]);
    }
  });

  it("vários campos mudados voltam todos, e só eles", () => {
    const resultado = { ...vagaBase(), cargoId: "cargo-2", codCliente: "C002", observacoes: "outra" };
    expect(conjunto(camposDaAdmissaoAlterados(vagaBase(), resultado))).toEqual(
      conjunto(["cargoId", "codCliente"]),
    );
  });

  it("salário: '1500.00' é igual a '1500' (e '1500.0'), em qualquer direção", () => {
    for (const [a, b] of [
      ["1500.00", "1500"],
      ["1500", "1500.00"],
      ["1500.0", "1500.00"],
      ["1500.5", "1500.50"],
    ]) {
      expect(
        camposDaAdmissaoAlterados({ ...vagaBase(), salarioAbertura: a }, { ...vagaBase(), salarioAbertura: b }),
        `${a} x ${b}`,
      ).toEqual([]);
    }
  });

  it("salário de verdade diferente é detectado (a normalização não engole centavos)", () => {
    expect(
      camposDaAdmissaoAlterados(
        { ...vagaBase(), salarioAbertura: "1500.00" },
        { ...vagaBase(), salarioAbertura: "1500.01" },
      ),
    ).toEqual(["salarioAbertura"]);
    expect(
      camposDaAdmissaoAlterados(
        { ...vagaBase(), salarioAbertura: "1500" },
        { ...vagaBase(), salarioAbertura: "15000" },
      ),
    ).toEqual(["salarioAbertura"]);
  });

  it("null, undefined e '' são o mesmo vazio, para todo campo da admissão", () => {
    const vazios: unknown[] = [null, undefined, ""];
    for (const campo of AS_VAGA_CAMPOS_DA_ADMISSAO) {
      for (const a of vazios) {
        for (const b of vazios) {
          const atual = { ...vagaBase(), [campo]: a };
          const resultado = { ...vagaBase(), [campo]: b };
          expect(camposDaAdmissaoAlterados(atual, resultado), `${campo}: ${String(a)} x ${String(b)}`).toEqual(
            [],
          );
        }
      }
    }
  });

  it("chave ausente equivale a vazio", () => {
    const atual = vagaBase();
    delete atual.substituidoNome;
    const resultado = { ...vagaBase(), substituidoNome: null };
    expect(camposDaAdmissaoAlterados(atual, resultado)).toEqual([]);
  });

  it("preencher campo vazio e esvaziar campo cheio são mudanças", () => {
    expect(
      camposDaAdmissaoAlterados({ ...vagaBase(), localTrabalho: null }, { ...vagaBase(), localTrabalho: "X" }),
    ).toEqual(["localTrabalho"]);
    expect(
      camposDaAdmissaoAlterados({ ...vagaBase(), cargoId: "cargo-1" }, { ...vagaBase(), cargoId: "" }),
    ).toEqual(["cargoId"]);
  });

  it("campo fora da lista nunca é retornado, por mais que mude", () => {
    const resultado = {
      ...vagaBase(),
      observacoes: "mudou",
      posicoesOficiais: 1,
      dataLimite: "2027-01-01",
      recruiterId: "rec-9",
      justificativaMotivo: "mudou",
    };
    expect(camposDaAdmissaoAlterados(vagaBase(), resultado)).toEqual([]);
  });

  /**
   * O ACOPLAMENTO (E-3): trocar o vínculo/motivo faz o RESULTADO zerar o CPF do substituído sem que o
   * corpo o mencione. A conferência é atual x resultado, então a mudança aparece.
   */
  it("acoplamento: resultado com o substituído zerado é detectado", () => {
    const resultado = { ...vagaBase(), substituidoCpf: null, substituidoNome: null };
    expect(conjunto(camposDaAdmissaoAlterados(vagaBase(), resultado))).toEqual(
      conjunto(["substituidoCpf", "substituidoNome"]),
    );
  });

  it("o retorno só tem nomes de campo, nunca o valor (o CPF não sai)", () => {
    const resultado = { ...vagaBase(), substituidoCpf: "11144477735" };
    const saida = camposDaAdmissaoAlterados(vagaBase(), resultado);
    expect(saida).toEqual(["substituidoCpf"]);
    expect(JSON.stringify(saida)).not.toContain(CPF);
    expect(JSON.stringify(saida)).not.toContain("11144477735");
  });

  it("todo item retornado pertence a AS_VAGA_CAMPOS_DA_ADMISSAO, sem repetição", () => {
    const permitidos = conjunto(AS_VAGA_CAMPOS_DA_ADMISSAO);
    const todasAsChaves = [...AS_VAGA_CAMPOS_DA_ADMISSAO, "observacoes", "posicoesOficiais", "status", "codigo"];
    const resultado: Vaga = {};
    for (const k of todasAsChaves) resultado[k] = `novo-${k}`;
    const saida = camposDaAdmissaoAlterados(vagaBase(), resultado);
    for (const c of saida) expect(permitidos.has(c), c).toBe(true);
    expect(new Set(saida).size).toBe(saida.length);
    expect(conjunto(saida)).toEqual(permitidos);
  });

  it("não muta as entradas", () => {
    const atual = vagaBase();
    const resultado = { ...vagaBase(), cargoId: "x" };
    const a = JSON.stringify(atual);
    const r = JSON.stringify(resultado);
    camposDaAdmissaoAlterados(atual, resultado);
    expect(JSON.stringify(atual)).toBe(a);
    expect(JSON.stringify(resultado)).toBe(r);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 3. AS POSIÇÕES (decisões 5 e 6, E-4)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface EntradaPosicoes {
  oficialAtual: number;
  bancoAtual: number;
  oficialNovo: number;
  bancoNovo: number;
  alocados: number;
  entregues: number;
  confirmarAbaixoDoAlocado: boolean;
}

function decidir(p: Partial<EntradaPosicoes>) {
  return decidirPosicoesDaEdicao({
    oficialAtual: 10,
    bancoAtual: 0,
    oficialNovo: 10,
    bancoNovo: 0,
    alocados: 0,
    entregues: 0,
    confirmarAbaixoDoAlocado: false,
    ...p,
  });
}

describe("vaga-edicao: decidirPosicoesDaEdicao", () => {
  it("aumento passa sem confirmação, com reduziu=false", () => {
    expect(decidir({ oficialNovo: 12, alocados: 5, entregues: 2 })).toEqual({ tipo: "OK", reduziu: false });
  });

  it("os mesmos números passam com reduziu=false (salvar de novo não é evento)", () => {
    expect(decidir({ alocados: 5, entregues: 2 })).toEqual({ tipo: "OK", reduziu: false });
  });

  it("aumento no banco passa sem confirmação", () => {
    expect(decidir({ bancoAtual: 2, bancoNovo: 5, alocados: 3, entregues: 1 })).toEqual({
      tipo: "OK",
      reduziu: false,
    });
  });

  it("reduzir mantendo acima do alocado passa sem confirmação, com reduziu=true", () => {
    expect(decidir({ oficialNovo: 8, alocados: 5, entregues: 2 })).toEqual({ tipo: "OK", reduziu: true });
  });

  it("reduzir para exatamente o alocado não é 'abaixo do alocado'", () => {
    expect(decidir({ oficialNovo: 5, alocados: 5, entregues: 2 })).toEqual({ tipo: "OK", reduziu: true });
  });

  it("reduzir só o banco é redução (vai para vaga_meta_reducoes)", () => {
    expect(decidir({ bancoAtual: 5, bancoNovo: 3 })).toEqual({ tipo: "OK", reduziu: true });
  });

  it("abaixo do alocado e acima do entregue pede confirmação", () => {
    expect(decidir({ oficialNovo: 4, alocados: 5, entregues: 2 })).toEqual({
      tipo: "CONFIRMAR_ABAIXO_DO_ALOCADO",
    });
  });

  it("abaixo do alocado e IGUAL ao entregue pede confirmação (não é recusa)", () => {
    expect(decidir({ oficialNovo: 2, alocados: 5, entregues: 2 })).toEqual({
      tipo: "CONFIRMAR_ABAIXO_DO_ALOCADO",
    });
  });

  it("com a confirmação, abaixo do alocado passa como redução", () => {
    expect(decidir({ oficialNovo: 4, alocados: 5, entregues: 2, confirmarAbaixoDoAlocado: true })).toEqual({
      tipo: "OK",
      reduziu: true,
    });
  });

  it("abaixo do entregue é recusa, sem confirmação", () => {
    expect(decidir({ oficialNovo: 1, alocados: 5, entregues: 2 })).toEqual({ tipo: "ABAIXO_DO_ENTREGUE" });
  });

  it("abaixo do entregue é recusa MESMO com a confirmação (decisão 6)", () => {
    expect(decidir({ oficialNovo: 1, alocados: 5, entregues: 2, confirmarAbaixoDoAlocado: true })).toEqual({
      tipo: "ABAIXO_DO_ENTREGUE",
    });
  });

  it("abaixo do entregue ganha de abaixo do alocado (a recusa vem antes do pedido de confirmação)", () => {
    expect(decidir({ oficialNovo: 0, alocados: 3, entregues: 3 })).toEqual({ tipo: "ABAIXO_DO_ENTREGUE" });
  });

  it("confirmação mandada sem a situação existir não muda nada", () => {
    expect(decidir({ oficialNovo: 12, alocados: 5, entregues: 2, confirmarAbaixoDoAlocado: true })).toEqual({
      tipo: "OK",
      reduziu: false,
    });
    expect(decidir({ oficialNovo: 8, alocados: 5, entregues: 2, confirmarAbaixoDoAlocado: true })).toEqual({
      tipo: "OK",
      reduziu: true,
    });
  });

  it("vaga vazia (sem alocado nem entregue) reduz até zero sem confirmação", () => {
    expect(decidir({ oficialNovo: 0 })).toEqual({ tipo: "OK", reduziu: true });
  });

  /**
   * ORÁCULO DE INDEPENDÊNCIA, LADO OFICIAL (banco zerado, onde o contrato não tem ambiguidade):
   * a recusa ABAIXO_DO_ENTREGUE coincide com `excessoDePosicoes` (régua validada) para os mesmos
   * números, com e sem confirmação, em toda a grade.
   */
  it("oráculo: ABAIXO_DO_ENTREGUE coincide com excessoDePosicoes (banco zerado)", () => {
    const divergencias: string[] = [];
    for (let oficialAtual = 0; oficialAtual <= 6; oficialAtual++)
      for (let oficialNovo = 0; oficialNovo <= 6; oficialNovo++)
        for (let entregues = 0; entregues <= 6; entregues++)
          for (let alocados = entregues; alocados <= 6; alocados++)
            for (const confirmar of [false, true]) {
              const r = decidir({
                oficialAtual,
                oficialNovo,
                bancoAtual: 0,
                bancoNovo: 0,
                alocados,
                entregues,
                confirmarAbaixoDoAlocado: confirmar,
              });
              const oraculo =
                excessoDePosicoes(
                  { vagasFechadas: entregues, vagasFechadasBanco: 0 },
                  { posicoesOficiais: oficialNovo, posicoesBanco: 0 },
                ) !== null;
              if ((r.tipo === "ABAIXO_DO_ENTREGUE") !== oraculo) {
                divergencias.push(
                  `of ${oficialAtual}->${oficialNovo} aloc ${alocados} entr ${entregues} conf ${confirmar}: ${r.tipo} x oráculo ${oraculo}`,
                );
              }
            }
    expect(divergencias).toEqual([]);
  });

  /**
   * ORÁCULO NOS DOIS LADOS, e é a PERGUNTA DE REQUISITO que este teste existe para fazer.
   *
   * `excessoDePosicoes` mede POR LADO: a entrega oficial contra a meta oficial, a do banco contra a
   * do banco (`domain/candidatura.ts`, "o total sozinho mentia"). O contrato passa `entregues` como UM
   * número. Com toda a entrega no lado oficial, baixar o oficial abaixo dela é recusa na régua
   * validada, POR MAIS banco que sobre. Uma implementação que compare `entregues` contra
   * `oficialNovo + bancoNovo` deixa passar a redução que o `editarPosicoes` recusa, e a mesma vaga
   * passaria a ter duas réguas de "cabe na meta" (uma por rota).
   */
  it("oráculo: banco com sobra NÃO compensa entrega oficial acima da meta oficial nova", () => {
    const divergencias: string[] = [];
    for (let oficialNovo = 0; oficialNovo <= 5; oficialNovo++)
      for (let bancoNovo = 0; bancoNovo <= 5; bancoNovo++)
        for (let entregues = 0; entregues <= 5; entregues++) {
          const r = decidir({
            oficialAtual: 5,
            bancoAtual: 5,
            oficialNovo,
            bancoNovo,
            alocados: entregues,
            entregues,
            confirmarAbaixoDoAlocado: true,
          });
          const oraculo =
            excessoDePosicoes(
              { vagasFechadas: entregues, vagasFechadasBanco: 0 },
              { posicoesOficiais: oficialNovo, posicoesBanco: bancoNovo },
            ) !== null;
          if ((r.tipo === "ABAIXO_DO_ENTREGUE") !== oraculo) {
            divergencias.push(`of ${oficialNovo} banco ${bancoNovo} entr ${entregues}: ${r.tipo} x oráculo ${oraculo}`);
          }
        }
    expect(divergencias).toEqual([]);
  });

  it("propriedade: o tipo é sempre um dos três, e OK sempre traz reduziu booleano", () => {
    for (let oficialNovo = 0; oficialNovo <= 4; oficialNovo++)
      for (let bancoNovo = 0; bancoNovo <= 3; bancoNovo++)
        for (let entregues = 0; entregues <= 3; entregues++)
          for (let alocados = entregues; alocados <= 4; alocados++) {
            const r = decidir({ oficialAtual: 3, bancoAtual: 2, oficialNovo, bancoNovo, alocados, entregues });
            expect(["OK", "ABAIXO_DO_ENTREGUE", "CONFIRMAR_ABAIXO_DO_ALOCADO"]).toContain(r.tipo);
            if (r.tipo === "OK") {
              expect(typeof r.reduziu).toBe("boolean");
              expect(r.reduziu).toBe(oficialNovo < 3 || bancoNovo < 2);
            }
          }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 3b. RODADA 2: A RÉGUA POR LADO (contrato corrigido: `entreguesPorLado` e `alocadosPorLado`)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * O SERVIÇO SEMPRE MANDA OS DOIS LADOS. A recusa por entrega tem de coincidir com
 * `excessoDePosicoes` com os DOIS lados da entrega preenchidos, que é a régua de `editarPosicoes`.
 */
describe("vaga-edicao: decidirPosicoesDaEdicao com os dois lados (rodada 2)", () => {
  const porLado = (p: {
    oficialAtual?: number;
    bancoAtual?: number;
    oficialNovo: number;
    bancoNovo: number;
    entOf: number;
    entBa: number;
    alocOf: number;
    alocBa: number;
    confirmar?: boolean;
  }) =>
    decidirPosicoesDaEdicao({
      oficialAtual: p.oficialAtual ?? 5,
      bancoAtual: p.bancoAtual ?? 5,
      oficialNovo: p.oficialNovo,
      bancoNovo: p.bancoNovo,
      alocados: p.alocOf + p.alocBa,
      entregues: p.entOf + p.entBa,
      confirmarAbaixoDoAlocado: p.confirmar ?? false,
      entreguesPorLado: { oficial: p.entOf, banco: p.entBa },
      alocadosPorLado: { oficial: p.alocOf, banco: p.alocBa },
    });

  it("3 entregues no banco, banco reduzido para 1: recusa, mesmo confirmado", () => {
    expect(
      porLado({ bancoAtual: 3, oficialNovo: 5, bancoNovo: 1, entOf: 0, entBa: 3, alocOf: 0, alocBa: 3, confirmar: true }),
    ).toEqual({ tipo: "ABAIXO_DO_ENTREGUE" });
  });

  it("entregues no banco não seguram a meta OFICIAL", () => {
    expect(porLado({ oficialNovo: 1, bancoNovo: 5, entOf: 0, entBa: 3, alocOf: 0, alocBa: 3 })).toEqual({
      tipo: "OK",
      reduziu: true,
    });
  });

  it("oráculo por lado: ABAIXO_DO_ENTREGUE coincide com excessoDePosicoes nos dois lados", () => {
    const divergencias: string[] = [];
    for (let oficialNovo = 0; oficialNovo <= 4; oficialNovo++)
      for (let bancoNovo = 0; bancoNovo <= 4; bancoNovo++)
        for (let entOf = 0; entOf <= 4; entOf++)
          for (let entBa = 0; entBa <= 4; entBa++)
            for (const confirmar of [false, true]) {
              const r = porLado({ oficialNovo, bancoNovo, entOf, entBa, alocOf: entOf, alocBa: entBa, confirmar });
              const oraculo =
                excessoDePosicoes(
                  { vagasFechadas: entOf, vagasFechadasBanco: entBa },
                  { posicoesOficiais: oficialNovo, posicoesBanco: bancoNovo },
                ) !== null;
              if ((r.tipo === "ABAIXO_DO_ENTREGUE") !== oraculo) {
                divergencias.push(`of ${oficialNovo} ba ${bancoNovo} entOf ${entOf} entBa ${entBa}: ${r.tipo}`);
              }
            }
    expect(divergencias).toEqual([]);
  });

  it("oráculo de confirmação por lado: pede só quando o lado que CAIU fica abaixo dos alocados DELE", () => {
    const divergencias: string[] = [];
    for (let oficialNovo = 0; oficialNovo <= 5; oficialNovo++)
      for (let bancoNovo = 0; bancoNovo <= 5; bancoNovo++)
        for (let alocOf = 0; alocOf <= 4; alocOf++)
          for (let alocBa = 0; alocBa <= 4; alocBa++) {
            const r = porLado({ oficialNovo, bancoNovo, entOf: 0, entBa: 0, alocOf, alocBa });
            const caiuOf = oficialNovo < 5;
            const caiuBa = bancoNovo < 5;
            const esperado =
              (caiuOf && oficialNovo < alocOf) || (caiuBa && bancoNovo < alocBa)
                ? "CONFIRMAR_ABAIXO_DO_ALOCADO"
                : "OK";
            if (r.tipo !== esperado) {
              divergencias.push(`of ${oficialNovo} ba ${bancoNovo} alocOf ${alocOf} alocBa ${alocBa}: ${r.tipo} x ${esperado}`);
            }
            if (r.tipo === "OK") expect(r.reduziu).toBe(caiuOf || caiuBa);
          }
    expect(divergencias).toEqual([]);
  });

  it("alocados no banco não pedem confirmação para baixar o oficial (e vice-versa)", () => {
    expect(porLado({ oficialNovo: 1, bancoNovo: 5, entOf: 0, entBa: 0, alocOf: 0, alocBa: 4 }).tipo).toBe("OK");
    expect(porLado({ oficialNovo: 5, bancoNovo: 0, entOf: 0, entBa: 0, alocOf: 4, alocBa: 0 }).tipo).toBe("OK");
  });
});

describe("vaga-edicao: regiaoEstado saiu dos nunca editáveis (rodada 2)", () => {
  it("os nunca editáveis são exatamente a identidade, o status, a contraparte e o envio da shortlist", () => {
    expect([...AS_VAGA_CAMPOS_NUNCA_EDITAVEIS].sort()).toEqual(
      ["codigo", "contraparteId", "envioShortlist", "idVacancyPandape", "status"].sort(),
    );
  });

  it("regiaoEstado (UF, tipo fechado) grava de/para na trilha", () => {
    expect(trilhaDoCampo("regiaoEstado", "SP", "RJ")).toEqual({
      campo: "regiaoEstado",
      de: "SP",
      para: "RJ",
      valorOmitido: false,
    });
  });
});
