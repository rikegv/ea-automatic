import "reflect-metadata";
import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { DRIZZLE } from "../db/drizzle.module";
import { PandapeEntradaModule } from "../pandape/pandape-entrada.module";
import { PandapeNomeCacheService } from "../pandape/pandape-nome-cache.service";
import { PandapeModule } from "../pandape/pandape.module";
import { DiagnosticoModule } from "./diagnostico.module";

/**
 * ─ O CACHE DE NOMES É UMA INSTÂNCIA SÓ, E É DISSO QUE A FRENTE INTEIRA DEPENDE ──────────────────
 *
 * O CONSERTO ÓBVIO ERA O ERRADO. Para o `DiagnosticoController` poder ler o cache, a tentação é
 * declarar `PandapeNomeCacheService` nos `providers` do `DiagnosticoModule`. Isso COMPILA, os testes
 * de unidade passam, a tela funciona, e o efeito é silencioso: nasce uma SEGUNDA instância. O cache
 * que o worker preenche nunca é lido, TODA abertura do modal vai 100% à API do Pandapé (gastando a
 * cota compartilhada com o webhook que alimenta a folha, §A.5) e passam a existir dois depósitos de
 * até 500 nomes em memória, que é o oposto da minimização que o cache existe para fazer (§A.6).
 *
 * A FORMA CORRETA é importar o módulo FOLHA (`PandapeEntradaModule`), que é exatamente o que o
 * cabeçalho daquele módulo pede, e não declarar nada. Por isso este arquivo mede DUAS coisas:
 *  1. a semântica real do container: dois módulos diferentes que importam o `PandapeEntradaModule`
 *     recebem o MESMO objeto (provado com o DI de verdade, não deduzido);
 *  2. a fiação declarada: o `DiagnosticoModule` importa o módulo e NÃO redeclara o provider, e o
 *     `PandapeModule` (onde o worker vive) importa o mesmo módulo, senão "instância única" seria
 *     verdade entre dois lugares irrelevantes.
 */

@Global()
@Module({ providers: [{ provide: DRIZZLE, useValue: {} }], exports: [DRIZZLE] })
class BancoFalso {}

/**
 * O `@Inject` EXPLÍCITO não é preciosismo: o runner transpila com esbuild, que NÃO emite
 * `design:paramtypes`, então injeção por TIPO resolve `undefined` aqui dentro (no build real, com o
 * tsc, ela funciona). Sem o token explícito este teste passaria comparando `undefined` com
 * `undefined`, que é exatamente o falso verde que ele existe para não dar.
 */
@Injectable()
class ComoOWorkerLe {
  constructor(@Inject(PandapeNomeCacheService) readonly cache: PandapeNomeCacheService) {}
}

@Injectable()
class ComoODiagnosticoLe {
  constructor(@Inject(PandapeNomeCacheService) readonly cache: PandapeNomeCacheService) {}
}

@Module({ imports: [PandapeEntradaModule], providers: [ComoOWorkerLe] })
class ModuloDoWorker {}

@Module({ imports: [PandapeEntradaModule], providers: [ComoODiagnosticoLe] })
class ModuloDoDiagnostico {}

@Module({ imports: [BancoFalso, ModuloDoWorker, ModuloDoDiagnostico] })
class Raiz {}

/** Os `imports`/`providers` DECLARADOS de um módulo, lidos do metadado do Nest. */
function metadado(modulo: object, chave: "imports" | "providers"): unknown[] {
  return (Reflect.getMetadata(chave, modulo) as unknown[] | undefined) ?? [];
}

describe("fiação do cache de nomes: uma instância, não duas", () => {
  it("dois módulos que IMPORTAM o PandapeEntradaModule recebem o MESMO cache", async () => {
    const app = await NestFactory.createApplicationContext(Raiz, { logger: false });
    try {
      const doWorker = app.get(ComoOWorkerLe, { strict: false }).cache;
      const doDiagnostico = app.get(ComoODiagnosticoLe, { strict: false }).cache;

      expect(doWorker, "sem cache injetado o teste compararia undefined com undefined").toBeInstanceOf(
        PandapeNomeCacheService,
      );
      expect(doWorker).toBe(doDiagnostico);
      // E a prova que não depende de identidade de referência: o que um guarda, o outro lê.
      doWorker.guardar("PC-1", "Alan Turing");
      expect(doDiagnostico.ler("PC-1")).toBe("Alan Turing");
      expect(doDiagnostico.tamanho()).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("o DiagnosticoModule IMPORTA o módulo folha e NÃO redeclara o provider (a segunda instância)", () => {
    expect(metadado(DiagnosticoModule, "imports")).toContain(PandapeEntradaModule);
    expect(
      metadado(DiagnosticoModule, "providers"),
      "declarar o cache aqui cria uma SEGUNDA instância, e nada falha",
    ).not.toContain(PandapeNomeCacheService);
  });

  it("o PandapeModule (onde o worker preenche o cache) importa o MESMO módulo folha", () => {
    expect(metadado(PandapeModule, "imports")).toContain(PandapeEntradaModule);
    expect(metadado(PandapeModule, "providers")).not.toContain(PandapeNomeCacheService);
  });
});
