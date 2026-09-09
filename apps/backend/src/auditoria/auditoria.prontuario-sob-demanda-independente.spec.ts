import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { admissoes, frentesAdmissao, frenteStatusEventos } from "../db/schema";

/**
 * PRONTUÁRIO SOB DEMANDA: COBERTURA INDEPENDENTE (§A.38, tester que não escreveu o código).
 *
 * Escrito a partir do REQUISITO, em paralelo à construção (§A.40 regra 2), e por isso NÃO é o mesmo
 * arquivo do autor (`auditoria.prontuario-sob-demanda.spec.ts`). Os dois convivem de propósito: o do
 * autor pega regressão, este pega mal-entendido de requisito, que é justamente o que o teste de quem
 * escreveu o código não pega, porque codifica a mesma suposição que gerou o código.
 *
 * O BURACO QUE A FERRAMENTA FECHA. O único gatilho de arquivamento mora dentro do "régua completa"
 * (`aplicarPosVeredito`). Quem fecha a Auditoria À MÃO com obrigatório pendente nunca passa por ali,
 * então a admissão conclui sem pasta no Drive, em silêncio. São 31 admissões assim.
 *
 * AS CINCO GARANTIAS QUE ESTE ARQUIVO TRAVA:
 *  1. ANTI DUPLICAÇÃO: rodar duas vezes não cria dois prontuários. A segunda chamada devolve
 *     `jaExistia`, não chama o Drive e não reescreve a URL.
 *  2. PRESERVAR OS ARQUIVOS: com `preservarStaging`, a staging NÃO é expurgada, mesmo sem falha
 *     parcial. O documento ainda vai ser auditado e apagá-lo é irreversível.
 *  3. REGRESSÃO (o risco número um da frente): o caminho NORMAL, sem a opção, continua expurgando
 *     como hoje. Se a mudança aditiva vazar para ele, é regressão silenciosa em código validado.
 *  4. RÉGUA ABERTA NÃO IMPEDE A FERRAMENTA, ao contrário do gatilho automático.
 *  5. ARTEFATO, NÃO ESTADO (§A.27): nenhuma escrita de `farol_global` nem de status de frente.
 *
 * §A.6: nenhum dado pessoal aqui. O nome do candidato é um rótulo técnico e o campo de CPF carrega
 * um marcador que não é um CPF.
 */

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};

const PASTA = "https://drive.google.com/drive/folders/PASTA-ESCOLHIDA";
const PASTA_ANTIGA = "https://drive.google.com/drive/folders/PASTA-QUE-JA-EXISTIA";

const USUARIO: AuthUser = {
  id: "u-master",
  email: "diagnostico@soulan.com.br",
  papel: "MASTER",
  senhaTemporaria: false,
};

const BASE_ADM = {
  id: "adm-1",
  codCliente: "C-10",
  cargoId: "cargo-1",
  tipoContrato: "Temporário",
  dataAdmissao: null,
  drivePastaUrl: null as string | null,
  driveAsoUrl: null as string | null,
  driveDuplicatasBaixadas: null as string | null,
  candidatoNome: "CANDIDATO TESTE",
  candidatoCpf: "SEM-CPF-NO-TESTE",
  candidatoSexo: null as string | null,
  clienteOperacao: "Operação X",
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/** Reconstrói o texto de um SQL cru do drizzle (para achar escrita feita por fora do ORM). */
function textoDaConsulta(q: unknown): string {
  const chunks = (q as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [];
  return chunks.map((c) => (c?.value !== undefined ? String(c.value) : "")).join("");
}

/**
 * Harness do arquivamento, no idioma do `auditoria.pasta-ancora.spec.ts` (mesmo dispatch de projeção
 * no `select`), com três acréscimos que esta frente precisa: captura de INSERT, captura de
 * `db.execute` e um `id` de admissão parametrizável (o backfill roda sobre uma lista).
 */
function montar(opts: {
  id?: string;
  adm?: Partial<typeof BASE_ADM>;
  entregues?: string[];
  naStaging?: string[];
  /** Quantos arquivos o Drive devolveu como NÃO enviados (falha parcial). */
  falhas?: number;
  /** Régua obrigatória completa? A ferramenta existe justamente para o caso `false`. */
  reguaCompleta?: boolean;
}) {
  const id = opts.id ?? "adm-1";
  const adm = { ...BASE_ADM, id, ...(opts.adm ?? {}) };
  const entregues = opts.entregues ?? ["RG", "CPF"];
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const consultasCruas: unknown[] = [];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? []
      : keys.includes("concluida")
        ? [
            { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
            { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
          ]
        : keys.includes("codigo") && keys.includes("validadoEm")
          ? entregues.map((codigo) => ({ codigo, validadoEm: null }))
          : keys.length === 1 && keys.includes("id")
            ? []
            : keys.includes("codigo") && keys.includes("nome")
              ? entregues.map((c) => ({ codigo: c, nome: c }))
              : [adm];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => Promise.resolve(rows),
      orderBy: () => Promise.resolve(rows),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  });

  const registrar = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });
      // Fake COM ESTADO de propósito: gravar a URL muda o que a próxima leitura enxerga, que é o
      // que faz a SEGUNDA chamada da ferramenta encontrar o prontuário já existente.
      if (tabela === admissoes && typeof valores.drivePastaUrl === "string") {
        adm.drivePastaUrl = valores.drivePastaUrl;
      }
      return { where: async () => undefined };
    },
    values: (valores: Record<string, unknown>) => {
      inserts.push({ tabela, valores });
      return {
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ id: "frente-nova" }] }),
        returning: async () => [{ id: "linha-nova" }],
      };
    },
  });
  const tx = { update: vi.fn(registrar), insert: vi.fn(registrar) };
  const db = {
    select,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    execute: vi.fn((q: unknown) => {
      consultasCruas.push(q);
      return Promise.resolve([]);
    }),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG" }) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "ENTREGUE" }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(adm) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: "u-master", nome: "Master" }) },
    },
  };

  const naStaging = (opts.naStaging ?? entregues).map((codigoTipo, i) => ({
    codigoTipo,
    caminho: `/staging/${id}/${codigoTipo}__${i}`,
  }));
  const staging = {
    listar: vi.fn(async () => [...naStaging]),
    salvar: vi.fn(async () => `/staging/${id}/novo`),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const ai = {
    auditarDocumento: vi.fn(),
    arquivarDrive: vi.fn().mockResolvedValue({
      pastaUrl: PASTA,
      arquivados: naStaging.length,
      ...(opts.falhas ? { falhas: opts.falhas, motivoFalhas: ["TimeoutError"] } : {}),
    }),
  };
  const completa = opts.reguaCompleta ?? true;
  const regua = {
    progresso: vi.fn().mockResolvedValue({
      completa,
      obrigatoriosTotal: 3,
      obrigatoriosEntregues: completa ? 3 : 2,
      faltantes: completa ? [] : ["CTPS"],
    }),
  };
  const pandapeArquivos = {
    baixarArquivosDosTipos: vi
      .fn()
      .mockResolvedValue({ arquivos: [], semRetorno: [], chamadasApi: 1 }),
  };
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    ai as never,
    regua as never,
    drivePastaPaiFake as never,
    pandapeArquivos as never,
  );
  return { id, svc, ai, staging, updates, inserts, consultasCruas, pandapeArquivos };
}

/**
 * A FERRAMENTA, chamada pela porta acordada. O elenco de retorno é aceito por MAIS DE UMA PORTA: a
 * URL pode voltar solta ou dentro de `arquivado`, porque a posição é detalhe que só o autor decide.
 * O que NÃO é negociável é o campo `jaExistia`, que o requisito nomeia.
 */
interface ResultadoProntuario {
  ok?: boolean;
  jaExistia?: boolean;
  pastaUrl?: string;
  url?: string;
  drivePastaUrl?: string;
  arquivado?: { pastaUrl?: string };
}

function ferramenta(svc: AuditoriaService) {
  const alvo = svc as unknown as {
    criarProntuarioSobDemanda?: (id: string, user: AuthUser | null) => Promise<ResultadoProntuario>;
  };
  if (typeof alvo.criarProntuarioSobDemanda !== "function") {
    throw new Error(
      "AuditoriaService.criarProntuarioSobDemanda ainda não existe. " +
        "Assinatura esperada: criarProntuarioSobDemanda(admissaoId, user).",
    );
  }
  return alvo.criarProntuarioSobDemanda.bind(svc);
}

function urlDoResultado(r: ResultadoProntuario): string | undefined {
  return r?.pastaUrl ?? r?.arquivado?.pastaUrl ?? r?.drivePastaUrl ?? r?.url;
}

/** Dispara o arquivamento pelo caminho AUTOMÁTICO (pós-veredito), que é o de sempre. */
function caminhoAutomatico(svc: AuditoriaService) {
  return svc.aplicarPosVeredito("adm-1", {
    id: "u-1",
    email: "consultor@soulan.com.br",
    papel: "COMUM",
    senhaTemporaria: false,
  });
}

describe("1. ANTI DUPLICAÇÃO: rodar duas vezes não cria dois prontuários", () => {
  it("a SEGUNDA chamada devolve jaExistia, não chama o Drive e não reescreve a URL", async () => {
    const { svc, ai, updates } = montar({ adm: { drivePastaUrl: null } });
    const criar = ferramenta(svc);

    const primeira = await criar("adm-1", USUARIO);
    const chamadasApos1 = ai.arquivarDrive.mock.calls.length;
    const escritasApos1 = updates.length;

    const segunda = await criar("adm-1", USUARIO);

    // A primeira criou de verdade.
    expect(primeira.jaExistia).not.toBe(true);
    expect(urlDoResultado(primeira)).toContain("PASTA-ESCOLHIDA");
    expect(chamadasApos1).toBe(1);

    // A segunda é NO-OP declarado: nem Drive, nem regravação da URL.
    expect(segunda.jaExistia).toBe(true);
    expect(ai.arquivarDrive.mock.calls.length).toBe(chamadasApos1);
    const escritasDepois = updates.slice(escritasApos1);
    expect(escritasDepois.filter((u) => u.valores.drivePastaUrl !== undefined)).toHaveLength(0);
  });

  it("admissão que JÁ nasce com pasta é pulada na primeira chamada (nada é tocado)", async () => {
    const { svc, ai, updates, staging } = montar({ adm: { drivePastaUrl: PASTA_ANTIGA } });

    const r = await ferramenta(svc)("adm-1", USUARIO);

    expect(r.jaExistia).toBe(true);
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(updates.filter((u) => u.valores.drivePastaUrl !== undefined)).toHaveLength(0);
    expect(staging.removerAdmissao).not.toHaveBeenCalled();
    // Quando pula, devolve a pasta que já existia (o diretor precisa do link para conferir).
    const url = urlDoResultado(r);
    if (url !== undefined) expect(url).toContain("PASTA-QUE-JA-EXISTIA");
  });

  it("DUAS chamadas CONCORRENTES na mesma admissão não abrem duas pastas", async () => {
    // A trava por admissão do `arquivarNoDrive` já existe e é o que fecha a corrida; a ferramenta
    // precisa passar por ela, e não por fora. Sem isso, o botão clicado duas vezes duplica.
    const { svc, ai } = montar({ adm: { drivePastaUrl: null } });
    const criar = ferramenta(svc);

    await Promise.all([criar("adm-1", USUARIO), criar("adm-1", USUARIO)]);

    const comAncora = ai.arquivarDrive.mock.calls.filter((c) => c[0]?.pastaId).length;
    const semAncora = ai.arquivarDrive.mock.calls.filter((c) => !c[0]?.pastaId).length;
    // Ou a segunda nem chega ao Drive (guarda), ou chega ANCORADA na pasta da primeira. O que não
    // pode acontecer é o Drive receber duas buscas por nome, que é como nasceram as 16 duplicatas.
    expect(semAncora).toBe(1);
    expect(comAncora).toBeLessThanOrEqual(1);
  });
});

describe("2. PRESERVAR OS ARQUIVOS: com preservarStaging, nada é expurgado", () => {
  it("a staging NÃO é removida, mesmo com o envio inteiro sem falha", async () => {
    // Decisão do diretor: o documento ainda vai ser auditado. Este é o efeito colateral que a
    // ferramenta NÃO pode ter, porque é destrutivo e não tem volta.
    const { svc, staging, ai } = montar({ adm: { drivePastaUrl: null } });

    await ferramenta(svc)("adm-1", USUARIO);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(staging.removerAdmissao).not.toHaveBeenCalled();
  });

  it("nenhum arquivo isolado é removido da staging tampouco", async () => {
    const { svc, staging } = montar({ adm: { drivePastaUrl: null } });

    await ferramenta(svc)("adm-1", USUARIO);

    expect(staging.removerArquivo).not.toHaveBeenCalled();
  });

  it("o prontuário nasce COM os arquivos que a staging tinha (preservar não é subir vazio)", async () => {
    const { svc, ai } = montar({
      adm: { drivePastaUrl: null },
      entregues: ["RG", "CPF"],
      naStaging: ["RG", "CPF"],
    });

    await ferramenta(svc)("adm-1", USUARIO);

    expect(ai.arquivarDrive.mock.calls[0][0].arquivos).toHaveLength(2);
  });
});

describe("3. REGRESSÃO: o caminho NORMAL continua expurgando como hoje", () => {
  it("pós-veredito com régua completa e envio limpo EXPURGA a staging (comportamento validado)", async () => {
    // Se a opção aditiva vazar para o caminho de sempre, a staging deixa de ser expurgada e o TTL
    // de 48h (§A.6) passa a ser a única limpeza. É a regressão silenciosa desta frente.
    const { svc, staging } = montar({ adm: { drivePastaUrl: null } });

    await caminhoAutomatico(svc);

    expect(staging.removerAdmissao).toHaveBeenCalledTimes(1);
    expect(staging.removerAdmissao).toHaveBeenCalledWith("adm-1");
  });

  it("pós-veredito com falha PARCIAL continua NÃO expurgando (a outra metade da regra)", async () => {
    const { svc, staging, updates } = montar({ adm: { drivePastaUrl: null }, falhas: 1 });

    await caminhoAutomatico(svc);

    expect(staging.removerAdmissao).not.toHaveBeenCalled();
    const gravou = updates.find((u) => u.tabela === admissoes && u.valores.drivePastaUrl);
    expect(gravou?.valores.drivePastaUrl).toContain("PASTA-ESCOLHIDA");
  });

  it("a ferramenta e o caminho normal CONVIVEM: usar uma não muda a outra", async () => {
    // Duas admissões distintas, mesma imagem do serviço: quem passou pela ferramenta preserva, quem
    // passou pelo gatilho automático expurga. É a prova de que a opção é por CHAMADA, não global.
    const comFerramenta = montar({ id: "adm-1", adm: { drivePastaUrl: null } });
    const automatica = montar({ id: "adm-1", adm: { drivePastaUrl: null } });

    await ferramenta(comFerramenta.svc)("adm-1", USUARIO);
    await caminhoAutomatico(automatica.svc);

    expect(comFerramenta.staging.removerAdmissao).not.toHaveBeenCalled();
    expect(automatica.staging.removerAdmissao).toHaveBeenCalledTimes(1);
  });

  it("o ASO continua limpando o próprio arquivo da staging (o outro caminho que remove)", async () => {
    // `arquivarAso` remove SÓ o arquivo do ASO, e não a admissão inteira. A opção nova não pode ter
    // alcançado este caminho de lado.
    const { svc, staging } = montar({
      adm: { drivePastaUrl: null, driveAsoUrl: null },
      entregues: ["ASO"],
      naStaging: ["ASO"],
    });

    await svc.arquivarAso("adm-1");

    expect(staging.removerArquivo).toHaveBeenCalledTimes(1);
    expect(staging.removerAdmissao).not.toHaveBeenCalled();
  });
});

describe("4. RÉGUA ABERTA não impede a ferramenta", () => {
  it("o gatilho AUTOMÁTICO não arquiva com obrigatório pendente (o buraco que originou a frente)", async () => {
    const { svc, ai } = montar({ adm: { drivePastaUrl: null }, reguaCompleta: false });

    const pos = await caminhoAutomatico(svc);

    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(pos.arquivado).toBeUndefined();
  });

  it("a FERRAMENTA arquiva a mesma admissão, com o obrigatório ainda pendente", async () => {
    const { svc, ai, updates } = montar({ adm: { drivePastaUrl: null }, reguaCompleta: false });

    const r = await ferramenta(svc)("adm-1", USUARIO);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(urlDoResultado(r)).toContain("PASTA-ESCOLHIDA");
    const gravou = updates.find((u) => u.tabela === admissoes && u.valores.drivePastaUrl);
    expect(gravou?.valores.drivePastaUrl).toContain("PASTA-ESCOLHIDA");
  });

  it("régua aberta E staging vazia: a pasta nasce assim mesmo, é o caso das 31", async () => {
    const { svc, ai } = montar({
      adm: { drivePastaUrl: null },
      reguaCompleta: false,
      entregues: ["RG"],
      naStaging: [],
    });

    const r = await ferramenta(svc)("adm-1", USUARIO);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(urlDoResultado(r)).toContain("PASTA-ESCOLHIDA");
  });
});

describe("5. ARTEFATO, NÃO ESTADO (§A.27): nem farol, nem status de frente", () => {
  it("nenhuma escrita de farol_global e nenhuma escrita em frentes_admissao", async () => {
    // Prontuário é arquivo indo para a pasta. Mexer em farol ou em frente aqui mudaria contagem de
    // Painel, Gerenciador e Esteira de uma vez, que é exatamente o caso que originou a §A.27.
    const { svc, updates, inserts, consultasCruas } = montar({
      adm: { drivePastaUrl: null },
      reguaCompleta: false,
    });

    await ferramenta(svc)("adm-1", USUARIO);

    expect(updates.filter((u) => u.valores.farolGlobal !== undefined)).toHaveLength(0);
    expect(updates.filter((u) => u.tabela === frentesAdmissao)).toHaveLength(0);
    expect(inserts.filter((i) => i.tabela === frentesAdmissao)).toHaveLength(0);
    expect(inserts.filter((i) => i.tabela === frenteStatusEventos)).toHaveLength(0);
    // A outra porta de escrita do serviço: SQL cru. Nenhum UPDATE de farol nem de frente por ali.
    for (const q of consultasCruas) {
      const texto = textoDaConsulta(q).replace(/\s+/g, " ");
      expect(texto).not.toMatch(/UPDATE\s+admissoes[\s\S]*farol_global/i);
      expect(texto).not.toMatch(/UPDATE\s+frentes_admissao/i);
    }
  });

  it("também não mexe em status/conclusão de frente quando a régua está COMPLETA", async () => {
    // O caso limite: alguém usa a ferramenta numa admissão de régua fechada. Ainda assim ela só
    // cria o artefato; quem conclui a Auditoria é o pós-veredito, não a ferramenta.
    const { svc, updates, inserts } = montar({
      adm: { drivePastaUrl: null },
      reguaCompleta: true,
    });

    await ferramenta(svc)("adm-1", USUARIO);

    expect(updates.filter((u) => u.tabela === frentesAdmissao)).toHaveLength(0);
    expect(inserts.filter((i) => i.tabela === frenteStatusEventos)).toHaveLength(0);
    expect(updates.filter((u) => u.valores.farolGlobal !== undefined)).toHaveLength(0);
  });

  it("não mexe no sinalizador de preenchimento (outro número que alimenta tela)", async () => {
    const { svc, updates } = montar({ adm: { drivePastaUrl: null }, reguaCompleta: false });

    await ferramenta(svc)("adm-1", USUARIO);

    expect(updates.filter((u) => u.valores.sinalizadorPreenchimento !== undefined)).toHaveLength(0);
  });
});

describe("7. BACKFILL IDEMPOTENTE: pula quem já tem pasta e o relatório bate", () => {
  it("sobre uma lista com uma pasta já existente, cria só as que faltam", async () => {
    // A régua do runner das 31, medida pelo efeito e não pelo caminho do arquivo: a lista roda
    // inteira, quem já tem prontuário não vai ao Drive, e a contagem final separa criadas de
    // puladas. Rodar o runner DUAS vezes não pode criar nada na segunda passada.
    const alvos = [
      montar({ id: "adm-1", adm: { drivePastaUrl: PASTA_ANTIGA }, reguaCompleta: false }),
      montar({ id: "adm-2", adm: { drivePastaUrl: null }, reguaCompleta: false }),
      montar({ id: "adm-3", adm: { drivePastaUrl: null }, reguaCompleta: false }),
    ];

    const relatorio = { criadas: 0, puladas: 0 };
    for (const alvo of alvos) {
      const r = await ferramenta(alvo.svc)(alvo.id, USUARIO);
      if (r.jaExistia) relatorio.puladas += 1;
      else relatorio.criadas += 1;
    }

    expect(relatorio).toEqual({ criadas: 2, puladas: 1 });
    expect(alvos[0].ai.arquivarDrive).not.toHaveBeenCalled();
    expect(alvos[1].ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(alvos[2].ai.arquivarDrive).toHaveBeenCalledTimes(1);

    // SEGUNDA PASSADA sobre a MESMA lista: tudo pulado, zero chamada nova ao Drive.
    const segunda = { criadas: 0, puladas: 0 };
    for (const alvo of alvos) {
      const r = await ferramenta(alvo.svc)(alvo.id, USUARIO);
      if (r.jaExistia) segunda.puladas += 1;
      else segunda.criadas += 1;
    }

    expect(segunda).toEqual({ criadas: 0, puladas: 3 });
    expect(alvos[1].ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(alvos[2].ai.arquivarDrive).toHaveBeenCalledTimes(1);
  });

  it("o backfill também não expurga a staging de ninguém", async () => {
    const alvos = [
      montar({ id: "adm-2", adm: { drivePastaUrl: null }, reguaCompleta: false }),
      montar({ id: "adm-3", adm: { drivePastaUrl: null }, reguaCompleta: false }),
    ];

    for (const alvo of alvos) await ferramenta(alvo.svc)(alvo.id, USUARIO);

    for (const alvo of alvos) expect(alvo.staging.removerAdmissao).not.toHaveBeenCalled();
  });
});

/**
 * TRILHA EM `candidato_alteracoes_log` (§A.6: log de auditoria sensível, permanente e consultável).
 *
 * POR DUAS PORTAS DE PROPÓSITO, porque a CAMADA é detalhe que só o autor decide: a trilha pode ser
 * gravada pelo SERVIÇO (junto do efeito) ou pela CONTROLLER (junto do disparo, como `zerarPendencia`
 * e `zerarDuplicata` já fazem). O requisito exige que ela EXISTA, não onde ela mora, então o teste
 * aceita qualquer uma das duas e só falha quando não há trilha em lugar nenhum.
 *
 * E O QUE ELE MEDE ALÉM DA EXISTÊNCIA: que a trilha guarda o AUTOR, e que não carrega dado pessoal.
 */
describe("TRILHA: a criação sob demanda fica registrada, com autor e sem PII", () => {
  function linhasDeTrilha(inserts: Escrita[], consultas: unknown[]) {
    const porDrizzle = inserts.filter((i) => {
      const nome = String((i.tabela as { _?: { name?: string } })?._?.name ?? "");
      const chaves = Object.keys(i.valores ?? {});
      return (
        nome === "candidato_alteracoes_log" ||
        (chaves.includes("campo") && chaves.includes("autorId"))
      );
    });
    const porSqlCru = consultas.filter((q) =>
      textoDaConsulta(q).replace(/\s+/g, " ").includes("candidato_alteracoes_log"),
    );
    return { porDrizzle, porSqlCru, total: porDrizzle.length + porSqlCru.length };
  }

  it("a ação deixa trilha, no serviço OU na controller do Diagnóstico", async () => {
    // PORTA 1: o serviço grava junto do efeito.
    const { svc, inserts, consultasCruas } = montar({
      adm: { drivePastaUrl: null },
      reguaCompleta: false,
    });
    await ferramenta(svc)("adm-1", USUARIO);
    const noServico = linhasDeTrilha(inserts, consultasCruas).total > 0;

    // PORTA 2: a controller grava junto do disparo (padrão de `zerar-pendencia`).
    const noHandler = await trilhaNaController();

    expect(
      noServico || noHandler,
      "nem o serviço nem a controller gravaram em candidato_alteracoes_log",
    ).toBe(true);
  });

  it("a trilha guarda QUEM disparou (autor), que é o ponto de uma trilha", async () => {
    const { svc, inserts, consultasCruas } = montar({
      adm: { drivePastaUrl: null },
      reguaCompleta: false,
    });

    await ferramenta(svc)("adm-1", USUARIO);

    const { porDrizzle, porSqlCru } = linhasDeTrilha(inserts, consultasCruas);
    if (porDrizzle.length === 0 && porSqlCru.length === 0) return; // trilha na controller, ver acima.
    if (porDrizzle.length > 0) {
      expect(porDrizzle[0].valores.autorId).toBe("u-master");
    } else {
      expect(textoDaConsulta(porSqlCru[0])).toContain("autor_id");
    }
  });

  it("§A.6: a trilha NÃO carrega nome nem CPF do candidato", async () => {
    const { svc, inserts, consultasCruas } = montar({
      adm: { drivePastaUrl: null },
      reguaCompleta: false,
    });

    await ferramenta(svc)("adm-1", USUARIO);

    const { porDrizzle, porSqlCru } = linhasDeTrilha(inserts, consultasCruas);
    const textos = [
      ...porDrizzle.map((l) => JSON.stringify(l.valores)),
      ...porSqlCru.map((q) => textoDaConsulta(q)),
    ];
    for (const texto of textos) {
      expect(texto).not.toContain(BASE_ADM.candidatoNome);
      expect(texto).not.toContain(BASE_ADM.candidatoCpf);
    }
  });

  /**
   * Exercita o handler `POST acao/criar-prontuario` com um serviço dublê, para ver se a trilha sai
   * por ali, e para provar que o handler DELEGA à ferramenta em vez de repetir o pós-veredito (que é
   * justamente o caminho que não arquiva com régua aberta). O handler é achado pelo METADADO DA
   * ROTA, não pelo nome do método: o nome é do autor, o caminho é do requisito.
   */
  async function trilhaNaController(): Promise<boolean> {
    const { DiagnosticoController } = await import("../diagnostico/diagnostico.controller");
    const proto = DiagnosticoController.prototype as unknown as Record<string, unknown>;
    const nome = Object.getOwnPropertyNames(proto).find((k) => {
      const fn = proto[k];
      return (
        typeof fn === "function" &&
        Reflect.getMetadata("path", fn) === "acao/criar-prontuario" &&
        Reflect.getMetadata("method", fn) === 1 // RequestMethod.POST
      );
    });
    if (!nome) return false;

    const inserts: Escrita[] = [];
    const consultas: unknown[] = [];
    const db = {
      execute: (q: unknown) => {
        consultas.push(q);
        return Promise.resolve([]);
      },
      insert: (tabela: unknown) => ({
        values: (valores: Record<string, unknown>) => {
          inserts.push({ tabela, valores });
          return { returning: async () => [], onConflictDoNothing: async () => undefined };
        },
      }),
    };
    const auditoriaDuble = {
      criarProntuarioSobDemanda: vi.fn(async () => ({ ok: true, pastaUrl: PASTA })),
      aplicarPosVeredito: vi.fn(),
    };
    // A controller tem muitas dependências e o handler usa duas: o banco (posição 1) e a Auditoria
    // (posição 4). O resto entra indefinido de propósito, e qualquer uso inesperado estoura aqui.
    const args: unknown[] = new Array(14).fill(undefined);
    args[0] = db;
    args[3] = auditoriaDuble;
    const Ctor = DiagnosticoController as unknown as new (
      ...a: unknown[]
    ) => Record<string, (...a: unknown[]) => Promise<unknown>>;
    const ctrl = new Ctor(...args);
    await ctrl[nome]({ admissaoId: "adm-1" }, USUARIO);

    expect(auditoriaDuble.criarProntuarioSobDemanda).toHaveBeenCalledTimes(1);
    expect(auditoriaDuble.aplicarPosVeredito).not.toHaveBeenCalled();

    return linhasDeTrilha(inserts, consultas).total > 0;
  }
});
