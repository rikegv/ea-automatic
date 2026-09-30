import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { menuDaOperacao } from "../../domain/menus";
import { IngestaoDivergenciasService } from "./ingestao-divergencias.service";
import { bancoFingido, consultaQueCasa } from "./ingestao-repositorio.tester-fake";

/**
 * ─ A FILA DE DIVERGENCIAS: AS DUAS SAIDAS, E A DIFERENCA E DE PROCEDENCIA ──────────────────────
 *
 * `MANTIDO_EA` fecha a linha e não escreve nada no dado. `ADOTADO_ATS` aplica o valor pelo CAMINHO
 * HUMANO normal (`moverEtapa`, `alocar`, `editarPosicoes`), com autor, trilha e derivação de status.
 *
 * O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR: que alguém "simplifique" o `ADOTADO_ATS` para um `update`
 * na coluna. Aquilo daria o valor certo com a PROCEDENCIA ERRADA, que é letra por letra o defeito que
 * a fila existe para matar (dado trocado sem autor, sem data e sem trilha).
 *
 * §A.6: nada de dado real, e nada vai a log. Os valores são códigos de etapa sintéticos.
 */

const DIV = "00000000-0000-4000-8000-0000000000d1";
const CANDIDATURA = "00000000-0000-4000-8000-0000000000c1";
const CANDIDATO = "00000000-0000-4000-8000-0000000000c0";
const VAGA = "00000000-0000-4000-8000-0000000000a1";
const AUTOR = "00000000-0000-4000-8000-0000000000u1";

function montar(linha: Record<string, unknown>) {
  const banco = bancoFingido([
    { quando: /from as_ingestao_divergencias where id =/, devolve: [linha] },
    { quando: /from as_ingestao_divergencias\s*$|count\(\*\) filter/, devolve: [] },
    { quando: /select candidato_id from as_candidaturas/, devolve: [{ candidato_id: CANDIDATO }] },
    { quando: /select posicoes_banco from vagas/, devolve: [{ posicoes_banco: 1 }] },
    { quando: /update as_ingestao_divergencias/, devolve: [{ id: DIV }] },
    { quando: /from as_ingestao_divergencias d/, devolve: [{ ...linha, resolvido_em: new Date() }] },
  ]);
  const candidatos = {
    moverEtapa: vi.fn().mockResolvedValue({}),
    trocarVaga: vi.fn().mockResolvedValue({}),
    /*
     * `alocar` FICA NO DUBLE DE PROPOSITO, E ESPERA-SE QUE NUNCA SEJA CHAMADA. Ela era o caminho da
     * primeira versão, e foi VETADA (V3 do `seguranca`): mantê-la espionável é o que permite afirmar a
     * AUSENCIA. Sem o espião, trocar `trocarVaga` por `alocar` num refactor futuro não ficaria
     * vermelho em lugar nenhum, e a duplicata voltaria pelo mesmo caminho.
     */
    alocar: vi.fn().mockResolvedValue({}),
  };
  const vagas = { editarPosicoes: vi.fn().mockResolvedValue({}) };
  const servico = new IngestaoDivergenciasService(banco.db, candidatos as never, vagas as never);
  return { servico, banco, candidatos, vagas };
}

/** Uma linha aberta de escopo CANDIDATURA, no campo dado. */
function aberta(campo: string, valorAts: string | null): Record<string, unknown> {
  return {
    id: DIV,
    escopo: campo.startsWith("vaga_") && campo !== "vaga_do_candidato" ? "VAGA" : "CANDIDATURA",
    campo,
    valor_ea: "VALOR-DO-EA",
    valor_ats: valorAts,
    candidatura_id: campo.startsWith("vaga_") && campo !== "vaga_do_candidato" ? null : CANDIDATURA,
    vaga_id: VAGA,
    ocorrencias: 3,
    primeira_em: new Date(),
    ultima_em: new Date(),
    resolvido_em: null,
    decisao: null,
  };
}

describe("MANTER O EA", () => {
  it("fecha a linha com `MANTIDO_EA` e NAO escreve nada no dado", async () => {
    const { servico, banco, candidatos, vagas } = montar(aberta("etapa", "CAPTACAO"));
    await servico.manterEa(DIV, AUTOR);

    /*
     * O QUE ISTO PROVA: manter o EA é decisão de NÃO escrever. Nenhum caminho humano é acionado e
     * nenhuma coluna de candidatura ou de vaga é tocada, o que é o que torna esta saída barata e
     * reversível (a divergência volta na próxima passada se o ATS insistir, com `ocorrencias` maior).
     */
    expect(candidatos.moverEtapa).not.toHaveBeenCalled();
    expect(candidatos.alocar).not.toHaveBeenCalled();
    expect(vagas.editarPosicoes).not.toHaveBeenCalled();
    expect(consultaQueCasa(banco.consultas, /update\s+as_candidaturas/)).toBeNull();
    expect(consultaQueCasa(banco.consultas, /update\s+vagas/)).toBeNull();

    const fechamento = consultaQueCasa(banco.consultas, /update as_ingestao_divergencias/);
    expect(fechamento).toContain("resolvido_em = now()");
    expect(fechamento).toContain("decisao =");
    // O `where resolvido_em is null` FECHA A CORRIDA de dois consultores clicando ao mesmo tempo: o
    // segundo não reescreve a decisão do primeiro.
    expect(fechamento).toContain("resolvido_em is null");
  });

  it("linha JA RESOLVIDA volta 409, e não é fechada de novo", async () => {
    const { servico, banco } = montar({ ...aberta("etapa", "CAPTACAO"), resolvido_em: new Date() });
    await expect(servico.manterEa(DIV, AUTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(consultaQueCasa(banco.consultas, /update as_ingestao_divergencias/)).toBeNull();
  });
});

describe("ADOTAR O ATS: pelo caminho humano, nunca escrevendo a coluna", () => {
  it("`etapa` vai por `moverEtapa`, com o autor da sessão", async () => {
    const { servico, banco, candidatos } = montar(aberta("etapa", "ENTREVISTA_CLIENTE"));
    await servico.adotarAts(DIV, AUTOR);
    /*
     * O QUE ISTO PROVA: adotar é um CLIQUE DO TIME e vale como tal. `moverEtapa` grava o evento em
     * `as_candidatura_etapas`, exige vaga em processo e deriva o status da vaga, exatamente como o
     * clique da tela. Um `update as_candidaturas set etapa = ...` daqui daria o valor certo sem autor,
     * sem trilha e sem derivação, que é o defeito que a fila existe para matar.
     */
    expect(candidatos.moverEtapa).toHaveBeenCalledWith(
      CANDIDATURA,
      { etapa: "ENTREVISTA_CLIENTE" },
      AUTOR,
    );
    expect(consultaQueCasa(banco.consultas, /update\s+as_candidaturas/)).toBeNull();
  });

  it("`vaga_posicoes_oficiais` vai por `editarPosicoes`, preservando a meta de BANCO", async () => {
    const { servico, vagas } = montar(aberta("vaga_posicoes_oficiais", "9"));
    await servico.adotarAts(DIV, AUTOR);
    /*
     * O QUE ISTO PROVA, e a segunda metade é a que se erra sem perceber: o lado BANCO é decisão
     * INTERNA que o ATS não conhece. Mandar zero ali apagaria a meta que alguém dimensionou, o que
     * seria uma segunda alteração que ninguém pediu (§A.14). O caminho humano também valida o excesso
     * e grava o rastro de redução de meta.
     */
    expect(vagas.editarPosicoes).toHaveBeenCalledWith(
      VAGA,
      { posicoesOficiais: 9, posicoesBanco: 1 },
      AUTOR,
    );
  });

  it("`vaga_do_candidato` MOVE a candidatura por `trocarVaga`, e NUNCA chama `alocar`", async () => {
    const { servico, candidatos } = montar(aberta("vaga_do_candidato", "VAGA-DO-ATS"));
    await servico.adotarAts(DIV, AUTOR);
    /*
     * ─ O QUE ISTO PROVA, E ELE NASCEU DO VETO V3 DO `seguranca` (30/09/2026) ────────────────────
     *
     * A primeira versão adotava por `alocar` e RECRIAVA a duplicata que esta frente existe para matar.
     * O caminho era o FELIZ desta linha de fila, não uma borda: a divergência só NASCE depois de
     * `trocarVaga` ter MOVIDO a candidatura, então NÃO SOBRA linha em (candidato, vaga do ATS);
     * `alocar` busca exatamente aquele par, não acha nada, e INSERE. A pessoa passava a estar VIVA EM
     * DUAS VAGAS, consumindo DUAS posições, e a nova nascia na etapa INICIAL, perdendo o avanço do
     * funil. O comentário antigo dizia "candidatura VIVA continua barrada", e era FALSO aqui: não há
     * candidatura viva naquele par para barrar.
     *
     * `trocarVaga` é o inverso EXATO do gesto que gerou a divergência: move a linha que existe, tem a
     * trava de "só candidatura VIVA troca", respeita o unique parcial do destino, e grava
     * `vaga_de`/`vaga_para` na MESMA trilha que a trava do repositório lê para detectar a
     * transferência.
     *
     * A AUSENCIA DE `alocar` E TAO AFIRMADA QUANTO A PRESENCA DE `trocarVaga`: é ela que impede o
     * defeito de voltar pelo mesmo caminho num refactor futuro.
     */
    expect(candidatos.trocarVaga).toHaveBeenCalledWith(CANDIDATURA, { vagaId: VAGA }, AUTOR);
    expect(candidatos.alocar).not.toHaveBeenCalled();
    /*
     * E NENHUM `cienteReentrada` VIAJA (ressalva R2 do `seguranca`): aquele flag afirma uma CIENCIA
     * que nenhum modal pediu ao consultor. `motivo` também fica AUSENTE, porque é prosa opcional
     * (§A.6) e a adoção não tem frase de gente a registrar: quem registra a procedência é a trilha.
     */
    const corpo = candidatos.trocarVaga.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(corpo)).toEqual(["vagaId"]);
  });

  /**
   * ─ A DIFERENCA ENTRE `trocarVaga` E `alocar` E MEDIDA NA FONTE REAL, e não afirmada num comentário
   *
   * ┌─ POR QUE ESTA MEDICAO EXISTE, e por que o teste de cima sozinho não bastava ─────────────────┐
   * │ O teste de cima roda contra um DUBLE: ele prova qual método é chamado, e não o que aquele      │
   * │ método FAZ. Era exatamente essa a lacuna que deixou o veto V3 passar batido: o teste original  │
   * │ afirmava que `alocar` era chamada com os argumentos certos, contra um fake, e por isso não      │
   * │ pegou que `alocar` INSERE uma segunda candidatura.                                             │
   * │                                                                                               │
   * │ MEDIDO CONTRA O CODIGO DE PRODUCAO: `alocar` escreve `.insert(asCandidaturas)` e `trocarVaga`  │
   * │ escreve `.update(asCandidaturas)`, e é essa a linha entre CRIAR e MOVER. Se um dia `trocarVaga`│
   * │ passar a inserir candidatura, este teste fica vermelho e a adoção precisa ser repensada.       │
   * │                                                                                               │
   * │ OS COMENTARIOS SAO RETIRADOS ANTES DE ASSERIR: aquele arquivo FALA sobre insert e sobre        │
   * │ duplicata em prosa, e uma varredura crua contaria a palavra dentro do comentário como código.  │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("na fonte real, `trocarVaga` NAO insere candidatura e `alocar` INSERE", () => {
    const fonte = readFileSync(
      join(__dirname, "../candidatos/candidatos.service.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    /** O corpo de um método `async nome(` até o começo do método seguinte no mesmo nível. */
    const corpoDoMetodo = (nome: string): string => {
      const inicio = fonte.indexOf(`async ${nome}(`);
      expect(inicio, `metodo ${nome} nao encontrado: reveja este teste`).toBeGreaterThan(-1);
      const resto = fonte.slice(inicio + 1);
      const fim = resto.search(/\n {2}(?:async |private |public )/);
      return fim === -1 ? resto : resto.slice(0, fim);
    };

    const trocar = corpoDoMetodo("trocarVaga");
    const alocar = corpoDoMetodo("alocar");
    expect(trocar).toContain(".update(asCandidaturas)");
    expect(trocar).not.toContain(".insert(asCandidaturas)");
    expect(alocar).toContain(".insert(asCandidaturas)");
  });

  it("`situacao` NAO e adotavel, e a linha CONTINUA aberta", async () => {
    const { servico, banco } = montar(aberta("situacao", "DESCARTADO"));
    await expect(servico.adotarAts(DIV, AUTOR)).rejects.toBeInstanceOf(ConflictException);
    /*
     * O QUE ISTO PROVA: a recusa é HONESTA em vez de uma segunda porta de escrita. O caminho humano do
     * desfecho é `registrarSaida`, que EXIGE motivo do CATÁLOGO (`motivos_descarte`, 0129), e o ATS
     * traz a frase genérica do de/para, que não está no catálogo. Adotar aqui teria de escrever a
     * coluna direto ou inventar um motivo.
     *
     * E A LINHA NAO E FECHADA: fechar sem aplicar a tiraria da fila com o dado intacto, e ninguém mais
     * voltaria àquele caso.
     *
     * `motivo_descarte` NAO ESTA MAIS NESTE TESTE porque ele deixou de ser `CampoDeDivergencia` no
     * veto do `seguranca`: não existe linha de fila daquele campo para adotar nem para manter. A trava
     * dele é medida em `ingestao-precedencia.backend.spec.ts`.
     */
    expect(consultaQueCasa(banco.consultas, /update as_ingestao_divergencias/)).toBeNull();
  });

  it("id fora da forma de uuid volta 404, e nao 500 do driver", async () => {
    /*
     * O QUE ISTO PROVA (ressalva R3 do `seguranca`): o id do path entra na consulta com `::uuid`, e
     * texto torto ali estoura 22P02 no driver, ou seja 500. A guarda mora no método que INTERPOLA o
     * valor, e não só na controller, porque é a que sobrevive a um segundo chamador.
     */
    const { servico, banco } = montar(aberta("etapa", "CAPTACAO"));
    await expect(servico.adotarAts("nao-e-uuid", AUTOR)).rejects.toBeInstanceOf(NotFoundException);
    await expect(servico.manterEa("' or 1=1 --", AUTOR)).rejects.toBeInstanceOf(NotFoundException);
    // E NENHUMA CONSULTA CHEGA AO BANCO: a recusa é antes da primeira ida.
    expect(banco.consultas).toEqual([]);
  });

  it("os tres campos de ABERTURA da vaga NAO sao adotaveis, e a linha CONTINUA aberta", async () => {
    for (const campo of ["vaga_codigo", "vaga_nome_divulgacao", "vaga_cidade"]) {
      const { servico, banco } = montar(aberta(campo, "QUALQUER"));
      await expect(servico.adotarAts(DIV, AUTOR)).rejects.toBeInstanceOf(ConflictException);
      /*
       * O QUE ISTO PROVA: o único escritor humano daqueles campos é `VagasService.atualizar`, e ele só
       * aceita vaga de papel RASCUNHO ou REVISAO. A divergência de vaga só NASCE quando a vaga já saiu
       * da revisão, ou seja o caminho humano recusaria 100% dos casos. A frase do 409 diz o caminho de
       * verdade: o Master devolve a vaga para a revisão, corrige e libera de novo.
       */
      expect(consultaQueCasa(banco.consultas, /update\s+vagas/)).toBeNull();
      expect(consultaQueCasa(banco.consultas, /update as_ingestao_divergencias/)).toBeNull();
    }
  });

  it("valor do ATS AUSENTE ou invalido nao e adotado, e nada e escrito", async () => {
    // O QUE ISTO PROVA: fail-closed no valor. Sem isto, `moverEtapa("")` e `editarPosicoes(NaN)`
    // chegariam ao caminho humano e virariam 500 do driver em vez de uma frase que diz o que fazer.
    const semEtapa = montar(aberta("etapa", null));
    await expect(semEtapa.servico.adotarAts(DIV, AUTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(semEtapa.candidatos.moverEtapa).not.toHaveBeenCalled();

    const posicaoTorta = montar(aberta("vaga_posicoes_oficiais", "zero"));
    await expect(posicaoTorta.servico.adotarAts(DIV, AUTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(posicaoTorta.vagas.editarPosicoes).not.toHaveBeenCalled();
  });

  it("a APLICACAO vem antes do FECHAMENTO: falhando ela, a linha nao sai da fila", async () => {
    const { servico, banco, candidatos } = montar(aberta("etapa", "ENTREVISTA_CLIENTE"));
    candidatos.moverEtapa.mockRejectedValueOnce(
      new ConflictException("Esta vaga está em Fechada e não tem processo em andamento."),
    );
    await expect(servico.adotarAts(DIV, AUTOR)).rejects.toBeInstanceOf(ConflictException);
    /*
     * O QUE ISTO PROVA, e é a razão de a ordem não ser negociável: fechar antes deixaria a linha fora
     * da fila com o dado INTACTO quando a aplicação falhasse (vaga encerrada, etapa inativada no
     * catálogo, posição acima do teto), e ninguém mais voltaria àquele caso: ele sairia da fila sem
     * ter sido resolvido.
     */
    expect(consultaQueCasa(banco.consultas, /update as_ingestao_divergencias/)).toBeNull();
  });
});

// ── O CATALOGO DAS OPCOES DE FILTRO (§A.37) ────────────────────────────────────────────────────

describe("as opções dos filtros de cliente e de vaga", () => {
  /** Um banco que responde a consulta distinta das opções com a árvore de joins já resolvida. */
  function comOpcoes(linhas: unknown[]) {
    const banco = bancoFingido([{ quando: /select distinct/, devolve: linhas }]);
    return new IngestaoDivergenciasService(banco.db, {} as never, {} as never);
  }

  it("devolve distintos e ORDENADOS, com o value do cliente sendo o NOME e o da vaga o ID", async () => {
    const servico = comOpcoes([
      { cliente_nome: "Zeta Operacao", vaga_id: VAGA, vaga_nome: "Vaga Z" },
      { cliente_nome: "Alfa Operacao", vaga_id: "00000000-0000-4000-8000-0000000000a2", vaga_nome: "Vaga A" },
      // A REPETICAO DO MESMO CLIENTE E DA MESMA VAGA em linhas diferentes é o normal da fila (uma
      // divergência por campo, várias por vaga), e ela NÃO pode virar opção duplicada no seletor.
      { cliente_nome: "Alfa Operacao", vaga_id: "00000000-0000-4000-8000-0000000000a2", vaga_nome: "Vaga A" },
    ]);
    const r = await servico.opcoes();
    /*
     * O QUE ISTO PROVA: o `value` do cliente é o NOME porque `DivergenciaDaIngestaoItem` carrega
     * `clienteNome` e NÃO carrega `clienteId`. Um id aqui faria o seletor mandar um valor que a linha
     * não tem, e o filtro casaria zero linha sempre, parecendo "não há divergência desse cliente".
     */
    expect(r.clientes).toEqual([
      { value: "Alfa Operacao", label: "Alfa Operacao" },
      { value: "Zeta Operacao", label: "Zeta Operacao" },
    ]);
    expect(r.vagas).toEqual([
      { value: "00000000-0000-4000-8000-0000000000a2", label: "Vaga A" },
      { value: VAGA, label: "Vaga Z" },
    ]);
  });

  it("linha SEM cliente ou SEM vaga não vira opção de rótulo vazio", async () => {
    /*
     * O QUE ISTO PROVA: a vaga espelhada NASCE SEM CLIENTE (§A.5, o de/para é insumo do diretor), e
     * uma opção de rótulo vazio no seletor é uma opção que ninguém consegue interpretar nem desmarcar.
     * Medir isto importa porque este é o estado NORMAL da vaga do espelho, não uma borda.
     */
    const servico = comOpcoes([
      { cliente_nome: null, vaga_id: VAGA, vaga_nome: "Vaga Sem Cliente" },
      { cliente_nome: "   ", vaga_id: null, vaga_nome: null },
    ]);
    const r = await servico.opcoes();
    expect(r.clientes).toEqual([]);
    expect(r.vagas).toEqual([{ value: VAGA, label: "Vaga Sem Cliente" }]);
  });

  it("o catálogo NAO leva nome de candidato (§A.6)", async () => {
    /*
     * O QUE ISTO PROVA: cliente é pessoa JURIDICA e vaga é vaga. Um catálogo por candidato publicaria
     * a lista de quem está na fila num endpoint só de opções, que é dado pessoal sem uso de filtro. A
     * asserção é sobre a CONSULTA emitida, e não sobre o retorno, porque é a consulta que decide o que
     * o endpoint é capaz de trazer.
     */
    const banco = bancoFingido([{ quando: /select distinct/, devolve: [] }]);
    await new IngestaoDivergenciasService(banco.db, {} as never, {} as never).opcoes();
    const consulta = consultaQueCasa(banco.consultas, /select distinct/) ?? "";
    expect(consulta).not.toBe("");
    expect(consulta).not.toContain("as_candidatos");
    expect(consulta).not.toContain("cand.nome");
  });

  it("é derivado da fila INTEIRA, sem filtro de estado", async () => {
    /*
     * O QUE ISTO PROVA, e é o mesmo motivo dos KPIs: o catálogo responde "o que existe para escolher",
     * e um catálogo já recortado pela escolha anterior não responde isso. Incluir as RESOLVIDAS é
     * deliberado: o estado é um dos filtros, e o time alterna entre a fila e o histórico sem que as
     * opções de cliente e de vaga sumam do seletor.
     */
    const banco = bancoFingido([{ quando: /select distinct/, devolve: [] }]);
    await new IngestaoDivergenciasService(banco.db, {} as never, {} as never).opcoes();
    const consulta = consultaQueCasa(banco.consultas, /select distinct/) ?? "";
    expect(consulta).not.toContain("resolvido_em is null");
  });
});

// ── OS FILTROS QUE O CATALOGO ALIMENTA ─────────────────────────────────────────────────────────

describe("os filtros de cliente e de vaga na listagem", () => {
  function comLista() {
    const banco = bancoFingido([
      { quando: /from as_ingestao_divergencias d/, devolve: [] },
      { quando: /count\(\*\) filter/, devolve: [{ abertas: 0, resolvidas: 0, reincidentes: 0 }] },
    ]);
    return {
      banco,
      servico: new IngestaoDivergenciasService(banco.db, {} as never, {} as never),
    };
  }

  it("o filtro casa contra a MESMA expressão que a célula mostra", async () => {
    const { banco, servico } = comLista();
    await servico.listar({ estado: "TODAS", cliente: ["Alfa Operacao"], vaga: [VAGA] });
    const consulta = consultaQueCasa(banco.consultas, /from as_ingestao_divergencias d/) ?? "";
    /*
     * O QUE ISTO PROVA: a vaga da linha é `coalesce(c.vaga_id, d.vaga_id)` (escopo CANDIDATURA olha a
     * vaga da candidatura, escopo VAGA olha a coluna da própria divergência) e o cliente é
     * `nome_operacao` com `razao_social` de reserva. Filtrar por OUTRA expressão faria a tela mostrar
     * um valor e a consulta procurar outro, que é a forma silenciosa de um filtro mentir, e o sintoma
     * seria "a divergência desapareceu quando eu filtrei".
     */
    expect(consulta).toContain("coalesce(clf.nome_operacao, clf.razao_social) in");
    expect(consulta).toContain("coalesce(c.vaga_id, d.vaga_id) in");
  });

  it("sem filtro, nenhuma das duas cláusulas entra", async () => {
    // O QUE ISTO PROVA: as cláusulas são condicionais de verdade. Sem este caso, um `in ()` vazio
    // deixado na consulta poderia estar recortando a fila para nada, e o teste de cima ficaria verde.
    const { banco, servico } = comLista();
    await servico.listar({ estado: "TODAS" });
    const consulta = consultaQueCasa(banco.consultas, /from as_ingestao_divergencias d/) ?? "";
    expect(consulta).not.toContain("clf.nome_operacao");
    expect(consulta).not.toContain("coalesce(c.vaga_id, d.vaga_id) in");
  });
});

// ── A PORTA DA FILA ────────────────────────────────────────────────────────────────────────────

describe("quem segura a rota da fila", () => {
  /**
   * ─ AS TRES OPERACOES TEM DE SER REIVINDICADAS POR UM MENU, E ISTO E A UNICA TRAVA DA ROTA ──────
   *
   * ┌─ POR QUE ESTE TESTE EXISTE, E POR QUE ELE PODE ESTAR VERMELHO AGORA ────────────────────────┐
   * │ A `IngestaoDivergenciasController` NÃO tem `@Roles`, e isso é deliberado: o diretor decide,   │
   * │ usuário por usuário, quem trabalha esta fila (§A.23), e papel no handler entregaria uma PORTA │
   * │ TRANCADA a quem recebesse o menu (é o defeito que a `MotivosDescarteAdminController` já pagou).│
   * │                                                                                             │
   * │ MAS O `MenuGuard` É FAIL-OPEN PARA OPERACAO NAO REIVINDICADA (`menuDaOperacao` devolve `null` │
   * │ e a requisição PASSA). Somadas, as duas ausências deixariam QUALQUER SESSAO AUTENTICADA ler a │
   * │ fila com um `curl`, e ela devolve NOME DE CANDIDATO junto do cliente e da vaga (§A.6). É o    │
   * │ mesmo furo que a `ComerciaisService` e a `AltoVolumeController.listarVinculos` já pagaram.    │
   * │                                                                                             │
   * │ O REGISTRO DO MENU É DO COORDENADOR (`domain/menus.ts` é arquivo de dono único, §A.39), então │
   * │ este teste fica VERMELHO DE PROPOSITO até ele registrar `divergencias-ingestao` reivindicando  │
   * │ `IngestaoDivergenciasController.*`. Vermelho aqui é a frente incompleta, não regressão: a      │
   * │ alternativa era subir uma rota de PII fail-open com tudo verde.                                │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it.each(["listar", "opcoes", "manterEa", "adotarAts"])(
    "a operação %s é reivindicada por um menu",
    (handler) => {
      expect(
        menuDaOperacao("IngestaoDivergenciasController", handler),
        "registre o menu `divergencias-ingestao` reivindicando `IngestaoDivergenciasController.*`: sem isso o MenuGuard e fail-open e a fila (que devolve nome de candidato) fica aberta a qualquer sessao autenticada",
      ).not.toBeNull();
    },
  );
});
