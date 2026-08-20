import { BadRequestException } from "@nestjs/common";
import { getTableName } from "drizzle-orm";
import type { Area } from "@ea/shared-types";
import { describe, expect, it, vi } from "vitest";
import { MenuAreasService } from "./menu-areas.service";

/**
 * ÁREA DO MENU: a FONTE VIVA da autorização por área, agora no banco.
 *
 * O QUE ESTES CASOS TRAVAM:
 *  - a mudança do diretor vale NA HORA (o cache é derrubado na escrita, sem restart);
 *  - as duas recusas (área vazia, e restringir o Início);
 *  - a prévia de impacto, que existe para mudar área não ser feito às cegas;
 *  - o fail-closed de código desconhecido;
 *  - a resolução da área de uma OPERAÇÃO, incluindo as superfícies que só o `@Roles` protege.
 */

/** Banco fingido: guarda as áreas por menu em memória e conta as leituras (para provar o cache). */
function makeDb(inicial: Record<string, Area[]>, opts?: { usuarios?: unknown[]; areas?: unknown[]; marcados?: unknown[] }) {
  const tabela = new Map<string, Area[]>(Object.entries(inicial));
  const leituras = { menus: 0 };
  const updateAlvo: { codigo?: string; areas?: Area[] } = {};

  const selectDe = (linhas: unknown[]) => {
    const p = Promise.resolve(linhas);
    return Object.assign(p, {
      where: () => Promise.resolve(linhas),
      orderBy: () => Promise.resolve(linhas),
    });
  };

  const db = {
    select: vi.fn((proj?: Record<string, unknown>) => ({
      from: (tab: unknown) => {
        // `getTableName` é o utilitário do próprio drizzle: o nome da tabela vive num Symbol interno,
        // então ler `_.name` na mão devolveria `undefined` e todo select cairia no ramo de menus.
        const nome = getTableName(tab as never);
        if (nome === "usuarios") return selectDe(opts?.usuarios ?? []);
        if (nome === "usuario_areas") return selectDe(opts?.areas ?? []);
        if (nome === "usuario_menus") return selectDe(opts?.marcados ?? []);
        leituras.menus++;
        const linhas = [...tabela.entries()].map(([codigo, areas]) => ({
          codigo,
          areas,
          rotulo: codigo,
          href: `/${codigo}`,
          grupo: "ADMIN",
          ordem: 1,
        }));
        void proj;
        return selectDe(linhas);
      },
    })),
    update: vi.fn(() => ({
      set: (v: { areas?: Area[] }) => {
        updateAlvo.areas = v.areas;
        return {
          where: () => ({
            returning: async () => {
              // O `where` real filtra por código; o dublê aplica na última chamada de `definir`.
              const codigo = updateAlvo.codigo!;
              if (!tabela.has(codigo)) return [];
              tabela.set(codigo, updateAlvo.areas!);
              return [{ codigo }];
            },
          }),
        };
      },
    })),
  };
  return { db, tabela, leituras, alvo: updateAlvo };
}

/** O `where` do dublê não interpreta a condição, então o código do alvo é dito antes de `definir`. */
function definir(svc: MenuAreasService, h: ReturnType<typeof makeDb>, codigo: string, areas: Area[]) {
  h.alvo.codigo = codigo;
  return svc.definir(codigo, areas);
}

describe("MenuAreasService: a fonte viva da área do menu", () => {
  it("lê a área da TABELA, não do registro em código", async () => {
    // `esteira` nasce em ADM no código; aqui a tabela diz outra coisa, e é a tabela que vale.
    const h = makeDb({ esteira: ["AS"] });
    const svc = new MenuAreasService(h.db as never);
    expect(await svc.areasDoMenu("esteira")).toEqual(["AS"]);
  });

  it("CACHE: várias leituras seguidas tocam o banco UMA vez", async () => {
    const h = makeDb({ esteira: ["ADM"] });
    const svc = new MenuAreasService(h.db as never);
    await svc.areasDoMenu("esteira");
    await svc.areasDoMenu("esteira");
    await svc.visivel("esteira", ["ADM"]);
    // Sem isto, cada operação gatada viraria uma consulta a mais por requisição.
    expect(h.leituras.menus).toBe(1);
  });

  it("A MUDANÇA DO DIRETOR VALE NA HORA: gravar derruba o cache, sem restart", async () => {
    const h = makeDb({ esteira: ["ADM"] });
    const svc = new MenuAreasService(h.db as never);
    expect(await svc.visivel("esteira", ["AS"])).toBe(false);

    await definir(svc, h, "esteira", ["ADM", "AS"]);

    // Mesma instância, sem reiniciar nada: a resposta já mudou.
    expect(await svc.visivel("esteira", ["AS"])).toBe(true);
    expect(h.leituras.menus).toBe(2); // recarregou depois da invalidação
  });

  it("RECUSA área vazia: menu sem área é uma tela que ninguém alcança", async () => {
    const h = makeDb({ esteira: ["ADM"] });
    const svc = new MenuAreasService(h.db as never);
    await expect(definir(svc, h, "esteira", [])).rejects.toBeInstanceOf(BadRequestException);
    expect(h.tabela.get("esteira")).toEqual(["ADM"]); // nada foi gravado
  });

  it("RECUSA lixo que sobre como lista vazia depois da validação", async () => {
    const h = makeDb({ esteira: ["ADM"] });
    const svc = new MenuAreasService(h.db as never);
    await expect(
      definir(svc, h, "esteira", ["INEXISTENTE" as Area]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("PROTEGE O INÍCIO: ele não pode ser restrito a uma área só", async () => {
    // Sem esta trava, restringir o Início deixaria uma área inteira sem NENHUM item na barra lateral,
    // e a pessoa não teria nem por onde reportar o problema.
    const h = makeDb({ inicio: ["ADM", "AS"] });
    const svc = new MenuAreasService(h.db as never);
    await expect(definir(svc, h, "inicio", ["ADM"])).rejects.toBeInstanceOf(BadRequestException);
    expect(h.tabela.get("inicio")).toEqual(["ADM", "AS"]);
  });

  it("o Início aceita ser gravado com as duas áreas (o estado válido dele)", async () => {
    const h = makeDb({ inicio: ["ADM", "AS"] });
    const svc = new MenuAreasService(h.db as never);
    await expect(definir(svc, h, "inicio", ["ADM", "AS"])).resolves.toEqual(["ADM", "AS"]);
  });

  it("FAIL-CLOSED: código desconhecido não é de área nenhuma, e ninguém o enxerga", async () => {
    const h = makeDb({ esteira: ["ADM"] });
    const svc = new MenuAreasService(h.db as never);
    expect(await svc.areasDoMenu("nao-existe")).toEqual([]);
    expect(await svc.visivel("nao-existe", ["ADM", "AS"])).toBe(false);
  });

  it("filtrar corta os menus fora da área do usuário", async () => {
    const h = makeDb({ inicio: ["ADM", "AS"], esteira: ["ADM"], vagas: ["AS"] });
    const svc = new MenuAreasService(h.db as never);
    expect(await svc.filtrar(["inicio", "esteira", "vagas"], ["AS"])).toEqual(["inicio", "vagas"]);
    expect(await svc.filtrar(["inicio", "esteira", "vagas"], ["ADM"])).toEqual(["inicio", "esteira"]);
    // Usuário sem área: nada.
    expect(await svc.filtrar(["inicio", "esteira"], [])).toEqual([]);
  });

  it("ÁREA DA OPERAÇÃO: quando um MENU a reivindica, vale a área VIGENTE da tabela", async () => {
    // `RegrasController.create` é reivindicada pelo menu `regras`. Remarcado o menu, a operação segue.
    const h = makeDb({ regras: ["ADM", "AS"] });
    const svc = new MenuAreasService(h.db as never);
    expect(await svc.areasDaOperacao("RegrasController", "create")).toEqual(["ADM", "AS"]);
  });

  it("ÁREA DA OPERAÇÃO: menu reivindicante ausente da tabela cai no default, não em vazio", async () => {
    // Vazio barraria a Admissão inteira por causa de um menu removido do catálogo.
    const h = makeDb({});
    const svc = new MenuAreasService(h.db as never);
    expect(await svc.areasDaOperacao("RegrasController", "create")).toEqual(["ADM"]);
  });

  it("ÁREA DA OPERAÇÃO: as superfícies que só o @Roles protege saem do mapa em código", async () => {
    // A limitação aceita pelo diretor: a tela dele não governa estas 8 operações.
    const h = makeDb({});
    const svc = new MenuAreasService(h.db as never);
    expect(await svc.areasDaOperacao("UsersController", "criar")).toEqual(["ADM"]);
    expect(await svc.areasDaOperacao("AdmissoesController", "recusar")).toEqual(["ADM"]);
    expect(await svc.areasDaOperacao("ControllerDesconhecida", "seja o que for")).toEqual(["ADM"]);
  });
});

describe("MenuAreasService: prévia do impacto (mudar área tira acesso, e não às cegas)", () => {
  const USUARIOS = [
    { id: "master-adm", nome: "Master ADM", papel: "MASTER" },
    { id: "master-as", nome: "Master A&S", papel: "MASTER" },
    { id: "comum-adm", nome: "Comum ADM", papel: "COMUM" },
    { id: "super", nome: "Super", papel: "SUPER_ADMIN" },
  ];
  const AREAS_USUARIO = [
    { usuarioId: "master-adm", area: "ADM" },
    { usuarioId: "master-as", area: "AS" },
    { usuarioId: "comum-adm", area: "ADM" },
  ];

  it("conta quem PERDE ao restringir um menu de ADM para A&S", async () => {
    const h = makeDb(
      { esteira: ["ADM"] },
      { usuarios: USUARIOS, areas: AREAS_USUARIO, marcados: [{ usuarioId: "comum-adm" }] },
    );
    const svc = new MenuAreasService(h.db as never);
    const r = await svc.impacto("esteira", ["AS"]);
    // O Master de ADM perde (via área) e o COMUM marcado perde. O Master de A&S nunca via.
    expect(r.perdem.map((u) => u.id).sort()).toEqual(["comum-adm", "master-adm"]);
    // E o Master de A&S passa a ver, o que também é informação útil antes de salvar.
    expect(r.ganham).toBe(1);
  });

  it("o SUPER_ADMIN nunca entra na conta: está acima da segmentação", async () => {
    const h = makeDb(
      { esteira: ["ADM"] },
      { usuarios: USUARIOS, areas: AREAS_USUARIO, marcados: [] },
    );
    const svc = new MenuAreasService(h.db as never);
    const r = await svc.impacto("esteira", ["AS"]);
    expect(r.perdem.map((u) => u.id)).not.toContain("super");
  });

  it("COMUM sem a marcação não perde nada, porque nunca viu o menu", async () => {
    const h = makeDb(
      { esteira: ["ADM"] },
      { usuarios: USUARIOS, areas: AREAS_USUARIO, marcados: [] },
    );
    const svc = new MenuAreasService(h.db as never);
    const r = await svc.impacto("esteira", ["AS"]);
    // A ÁREA NUNCA CONCEDE: só o Master de ADM perde, porque só ele via sem depender de marcação.
    expect(r.perdem.map((u) => u.id)).toEqual(["master-adm"]);
  });

  it("ampliar um menu para as duas áreas não tira acesso de ninguém", async () => {
    const h = makeDb(
      { esteira: ["ADM"] },
      { usuarios: USUARIOS, areas: AREAS_USUARIO, marcados: [{ usuarioId: "comum-adm" }] },
    );
    const svc = new MenuAreasService(h.db as never);
    const r = await svc.impacto("esteira", ["ADM", "AS"]);
    expect(r.perdem).toEqual([]);
    expect(r.ganham).toBe(1); // o Master de A&S
  });

  it("simular área VAZIA é permitido, e mostra o estrago que a recusa impede", async () => {
    const h = makeDb(
      { esteira: ["ADM"] },
      { usuarios: USUARIOS, areas: AREAS_USUARIO, marcados: [{ usuarioId: "comum-adm" }] },
    );
    const svc = new MenuAreasService(h.db as never);
    const r = await svc.impacto("esteira", []);
    expect(r.perdem.map((u) => u.id).sort()).toEqual(["comum-adm", "master-adm"]);
    expect(r.ganham).toBe(0);
  });
});
