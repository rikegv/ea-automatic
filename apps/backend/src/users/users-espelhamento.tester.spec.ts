import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { codigosPadraoDoPapel } from "../domain/menus";
import { UsersController } from "./users.controller";

/**
 * ─ ESPELHAMENTO DE USUÁRIO: a ORQUESTRAÇÃO da controller (cobertura independente, §A.38) ──────────
 *
 * Esta frente copia os menus de um usuário-FONTE para o ALVO. O RECORTE em si (descartar código
 * inválido, tirar bloqueado do COMUM, teto de área) é de `definirMenusDoUsuario` e já tem dono
 * (`domain/menus.spec.ts`, `domain/selecao-menus.spec.ts`), então aqui NÃO se reteste o recorte.
 *
 * O que estes testes travam é a DECISÃO da controller, que é onde o espelhamento vive e onde ele
 * regride em silêncio: QUAIS códigos entram (os da FONTE, não o padrão do papel), com QUAL papel e
 * QUAIS áreas (sempre os do ALVO), e os três fail-closed de id vindo do cliente (fonte/alvo
 * inexistente, self-mirror). `UsersService` e `MenusService` são DUBLÊS: nenhum Postgres sobe.
 */

function makeCtrl() {
  const users = {
    criar: vi.fn().mockResolvedValue({ usuario: { id: "novo-1" }, senhaTemporaria: "tmp-123456" }),
    findById: vi.fn(),
  };
  const menus = {
    definirAreasDoUsuario: vi.fn().mockResolvedValue(["ADM"]),
    codigosDoUsuario: vi.fn(),
    areasDoUsuario: vi.fn(),
    definirMenusDoUsuario: vi.fn().mockResolvedValue([]),
  };
  const ctrl = new UsersController(users as never, menus as never);
  return { ctrl, users, menus };
}

const DTO_BASE = {
  nome: "Fulano",
  email: "fulano@ea.local",
  papel: "COMUM" as const,
  areas: ["ADM"] as never,
};

describe("acesso: toda a administração de usuários é SUPER_ADMIN (carimbo na CLASSE)", () => {
  it("UsersController tem @Roles('SUPER_ADMIN') na classe (o /espelhar herda daí)", () => {
    // O `@Roles` é metadado de classe: nenhum teste de service o alcança, por isso regride em
    // silêncio. O endpoint `:id/espelhar` não declara `@Roles` próprio, então SÓ está protegido se
    // a classe estiver. Tirar este carimbo abriria o espelhamento a qualquer autenticado.
    expect(Reflect.getMetadata(ROLES_KEY, UsersController)).toEqual(["SUPER_ADMIN"]);
  });
});

describe("criar: espelhamento opcional na criação", () => {
  let h: ReturnType<typeof makeCtrl>;
  beforeEach(() => (h = makeCtrl()));

  it("COM fonte válida: usa os CÓDIGOS DA FONTE (não o padrão do papel), com papel+áreas do ALVO", async () => {
    h.users.findById.mockResolvedValue({ id: "fonte-1", papel: "SUPER_ADMIN" });
    h.menus.codigosDoUsuario.mockResolvedValue(new Set(["menu-a", "menu-b", "menu-c"]));
    h.menus.definirMenusDoUsuario.mockResolvedValue(["menu-a", "menu-b"]);

    const res = await h.ctrl.criar({ ...DTO_BASE, espelharDeUsuarioId: "fonte-1" } as never);

    // Lê os códigos DA FONTE.
    expect(h.menus.codigosDoUsuario).toHaveBeenCalledWith("fonte-1");
    // Aplica ESSES códigos (os da fonte, já como array), com o papel do DTO e as áreas que
    // `definirAreasDoUsuario` acabou de gravar para o novo usuário.
    expect(h.menus.definirMenusDoUsuario).toHaveBeenCalledWith(
      "novo-1",
      ["menu-a", "menu-b", "menu-c"],
      "COMUM",
      ["ADM"],
    );
    // E JAMAIS o padrão do papel: espelhar é o oposto de nascer no padrão.
    const codigosAplicados = h.menus.definirMenusDoUsuario.mock.calls[0][1];
    expect(codigosAplicados).not.toEqual(codigosPadraoDoPapel("COMUM"));
    // A resposta expõe quantos menus a fonte deixou no alvo (após o recorte do service).
    expect(res).toMatchObject({ menusEspelhados: 2, areas: ["ADM"] });
  });

  it("COM fonte INEXISTENTE: 400 ANTES de criar (nem usuário, nem áreas, nem menus)", async () => {
    h.users.findById.mockResolvedValue(undefined);

    await expect(
      h.ctrl.criar({ ...DTO_BASE, espelharDeUsuarioId: "fantasma" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.menus.codigosDoUsuario).not.toHaveBeenCalled();
    expect(h.menus.definirMenusDoUsuario).not.toHaveBeenCalled();
    // E, principalmente, NÃO cria o usuário nem grava áreas: a validação da fonte acontece ANTES de
    // qualquer efeito, então id inexistente não deixa usuário meia-provisionado no banco (tudo ou
    // nada). Esta era a inconsistência de orquestração que o tester independente levantou.
    expect(h.users.criar).not.toHaveBeenCalled();
    expect(h.menus.definirAreasDoUsuario).not.toHaveBeenCalled();
  });

  it("SEM espelhamento (regressão): usa codigosPadraoDoPapel(papel), comportamento preservado", async () => {
    h.menus.definirMenusDoUsuario.mockResolvedValue(codigosPadraoDoPapel("COMUM"));

    await h.ctrl.criar({ ...DTO_BASE } as never);

    // Sem `espelharDeUsuarioId` a fonte nunca é consultada.
    expect(h.users.findById).not.toHaveBeenCalled();
    expect(h.menus.codigosDoUsuario).not.toHaveBeenCalled();
    // E aplica exatamente o PADRÃO do papel, com papel+áreas do novo usuário.
    expect(h.menus.definirMenusDoUsuario).toHaveBeenCalledWith(
      "novo-1",
      codigosPadraoDoPapel("COMUM"),
      "COMUM",
      ["ADM"],
    );
  });
});

describe(":id/espelhar: espelhamento na edição de um usuário que já existe", () => {
  let h: ReturnType<typeof makeCtrl>;
  beforeEach(() => (h = makeCtrl()));

  it("self-mirror (deUsuarioId === id): 400 e não toca em menus nem consulta usuários", async () => {
    await expect(h.ctrl.espelharMenus("mesmo-1", { deUsuarioId: "mesmo-1" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.users.findById).not.toHaveBeenCalled();
    expect(h.menus.definirMenusDoUsuario).not.toHaveBeenCalled();
  });

  it("ALVO inexistente: 404 (o recurso da rota não existe)", async () => {
    // findById(id) -> undefined
    h.users.findById.mockResolvedValue(undefined);

    await expect(h.ctrl.espelharMenus("alvo-x", { deUsuarioId: "fonte-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(h.menus.definirMenusDoUsuario).not.toHaveBeenCalled();
  });

  it("FONTE inexistente: 400 (o corpo aponta para alguém que não há)", async () => {
    // findById(id=alvo) -> alvo; findById(deUsuarioId=fonte) -> undefined.
    h.users.findById.mockImplementation(async (uid: string) =>
      uid === "alvo-1" ? { id: "alvo-1", papel: "COMUM" } : undefined,
    );

    await expect(h.ctrl.espelharMenus("alvo-1", { deUsuarioId: "fantasma" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.menus.definirMenusDoUsuario).not.toHaveBeenCalled();
  });

  it("caminho feliz: códigos da FONTE com papel+áreas do ALVO, e retorna { ok, total }", async () => {
    h.users.findById.mockImplementation(async (uid: string) =>
      uid === "alvo-1"
        ? { id: "alvo-1", papel: "COMUM" }
        : uid === "fonte-1"
          ? { id: "fonte-1", papel: "SUPER_ADMIN" }
          : undefined,
    );
    h.menus.codigosDoUsuario.mockResolvedValue(new Set(["x", "y"]));
    h.menus.areasDoUsuario.mockResolvedValue(new Set(["AS"]));
    h.menus.definirMenusDoUsuario.mockResolvedValue(["x"]);

    const res = await h.ctrl.espelharMenus("alvo-1", { deUsuarioId: "fonte-1" });

    // Códigos vêm da FONTE.
    expect(h.menus.codigosDoUsuario).toHaveBeenCalledWith("fonte-1");
    // Áreas vêm do ALVO.
    expect(h.menus.areasDoUsuario).toHaveBeenCalledWith("alvo-1");
    // Aplica no ALVO, com os códigos da fonte (como array), o PAPEL DO ALVO e as ÁREAS DO ALVO.
    // Espelhar SUPER_ADMIN sobre COMUM passa o papel COMUM: o recorte protege o alvo.
    expect(h.menus.definirMenusDoUsuario).toHaveBeenCalledWith("alvo-1", ["x", "y"], "COMUM", ["AS"]);
    // total = quantos menus o service de fato aplicou (após recorte).
    expect(res).toEqual({ ok: true, total: 1 });
  });
});
