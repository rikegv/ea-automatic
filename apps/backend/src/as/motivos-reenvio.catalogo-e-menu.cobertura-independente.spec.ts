import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_QUE_NASCEM_FORA_DA_ADM,
  MENUS_SOMENTE_SUPER_ADMIN,
  menuDaOperacao,
} from "../domain/menus";
import { AsModule } from "./as.module";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE REENVIO: RBAC, MENU E O NASCIMENTO SÓ PARA O SUPER_ADMIN ────────────
 *
 * ESTE ARQUIVO É DO `tester`, ESCRITO ANTES DO CÓDIGO (§A.40 regra 2). Ele mede os requisitos 6 e 7
 * na camada ESTRUTURAL (quem pode chamar a rota, e quem enxerga o card), que é onde eles moram: o
 * comportamento do catálogo dentro do envio está medido em
 * `shortlists.aviso-e-motivo-de-reenvio.cobertura-independente.spec.ts`.
 *
 * ┌─ O QUE O REQUISITO 7 QUER DIZER, E POR QUE ELE É DE SEGURANÇA E NÃO DE UX ─────────────────────┐
 * │ O `MenuGuard` é FAIL-OPEN: rota que MENU NENHUM reivindica nasce ABERTA a qualquer sessão      │
 * │ autenticada. Então "esqueci de registrar o menu" não dá 403 em lugar nenhum e não aparece em   │
 * │ teste de tela: a porta simplesmente fica destrancada, e o defeito só se descobre procurando.   │
 * │                                                                                                 │
 * │ E O MENU SOZINHO NÃO SEGURA O MASTER, que é a outra metade que se esquece: o `MenuGuard` o     │
 * │ deixa passar por PERTENCER À ÁREA, e há MASTER na área AS em produção. Quem tranca é o          │
 * │ `@Roles("SUPER_ADMIN")` NA CLASSE (fail-closed, e cobre inclusive a rota que ainda não existe).│
 * │ As duas camadas são independentes e as duas são obrigatórias.                                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E A LEITURA CONTINUA ABERTA, DE PROPÓSITO ───────────────────────────────────────────────────┐
 * │ Quem reenvia shortlist é o CONSULTOR, e ele precisa da lista para preencher o seletor. Fechar  │
 * │ a leitura junto com a escrita daria 403 no seletor SEM ERRO VISÍVEL NA TELA: ele abriria       │
 * │ VAZIO, e o reenvio ficaria impossível sem nada falhar. É o incidente que a casa já pagou uma   │
 * │ vez, e é por isso que o molde do descarte tem DUAS controllers e não uma.                       │
 * │                                                                                                 │
 * │ ISTO SÓ É ACEITÁVEL PORQUE O CATÁLOGO NÃO GUARDA DADO PESSOAL: são nomes de processo, como as  │
 * │ etapas e os status. O contraexemplo do módulo é `as_comerciais`, que guarda NOME DE PESSOA e   │
 * │ por isso NÃO tem leitura aberta.                                                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: este arquivo lê metadado de classe e o registro de menus. Nenhum dado, nenhum banco.
 */

type Classe = new (...args: never[]) => object;

function controllersDoModulo(): Classe[] {
  const lista = Reflect.getMetadata("controllers", AsModule) as unknown;
  return Array.isArray(lista) ? (lista as Classe[]) : [];
}

function rotaDe(c: Classe): string {
  const bruto = Reflect.getMetadata("path", c) as unknown;
  return typeof bruto === "string" ? bruto.replace(/^\/+/, "").replace(/\/+$/, "") : "";
}

function handlersDe(c: Classe): string[] {
  const proto = c.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

const CONTROLLERS = controllersDoModulo();

/** Tudo que cheira a motivo de reenvio, pela ROTA ou pelo NOME DA CLASSE. */
const SUSPEITAS = CONTROLLERS.filter(
  (c) => /reenvio/i.test(rotaDe(c)) || /Reenvio/i.test(c.name),
);

const MENU_ESPERADO = "as-motivos-reenvio";

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. AS DUAS CONTROLLERS EXISTEM, NO MOLDE DO DESCARTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("6/7. o catálogo de motivos de reenvio nasce no molde dos motivos de descarte", () => {
  it("o módulo declara uma controller de ADMINISTRAÇÃO do catálogo", () => {
    const admin = SUSPEITAS.filter((c) => rotaDe(c).startsWith("admin/"));
    expect(
      admin.map((c) => c.name),
      `controllers do AsModule: ${JSON.stringify(CONTROLLERS.map((c) => c.name))}`,
    ).not.toEqual([]);
  });

  it("o módulo declara uma controller de LEITURA do catálogo", () => {
    const leitura = SUSPEITAS.filter((c) => !rotaDe(c).startsWith("admin/"));
    expect(
      leitura.map((c) => c.name),
      "sem leitura aberta o seletor do reenvio abre VAZIO, e o gesto fica impossível sem nada falhar",
    ).not.toEqual([]);
  });

  /**
   * A AUTORIDADE NA CLASSE, e não no método: assim rota NOVA nasce fechada, em vez de depender de
   * alguém lembrar do decorador. É a mesma escolha dos cinco catálogos vizinhos.
   */
  it('a ADMINISTRAÇÃO é @Roles("SUPER_ADMIN") na CLASSE', () => {
    const admin = SUSPEITAS.filter((c) => rotaDe(c).startsWith("admin/"));
    expect(admin.length, "sem controller de administração não há o que afirmar").toBeGreaterThan(0);
    for (const c of admin) {
      expect(Reflect.getMetadata(ROLES_KEY, c), c.name).toEqual(["SUPER_ADMIN"]);
    }
  });

  /**
   * ─ A REIVINDICAÇÃO NO `domain/menus.ts`, E ELA É A METADE FAIL-OPEN ───────────────────────────
   *
   * Sem ela, a rota de escrita do catálogo é alcançável pela URL da API por qualquer sessão
   * autenticada que atravesse o `RolesGuard`. Aqui o `@Roles` já segura, então o efeito prático é
   * menor, e a régua vale igual: as duas camadas existem porque cada uma cobre o furo da outra, e
   * o dia em que alguém "simplificar" o `@Roles` é o dia em que o menu é tudo o que sobra.
   */
  it("TODA operação de escrita é reivindicada pelo menu do catálogo", () => {
    const admin = SUSPEITAS.filter((c) => rotaDe(c).startsWith("admin/"));
    expect(admin.length).toBeGreaterThan(0);
    for (const c of admin) {
      const ops = handlersDe(c);
      expect(ops.length, `${c.name} sem handler passaria por não ter o que afirmar`).toBeGreaterThan(0);
      for (const op of ops) {
        expect(menuDaOperacao(c.name, op), `${c.name}.${op}`).toBe(MENU_ESPERADO);
      }
    }
  });

  /** E A LEITURA FICA FORA DA REIVINDICAÇÃO, de propósito. Ver o cabeçalho. */
  it("a LEITURA não é reivindicada por menu nenhum e não tem @Roles", () => {
    const leitura = SUSPEITAS.filter((c) => !rotaDe(c).startsWith("admin/"));
    expect(leitura.length).toBeGreaterThan(0);
    for (const c of leitura) {
      expect(Reflect.getMetadata(ROLES_KEY, c), c.name).toBeUndefined();
      const proto = c.prototype as unknown as Record<string, object>;
      for (const op of handlersDe(c)) {
        expect(menuDaOperacao(c.name, op), `${c.name}.${op}`).toBeNull();
        expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `${c.name}.${op}`).toBeUndefined();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O MENU NOVO NASCE SÓ PARA O SUPER_ADMIN (§A.23)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. o menu do catálogo nasce registrado e SÓ para o SUPER_ADMIN (§A.23)", () => {
  /**
   * REGISTRO, E NUNCA CONCESSÃO. Entrar em `MENUS` faz o menu EXISTIR e ser SELECIONÁVEL na tela de
   * liberação, e para por aí: quem enxerga é decisão do diretor. O registro em código é o que evita
   * o caso `clinicas` de 29/07/2026, em que a tela subiu no ar funcionando e NÃO EXISTIA como opção
   * na tela de permissões.
   */
  it("o menu existe no registro, com `areas: [\"AS\"]`", () => {
    const def = MENUS.find((m) => m.codigo === MENU_ESPERADO);
    expect(
      def,
      `menu ausente do registro: ele não aparece na tela de liberação. Menus AS: ${JSON.stringify(
        MENUS.filter((m) => m.codigo.startsWith("as-")).map((m) => m.codigo),
      )}`,
    ).toBeDefined();
    expect(def?.areas, 'sem `areas: ["AS"]` o menu nasce em ADM e some para o time de A&S').toEqual([
      "AS",
    ]);
  });

  it("nasce SÓ para o SUPER_ADMIN e não é concedível a COMUM", () => {
    expect(
      MENUS_SOMENTE_SUPER_ADMIN.has(MENU_ESPERADO),
      "fora desta lista, o menu APARECE para o Master e dá 403: mostrar a porta e trancá-la vira chamado",
    ).toBe(true);
    expect(
      MENUS_BLOQUEADOS_COMUM.has(MENU_ESPERADO),
      "fora desta lista, a tela de Usuários OFERECE marcar o menu para um COMUM, e a marcação não concede nada",
    ).toBe(true);
    expect(
      MENUS_QUE_NASCEM_FORA_DA_ADM.has(MENU_ESPERADO),
      "é a prova NOMINAL de que o menu nasce na área AS, e não na ADM",
    ).toBe(true);
  });

  it("só este menu reivindica a administração do catálogo", () => {
    const admin = SUSPEITAS.filter((c) => rotaDe(c).startsWith("admin/"));
    expect(admin.length).toBeGreaterThan(0);
    for (const c of admin) {
      const reivindicam = MENUS.filter((m) =>
        m.operacoes.some((op) => op.startsWith(`${c.name}.`)),
      ).map((m) => m.codigo);
      expect(reivindicam, c.name).toEqual([MENU_ESPERADO]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A INVARIANTE DA FAMÍLIA: TODO CATÁLOGO DE A&S FECHADO POR `@Roles` SOME DA BARRA DOS OUTROS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ ESTE BLOCO NÃO É SOBRE O CATÁLOGO NOVO, E É DE PROPÓSITO ─────────────────────────────────────
 *
 * A §A.23 não é uma régua por menu, é uma régua da CASA: se a controller de escrita é
 * `@Roles("SUPER_ADMIN")`, o menu que a reivindica TEM de estar nas duas listas, senão o Master vê
 * um card que só lhe dá 403 e o COMUM pode ser marcado para um menu que não concede nada.
 *
 * ESCRITO COMO VARREDURA, e não caso a caso, porque é assim que a invariante sobrevive ao próximo
 * catálogo: o sexto, o sétimo e o oitavo entram nela sozinhos, sem ninguém lembrar de acrescentar
 * um `it` aqui. Foi exatamente esse "lembrar" que falhou uma vez (ver o retorno do `tester`).
 */
describe("§A.23, a invariante da família de catálogos de A&S", () => {
  const catalogosFechados = MENUS.filter((m) => {
    if (!m.codigo.startsWith("as-")) return false;
    return m.operacoes.some((op) => {
      const classe = CONTROLLERS.find((c) => op.startsWith(`${c.name}.`));
      return classe ? Reflect.getMetadata(ROLES_KEY, classe) !== undefined : false;
    });
  });

  it("existe mais de um catálogo fechado a afirmar (a varredura não pode passar vazia)", () => {
    expect(catalogosFechados.map((m) => m.codigo).length).toBeGreaterThan(1);
  });

  it("TODO menu de A&S cuja escrita é @Roles some da barra dos demais (MENUS_SOMENTE_SUPER_ADMIN)", () => {
    const faltando = catalogosFechados
      .map((m) => m.codigo)
      .filter((c) => !MENUS_SOMENTE_SUPER_ADMIN.has(c));
    expect(
      faltando,
      "estes menus APARECEM para o Master e dão 403 em tudo o que ele tentar (§A.23)",
    ).toEqual([]);
  });

  it("TODO menu de A&S cuja escrita é @Roles não é oferecido ao COMUM (MENUS_BLOQUEADOS_COMUM)", () => {
    const faltando = catalogosFechados
      .map((m) => m.codigo)
      .filter((c) => !MENUS_BLOQUEADOS_COMUM.has(c));
    expect(
      faltando,
      "a tela de Usuários oferece marcar estes menus para um COMUM, e a marcação não concede nada",
    ).toEqual([]);
  });
});
