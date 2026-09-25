import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { menuDaOperacao } from "../domain/menus";
import { FAROIS_FORA_DO_PAINEL } from "./portal-painel.service";
import { PortalPedidosAjudaService } from "./portal-pedidos-ajuda.service";

/**
 * A LEITURA DOS PEDIDOS DE AJUDA PARA ENTRAR, no Gerenciador do Portal.
 *
 * §A.6: todos os fixtures são identificador técnico, contagem e carimbo de tempo. O único nome que
 * aparece é o de um candidato SINTÉTICO, e não há CPF em lugar nenhum.
 */

const ARQUIVO_SERVICO = readFileSync(join(__dirname, "portal-pedidos-ajuda.service.ts"), "utf8");
const ARQUIVO_CONTROLLER = readFileSync(
  join(__dirname, "portal-pedidos-ajuda.controller.ts"),
  "utf8",
);
const CODIGO_SERVICO = semComentarios(ARQUIVO_SERVICO);
const CODIGO_CONTROLLER = semComentarios(ARQUIVO_CONTROLLER);

// ══ A ROTA NÃO NASCE SOB `portal/`, E É REIVINDICADA POR MENU ═════════════════════════════════

describe("território autenticado, nunca o prefixo da barreira", () => {
  it("a controller mora sob `esteira/`, no molde do Gerenciador do Portal", () => {
    expect(ARQUIVO_CONTROLLER).toContain('@Controller("esteira/portal-pedidos-ajuda")');
  });

  it("nenhum `@Controller` deste arquivo começa por `portal/`", () => {
    const prefixos = [...ARQUIVO_CONTROLLER.matchAll(/@Controller\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(prefixos).not.toHaveLength(0);
    for (const prefixo of prefixos) expect(prefixo.startsWith("portal/")).toBe(false);
  });

  it("não é `@Public()`: esta tela é do TIME, e exige sessão do EA", () => {
    expect(ARQUIVO_CONTROLLER).not.toContain("@Public()");
  });

  /**
   * O coringa das irmãs (`PortalPainelController.*`) NÃO alcança classe nova: o índice do
   * `MenuGuard` é por `Controller.handler`. Sem a reivindicação nominal, esta rota nasceria aberta a
   * qualquer sessão autenticada, e o que passaria é a lista nominal de quem pediu ajuda.
   */
  it("o handler `listar` é reivindicado pelo mesmo menu da emissão do link", () => {
    expect(menuDaOperacao("PortalPedidosAjudaController", "listar")).toBe("portal-links");
    expect(menuDaOperacao("PortalPedidosAjudaController", "listar")).toBe(
      menuDaOperacao("PortalLinksController", "emitir"),
    );
  });

  it("a resposta manda `no-store, private`, como a rota do candidato", () => {
    expect(ARQUIVO_CONTROLLER).toContain('"Cache-Control": "no-store, private"');
  });

  /**
   * NENHUM PARÂMETRO ESCOLHE UMA LINHA: a lista é o recorte inteiro dos pedidos de ajuda. Um
   * `@Query`/`@Param` de admissão aqui viraria consulta dirigida a qualquer admissão da base.
   */
  it("a controller não aceita parâmetro de admissão nem de link", () => {
    expect(ARQUIVO_CONTROLLER).not.toMatch(/@Param\(/);
    expect(ARQUIVO_CONTROLLER).not.toMatch(/@Query\(/);
  });
});

// ══ §A.6: O QUE NÃO PODE ATRAVESSAR PARA A TELA ══════════════════════════════════════════════

describe("§A.6: a leitura não vaza dado sensível", () => {
  it.each(["ipHash", "ip_hash", "uaHash", "ua_hash", "portalEventosIp", "geo", "token"])(
    "o serviço não projeta `%s`",
    (proibido) => {
      expect(CODIGO_SERVICO).not.toContain(proibido);
    },
  );

  /**
   * O CPF aparece no serviço UMA vez e por um motivo só: é a chave estrangeira que liga `admissoes`
   * a `candidatos`. Ler a chave num `join` não é projetar, não é filtrar e não é buscar.
   */
  it("o CPF só aparece como chave de junção: nunca projetado, nunca buscado", () => {
    const linhasComCpf = CODIGO_SERVICO.split("\n").filter((l) => /cpf/i.test(l));
    expect(linhasComCpf).toHaveLength(1);
    expect(linhasComCpf[0]).toContain("eq(candidatos.cpf, admissoes.candidatoCpf)");
    expect(CODIGO_CONTROLLER).not.toMatch(/cpf/i);
  });

  it("o candidato hash da trilha não é lido: o nome vem de `candidatos`, sob RBAC", () => {
    expect(CODIGO_SERVICO).not.toContain("candidatoHash");
    expect(CODIGO_SERVICO).not.toContain("candidato_hash");
  });
});

// ══ A REGRA DA CONSULTA: SÓ RECUPERAÇÃO, E O DECLÍNIO FORA (§A.16) ════════════════════════════

describe("a consulta lê só o evento certo e exclui o declínio", () => {
  it("filtra pelo tipo `PORTAL_RECUPERACAO_SOLICITADA`", () => {
    expect(CODIGO_SERVICO).toContain('eq(portalEventos.tipo, "PORTAL_RECUPERACAO_SOLICITADA")');
  });

  it("aplica a exclusão de farol da tela irmã, em CÓDIGO (§A.16)", () => {
    expect(CODIGO_SERVICO).toContain("notInArray(admissoes.farolGlobal");
    expect(CODIGO_SERVICO).toContain("FAROIS_FORA_DO_PAINEL");
    expect(FAROIS_FORA_DO_PAINEL).toContain("DECLINOU");
    expect(FAROIS_FORA_DO_PAINEL).toContain("RESCISAO");
  });

  it("ordena pelo último pedido, mais recente primeiro", () => {
    expect(CODIGO_SERVICO).toContain("desc(sql`max(${portalEventos.ocorridoEm})`)");
  });

  /**
   * A junção trilha↔link é `varchar` contra `uuid`. O UUID é comparado como TEXTO, e não o `jti_link`
   * como `uuid`: um `::uuid` no lado do log estouraria se algum evento de OUTRO tipo tivesse um
   * `jti_link` não-UUID, mesmo os que o filtro descarta. Comparar o UUID como texto nunca falha.
   */
  it("junta a trilha ao link comparando o UUID como texto", () => {
    expect(CODIGO_SERVICO).toContain("${portalLinks.id}::text = ${portalEventos.jtiLink}");
    expect(CODIGO_SERVICO).not.toMatch(/jtiLink}::uuid/);
  });
});

// ══ O SERVIÇO, CONTRA UM BANCO DE MENTIRINHA ═════════════════════════════════════════════════

/** Uma linha JÁ AGREGADA, no formato que a consulta do Postgres devolveria. */
interface LinhaFake {
  admissaoId: string;
  linkJti: string;
  nome: string;
  cargo: string;
  cliente: string;
  vezes: number;
  primeiroPedidoEm: Date;
  ultimoPedidoEm: Date;
}

/**
 * Banco de mentirinha: a consulta é uma só, então o proxy ignora os encadeamentos e resolve as
 * linhas presas. A ordenação e os filtros são do SQL (provados estruturalmente acima); o que este
 * fake mede é o MAPEAMENTO (ISO, passagem de contagem e identificadores).
 */
function banco(linhas: LinhaFake[]) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
            Promise.resolve(linhas).then(ok, erro);
        }
        return () => proxy;
      },
    },
  );
  return { select: () => proxy } as never;
}

describe("o mapeamento da linha", () => {
  it("devolve o pedido completo, com os carimbos em ISO", async () => {
    const primeiro = new Date("2026-09-20T10:00:00.000Z");
    const ultimo = new Date("2026-09-23T14:30:00.000Z");
    const s = new PortalPedidosAjudaService(
      banco([
        {
          admissaoId: "adm-1",
          linkJti: "11111111-1111-4111-8111-111111111111",
          nome: "Candidato Sintético",
          cargo: "Auxiliar",
          cliente: "Loja 1",
          vezes: 3,
          primeiroPedidoEm: primeiro,
          ultimoPedidoEm: ultimo,
        },
      ]),
    );

    const lista = await s.listar();
    expect(lista).toEqual([
      {
        admissaoId: "adm-1",
        linkJti: "11111111-1111-4111-8111-111111111111",
        nome: "Candidato Sintético",
        cargo: "Auxiliar",
        cliente: "Loja 1",
        vezes: 3,
        primeiroPedidoEm: primeiro.toISOString(),
        ultimoPedidoEm: ultimo.toISOString(),
      },
    ]);
  });

  it("a resposta NÃO carrega campo nenhum da Sala De Segurança", async () => {
    const s = new PortalPedidosAjudaService(
      banco([
        {
          admissaoId: "adm-1",
          linkJti: "j-1",
          nome: "Sintético",
          cargo: "Aux",
          cliente: "Loja",
          vezes: 1,
          primeiroPedidoEm: new Date(),
          ultimoPedidoEm: new Date(),
        },
      ]),
    );
    const [linha] = await s.listar();
    for (const proibido of ["ip", "ipHash", "uaHash", "cpf", "candidatoHash", "token"]) {
      expect(Object.keys(linha)).not.toContain(proibido);
    }
  });

  it("sem pedido nenhum, devolve lista vazia", async () => {
    const s = new PortalPedidosAjudaService(banco([]));
    expect(await s.listar()).toEqual([]);
  });
});

/**
 * Tira os comentários para as asserções de campo proibido não baterem no texto que EXPLICA por que o
 * campo não está lá. Mesmo utilitário do `portal-painel.spec.ts`.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
