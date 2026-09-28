import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PortalEnvioService } from "./portal-envio.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { PortalLinksController } from "./portal-links.controller";
import { FAROIS_FORA_DO_PAINEL } from "./portal-painel.service";
import {
  ADMISSAO_SINTETICA,
  AUTOR_SINTETICO,
  CPF_SINTETICO,
  EMAIL_SINTETICO,
  JTI_SINTETICO,
  bancoDoEnvio,
  correioFake,
  fonteOuNulo,
  instanciarPorTipos,
  semComentarios,
  tiposDoConstrutorDaFonte,
  textoDeTudo,
  trilhaFake,
  type CenarioDoEnvio,
  type LinkFake,
} from "./portal-envio.tester-fake";

/**
 * ─ A ROTA ANTIGA DO LINK APONTADA PARA O CAMINHO NOVO, COBERTURA INDEPENDENTE (§A.38/§A.40) ────
 *
 * Escrito A PARTIR DO REQUISITO, por quem NÃO implementa a mudança, ENQUANTO ela está sendo
 * construída. Enquanto `POST portal/links/:admissaoId` continuar chamando o `emitirLink` cru,
 * boa parte deste arquivo FALHA, e isso é o desenho e não o defeito.
 *
 * ┌─ O QUE A MUDANÇA EXISTE PARA RESOLVER ───────────────────────────────────────────────────────┐
 * │ `PortalIdentidadeService.emitirLink` REVOGA SEMPRE, nunca se abstém e não tem recorte de     │
 * │ farol. Quem clicar "gerar link" enquanto o candidato está no meio do upload MATA A SESSÃO    │
 * │ DELE EM SILÊNCIO: nada falha, nada loga, e a tela do candidato morre. E a mesma rota fabrica │
 * │ credencial para admissão DECLINADA, RESCINDIDA ou de pré-admissão do funil, que não tem      │
 * │ cliente, cargo nem régua: a pessoa é chamada para uma coleta que não existe.                 │
 * │                                                                                              │
 * │ O diretor decidiu APONTAR a rota antiga para o caminho novo, SEM REMOVER, para não quebrar   │
 * │ quem por acaso ainda a chame. É por isso que o bloco de CONTRATO DE FIO deste arquivo é tão  │
 * │ duro quanto os de comportamento: apontar sem preservar `link` e `expiraEm` seria remover com │
 * │ outro nome.                                                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ══ POR QUE ELE MEDE CONTRA A PILHA REAL, e não contra um dublê de emissor ════════════════════
 *
 * A abstenção e a revogação do anterior são decididas DENTRO da transação de `emitirComTrava`, no
 * serviço de IDENTIDADE. Um dublê de emissor provaria o dublê. Aqui a controller é montada sobre
 * os serviços DE VERDADE, e só banco, correio e trilha são de mentirinha.
 *
 * E ele mede pela CONTROLLER, e não pelo serviço: o requisito é sobre a ROTA ANTIGA. Nenhum teste
 * daqui supõe COMO ela passou a pedir o link (método novo, serviço novo, parâmetro novo). O que
 * se afirma é o comportamento observável da porta.
 *
 * §A.6: todo CPF, e-mail e URL daqui são SINTÉTICOS, e existem para serem caçados nos escritos e
 * na trilha.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const { privateKey } = generateKeyPairSync("ed25519");
const CHAVE_B64 = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }) as string,
).toString("base64");

const config = () =>
  ({
    get: (chave: string) => {
      if (chave === "PORTAL_LINK_PRIVATE_KEY") return CHAVE_B64;
      if (chave === "PORTAL_LOG_PEPPER") return "pepper-sintetico";
      if (chave === "PORTAL_LINK_BASE_URL") return "https://portal.exemplo.test/p";
      return undefined;
    },
    getOrThrow: (chave: string) => chave,
  }) as never;

const AGORA = Date.now();
const USUARIO = { id: AUTOR_SINTETICO } as any;

/**
 * O DUBLÊ DO BANCO COM FAROL, e ele existe porque o `bancoDoEnvio` sozinho NÃO consegue medir a
 * regra 2.
 *
 * ┌─ UM FALSO VERDE JÁ MEDIDO NESTE ARQUIVO, e vale registrar para ninguém repeti-lo ────────────┐
 * │ A primeira versão deste teste afirmava que os quatro faróis "aparecem na consulta", varrendo │
 * │ os argumentos registrados em `banco.consultas`. ELE PASSAVA COM O CÓDIGO ANTIGO: o coletor   │
 * │ de strings anda pelo OBJETO DA TABELA `admissoes`, e o enum `farol_global` carrega           │
 * │ "DECLINOU", "RESCISAO" e companhia dentro do próprio schema. O teste media o schema, não o   │
 * │ recorte.                                                                                     │
 * │                                                                                              │
 * │ E o cenário `pessoa: null` também não serve: ali a admissão NÃO EXISTE, e a emissão crua já  │
 * │ lançava `NotFound` de qualquer jeito. Medido: o comportamento antigo passaria no "nada foi   │
 * │ escrito" sem ter recorte nenhum.                                                             │
 * │                                                                                              │
 * │ A única medida honesta é a admissão EXISTIR com um farol fora do recorte, que é o que este   │
 * │ envelope faz: a leitura `{ id, farol }` devolve a linha com o farol pedido, e todo o resto   │
 * │ do dublê continua igual.                                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function comFarol(banco: ReturnType<typeof bancoDoEnvio>, farol: string): any {
  const linha = [{ id: ADMISSAO_SINTETICA, farol }];
  const cadeia = (): any =>
    new Proxy(
      {},
      {
        get(_a, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(linha).then(ok, erro);
          }
          return () => cadeia();
        },
      },
    );
  const db: any = {
    ...banco.db,
    select: (projecao?: Record<string, unknown>) => {
      const chaves = Object.keys(projecao ?? {}).sort().join(",");
      return chaves === "farol,id" ? cadeia() : banco.db.select(projecao);
    },
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  return db;
}

interface Montagem {
  controller: any;
  envio: any;
  identidade: any;
  banco: ReturnType<typeof bancoDoEnvio>;
  trilha: ReturnType<typeof trilhaFake>;
  correio: ReturnType<typeof correioFake>;
}

/**
 * Monta a pilha real e pendura a CONTROLLER em cima dela.
 *
 * O mapa de tipos oferece TODOS os serviços que a controller poderia passar a injetar, porque o
 * requisito não manda por qual deles ela pede o link. O que ela não pedir simplesmente não é
 * usado; o que ela pedir e não estiver aqui é pego pelo teste de montagem, logo abaixo, com
 * mensagem legível em vez de um `undefined` viajando para dentro do serviço.
 */
function montar(
  cenario: CenarioDoEnvio = {},
  opcoes: { correioLigado?: boolean; farol?: string } = {},
): Montagem {
  const banco = bancoDoEnvio(cenario);
  const db = opcoes.farol === undefined ? banco.db : comFarol(banco, opcoes.farol);
  const trilha = trilhaFake();
  const correio = correioFake({ configurado: opcoes.correioLigado === true });

  const identidade = instanciarPorTipos(
    PortalIdentidadeService as any,
    {
      Database: db,
      ConfigService: config(),
      PortalTrilhaService: trilha.fake,
      ThrottlerStorage: { increment: async () => ({ isBlocked: false }) },
    },
    { arquivo: ["portal", "portal-identidade.service.ts"], classe: "PortalIdentidadeService" },
  ) as any;

  const envio = instanciarPorTipos(
    PortalEnvioService as any,
    {
      Database: db,
      PortalIdentidadeService: identidade,
      PortalCorreioService: correio.fake,
      PortalTrilhaService: trilha.fake,
    },
    { arquivo: ["portal", "portal-envio.service.ts"], classe: "PortalEnvioService" },
  ) as any;

  const controller = instanciarPorTipos(
    PortalLinksController as any,
    {
      Database: db,
      PortalIdentidadeService: identidade,
      PortalEnvioService: envio,
      PortalTrilhaService: trilha.fake,
      ConfigService: config(),
    },
    { arquivo: ["portal", "portal-links.controller.ts"], classe: "PortalLinksController" },
  ) as any;

  return { controller, envio, identidade, banco, trilha, correio };
}

const inseriu = (m: Montagem) => m.banco.escritas.some((e) => e.tipo === "insert");
const revogou = (m: Montagem) => m.banco.escritas.some((e) => "revogadoEm" in e.valores);

/** A chamada da ROTA ANTIGA. Captura o desfecho sem decidir se ele é dado ou exceção. */
async function pelaRota(
  m: Montagem,
  admissaoId = ADMISSAO_SINTETICA,
): Promise<{ ok: boolean; corpo: any; erro: any }> {
  try {
    return { ok: true, corpo: await m.controller.emitir(admissaoId, USUARIO), erro: null };
  } catch (erro) {
    return { ok: false, corpo: null, erro };
  }
}

/**
 * OS LINKS DE CENÁRIO SÃO FÁBRICAS, E NÃO CONSTANTES, e o motivo é um defeito JÁ MEDIDO nesta
 * frente: `bancoDoEnvio` APLICA as escritas (`Object.assign` na linha), então um `LinkFake`
 * declarado no topo e passado a dois cenários chega ao segundo JÁ REVOGADO pelo primeiro. O teste
 * seguinte passa a medir outra coisa e falha por motivo errado, só na suíte inteira.
 */
const vivoEAberto = (extra: Partial<LinkFake> = {}): LinkFake => ({
  id: JTI_SINTETICO,
  admissaoId: ADMISSAO_SINTETICA,
  expiraEm: new Date(AGORA + 40 * 3_600_000),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
  primeiroAcessoEm: new Date(AGORA - 5 * 60_000),
  criadoEm: new Date(AGORA - 60 * 60_000),
  enviadoEm: null,
  ...extra,
});

/** Vivo, NUNCA aberto e entregue há muito: não há sessão a proteger, então aqui se reemite. */
const vivoNuncaAberto = (extra: Partial<LinkFake> = {}): LinkFake =>
  vivoEAberto({
    primeiroAcessoEm: null,
    enviadoEm: new Date(AGORA - 60 * 60_000),
    criadoEm: new Date(AGORA - 60 * 60_000),
    ...extra,
  });

// ════════════════════════════════════════════════════════════════════════════════════════════════
// MONTAGEM. O teste que evita o falso vermelho: se a controller passar a injetar um serviço que
// este arquivo não conhece, a falha tem de DIZER ISSO, e não morrer com "não é função".
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("a montagem do teste acompanha o que a controller injeta", () => {
  it("todo tipo do construtor de `PortalLinksController` é conhecido por este arquivo", () => {
    const fonte = fonteOuNulo("portal", "portal-links.controller.ts");
    expect(fonte, "a controller da rota antiga sumiu").toBeTruthy();
    const conhecidos = [
      "Database",
      "PortalIdentidadeService",
      "PortalEnvioService",
      "PortalTrilhaService",
      "ConfigService",
    ];
    const tipos = tiposDoConstrutorDaFonte(fonte as string, "PortalLinksController");
    expect(tipos.length, "o construtor não foi lido: o auxiliar precisa de ajuste").toBeGreaterThan(0);
    expect(
      tipos.filter((t) => !conhecidos.includes(t)),
      "a controller injeta serviço novo: acrescente-o ao mapa de `montar`, senão o vermelho é do teste e não do código",
    ).toEqual([]);
  });

  it("a rota antiga continua existindo: `POST :admissaoId`, sem remoção", () => {
    const fonte = semComentarios(fonteOuNulo("portal", "portal-links.controller.ts") ?? "");
    expect(
      fonte,
      "a rota antiga foi REMOVIDA, e a decisão do diretor foi APONTAR sem remover",
    ).toMatch(/@Post\(\s*["'`]:admissaoId["'`]\s*\)/);
    expect(fonte, "o handler `emitir` sumiu").toMatch(/@Post\(\s*["'`]:admissaoId["'`]\s*\)\s*(?:async\s+)?emitir\s*\(/);
  });

  it("o `admissaoId` continua passando pelo `ParseUUIDPipe` e o autor continua obrigatório", () => {
    const fonte = semComentarios(fonteOuNulo("portal", "portal-links.controller.ts") ?? "");
    const trecho = fonte.split(/@Post\(\s*["'`]:admissaoId["'`]\s*\)/)[1] ?? "";
    const handler = trecho.slice(0, trecho.indexOf("}") + 1);
    expect(handler, "id malformado chegando ao banco").toContain("ParseUUIDPipe");
    expect(handler, "emissão sem autor é rastro pela metade (itens L1/L2 da trilha)").toContain(
      "@CurrentUser()",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 3. O CASO BOM CONTINUA EMITINDO, e é ele que diz que a mudança não fechou a porta
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("requisito 3: sem sessão a proteger, a rota antiga emite e mata o anterior", () => {
  it("admissão sem link nenhum: emite e grava a linha", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [] });
    const r = await pelaRota(m);
    expect(r.erro, "a rota antiga passou a explodir no caminho feliz").toBeNull();
    expect(r.corpo?.link, "o caso bom deixou de devolver a URL").toBeTruthy();
    expect(inseriu(m), "devolveu URL sem gravar o link: credencial que ninguém consegue revogar").toBe(
      true,
    );
    expect(m.trilha.registros.map((x) => x.tipo)).toContain("PORTAL_LINK_EMITIDO");
  });

  it("link vivo NUNCA acessado é substituído: emite o novo e REVOGA o anterior", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoNuncaAberto()] });
    const r = await pelaRota(m);
    expect(r.corpo?.link, "reemitir para quem nunca abriu é o gesto mais comum da operação").toBeTruthy();
    expect(inseriu(m)).toBe(true);
    expect(
      revogou(m),
      "dois links vivos na mesma admissão: o link de ontem que vazou no grupo da família continua valendo",
    ).toBe(true);
  });

  /**
   * A ABSTENÇÃO NÃO PODE TER FICADO LARGA DEMAIS. Vivo e acessado, mas já vencido, bloqueado ou
   * revogado, NÃO é sessão a proteger: ali se reemite, senão o consultor fica sem saída nenhuma
   * para o candidato cujo link morreu.
   */
  it("acessado porém VENCIDO, BLOQUEADO ou REVOGADO não segura a emissão", async () => {
    const fora: Array<[string, LinkFake]> = [
      ["vencido", vivoEAberto({ expiraEm: new Date(AGORA - 60_000) })],
      ["bloqueado", vivoEAberto({ bloqueadoEm: new Date(AGORA - 60_000) })],
      ["revogado", vivoEAberto({ revogadoEm: new Date(AGORA - 60_000) })],
    ];
    for (const [rotulo, link] of fora) {
      const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [link] });
      const r = await pelaRota(m);
      expect(r.corpo?.link, `abstenção larga demais: link ${rotulo} travou a emissão`).toBeTruthy();
    }
  });

  /**
   * A JANELA DE 3 MINUTOS NÃO ALCANÇA ESTA PORTA, pelo mesmo motivo do link para copiar: a URL
   * volta UMA vez e não é devolvida por rota de leitura nenhuma (§A.6). Recusar por três minutos
   * deixa quem perdeu a área de transferência SEM SAÍDA.
   */
  it("gerar DUAS VEZES seguidas funciona nas duas: `ENVIADO_HA_POUCO` não é desta porta", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    const primeiro = await pelaRota(m);
    const segundo = await pelaRota(m);
    expect(primeiro.corpo?.link).toBeTruthy();
    expect(
      String(segundo.corpo?.motivo ?? ""),
      "a janela do e-mail alcançou a rota antiga e deixou o consultor sem saída",
    ).not.toBe("ENVIADO_HA_POUCO");
    expect(segundo.corpo?.link, "o segundo clique não devolveu URL nenhuma").toBeTruthy();
    expect(String(segundo.corpo?.link)).not.toBe(String(primeiro.corpo?.link));
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 4. O CONTRATO DE FIO, e ele é o motivo pelo qual o diretor pediu APONTAR e não remover
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("requisito 4: no sucesso, o corpo continua trazendo `link` e `expiraEm` em ISO", () => {
  const corpoBom = async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    const r = await pelaRota(m);
    expect(r.erro, "o caminho feliz lançou: o consumidor antigo recebe erro onde recebia link").toBeNull();
    return r.corpo;
  };

  it("`link` vem, é string, e é a URL com o token no FRAGMENTO", async () => {
    const corpo = await corpoBom();
    expect(Object.keys(corpo ?? {}), "o campo `link` sumiu do corpo").toContain("link");
    expect(typeof corpo.link).toBe("string");
    expect(
      String(corpo.link),
      "o token saiu do fragmento: ele passa a aparecer no log do proxy e no `Referer` (§A.6)",
    ).toContain("#");
  });

  /**
   * ISO, E ISSO SE MEDE POR IDA E VOLTA. `Date` serializado pelo Nest também vira ISO no fio, mas
   * quem lê `expiraEm` como string sem parse quebra se o campo virar objeto no corpo do serviço.
   * A régua é a mesma de hoje: `expiraEm.toISOString()`.
   */
  it("`expiraEm` vem, é string ISO, e sobrevive ao ida e volta", async () => {
    const corpo = await corpoBom();
    expect(Object.keys(corpo ?? {}), "o campo `expiraEm` sumiu do corpo").toContain("expiraEm");
    expect(typeof corpo.expiraEm, "`expiraEm` deixou de ser string ISO").toBe("string");
    const iso = String(corpo.expiraEm);
    expect(new Date(iso).toISOString(), "o formato mudou de ISO para outra coisa").toBe(iso);
    expect(new Date(iso).getTime(), "o prazo nasceu no passado").toBeGreaterThan(AGORA);
  });

  /**
   * CAMPO NOVO PODE, CAMPO A MENOS NÃO. Apontar para o caminho novo provavelmente traz `gerado` e
   * `motivo` junto, e quem lia só os dois de cima continua funcionando. O que não pode é a rota
   * antiga passar a devolver SÓ o contrato novo.
   */
  it("campos extras são admitidos, e o par antigo é coerente com eles quando existem", async () => {
    const corpo = await corpoBom();
    if ("gerado" in (corpo ?? {})) {
      expect(corpo.gerado, "o caso bom voltou com `gerado: false` e link junto").toBe(true);
      expect(corpo.motivo).toBeNull();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 1. A ABSTENÇÃO, que é a regra mais cara: não matar a sessão de quem está enviando
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("requisito 1: link VIVO e JÁ ACESSADO faz a rota antiga se ABSTER", () => {
  /**
   * O DANO QUE ESTE TESTE IMPEDE, e ele é o defeito que a mudança fecha: emitir REVOGA todos os
   * links vivos da admissão. Um "gerar link" clicado enquanto o candidato está no meio do upload
   * derruba a sessão dele. Nada falha, nada loga, e a tela dele morre.
   */
  it("NÃO REVOGA: o link do candidato continua vivo", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    await pelaRota(m);
    expect(revogou(m), "a sessão de quem estava enviando documento foi derrubada").toBe(false);
    expect(
      m.banco.escritas.find((e) => e.tipo === "update"),
      "houve escrita de atualização durante uma abstenção",
    ).toBeUndefined();
  });

  it("NÃO EMITE: nenhuma linha nova em `portal_links`", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    await pelaRota(m);
    expect(inseriu(m), "credencial nova para quem já está usando a anterior").toBe(false);
  });

  /** O link que o candidato tem em mãos segue valendo: a linha do cenário não foi tocada. */
  it("a linha do link anterior fica intacta: sem `revogadoEm` e sem `bloqueadoEm`", async () => {
    const anterior = vivoEAberto();
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [anterior] });
    await pelaRota(m);
    expect(anterior.revogadoEm, "o link vivo do candidato foi revogado pelas costas").toBeNull();
    expect(anterior.bloqueadoEm, "o link vivo do candidato foi bloqueado pelas costas").toBeNull();
  });

  it("abstenção é NÃO EVENTO: nada vai para a trilha", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    await pelaRota(m);
    expect(m.trilha.registros, "a abstenção virou evento e polui a trilha da admissão").toEqual([]);
  });

  /**
   * NENHUMA URL VOLTA NA ABSTENÇÃO. O contrato antigo trazia `link` sempre, e a tela antiga o
   * mostra: devolver a URL do link ANTIGO (ou uma nova) aqui faria o consultor entregar credencial
   * achando que se absteve. Este teste não decide se a rota recusa por dado ou por exceção, só
   * proíbe a URL.
   */
  it("não devolve URL nenhuma quando se abstém", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    const r = await pelaRota(m);
    if (r.ok) {
      expect(r.corpo?.link, "a URL voltou junto com a abstenção").toBeFalsy();
      if ("gerado" in (r.corpo ?? {})) expect(r.corpo.gerado).toBe(false);
      if ("motivo" in (r.corpo ?? {})) expect(r.corpo.motivo).toBe("LINK_VIVO_EM_USO");
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 2. O RECORTE DE FAROL, e a exigência dura é que NADA seja escrito fora dele
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("requisito 2: farol fora do recorte NÃO gera link nenhum", () => {
  /**
   * Declínio e rescisão estão encerrados (§A.16), e a pré-admissão do funil
   * (`AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`) chega sem cliente, sem cargo e sem régua: não
   * há o que o candidato enviar, e a credencial o chamaria para uma coleta inexistente.
   *
   * O LAÇO É SOBRE A CONSTANTE COMPARTILHADA, e não sobre uma lista redigitada aqui: régua copiada
   * diverge da original no primeiro ajuste, e a divergência aparece como credencial emitida para
   * quem não deveria, que é silenciosa.
   */
  for (const farol of FAROIS_FORA_DO_PAINEL) {
    describe(`farol ${farol}`, () => {
      it("recusa, e nada é escrito em `portal_links`", async () => {
        const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { farol });
        const r = await pelaRota(m);
        expect(r.erro, "a recusa por farol virou exceção em cima do consultor").toBeNull();
        expect(r.corpo?.link, `emitiu credencial para admissão com farol ${farol}`).toBeFalsy();
        expect(inseriu(m), "linha nova em `portal_links` para admissão fora do recorte").toBe(false);
      });

      it("não revoga o que já existe: a admissão fora do recorte nem deveria ser alcançada", async () => {
        const m = montar(
          { pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoNuncaAberto()] },
          { farol },
        );
        await pelaRota(m);
        expect(revogou(m)).toBe(false);
        expect(inseriu(m)).toBe(false);
      });

      it("não vira evento na trilha", async () => {
        const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { farol });
        await pelaRota(m);
        expect(m.trilha.registros).toEqual([]);
      });

      it("o motivo é explícito: `SEM_ADMISSAO`, e não a abstenção", async () => {
        const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { farol });
        const r = await pelaRota(m);
        if ("motivo" in (r.corpo ?? {})) {
          expect(
            r.corpo.motivo,
            "recusa por farol relatada como abstenção: a tela dirá que existe link vivo onde não existe nenhum",
          ).toBe("SEM_ADMISSAO");
        }
        if ("gerado" in (r.corpo ?? {})) expect(r.corpo.gerado).toBe(false);
      });
    });
  }

  /**
   * O RECORTE PELO OUTRO LADO, e sem ele a regra 2 poderia ser "cumprida" fechando a rota inteira.
   * Farol vivo continua emitindo.
   */
  it("farol VIVO (`EM_ADMISSAO`) continua emitindo normalmente", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { farol: "EM_ADMISSAO" });
    const r = await pelaRota(m);
    expect(r.corpo?.link, "o recorte ficou largo demais e fechou a admissão viva").toBeTruthy();
    expect(inseriu(m)).toBe(true);
  });

  it("`BANCO_AGUARDAR` e `ADMISSAO_CONCLUIDA` também seguem emitindo", async () => {
    for (const farol of ["BANCO_AGUARDAR", "ADMISSAO_CONCLUIDA"]) {
      const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { farol });
      const r = await pelaRota(m);
      expect(r.corpo?.link, `o recorte barrou o farol ${farol}, que está dentro`).toBeTruthy();
    }
  });

  /** Admissão que nem existe continua sendo erro, e não um desfecho silencioso de dado. */
  it("admissão inexistente continua lançando, e não emite nada", async () => {
    const m = montar({ pessoa: null });
    const r = await pelaRota(m);
    expect(inseriu(m)).toBe(false);
    expect(revogou(m)).toBe(false);
    if (r.ok) expect(r.corpo?.link).toBeFalsy();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITOS 5 E 6. REGRESSÃO: OS DOIS CAMINHOS NOVOS NÃO PODEM TER MUDADO
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("requisito 5: o caminho do E-MAIL continua exatamente como foi auditado", () => {
  const enviar = (m: Montagem) =>
    m.envio.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");

  it("sem e-mail: recusa SEM_EMAIL e NÃO emite", async () => {
    const m = montar(
      { pessoa: { email: null, admissaoId: ADMISSAO_SINTETICA } },
      { correioLigado: true },
    );
    const r = await enviar(m);
    expect(r.motivo).toBe("SEM_EMAIL");
    expect(inseriu(m), "emitiu link para um envio que não podia sair").toBe(false);
  });

  it("e-mail inválido: recusa EMAIL_INVALIDO e NÃO emite", async () => {
    const m = montar(
      { pessoa: { email: "fulano.detal@", admissaoId: ADMISSAO_SINTETICA } },
      { correioLigado: true },
    );
    const r = await enviar(m);
    expect(r.motivo).toBe("EMAIL_INVALIDO");
    expect(inseriu(m)).toBe(false);
  });

  it("correio desligado: recusa CANAL_INDISPONIVEL e NÃO emite (fail-closed)", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    const r = await enviar(m);
    expect(r.motivo).toBe("CANAL_INDISPONIVEL");
    expect(inseriu(m), "link vivo e órfão por um e-mail que nunca sairia").toBe(false);
  });

  it("continua se abstendo por LINK_VIVO_EM_USO, sem revogar", async () => {
    const m = montar(
      { pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] },
      { correioLigado: true },
    );
    const r = await enviar(m);
    expect(r.motivo).toBe("LINK_VIVO_EM_USO");
    expect(revogou(m)).toBe(false);
  });

  /** A janela de 3 minutos é DO E-MAIL. Dispensá-la na porta de gerar não pode apagá-la aqui. */
  it("continua se abstendo por ENVIADO_HA_POUCO", async () => {
    const recem = vivoNuncaAberto({
      enviadoEm: new Date(AGORA - 5_000),
      criadoEm: new Date(AGORA - 5_000),
    });
    const m = montar(
      { pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [recem] },
      { correioLigado: true },
    );
    const r = await enviar(m);
    expect(
      r.motivo,
      "a janela de reenvio sumiu: um segundo clique mata a mensagem na caixa do candidato",
    ).toBe("ENVIADO_HA_POUCO");
    expect(revogou(m)).toBe(false);
  });

  it("caminho feliz: envia, mascara o destino e NÃO devolve a URL", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { correioLigado: true });
    const r = await enviar(m);
    expect(r.enviado).toBe(true);
    expect(m.correio.enviados.length).toBe(1);
    expect(Object.keys(r), "a credencial voltou pela rota do e-mail").not.toContain("link");
    expect(String(r.destinoMascarado)).toContain("*");
  });

  it("admissão fora do recorte continua lançando NotFound no caminho do e-mail", async () => {
    const m = montar({ pessoa: null }, { correioLigado: true });
    await expect(enviar(m)).rejects.toThrow();
  });
});

describe("requisito 6: o caminho de COPIAR continua exatamente como foi auditado", () => {
  const copiar = (m: Montagem) => m.envio.gerarLinkParaCopiar(ADMISSAO_SINTETICA, AUTOR_SINTETICO);

  it("gera sem e-mail e com o correio DESLIGADO, que é o retrato da produção", async () => {
    const m = montar({ pessoa: { email: null, admissaoId: ADMISSAO_SINTETICA } });
    const r = await copiar(m);
    expect(r.motivo, "o link para copiar passou a depender de e-mail ou de canal").toBeNull();
    expect(r.gerado).toBe(true);
    expect(r.link).toBeTruthy();
  });

  it("segue SEM a janela de 3 minutos: duas gerações seguidas funcionam", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await copiar(m);
    const segundo = await copiar(m);
    expect(segundo.motivo).not.toBe("ENVIADO_HA_POUCO");
    expect(segundo.gerado).toBe(true);
  });

  it("segue se abstendo pelo link vivo já acessado", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    const r = await copiar(m);
    expect(r.gerado).toBe(false);
    expect(r.motivo).toBe("LINK_VIVO_EM_USO");
    expect(revogou(m)).toBe(false);
  });

  it("segue carimbando a origem `ENTREGA_A_MAO` e sem carimbo de envio", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await copiar(m);
    const valores = m.banco.escritas.find((e) => e.tipo === "insert")?.valores ?? {};
    expect(valores.envioOrigem).toBe("ENTREGA_A_MAO");
    for (const campo of ["enviadoEm", "envioCanal", "enviadoPorId"]) {
      expect(valores[campo], `${campo} carimbado por quem não enviou`).toBeUndefined();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 7. OS DOIS TESTES DE ARQUITETURA SÃO DELIBERADOS, e esta é a régua que eles impõem
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("requisito 7: a controller antiga não pode passar a expor o serviço de envio", () => {
  const bruto = () => fonteOuNulo("portal", "portal-links.controller.ts") ?? "";

  /**
   * ┌─ POR QUE ISTO É REGRA, E NÃO PREFERÊNCIA ───────────────────────────────────────────────────┐
   * │ `portal-envio-rbac.tester.spec.ts` varre o TEXTO CRU de toda controller pela string         │
   * │ `PortalEnvioService` (antes de tirar comentários) e o bloco S10 proíbe que uma controller    │
   * │ assim identificada fique sob o prefixo `portal/`. Esta classe está sob `portal/`, que é o    │
   * │ prefixo que a barreira do Fernando allowlista PARA A INTERNET.                               │
   * │                                                                                              │
   * │ Injetar o serviço de envio aqui quebra aqueles dois testes, e a quebra é CORRETA: ela diz    │
   * │ que a rota que fabrica credencial de acesso a prontuário voltou a ser identificada como      │
   * │ rota de envio dentro do prefixo público. O caminho limpo é a rota antiga apontar para o      │
   * │ comportamento novo SEM nomear aquele serviço nesta classe, e a menção não pode aparecer nem  │
   * │ em comentário, porque a varredura é do texto cru.                                            │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o nome `PortalEnvioService` não aparece no arquivo, nem em comentário", () => {
    expect(
      /PortalEnvioService/.test(bruto()),
      "a controller sob `portal/` passou a ser identificada como rota de envio: os dois testes de arquitetura (S10 e o da varredura) quebram por isto",
    ).toBe(false);
  });

  it("a classe continua sob o prefixo `portal/links`, sem mudança de superfície", () => {
    expect(semComentarios(bruto())).toMatch(/@Controller\(\s*["'`]portal\/links["'`]\s*\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 8 (§A.6). A URL É CREDENCIAL E NÃO SOBRA EM LUGAR NENHUM
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("requisito 8 (§A.6): a URL não vai para log, trilha nem banco", () => {
  const tokenDe = (link: unknown) => String(link ?? "").split("#").pop() ?? "";

  it("o token devolvido não aparece em escrita de banco nem na trilha", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    const r = await pelaRota(m);
    const token = tokenDe(r.corpo?.link);
    expect(token.length, "o token não foi lido do link: o teste passaria por acidente").toBeGreaterThan(
      20,
    );
    expect(
      textoDeTudo([m.banco.escritas, m.trilha.registros]),
      "a credencial foi persistida ou registrada",
    ).not.toContain(token);
  });

  it("nem o CPF nem o e-mail do candidato atravessam para a trilha desta emissão", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await pelaRota(m);
    const ficou = textoDeTudo([m.banco.escritas, m.trilha.registros]);
    expect(ficou).not.toContain(CPF_SINTETICO);
    expect(ficou).not.toContain(EMAIL_SINTETICO);
  });

  it("`PORTAL_LINK_EMITIDO` leva jti, autor e exp, e nenhum campo de credencial", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await pelaRota(m);
    const evento = m.trilha.registros.find((e) => e.tipo === "PORTAL_LINK_EMITIDO");
    expect(evento, "a emissão pela rota antiga não deixou rastro nenhum").toBeTruthy();
    const dados = (evento?.dados ?? {}) as Record<string, unknown>;
    expect(dados.jtiLink).toBeTruthy();
    expect(dados.autorId).toBe(AUTOR_SINTETICO);
    expect(typeof dados.exp).toBe("number");
    const chaves = Object.keys(dados).map((k) => k.toLowerCase());
    for (const proibido of ["link", "url", "token", "email", "cpf", "destino"]) {
      expect(chaves, `campo ${proibido} na trilha`).not.toContain(proibido);
    }
  });

  /** O log é a porta que mais escapa, porque ele não falha nunca. A prova é de FONTE. */
  it("o handler da rota antiga não loga link, url, token, e-mail nem CPF", () => {
    const fonte = semComentarios(fonteOuNulo("portal", "portal-links.controller.ts") ?? "");
    const logs = fonte.match(/this\.log\w*\.\w+\([^)]*\)/g) ?? [];
    for (const linha of logs) {
      expect(linha, "log com credencial dentro").not.toMatch(/\blink\b|\burl\b|email|token|cpf/i);
    }
  });
});
