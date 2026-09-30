import { describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import { VagasService } from "./vagas.service";
import type { CreateVagaDto } from "./vagas.dto";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import {
  catalogoDeStatusFingido,
  linhasDeStatusFingidas,
} from "../vaga-status/vaga-status-catalogo.fake";
import { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";

/**
 * ─ A DATA DE REALINHAMENTO DE PERFIL (item 4 da OST da Central de Vagas, migration 0138) ────────
 *
 * O PEDIDO DO DIRETOR: "quando o cliente definiu um perfil de candidato e depois pede um NOVO
 * ALINHAMENTO do perfil. É campo que o TIME PREENCHE A MÃO, o sistema não carimba sozinho."
 *
 * ┌─ O QUE ESTE ARQUIVO PROTEGE, E É UMA PERDA IRREVERSÍVEL ────────────────────────────────────┐
 * │ RECARIMBAR `data_alinhamento` FOI RECUSADO: sobrescrever apagaria PARA SEMPRE a data do       │
 * │ alinhamento ORIGINAL, que é o marco de quando o perfil foi combinado, e o pedido é            │
 * │ COMPARATIVO ("definiu um perfil E DEPOIS pediu outro"). A asserção que importa aqui é que as  │
 * │ DUAS pontas convivem, e que preencher uma não mexe na outra.                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `camposDaTrilha` é o mapeamento PURO do corpo para as colunas, e é ele que serve `create` E
 * `atualizar`: é por isso que basta uma linha lá para o campo valer na abertura e na edição. O `db`
 * nulo prova que nada aqui toca o banco.
 */
const service = new VagasService(
  null as unknown as Database,
  catalogoDeEtapasFingido() as never,
  catalogoDeStatusFingido() as never,
);

const REGUA = new ReguaDeStatusDaVaga(linhasDeStatusFingidas());

function campos(dto: Partial<CreateVagaDto>) {
  return (
    service as unknown as {
      camposDaTrilha: (
        r: ReguaDeStatusDaVaga,
        d: CreateVagaDto,
        s: string,
      ) => Record<string, unknown>;
    }
  ).camposDaTrilha(REGUA, { status: "RASCUNHO", ...dto } as CreateVagaDto, "RASCUNHO");
}

describe("a data de realinhamento é do time, e não recarimba o alinhamento", () => {
  it("grava as DUAS datas, cada uma na sua coluna", () => {
    const c = campos({ dataAlinhamento: "2026-03-10", dataRealinhamento: "2026-08-25" });
    expect(c.dataAlinhamento).toBe("2026-03-10");
    expect(c.dataRealinhamento).toBe("2026-08-25");
  });

  it("realinhar NÃO mexe na data do alinhamento original", () => {
    const c = campos({ dataAlinhamento: "2026-03-10", dataRealinhamento: "2026-09-01" });
    /*
     * ESTA É A ASSERÇÃO QUE JUSTIFICA A COLUNA NOVA. Se um dia alguém "simplificar" isto escrevendo o
     * realinhamento em `dataAlinhamento`, o marco original desaparece sem erro nenhum, e a pergunta
     * "quanto tempo depois o cliente pediu outro perfil" fica sem resposta para sempre.
     */
    expect(c.dataAlinhamento).not.toBe("2026-09-01");
  });

  it("ausente é NULO, e não string vazia", () => {
    // O `date` do Postgres recusa string vazia, e "em branco" é ausência, não valor.
    expect(campos({}).dataRealinhamento).toBeNull();
    expect(campos({ dataRealinhamento: "   " }).dataRealinhamento).toBeNull();
  });

  it("realinhamento sem alinhamento é aceito, porque o não bloqueio é regra da casa", () => {
    /*
     * §A.3 regra 5 (não bloqueio) e §A.4 F4: o sistema SINALIZA pendência, nunca impede o cadastro.
     * Exigir o alinhamento para aceitar o realinhamento inventaria uma trava que ninguém pediu, e o
     * caso é real: a vaga antiga pode nunca ter tido a primeira data preenchida.
     */
    const c = campos({ dataRealinhamento: "2026-09-01" });
    expect(c.dataRealinhamento).toBe("2026-09-01");
    expect(c.dataAlinhamento).toBeNull();
  });
});
