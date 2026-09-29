import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_QUE_NASCEM_FORA_DA_ADM,
  MENUS_SOMENTE_SUPER_ADMIN,
  codigosPadraoDoPapel,
  masterPrecisaDeMarcacao,
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
   * ─ A AUTORIDADE SAIU DA CLASSE E VIROU O MENU (regra do diretor, 27/09/2026) ─────────────────
   *
   * ESTE CASO AFIRMAVA O CONTRÁRIO, e afirmava certo para o desenho de então: a administração era
   * `@Roles("SUPER_ADMIN")` e o menu era a camada de UX. O diretor decidiu que o Super Admin concede
   * QUALQUER tela a QUALQUER usuário, e com o papel na classe isso era impossível de entregar:
   * conceder o menu abria uma PORTA TRANCADA, com 403 já no `@Get` que a tela lê ao abrir.
   *
   * A PROPRIEDADE QUE O `@Roles` EM CLASSE DAVA NÃO FOI PERDIDA, e é o que este caso guarda agora:
   * rota NOVA nasce FECHADA, porque o registro reivindica a classe por coringa (`Classe.*`) e o
   * `MenuGuard` só é fail-open para operação que NINGUÉM reivindica. É o caso seguinte que afirma a
   * reivindicação handler por handler.
   */
  it("a ADMINISTRAÇÃO não tem mais @Roles em CLASSE: quem tranca a porta é o menu", () => {
    const admin = SUSPEITAS.filter((c) => rotaDe(c).startsWith("admin/"));
    expect(admin.length, "sem controller de administração não há o que afirmar").toBeGreaterThan(0);
    for (const c of admin) {
      expect(Reflect.getMetadata(ROLES_KEY, c), c.name).toBeUndefined();
    }
  });

  /**
   * ─ A REIVINDICAÇÃO NO `domain/menus.ts`, E ELA É A METADE FAIL-OPEN ───────────────────────────
   *
   * Sem ela, a rota de escrita do catálogo é alcançável pela URL da API por QUALQUER sessão
   * autenticada. O efeito prático deixou de ser menor: o `@Roles` SAIU da classe (regra do diretor,
   * 27/09/2026), então "o dia em que alguém simplificar o `@Roles`" chegou, e o menu passou a ser tudo
   * o que sobra. Este caso é o que impede a simplificação de virar rota aberta.
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

describe("7. o menu do catálogo nasce registrado, só para o SUPER_ADMIN, e CONCEDÍVEL (§A.23)", () => {
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

  /**
   * ─ NASCE SÓ PARA O SUPER_ADMIN **E** É CONCEDÍVEL, as duas coisas ao mesmo tempo ─────────────
   *
   * ESTE CASO EXIGIA AS DUAS LISTAS DE BLOQUEIO, e exigia certo enquanto a escrita era
   * `@Roles("SUPER_ADMIN")`: ali, deixar o menu visível ao Master era mostrar a porta e trancá-la.
   * A regra do diretor (27/09/2026) pediu o oposto do que aquelas listas fazem: `MENUS_SOMENTE_SUPER_ADMIN`
   * REMOVE o menu do `/auth/me` de quem não é SUPER_ADMIN (torna a concessão INÚTIL) e
   * `MENUS_BLOQUEADOS_COMUM` é filtrada ao SALVAR (torna a concessão IMPOSSÍVEL de gravar para um COMUM).
   *
   * A CASA QUE ATENDE AS DUAS EXIGÊNCIAS É `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`: o menu não vem de
   * nascença para ninguém (§A.23), o `MenuGuard` exige a marcação nominal inclusive do MASTER, e a
   * marcação, quando existe, sobrevive a todos os filtros.
   */
  it("nasce SÓ para o SUPER_ADMIN e é CONCEDÍVEL, pessoa a pessoa", () => {
    expect(
      masterPrecisaDeMarcacao(MENU_ESPERADO),
      "fora desta lista, todo MASTER de A&S ganha o catálogo pelo bypass de ÁREA, sem o diretor decidir",
    ).toBe(true);
    expect(
      MENUS_SOMENTE_SUPER_ADMIN.has(MENU_ESPERADO),
      "dentro desta lista, a marcação do diretor é gravada e o `/auth/me` a descarta em silêncio",
    ).toBe(false);
    expect(
      MENUS_BLOQUEADOS_COMUM.has(MENU_ESPERADO),
      "dentro desta lista, a concessão a um COMUM é filtrada na própria gravação",
    ).toBe(false);
    // A PORTA DO NASCIMENTO segue fechada: ninguém recebe o menu por padrão (§A.23).
    expect(codigosPadraoDoPapel("MASTER")).not.toContain(MENU_ESPERADO);
    expect(codigosPadraoDoPapel("COMUM")).not.toContain(MENU_ESPERADO);
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
// 3. O BLOCO DA INVARIANTE DA FAMÍLIA FOI RETIRADO, E O PORQUÊ IMPORTA MAIS QUE O BLOCO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// AQUI HAVIA UMA VARREDURA que afirmava: "todo menu de A&S cuja controller de escrita é
// `@Roles("SUPER_ADMIN")` TEM de estar em `MENUS_SOMENTE_SUPER_ADMIN` e em `MENUS_BLOQUEADOS_COMUM`".
// Ela estava CERTA para o desenho de então, e ela vinha com uma SENTINELA própria, que era o cuidado
// certo: "existe mais de um catálogo fechado a afirmar, a varredura não pode passar vazia".
//
// ─ A SENTINELA FICOU VERMELHA, E ELA ESTAVA PROVANDO QUE A FRENTE FEZ O QUE DEVIA ───────────────
//
// A regra do diretor (27/09/2026) tirou o `@Roles("SUPER_ADMIN")` dos OITO catálogos de A&S: o Super
// Admin concede QUALQUER tela a QUALQUER usuário, e o papel na classe abria uma porta trancada. A
// FAMÍLIA DE "CATÁLOGOS DE A&S FECHADOS POR `@Roles`" ESVAZIOU, ou seja, o conjunto que esta varredura
// percorria deixou de ter elementos. A sentinela vermelha não é defeito do comportamento novo: é o
// aviso, funcionando, de que a varredura perdeu o OBJETO.
//
// ─ POR QUE RETIRAR, E NÃO REMENDAR PARA CONTINUAR VERDE ─────────────────────────────────────────
//
// As duas asserções que ela guardava são hoje o CONTRÁRIO do requisito: exigir
// `MENUS_SOMENTE_SUPER_ADMIN` é exigir que o menu seja INCONCEDÍVEL, que é exatamente o defeito que
// a frente eliminou (a tela oferecia a caixa, o diretor marcava, e o backend descartava em silêncio).
// Mantê-las passando vazio deixaria um teste verde afirmando um desenho REVOGADO, à espera do dia em
// que alguém recolocasse um `@Roles` e ele voltasse a cobrar a lista errada. Teste que exige um
// desenho revogado é pior que teste nenhum.
//
// ─ O QUE SUBSTITUI, E É MAIS FORTE ─────────────────────────────────────────────────────────────
//
// A invariante da FAMÍLIA continua varrida, com a pergunta invertida, em
// `as/catalogos-concediveis.rbac.spec.ts` (os oito catálogos, handler por handler, pelo `MenuGuard` de
// verdade) e em `domain/menus.spec.ts` (as listas pinadas por inteiro, nos dois sentidos). O caso
// "só este menu reivindica a administração do catálogo", que era a metade útil deste bloco, segue
// afirmado logo acima, no bloco 2.
