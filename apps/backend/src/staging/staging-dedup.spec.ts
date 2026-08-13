import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StagingService } from "./staging.service";

/**
 * A STAGING NÃO REGRAVA O MESMO CONTEÚDO (correção do bug de 13/08/2026).
 *
 * O CASO REAL: a marca que evita rebaixar do Pandapé só era gravada quando a auditoria da I.A
 * concluía. Enquanto ela não fechava, o ciclo de 12 minutos rebaixava os mesmos bytes e gravava um
 * arquivo novo a cada volta. Uma candidata que enviou 4 páginas de CTPS terminou com 104 arquivos,
 * 26 cópias de cada, e 241 MB de staging.
 *
 * ESTA É A TRAVA DIRETA: mesmo que a auditoria falhe 26 vezes, o disco fica com 4 arquivos.
 */

const svc = (dir: string) =>
  new StagingService({ get: () => dir } as never);

const arq = (conteudo: string, nome = "CTPS.pdf") => ({
  buffer: Buffer.from(conteudo),
  originalname: nome,
});

describe("gravação na staging", () => {
  it("mesmo conteúdo e mesmo tipo NÃO vira arquivo novo, e devolve o que já existe", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ea-staging-"));
    const s = svc(dir);

    const p1 = await s.salvar("adm-1", "CTPS", arq("pagina-1"));
    const p2 = await s.salvar("adm-1", "CTPS", arq("pagina-1"));

    expect(p2).toBe(p1);
    expect(await readdir(join(dir, "adm-1"))).toHaveLength(1);
  });

  /** O caso da Amália: 4 conteúdos, 26 ciclos. Tem de terminar em 4 arquivos, não 104. */
  it("26 ciclos com os MESMOS 4 arquivos deixam 4 na staging", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ea-staging-"));
    const s = svc(dir);

    for (let ciclo = 0; ciclo < 26; ciclo++) {
      for (const pagina of ["p1", "p2", "p3", "p4"]) {
        await s.salvar("adm-1", "CTPS", arq(pagina));
      }
    }

    expect(await readdir(join(dir, "adm-1"))).toHaveLength(4);
  });

  it("conteúdo DIFERENTE continua virando arquivo novo (a coleta certa não quebra)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ea-staging-"));
    const s = svc(dir);

    await s.salvar("adm-1", "CTPS", arq("frente"));
    await s.salvar("adm-1", "CTPS", arq("verso"));

    const nomes = await readdir(join(dir, "adm-1"));
    expect(nomes).toHaveLength(2);
    const conteudos = await Promise.all(
      nomes.map((n) => readFile(join(dir, "adm-1", n), "utf8")),
    );
    expect(conteudos.sort()).toEqual(["frente", "verso"]);
  });

  it("mesmo conteúdo em TIPO diferente é arquivo à parte: a comparação é por tipo", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ea-staging-"));
    const s = svc(dir);

    await s.salvar("adm-1", "CTPS", arq("mesma-imagem"));
    await s.salvar("adm-1", "RG", arq("mesma-imagem", "RG.pdf"));

    expect(await readdir(join(dir, "adm-1"))).toHaveLength(2);
  });

  it("admissões diferentes não se enxergam", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ea-staging-"));
    const s = svc(dir);

    await s.salvar("adm-1", "CTPS", arq("igual"));
    await s.salvar("adm-2", "CTPS", arq("igual"));

    expect(await readdir(join(dir, "adm-1"))).toHaveLength(1);
    expect(await readdir(join(dir, "adm-2"))).toHaveLength(1);
  });
});
