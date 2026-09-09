import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { MenuAreasService } from "../auth/menu-areas.service";
import type { MenusService } from "../auth/menus.service";
import { DiagnosticoController } from "./diagnostico.controller";

/**
 * A ROTA DA FERRAMENTA DE PRONTUÁRIO SOB DEMANDA, e quem alcança ela.
 *
 * Escrito ANTES do código, a partir do requisito (§A.40 regra 2): hoje FALHA, e é o esperado.
 *
 * POR QUE A ROTA É PROCURADA PELO METADADO, e não pelo nome do método: o requisito fixa o caminho
 * (`POST /api/diagnostico/acao/criar-prontuario`); o nome do handler é escolha do autor. Procurar
 * pelo caminho testa o que foi combinado e não custa uma rodada por causa de um nome.
 *
 * POR QUE O RBAC ENTRA AQUI (§A.38): a ferramenta cria artefato no Drive de uma admissão qualquer, a
 * partir de um id no corpo. É ação de administração, e o COMUM não pode alcançá-la. A controller já
 * é `@Roles("MASTER","SUPER_ADMIN")` na CLASSE, mas classe é ausência de decorador no método: quatro
 * linhas bem-intencionadas com `@Roles` local, ou a remoção do decorador da classe, abrem a porta em
 * silêncio. O teste roda o `RolesGuard` REAL contra o handler REAL, que é o único jeito de medir o
 * que o guard vai decidir em produção.
 */

const RAIZ_SRC = join(__dirname, "..");
const CAMINHO_ROTA = "acao/criar-prontuario";
const POST = 1; // RequestMethod.POST

/** Acha o handler pela rota declarada (caminho + verbo), sem depender do nome do método. */
function handlerDaRota(): { nome: string; fn: object } {
  const proto = DiagnosticoController.prototype as unknown as Record<string, unknown>;
  const nome = Object.getOwnPropertyNames(proto).find((k) => {
    const fn = proto[k];
    return (
      typeof fn === "function" &&
      Reflect.getMetadata("path", fn) === CAMINHO_ROTA &&
      Reflect.getMetadata("method", fn) === POST
    );
  });
  if (!nome) {
    const rotas = Object.getOwnPropertyNames(proto)
      .map((k) => Reflect.getMetadata("path", proto[k] as object))
      .filter(Boolean);
    throw new Error(
      `Rota POST ${CAMINHO_ROTA} não existe no DiagnosticoController. Rotas achadas: ${rotas.join(", ")}`,
    );
  }
  return { nome, fn: proto[nome] as object };
}

/** Lista recursiva dos .ts de produção sob `apps/backend/src`. */
function fontesDeProducao(dir = RAIZ_SRC, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === "dist") continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) fontesDeProducao(caminho, acc);
    else if (entrada.endsWith(".ts") && !entrada.endsWith(".spec.ts")) acc.push(caminho);
  }
  return acc;
}

describe("rota da ferramenta: POST /api/diagnostico/acao/criar-prontuario", () => {
  it("a rota EXISTE, com o caminho e o verbo combinados", () => {
    const { nome } = handlerDaRota();
    expect(nome).toBeTruthy();
  });

  it("mora no DiagnosticoController, e NÃO na controller de Auditoria (que é aberta ao COMUM)", () => {
    // Se a ferramenta nascesse na Auditoria, o consultor a alcançaria pela URL da API mesmo sem
    // botão na tela. O endereço da rota é parte da regra de acesso, não decoração.
    const auditoria = readFileSync(join(RAIZ_SRC, "auditoria", "auditoria.controller.ts"), "utf8");
    expect(auditoria).not.toContain(CAMINHO_ROTA);
    expect(auditoria).not.toContain("criarProntuarioSobDemanda");
  });
});

describe("RBAC (§A.3/§A.6): a ferramenta é de administração, o COMUM não alcança", () => {
  const areasFixas = { areasDaOperacao: async () => ["ADM"] } as unknown as MenuAreasService;
  const menusDoUsuario = (areas: string[]) =>
    ({ areasDoUsuario: async () => new Set(areas) }) as unknown as MenusService;

  function contexto(papel: Papel, fn: object): ExecutionContext {
    return {
      getHandler: () => fn,
      getClass: () => DiagnosticoController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: "u-1", papel } }) }),
    } as unknown as ExecutionContext;
  }

  it("a classe continua exigindo MASTER/SUPER_ADMIN (a proteção da rota nova vem daqui)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, DiagnosticoController)).toEqual([
      "MASTER",
      "SUPER_ADMIN",
    ]);
  });

  it("o handler NÃO tem @Roles próprio afrouxando a regra da classe", () => {
    // `getAllAndOverride` deixa o metadado do MÉTODO vencer o da CLASSE. Um `@Roles("COMUM")` local,
    // ou um `@Public()`, abriria a rota sem tocar em mais nada e sem quebrar nenhum outro teste.
    const { fn } = handlerDaRota();
    const doMetodo = Reflect.getMetadata(ROLES_KEY, fn) as Papel[] | undefined;
    if (doMetodo !== undefined) {
      expect(doMetodo).toEqual(["MASTER", "SUPER_ADMIN"]);
    }
    expect(Reflect.getMetadata("isPublic", fn)).toBeUndefined();
  });

  it("RolesGuard REAL barra o papel COMUM na rota nova", async () => {
    const { fn } = handlerDaRota();
    const guard = new RolesGuard(new Reflector(), menusDoUsuario(["ADM"]), areasFixas);

    await expect(guard.canActivate(contexto("COMUM", fn))).rejects.toThrow(ForbiddenException);
  });

  it("MASTER de OUTRA área não alcança: a segunda dimensão do guard também vale aqui", async () => {
    // O Diagnóstico é da área ADM (`domain/menus`). Um MASTER de A&S passa no PAPEL e tem de parar
    // na ÁREA, senão a segmentação vira decoração justamente numa ação que escreve no Drive.
    const { fn } = handlerDaRota();
    const guard = new RolesGuard(new Reflector(), menusDoUsuario(["AS"]), areasFixas);

    await expect(guard.canActivate(contexto("MASTER", fn))).rejects.toThrow(ForbiddenException);
  });

  it("RolesGuard REAL deixa passar MASTER da área ADM e SUPER_ADMIN", async () => {
    const { fn } = handlerDaRota();
    const guard = new RolesGuard(new Reflector(), menusDoUsuario(["ADM"]), areasFixas);

    await expect(guard.canActivate(contexto("MASTER", fn))).resolves.toBe(true);
    await expect(guard.canActivate(contexto("SUPER_ADMIN", fn))).resolves.toBe(true);
  });
});

describe("runner de backfill das admissões sem prontuário", () => {
  /**
   * O runner é medido pelo que ele USA, não pelo caminho do arquivo: qualquer fonte de produção
   * fora do serviço e da controller que chame `criarProntuarioSobDemanda` conta como o runner. Assim
   * o nome do arquivo continua sendo escolha do autor.
   */
  function fontesQueUsamAFerramenta(): string[] {
    return fontesDeProducao().filter((f) => {
      if (f.endsWith(join("auditoria", "auditoria.service.ts"))) return false;
      if (f.endsWith(join("diagnostico", "diagnostico.controller.ts"))) return false;
      return readFileSync(f, "utf8").includes("criarProntuarioSobDemanda");
    });
  }

  it("existe um runner que aplica a ferramenta (fora do serviço e da controller)", () => {
    expect(fontesQueUsamAFerramenta().length).toBeGreaterThanOrEqual(1);
  });

  it("o runner passa PELA ferramenta, e não por fora dela", () => {
    // Passar por fora (chamando o arquivamento direto, ou expurgando a staging na mão) é como se
    // perde a guarda anti duplicação e a preservação dos arquivos numa carga de 31 admissões.
    for (const arquivo of fontesQueUsamAFerramenta()) {
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toContain("removerAdmissao");
      expect(texto, arquivo).not.toContain("arquivarNoDriveSemTrava");
    }
  });
});
