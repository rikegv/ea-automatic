import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";
import {
  CODIGO_ABERTURA,
  CODIGO_ENTREGA,
  MASTER,
  T0,
  VAGA,
  bancoDoReabrir,
  escritasEm,
  pessoa,
  portaDe,
  type BancoDoReabrir,
} from "./reabrir-vaga.tester-fake";

/**
 * ─ REABRIR A VAGA ENTREGUE: O CLIENTE REPROVOU (item 4 da OST da Central de Vagas, 0138) ────────
 *
 * O REQUISITO, do diretor, palavra por palavra:
 *   - a vaga estava ENTREGUE, o cliente voltou dizendo que REPROVOU, e o processo REABRE;
 *   - a SLA é REGRESSIVA, então reabrir NÃO "zera" nada: o modal PEDE uma Previsão De Entrega NOVA,
 *     e o prazo anterior fica guardado, para o relatório poder dizer "renegociou de X para Y";
 *   - a vaga volta para ABERTA com os candidatos em TRIAGEM, porque se o cliente reprovou o time
 *     precisa fazer NOVA TRIAGEM;
 *   - reabrir de FECHADA está FORA do escopo (decisão do diretor, frente futura).
 *
 * ┌─ O QUE ESTE ARQUIVO AFIRMA QUE OS OUTROS NÃO AFIRMAM ──────────────────────────────────────┐
 * │ A REGRESSÃO do caminho de CANCELAMENTO continua guardada onde sempre esteve, pelo contrato   │
 * │ executável do `tester` (`violacoesDoReabrir`, aplicado em                                     │
 * │ `vagas.reabrir.comportamental.spec.ts`), e este arquivo NÃO o duplica. O que ele afirma é o   │
 * │ caminho NOVO, e sobretudo a parte contraintuitiva dele: QUE O STATUS NÃO É ESCRITO A MÃO.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const servico = (banco: BancoDoReabrir, etapas: unknown = catalogoDeEtapasFingido()) =>
  new VagasService(banco.db as never, etapas as never, catalogoDeStatusFingido() as never);

const porta = (banco: BancoDoReabrir, etapas?: unknown) => portaDe(servico(banco, etapas));

/** O PRAZO QUE JÁ ESTAVA NA VAGA. É ele que tem de sobreviver, copiado, ao prazo novo. */
const PRAZO_ANTIGO = "2026-09-20";
const PRAZO_NOVO = "2026-11-30";

/**
 * A VAGA ENTREGUE COM GENTE COM O CLIENTE.
 *
 * `ENTREVISTA_CLIENTE` é a etapa marcada `entrega_ao_cliente` na semente (0130), e é ela que faz a
 * vaga ser ENTREGUE pela derivação. `APROVACAO` NÃO é etapa de entrega (medido no catálogo), e por
 * isso a Bia é o contraste: ela está viva na vaga e NÃO deve ser movida.
 */
function vagaEntregue() {
  const banco = bancoDoReabrir({
    status: CODIGO_ENTREGA,
    encerradaEm: null,
    pessoas: [
      pessoa("Ana", "ATIVO", { etapa: "ENTREVISTA_CLIENTE" }),
      pessoa("Bia", "ATIVO", { etapa: "APROVACAO" }),
      pessoa("Caio", "DESCARTADO", { etapa: "ENTREVISTA_CLIENTE" }),
    ],
  });
  banco.vaga.dataLimite = PRAZO_ANTIGO;
  return banco;
}

const atualizacoesDaVaga = (banco: BancoDoReabrir) =>
  escritasEm(banco, "vagas").filter((e) => e.tipo === "update");

const candidaturaDeNome = (banco: BancoDoReabrir, nome: string) =>
  banco.pessoas.find((p) => p.candidato.nome === nome)!.candidatura;

describe("a vaga ENTREGUE reabre, e a reabertura PEDE prazo novo", () => {
  it("recusa sem a previsão de entrega nova, e não grava nada", async () => {
    const banco = vagaEntregue();
    await expect(porta(banco).reabrir(VAGA, {}, MASTER)).rejects.toThrow(BadRequestException);
    /*
     * ZERO ESCRITAS, e não "quase nada": recusa que já escreveu não é recusa. Uma reabertura que
     * gravasse o carimbo e só depois cobrasse o prazo deixaria a vaga com data de reabertura e
     * prazo velho, que é exatamente o estado que esta frente existe para impedir.
     */
    expect(banco.escritas).toEqual([]);
    expect(banco.vaga.status).toBe(CODIGO_ENTREGA);
  });

  it("guarda o prazo ANTERIOR e passa a valer o NOVO", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.dataLimite).toBe(PRAZO_NOVO);
    expect(banco.vaga.dataLimiteAnterior).toBe(PRAZO_ANTIGO);
    expect(banco.vaga.reaberturaPorId).toBe(MASTER.id);
    // A DATA DA REABERTURA É O DIA DE HOJE NO FUSO DE SÃO PAULO, e não o do processo (que roda em
    // UTC): às 21h30 de um dia, o UTC já está no seguinte, e a renegociação ficaria datada errada.
    const hojeEmSp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(banco.vaga.dataReabertura).toBe(hojeEmSp);
  });

  it("a trilha diz de qual prazo para qual, porque a linha da vaga só guarda o último", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    const evento = banco.eventos.find((e) => e.para === CODIGO_ABERTURA && e.porId === MASTER.id);
    expect(evento, "a reabertura não gravou evento de trilha com autor").toBeTruthy();
    expect(String(evento!.observacao)).toContain(PRAZO_ANTIGO);
    expect(String(evento!.observacao)).toContain(PRAZO_NOVO);
    // §A.6: a trilha da vaga carrega CONTAGEM, nunca nome de candidato.
    expect(String(evento!.observacao)).not.toContain("Ana");
  });
});

describe("quem estava com o cliente volta para a TRIAGEM, e só quem estava", () => {
  it("move a candidatura viva da etapa de entrega, sem mexer na situação dela", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    const ana = candidaturaDeNome(banco, "Ana");
    expect(ana.etapa).toBe("TRIAGEM");
    /*
     * A SITUAÇÃO NÃO MUDA, e é a garantia central: o cliente reprovar é o LUGAR da pessoa mudando,
     * não o estado do processo dela. Escrever a situação aqui carimbaria um desfecho que não houve e,
     * em quem estava ALOCADO, mexeria na ocupação da vaga.
     */
    expect(ana.situacao).toBe("ATIVO");
  });

  it("não toca quem está viva FORA da etapa de entrega nem quem já saiu", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    const bia = candidaturaDeNome(banco, "Bia");
    expect(bia.etapa).toBe("APROVACAO");
    expect(Number(bia.atualizadoEm)).toBe(Number(T0));

    /*
     * O DESCARTADO NÃO É TOCADO, e isso é §A.6 e não arrumação: para quem está descartado o
     * `atualizado_em` É o relógio do expurgo, e qualquer escrita nele, inclusive um carimbo de
     * cortesia, EMPURRA o prazo de retenção do dado pessoal de alguém que já saiu.
     */
    const caio = candidaturaDeNome(banco, "Caio");
    expect(caio.etapa).toBe("ENTREVISTA_CLIENTE");
    expect(Number(caio.atualizadoEm)).toBe(Number(T0));
  });

  it("registra o movimento no histórico da pessoa, como MOVIMENTO e não como desfecho", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    const inseridas = escritasEm(banco, "as_candidatura_etapas");
    expect(inseridas).toHaveLength(1);
    const v = inseridas[0].valores;
    expect(v.etapaDe).toBe("ENTREVISTA_CLIENTE");
    expect(v.etapaPara).toBe("TRIAGEM");
    // `situacao` NULA é o que diz, na linha do tempo, que a pessoa andou no funil e NÃO saiu.
    expect(v.situacao).toBeNull();
    // O MARCADOR ESTRUTURAL: é por ele que se sabe quais voltas pertencem A ESTA reabertura.
    expect(v.vagaStatusEventoId).toBeTruthy();
  });

  it("recusa uma seleção PARCIAL em vez de completá-la em silêncio", async () => {
    const banco = bancoDoReabrir({
      status: CODIGO_ENTREGA,
      encerradaEm: null,
      pessoas: [
        pessoa("Ana", "ATIVO", { etapa: "ENTREVISTA_CLIENTE" }),
        pessoa("Dora", "ATIVO", { etapa: "ENTREVISTA_CLIENTE" }),
      ],
    });
    banco.vaga.dataLimite = PRAZO_ANTIGO;

    /*
     * DEIXAR UMA PESSOA NA ETAPA DE ENTREGA MANTÉM A VAGA ENTREGUE pela derivação: a reabertura
     * gravaria carimbo, prazo novo e trilha, e a vaga continuaria entregue. O sistema afirmaria uma
     * reabertura que não aconteceu, e isso é pior do que recusar.
     */
    await expect(
      porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO, candidaturaIds: ["cand-Ana"] }, MASTER),
    ).rejects.toThrow(ConflictException);
    expect(banco.escritas).toEqual([]);
  });

  it("recusa quando nenhuma etapa do funil é o destino da reabertura", async () => {
    const banco = vagaEntregue();
    // O CATÁLOGO SEM A TRIAGEM: sobra a etapa de entrega e nenhum destino para onde voltar.
    const semDestino = catalogoDeEtapasFingido([
      "CAPTACAO",
      "ENTREVISTA_SOULAN",
      "ENTREVISTA_CLIENTE",
      "APROVACAO",
    ]);
    await expect(
      porta(banco, semDestino).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER),
    ).rejects.toThrow(BadRequestException);
    expect(banco.escritas).toEqual([]);
  });
});

describe("o status NÃO é forçado a mão: quem devolve a vaga para ABERTA é a derivação", () => {
  it("a atualização da linha da vaga NÃO escreve `status`", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    const daReabertura = atualizacoesDaVaga(banco)[0];
    /*
     * ┌─ ESTA É A AFIRMAÇÃO CENTRAL DO ARQUIVO ────────────────────────────────────────────────┐
     * │ O status da vaga DERIVA de onde os candidatos estão desde a 0130. Tirar todo mundo da   │
     * │ etapa de entrega JÁ devolve a vaga para Aberta. Escrever `status` aqui criaria uma       │
     * │ SEGUNDA fonte da mesma resposta, e as duas divergiriam no primeiro caso que a derivação  │
     * │ tratasse diferente (alguém que sobrou numa etapa de entrega, uma etapa de entrega nova   │
     * │ que o diretor marque amanhã).                                                            │
     * └────────────────────────────────────────────────────────────────────────────────────────┘
     */
    expect(Object.keys(daReabertura.valores)).not.toContain("status");
    // E ela LIMPA o carimbo manual, sem o que a derivação não encostaria na vaga.
    expect(daReabertura.valores.statusManualEm).toBeNull();
  });

  it("mesmo assim a vaga termina em ABERTA, e o segundo update é o da derivação", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);

    const updates = atualizacoesDaVaga(banco);
    expect(updates.length, "a derivação não gravou o status depois da reabertura").toBe(2);
    expect(updates[1].valores.status).toBe(CODIGO_ABERTURA);

    /*
     * A DERIVAÇÃO GRAVA A PRÓPRIA TRILHA, e é ela a prova de que a vaga andou SOZINHA: o evento dela
     * não tem a narrativa da reabertura, tem a da derivação. São dois fatos (a DECISÃO de reabrir e o
     * MOVIMENTO do status), e não um repetido.
     */
    const eventos = banco.eventos.filter((e) => e.para === CODIGO_ABERTURA);
    expect(eventos.length).toBe(2);
  });

  it("a vaga ENTREGUE à mão também reabre, porque o carimbo manual é limpo antes da derivação", async () => {
    const banco = vagaEntregue();
    // ALGUÉM MOVEU O STATUS A MÃO: a derivação não encosta em vaga com este carimbo preenchido.
    banco.vaga.statusManualEm = T0;
    banco.vaga.statusManualPorId = MASTER.id;

    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.statusManualEm).toBeNull();
    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
  });
});

describe("o caminho da vaga CANCELADA não regride", () => {
  it("segue reabrindo SEM prazo novo, e sem tocar a previsão de entrega", async () => {
    // O cenário padrão do fake é a vaga CANCELADA (o `status` omitido usa o papel CANCELAMENTO).
    const banco = bancoDoReabrir({ pessoas: [], eventos: [] });
    const prazoQueEstava = banco.vaga.dataLimite;

    await porta(banco).reabrir(VAGA, {}, MASTER);

    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
    expect(banco.vaga.dataLimite).toBe(prazoQueEstava);
    /*
     * O PRAZO ANTERIOR SÓ É COPIADO QUANDO HÁ PRAZO NOVO PARA SUBSTITUÍ-LO: gravar a cópia sem a
     * substituição afirmaria uma renegociação que não houve, e o relatório leria "de X para X".
     */
    expect(banco.vaga.dataLimiteAnterior).toBeNull();
    // O CARIMBO DA REABERTURA VALE PARA OS DOIS CAMINHOS: reabriu é reabriu.
    expect(banco.vaga.reaberturaPorId).toBe(MASTER.id);
    expect(banco.vaga.dataReabertura).toBeTruthy();
  });

  it("aceita o prazo novo quando a tela mandar, com o anterior guardado do mesmo jeito", async () => {
    const banco = bancoDoReabrir({ pessoas: [], eventos: [] });
    const prazoQueEstava = banco.vaga.dataLimite;

    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.dataLimite).toBe(PRAZO_NOVO);
    expect(banco.vaga.dataLimiteAnterior).toBe(prazoQueEstava);
  });
});
