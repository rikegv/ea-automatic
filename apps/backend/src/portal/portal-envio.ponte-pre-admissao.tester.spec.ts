import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PortalEnvioService } from "./portal-envio.service";
import {
  coletarStrings,
  correioFake,
  identidadeFake,
  instanciarPorTipos,
} from "./portal-envio.tester-fake";

/**
 * ─ PONTE A&S -> ADM, RISCO c: NÃO EMITIR CREDENCIAL PARA PRONTUÁRIO VAZIO (`tester` §A.38/§A.40) ─
 *
 * O REQUISITO: a ponte A&S -> ADM passou a escrever `as_candidaturas.admissao_id`. Quando esse
 * vínculo aponta para uma PRÉ-ADMISSÃO (`AGUARDANDO_LIBERACAO`: sem cliente, sem cargo, sem régua,
 * sem documentos), o gancho automático do envio (`destinatariosDeCandidaturas` /
 * `enviarParaCandidaturas`) NÃO pode emitir o link do Portal: seria chamar o candidato para uma
 * coleta que não existe, e emitir REVOGA os links vivos da admissão (§A.5 do Portal). A pré-admissão
 * volta no lote MARCADA (`podeEnviar:false`), não sumindo, porque a prévia existe para o consultor
 * ver quem ficou de fora. Uma admissão VIVA (EM_ADMISSAO, com prontuário) continua emitindo.
 *
 * Verificação INDEPENDENTE: este arquivo não escreveu a guarda (ela usa `FAROIS_FORA_DO_PAINEL`);
 * ele prova o COMPORTAMENTO com um banco próprio que carrega o farol da admissão vinculada.
 *
 * §A.6: todo e-mail/CPF aqui é sintético. A emissão do link é o ato perigoso, então ela é CONTADA
 * (`identidade.emitidos`): "quantas vezes emitiu" é a asserção central da regra.
 */

const PRE = {
  candidaturaId: "cand-pre",
  admissaoId: "adm-pre",
  nomeNoFunil: "Pre Sintetico",
  nomeNaAdmissao: "Pre Sintetico",
  email: "pre@exemplo-sintetico.test",
  farol: "AGUARDANDO_LIBERACAO",
};
const VIVA = {
  candidaturaId: "cand-viva",
  admissaoId: "adm-viva",
  nomeNoFunil: "Viva Sintetica",
  nomeNaAdmissao: "Viva Sintetica",
  email: "viva@exemplo-sintetico.test",
  farol: "EM_ADMISSAO",
};

/** O destinatário que `destinatarioDaAdmissao` resolve no caminho de emissão da admissão viva. */
const DESTINATARIO_VIVA = { admissaoId: "adm-viva", nome: "Viva Sintetica", email: VIVA.email };

/**
 * Banco de mentirinha PRÓPRIO, e não o `bancoDoEnvio` vizinho: aquele fixa a linha do candidato sem
 * expor o FAROL da admissão, que é exatamente a dimensão que esta regra decide. Aqui as linhas
 * carregam `farol`, então a guarda (que lê `admissoes.farolGlobal`) tem sobre o que raciocinar.
 *
 * Responde por PROJEÇÃO, nunca por ordem de chamada: a consulta do lote projeta `candidaturaId`; a
 * de `destinatarioDaAdmissao` projeta `nome` + `admissaoId`. Ele IGNORA cláusulas `where` (devolve
 * as linhas do cenário), que basta para o requisito, que é de mapeamento (`podeEnviar`), não de SQL.
 */
function bancoComFarol(candidaturaRows: typeof PRE[], destinatarios: (typeof DESTINATARIO_VIVA)[]) {
  const resolver = (keys: string[], capturado: string[]) => {
    if (keys.includes("candidaturaId")) return candidaturaRows;
    if (keys.includes("nome") && keys.includes("admissaoId")) {
      const achado = destinatarios.find((d) => capturado.includes(d.admissaoId));
      return achado ? [achado] : [];
    }
    return [];
  };
  const cadeia = (projecao?: Record<string, unknown>) => {
    const keys = Object.keys(projecao ?? {});
    const capturado: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(keys, capturado)).then(ok, err);
          }
          return (...args: unknown[]) => {
            for (const a of args) coletarStrings(a, capturado);
            return p;
          };
        },
      },
    );
    return p;
  };
  return { select: (projecao?: Record<string, unknown>) => cadeia(projecao) };
}

function montar(candidaturaRows: typeof PRE[], destinatarios: (typeof DESTINATARIO_VIVA)[] = []) {
  const identidade = identidadeFake();
  const correio = correioFake({ configurado: true });
  const servico = instanciarPorTipos(
    PortalEnvioService,
    {
      Database: bancoComFarol(candidaturaRows, destinatarios),
      PortalIdentidadeService: identidade.fake,
      PortalCorreioService: correio.fake,
    },
    { arquivo: ["portal", "portal-envio.service.ts"], classe: "PortalEnvioService" },
  );
  return { servico, identidade, correio };
}

describe("ponte A&S -> ADM (risco c): pré-admissão não emite credencial do Portal", () => {
  it("a prévia marca a pré-admissão como NÃO enviável, e a admissão viva como enviável", async () => {
    const { servico } = montar([PRE, VIVA]);

    const previa = await servico.previaDeCandidaturas([PRE.candidaturaId, VIVA.candidaturaId]);

    const daPre = previa.itens.find((i) => i.candidaturaId === PRE.candidaturaId);
    const daViva = previa.itens.find((i) => i.candidaturaId === VIVA.candidaturaId);
    expect(daPre?.podeEnviar).toBe(false);
    expect(daViva?.podeEnviar).toBe(true);
    expect(previa.enviaveis).toBe(1);
    expect(previa.recusados).toBe(1);
  });

  it("o disparo do lote de UMA pré-admissão emite ZERO links", async () => {
    const { servico, identidade } = montar([PRE]);

    const resultado = await servico.enviarParaCandidaturas([PRE.candidaturaId], "autor-sintetico");

    expect(identidade.emitidos).toHaveLength(0);
    expect(resultado.enviados).toBe(0);
    expect(resultado.recusados).toHaveLength(1);
  });

  it("a admissão VIVA continua emitindo: um link, para a admissão dela", async () => {
    const { servico, identidade } = montar([VIVA], [DESTINATARIO_VIVA]);

    const resultado = await servico.enviarParaCandidaturas([VIVA.candidaturaId], "autor-sintetico");

    expect(identidade.emitidos).toHaveLength(1);
    expect(identidade.emitidos[0]?.admissaoId).toBe("adm-viva");
    expect(resultado.enviados).toBe(1);
  });

  it("lote MISTO: só a viva recebe link, a pré-admissão fica de fora sem emitir nada", async () => {
    const { servico, identidade } = montar([PRE, VIVA], [DESTINATARIO_VIVA]);

    const resultado = await servico.enviarParaCandidaturas(
      [PRE.candidaturaId, VIVA.candidaturaId],
      "autor-sintetico",
    );

    // A emissão aconteceu UMA vez, e para a admissão VIVA: a pré-admissão não gerou credencial.
    expect(identidade.emitidos).toHaveLength(1);
    expect(identidade.emitidos[0]?.admissaoId).toBe("adm-viva");
    expect(resultado.enviados).toBe(1);
    expect(resultado.recusados).toHaveLength(1);
  });
});
