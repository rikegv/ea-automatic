import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { candidatos, salaEspera } from "../db/schema";
import { SalaEsperaService } from "./sala-espera.service";

/**
 * VÍNCULO DA SALA DE ESPERA (onda 3). O que estes testes provam, que é exatamente o que a operação
 * arrisca perder:
 *  - o registro SAI DA FILA junto com o vínculo (ponteiro + trilha, na mesma transação);
 *  - o telefone da Sala entra no candidato SÓ SE ELE ESTIVER SEM TELEFONE;
 *  - telefone já preenchido NÃO é sobrescrito, nem quando a Sala tem outro;
 *  - registro já vinculado é RECUSADO, então o mesmo candidato não é baixado duas vezes.
 *
 * O Drizzle é mockado com chains encadeáveis (mesmo padrão de `users.service.spec.ts`); o que
 * importa aqui é QUAL tabela recebeu escrita e com quê, não o SQL gerado.
 */

type Row = Record<string, unknown>;

function makeDb(opts: { reg: Row | null; adm: Row | null; candTelefone: string | null }) {
  const escritas: { tabela: unknown; set: Row }[] = [];
  const logs: Row[] = [];
  // Fila de leituras, na ordem em que o serviço as faz.
  const leituras: Row[][] = [
    opts.reg ? [opts.reg] : [],
    opts.adm ? [opts.adm] : [],
    [{ telefone: opts.candTelefone }],
  ];
  const select = () => ({
    from: () => ({ where: async () => leituras.shift() ?? [] }),
  });
  // O update devolve a linha atualizada, menos quando o serviço já barrou antes de chegar aqui.
  const update = (tabela: unknown) => ({
    set: (set: Row) => ({
      where: () => ({
        returning: async () => {
          escritas.push({ tabela, set });
          return [{ id: "sala-1", ...set }];
        },
      }),
    }),
  });
  const insert = () => ({
    values: async (v: Row) => {
      logs.push(v);
    },
  });
  const db = {
    select,
    update,
    insert,
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({ select, update, insert }),
  };
  return { db, escritas, logs };
}

const REG = {
  id: "sala-1",
  admissaoId: null,
  telefone: "11 98888-7777",
  origem: "CLIENTE",
  dataRecebimento: "2026-08-01",
};
const ADM = { id: "adm-1", candidatoCpf: "12345678909" };
const USER = { id: "user-1" } as never;

function servico(db: unknown) {
  return new SalaEsperaService(db as never);
}

describe("SalaEsperaService.vincular", () => {
  it("baixa o registro da fila gravando o ponteiro e a trilha", async () => {
    const { db, escritas, logs } = makeDb({ reg: REG, adm: ADM, candTelefone: null });
    await servico(db).vincular("sala-1", "adm-1", USER);

    const ponteiro = escritas.find((e) => e.tabela === salaEspera);
    expect(ponteiro?.set.admissaoId).toBe("adm-1");
    expect(ponteiro?.set.vinculadoEm).toBeInstanceOf(Date);
    expect(logs.some((l) => l.campo === "salaEspera")).toBe(true);
  });

  it("aplica o telefone da Sala quando o candidato está SEM telefone", async () => {
    const { db, escritas, logs } = makeDb({ reg: REG, adm: ADM, candTelefone: null });
    await servico(db).vincular("sala-1", "adm-1", USER);

    const noCandidato = escritas.find((e) => e.tabela === candidatos);
    expect(noCandidato?.set.telefone).toBe("11 98888-7777");
    const log = logs.find((l) => l.campo === "telefone");
    expect(log?.valorAnterior).toBeNull();
    expect(log?.valorNovo).toBe("11 98888-7777");
  });

  it("NÃO sobrescreve telefone já preenchido", async () => {
    const { db, escritas, logs } = makeDb({ reg: REG, adm: ADM, candTelefone: "11 3333-1111" });
    await servico(db).vincular("sala-1", "adm-1", USER);

    expect(escritas.some((e) => e.tabela === candidatos)).toBe(false);
    expect(logs.some((l) => l.campo === "telefone")).toBe(false);
    // O vínculo em si continua acontecendo: o telefone é acessório, não a razão do vínculo.
    expect(escritas.some((e) => e.tabela === salaEspera)).toBe(true);
  });

  it("não escreve telefone quando o registro da Sala não tem telefone", async () => {
    const { db, escritas } = makeDb({ reg: { ...REG, telefone: "  " }, adm: ADM, candTelefone: null });
    await servico(db).vincular("sala-1", "adm-1", USER);

    expect(escritas.some((e) => e.tabela === candidatos)).toBe(false);
  });

  it("recusa registro já vinculado, sem tocar em nada", async () => {
    const { db, escritas, logs } = makeDb({
      reg: { ...REG, admissaoId: "adm-outra" },
      adm: ADM,
      candTelefone: null,
    });
    await expect(servico(db).vincular("sala-1", "adm-1", USER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(escritas).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });
});
