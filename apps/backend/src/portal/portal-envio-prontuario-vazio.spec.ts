import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PortalEnvioService } from "./portal-envio.service";
import {
  coletarStrings,
  corpoDoMetodo,
  correioFake,
  fonteOuNulo,
  identidadeFake,
  instanciarPorTipos,
} from "./portal-envio.tester-fake";

/**
 * ─ O GATE DO FAROL: NENHUMA PORTA EMITE CREDENCIAL PARA PRONTUÁRIO VAZIO (risco c do estudo) ────
 *
 * O caminho MANUAL de emissão já filtrava o farol (`admissoesSemLink` usa
 * `notInArray(farol, FAROIS_FORA_DO_PAINEL)`). O caminho AUTOMÁTICO (`destinatariosDeCandidaturas`,
 * disparado pelo gancho de `registrarSaida`) resolvia a admissão só pelo vínculo da candidatura e
 * checava APENAS o e-mail. Com a ponte A&S -> ADM escrevendo `as_candidaturas.admissao_id`
 * apontando para uma PRÉ-ADMISSÃO (`AGUARDANDO_LIBERACAO`, sem régua/documentos), o gancho emitiria
 * credencial de um prontuário VAZIO.
 *
 * ESTE SPEC FALHA ANTES DA CORREÇÃO: sem o filtro, a pré-admissão sai `podeEnviar: true`, o lote
 * chama `enviarParaAdmissao` e um link nasce (2 emissões em vez de 1).
 *
 * §A.6: nenhum e-mail/CPF real. O `banco` de mentirinha responde pelo QUE FOI PEDIDO (a projeção e
 * os argumentos), no molde de `portal-envio.tester-fake.ts`, e HONRA o recorte do farol como o
 * banco real honraria (a `destinatarioDaAdmissao` só encontra a admissão quando o filtro NÃO a
 * exclui). Assim o dublê não maquia a correção: se o serviço não aplicar o `notInArray`, os
 * argumentos não trazem os farois de fora e a pré-admissão volta a ser "encontrada".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const FORA_DO_PAINEL = ["DECLINOU", "RESCISAO", "AGUARDANDO_LIBERACAO", "LIBERACAO_RECUSADA"];

const AUTOR = "44444444-4444-4444-8444-444444444444";
const EMAIL_OK = "candidato.vivo@exemplo-sintetico.test";

interface LinhaFake {
  candidaturaId: string;
  admissaoId: string;
  nome: string;
  email: string | null;
  farol: string;
}

const VIVA: LinhaFake = {
  candidaturaId: "c1111111-1111-4111-8111-111111111111",
  admissaoId: "a1111111-1111-4111-8111-111111111111",
  nome: "Candidata Viva",
  email: EMAIL_OK,
  farol: "EM_ADMISSAO",
};

const PRE_ADMISSAO: LinhaFake = {
  candidaturaId: "c2222222-2222-4222-8222-222222222222",
  admissaoId: "a2222222-2222-4222-8222-222222222222",
  nome: "Candidato Em Espera",
  email: EMAIL_OK,
  farol: "AGUARDANDO_LIBERACAO",
};

/**
 * O BANCO, respondendo pela projeção e pelos argumentos, como os vizinhos.
 *
 * A consulta da BATELADA (`destinatariosDeCandidaturas`) pede `candidaturaId` e `farol`: devolve as
 * linhas cujas candidaturas foram citadas, com o farol REAL de cada uma. A consulta de UMA admissão
 * (`destinatarioDaAdmissao`) pede `admissaoId`, `nome`, `email`: devolve a admissão citada SÓ se o
 * filtro do farol não a exclui, e o filtro é reconhecido porque `notInArray` injeta os farois de
 * fora nos argumentos.
 */
function bancoComFarol(linhas: LinhaFake[]) {
  const consultas: string[][] = [];

  const resolver = (projecao: Record<string, unknown> | undefined, args: string[]): unknown[] => {
    consultas.push(args);
    const chaves = Object.keys(projecao ?? {}).join(",");

    if (chaves.includes("candidaturaId") || chaves.includes("farol")) {
      return linhas
        .filter((l) => args.includes(l.candidaturaId))
        .map((l) => ({
          candidaturaId: l.candidaturaId,
          admissaoId: l.admissaoId,
          nomeNoFunil: l.nome,
          nomeNaAdmissao: l.nome,
          email: l.email,
          farol: l.farol,
        }));
    }

    // `destinatarioDaAdmissao`: uma admissão por id. O banco real aplica o `where`, então o dublê
    // também: o filtro do farol foi aplicado quando os farois de fora aparecem nos argumentos.
    const linha = linhas.find((l) => args.includes(l.admissaoId));
    if (!linha) return [];
    const filtroDoFarolAplicado = FORA_DO_PAINEL.some((f) => args.includes(f));
    if (filtroDoFarolAplicado && FORA_DO_PAINEL.includes(linha.farol)) return [];
    return [{ admissaoId: linha.admissaoId, nome: linha.nome, email: linha.email }];
  };

  const cadeia = (projecao?: Record<string, unknown>): any => {
    const args: string[] = [];
    const proxy: any = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(projecao, args)).then(ok, erro);
          }
          return (...a: unknown[]) => {
            for (const x of a) coletarStrings(x, args);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const db: any = { select: (p?: Record<string, unknown>) => cadeia(p) };
  return { db, consultas };
}

function montar(linhas: LinhaFake[]) {
  const banco = bancoComFarol(linhas);
  const identidade = identidadeFake();
  const correio = correioFake({ configurado: true });
  const servico = instanciarPorTipos(
    PortalEnvioService as any,
    {
      Database: banco.db,
      PortalIdentidadeService: identidade.fake,
      PortalCorreioService: correio.fake,
    },
    { arquivo: ["portal", "portal-envio.service.ts"], classe: "PortalEnvioService" },
  ) as any;
  return { servico, identidade, correio };
}

describe("a prévia do lote MARCA a pré-admissão como não enviável, e não a esconde", () => {
  it("candidatura para AGUARDANDO_LIBERACAO volta `podeEnviar: false`; a viva volta enviável", async () => {
    const { servico } = montar([VIVA, PRE_ADMISSAO]);
    const previa = await servico.previaDeCandidaturas([VIVA.candidaturaId, PRE_ADMISSAO.candidaturaId]);

    expect(previa.enviaveis).toBe(1);
    expect(previa.recusados).toBe(1);

    const item = previa.itens.find((i: any) => i.candidaturaId === PRE_ADMISSAO.candidaturaId);
    expect(item.podeEnviar).toBe(false);
    expect(item.motivo, "a tela precisa dizer o porquê, não sumir em silêncio").not.toBeNull();

    const viva = previa.itens.find((i: any) => i.candidaturaId === VIVA.candidaturaId);
    expect(viva.podeEnviar, "a admissão viva e completa continua enviável").toBe(true);
  });
});

describe("o disparo do lote NÃO emite link para a pré-admissão (ZERO credencial órfã)", () => {
  it("emite só para a viva: uma emissão, e o `admissaoId` emitido é o dela", async () => {
    const { servico, identidade } = montar([VIVA, PRE_ADMISSAO]);
    const resultado = await servico.enviarParaCandidaturas(
      [VIVA.candidaturaId, PRE_ADMISSAO.candidaturaId],
      AUTOR,
    );

    expect(resultado.enviados).toBe(1);
    expect(resultado.recusados).toHaveLength(1);
    expect(resultado.recusados[0].candidaturaId).toBe(PRE_ADMISSAO.candidaturaId);

    // A prova dura: a emissão é o ato perigoso (revoga links vivos e abre o prontuário). Uma só,
    // e para a admissão viva. Antes da correção seriam duas.
    expect(identidade.emitidos).toHaveLength(1);
    expect(identidade.emitidos[0].admissaoId).toBe(VIVA.admissaoId);
  });
});

describe("o caminho DIRETO (manual/gancho) também recusa a pré-admissão", () => {
  /**
   * O DUBLÊ NÃO DISCRIMINA ESTE CAMINHO SOZINHO: os valores do enum de farol vazam pelo grafo de
   * colunas do Drizzle e o `coletarStrings` os recolhe, então a detecção do filtro dispararia mesmo
   * na versão sem a guarda. A prova que FALHA ANTES é de FONTE: `destinatarioDaAdmissao` (o choke
   * point dos dois caminhos que emitem) tem de recortar o farol, e o corpo dela diz isso. Sem o
   * recorte, este teste fica vermelho, que é exatamente o estado de risco (c).
   */
  it("`destinatarioDaAdmissao` recorta o farol (fecha o caminho manual/direto por construção)", () => {
    const fonte = fonteOuNulo("portal", "portal-envio.service.ts");
    expect(fonte, "a fonte do serviço precisa existir").not.toBeNull();
    const corpo = corpoDoMetodo(fonte as string, "destinatarioDaAdmissao");
    expect(corpo, "o método resolvedor da admissão única precisa existir").not.toBeNull();
    expect(
      /notInArray[\s\S]*FAROIS_FORA_DO_PAINEL/.test(corpo as string),
      "sem o `notInArray(farolGlobal, FAROIS_FORA_DO_PAINEL)` o caminho direto emite para prontuário vazio",
    ).toBe(true);
  });

  it("`enviarParaAdmissao` de uma AGUARDANDO_LIBERACAO não encontra a admissão e não emite", async () => {
    const { servico, identidade } = montar([PRE_ADMISSAO]);
    await expect(
      servico.enviarParaAdmissao(PRE_ADMISSAO.admissaoId, AUTOR, "MANUAL"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(identidade.emitidos, "nenhuma credencial pode nascer para prontuário vazio").toHaveLength(0);
  });

  it("REGRESSÃO: a admissão viva e completa continua emitindo pelo caminho direto", async () => {
    const { servico, identidade } = montar([VIVA]);
    const r = await servico.enviarParaAdmissao(VIVA.admissaoId, AUTOR, "MANUAL");
    expect(r.enviado).toBe(true);
    expect(identidade.emitidos).toHaveLength(1);
    expect(identidade.emitidos[0].admissaoId).toBe(VIVA.admissaoId);
  });
});
