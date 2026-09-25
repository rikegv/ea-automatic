import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  situacaoDaPendencia,
  TETO_REPROVACOES_POR_PENDENCIA,
} from "../domain/portal-tentativas";
import { LIMITES_PORTAL, TIPOS_ACEITOS_PORTAL } from "../domain/portal-credencial";
import { PortalDocumentosService } from "./portal-documentos.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO E ANTES DO CÓDIGO (§A.40 regra 2).
 *
 * O ALVO: `GET /portal/documentos`, a única chamada que a tela do candidato faz ao abrir a trilha.
 * Ela devolve `TrilhaDoCandidato` (contrato em `packages/shared-types`). Quem escreve o serviço é
 * outro agente; este arquivo não o cria. Rodado antes do serviço, FALHA por módulo inexistente, e
 * é o esperado.
 *
 * ┌─ POR QUE ESTA ROTA É A MAIS PERIGOSA DA FRENTE ─────────────────────────────────────────────┐
 * │ Ela é a ÚNICA rota do Portal que DEVOLVE dados, e o portal é público por natureza: o link vai │
 * │ por WhatsApp, para o celular de alguém que não tem conta no sistema. As demais rotas recebem  │
 * │ (credencial, confirmação). Rota que devolve é onde o vazamento acontece, e são dois modos:    │
 * │                                                                                               │
 * │  a) VAZAR CAMPO. Selecionar a admissão inteira e serializá-la é o caminho natural de quem     │
 * │     implementa, e leva CPF e nome completo para a tela em uma linha. O contrato declara a     │
 * │     ausência de propósito, e este arquivo VARRE O JSON em vez de conferir a forma do objeto:  │
 * │     campo aninhado, campo extra e `select` sem projeção passam por uma checagem de forma.     │
 * │                                                                                               │
 * │  b) VAZAR DOCUMENTO DO OUTRO. Se a rota aceitar `?admissaoId=`, qualquer link válido lê a     │
 * │     trilha de qualquer pessoa, porque id é adivinhável por enumeração e não é segredo. A      │
 * │     admissão vem do bilhete assinado (`PortalSessaoGuard`, `req.portal.admissaoId`) e de mais │
 * │     lugar nenhum. É a mesma ameaça A15 que a credencial de escrita já trata no nível do       │
 * │     objeto, e aqui ela chega pela porta da leitura.                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ERRO DE DOMÍNIO QUE ESTE ARQUIVO TRAVA: A FONTE DOS PASSOS ─────────────────────────────┐
 * │ A trilha se monta a partir de `documentos_admissao`, NUNCA de `regua_documental`. A          │
 * │ diferença foi MEDIDA em homologação: 32 linhas de régua contra 14 documentos na MESMA        │
 * │ admissão. A emissão de credencial exige a LINHA DE DOCUMENTO existir (o predicado `naRegua`  │
 * │ de `portal-credencial.service.ts`, que responde "Este documento não faz parte da sua lista"),│
 * │ então montar a trilha pela régua listaria 18 casas que recusam no toque, logo depois de a    │
 * │ mesma API dizer que eram dela.                                                                │
 * │ A régua continua entrando, e só para UMA coisa: dizer a EXIGÊNCIA de cada documento, por     │
 * │ (cliente + cargo), §A.3 regra 4.                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: os fixtures usam valores SINTÉTICOS, inventados para este arquivo. O "CPF" é uma sequência
 * sintética que não pertence a ninguém, e existe só para ser PROCURADA na resposta.
 */

// ── Fixtures SINTÉTICOS (nenhum dado real; §A.6) ─────────────────────────────────────────────
const SINTETICO = {
  admissaoId: "11111111-1111-4111-8111-111111111111",
  /** Sequência SINTÉTICA no formato de CPF. Não é de ninguém: serve para ser buscada na resposta. */
  cpf: "00000000191",
  cpfPontuado: "000.000.001-91",
  nomeCompleto: "Candidata Sintetica De Teste",
  primeiroNome: "Candidata",
  cargoId: "22222222-2222-4222-8222-222222222222",
  codCliente: "C9999",
  tipoRgId: "33333333-3333-4333-8333-333333333333",
  tipoCtpsId: "44444444-4444-4444-8444-444444444444",
  tipoCompResId: "55555555-5555-4555-8555-555555555555",
  tipoSoNaReguaId: "66666666-6666-4666-8666-666666666666",
};

type Exigencia = "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";

/** Uma linha de `documentos_admissao`, que é a FONTE das casas. */
type LinhaDocumento = {
  tipoDocumentoId: string;
  codigo: string;
  nome: string;
  status: "PENDENTE" | "ENTREGUE" | "INCONFORME" | "AGUARDANDO_AUDITORIA";
  reprovacoes: number;
  /**
   * Cabe MAIS UM arquivo nesta pendência? Verdadeiro é o caso comum (nada em aberto). Falso é o
   * caso do veto: existe credencial confirmada ainda sem desfecho, e a régua do arquivo único
   * (`domain/portal-arquivo-unico.ts`) recusaria o reenvio.
   */
  cabeOutroArquivo: boolean;
};

/** Uma linha de `regua_documental`, que diz só a EXIGÊNCIA daquele (cliente + cargo). */
type LinhaRegua = { tipoDocumentoId: string; codigo: string; exigencia: Exigencia };

function documento(parcial: Partial<LinhaDocumento> & { codigo: string; tipoDocumentoId: string }): LinhaDocumento {
  return {
    tipoDocumentoId: parcial.tipoDocumentoId,
    codigo: parcial.codigo,
    nome: parcial.nome ?? parcial.codigo,
    status: parcial.status ?? "PENDENTE",
    reprovacoes: parcial.reprovacoes ?? 0,
    cabeOutroArquivo: parcial.cabeOutroArquivo ?? true,
  };
}

/**
 * BANCO DE MENTIRINHA, no molde dos specs vizinhos (`portal-teto-tentativas.spec.ts`): vitest, sem
 * banco real. Ele responde pela PROJEÇÃO pedida, e não pela ordem das chamadas, porque a ordem é
 * detalhe de implementação e o teste não pode prender o autor a uma sequência de consultas.
 *
 * ELE DISTINGUE AS DUAS TABELAS DE PROPÓSITO, e essa distinção é metade do valor deste arquivo: a
 * consulta que pede `status` ou `reprovacoes` recebe os DOCUMENTOS (com a exigência já resolvida,
 * para quem preferir um join só); a consulta que pede apenas `exigencia` recebe a RÉGUA INTEIRA,
 * que aqui é maior que a lista de documentos, exatamente como em produção.
 *
 * NOTA PARA QUEM FOR IMPLEMENTAR: se a sua consulta usar outros nomes de campo, ajuste o
 * despachante abaixo, nunca a asserção. O que este arquivo afirma é o COMPORTAMENTO.
 */
function banco(cenario: {
  cargo?: string;
  cliente?: string;
  documentos: LinhaDocumento[];
  regua: LinhaRegua[];
}) {
  /** Todo valor de string que passou por qualquer argumento de consulta. */
  const capturados: string[] = [];

  /**
   * A varredura tem GUARDA DE CICLO e TETO, e os dois são necessários: o argumento de uma consulta
   * Drizzle é um grafo de objetos de coluna que apontam de volta para a tabela, então varrer sem
   * guarda estoura em leque e o teste trava sem falhar, que é o pior desfecho possível.
   */
  const vistos = new WeakSet<object>();
  const capturar = (valor: unknown, profundidade = 0) => {
    if (profundidade > 14 || valor == null || capturados.length > 20000) return;
    if (typeof valor === "string") {
      capturados.push(valor);
      return;
    }
    if (typeof valor !== "object") return;
    if (vistos.has(valor as object)) return;
    vistos.add(valor as object);
    for (const v of Object.values(valor as Record<string, unknown>)) capturar(v, profundidade + 1);
  };

  const exigenciaDe = (tipoDocumentoId: string): Exigencia =>
    cenario.regua.find((r) => r.tipoDocumentoId === tipoDocumentoId)?.exigencia ?? "NAO_OBRIGATORIO";

  const linhasDocumento = cenario.documentos.map((d) => ({
    ...d,
    id: `doc-${d.codigo}`,
    codigoTipoDocumento: d.codigo,
    nomeTipoDocumento: d.nome,
    // O mesmo valor sob os três nomes plausíveis da coluna de estado do documento: o teste afirma
    // comportamento, e não obriga o autor a batizar a projeção de um jeito só.
    estado: d.status,
    estadoDocumento: d.status,
    statusDocumento: d.status,
    exigencia: exigenciaDe(d.tipoDocumentoId),
    // A régua do CLIENTE INTEIRO, que é como as linhas existentes ficam (nulo = sem vínculo).
    clienteVinculoId: null,
  }));

  /** Quantas reprovações cada pendência tem. É o que o colaborador de credencial lê. */
  const reprovacoesPorTipo = new Map(
    cenario.documentos.map((d) => [d.tipoDocumentoId, d.reprovacoes]),
  );
  /** Se cabe outro arquivo na pendência. Mesma fonte da emissão, perguntada ao colaborador. */
  const cabePorTipo = new Map(cenario.documentos.map((d) => [d.tipoDocumentoId, d.cabeOutroArquivo]));

  const linhasRegua = cenario.regua.map((r) => ({
    ...r,
    codigoTipoDocumento: r.codigo,
    nome: cenario.documentos.find((d) => d.tipoDocumentoId === r.tipoDocumentoId)?.nome ?? r.codigo,
  }));

  const cabecalho = [
    {
      id: SINTETICO.admissaoId,
      admissaoId: SINTETICO.admissaoId,
      cpf: SINTETICO.cpf,
      nomeCompleto: SINTETICO.nomeCompleto,
      nome: SINTETICO.nomeCompleto,
      primeiroNome: SINTETICO.primeiroNome,
      cargo: cenario.cargo ?? "Auxiliar De Limpeza",
      cargoId: SINTETICO.cargoId,
      cliente: cenario.cliente ?? "Operacao Sintetica",
      codCliente: SINTETICO.codCliente,
    },
  ];

  const linhasPara = (proj: Record<string, unknown> | undefined) => {
    const alvo = Object.keys(proj ?? {}).join(",").toLowerCase();
    // A consulta que pede o ESTADO do documento é a das casas, mesmo trazendo a exigência junto
    // (que é o caso do join único). A que pede só exigência é a da régua.
    if (/estado|status|reprovac/.test(alvo)) return linhasDocumento;
    if (/exigencia/.test(alvo)) return linhasRegua;
    if (/cargo|cliente|primeironome|nomecompleto|cpf|nome/.test(alvo)) return cabecalho;
    return [];
  };

  /**
   * Cadeia encadeável e "awaitável": qualquer método devolve a própria cadeia e o `await` resolve
   * nas linhas. Assim o teste não exige `from().where()` numa ordem específica, nem proíbe join.
   */
  const cadeia = (linhas: unknown[]): any =>
    new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(linhas).then(ok, erro);
          }
          return (...args: unknown[]) => {
            for (const a of args) capturar(a);
            return cadeia(linhas);
          };
        },
      },
    );

  const db = {
    select: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)),
    selectDistinct: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)),
    execute: async (consulta: unknown) => {
      capturar(consulta);
      return linhasDocumento;
    },
    query: {
      admissoes: {
        findFirst: async (args?: unknown) => {
          capturar(args);
          return cabecalho[0];
        },
      },
      documentosAdmissao: {
        findMany: async (args?: unknown) => {
          capturar(args);
          return linhasDocumento;
        },
      },
      reguaDocumental: {
        findMany: async (args?: unknown) => {
          capturar(args);
          return linhasRegua;
        },
      },
      tiposDocumento: {
        findMany: async (args?: unknown) => {
          capturar(args);
          return linhasRegua;
        },
      },
    },
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };

  return { db, capturados, reprovacoesPorTipo, cabePorTipo };
}

const config = { get: (chave: string) => ({ PORTAL_LOG_PEPPER: "pepper" })[chave] } as never;
const trilhaLog = { configurada: () => true, registrar: vi.fn(async () => {}) } as never;

/**
 * O COLABORADOR QUE JÁ EXISTE, e ele é reusado de propósito: quantas tentativas restam sai de
 * `PortalCredencialService.situacaoParaATela`, que é a fonte que a emissão e a tela do time já
 * leem. O fake não reimplementa a régua do teto, ele chama o DOMÍNIO (`situacaoDaPendencia`), de
 * modo que o número continua vindo de um lugar só, inclusive no teste.
 */
function credenciaisFake(b: ReturnType<typeof banco>) {
  const daPendencia = (tipoDocumentoId: string) => {
    const usadas = b.reprovacoesPorTipo.get(tipoDocumentoId) ?? 0;
    const situacao = situacaoDaPendencia({ reprovacoes: usadas });
    return {
      teto: TETO_REPROVACOES_POR_PENDENCIA,
      usadas: Math.min(usadas, TETO_REPROVACOES_POR_PENDENCIA),
      restantes: situacao.restantes,
      noTime: situacao.noTime,
      aviso: situacao.noTime ? "aviso fixo" : null,
    };
  };
  return {
    situacaoParaATela: async (_admissaoId: string, tipoDocumentoId: string) =>
      daPendencia(tipoDocumentoId),
    /**
     * O LOTE, que passou a ser o caminho desta tela. A versão unitária custava DUAS consultas por
     * documento, e a régua maior tem 32: a tela que o candidato abre no 4G chegava a 64 idas ao
     * banco para responder à mesma pergunta. O dono do número continua sendo o mesmo serviço, e
     * `situacaoDe` é o caso particular dele; o fake acompanha a mudança de forma, não de fonte.
     */
    situacoesParaATela: vi.fn(async (_admissaoId: string) => new Map<string, unknown>()),
    situacaoDe: (_mapa: unknown, tipoDocumentoId: string) => daPendencia(tipoDocumentoId),
    /**
     * A PERGUNTA DO VETO D-2, e ela não é detalhe de fake: a AUDITORIA escreve `INCONFORME` sem
     * tocar `reprovado_em`, então a credencial confirmada continua em aberto e a régua do arquivo
     * único recusa o reenvio. Quem sabe disso é o dono do número, e o padrão aqui é o caso comum,
     * em que não há nada em aberto.
     */
    cabeOutroArquivoNaPendencia: async (_admissaoId: string, tipoDocumentoId: string) =>
      b.cabePorTipo.get(tipoDocumentoId) ?? true,
  };
}

/** Construção permissiva: argumento a mais é inofensivo, e o teste não prende a lista de injeções. */
function servico(
  b: ReturnType<typeof banco>,
  credenciais: unknown = credenciaisFake(b),
  log: unknown = trilhaLog,
) {
  const Classe = PortalDocumentosService as unknown as new (...args: unknown[]) => {
    trilha(admissaoId: string): Promise<import("@ea/shared-types").TrilhaDoCandidato>;
  };
  // A conferência do link vivo virou uma INJEÇÃO (consolidação, 21/09/2026): entra o serviço real,
  // com o mesmo banco falso. Nenhum teste deste arquivo passa `jtiLink`, então ele sai cedo sem
  // tocar o banco, e o `config` continua sendo o argumento a mais que o comentário acima descreve.
  return new Classe(b.db, credenciais, log, new PortalLinkVivoService(b.db as never, log as never), config);
}

/** O cenário padrão: quatro documentos na admissão, e uma régua MAIOR que eles. */
const DOCUMENTOS_PADRAO: LinhaDocumento[] = [
  documento({ codigo: "RG", tipoDocumentoId: SINTETICO.tipoRgId, nome: "RG", status: "ENTREGUE" }),
  documento({
    codigo: "CTPS",
    tipoDocumentoId: SINTETICO.tipoCtpsId,
    nome: "Carteira De Trabalho",
    status: "INCONFORME",
    reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
  }),
  documento({
    codigo: "COMP_RESIDENCIA",
    tipoDocumentoId: SINTETICO.tipoCompResId,
    nome: "Comprovante De Residencia",
    status: "PENDENTE",
    reprovacoes: 1,
  }),
];

const REGUA_PADRAO: LinhaRegua[] = [
  { tipoDocumentoId: SINTETICO.tipoRgId, codigo: "RG", exigencia: "OBRIGATORIO" },
  { tipoDocumentoId: SINTETICO.tipoCtpsId, codigo: "CTPS", exigencia: "OBRIGATORIO" },
  {
    tipoDocumentoId: SINTETICO.tipoCompResId,
    codigo: "COMP_RESIDENCIA",
    exigencia: "OBRIGATORIO",
  },
  // A linha que EXISTE na régua e NÃO tem documento na admissão. Ela é o caso dos 18 excedentes
  // medidos em homologação, e não pode virar casa.
  { tipoDocumentoId: SINTETICO.tipoSoNaReguaId, codigo: "SO_NA_REGUA", exigencia: "OBRIGATORIO" },
];

const padrao = () => banco({ documentos: DOCUMENTOS_PADRAO, regua: REGUA_PADRAO });

describe("A ADMISSÃO É A DO TOKEN, e não existe porta para o id do cliente", () => {
  it("o método recebe UM argumento: quem o preenche é o controller, com o bilhete", () => {
    expect(PortalDocumentosService.prototype.trilha.length).toBe(1);
  });

  it("a consulta é feita com o id recebido no argumento", async () => {
    const b = padrao();
    await servico(b).trilha(SINTETICO.admissaoId);
    expect(b.capturados).toContain(SINTETICO.admissaoId);
  });

  it("id diferente no argumento vira consulta com aquele id, sem cache nem id fixo", async () => {
    const b = padrao();
    const outro = "99999999-9999-4999-8999-999999999999";
    await servico(b).trilha(outro);
    expect(b.capturados).toContain(outro);
    expect(b.capturados).not.toContain(SINTETICO.admissaoId);
  });

  it("a rota lê a admissão do `req.portal`, nunca de query, body ou parâmetro de caminho", () => {
    const pasta = join(__dirname);
    const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".controller.ts"));
    const achados = arquivos
      .map((f) => ({ f, texto: readFileSync(join(pasta, f), "utf8") }))
      .filter(({ texto }) => /@Get\(\s*["'`]documentos["'`]\s*\)/.test(texto));

    expect(
      achados.length,
      'nenhum controller do portal declara @Get("documentos")',
    ).toBeGreaterThan(0);

    for (const { f, texto } of achados) {
      const inicio = texto.search(/@Get\(\s*["'`]documentos["'`]\s*\)/);
      const corpo = texto.slice(inicio, inicio + 900);
      const assinatura = corpo.slice(0, corpo.indexOf("{") + 1);
      // A assinatura só recebe a REQUISIÇÃO: nada de query, body ou parâmetro de caminho.
      expect(assinatura, `${f}: a rota tem de receber a requisição`).toMatch(/@Req\(/);
      expect(assinatura, `${f}: @Query abre a trilha do outro`).not.toMatch(/@Query\(/);
      expect(assinatura, `${f}: @Body abre a trilha do outro`).not.toMatch(/@Body\(/);
      expect(assinatura, `${f}: @Param abre a trilha do outro`).not.toMatch(/@Param\(/);
      // E o id entregue ao serviço é o do bilhete, lido do `req.portal`.
      expect(corpo, `${f}: o id tem de vir do bilhete`).toMatch(/req\.portal/);
      expect(corpo, `${f}: a rota é protegida pelo guard de sessão`).toMatch(/PortalSessaoGuard/);
    }
  });

  it("a rota vive atrás do PortalSessaoGuard", () => {
    const pasta = join(__dirname);
    const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".controller.ts"));
    const comRota = arquivos
      .map((f) => readFileSync(join(pasta, f), "utf8"))
      .filter((t) => /@Get\(\s*["'`]documentos["'`]\s*\)/.test(t));
    expect(comRota.length).toBeGreaterThan(0);
    for (const texto of comRota) {
      const inicio = texto.search(/@Get\(\s*["'`]documentos["'`]\s*\)/);
      expect(texto.slice(Math.max(0, inicio - 300), inicio + 300)).toMatch(/PortalSessaoGuard/);
    }
  });
});

describe("§A.6: A RESPOSTA NÃO CARREGA DADO PESSOAL NEM IDENTIFICADOR INTERNO", () => {
  it("o JSON serializado não contém CPF, nome completo, id de admissão nem id de tipo", async () => {
    const resposta = await servico(padrao()).trilha(SINTETICO.admissaoId);
    const json = JSON.stringify(resposta);

    const proibidos: Array<[string, string]> = [
      ["CPF sintético", SINTETICO.cpf],
      ["CPF sintético pontuado", SINTETICO.cpfPontuado],
      ["nome completo", SINTETICO.nomeCompleto],
      ["id da admissão", SINTETICO.admissaoId],
      ["id do tipo de documento (RG)", SINTETICO.tipoRgId],
      ["id do tipo de documento (CTPS)", SINTETICO.tipoCtpsId],
      ["id do tipo de documento (comprovante)", SINTETICO.tipoCompResId],
      ["id do cargo", SINTETICO.cargoId],
    ];
    for (const [rotulo, valor] of proibidos) {
      expect(json, `a resposta vazou ${rotulo}`).not.toContain(valor);
    }
  });

  it("o primeiro nome vai, e só ele: é o mínimo para a Sol chamar a pessoa pelo nome", async () => {
    const resposta = await servico(padrao()).trilha(SINTETICO.admissaoId);
    expect(resposta.primeiroNome).toBe(SINTETICO.primeiroNome);
    expect(resposta.primeiroNome).not.toContain(" ");
  });

  it("nome composto do banco é reduzido ao primeiro nome, sem sobrenome nenhum", async () => {
    const b = banco({ cliente: "Operacao Alfa", documentos: DOCUMENTOS_PADRAO, regua: REGUA_PADRAO });
    const resposta = await servico(b).trilha(SINTETICO.admissaoId);
    // "Sintetica" é o SOBRENOME do fixture, e o cliente deste caso não o repete de propósito.
    expect(JSON.stringify(resposta)).not.toContain("Sintetica");
  });

  it("a tela recebe o CÓDIGO do tipo, que é por onde ela pede a credencial de escrita", async () => {
    const resposta = await servico(padrao()).trilha(SINTETICO.admissaoId);
    expect([...resposta.passos.map((p) => p.codigoTipoDocumento)].sort()).toEqual([
      "COMP_RESIDENCIA",
      "CTPS",
      "RG",
    ]);
  });
});

describe("A FONTE DOS PASSOS É `documentos_admissao`, NUNCA a régua", () => {
  it("tipo que está na régua e NÃO tem linha de documento NÃO vira casa", async () => {
    const resposta = await servico(padrao()).trilha(SINTETICO.admissaoId);
    const codigos = resposta.passos.map((p) => p.codigoTipoDocumento);

    // O caso medido: a casa existiria na tela e recusaria no toque, porque a emissão exige a linha.
    expect(codigos).not.toContain("SO_NA_REGUA");
    expect(resposta.passos).toHaveLength(DOCUMENTOS_PADRAO.length);
  });

  it("régua GRANDE e admissão PEQUENA: a contagem de casas é a dos documentos", async () => {
    // A proporção medida em homologação, reduzida: 8 linhas de régua para 2 documentos.
    const documentos = [
      documento({ codigo: "RG", tipoDocumentoId: SINTETICO.tipoRgId, nome: "RG" }),
      documento({ codigo: "CTPS", tipoDocumentoId: SINTETICO.tipoCtpsId, nome: "CTPS" }),
    ];
    const regua: LinhaRegua[] = [
      { tipoDocumentoId: SINTETICO.tipoRgId, codigo: "RG", exigencia: "OBRIGATORIO" },
      { tipoDocumentoId: SINTETICO.tipoCtpsId, codigo: "CTPS", exigencia: "OBRIGATORIO" },
      ...Array.from({ length: 6 }, (_, i) => ({
        tipoDocumentoId: `so-regua-${i}`,
        codigo: `EXCEDENTE_${i}`,
        exigencia: "OBRIGATORIO" as const,
      })),
    ];

    const resposta = await servico(banco({ documentos, regua })).trilha(SINTETICO.admissaoId);
    expect(resposta.passos).toHaveLength(2);
    expect(JSON.stringify(resposta)).not.toContain("EXCEDENTE_");
  });

  it("admissão sem documento nenhum devolve trilha vazia, e não a régua inteira", async () => {
    const resposta = await servico(banco({ documentos: [], regua: REGUA_PADRAO })).trilha(
      SINTETICO.admissaoId,
    );
    expect(resposta.passos).toEqual([]);
  });
});

describe("O ESTADO DA CASA É DERIVADO NO SERVIDOR, e a tela não remonta nada", () => {
  const umDocumento = async (linha: LinhaDocumento, exigencia: Exigencia = "OBRIGATORIO") => {
    const b = banco({
      documentos: [linha],
      regua: [{ tipoDocumentoId: linha.tipoDocumentoId, codigo: linha.codigo, exigencia }],
    });
    const { passos } = await servico(b).trilha(SINTETICO.admissaoId);
    return passos[0];
  };

  it("ENTREGUE vira ACEITO", async () => {
    const p = await umDocumento(
      documento({ codigo: "RG", tipoDocumentoId: SINTETICO.tipoRgId, status: "ENTREGUE" }),
    );
    expect(p.estado).toBe("ACEITO");
  });

  it("AGUARDANDO_AUDITORIA vira EM_ANALISE: o envio chegou e ninguém julgou ainda", async () => {
    const p = await umDocumento(
      documento({
        codigo: "RG",
        tipoDocumentoId: SINTETICO.tipoRgId,
        status: "AGUARDANDO_AUDITORIA",
      }),
    );
    expect(p.estado).toBe("EM_ANALISE");
  });

  it("INCONFORME COM TENTATIVA SOBRANDO vira AJUSTAR, não pendente comum", async () => {
    // O veto da auditoria prévia em uma linha: pendente comum e "corrija este" são convites
    // diferentes, e colapsá-los faz a tela prometer o que a emissão recusa.
    const p = await umDocumento(
      documento({
        codigo: "RG",
        tipoDocumentoId: SINTETICO.tipoRgId,
        status: "INCONFORME",
        reprovacoes: TETO_REPROVACOES_POR_PENDENCIA - 1,
      }),
    );
    expect(p.estado).toBe("AJUSTAR");
    expect(p.tentativas.restantes).toBe(1);
    expect(p.tentativas.noTime).toBe(false);
  });

  it("teto atingido vira NO_TIME, com restantes zero e o teto do domínio", async () => {
    const p = await umDocumento(
      documento({
        codigo: "CTPS",
        tipoDocumentoId: SINTETICO.tipoCtpsId,
        status: "INCONFORME",
        reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
      }),
    );
    expect(p.estado).toBe("NO_TIME");
    expect(p.tentativas.restantes).toBe(0);
    expect(p.tentativas.noTime).toBe(true);
    expect(p.tentativas.teto).toBe(TETO_REPROVACOES_POR_PENDENCIA);
    expect(p.tentativas.usadas).toBe(TETO_REPROVACOES_POR_PENDENCIA);
  });

  it("o teto vence o status PENDENTE também: NO_TIME em qualquer caso que não seja ACEITO", async () => {
    const p = await umDocumento(
      documento({
        codigo: "CTPS",
        tipoDocumentoId: SINTETICO.tipoCtpsId,
        status: "PENDENTE",
        reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
      }),
    );
    expect(p.estado).toBe("NO_TIME");
  });

  it("acima do teto continua NO_TIME, e restantes não fica negativo", async () => {
    const p = await umDocumento(
      documento({
        codigo: "CTPS",
        tipoDocumentoId: SINTETICO.tipoCtpsId,
        status: "INCONFORME",
        reprovacoes: TETO_REPROVACOES_POR_PENDENCIA + 2,
      }),
    );
    expect(p.estado).toBe("NO_TIME");
    expect(p.tentativas.restantes).toBe(0);
  });

  it("ENTREGUE vence o teto: documento aceito não vira casa roxa", async () => {
    // O caso real: o candidato errou três vezes, o time resolveu e o documento entrou. A contagem
    // velha continua na tabela, e tratá-la como decisiva devolveria a casa roxa a quem já terminou.
    const p = await umDocumento(
      documento({
        codigo: "RG",
        tipoDocumentoId: SINTETICO.tipoRgId,
        status: "ENTREGUE",
        reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
      }),
    );
    expect(p.estado).toBe("ACEITO");
  });

  it("PENDENTE sem envio nenhum continua PENDENTE, com o teto inteiro na mão", async () => {
    const p = await umDocumento(
      documento({ codigo: "RG", tipoDocumentoId: SINTETICO.tipoRgId, status: "PENDENTE" }),
    );
    expect(p.estado).toBe("PENDENTE");
    expect(p.tentativas.restantes).toBe(TETO_REPROVACOES_POR_PENDENCIA);
    expect(p.tentativas.usadas).toBe(0);
  });

  it("no cenário misto, cada casa recebe o seu estado", async () => {
    const { passos } = await servico(padrao()).trilha(SINTETICO.admissaoId);
    const porCodigo = Object.fromEntries(passos.map((p) => [p.codigoTipoDocumento, p.estado]));
    expect(porCodigo).toEqual({
      RG: "ACEITO",
      CTPS: "NO_TIME",
      COMP_RESIDENCIA: "PENDENTE",
    });
  });

  it("todo estado devolvido pertence ao contrato: nenhum valor inventado sai daqui", async () => {
    const { passos } = await servico(padrao()).trilha(SINTETICO.admissaoId);
    for (const p of passos) {
      expect(["ACEITO", "EM_ANALISE", "AJUSTAR", "NO_TIME", "PENDENTE"]).toContain(p.estado);
    }
  });
});

describe("A EXIGÊNCIA VEM DA RÉGUA DE (CLIENTE + CARGO), §A.3 regra 4", () => {
  it("a consulta filtra pelo cliente e pelo cargo da admissão", async () => {
    const b = padrao();
    await servico(b).trilha(SINTETICO.admissaoId);
    expect(b.capturados).toContain(SINTETICO.codCliente);
    expect(b.capturados).toContain(SINTETICO.cargoId);
  });

  it("mudou o cargo, mudou a exigência do MESMO documento", async () => {
    const documentos = [
      documento({ codigo: "CNH", tipoDocumentoId: SINTETICO.tipoRgId, nome: "CNH" }),
    ];
    const comoAuxiliar = banco({
      cargo: "Auxiliar De Limpeza",
      documentos,
      regua: [{ tipoDocumentoId: SINTETICO.tipoRgId, codigo: "CNH", exigencia: "FACULTATIVO" }],
    });
    const comoMotorista = banco({
      cargo: "Motorista",
      documentos,
      regua: [{ tipoDocumentoId: SINTETICO.tipoRgId, codigo: "CNH", exigencia: "OBRIGATORIO" }],
    });

    const a = await servico(comoAuxiliar).trilha(SINTETICO.admissaoId);
    const m = await servico(comoMotorista).trilha(SINTETICO.admissaoId);

    expect(a.cargo).toBe("Auxiliar De Limpeza");
    expect(m.cargo).toBe("Motorista");
    expect(a.passos[0].exigencia).toBe("FACULTATIVO");
    expect(m.passos[0].exigencia).toBe("OBRIGATORIO");
  });

  it("OBRIGATORIO e FACULTATIVO atravessam sem tradução", async () => {
    const documentos = [
      documento({ codigo: "RG", tipoDocumentoId: SINTETICO.tipoRgId, nome: "RG" }),
      documento({ codigo: "RESERVISTA", tipoDocumentoId: SINTETICO.tipoCtpsId, nome: "Reservista" }),
    ];
    const regua: LinhaRegua[] = [
      { tipoDocumentoId: SINTETICO.tipoRgId, codigo: "RG", exigencia: "OBRIGATORIO" },
      { tipoDocumentoId: SINTETICO.tipoCtpsId, codigo: "RESERVISTA", exigencia: "FACULTATIVO" },
    ];

    const { passos } = await servico(banco({ documentos, regua })).trilha(SINTETICO.admissaoId);
    const porCodigo = Object.fromEntries(passos.map((p) => [p.codigoTipoDocumento, p.exigencia]));
    expect(porCodigo).toEqual({ RG: "OBRIGATORIO", RESERVISTA: "FACULTATIVO" });
  });

  it("NAO_OBRIGATORIO também atravessa como está, sem virar facultativo", async () => {
    const documentos = [
      documento({ codigo: "EXTRA", tipoDocumentoId: SINTETICO.tipoRgId, nome: "Extra" }),
    ];
    const regua: LinhaRegua[] = [
      { tipoDocumentoId: SINTETICO.tipoRgId, codigo: "EXTRA", exigencia: "NAO_OBRIGATORIO" },
    ];
    const { passos } = await servico(banco({ documentos, regua })).trilha(SINTETICO.admissaoId);
    expect(passos[0].exigencia).toBe("NAO_OBRIGATORIO");
  });

  it("o cabeçalho traz cargo e cliente para a Sol situar a pessoa", async () => {
    const b = banco({
      cargo: "Motorista",
      cliente: "Operacao Sintetica",
      documentos: DOCUMENTOS_PADRAO,
      regua: REGUA_PADRAO,
    });
    const resposta = await servico(b).trilha(SINTETICO.admissaoId);
    expect(resposta.cargo).toBe("Motorista");
    expect(resposta.cliente).toBe("Operacao Sintetica");
  });

  it("o nome exibido é o do catálogo, sem a tela ter de montar rótulo", async () => {
    const { passos } = await servico(padrao()).trilha(SINTETICO.admissaoId);
    expect([...passos.map((p) => p.nome)].sort()).toEqual([
      "Carteira De Trabalho",
      "Comprovante De Residencia",
      "RG",
    ]);
  });
});

describe("A ORDEM DAS CASAS: obrigatório, facultativo, não obrigatório, e por nome dentro do grupo", () => {
  /** Entra fora de ordem de propósito: quem ordena é o servidor, não o acaso da consulta. */
  const documentos = [
    documento({ codigo: "ZZZ_OPC", tipoDocumentoId: "t-zzz-opc", nome: "Zebra Opcional" }),
    documento({ codigo: "B_OBR", tipoDocumentoId: "t-b-obr", nome: "Beta Obrigatorio" }),
    documento({ codigo: "A_FAC", tipoDocumentoId: "t-a-fac", nome: "Alfa Facultativo" }),
    documento({ codigo: "A_OBR", tipoDocumentoId: "t-a-obr", nome: "Alfa Obrigatorio" }),
    documento({ codigo: "A_OPC", tipoDocumentoId: "t-a-opc", nome: "Alfa Opcional" }),
    documento({ codigo: "Z_FAC", tipoDocumentoId: "t-z-fac", nome: "Zebra Facultativa" }),
  ];
  const regua: LinhaRegua[] = [
    { tipoDocumentoId: "t-zzz-opc", codigo: "ZZZ_OPC", exigencia: "NAO_OBRIGATORIO" },
    { tipoDocumentoId: "t-b-obr", codigo: "B_OBR", exigencia: "OBRIGATORIO" },
    { tipoDocumentoId: "t-a-fac", codigo: "A_FAC", exigencia: "FACULTATIVO" },
    { tipoDocumentoId: "t-a-obr", codigo: "A_OBR", exigencia: "OBRIGATORIO" },
    { tipoDocumentoId: "t-a-opc", codigo: "A_OPC", exigencia: "NAO_OBRIGATORIO" },
    { tipoDocumentoId: "t-z-fac", codigo: "Z_FAC", exigencia: "FACULTATIVO" },
  ];

  it("os três grupos saem nesta ordem, e dentro de cada um por nome", async () => {
    const { passos } = await servico(banco({ documentos, regua })).trilha(SINTETICO.admissaoId);
    expect(passos.map((p) => p.nome)).toEqual([
      "Alfa Obrigatorio",
      "Beta Obrigatorio",
      "Alfa Facultativo",
      "Zebra Facultativa",
      "Alfa Opcional",
      "Zebra Opcional",
    ]);
  });

  it("a ordem não depende da ordem em que as linhas chegam do banco", async () => {
    const invertidos = [...documentos].reverse();
    const { passos } = await servico(banco({ documentos: invertidos, regua })).trilha(
      SINTETICO.admissaoId,
    );
    expect(passos.map((p) => p.exigencia)).toEqual([
      "OBRIGATORIO",
      "OBRIGATORIO",
      "FACULTATIVO",
      "FACULTATIVO",
      "NAO_OBRIGATORIO",
      "NAO_OBRIGATORIO",
    ]);
  });
});

describe("A CASA NÃO CONVIDA AO QUE A EMISSÃO RECUSA (o veto do arquivo único)", () => {
  /**
   * O CAMINHO PROVADO PELA AUDITORIA: a auditoria escreve `INCONFORME` sem tocar `reprovado_em`,
   * então a credencial confirmada segue EM ABERTO e `domain/portal-arquivo-unico.ts` recusa o
   * reenvio. Uma casa `AJUSTAR` ali seria a tela prometendo o que a rota nega no toque, que é o
   * mesmo defeito que motivou os cinco estados.
   *
   * Por isso o estado não sai só do status do documento: o serviço PERGUNTA ao dono do número se
   * cabe outro arquivo, e o resultado entra na precedência.
   */
  const casaDe = async (
    status: LinhaDocumento["status"],
    cabeOutroArquivo: boolean,
    reprovacoes = 0,
  ) => {
    const b = banco({
      documentos: [
        documento({
          codigo: "RG",
          tipoDocumentoId: SINTETICO.tipoRgId,
          status,
          reprovacoes,
          cabeOutroArquivo,
        }),
      ],
      regua: [{ tipoDocumentoId: SINTETICO.tipoRgId, codigo: "RG", exigencia: "OBRIGATORIO" }],
    });
    const { passos } = await servico(b).trilha(SINTETICO.admissaoId);
    return passos[0].estado;
  };

  it("INCONFORME com envio EM ABERTO é EM_ANALISE, nunca AJUSTAR", async () => {
    expect(await casaDe("INCONFORME", false)).toBe("EM_ANALISE");
  });

  it("INCONFORME com a pendência LIVRE é AJUSTAR: aí o reenvio existe de verdade", async () => {
    expect(await casaDe("INCONFORME", true)).toBe("AJUSTAR");
  });

  it("PENDENTE com envio em aberto também é EM_ANALISE: o primeiro arquivo ainda está conosco", async () => {
    expect(await casaDe("PENDENTE", false)).toBe("EM_ANALISE");
  });

  it("ACEITO vence a pergunta nova: documento entregue não volta a EM_ANALISE", async () => {
    expect(await casaDe("ENTREGUE", false)).toBe("ACEITO");
  });

  it("NO_TIME vence a pergunta nova: quem caiu para o time não vira EM_ANALISE", async () => {
    expect(await casaDe("INCONFORME", false, TETO_REPROVACOES_POR_PENDENCIA)).toBe("NO_TIME");
  });

  it("a pergunta é feita UMA vez por passo, com a admissão do argumento e o tipo daquele passo", async () => {
    const b = padrao();
    const e = espiaoDoVeto();

    await servico(b, e.credenciais).trilha(SINTETICO.admissaoId);

    expect(e.credenciais.cabeOutroArquivoNaPendencia).toHaveBeenCalledTimes(
      DOCUMENTOS_PADRAO.length,
    );
    for (const [admissaoId] of e.chamadas) expect(admissaoId).toBe(SINTETICO.admissaoId);
    expect(e.chamadas.map(([, tipo]) => tipo).sort()).toEqual(
      [SINTETICO.tipoRgId, SINTETICO.tipoCtpsId, SINTETICO.tipoCompResId].sort(),
    );
  });
});

/** Espião só da pergunta nova, com a contagem vinda do domínio como no caminho comum. */
function espiaoDoVeto() {
  const chamadas: Array<[string, string]> = [];
  return {
    chamadas,
    credenciais: {
      situacaoParaATela: async () => ({
        teto: TETO_REPROVACOES_POR_PENDENCIA,
        usadas: 0,
        restantes: TETO_REPROVACOES_POR_PENDENCIA,
        noTime: false,
        aviso: null,
      }),
      situacoesParaATela: async () => new Map<string, unknown>(),
      situacaoDe: () => ({
        teto: TETO_REPROVACOES_POR_PENDENCIA,
        usadas: 0,
        restantes: TETO_REPROVACOES_POR_PENDENCIA,
        noTime: false,
        aviso: null,
      }),
      cabeOutroArquivoNaPendencia: vi.fn(async (admissaoId: string, tipoDocumentoId: string) => {
        chamadas.push([admissaoId, tipoDocumentoId]);
        return true;
      }),
    },
  };
}

/**
 * O TIPO INATIVO NÃO VIRA CASA: REQUISITO REAL, SEM TESTE AQUI, E A AUSÊNCIA É DECLARADA.
 *
 * A consulta dos passos passou a exigir `tipos_documento.ativo = true`, pela mesma razão da
 * emissão: o catálogo é VIVO (§A.3), `admin/tipos-documento` INATIVA por flag sem apagar as linhas
 * de `documentos_admissao` que já existiam, e sem o predicado o tipo inativado continuaria como
 * casa PENDENTE, com o candidato levando 400 "Este documento não faz parte da sua lista" a cada
 * toque.
 *
 * POR QUE ESTE ARQUIVO NÃO O AFIRMA: o banco de mentirinha devolve as linhas do cenário sem
 * executar predicado de SQL, então ele não FILTRA o inativo como o Postgres filtra. E a tentativa
 * de afirmar a ESTRUTURA no lugar do comportamento foi MEDIDA e DESCARTADA: procurar a coluna
 * `ativo` nos argumentos capturados passa mesmo com o predicado removido (conferido contra uma
 * cópia descartável do serviço, sem a condição: 45 de 45 continuaram verdes), porque a tabela
 * inteira viaja como argumento do join e leva os nomes de todas as suas colunas junto.
 *
 * Teste que não sabe ficar vermelho é pior que teste nenhum, porque ele é lido como cobertura.
 * A prova deste requisito precisa de um teste com BANCO REAL, ou de um fake que interprete o
 * `where`, que seria reimplementar a Drizzle dentro do teste.
 */

describe("A CONTAGEM DE TENTATIVAS NÃO NASCE AQUI: ela vem de quem já é dono dela", () => {
  /**
   * A condição da auditoria, em uma frase: já existem DOIS leitores da contagem de reprovações (a
   * emissão de credencial e a tela do time), e um terceiro seria a terceira verdade sobre o número
   * que TRANCA a pessoa fora do documento. A divergência entre eles só apareceria no dia em que um
   * estivesse errado, que é o pior dia para descobrir.
   */
  function espiao(
    valor: {
      teto: number;
      usadas: number;
      restantes: number;
      noTime: boolean;
      aviso: string | null;
    },
    cabeOutroArquivo = true,
  ) {
    const chamadas: Array<[string, string]> = [];
    const admissoesDoLote: string[] = [];
    return {
      chamadas,
      admissoesDoLote,
      credenciais: {
        situacaoParaATela: vi.fn(async (admissaoId: string, tipoDocumentoId: string) => {
          chamadas.push([admissaoId, tipoDocumentoId]);
          return valor;
        }),
        // O LOTE é pedido UMA vez, com a admissão; `situacaoDe` é que responde por passo. As duas
        // chamadas continuam sendo espionadas, então o que este bloco afirma não mudou: quem conta
        // é o dono do número, e a admissão é a do argumento.
        situacoesParaATela: vi.fn(async (admissaoId: string) => {
          admissoesDoLote.push(admissaoId);
          return new Map<string, unknown>();
        }),
        situacaoDe: (_mapa: unknown, tipoDocumentoId: string) => {
          chamadas.push([SINTETICO.admissaoId, tipoDocumentoId]);
          return valor;
        },
        cabeOutroArquivoNaPendencia: vi.fn(async () => cabeOutroArquivo),
      },
    };
  }

  const SITUACAO = { teto: 3, usadas: 2, restantes: 1, noTime: false, aviso: null };

  it("pede o LOTE uma vez só, e responde por cada passo, com a admissão do argumento", async () => {
    const b = padrao();
    const e = espiao(SITUACAO);

    await servico(b, e.credenciais).trilha(SINTETICO.admissaoId);

    // ANTES ERA UMA CHAMADA POR PASSO, e a asserção prendia esse número. Ela passou a prender o
    // oposto, que é o que a frente da identidade entregou: UMA consulta em lote para a tela
    // inteira. O que NÃO mudou, e continua sendo o ponto deste bloco, é que quem responde é o dono
    // do número, com a admissão do argumento, e que cada passo recebe a situação DELE.
    expect(e.credenciais.situacoesParaATela).toHaveBeenCalledTimes(1);
    expect(e.admissoesDoLote).toEqual([SINTETICO.admissaoId]);
    expect(e.chamadas).toHaveLength(DOCUMENTOS_PADRAO.length);
    for (const [admissaoId] of e.chamadas) expect(admissaoId).toBe(SINTETICO.admissaoId);
  });

  it("e com o id do tipo DAQUELE passo, nunca com um id fixo", async () => {
    const b = padrao();
    const e = espiao(SITUACAO);

    await servico(b, e.credenciais).trilha(SINTETICO.admissaoId);

    expect(e.chamadas.map(([, tipo]) => tipo).sort()).toEqual(
      [SINTETICO.tipoRgId, SINTETICO.tipoCtpsId, SINTETICO.tipoCompResId].sort(),
    );
  });

  it("o `tentativas` da resposta é o que veio de lá, sem recálculo no meio do caminho", async () => {
    const b = padrao();
    const e = espiao(SITUACAO);

    const { passos } = await servico(b, e.credenciais).trilha(SINTETICO.admissaoId);

    for (const p of passos) expect(p.tentativas).toEqual(SITUACAO);
  });

  it("NO_TIME sai do `noTime` do dono da contagem, e não de uma conta feita aqui", async () => {
    // O documento está PENDENTE e o banco de mentirinha não tem reprovação nenhuma: a única fonte
    // possível para a casa roxa é a resposta do colaborador. Recontando por conta própria, o
    // serviço devolveria PENDENTE e este teste ficaria vermelho.
    const b = banco({
      documentos: [documento({ codigo: "RG", tipoDocumentoId: SINTETICO.tipoRgId, status: "PENDENTE" })],
      regua: [{ tipoDocumentoId: SINTETICO.tipoRgId, codigo: "RG", exigencia: "OBRIGATORIO" }],
    });
    const e = espiao({ teto: 3, usadas: 3, restantes: 0, noTime: true, aviso: "aviso fixo" });

    const { passos } = await servico(b, e.credenciais).trilha(SINTETICO.admissaoId);

    expect(passos[0].estado).toBe("NO_TIME");
    expect(passos[0].tentativas.noTime).toBe(true);
  });

  it("ACEITO continua vencendo o `noTime`: documento entregue não vira casa roxa", async () => {
    const b = banco({
      documentos: [documento({ codigo: "RG", tipoDocumentoId: SINTETICO.tipoRgId, status: "ENTREGUE" })],
      regua: [{ tipoDocumentoId: SINTETICO.tipoRgId, codigo: "RG", exigencia: "OBRIGATORIO" }],
    });
    const e = espiao({ teto: 3, usadas: 3, restantes: 0, noTime: true, aviso: "aviso fixo" });

    const { passos } = await servico(b, e.credenciais).trilha(SINTETICO.admissaoId);
    expect(passos[0].estado).toBe("ACEITO");
  });
});

describe("LER A PRÓPRIA LISTA NÃO É FAIL-CLOSED: log quebrado não tira a trilha do candidato", () => {
  it("o registro do evento falhando, a trilha sai assim mesmo", async () => {
    // A emissão se recusa a conceder sem trilha configurada, porque escrita sem registro é escrita
    // sem dono. A LEITURA é o oposto: ninguém pode ficar sem ver a própria lista de documentos
    // porque o pepper do log não estava configurado.
    const b = padrao();
    const logQuebrado = {
      configurada: () => true,
      registrar: vi.fn(async () => {
        throw new Error("PORTAL_LOG_PEPPER ausente");
      }),
    };

    const resposta = await servico(b, credenciaisFake(b), logQuebrado).trilha(SINTETICO.admissaoId);

    expect(resposta.passos).toHaveLength(DOCUMENTOS_PADRAO.length);
  });

  it("e sai também quando o log não está configurado", async () => {
    const b = padrao();
    const logDesligado = { configurada: () => false, registrar: vi.fn(async () => {}) };

    const resposta = await servico(b, credenciaisFake(b), logDesligado).trilha(SINTETICO.admissaoId);

    expect(resposta.passos).toHaveLength(DOCUMENTOS_PADRAO.length);
  });
});

describe("OS LIMITES VÊM DO SERVIDOR, para a tela recusar antes de gastar credencial", () => {
  it("bytes e tipos aceitos são os MESMOS do domínio, nunca números repetidos na tela", async () => {
    const { limites } = await servico(padrao()).trilha(SINTETICO.admissaoId);
    expect(limites.bytesMaxArquivo).toBe(LIMITES_PORTAL.BYTES_MAX_ARQUIVO);
    expect(limites.tiposAceitos).toEqual([...TIPOS_ACEITOS_PORTAL]);
  });
});
