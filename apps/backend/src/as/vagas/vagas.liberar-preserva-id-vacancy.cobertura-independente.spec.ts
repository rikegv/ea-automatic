import "reflect-metadata";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
import { VagasService } from "./vagas.service";
import {
  bancoDeStatus,
  statusSemente,
  type Escrita,
  type LinhaStatus,
} from "./vaga-status.tester-fake";
import { IngestaoRepositorio } from "../ingestao-pandape/ingestao-repositorio";
import { consultaQueCasa } from "../ingestao-pandape/ingestao-repositorio.tester-fake";
import {
  rodarNascimento,
  rodarVagaDaVarredura,
  type CriarEscritor,
} from "../ingestao-pandape/ciclo-de-vida-da-vaga.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38/§A.40): LIBERAR A VAGA NÃO PODE DEIXAR A VARREDURA DUPLICÁ-LA ──
 *
 * ESCRITO PELO `tester`, A PARTIR DO REQUISITO, enquanto o `backend` constrói a correção em
 * paralelo. Por isso ele DEVE nascer VERMELHO: o defeito está em produção hoje.
 *
 * ┌─ O REQUISITO, EM UMA FRASE (do diretor) ────────────────────────────────────────────────────┐
 * │ Liberar uma vaga NÃO pode fazer a varredura do Pandapé duplicá-la: o `id_vacancy_pandape` tem │
 * │ de continuar na vaga depois da liberação, e a próxima varredura tem de RECONHECER a vaga e    │
 * │ NÃO criar outra.                                                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O DEFEITO, MEDIDO EM PRODUÇÃO ─────────────────────────────────────────────────────────────┐
 * │ `liberarPendenteRevisao` grava a vaga com `...camposDaTrilha(dto)`, e esse montador emite     │
 * │ `idVacancyPandape: texto(dto.idVacancyPandape)` e `envioShortlist: data(dto.envioShortlist)`. │
 * │ O corpo do FORMULÁRIO da tela de liberação NÃO carrega esses dois campos, então `texto` e     │
 * │ `data` devolvem `null`, e o `update` ZERA as duas colunas. A varredura reconhece a vaga por   │
 * │ `vagas.id_vacancy_pandape` (consulta de `ingestao-repositorio.ts`): zerada a coluna, a        │
 * │ próxima volta não acha a vaga e CRIA uma segunda em PENDENTE_REVISAO, com as candidaturas      │
 * │ repetidas. Foram 23 vagas ABERTA sem `id_vacancy_pandape`, cada uma duplicada 12 min depois.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A CADEIA É MEDIDA EM DUAS METADES ─────────────────────────────────────────────────┐
 * │ A liberação roda no `VagasService` (Drizzle, banco com memória) e a varredura no             │
 * │ `IngestaoRepositorio` (SQL cru, outro dublê). Juntar os dois num processo só exigiria um      │
 * │ Postgres de verdade. Então a cadeia é provada em duas peças que se encaixam pela MESMA coluna:│
 * │   (A) a liberação PRESERVA `id_vacancy_pandape` (e não zera `envio_shortlist`);               │
 * │   (B) a varredura RECONHECE pela coluna preservada (acha => ATUALIZA; não acha => CRIA).       │
 * │ (A) é o que falha hoje; (B) é a régua que torna (A) necessário, e fica verde nos dois estados.│
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: só códigos de cliente, códigos de status, id de usuário interno e o número da vaga no ATS.
 * Nenhum dado de candidato entra aqui. §A.11: sem travessão em texto apresentável.
 */

const USUARIO: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const CLIENTE = "CLI-A";
const CARGO = "11111111-1111-4111-8111-111111111111";

/** O número do ATS gravado na vaga espelhada, o mesmo valor que a varredura procura. */
const ID_VACANCY_DA_VAGA = "9001";
/** A previsão de shortlist que já estava gravada, e que este caminho não pode zerar. */
const ENVIO_SHORTLIST_GRAVADO = "2026-09-10";

/** O formulário da tela de liberação: COMPLETO nos onze, e SEM `idVacancyPandape`/`envioShortlist`. */
const FORMULARIO_COMPLETO = {
  codCliente: CLIENTE,
  codigo: "PS-2026-901",
  nomeDivulgacao: "Operador de Loja",
  cargoId: CARGO,
  posicoesOficiais: 2,
  natureza: "EFETIVA",
  sazonalidade: "OPERACAO_PADRAO",
  linhaServicoId: 1,
  dataAbertura: "2026-09-01",
  dataLimite: "2026-09-30",
};

/** Os catálogos que o banco cru não serve (linha de serviço conferida antes de gravar). */
const CATALOGOS: Record<string, Record<string, unknown>[]> = {
  as_linhas_servico: [{ id: 1, codigo: "OPERACAO", rotulo: "Operação", ordem: 1, ativo: true }],
  beneficios_catalogo: [],
};

function catalogoDeStatusFingido(linhas: LinhaStatus[]) {
  const regua = new ReguaDeStatusDaVaga(linhas);
  return new Proxy(
    { regua: async () => regua },
    {
      get: (alvo, prop: string) => {
        if (prop in alvo) return (alvo as Record<string, unknown>)[prop];
        if (prop === "then") return undefined;
        return async (...args: unknown[]) => {
          const codigo = args.find((a) => typeof a === "string") as string | undefined;
          if (/codigo/i.test(prop) && /papel/i.test(prop)) return regua.codigoDoPapel(codigo as never);
          const linha = linhas.find((l) => l.codigo === codigo);
          return linha ? { ...linha } : linhas.map((l) => ({ ...l }));
        };
      },
    },
  );
}

/** Intercepta só as leituras de catálogo; todo o resto, inclusive a transação, vai ao banco cru. */
function bancoComCatalogos(db: unknown): unknown {
  const respondido = (linhas: Record<string, unknown>[]): Record<string, unknown> => {
    const eu: Record<string, unknown> = {};
    for (const m of ["where", "limit", "orderBy", "groupBy", "innerJoin", "leftJoin", "for"]) {
      eu[m] = () => eu;
    }
    eu.then = (ok: (v: unknown) => unknown) => Promise.resolve(linhas).then(ok);
    return eu;
  };
  const envolver = (executor: Record<string, unknown>): Record<string, unknown> =>
    new Proxy(executor, {
      get(alvo, prop: string) {
        if (prop === "select") {
          return (proj?: unknown) => {
            const construtor = (alvo.select as (p?: unknown) => Record<string, unknown>)(proj);
            return new Proxy(construtor, {
              get(c, p: string) {
                if (p !== "from") return c[p];
                return (t: unknown) => {
                  const nome = getTableName(t as never);
                  return CATALOGOS[nome]
                    ? respondido(CATALOGOS[nome])
                    : (c.from as (x: unknown) => unknown)(t);
                };
              },
            });
          };
        }
        if (prop === "transaction") {
          return (fn: (tx: unknown) => Promise<unknown>) =>
            (alvo.transaction as (f: (tx: unknown) => Promise<unknown>) => Promise<unknown>)((tx) =>
              fn(envolver(tx as Record<string, unknown>)),
            );
        }
        return alvo[prop];
      },
    });
  return envolver(db as Record<string, unknown>);
}

/** A vaga espelhada do ATS, em REVISAO, já com o número do ATS e a previsão de shortlist gravados. */
function vagaDe(status: string) {
  return {
    id: "vaga-1",
    codigo: "PS-DO-ATS",
    nomeDivulgacao: "Vaga espelhada do ATS",
    status,
    codCliente: null,
    cargoId: null,
    posicoesOficiais: 2,
    posicoesBanco: 0,
    natureza: null,
    sazonalidade: "OPERACAO_PADRAO",
    linhaServicoId: null,
    dataAbertura: null,
    dataLimite: null,
    cidadeId: null,
    abertoPorId: null,
    // AS DUAS COLUNAS QUE O CAMINHO DA LIBERAÇÃO NÃO PODE ZERAR.
    idVacancyPandape: ID_VACANCY_DA_VAGA,
    envioShortlist: ENVIO_SHORTLIST_GRAVADO,
    criadoEm: new Date("2026-09-15T12:00:00.000Z"),
    atualizadoEm: new Date("2026-09-15T12:00:00.000Z"),
  };
}

function cenario() {
  const linhas = statusSemente();
  const regua = new ReguaDeStatusDaVaga(linhas);
  const banco = bancoDeStatus({
    status: linhas,
    clientes: [{ codCliente: CLIENTE }],
    vagas: [vagaDe(regua.codigoDoPapel("REVISAO"))],
  });
  const Construtor = VagasService as unknown as new (...a: unknown[]) => VagasService;
  const service = new Construtor(
    bancoComCatalogos(banco.db),
    catalogoDeEtapasFingido(),
    catalogoDeStatusFingido(linhas),
  );
  return {
    banco,
    service,
    vaga: banco.vagas[0] as Record<string, unknown>,
    codigoAbertura: regua.codigoDoPapel("ABERTURA"),
  };
}

const escritasEm = (banco: ReturnType<typeof cenario>["banco"], tabela: string, tipo: string) =>
  banco.escritas.filter((e) => e.tabela === tabela && e.tipo === tipo);

// ── (A) A LIBERAÇÃO PRESERVA O NÚMERO DO ATS (o que falha HOJE) ─────────────────────────────────

describe("(A) liberar a vaga preserva `id_vacancy_pandape` e não zera `envio_shortlist`", () => {
  it("logo após liberar, a vaga MANTÉM o número do ATS", async () => {
    const { service, vaga, codigoAbertura } = cenario();
    await service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never);

    expect(vaga.status, "a vaga não saiu da fila para o papel ABERTURA").toBe(codigoAbertura);
    expect(
      vaga.idVacancyPandape,
      "A LIBERAÇÃO ZEROU `id_vacancy_pandape`. A varredura reconhece a vaga por essa coluna, então, zerada, a próxima volta não acha a vaga e CRIA uma segunda em PENDENTE_REVISAO, com as candidaturas repetidas. Foi o que duplicou 23 vagas em produção.",
    ).toBe(ID_VACANCY_DA_VAGA);
  });

  it("e não zera a previsão de shortlist que já estava gravada", async () => {
    const { service, vaga } = cenario();
    await service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never);

    expect(
      vaga.envioShortlist,
      "o mesmo defeito atinge `envio_shortlist`: `camposDaTrilha` emite `data(dto.envioShortlist)`, que é `null` quando o formulário não traz o campo, e o update apaga a data que já estava lá.",
    ).toBe(ENVIO_SHORTLIST_GRAVADO);
  });

  it("o `update` emitido NÃO escreve `idVacancyPandape = null` (a prova no nível da escrita)", async () => {
    const { service, banco } = cenario();
    await service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never);

    const naVaga: Escrita[] = escritasEm(banco, "vagas", "update");
    expect(naVaga, "a liberação não emitiu update em `vagas`").toHaveLength(1);
    const valores = naVaga[0].valores;
    if ("idVacancyPandape" in valores) {
      expect(
        valores.idVacancyPandape,
        "o update MENCIONA `idVacancyPandape` e o grava NULO. Ou a liberação não emite essa coluna, ou a emite com o valor preservado: nunca `null`.",
      ).not.toBeNull();
    }
    if ("envioShortlist" in valores) {
      expect(
        valores.envioShortlist,
        "o update grava `envioShortlist = null`, apagando a previsão por um caminho que não é o de editá-la.",
      ).not.toBeNull();
    }
  });
});

// ── (A2) O IRMÃO GÊMEO: EDITAR A VAGA NA FILA (`atualizar`, ramo REVISAO) TAMBÉM PRESERVA ───────

/**
 * ─ A OUTRA PORTA QUE ESPALHA `camposDaTrilha` DIRETO NUM UPDATE ───────────────────────────────
 *
 * O `atualizar` no ramo REVISAO escreve campo SEM mover a vaga (a saída da fila é só da liberação),
 * e grava com `...this.semCarimbosDeIntegracao(campos)` pela MESMA razão. Sem essa guarda, salvar
 * um rascunho de edição numa vaga da fila zeraria `id_vacancy_pandape`, e a varredura duplicaria a
 * vaga no ciclo seguinte, exatamente como pela liberação. O fix do backend cobre AS DUAS portas;
 * este bloco prende a segunda, para a correção não regredir por uma delas sozinha.
 */
describe("(A2) editar a vaga na fila (`atualizar` em REVISAO) preserva os carimbos de integração", () => {
  it("grava o campo editado, NÃO move a vaga e MANTÉM o número do ATS", async () => {
    const { service, vaga } = cenario();
    const statusAntes = vaga.status;
    await service.atualizar("vaga-1", { ...FORMULARIO_COMPLETO } as never, USUARIO.id);

    expect(vaga.codigo, "a edição não gravou o campo").toBe("PS-2026-901");
    expect(
      vaga.status,
      "a edição TIROU a vaga da fila: quem move a vaga em REVISAO é só a liberação, nunca o PATCH de edição.",
    ).toBe(statusAntes);
    expect(
      vaga.idVacancyPandape,
      "A EDIÇÃO ZEROU `id_vacancy_pandape` pela porta irmã da liberação. Zerada a coluna, a varredura do Pandapé não reconhece a vaga e cria uma DUPLICATA no ciclo seguinte.",
    ).toBe(ID_VACANCY_DA_VAGA);
    expect(
      vaga.envioShortlist,
      "a mesma porta não pode apagar a previsão de shortlist que já estava gravada.",
    ).toBe(ENVIO_SHORTLIST_GRAVADO);
  });

  it("o `update` da edição não grava `idVacancyPandape = null` nem `envioShortlist = null`", async () => {
    const { service, banco } = cenario();
    await service.atualizar("vaga-1", { ...FORMULARIO_COMPLETO } as never, USUARIO.id);

    const naVaga: Escrita[] = escritasEm(banco, "vagas", "update");
    expect(naVaga, "a edição não emitiu update em `vagas`").toHaveLength(1);
    const valores = naVaga[0].valores;
    if ("idVacancyPandape" in valores) {
      expect(
        valores.idVacancyPandape,
        "o update da edição MENCIONA `idVacancyPandape` e o grava NULO, zerando a chave que a varredura usa para reconhecer a vaga.",
      ).not.toBeNull();
    }
    if ("envioShortlist" in valores) {
      expect(valores.envioShortlist, "o update da edição grava `envioShortlist = null`.").not.toBeNull();
    }
  });
});

// ── (B) A VARREDURA RECONHECE PELA COLUNA PRESERVADA (verde hoje e depois; é a régua da cadeia) ──

const criarRepositorio: CriarEscritor = (db, catalogo) =>
  new IngestaoRepositorio(db as never, catalogo as never, null as never) as never;

describe("(B) a varredura reconhece a vaga por `id_vacancy_pandape`: acha ATUALIZA, não acha CRIA", () => {
  it("a consulta de vaga existente procura por `id_vacancy_pandape`", async () => {
    const e = await rodarVagaDaVarredura(criarRepositorio);
    const consultaDaVaga = consultaQueCasa(
      e.consultas,
      /select[\s\S]*from\s+vagas\b[\s\S]*id_vacancy_pandape/,
    );
    expect(
      consultaDaVaga,
      "a varredura não procura a vaga por `id_vacancy_pandape`. É essa a coluna que (A) preserva: se a chave de reconhecimento fosse outra, preservar a coluna não impediria a duplicata.",
    ).not.toBeNull();
  });

  it("ACHANDO a vaga por aquele número, a varredura ATUALIZA e NÃO cria outra", async () => {
    const e = await rodarVagaDaVarredura(criarRepositorio);
    expect(e.update, "a vaga reconhecida não recebeu update").not.toBeNull();
    expect(
      e.insertDaVaga,
      "a varredura reconheceu a vaga pelo número do ATS e, ainda assim, inseriu uma SEGUNDA: isso é a duplicata.",
    ).toBeNull();
  });

  it("NÃO achando vaga para aquele número, a varredura CRIA (é a duplicata que (A) evita)", async () => {
    const e = await rodarNascimento(criarRepositorio);
    expect(
      e.insertDaVaga,
      "sem vaga para o número do ATS, a varredura cria uma nova. É exatamente o que acontece quando a liberação zera `id_vacancy_pandape`: a vaga some do reconhecimento e renasce duplicada.",
    ).not.toBeNull();
  });
});
