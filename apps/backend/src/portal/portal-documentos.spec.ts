import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { LIMITES_PORTAL, TIPOS_ACEITOS_PORTAL } from "../domain/portal-credencial";
import {
  TETO_REPROVACOES_POR_PENDENCIA,
  AVISO_PENDENCIA_NO_TIME,
} from "../domain/portal-tentativas";
import { PortalDocumentosService } from "./portal-documentos.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";

/**
 * A TRILHA DA SOL, do lado do serviço. Vitest com fakes, sem banco real, no molde do
 * `portal-teto-tentativas.spec.ts`.
 *
 * AS CINCO COISAS QUE ESTE ARQUIVO TRAVA:
 *  1. os passos saem de `documentos_admissao`, e a régua entra só pela `exigencia`. Casa que a
 *     emissão recusaria não pode aparecer no tabuleiro;
 *  2. o estado da casa é derivado no servidor, com `ENTREGUE` vencendo o teto e o teto vencendo o
 *     resto;
 *  3. a contagem de tentativas é DELEGADA, e este serviço não conta nada por conta própria;
 *  4. §A.6: nem CPF, nem nome completo, nem id nenhum atravessa, e o evento de abertura não leva
 *     dado pessoal;
 *  5. ler a lista NÃO é fail-closed: trilha de log quebrada não deixa o candidato sem a lista.
 *
 * §A.6: os fixtures são sintéticos e não pertencem a ninguém.
 */

const SINTETICO = {
  admissaoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  jtiLink: "link-sintetico-1",
  cpf: "00000000191",
  nomeCompleto: "Candidata Sintetica De Teste",
  primeiroNome: "Candidata",
  cargoId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  codCliente: "C9999",
};

type LinhaDoc = {
  tipoDocumentoId: string;
  codigo: string;
  nome: string;
  estadoDocumento: string;
  exigencia: string | null;
  clienteVinculoId: string | null;
  reprovacoes?: number;
  /** Existe arquivo daquele tipo chegado e ainda sem desfecho (a régua do arquivo único). */
  envioEmAberto?: boolean;
  /**
   * A DICA DO TIPO, que vem pelo `leftJoin` de `dicas_documento` NA MESMA consulta dos passos.
   * `null` é o caso comum (tipo sem dica) e também o da dica INATIVADA, que o predicado do join
   * deixa de fora sem derrubar o documento.
   */
  dica?: string | null;
};

function doc(parcial: Partial<LinhaDoc> & { codigo: string }): LinhaDoc {
  return {
    tipoDocumentoId: parcial.tipoDocumentoId ?? `tipo-${parcial.codigo}`,
    codigo: parcial.codigo,
    nome: parcial.nome ?? parcial.codigo,
    estadoDocumento: parcial.estadoDocumento ?? "PENDENTE",
    exigencia: parcial.exigencia === undefined ? "OBRIGATORIO" : parcial.exigencia,
    clienteVinculoId: parcial.clienteVinculoId ?? null,
    reprovacoes: parcial.reprovacoes ?? 0,
    envioEmAberto: parcial.envioEmAberto ?? false,
    dica: parcial.dica ?? null,
  };
}

/**
 * Banco de mentirinha: cadeia encadeável e "awaitável", que responde pela PROJEÇÃO pedida. A ordem
 * das chamadas é detalhe de implementação, então o fake não a exige.
 */
type Cenario = {
  docs: LinhaDoc[];
  semAdmissao?: boolean;
  cliente?: string;
  cargo?: string;
  /**
   * A LINHA DO LINK, que a leitura passou a conferir (veto da auditoria de código). `undefined` é o
   * link vivo de sempre; `null` é a linha que não existe mais, e o resto é a linha como ela está.
   */
  link?: {
    expiraEm: Date | null;
    revogadoEm: Date | null;
    suspensoAte: Date | null;
    bloqueadoEm?: Date | null;
  } | null;
};

const LINK_VIVO = () => ({
  expiraEm: new Date(Date.now() + 3_600_000),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
});

function banco(cenario: Cenario) {
  const argumentos: string[] = [];

  // O GUARDA DE CICLO NÃO É ZELO: os argumentos são objetos do Drizzle, e tabela aponta para coluna
  // que aponta de volta para a tabela. Sem ele, a caminhada por profundidade repete o mesmo nó por
  // milhares de caminhos distintos e o teste come a memória da máquina em vez de falhar.
  const vistos = new WeakSet<object>();
  const capturar = (valor: unknown, nivel = 0) => {
    if (nivel > 8 || valor == null) return;
    if (typeof valor === "string") return void argumentos.push(valor);
    if (typeof valor !== "object") return;
    if (vistos.has(valor as object)) return;
    vistos.add(valor as object);
    for (const v of Object.values(valor as Record<string, unknown>)) capturar(v, nivel + 1);
  };

  const cabecalho = cenario.semAdmissao
    ? []
    : [
        {
          // Já cortado, porque quem corta é o SQL (ver o teste do `split_part`).
          primeiroNome: SINTETICO.primeiroNome,
          cargo: cenario.cargo ?? "Auxiliar De Limpeza",
          cliente: cenario.cliente ?? "Operacao Sintetica",
          codCliente: SINTETICO.codCliente,
          cargoId: SINTETICO.cargoId,
        },
      ];

  const linhasPara = (proj: Record<string, unknown> | undefined) => {
    const chaves = Object.keys(proj ?? {})
      .join(",")
      .toLowerCase();
    // A linha do link vem PRIMEIRO porque é a primeira consulta do fluxo: link morto não chega a
    // ler cabeçalho nenhum.
    if (chaves.includes("suspensoate")) {
      const link = cenario.link === undefined ? LINK_VIVO() : cenario.link;
      return link ? [link] : [];
    }
    if (chaves.includes("primeironome")) return cabecalho;
    if (chaves.includes("tipodocumentoid")) return cenario.docs;
    return [];
  };

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

  return {
    argumentos,
    db: { select: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)) } as never,
  };
}

/**
 * A contagem de tentativas é do `PortalCredencialService`, e aqui ela é um DUBLÊ que devolve o
 * mesmo formato. É justamente o ponto: este serviço não recalcula nada.
 */
function credenciais(docs: LinhaDoc[]) {
  const pedidos: Array<[string, string]> = [];
  const pedidosDeArquivoUnico: Array<[string, string]> = [];
  // A régua do ARQUIVO ÚNICO também é dele, e pelo mesmo motivo do teto: a emissão já decide por
  // ela, e uma segunda contagem aqui seria a segunda verdade sobre o que a rota recusa.
  const cabeOutroArquivoNaPendencia = vi.fn(async (admissaoId: string, tipoDocumentoId: string) => {
    pedidosDeArquivoUnico.push([admissaoId, tipoDocumentoId]);
    return !(docs.find((d) => d.tipoDocumentoId === tipoDocumentoId)?.envioEmAberto ?? false);
  });
  const situacaoParaATela = vi.fn(async (admissaoId: string, tipoDocumentoId: string) => {
    pedidos.push([admissaoId, tipoDocumentoId]);
    const usadas = docs.find((d) => d.tipoDocumentoId === tipoDocumentoId)?.reprovacoes ?? 0;
    const noTime = usadas >= TETO_REPROVACOES_POR_PENDENCIA;
    return {
      teto: TETO_REPROVACOES_POR_PENDENCIA,
      usadas,
      restantes: Math.max(0, TETO_REPROVACOES_POR_PENDENCIA - usadas),
      noTime,
      aviso: noTime ? AVISO_PENDENCIA_NO_TIME : null,
    };
  });
  // O LOTE, que é o caminho desta tela desde a frente da identidade: uma consulta para a admissão
  // inteira, e `situacaoDe` respondendo por passo. O dono do número é o mesmo, e a régua também.
  const situacoesParaATela = vi.fn(async (_admissaoId: string) => new Map<string, unknown>());
  const situacaoDe = (_mapa: unknown, tipoDocumentoId: string) => {
    pedidos.push([SINTETICO.admissaoId, tipoDocumentoId]);
    const usadas = docs.find((d) => d.tipoDocumentoId === tipoDocumentoId)?.reprovacoes ?? 0;
    const noTime = usadas >= TETO_REPROVACOES_POR_PENDENCIA;
    return {
      teto: TETO_REPROVACOES_POR_PENDENCIA,
      usadas,
      restantes: Math.max(0, TETO_REPROVACOES_POR_PENDENCIA - usadas),
      noTime,
      aviso: noTime ? AVISO_PENDENCIA_NO_TIME : null,
    };
  };
  return {
    pedidos,
    pedidosDeArquivoUnico,
    servico: {
      situacaoParaATela,
      situacoesParaATela,
      situacaoDe,
      cabeOutroArquivoNaPendencia,
    } as never,
    situacaoParaATela,
    situacoesParaATela,
    cabeOutroArquivoNaPendencia,
  };
}

function servico(cenario: Cenario, registrar = vi.fn(async () => {})) {
  const b = banco(cenario);
  const c = credenciais(cenario.docs);
  const trilhaLog = { registrar, configurada: () => true } as never;
  return {
    ...b,
    ...c,
    registrar,
    // O `PortalLinkVivoService` ENTRA DE VERDADE, e não como dublê: a conferência do link saiu do
    // serviço da trilha e passou a ser consumida dele (consolidação, 21/09/2026). Montando o real,
    // com o MESMO banco falso e a MESMA trilha falsa, todos os testes de comportamento deste
    // arquivo (recusa, frase única, evento, ordem) continuam provando o caminho inteiro.
    alvo: new PortalDocumentosService(
      b.db,
      c.servico,
      trilhaLog,
      new PortalLinkVivoService(b.db, trilhaLog),
    ),
  };
}

const ARQUIVO_SERVICO = readFileSync(join(__dirname, "portal-documentos.service.ts"), "utf8");
const ARQUIVO_CONTROLLER = readFileSync(join(__dirname, "portal-documentos.controller.ts"), "utf8");
/** A CASA NOVA da conferência do link vivo: é sobre ele que a afirmação estrutural passou a ser. */
const ARQUIVO_LINK_VIVO = readFileSync(join(__dirname, "portal-link-vivo.service.ts"), "utf8");

/**
 * O RECORTE DA CONSULTA DOS PASSOS. Sem ele, a busca por `.from(` cai no CABEÇALHO, que é a
 * primeira consulta do arquivo e parte de `admissoes` de propósito: o teste passava a afirmar
 * coisa sobre a consulta errada, que é pior que não testar.
 */
const CONSULTA_DOS_PASSOS = (() => {
  const inicio = ARQUIVO_SERVICO.indexOf("private async passos(");
  expect(inicio, "a consulta dos passos mudou de nome").toBeGreaterThan(-1);
  return ARQUIVO_SERVICO.slice(inicio, ARQUIVO_SERVICO.indexOf("private async registrarAbertura("));
})();

describe("A FONTE DOS PASSOS É `documentos_admissao`, e a régua só empresta a exigência", () => {
  it("cada documento da admissão vira uma casa, e a consulta é feita com o id recebido", async () => {
    const ctx = servico({ docs: [doc({ codigo: "RG" }), doc({ codigo: "CTPS" })] });
    const trilha = await ctx.alvo.trilha(SINTETICO.admissaoId);

    expect(trilha.passos).toHaveLength(2);
    expect(ctx.argumentos).toContain(SINTETICO.admissaoId);
  });

  it("a consulta parte de documentos_admissao, e NÃO da régua", () => {
    // A régua tem 32 linhas onde a admissão tem 14 documentos: partir dela desenharia 18 casas que
    // a emissão de credencial recusa no toque ("Este documento não faz parte da sua lista").
    const inicio = CONSULTA_DOS_PASSOS.indexOf(".from(");
    expect(CONSULTA_DOS_PASSOS.slice(inicio, inicio + 120)).toContain("documentosAdmissao");
    expect(ARQUIVO_SERVICO).not.toMatch(/\.from\(\s*reguaDocumental/);
  });

  it("documento sem linha de régua sai como NAO_OBRIGATORIO, nunca como obrigação inventada", async () => {
    const ctx = servico({ docs: [doc({ codigo: "TERMO_BANCO", exigencia: null })] });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos[0].exigencia).toBe("NAO_OBRIGATORIO");
  });

  it("a exigência da régua atravessa sem tradução", async () => {
    const ctx = servico({
      docs: [doc({ codigo: "RG" }), doc({ codigo: "RESERVISTA", exigencia: "FACULTATIVO" })],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos.map((p) => p.exigencia)).toEqual(["OBRIGATORIO", "FACULTATIVO"]);
  });

  it("o mesmo tipo definido no cliente e no vínculo vira UMA casa, com a do vínculo vencendo", async () => {
    const ctx = servico({
      docs: [
        doc({ codigo: "RG", tipoDocumentoId: "tipo-RG", exigencia: "OBRIGATORIO" }),
        doc({
          codigo: "RG",
          tipoDocumentoId: "tipo-RG",
          exigencia: "FACULTATIVO",
          clienteVinculoId: "vinculo-1",
        }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos).toHaveLength(1);
    expect(passos[0].exigencia).toBe("FACULTATIVO");
  });

  it("admissão sem documento nenhum devolve trilha vazia, e não estoura", async () => {
    const ctx = servico({ docs: [] });
    const trilha = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(trilha.passos).toEqual([]);
  });

  it("admissão inexistente vira 404 com mensagem única, sem dizer de quem é o id", async () => {
    const ctx = servico({ docs: [], semAdmissao: true });
    await expect(ctx.alvo.trilha(SINTETICO.admissaoId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("O ESTADO DA CASA É DERIVADO NO SERVIDOR", () => {
  const casos: Array<[string, string, number, string]> = [
    ["ENTREGUE vira ACEITO", "ENTREGUE", 0, "ACEITO"],
    ["AGUARDANDO_AUDITORIA vira EM_ANALISE", "AGUARDANDO_AUDITORIA", 0, "EM_ANALISE"],
    ["INCONFORME com tentativa sobrando vira AJUSTAR", "INCONFORME", 1, "AJUSTAR"],
    ["PENDENTE segue PENDENTE", "PENDENTE", 0, "PENDENTE"],
    ["teto atingido vira NO_TIME", "INCONFORME", TETO_REPROVACOES_POR_PENDENCIA, "NO_TIME"],
  ];

  for (const [rotulo, estadoDocumento, reprovacoes, esperado] of casos) {
    it(rotulo, async () => {
      const ctx = servico({ docs: [doc({ codigo: "RG", estadoDocumento, reprovacoes })] });
      const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
      expect(passos[0].estado).toBe(esperado);
    });
  }

  it("ENTREGUE vence o teto: quem já terminou não recebe a casa roxa de volta", async () => {
    // O caso real: errou três vezes, o time resolveu e o documento entrou. A contagem velha
    // continua na tabela, e tratá-la como decisiva trancaria quem já está pronto.
    const ctx = servico({
      docs: [
        doc({
          codigo: "RG",
          estadoDocumento: "ENTREGUE",
          reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
        }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos[0].estado).toBe("ACEITO");
  });
});

describe("O TIPO INATIVO NÃO VIRA CASA (veto D-1: a tela promete e a emissão nega)", () => {
  it("a leitura exige `ativo = true`, a MESMA segunda condição que a emissão exige", () => {
    // O catálogo é VIVO (§A.3) e `admin/tipos-documento` inativa por FLAG, sem apagar as linhas de
    // `documentos_admissao` que já existiam. Sem este predicado, o tipo inativado continuava
    // desenhado como casa PENDENTE, o candidato tocava, a emissão respondia 400 "Este documento não
    // faz parte da sua lista" e cada toque gravava um `PORTAL_CREDENCIAL_RECUSADA`.
    expect(ARQUIVO_SERVICO).toMatch(/eq\(\s*tiposDocumento\.ativo,\s*true\s*\)/);
  });

  it("e a condição está no JOIN do catálogo, junto do casamento por id", () => {
    // O recorte é o da consulta DOS PASSOS: o primeiro `innerJoin` do arquivo é o do candidato, no
    // cabeçalho, e afirmar sobre ele seria testar outra coisa.
    const inicio = CONSULTA_DOS_PASSOS.indexOf(".innerJoin(");
    const janela = CONSULTA_DOS_PASSOS.slice(inicio, inicio + 500);
    expect(janela).toContain("tiposDocumento.id");
    expect(janela).toMatch(/tiposDocumento\.ativo/);
  });

  it("a emissão continua exigindo o mesmo, e é dela que esta régua é cópia", () => {
    // Se um dia a emissão deixar de filtrar por `ativo`, é este teste que avisa que as duas pontas
    // deixaram de concordar, que é o defeito inteiro desta classe de veto.
    const emissao = readFileSync(join(__dirname, "portal-credencial.service.ts"), "utf8");
    expect(emissao).toMatch(/eq\(tiposDocumento\.ativo,\s*true\)/);
  });
});

describe("NÃO CABER OUTRO ARQUIVO VIRA `EM_ANALISE` (veto D-2: a casa AJUSTAR virava beco)", () => {
  it("INCONFORME com envio em aberto sai EM_ANALISE, e não AJUSTAR", async () => {
    // O caminho provado: o candidato envia, a credencial fica CONFIRMADA e NÃO reprovada, e a
    // AUDITORIA escreve `INCONFORME` (estado que o portal nunca escreve) sem tocar `reprovado_em`
    // nem `liberado_em`. A casa saía `AJUSTAR`, com botão de envio, e a rota recusava o toque com
    // `ARQUIVO_JA_ENVIADO`. Do ponto de vista do candidato existe um arquivo nosso sem desfecho.
    const ctx = servico({
      docs: [
        doc({ codigo: "RG", estadoDocumento: "INCONFORME", reprovacoes: 1, envioEmAberto: true }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos[0].estado).toBe("EM_ANALISE");
  });

  it("o mesmo INCONFORME, sem envio em aberto, continua sendo AJUSTAR", async () => {
    const ctx = servico({
      docs: [doc({ codigo: "RG", estadoDocumento: "INCONFORME", reprovacoes: 1 })],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos[0].estado).toBe("AJUSTAR");
  });

  it("PENDENTE com envio em aberto também sai EM_ANALISE: a tela não convida ao que a rota recusa", async () => {
    const ctx = servico({ docs: [doc({ codigo: "RG", envioEmAberto: true })] });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos[0].estado).toBe("EM_ANALISE");
  });

  it("ACEITO vence o envio em aberto: quem já terminou não volta para a fila de conferência", async () => {
    const ctx = servico({
      docs: [doc({ codigo: "RG", estadoDocumento: "ENTREGUE", envioEmAberto: true })],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos[0].estado).toBe("ACEITO");
  });

  it("NO_TIME vence o envio em aberto: quem caiu para o time ouve isso, e não outra coisa", async () => {
    const ctx = servico({
      docs: [
        doc({
          codigo: "RG",
          estadoDocumento: "INCONFORME",
          reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
          envioEmAberto: true,
        }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos[0].estado).toBe("NO_TIME");
  });

  it("a régua do arquivo único é PERGUNTADA ao dono do número, uma vez por passo", async () => {
    const ctx = servico({ docs: [doc({ codigo: "RG" }), doc({ codigo: "CTPS" })] });
    await ctx.alvo.trilha(SINTETICO.admissaoId);

    expect(ctx.cabeOutroArquivoNaPendencia).toHaveBeenCalledTimes(2);
    expect(ctx.pedidosDeArquivoUnico.every(([adm]) => adm === SINTETICO.admissaoId)).toBe(true);
    expect(ctx.pedidosDeArquivoUnico.map(([, tipo]) => tipo).sort()).toEqual(
      ["tipo-CTPS", "tipo-RG"].sort(),
    );
  });

  it("e NÃO é recalculada aqui: nada de segunda definição de envio em aberto", () => {
    // A emissão decide por `enviosEmAbertoDaPendencia` mais `cabeOutroArquivo`, sob a trava. Uma
    // conta própria aqui seria a segunda verdade sobre o que a rota recusa.
    expect(ARQUIVO_SERVICO).not.toContain("portal-arquivo-unico");
    // O que continua PROIBIDO é recalcular "envio em aberto" (dono do número, delegado por
    // `cabeOutroArquivoNaPendencia`). A CONFERÊNCIA persistida tem o SEU próprio `confirmadoEm`
    // (`portal_conferencia`, display-only, bugs 4/5/6), e esse é legítimo aqui: por isso o guard
    // passou a mirar o método de recálculo, não a palavra `confirmadoEm` que a conferência também usa.
    expect(ARQUIVO_SERVICO).not.toContain("enviosEmAbertoDaPendencia");
    expect(ARQUIVO_SERVICO).not.toContain("portalCredenciais.confirmadoEm");
  });

  it("o caminho de ESCRITA continua lendo dentro da transação, sob a trava", () => {
    // O conserto da corrida já provado não pode ser desfeito por esta leitura de tela: quem decide
    // de verdade é a emissão, com o handle da `tx` e o `pg_advisory_xact_lock`.
    const emissao = readFileSync(join(__dirname, "portal-credencial.service.ts"), "utf8");
    expect(emissao).toMatch(/enviosEmAbertoDaPendencia\(\s*tx,/);
    expect(emissao).toContain("pg_advisory_xact_lock");
  });
});

describe("A CONTAGEM DE TENTATIVAS É DELEGADA, e este serviço não conta nada", () => {
  it("pergunta a situação de cada passo ao serviço que já é dono do número", async () => {
    const ctx = servico({ docs: [doc({ codigo: "RG" }), doc({ codigo: "CTPS", reprovacoes: 2 })] });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);

    // UMA consulta em lote para a tela inteira (antes eram duas, uma por passo), e ainda assim
    // cada passo recebe a situação DELE, pedida ao mesmo dono do número.
    expect(ctx.situacoesParaATela).toHaveBeenCalledTimes(1);
    expect(ctx.pedidos).toHaveLength(2);
    expect(ctx.pedidos.every(([adm]) => adm === SINTETICO.admissaoId)).toBe(true);
    const ctps = passos.find((p) => p.codigoTipoDocumento === "CTPS");
    expect(ctps?.tentativas.usadas).toBe(2);
    expect(ctps?.tentativas.restantes).toBe(TETO_REPROVACOES_POR_PENDENCIA - 2);
    expect(ctps?.tentativas.teto).toBe(TETO_REPROVACOES_POR_PENDENCIA);
  });

  it("não existe uma terceira contagem de reprovação escrita aqui", () => {
    // Um terceiro leitor do número que TRANCA a pessoa fora do documento seria a terceira verdade.
    expect(ARQUIVO_SERVICO).not.toContain("portalCredenciais");
    expect(ARQUIVO_SERVICO).not.toContain("reprovadoEm");
  });
});

describe("A ORDEM DOS PASSOS DECIDE O QUE A PESSOA FAZ PRIMEIRO", () => {
  /**
   * A EXPECTATIVA MUDOU COM A ORDEM DOS 7 (decisão do diretor, 21/09/2026), e a mudança é a
   * inversão de RG e Carteira De Trabalho: por nome, "Carteira" vinha antes; pela lista fixa, o RG
   * é o primeiro documento da trilha. A FAIXA DE EXIGÊNCIA CONTINUA MANDANDO, que é a leitura
   * escolhida entre as duas (ver `domain/ordem-dos-documentos.ts`): os dois facultativos e o que
   * ninguém cobra seguem atrás dos obrigatórios, na mesma posição de antes.
   */
  it("exigência primeiro, depois a lista fixa dos 7, depois o nome", async () => {
    const ctx = servico({
      docs: [
        doc({ codigo: "EXTRA", nome: "Anexo Extra", exigencia: null }),
        doc({ codigo: "RESERVISTA", nome: "Reservista", exigencia: "FACULTATIVO" }),
        doc({ codigo: "RG", nome: "RG" }),
        doc({ codigo: "CTPS", nome: "Carteira De Trabalho" }),
        doc({ codigo: "CERT", nome: "Certidao De Nascimento", exigencia: "FACULTATIVO" }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos.map((p) => p.nome)).toEqual([
      "RG",
      "Carteira De Trabalho",
      "Certidao De Nascimento",
      "Reservista",
      "Anexo Extra",
    ]);
  });

  /**
   * OS 7 NA ORDEM PEDIDA, com todos obrigatórios, que é o cenário em que a lista fixa decide
   * sozinha. Os NOMES são deliberadamente fora de ordem alfabética: se alguém trocar a régua de
   * volta para "por nome", este teste quebra em vez de passar por coincidência.
   */
  it("os 7 saem na ordem pedida pelo diretor quando todos são obrigatórios", async () => {
    const ctx = servico({
      docs: [
        doc({ codigo: "CERTIDAO_NASC_CASAMENTO", nome: "Certidão De Nascimento Ou Casamento" }),
        doc({ codigo: "CTPS", nome: "Carteira De Trabalho" }),
        doc({ codigo: "COMPROVANTE_ESCOLARIDADE", nome: "Comprovante De Escolaridade" }),
        doc({ codigo: "DADOS_BANCARIOS", nome: "Comprovante De Conta Bancária" }),
        doc({ codigo: "COMPROVANTE_RESIDENCIA", nome: "Comprovante De Residência" }),
        doc({ codigo: "CPF", nome: "CPF" }),
        doc({ codigo: "RG", nome: "RG" }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos.map((p) => p.codigoTipoDocumento)).toEqual([
      "RG",
      "CPF",
      "COMPROVANTE_RESIDENCIA",
      "DADOS_BANCARIOS",
      "COMPROVANTE_ESCOLARIDADE",
      "CTPS",
      "CERTIDAO_NASC_CASAMENTO",
    ]);
  });

  /**
   * O QUE A RÉGUA DO CARGO NÃO INCLUI NÃO APARECE, E NÃO VIRA POSIÇÃO VAZIA. É o exemplo do
   * próprio diretor ("se o cargo não pede, pula"): a trilha sai de `documentos_admissao`, então a
   * lista fixa ordena o que existe e não cria casa nenhuma.
   */
  it("documento fora da régua do cargo não vira posição vazia: some da lista", async () => {
    const ctx = servico({
      docs: [
        doc({ codigo: "CTPS", nome: "Carteira De Trabalho" }),
        doc({ codigo: "RG", nome: "RG" }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos).toHaveLength(2);
    expect(passos.map((p) => p.codigoTipoDocumento)).toEqual(["RG", "CTPS"]);
    // A posição 2 da lista fixa (CPF) não está na admissão, e a trilha não tem buraco nenhum:
    // o CTPS, que é a posição 6, sobe direto para o segundo lugar.
    expect(passos.every((p) => p.codigoTipoDocumento !== "CPF")).toBe(true);
  });
});

describe("A DICA DO DOCUMENTO VIAJA JUNTO COM A TRILHA (menu de Dicas)", () => {
  /**
   * POR QUE JUNTO E NÃO NUMA CHAMADA POR DOCUMENTO: a tela do candidato é PÚBLICA, e rota nova ali
   * é superfície nova a allowlistar, limitar e auditar. Viajando na trilha, ele recebe só as dicas
   * dos documentos DA ADMISSÃO DELE, que é minimização de verdade (§A.6), e a tela não precisa de
   * uma segunda ida ao servidor no instante em que a pessoa está com o documento na mão.
   */
  it("o texto chega no passo, e a presença dele É o `tem dica` da tela", async () => {
    const ctx = servico({
      docs: [
        doc({ codigo: "RG", nome: "RG", dica: "Foto legível, sem corte, dos dois lados." }),
        doc({ codigo: "CPF", nome: "CPF" }),
      ],
    });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    const rg = passos.find((p) => p.codigoTipoDocumento === "RG");
    const cpf = passos.find((p) => p.codigoTipoDocumento === "CPF");
    expect(rg?.dica).toBe("Foto legível, sem corte, dos dois lados.");
    expect(cpf?.dica, "documento sem dica tem de vir nulo, e não com texto de outro").toBeNull();
  });

  /**
   * O `leftJoin` E O PREDICADO DO `ativo` MORAM NO JOIN, e não no `where`. No `where`, o `leftJoin`
   * viraria `innerJoin` na prática e todo documento SEM dica sumiria da trilha, que é o modo
   * clássico de perder linha num `left join`. O preço seria a tela do candidato ficar sem os
   * documentos que ele precisa enviar, e isso não daria erro nenhum.
   *
   * ┌─ ESTE TESTE NÃO PROVA ISSO, E A DECLARAÇÃO É O CONSERTO (achado S21 da auditoria) ────────┐
   * │ A primeira redação desta caixa afirmava cobrir a regra acima. NÃO COBRE: o dublê do banco │
   * │ devolve `cenario.docs` inteiro por projeção e NÃO EXECUTA predicado de SQL, então mover o  │
   * │ `ativo` para o `where` deixa este teste VERDE. A guarda está correta hoje, medida na       │
   * │ linha, e está SEM REDE.                                                                    │
   * │                                                                                            │
   * │ A ausência fica escrita porque a própria frente já pagou essa lição no arquivo irmão       │
   * │ (`portal-documentos.tester.spec.ts`): "teste que não sabe ficar vermelho é pior que teste  │
   * │ nenhum, porque ele é lido como cobertura". Um docstring que promete o que o dublê não pode │
   * │ entregar é exatamente isso, e some do radar de quem for refatorar.                         │
   * │                                                                                            │
   * │ O QUE ESTE TESTE DE FATO PROVA, e é útil: que o serviço não DESCARTA o passo sem dica no   │
   * │ código dele (montagem, deduplicação e ordenação). A parte de SQL exige harness com banco   │
   * │ real, que não existe para este serviço.                                                    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o servico nao descarta, no codigo dele, o passo sem dica (o SQL nao e coberto: ver a caixa acima)", async () => {
    const ctx = servico({ docs: [doc({ codigo: "CPF", nome: "CPF" })] });
    const { passos } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(passos).toHaveLength(1);
  });
});

describe("§A.6: A RESPOSTA E O EVENTO NÃO CARREGAM DADO PESSOAL", () => {
  it("o JSON não traz CPF, nome completo nem identificador interno", async () => {
    const ctx = servico({ docs: [doc({ codigo: "RG", tipoDocumentoId: "tipo-RG" })] });
    const json = JSON.stringify(await ctx.alvo.trilha(SINTETICO.admissaoId));

    for (const proibido of [
      SINTETICO.cpf,
      SINTETICO.nomeCompleto,
      SINTETICO.admissaoId,
      SINTETICO.cargoId,
      "tipo-RG",
    ]) {
      expect(json, `a resposta vazou ${proibido}`).not.toContain(proibido);
    }
  });

  it("o recorte do primeiro nome acontece no SQL, e não depois", () => {
    // Trazer o nome completo e cortá-lo em JavaScript é ter o sobrenome em memória, em log de erro
    // e a um `console.log` do JSON. Cortado na consulta, ele não chega a existir aqui.
    expect(ARQUIVO_SERVICO).toContain("split_part");
  });

  it("o cliente é o nome de operação, nunca a razão social nem o CNPJ", () => {
    // A proibição é sobre a COLUNA lida, não sobre a palavra: o docblock do cabeçalho cita os dois
    // campos justamente para dizer por que eles não são lidos, e proibir o texto faria o teste
    // brigar com a explicação em vez de com o código.
    expect(ARQUIVO_SERVICO).toContain("clientes.nomeOperacao");
    expect(ARQUIVO_SERVICO).not.toMatch(/clientes\.(razaoSocial|cnpj)/);
  });

  it("o cabeçalho traz primeiro nome, cargo e cliente para a Sol situar a pessoa", async () => {
    const ctx = servico({ docs: [], cargo: "Motorista", cliente: "Operacao Sintetica" });
    const trilha = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(trilha.primeiroNome).toBe(SINTETICO.primeiroNome);
    expect(trilha.primeiroNome).not.toContain(" ");
    expect(trilha.cargo).toBe("Motorista");
    expect(trilha.cliente).toBe("Operacao Sintetica");
  });

  it("o evento de abertura leva o link e o IP, e mais nada", async () => {
    const registrar = vi.fn(async () => {});
    const ctx = servico({ docs: [doc({ codigo: "RG", nome: "Registro Geral" })] }, registrar);
    await ctx.alvo.trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink, ip: "203.0.113.7" });

    expect(registrar).toHaveBeenCalledTimes(1);
    const [tipo, cru, ip] = registrar.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(tipo).toBe("PORTAL_LINK_ABERTO");
    expect(ip).toBe("203.0.113.7");
    expect(Object.keys(cru)).toEqual(["jtiLink"]);
    const carga = JSON.stringify(cru);
    for (const proibido of [SINTETICO.admissaoId, SINTETICO.nomeCompleto, "Registro Geral", "RG"]) {
      expect(carga, `o evento vazou ${proibido}`).not.toContain(proibido);
    }
  });
});

describe("LER A PRÓPRIA LISTA NÃO É FAIL-CLOSED", () => {
  it("trilha de log quebrada não deixa o candidato sem a lista", async () => {
    // `registrar` LANÇA quando falta o `PORTAL_LOG_PEPPER`, e a emissão de credencial se recusa a
    // conceder nesse caso, de propósito. Ler é o oposto: ninguém pode ficar sem ver os documentos
    // que precisa enviar porque faltou uma variável de ambiente no servidor.
    const registrar = vi.fn(async () => {
      throw new Error("PORTAL_LOG_PEPPER ausente");
    });
    const ctx = servico({ docs: [doc({ codigo: "RG" })] }, registrar);
    const trilha = await ctx.alvo.trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink });
    expect(trilha.passos).toHaveLength(1);
  });

  it("a leitura não copia a checagem de `configurada()` que a emissão faz", () => {
    // De novo: o que não pode existir é a CHAMADA. O docblock cita o nome para explicar a ausência,
    // e um teste que proíbe a palavra proíbe a explicação.
    expect(ARQUIVO_SERVICO).not.toMatch(/this\.[A-Za-z]+\.configurada\(\)/);
  });
});

describe("OS LIMITES VÊM DO DOMÍNIO", () => {
  it("bytes e tipos aceitos são os mesmos da emissão, sem número escrito à mão", async () => {
    const ctx = servico({ docs: [] });
    const { limites } = await ctx.alvo.trilha(SINTETICO.admissaoId);
    expect(limites.bytesMaxArquivo).toBe(LIMITES_PORTAL.BYTES_MAX_ARQUIVO);
    expect(limites.tiposAceitos).toEqual([...TIPOS_ACEITOS_PORTAL]);
  });
});

describe("A ROTA NÃO TEM PORTA PARA O ID DA ADMISSÃO, e não fica em cache", () => {
  it("a assinatura recebe só a requisição e a resposta", () => {
    const inicio = ARQUIVO_CONTROLLER.search(/@Get\(\s*["'`]documentos["'`]\s*\)/);
    expect(inicio).toBeGreaterThan(-1);
    const corpo = ARQUIVO_CONTROLLER.slice(inicio, inicio + 900);
    const assinatura = corpo.slice(0, corpo.indexOf("{") + 1);

    expect(assinatura).toMatch(/@Req\(/);
    expect(assinatura).not.toMatch(/@Query\(/);
    expect(assinatura).not.toMatch(/@Body\(/);
    expect(assinatura).not.toMatch(/@Param\(/);
    expect(corpo).toMatch(/req\.portal/);
  });

  it("a rota é pública para o candidato e protegida pelo guard de sessão", () => {
    const inicio = ARQUIVO_CONTROLLER.search(/@Get\(\s*["'`]documentos["'`]\s*\)/);
    const janela = ARQUIVO_CONTROLLER.slice(inicio, inicio + 400);
    expect(janela).toMatch(/@Public\(\)/);
    expect(janela).toMatch(/PortalSessaoGuard/);
  });

  it("a resposta proíbe cache de proxy e de disco", () => {
    expect(ARQUIVO_CONTROLLER).toContain('"Cache-Control": "no-store, private"');
  });
});

/**
 * A REVOGAÇÃO VALE PARA A LEITURA (veto da auditoria de código).
 *
 * O furo: `linkVivo` tinha entrado na emissão de credencial e na confirmação, e esta rota não
 * consultava `portal_links` em lugar nenhum. O motivo mais comum de revogar é "o link foi para a
 * pessoa errada", e era ela que continuava lendo a lista inteira por até 30 minutos.
 */
describe("LINK MORTO NÃO LÊ A LISTA", () => {
  /**
   * A TERCEIRA COLUNA É O MOTIVO QUE A TRILHA TEM DE GRAVAR, e ela entrou pelo achado S28.
   *
   * O serviço gravava `"EXPIRADA"` FIXO, e ESTE arquivo não pegava: o teste da recusa afirmava só
   * o CONJUNTO de chaves do evento (`["jtiLink","motivoCodigo"]`), nunca o VALOR. Dava para trocar
   * o código de todos os estados e a porta da trilha continuava verde.
   */
  const MORTOS: Array<[string, Cenario["link"], string]> = [
    ["revogado", { ...LINK_VIVO(), revogadoEm: new Date(Date.now() - 60_000) }, "REVOGADO_MANUAL"],
    ["bloqueado à mão", { ...LINK_VIVO(), bloqueadoEm: new Date(Date.now() - 60_000) }, "LINK_BLOQUEADO"],
    ["suspenso", { ...LINK_VIVO(), suspensoAte: new Date(Date.now() + 3_600_000) }, "SUSPENSO"],
    ["vencido", { ...LINK_VIVO(), expiraEm: new Date(Date.now() - 60_000) }, "EXPIRADA"],
    // Linha que sumiu é revogação, e não um quinto código: quem assina bilhete somos nós.
    ["apagado da tabela", null, "REVOGADO_MANUAL"],
  ];

  for (const [rotulo, link, motivo] of MORTOS) {
    it(`link ${rotulo}: a trilha grava o motivo REAL (${motivo}), não um fixo`, async () => {
      const registrar = vi.fn(async () => {});
      const ctx = servico({ docs: [doc({ codigo: "RG" })], link }, registrar);

      await ctx.alvo
        .trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink })
        .catch(() => undefined);

      const [tipo, cru] = registrar.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(tipo).toBe("PORTAL_LINK_RECUSADO");
      expect(cru.motivoCodigo).toBe(motivo);
    });
  }

  for (const [rotulo, link] of MORTOS) {
    it(`link ${rotulo}: recusa, e a lista NÃO é montada`, async () => {
      const ctx = servico({ docs: [doc({ codigo: "RG" })], link });

      await expect(
        ctx.alvo.trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink }),
      ).rejects.toBeInstanceOf(NotFoundException);

      // A recusa vem ANTES de qualquer consulta que mencione a admissão: nem o cabeçalho é lido.
      expect(ctx.argumentos).not.toContain(SINTETICO.admissaoId);
    });
  }

  it("a frase é a MESMA do não encontrado, sem oráculo sobre a admissão existir", async () => {
    const comLinkMorto = servico({ docs: [], link: null });
    const semAdmissao = servico({ docs: [], semAdmissao: true });

    const a = await comLinkMorto.alvo
      .trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink })
      .catch((e: Error) => e.message);
    const b = await semAdmissao.alvo.trilha(SINTETICO.admissaoId).catch((e: Error) => e.message);

    expect(a).toBe(b);
  });

  it("a recusa vai para a trilha, e a ABERTURA não é registrada", async () => {
    const registrar = vi.fn(async () => {});
    const ctx = servico({ docs: [doc({ codigo: "RG" })], link: null }, registrar);

    await ctx.alvo
      .trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink })
      .catch(() => undefined);

    const tipos = registrar.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(tipos).toEqual(["PORTAL_LINK_RECUSADO"]);
    // §A.6: o evento leva o link e o código, e nada da pessoa.
    const [, cru] = registrar.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(Object.keys(cru).sort()).toEqual(["jtiLink", "motivoCodigo"]);
    // E O VALOR, não só a chave: afirmar o conjunto e calar sobre o conteúdo foi o que deixou o
    // `"EXPIRADA"` fixo passar por aqui (achado S28).
    expect(cru).toEqual({ jtiLink: SINTETICO.jtiLink, motivoCodigo: "REVOGADO_MANUAL" });
  });

  it("trilha de log quebrada NÃO transforma a recusa em entrega", async () => {
    // O oposto da regra de ler a própria lista: ali o log quebrado não pode tirar a lista de quem
    // tem direito; aqui ele não pode DEVOLVER a lista a quem não tem mais.
    const registrar = vi.fn(async () => {
      throw new Error("PORTAL_LOG_PEPPER ausente");
    });
    const ctx = servico({ docs: [doc({ codigo: "RG" })], link: null }, registrar);

    await expect(
      ctx.alvo.trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("link VIVO continua entregando a lista, que é o caso de todo dia", async () => {
    const ctx = servico({ docs: [doc({ codigo: "RG" })] });
    const trilha = await ctx.alvo.trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jtiLink });
    expect(trilha.passos).toHaveLength(1);
  });

  /**
   * ══ A AFIRMAÇÃO MUDOU DE ARQUIVO, NÃO FOI AFROUXADA (consolidação, 21/09/2026) ═══════════════
   *
   * ANTES, este teste lia `portal-documentos.service.ts` e exigia que ELE contivesse
   * `estadoDaLinha(` e `portalLinks`. Era a forma de travar "a régua do link vivo é a
   * compartilhada, e não uma cópia escrita à mão aqui" enquanto a leitura MORAVA neste serviço.
   *
   * A LEITURA MUDOU DE CASA DE PROPÓSITO: ela é `PortalLinkVivoService.exigirVivo`, a MESMA que a
   * ponte do VT usa. A garantia é exatamente a mesma, então ela passa a ser afirmada NO LUGAR
   * NOVO, e ganha o par que antes não era possível: que o serviço da trilha DELEGA e NÃO voltou a
   * ter leitura própria. Duas leituras com a mesma forma eram duas manutenções.
   */
  it("a régua é a COMPARTILHADA (`estadoDaLinha`), e não uma quarta cópia", () => {
    // Revogado, vencido e suspenso matam o link na identificação, na emissão, na confirmação e
    // aqui. Uma régua escrita à mão divergiria no primeiro ajuste, e hoje ela mora em UM arquivo.
    expect(ARQUIVO_LINK_VIVO).toContain("estadoDaLinha(");
    expect(ARQUIVO_LINK_VIVO).toContain("portalLinks");
    expect(ARQUIVO_LINK_VIVO).not.toMatch(/revogadoEm\s*(!==|===)\s*null/);
  });

  it("a trilha DELEGA a conferência, e não guarda uma segunda leitura de `portal_links`", () => {
    // O outro lado da mudança de casa: sem esta asserção, nada impediria a leitura de ressuscitar
    // aqui dentro amanhã, que é precisamente o que a consolidação foi feita para impedir.
    expect(ARQUIVO_SERVICO).toContain("this.linkVivo.exigirVivo(");
    expect(ARQUIVO_SERVICO).not.toMatch(/estadoDaLinha\(/);
    expect(ARQUIVO_SERVICO).not.toMatch(/\.from\(portalLinks\)/);
  });

  it("a frase da recusa continua sendo a MESMA do não encontrado (itens F9 e L6)", () => {
    // A mensagem é do CHAMADOR, e a consolidação não podia trocá-la por uma do serviço novo: quem
    // está com um link morto não pode descobrir por aqui se a admissão existe.
    expect(ARQUIVO_SERVICO).toContain(
      'this.linkVivo.exigirVivo(contexto, "Lista de documentos indisponível")',
    );
  });

  it("o controller SEMPRE passa o `jti` do bilhete, então não existe leitura sem conferência", () => {
    // A conferência só é pulada quando o `jtiLink` não vem, e quem chama é este controller, que o
    // tira do `req.portal` escrito pelo guard (onde a claim é obrigatória).
    expect(ARQUIVO_CONTROLLER).toContain("jtiLink: req.portal!.jtiLink");
  });
});
