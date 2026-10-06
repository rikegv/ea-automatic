import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import {
  DE_PARA_GI_VAZIO,
  montarContratacaoGi,
  montarFuncionarioSelecao,
  recusaDaContratacaoGi,
  type ContratacaoGi,
  type FuncionarioSelecao,
  type ParEmpresaFilialConhecido,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";

/**
 * INVARIANTE 2: NENHUMA GUARDA NOSSA COBRA DOCUMENTO.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO do diretor (§A.38 / §A.40 regra 2), sem Postgres e sem
 * rede. O requisito, nas palavras dele: "a regua documental e POR CLIENTE. Se o cliente nao exige CTPS,
 * a admissao fecha sem CTPS e esta certo. O envio manda o que a regua daquele cliente produziu, e
 * nenhuma guarda nossa pode recusar o envio por documento faltando."
 *
 * ┌─ O QUE ESTE ARQUIVO IMPEDE, e sao DOIS erros opostos ──────────────────────────────────────────┐
 * │ 1. Alguem acrescenta uma guarda "de bom senso" exigindo RG, CTPS ou PIS. Resultado: o cliente   │
 * │    que NAO exige CTPS passa a ter admissao auditada, completa e fechada, que o envio recusa para │
 * │    sempre, sem nada para preencher. Uma lista FIXA de documentos contradiz a `ReguaDocumental`   │
 * │    por (cliente + cargo) do §A.3, que e a fonte da verdade do que cada cliente exige.            │
 * │ 2. Alguem, para "deixar passar sem documento", afrouxa as guardas que EXISTEM, que sao de folha  │
 * │    (empresa/filial, salario, unidade, jornada, cliente final) e nao tem nada a ver com documento.│
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Por isso o arquivo tem DUAS metades, e as duas sao obrigatorias: a que prova que documento ausente
 * ENVIA, e a irma que prova que as recusas de folha CONTINUAM MORDENDO.
 *
 * MEDIDO contra o contrato publico do fornecedor: `TB_FuncionarioSelecaoAPI` tem `required` vazio, e
 * nenhum dos campos de documento e obrigatorio. Mandar sem CTPS nao quebra do outro lado.
 *
 * §A.6: toda entrada e SINTETICA. CPF da faixa reservada 999 (classe que a Receita nunca emitiu), nome
 * inventado, dominio de homologacao, salario inventado.
 */

const ADM = "44444444-4444-4444-4444-444444444444";

/** O par `1/4`, REAL, medido em `Empresa/GetAll` no fornecedor. */
const PAR_CONHECIDO: ParEmpresaFilialConhecido = (empresa, filial) => empresa === 1 && filial === 4;

/**
 * A PESSOA DO CLIENTE QUE NAO EXIGE DOCUMENTO: nome, CPF e nada mais. RG, CTPS e PIS **explicitamente
 * nulos**, e os demais documentos ausentes do objeto, que e o que o leitor devolve quando a coluna esta
 * vazia. §A.6: CPF da faixa reservada 999, nome inventado.
 */
const PESSOA_SEM_DOCUMENTOS: PessoaParaGi = {
  nome: "Marcilene Tubarossi Quenhapa",
  cpf: "99955544433",
  email: "marcilene@homolog.local",
  rg: null,
  rgOrgao: null,
  rgUf: null,
  rgCidade: null,
  rgDataEmissao: null,
  ctpsNumero: null,
  ctpsSerie: null,
  ctpsUf: null,
  ctpsCidade: null,
  ctpsData: null,
  pis: null,
  tituloNumero: null,
  tituloZona: null,
  tituloSecao: null,
  reservista: null,
  cnh: null,
  cnhDataEmissao: null,
  cnhDataValidade: null,
};

/** Uma contratacao COMPLETA do ponto de vista da FOLHA: salario com unidade, par conhecido, cliente. */
function contratacaoDeFolhaCompleta(
  patch: Partial<Parameters<typeof montarContratacaoGi>[0]> = {},
): ContratacaoGi {
  return montarContratacaoGi({
    salario: "2750.00",
    salarioUnidade: "MENSAL",
    dataAdmissao: "2026-11-03",
    tipoContrato: "Temporário",
    vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "4", ativo: true }],
    codCliente: "123",
    ...patch,
  });
}

function envio(
  contratacao: ContratacaoGi,
  opcoes: { armado: boolean; pessoa?: PessoaParaGi | null },
) {
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const marcarEnviado = vi.fn(async () => {});
  const giApi = { configurado: () => true, criarFuncionarioSelecao: criar } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => false,
    // Porta nova da cadeia (06/10/2026): `lerEstado` e a leitura AUTORITATIVA de farol, pausa e
    // origem. Dublê vivo e nao encerrado, para este arquivo continuar medindo o que ele mede.
    lerEstado: async () => ({ farolGlobal: "EM_ADMISSAO", pausadaEm: null, origem: "MANUAL" }),
    lerPessoa: async () => (opcoes.pessoa === undefined ? PESSOA_SEM_DOCUMENTOS : opcoes.pessoa),
    lerContratacao: async () => contratacao,
    marcarEnviado,
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: opcoes.armado ? "true" : "false" })[k],
  } as unknown as ConfigService;
  return { svc: new EnviarParaGiService(config, giApi, leitor, depara), criar, marcarEnviado };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// METADE 1: documento ausente NAO recusa
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("documento ausente NAO recusa o envio", () => {
  it("RG, CTPS e PIS TODOS nulos, disparo DESARMADO: desfecho GI_MONTADO_NAO_DISPARADO, nenhuma recusa", async () => {
    const { svc, criar } = envio(contratacaoDeFolhaCompleta(), { armado: false });

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" });
    expect(r.motivo, "o envio foi recusado, e nao apenas nao disparado").not.toMatch(
      /RG|CTPS|PIS|DOCUMENTO/i,
    );
    expect(criar, "a flag desarmada nao barrou o POST").not.toHaveBeenCalled();
  });

  it("RG, CTPS e PIS TODOS nulos, disparo ARMADO: o envio ACONTECE (GI_ENVIADO) e o POST e feito", async () => {
    /**
     * ESTE E O TESTE QUE DE FATO PROVA O INVARIANTE, e e por isso que ele existe ao lado do de cima. Com
     * a flag DESARMADA, o metodo PARA no passo 5, ANTES das guardas do passo 6: `GI_MONTADO_NAO_DISPARADO`
     * seria o desfecho mesmo que uma guarda de documento existisse, porque ela nem rodaria. So com a flag
     * ARMADA as guardas sao exercitadas de verdade.
     */
    const { svc, criar, marcarEnviado } = envio(contratacaoDeFolhaCompleta(), { armado: true });

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(criar, "uma guarda recusou o envio por documento faltando").toHaveBeenCalledTimes(1);
    expect(marcarEnviado).toHaveBeenCalledTimes(1);
  });

  it("os campos de documento saem NULOS no payload, nunca vazios nem zerados", async () => {
    /**
     * O fornecedor aceita `null` nos 26 campos de documento (contrato publico, `required` vazio). O que
     * NAO pode acontecer e o EA inventar valor para "preencher": string vazia ou `0` em campo de
     * documento e a mesma familia de dano do `default 0` do salario.
     */
    const { svc, criar } = envio(contratacaoDeFolhaCompleta(), { armado: true });

    await svc.enviarManual(ADM, "autor-sintetico");
    const payload = criar.mock.calls[0]?.[0] as FuncionarioSelecao;

    expect(payload.rg).toBeNull();
    expect(payload.carteiraTrabalho).toBeNull();
    expect(payload.pis).toBeNull();
    expect(payload.tituloEleitor).toBeNull();
    expect(payload.reservista).toBeNull();
    expect(payload.habilitacao).toBeNull();
  });

  it("a funcao de guarda IGNORA documento: zerar qualquer campo de documento mantem a recusa em null", () => {
    /**
     * A regua medida na propria funcao PURA, sem o servico no meio: nenhum dos campos de documento
     * muda o veredito. Um `for` sobre a lista, em vez de tres asserts, porque e a LISTA INTEIRA que
     * precisa ser indiferente, nao os tres que alguem lembrou de escrever.
     */
    const base = montarFuncionarioSelecao(
      PESSOA_SEM_DOCUMENTOS,
      DE_PARA_GI_VAZIO,
      contratacaoDeFolhaCompleta(),
    );
    const camposDeDocumento: (keyof FuncionarioSelecao)[] = [
      "rg",
      "orgaoRG",
      "cidadeRG",
      "ufrg",
      "dtExpedicaoRG",
      "carteiraTrabalho",
      "serie",
      "ufExpedicao",
      "cidadeExpedicao",
      "dtExpedicaoCTPS",
      "pis",
      "tituloEleitor",
      "titEleZona",
      "titEleSecao",
      "reservista",
      "habilitacao",
      "cnhDataEmissao",
      "dataVectoHabilitacao",
    ];

    expect(recusaDaContratacaoGi(base, PAR_CONHECIDO), "o cenario base ja recusa").toBeNull();
    for (const campo of camposDeDocumento) {
      const comFalta = { ...base, [campo]: null } as FuncionarioSelecao;
      expect(
        recusaDaContratacaoGi(comFalta, PAR_CONHECIDO),
        `a guarda passou a cobrar o documento "${String(campo)}"`,
      ).toBeNull();
    }
  });

  it("a LISTA FECHADA de recusas nao tem NENHUMA sobre documento", () => {
    /**
     * VARREDURA DO FONTE sobre a uniao `GiRecusaContratacao`, que e a lista autoritativa das recusas. Um
     * `GI_SEM_CTPS` acrescentado amanha reprova aqui, mesmo que ninguem escreva teste para ele, e esse e
     * o ponto: a guarda nova nao consegue nascer em silencio.
     */
    const fonte = readFileSync(join(__dirname, "..", "domain", "portal-dados-gi.ts"), "utf8");
    const bloco = /export type GiRecusaContratacao =([\s\S]*?);/.exec(fonte)?.[1];
    expect(bloco, "a uniao GiRecusaContratacao mudou de forma e a varredura parou de medir").toBeTruthy();
    const codigos = [...(bloco ?? "").matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);

    expect(codigos.length, "a uniao de recusas ficou vazia: a varredura nao esta medindo nada").toBeGreaterThan(0);
    expect(codigos).toEqual([
      "GI_SEM_EMPRESA_FILIAL",
      "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO",
      "GI_SALARIO_INVALIDO",
      "GI_SALARIO_SEM_UNIDADE",
      "GI_SALARIO_HORISTA_SEM_JORNADA",
      "GI_CLIENTE_NAO_RESOLVIDO",
    ]);
    for (const codigo of codigos) {
      expect(codigo, "nasceu uma recusa sobre DOCUMENTO, e a regua documental e por cliente").not.toMatch(
        /RG|CTPS|PIS|DOCUMENTO|CERTIDAO|TITULO|RESERVISTA|CNH|HABILITACAO/,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// METADE 2, O TESTE IRMAO: as recusas de FOLHA continuam mordendo
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("as recusas que EXISTEM nao foram afrouxadas junto", () => {
  it("par empresa/filial DESCONHECIDO: recusa GI_PAR_EMPRESA_FILIAL_DESCONHECIDO e ZERO POST", async () => {
    // `1/37` e valido campo a campo e NAO existe no fornecedor: e exatamente o que checagem campo a
    // campo nao pega.
    const { svc, criar, marcarEnviado } = envio(
      contratacaoDeFolhaCompleta({
        vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "37", ativo: true }],
      }),
      { armado: true },
    );

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO" });
    expect(criar).not.toHaveBeenCalled();
    expect(marcarEnviado).not.toHaveBeenCalled();
  });

  it("empresa/filial NAO RESOLVIDAS: recusa GI_SEM_EMPRESA_FILIAL e ZERO POST", async () => {
    const { svc, criar } = envio(contratacaoDeFolhaCompleta({ vinculos: [] }), { armado: true });

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_SEM_EMPRESA_FILIAL" });
    expect(criar).not.toHaveBeenCalled();
  });

  it("salario SEM UNIDADE declarada: recusa GI_SALARIO_SEM_UNIDADE e ZERO POST", async () => {
    const { svc, criar } = envio(contratacaoDeFolhaCompleta({ salarioUnidade: null }), { armado: true });

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_SEM_UNIDADE" });
    expect(criar).not.toHaveBeenCalled();
  });

  it("HORISTA sem JORNADA: recusa GI_SALARIO_HORISTA_SEM_JORNADA e ZERO POST", async () => {
    const { svc, criar } = envio(
      contratacaoDeFolhaCompleta({
        salario: "9.34",
        salarioUnidade: "HORA",
        jornadaHorasMes: null,
        jornadaHorasSem: null,
      }),
      { armado: true },
    );

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_HORISTA_SEM_JORNADA" });
    expect(criar).not.toHaveBeenCalled();
  });

  it("salario ZERO: recusa GI_SALARIO_INVALIDO e ZERO POST", async () => {
    const { svc, criar } = envio(contratacaoDeFolhaCompleta({ salario: "0" }), { armado: true });

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_INVALIDO" });
    expect(criar).not.toHaveBeenCalled();
  });

  it("CLIENTE FINAL nao resolvido: recusa GI_CLIENTE_NAO_RESOLVIDO e ZERO POST", async () => {
    /**
     * ESTA RECUSA NAO CONSTA DO MAPA DO COORDENADOR, que lista cinco guardas de folha. Ela existe, e
     * seis, e morde: a pre-admissao do Pandape nasce sem cliente. O teste esta aqui para que o afrouxe
     * de uma nao leve a outra.
     */
    const { svc, criar } = envio(contratacaoDeFolhaCompleta({ codCliente: null }), { armado: true });

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_CLIENTE_NAO_RESOLVIDO" });
    expect(criar).not.toHaveBeenCalled();
  });

  it("sem nome E sem CPF: recusa GI_SEM_DADOS_PESSOA antes de qualquer montagem", async () => {
    /**
     * A UNICA exigencia de DADO DA PESSOA no envio, e ela nao e documento: e nome OU CPF. Entra nesta
     * metade porque afrouxa-la para "deixar passar sem documento" mandaria pessoa vazia para a folha.
     */
    const { svc, criar } = envio(contratacaoDeFolhaCompleta(), {
      armado: true,
      pessoa: { nome: null, cpf: null },
    });

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_SEM_DADOS_PESSOA" });
    expect(criar).not.toHaveBeenCalled();
  });
});
