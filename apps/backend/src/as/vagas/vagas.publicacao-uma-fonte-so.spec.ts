import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import {
  bancoFingidoDeStatus,
  semente,
  standBy,
} from "../vaga-status/vaga-status.fake-db";
import { VagaStatusController } from "../vaga-status/vaga-status.controller";
import {
  VagaStatusService,
  type ReguaDeStatusDaVaga,
} from "../vaga-status/vaga-status.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ O DEFEITO VIVO QUE ESTA FRENTE MATA: DUAS LISTAS PARA A MESMA PERGUNTA ──────────────────────
 *
 * ┌─ O QUE ACONTECIA EM PRODUÇÃO, e é o tipo de defeito que ninguém consegue "consertar" ────────┐
 * │ A TELA OFERECIA "Entregue" NO SELETOR DE PUBLICAÇÃO e o backend recusava com 400. Não era    │
 * │ descuido de quem escreveu a tela: as duas listas respondiam a MESMA pergunta ("qual status a │
 * │ publicação pode gravar?") por CAMINHOS OPOSTOS. A da tela era uma PROIBIÇÃO (tira daqui o    │
 * │ que não pode) e a do backend era uma PERMISSÃO (só passa o que está aqui), e duas listas em  │
 * │ direções contrárias concordam por coincidência até alguém mexer em uma delas.                │
 * │                                                                                             │
 * │ ARRUMAR A TELA NÃO RESOLVERIA: sobrariam DUAS listas, e a próxima divergência viria do outro │
 * │ lado. O conserto é haver UMA FONTE, e ela agora existe: o flag `daTrilha` do catálogo, que a │
 * │ leitura pública devolve e que a guarda do service consulta. A mesma coluna, lida pelos dois. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ARQUIVO AFIRMA A COINCIDÊNCIA COMO PROPRIEDADE, e não caso a caso: para CADA linha que a
 * leitura pública devolve, a resposta do flag e a decisão da guarda são a MESMA. Um status novo
 * entra sozinho nesta prova, que é o ponto inteiro de existir uma fonte só.
 */

function montar(status = semente()) {
  const banco = bancoFingidoDeStatus({ status });
  const catalogo = new VagaStatusService(banco.db as Database);
  const leitura = new VagaStatusController(catalogo);
  const vagas = new VagasService(
    null as unknown as Database,
    catalogoDeEtapasFingido() as never,
    catalogo as never,
  );
  return { catalogo, leitura, vagas };
}

/** A guarda da publicação, chamada direto: é ela que decide o que a trilha de abertura grava. */
async function aceita(vagas: VagasService, regua: ReguaDeStatusDaVaga, codigo: string) {
  try {
    (
      vagas as unknown as {
        travaStatusDaTrilha: (r: ReguaDeStatusDaVaga, p: string, d: string) => string;
      }
    ).travaStatusDaTrilha(regua, codigo, "ABERTURA");
    return true;
  } catch (e) {
    expect(e, "a recusa da publicação é 400, não 500").toBeInstanceOf(BadRequestException);
    return false;
  }
}

describe("a tela e o backend leem a MESMA coluna para decidir o que a publicação grava", () => {
  it("a leitura pública devolve o flag `daTrilha` em toda linha, que é o que a tela precisa", async () => {
    const { leitura } = montar();
    const lista = await leitura.listar("1");

    expect(lista.length, "sem lista não há seletor").toBeGreaterThan(0);
    for (const s of lista) {
      expect(typeof s.daTrilha, `${s.codigo} sem o flag deixaria a tela adivinhando`).toBe("boolean");
    }
  });

  it("para CADA status do catálogo, o flag e a guarda dizem a MESMA coisa", async () => {
    const { catalogo, leitura, vagas } = montar();
    const regua = await catalogo.regua();
    const lista = await leitura.listar("1");

    for (const s of lista) {
      const oferecido = s.daTrilha && s.ativo;
      expect(
        await aceita(vagas, regua, s.codigo),
        `${s.codigo}: a tela oferece ${oferecido} e o backend precisa concordar`,
      ).toBe(oferecido);
    }
  });

  /**
   * O CASO EXATO DO DEFEITO, encenado: "Entregue" é o status que a tela oferecia e o backend
   * recusava. Hoje o flag dele é FALSO na fonte única, então a tela que ler o catálogo não o
   * oferece, e o backend continua recusando pelo MESMO dado. Os dois lados discordarem voltou a ser
   * impossível, e não apenas improvável.
   */
  it("`ENTREGUE` sai da leitura marcado como NÃO publicável, e a guarda recusa pelo mesmo motivo", async () => {
    const { catalogo, leitura, vagas } = montar();
    const regua = await catalogo.regua();
    const entregue = (await leitura.listar("1")).find((s) => s.codigo === "ENTREGUE");

    expect(entregue?.daTrilha, "a tela lê daqui para montar o seletor de publicação").toBe(false);
    expect(await aceita(vagas, regua, "ENTREGUE")).toBe(false);
  });

  it("`RASCUNHO` e `ABERTA` continuam publicáveis nos dois lados, que é o comportamento de hoje", async () => {
    const { catalogo, leitura, vagas } = montar();
    const regua = await catalogo.regua();
    const lista = await leitura.listar("1");

    for (const codigo of ["RASCUNHO", "ABERTA"]) {
      expect(lista.find((s) => s.codigo === codigo)?.daTrilha).toBe(true);
      expect(await aceita(vagas, regua, codigo)).toBe(true);
    }
  });

  /**
   * A PROVA DE QUE A FONTE É MESMO UMA SÓ: mexer no dado move OS DOIS LADOS juntos. Se ainda
   * houvesse uma lista escrita na tela ou no domínio, este teste ficaria vermelho de um dos dois
   * lados, que é exatamente a divergência que o defeito era.
   */
  it("o diretor liga o flag num status do diretor, e os dois lados passam a oferecê-lo", async () => {
    const { catalogo, leitura, vagas } = montar([...semente(), standBy()]);

    expect(await aceita(vagas, await catalogo.regua(), "STAND_BY")).toBe(false);

    await catalogo.atualizar(90, { daTrilha: true });

    const lista = await leitura.listar("1");
    expect(lista.find((s) => s.codigo === "STAND_BY")?.daTrilha).toBe(true);
    expect(await aceita(vagas, await catalogo.regua(), "STAND_BY")).toBe(true);
  });

  /**
   * O INATIVO NÃO É OFERECIDO E NÃO É ACEITO, e as duas metades são a mesma decisão: status fora de
   * circulação não recebe vaga nova, ou a publicação criaria o status fantasma pela porta da frente.
   */
  it("status INATIVO some da leitura padrão e continua recusado pela guarda", async () => {
    const { catalogo, leitura, vagas } = montar([
      ...semente(),
      standBy({ daTrilha: true, ativo: false }),
    ]);

    expect((await leitura.listar()).some((s) => s.codigo === "STAND_BY")).toBe(false);
    expect(await aceita(vagas, await catalogo.regua(), "STAND_BY")).toBe(false);
  });
});
