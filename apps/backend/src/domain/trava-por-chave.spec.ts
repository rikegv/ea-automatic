import { describe, expect, it } from "vitest";
import { TravaPorChave } from "./trava-por-chave";

/** Espera curta para intercalar as execuções no teste. */
const respirar = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/**
 * OST da duplicação, item 4. A corrida provada no acervo: duas execuções da MESMA admissão rodando
 * juntas, as duas procurando a pasta, as duas criando. A trava é o que impede a segunda de começar
 * antes de a primeira terminar (e, portanto, antes de o link existir para ancorar).
 */
describe("TravaPorChave", () => {
  it("duas execuções na MESMA chave não se sobrepõem", async () => {
    const trava = new TravaPorChave();
    const eventos: string[] = [];
    const tarefa = (nome: string) => async () => {
      eventos.push(`${nome}:entrou`);
      await respirar();
      eventos.push(`${nome}:saiu`);
    };

    await Promise.all([trava.executar("adm-1", tarefa("A")), trava.executar("adm-1", tarefa("B"))]);

    expect(eventos).toEqual(["A:entrou", "A:saiu", "B:entrou", "B:saiu"]);
  });

  it("chaves DIFERENTES continuam rodando em paralelo (a trava não serializa o sistema)", async () => {
    const trava = new TravaPorChave();
    const eventos: string[] = [];
    const tarefa = (nome: string) => async () => {
      eventos.push(`${nome}:entrou`);
      await respirar();
      eventos.push(`${nome}:saiu`);
    };

    await Promise.all([trava.executar("adm-1", tarefa("A")), trava.executar("adm-2", tarefa("B"))]);

    expect(eventos.slice(0, 2).sort()).toEqual(["A:entrou", "B:entrou"]);
  });

  it("falha de uma execução não trava a fila da chave", async () => {
    const trava = new TravaPorChave();
    const quebrou = trava.executar("adm-1", async () => {
      throw new Error("falhou");
    });
    const depois = trava.executar("adm-1", async () => "passou");

    await expect(quebrou).rejects.toThrow("falhou");
    await expect(depois).resolves.toBe("passou");
  });

  it("a segunda execução enxerga o que a primeira gravou", async () => {
    // É exatamente o que faz a âncora funcionar: quando B roda, o link de A já existe.
    const trava = new TravaPorChave();
    const estado: { link: string | null } = { link: null };
    let vistoPorB: string | null = "ainda não rodou";

    await Promise.all([
      trava.executar("adm-1", async () => {
        await respirar();
        estado.link = "PASTA-DA-PRIMEIRA";
      }),
      trava.executar("adm-1", async () => {
        vistoPorB = estado.link;
      }),
    ]);

    expect(vistoPorB).toBe("PASTA-DA-PRIMEIRA");
  });

  it("não deixa a memória crescer: a chave sai do mapa quando a fila esvazia", async () => {
    const trava = new TravaPorChave();
    await Promise.all([
      trava.executar("adm-1", async () => respirar()),
      trava.executar("adm-1", async () => respirar()),
      trava.executar("adm-2", async () => respirar()),
    ]);
    expect(trava.tamanho).toBe(0);
  });
});
