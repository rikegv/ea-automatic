import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { ACEITES_REGISTRAVEIS } from "../../domain/candidatura";
import { menuDaOperacao } from "../../domain/menus";
import * as dtosDoModulo from "./vagas.dto";
import { VagasController } from "./vagas.controller";
import { ACEITE_REABERTURA_SEM_ORIGEM, NOMES_DO_REABRIR } from "./reabrir-vaga.tester-fake";

/**
 * ─ A ROTA DO REABRIR: A AUTORIDADE QUE UM TESTE DE SERVICE NUNCA ALCANÇA ────────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE SEPARADO DO COMPORTAMENTAL ───────────────────────────────────┐
 * │ O `vagas.reabrir.comportamental.spec.ts` chama o SERVICE, e o `RolesGuard` roda ANTES de o   │
 * │ service existir na história: nenhum teste de service alcança um decorador de handler. É o    │
 * │ mesmo argumento que obrigou o `vagas.fechar-sem-roles.spec.ts` a nascer, pela ponta oposta.  │
 * │                                                                                             │
 * │ E AS DUAS PONTAS CONVIVEM NESTA CONTROLLER, o que é a parte fácil de errar: `fechar`,        │
 * │ `cancelar` e `moverStatus` NÃO TÊM `@Roles` de propósito (todo consultor encerra a vaga que  │
 * │ operou; só FORÇAR é de Master, e isso mora no service). O `reabrir` é o CONTRÁRIO: ele é de  │
 * │ Master INTEIRO, por decisão do diretor, e o `@Roles` é obrigatório aqui. Quem uniformizar os  │
 * │ dois, em qualquer direção, quebra um deles.                                                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O `SUPER_ADMIN` NÃO É IMPLÍCITO, E ESSA É A LINHA QUE QUASE TODA SUÍTE DE RBAC ESQUECE ────┐
 * │ O `RolesGuard` confere `required.includes(user.papel)` e LANÇA (`roles.guard.ts:46`) ANTES   │
 * │ da linha que trata o SUPER_ADMIN como acima da segmentação. Logo, `@Roles("MASTER")` sozinho  │
 * │ BARRA O PRÓPRIO DIRETOR, e um teste que afirme só "o COMUM leva 403" fica VERDE com ele.     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Os handlers do reabrir, resolvidos por nome: a construção escolhe, o teste não fica refém. */
const NOMES_DA_PREVIA_NA_ROTA = [
  "reabrirPrevia",
  "previaDeReabertura",
  "previaDoReabrir",
  "candidatosParaReabrir",
];

function handler(nomes: readonly string[], oQueE: string): string {
  const proto = VagasController.prototype as unknown as Record<string, unknown>;
  const achado = nomes.find((n) => typeof proto[n] === "function");
  if (!achado) {
    throw new Error(
      `${oQueE} ainda não existe em VagasController. Procurei por: ${nomes.join(", ")}. Nome diferente se ajusta aqui, em uma linha (o vermelho seria de ACOPLAMENTO, não de defeito).`,
    );
  }
  return achado;
}

const papeis = (nome: string): unknown =>
  Reflect.getMetadata(ROLES_KEY, (VagasController.prototype as unknown as Record<string, object>)[nome]);

describe("as/vagas: o reabrir é de MASTER na ROTA, e não só no service", () => {
  it("a ESCRITA do reabrir exige MASTER ou SUPER_ADMIN", () => {
    const nome = handler(NOMES_DO_REABRIR, "O handler do reabrir");
    expect(papeis(nome), "sem @Roles, o consultor chega ao service pela URL").toBeDefined();
    expect(papeis(nome)).toContain("MASTER");
    expect(papeis(nome), "o RolesGuard NÃO promove o SUPER_ADMIN sozinho").toContain("SUPER_ADMIN");
    expect(papeis(nome), "o COMUM nunca").not.toContain("COMUM");
  });

  /**
   * A LEITURA TAMBÉM, e ela não é redundante com a escrita: a prévia devolve NOME, MOTIVO DA SAÍDA
   * e DATA de cada pessoa que o cancelamento derrubou. Sem `@Roles` aqui, o consultor lê a lista
   * inteira de quem foi descartado e por quê, sem nunca conseguir reabrir nada. Leitura sensível se
   * protege na leitura.
   */
  it("a LEITURA da prévia exige o mesmo par de papéis", () => {
    const nome = handler(NOMES_DA_PREVIA_NA_ROTA, "O handler da prévia do reabrir");
    expect(papeis(nome), "a prévia carrega motivo e data da saída de cada pessoa").toBeDefined();
    expect(papeis(nome)).toContain("MASTER");
    expect(papeis(nome)).toContain("SUPER_ADMIN");
    expect(papeis(nome)).not.toContain("COMUM");
  });

  /**
   * A CONTRAPARTIDA: `@Roles` no HANDLER, nunca na CLASSE. Um decorador de classe barraria o COMUM
   * em TODAS as rotas do A&S, inclusive o `fechar` e o `cancelar`, que são dele por decisão do
   * diretor. É a regressão que o `vagas.fechar-sem-roles.spec.ts` protege pela outra ponta.
   */
  it("nada foi promovido para a CLASSE: fechar e cancelar continuam do consultor", () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagasController)).toBeUndefined();
    for (const aberta of ["fechar", "cancelar", "moverStatus"]) {
      expect(papeis(aberta), `VagasController.${aberta} ganhou @Roles`).toBeUndefined();
    }
  });

  it("as duas rotas continuam reivindicadas pelo menu `as-vagas`", () => {
    for (const nome of [
      handler(NOMES_DO_REABRIR, "O handler do reabrir"),
      handler(NOMES_DA_PREVIA_NA_ROTA, "O handler da prévia do reabrir"),
    ]) {
      expect(menuDaOperacao("VagasController", nome), `VagasController.${nome}`).toBe("as-vagas");
    }
  });
});

/**
 * ─ O ACEITE DO CAMINHO SEM ORIGEM PRECISA ESTAR NA LISTA DO DOMÍNIO ────────────────────────────
 *
 * O CHECK DO BANCO (`ck_as_candidatura_etapas_aceite`) é montado a partir de `ACEITES_REGISTRAVEIS`.
 * Gravar o literal sem pôr o nome na lista faz o Postgres RECUSAR a linha, com a transação já
 * aberta e a vaga a meio caminho de reabrir. O defeito não aparece em teste de unidade nenhum (o
 * fake não tem CHECK) e aparece na primeira reabertura real de um cancelamento antigo, que é
 * justamente o ÚNICO tipo de cancelamento que existe na base hoje.
 */
describe("o aceite da reabertura sem origem é um nome do domínio, não um literal solto", () => {
  it("`REABERTURA_SEM_ORIGEM` está em ACEITES_REGISTRAVEIS", () => {
    expect(
      ACEITES_REGISTRAVEIS as readonly string[],
      "sem isto, o CHECK do banco recusa a linha do aceite na primeira reabertura antiga",
    ).toContain(ACEITE_REABERTURA_SEM_ORIGEM);
  });

  /**
   * E A OUTRA METADE, que é a que falha em PRODUÇÃO e em teste nenhum: `ACEITES_SQL` deriva do
   * domínio, então o schema do drizzle fica coerente sozinho, mas o CHECK que existe NO BANCO foi
   * escrito por uma migration. Acrescentar o nome na lista SEM reconstruir o CHECK faz o Postgres
   * recusar a linha com a transação aberta e a vaga a meio caminho de reabrir. O fake não tem CHECK,
   * então nenhum teste de unidade pega isso: o alarme é este arquivo ler a migration.
   */
  it("alguma migration reconstrói o CHECK do aceite com o valor novo", () => {
    const pasta = join(__dirname, "../../../drizzle");
    const sql = readdirSync(pasta)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(pasta, f), "utf8"))
      .join("\n");
    const executavel = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(executavel, "o CHECK do banco não conhece o valor novo").toContain(
      ACEITE_REABERTURA_SEM_ORIGEM,
    );
    expect(executavel).toContain("ck_as_candidatura_etapas_aceite");
  });
});

/**
 * ─ O CORPO DO REABRIR ──────────────────────────────────────────────────────────────────────────
 *
 * A LISTA NÃO É A AUTORIDADE (o service reconfere o conjunto sob o lock), mas o DTO é a primeira
 * porta, e é ele que impede o caso bobo de chegar: id repetido, que passaria duas vezes pela mesma
 * candidatura e cairia na guarda de "quem está vivo não volta" com a frase errada.
 */
describe("o corpo do reabrir", () => {
  const classe = (dtosDoModulo as unknown as Record<string, new () => object>).ReabrirVagaDto;
  const erros = (corpo: unknown) =>
    validateSync(plainToInstance(classe, corpo) as object).flatMap((e) =>
      Object.keys(e.constraints ?? {}),
    );

  it("aceita reabrir sem trazer ninguém", () => {
    expect(erros({})).toEqual([]);
    expect(erros({ candidaturaIds: [] })).toEqual([]);
  });

  it("recusa id repetido", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(erros({ candidaturaIds: [id, id] })).not.toEqual([]);
  });

  it("recusa o que não é identificador", () => {
    expect(erros({ candidaturaIds: ["cand-1"] })).not.toEqual([]);
    expect(erros({ candidaturaIds: "tudo" })).not.toEqual([]);
  });
});
