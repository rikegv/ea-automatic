import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import {
  bancoFingidoDeStatus,
  semente,
  standBy,
  type BancoFingidoDeStatus,
} from "./vaga-status.fake-db";
import { VagaStatusService } from "./vaga-status.service";

/**
 * ─ TIRAR UM STATUS DE CIRCULAÇÃO: AS TRÊS CAMADAS, E A TRAVA DE PAPEL ANTES DELAS ───────────────
 *
 * ┌─ POR QUE O APAGAR TEM CAMADAS, e não um `DELETE` com um `if` ────────────────────────────────┐
 * │ 1. TEM VAGA NO STATUS: RECUSA, COM O NÚMERO NA FRASE. O número diz o TAMANHO DO TRABALHO:    │
 * │    mover 3 é agora, mover 40 é outra conversa. E ninguém é movido automaticamente: "apagar o │
 * │    Stand By manda todo mundo para Aberta" é irreversível, silencioso, e escreveria na trilha │
 * │    de cada vaga um movimento que ninguém decidiu.                                            │
 * │ 2. NINGUÉM AGORA, MAS HÁ TRILHA: NÃO APAGA, INATIVA. Alguma vaga JÁ PASSOU por ali, e os     │
 * │    eventos apontam para o código nos dois lados. O status some dos seletores e continua       │
 * │    resolvendo o rótulo da linha do tempo. Pela FK RESTRICT, nem por SQL cru alguém apaga.     │
 * │ 3. ZERO E ZERO: APAGA DE VERDADE. É o caso do primeiro dia, o "Stand By" digitado errado.    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CAMADA 1 VALE PARA O `inativar` TAMBÉM, e essa é a decisão do diretor de 10/09 sobre as etapas
 * aplicada a este catálogo desde o nascimento: inativar um status CHEIO produz o STATUS FANTASMA,
 * com vagas apontando para um código que sumiu do seletor, do filtro e da tela. Elas não param de
 * existir, param de ser ALCANÇÁVEIS, e é pior do que apagar porque nada falha.
 *
 * §A.6: as contagens da recusa são NÚMEROS. Nenhum id de vaga, nenhum nome, nenhum CPF.
 */

function servico(banco: BancoFingidoDeStatus): VagaStatusService {
  return new VagaStatusService(banco.db as Database);
}

function frase(e: unknown): string {
  const r = (e as BadRequestException)?.getResponse?.() as { message?: string } | undefined;
  return String(r?.message ?? (e as Error)?.message ?? "");
}

const vaga = (id: string, status: string) => ({ id, status });
const evento = (de: string | null, para: string) => ({
  id: `ev-${de ?? "x"}-${para}`,
  vagaId: "vaga-1",
  de,
  para,
});

describe("camada 1: status com vaga dentro não sai de circulação", () => {
  it("o `remover` recusa, diz QUANTAS vagas estão lá, e a linha continua no catálogo", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy()],
      vagas: [vaga("v1", "STAND_BY"), vaga("v2", "STAND_BY"), vaga("v3", "ABERTA")],
    });

    const erro = await servico(banco).remover(90).catch((e) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    // DUAS, e não três: a vaga em ABERTA não está neste status, e a contagem precisa saber disso.
    expect(frase(erro)).toContain("2 vagas");
    expect(frase(erro)).toContain("antes de remover");
    expect(banco.estado.status.some((s) => s.codigo === "STAND_BY")).toBe(true);
  });

  it("o `inativar` recusa pela MESMA régua, com o verbo trocado na frase", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy()],
      vagas: [vaga("v1", "STAND_BY")],
    });

    const erro = await servico(banco).inativar(90).catch((e) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(frase(erro)).toContain("1 vaga está");
    expect(frase(erro)).toContain("antes de inativar");
    expect(banco.estado.status.find((s) => s.codigo === "STAND_BY")?.ativo).toBe(true);
  });

  /**
   * O STATUS JÁ INATIVO COM VAGA DENTRO É O FANTASMA EM SI, e ele é recusado nos dois verbos. Sem
   * esta linha, o estado mais quebrado seria o único que passa sem reclamar.
   */
  it("o status JÁ INATIVO com vaga dentro continua sendo recusado", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy({ ativo: false })],
      vagas: [vaga("v1", "STAND_BY")],
    });

    const erro = await servico(banco).inativar(90).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(frase(erro)).toContain("1 vaga está");
  });

  it("status VAZIO não é recusado só porque existem vagas em OUTROS status", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy()],
      vagas: [vaga("v1", "ABERTA"), vaga("v2", "FECHADA")],
    });

    const r = await servico(banco).remover(90);
    expect(r.removido).toBe(true);
    expect(banco.estado.status.some((s) => s.codigo === "STAND_BY")).toBe(false);
  });
});

describe("camada 2: quem tem trilha é INATIVADO, nunca apagado", () => {
  it("com evento apontando para o status, a linha FICA e sai de circulação", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy()],
      eventos: [evento("ABERTA", "STAND_BY")],
    });

    const r = await servico(banco).remover(90);

    expect(r).toMatchObject({ removido: false, inativado: true });
    // A FRASE PRECISA DIZER O PORQUÊ, senão vira chamado de "o botão apagar não funciona".
    expect(r.mensagem).toContain("vagas que já passaram por ele");
    expect(banco.estado.status.find((s) => s.codigo === "STAND_BY")?.ativo).toBe(false);
  });

  it("o evento conta pelos DOIS lados: sair do status também é ter passado por ele", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy()],
      eventos: [evento("STAND_BY", "ABERTA")],
    });

    const r = await servico(banco).remover(90);
    expect(r.inativado).toBe(true);
    expect(banco.estado.status.some((s) => s.codigo === "STAND_BY")).toBe(true);
  });

  it("evento de OUTRO status não segura este apagar", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy()],
      eventos: [evento("ABERTA", "RASCUNHO")],
    });

    const r = await servico(banco).remover(90);
    expect(r.removido).toBe(true);
  });

  it("quem já estava inativo e tem trilha recebe a resposta de concordância, sem erro", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy({ ativo: false })],
      eventos: [evento(null, "STAND_BY")],
    });

    const r = await servico(banco).remover(90);
    expect(r).toMatchObject({ removido: false, inativado: true });
    expect(r.mensagem).toContain("já estava inativo");
  });
});

describe("a trava de papel vem ANTES das três camadas", () => {
  it.each(["RASCUNHO", "ABERTA", "ENTREGUE", "FECHADA", "CANCELADA"])(
    "não apaga %s, e a frase diz QUAL papel ele exerce",
    async (codigo) => {
      const banco = bancoFingidoDeStatus({ status: semente() });
      const alvo = banco.estado.status.find((s) => s.codigo === codigo)!;

      const erro = await servico(banco).remover(alvo.id).catch((e) => e);

      expect(erro).toBeInstanceOf(BadRequestException);
      expect(frase(erro)).toContain(alvo.papel);
      expect(banco.estado.status.some((s) => s.codigo === codigo)).toBe(true);
    },
  );

  /**
   * A RECUSA VEM ANTES DA CONTAGEM, e isso é medível: um status de sistema com MIL vagas dentro nem
   * chega a ser contado. Sem esta ordem, a frase falaria do número de vagas em vez de falar do
   * papel, e mandaria a pessoa esvaziar o status para depois recusar de novo pelo motivo de verdade.
   */
  it("nem consulta a tabela de vagas para recusar uma linha de sistema", async () => {
    const banco = bancoFingidoDeStatus({ status: semente(), vagas: [vaga("v1", "FECHADA")] });
    const alvo = banco.estado.status.find((s) => s.codigo === "FECHADA")!;

    await servico(banco).remover(alvo.id).catch(() => null);

    expect(banco.consultas.some((c) => c.tabela === "vagas")).toBe(false);
  });

  it("o `inativar` de uma linha de sistema é recusado pelo mesmo caminho", async () => {
    const banco = bancoFingidoDeStatus({ status: semente() });
    const aberta = banco.estado.status.find((s) => s.codigo === "ABERTA")!;

    const erro = await servico(banco).inativar(aberta.id).catch((e) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(banco.estado.status.find((s) => s.codigo === "ABERTA")?.ativo).toBe(true);
  });
});

describe("o PATCH descarta o que não vale para a linha, em vez de recusar o corpo inteiro", () => {
  /**
   * O CORPO COM UM FLAG A MAIS É A TELA VELHA DE ALGUÉM, não um ataque: recusar a requisição faria
   * "renomear Entregue" falhar por causa de um campo que a tela nem devia ter mandado. O que não
   * pode é o flag ENTRAR, e é isso que se afirma aqui, campo a campo.
   */
  it("na linha de SISTEMA aplica rótulo, ordem e tom, e IGNORA os três flags", async () => {
    const banco = bancoFingidoDeStatus({ status: semente() });
    const entregue = banco.estado.status.find((s) => s.codigo === "ENTREGUE")!;

    await servico(banco).atualizar(entregue.id, {
      rotulo: "Preenchida",
      ordem: 9,
      tom: "in",
      recebeCandidato: true,
      daTrilha: true,
      movivelManualmente: true,
    });

    const depois = banco.estado.status.find((s) => s.codigo === "ENTREGUE")!;
    expect(depois.rotulo).toBe("Preenchida");
    expect(depois.ordem).toBe(9);
    expect(depois.tom).toBe("in");
    // OS TRÊS QUE NÃO PODEM TER ENTRADO, e cada um tem um dano próprio: alocação em vaga encerrada,
    // a trilha de abertura publicando direto no terminal, e a terceira porta para o encerramento.
    expect(depois.recebeCandidato).toBe(false);
    expect(depois.daTrilha).toBe(false);
    expect(depois.movivelManualmente).toBe(false);
    // E O CÓDIGO NÃO SE MEXE: é ele que está gravado em toda vaga entregue do histórico.
    expect(depois.codigo).toBe("ENTREGUE");
  });

  it("na linha do DIRETOR os três flags valem, porque é a lista dele", async () => {
    const banco = bancoFingidoDeStatus({ status: [...semente(), standBy()] });

    await servico(banco).atualizar(90, {
      recebeCandidato: true,
      daTrilha: true,
      movivelManualmente: false,
    });

    const depois = banco.estado.status.find((s) => s.codigo === "STAND_BY")!;
    expect(depois).toMatchObject({
      recebeCandidato: true,
      daTrilha: true,
      movivelManualmente: false,
      papel: "LIVRE",
    });
  });

  /**
   * O CORPO QUE SÓ TRAZIA FLAGS DE UMA LINHA DE SISTEMA NÃO ESCREVE NADA, e devolver a linha como
   * está é o que a tela precisa para se corrigir sozinha. Um `UPDATE` vazio mexeria no
   * `atualizado_em` de uma linha que ninguém mudou.
   */
  it("corpo que sobrou vazio depois do descarte não grava nada", async () => {
    const banco = bancoFingidoDeStatus({ status: semente() });
    const fechada = banco.estado.status.find((s) => s.codigo === "FECHADA")!;

    const r = await servico(banco).atualizar(fechada.id, { recebeCandidato: true });

    expect(r.codigo).toBe("FECHADA");
    expect(banco.estado.status.find((s) => s.codigo === "FECHADA")?.recebeCandidato).toBe(false);
  });
});

describe("criar: o código sai do rótulo, e recriar um inativo manda REATIVAR", () => {
  it("cria um status do diretor com os flags de nascimento", async () => {
    const banco = bancoFingidoDeStatus({ status: semente() });

    const criado = await servico(banco).criar({ rotulo: "Stand By" });

    expect(criado.codigo).toBe("STAND_BY");
    expect(criado.papel).toBe("LIVRE");
    // ENCERRA FALSO É OBRIGATÓRIO (CHECK 1 do banco, e a regra do diretor). `daTrilha` falso é
    // fail-closed. `movivelManualmente` verdadeiro porque é a ÚNICA porta de entrada dele: nascer
    // não-movível seria nascer inalcançável.
    expect(criado.encerra).toBe(false);
    expect(criado.daTrilha).toBe(false);
    expect(criado.movivelManualmente).toBe(true);
    expect(criado.ordem).toBe(6);
  });

  it("recusa recriar um código que existe INATIVO, e a frase manda reativar", async () => {
    const banco = bancoFingidoDeStatus({ status: [...semente(), standBy({ ativo: false })] });

    const erro = await servico(banco).criar({ rotulo: "Stand By" }).catch((e) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(frase(erro)).toContain("Reative-o");
    expect(banco.estado.status.filter((s) => s.codigo === "STAND_BY")).toHaveLength(1);
  });

  it("recusa recriar um código ATIVO com a frase curta", async () => {
    const banco = bancoFingidoDeStatus({ status: [...semente(), standBy()] });
    const erro = await servico(banco).criar({ rotulo: "Stand By" }).catch((e) => e);
    expect(frase(erro)).toContain("Já existe um status com esse nome");
  });

  it("recusa rótulo sem letra nem número, em vez de gravar um código vazio", async () => {
    const banco = bancoFingidoDeStatus({ status: semente() });
    const erro = await servico(banco).criar({ rotulo: "!!!" }).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(banco.estado.status).toHaveLength(5);
  });
});

/**
 * ─ O CACHE INVALIDA EM TODA ESCRITA, e é isso que o torna correto ──────────────────────────────
 *
 * AQUI O ERRO DO CACHE NÃO CAI PARA O LADO INÓCUO, ao contrário do catálogo de etapas: `encerra` e
 * `recebeCandidato` são TRAVAS, então servir por 60 segundos um código cujo flag acabou de ser
 * desligado é aceitar candidato em vaga que não recebe. Quem segura a correção é a invalidação
 * imediata, e não o relógio.
 */
describe("o cache não sobrevive à própria escrita", () => {
  it("a leitura seguinte a uma criação já enxerga o status novo", async () => {
    const banco = bancoFingidoDeStatus({ status: semente() });
    const svc = servico(banco);

    await svc.listar(true);
    await svc.criar({ rotulo: "Stand By" });

    expect((await svc.listar(true)).map((s) => s.codigo)).toContain("STAND_BY");
  });

  it("a régua seguinte a uma edição já responde com o flag novo", async () => {
    const banco = bancoFingidoDeStatus({ status: [...semente(), standBy()] });
    const svc = servico(banco);

    expect((await svc.regua()).recebeCandidato("STAND_BY")).toBe(false);
    await svc.atualizar(90, { recebeCandidato: true });

    expect((await svc.regua()).recebeCandidato("STAND_BY")).toBe(true);
  });

  it("a inativação some da lista padrão na leitura seguinte", async () => {
    const banco = bancoFingidoDeStatus({ status: [...semente(), standBy()] });
    const svc = servico(banco);

    await svc.listar();
    await svc.inativar(90);

    expect((await svc.listar()).map((s) => s.codigo)).not.toContain("STAND_BY");
    expect((await svc.listar(true)).map((s) => s.codigo)).toContain("STAND_BY");
  });
});

/** §A.11: travessão é proibido em todo texto que chega ao usuário, recusa incluída. */
describe("§A.11: nenhuma frase de recusa usa travessão", () => {
  it("as recusas do catálogo saem sem o glifo", async () => {
    const banco = bancoFingidoDeStatus({
      status: [...semente(), standBy()],
      vagas: [vaga("v1", "STAND_BY")],
    });
    const svc = servico(banco);

    const frases = [
      frase(await svc.remover(90).catch((e) => e)),
      frase(await svc.inativar(90).catch((e) => e)),
      frase(await svc.remover(1).catch((e) => e)),
      frase(await svc.criar({ rotulo: "Aberta" }).catch((e) => e)),
    ];

    for (const f of frases) {
      expect(f.length, "a recusa precisa dizer alguma coisa").toBeGreaterThan(0);
      expect(f).not.toContain("—");
    }
  });
});
