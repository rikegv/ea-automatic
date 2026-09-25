import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import { instanciarPorTipos } from "../portal/portal-envio.tester-fake";

/**
 * ─ PONTE A&S -> ADM, RISCO "cores da Liberação": O CONTRATO DO PAYLOAD (`tester` §A.38/§A.40) ────
 *
 * O REQUISITO: o payload de `GET /admissoes/aguardando-liberacao`, para uma pré-admissão vinda do
 * FUNIL, traz `camposPendentes` (da FONTE ÚNICA `pendenciasObrigatorias`, §A.19), `veioDoFunil:true`
 * e os valores pré-preenchidos da folha. É teste de CONTRATO do backend; o visual é do coordenador.
 * A ponte já montou o payload em paralelo; este arquivo confirma o contrato de forma independente.
 *
 * Verificação INDEPENDENTE: este arquivo não escreveu a montagem do payload. Ele confirma, ponta a
 * ponta, que `veioDoFunil` vem do vínculo `as_candidaturas.admissao_id` e que `camposPendentes` sai
 * da FONTE ÚNICA `pendenciasObrigatoriasPorAdmissao` (§A.19), com os rótulos de `ROTULO_PENDENCIA`.
 */

const ADM = "adm-funil";

/** A linha da FILA (o primeiro `select`): pré-admissão do funil, SEM cliente e SEM cargo. */
const LINHA_FILA = {
  admissaoId: ADM,
  candidatoNome: "Candidato Sintetico",
  candidatoCpf: "39053344705",
  telefone: null,
  dataNascimento: null,
  sexo: null,
  origem: "MANUAL",
  criadoEm: new Date("2026-09-20T12:00:00.000Z"),
  idVacancy: "vaga-9",
  possivelDuplicata: false,
  codCliente: null,
  cargoId: null,
  salario: null,
  escala: null,
  centroCusto: null,
  setor: null,
  gestorBp: null,
  departamento: null,
  tempoContrato: null,
  motivo: null,
  substituidoNome: null,
  endereco: null,
};

/** A linha que a régua unificada (`pendenciasObrigatoriasPorAdmissao`) lê: mesma admissão, sem nada. */
const LINHA_PENDENCIAS = {
  id: ADM,
  codCliente: null,
  cargoId: null,
  dataAdmissao: null,
  tipoContrato: null,
  isBanco: false,
  salario: null,
  beneficios: null,
  escala: null,
  centroCusto: null,
  setor: null,
  gestorBp: null,
  possuiUniforme: null,
};

/**
 * Banco de mentirinha que serve as consultas de `listarAguardandoLiberacao` E as internas da régua
 * unificada. Responde por PROJEÇÃO (nunca por ordem): `candidatoNome` -> a fila; `possuiUniforme` ->
 * a linha da régua; `beneficioId` -> benefícios (vazio). `selectDistinct` devolve sempre a admissão
 * do cenário, o que marca `veioDoFunil` (vínculo em `as_candidaturas`) sem precisar distinguir a
 * tabela: o outro `selectDistinct` (benefícios estruturados) só mexeria numa pendência que este
 * teste não afirma. `codCliente` nulo faz `configPorCliente` retornar sem consultar (tudo obrigatório).
 */
function bancoDaFila() {
  const linhasPara = (keys: string[]): unknown[] => {
    if (keys.includes("candidatoNome")) return [LINHA_FILA];
    if (keys.includes("possuiUniforme")) return [LINHA_PENDENCIAS];
    return [];
  };
  const cadeia = (linhas: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
              Promise.resolve(linhas).then(ok, err);
          }
          return () => p;
        },
      },
    );
    return p;
  };
  return {
    select: (proj?: Record<string, unknown>) => cadeia(linhasPara(Object.keys(proj ?? {}))),
    selectDistinct: () => cadeia([{ admissaoId: ADM }]),
    query: { tiposDocumento: { findFirst: async () => null } },
  };
}

function montar() {
  return instanciarPorTipos(
    AdmissoesService,
    { Database: bancoDaFila() },
    { arquivo: ["admissoes", "admissoes.service.ts"], classe: "AdmissoesService" },
  );
}

describe("ponte A&S -> ADM: contrato do payload de aguardando-liberacao (vinda do funil)", () => {
  it("cada item traz veioDoFunil:true", async () => {
    const servico = montar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itens = (await servico.listarAguardandoLiberacao()) as any[];
    expect(itens[0]?.veioDoFunil).toBe(true);
  });

  it("cada item traz camposPendentes, e a lista sai da fonte única (§A.19)", async () => {
    const servico = montar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itens = (await servico.listarAguardandoLiberacao()) as any[];
    const pend = itens[0]?.camposPendentes;
    expect(Array.isArray(pend)).toBe(true);
    // Cliente e Cargo nulos nesta pré-admissão: os rótulos são os de `pendenciasObrigatorias`
    // (`ROTULO_PENDENCIA`), a mesma régua da coluna do Gerenciador e do modal, não uma lista nova.
    expect(pend).toContain("Cliente");
    expect(pend).toContain("Cargo");
  });

  it("o payload traz os valores pré-preenchidos da folha (a tela pré-preenche e o consultor ajusta)", async () => {
    const servico = montar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = ((await servico.listarAguardandoLiberacao()) as any[])[0];
    // Os campos da folha vêm no payload (nulos aqui, porque a origem sintética não os sabia): é a
    // PRESENÇA das chaves que é contrato, para a tela de Liberação com cores ter o que pré-preencher.
    for (const campo of ["salario", "escala", "centroCusto", "setor", "gestorBp", "tempoContrato"]) {
      expect(item).toHaveProperty(campo);
    }
    // §A.6: o CPF do substituído NÃO viaja neste payload (dado sensível; o time não precisa dele aqui).
    expect(item).not.toHaveProperty("substituidoCpf");
  });
});
