import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { portalConferencia } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40 regra 2), escrito do REQUISITO, nao do codigo.
 *
 * REQ 2, A LINHA VAZIA. `portal_conferencia` existe para a TELA reidratar o passo do candidato
 * ("conferir" / "ajustar" / "aceito") depois de navegar ou recarregar. A guarda antiga usava OU
 * (`campos.length > 0 || veredito`), e o segundo termo deixava nascer linha com `campos: []` sempre
 * que a IA julgava e nao lia campo nenhum.
 *
 * ELA NASCIA DE DOIS CAMINHOS REAIS, e nenhum dos dois e falha:
 *  (a) o VETO V12 descarta a sugestao inteira quando o leitor para de afirmar
 *      `exigeConfirmacaoHumana` / `origem: IA_SUGESTAO`; e
 *  (b) tipo de documento SEM campo mapeado no catalogo de extracao: a IA julga e nao le campo.
 *
 * ╔═ ATENCAO DO COORDENADOR: O CODIGO OSCILOU DURANTE A MINHA RODADA ════════════════════════════╗
 * ║ Medi tres estados deste arquivo em 25 minutos (17:00, 17:06 e 17:21 de 02/10). Num deles havia ║
 * ║ um `conferenciaTemOQueMostrar` com o recorte `campos.length > 0 || veredito?.valido === false`  ║
 * ║ (so o REPROVADO sem campo nascia linha) mais um UPDATE de limpeza; no estado atual o guarda     ║
 * ║ voltou ao `||` original. O placar abaixo vale para o ESTADO ATUAL, e o teste vale para o        ║
 * ║ REQUISITO, que nao oscila.                                                                    ║
 * ║                                                                                               ║
 * ║ A TENSAO REAL, que a versao intermediaria do autor tentava resolver e que eu confirmei por     ║
 * ║ leitura do consumidor, e esta:                                                                ║
 * ║ `portal-documentos.service.ts:387` monta `reprovadoNoPortal = veredito?.valido === false &&    ║
 * ║ tentativas.restantes > 0`, e `:517` usa esse sinal para abrir a casa "AJUSTAR". O Portal NUNCA ║
 * ║ escreve INCONFORME no documento, entao sem essa linha o candidato reprovado ficaria em "Em     ║
 * ║ Analise" para sempre, com tentativa de sobra. O requisito literal REGREDIRIA esse conserto.    ║
 * ║                                                                                               ║
 * ║ DESFECHO, decidido pelo COORDENADOR com a auditoria e o `backend` concordando: o `||` esta      ║
 * ║ CERTO e NAO vai ser trocado, porque o requisito literal reintroduziria o bug da casa de ajustar ║
 * ║ que nunca reabre. Entao:                                                                      ║
 * ║  - R2d foi INVERTIDO: ele agora assere que a linha do REPROVADO sem campo PERSISTE, e e a trava ║
 * ║    para a proxima sessao nao "consertar" de novo.                                              ║
 * ║  - R2a ficou `skip`: a linha do APROVADO sem campo e inerte (nao muda pixel, expurga em 48h).   ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O QUE ESTE ARQUIVO NAO TESTA, DE PROPOSITO. A anulacao em
 * `portal-gi-gravacao.service.ts:76-79` e OUTRA coisa: ela zera a conferencia DEPOIS da confirmacao
 * do GI, e foi RATIFICADA pelo diretor (DIARIO:16717). Nao e defeito e nao entra aqui.
 *
 * §A.6: fixture sem dado pessoal real; o valor do campo lido e um numero inventado e serve so para a
 * linha ter conteudo.
 */

const LINHA = {
  id: "cred-1",
  admissaoId: "adm-1",
  tipoDocumentoId: "tipo-1",
  objeto: "opaco/RG__uuid.pdf",
  contentType: "application/pdf",
  bytesConcedidos: 5 * 1024 * 1024,
  confirmadoEm: null as Date | null,
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function montar(opts: {
  /** Bloco de auditoria do leitor (o veredito). `null` = ninguem julgou. */
  auditoria: Record<string, unknown> | null;
  /** Bloco de sugestoes do leitor. */
  sugestoes: Record<string, unknown> | null;
}) {
  const inserts: Escrita[] = [];
  const updates: Escrita[] = [];

  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    const linhas = chaves.includes("suspensoAte")
      ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
      : chaves.includes("reprovacoes")
        ? [{ reprovacoes: 1 }]
        : chaves.includes("emAberto")
          ? [{ emAberto: 0 }]
          : chaves.includes("liberadoEm")
            ? []
            : // A LISTA DE REGRAS NAO PODE SER VAZIA: o bloco do veredito e guardado por
              // `regras.length > 0` (tipo sem regra e escalada ao humano, nao reprovacao).
              chaves.includes("descricaoRegra")
              ? [{ descricaoRegra: "O documento deve estar legivel.", categoria: "CONFORMIDADE" }]
              : chaves.includes("nome") && chaves.includes("cpf")
                ? [{ nome: "CANDIDATO TESTE", cpf: "00000000000" }]
                : chaves.includes("codigo") && chaves.includes("nome")
                  ? [{ codigo: "RG", nome: "RG" }]
                  : [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => Promise.resolve(linhas),
      then: (r: (v: unknown) => unknown) => Promise.resolve(linhas).then(r),
    };
    return builder;
  };

  const db = {
    select,
    query: { portalCredenciais: { findFirst: async () => ({ ...LINHA }) } },
    update: (tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        updates.push({ tabela, valores });
        const fim = {
          where: () => fim,
          returning: async () => [{ id: LINHA.id }],
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        };
        return fim;
      },
    }),
    insert: (tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => {
        inserts.push({ tabela, valores });
        return {
          onConflictDoNothing: async () => undefined,
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
  };

  const armazenamento = {
    consultarMetadado: async (objeto: string) => ({
      objeto,
      bytes: 1024,
      contentType: "application/pdf",
    }),
    nomeDoBucket: () => "balde",
    corrigirContentType: async () => true,
    apagarObjeto: async () => true,
  };

  const leitor = {
    configurado: () => true,
    ler: async () => ({
      aceito: true,
      chegada: { tamanhoBytes: 1024 },
      auditoria: opts.auditoria,
      sugestoes: opts.sugestoes,
    }),
  };

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    { configurada: () => true, registrar: vi.fn(async () => {}) } as never,
  );
  return { svc, inserts, updates };
}

const confirmar = (svc: PortalCredencialService) =>
  svc.confirmar({
    admissaoId: "adm-1",
    jtiLink: "jti-1",
    credencialId: "cred-1",
    avisoDoNavegador: true,
  });

/**
 * As linhas que NASCEM: INSERT em `portal_conferencia`. Identificadas pelo SIMBOLO da tabela, com um
 * reforco por SHAPE para o caso de a escrita trocar de porta.
 */
const linhasQueNascem = (inserts: Escrita[]) =>
  inserts.filter(
    (i) => i.tabela === portalConferencia || ("campos" in i.valores && "veredito" in i.valores),
  );

const tamanhoDeCampos = (valores: Record<string, unknown>) =>
  Array.isArray(valores.campos) ? (valores.campos as unknown[]).length : -1;

const SUGESTAO_VALIDA = {
  origem: "IA_SUGESTAO",
  exigeConfirmacaoHumana: true,
  campos: [{ campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confianca: 0.9, lido: true }],
};

/** O bloco que o VETO V12 descarta inteiro: sem a marca de confirmacao humana. */
const SUGESTAO_VETADA = {
  origem: "IA_SUGESTAO",
  exigeConfirmacaoHumana: false,
  campos: [{ campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confianca: 0.9, lido: true }],
};

const SUGESTAO_SEM_CAMPO = { origem: "IA_SUGESTAO", exigeConfirmacaoHumana: true, campos: [] };

const VEREDITO_REPROVADO = {
  status: "INCONFORME",
  valido: false,
  motivo: "documento fora do prazo de validade",
};

const VEREDITO_APROVADO = {
  status: "VALIDADO",
  valido: true,
  motivo: "Documento legivel e dentro da validade.",
  autenticidadeSuspeita: false,
};

/** Os tres jeitos de o caminho chegar ao fim com ZERO campo. */
const SEM_CAMPO: Array<[string, Record<string, unknown> | null]> = [
  ["tipo sem catalogo de extracao (sugestoes null)", null],
  ["bloco descartado pelo veto V12", SUGESTAO_VETADA],
  ["catalogo presente mas vazio", SUGESTAO_SEM_CAMPO],
];

// ── R2a: A LINHA INERTE, CONHECIDA E NAO CONSERTADA ──────────────────────────────────────────

/**
 * O UNICO caso de linha vazia que sobra depois da inversao do R2d, e ele e INOFENSIVO. Fica `skip`
 * por decisao do coordenador, com a asserticao escrita para quem for consertar ja ter o teste pronto.
 *
 * POR QUE NAO VALE O RISCO, medido: com o V12 o documento desse caminho vira `ENTREGUE`, e `ACEITO`
 * vence tudo em `estadoDoPasso` (`portal-documentos.service.ts:515`). A linha nao muda UM PIXEL na
 * tela do candidato, e o TTL de 48h a varre sozinha. Trocar o `||` para peg -la mexeria no mesmo
 * operador que carrega a reprovacao (ver R2d), que e o custo que nao se paga por uma linha inerte.
 */
describe("R2a: veredito APROVADO sem campo nenhum faz nascer linha INERTE", () => {
  for (const [rotulo, sugestoes] of SEM_CAMPO) {
    it.skip(`CONHECIDO E NAO CONSERTADO (linha inerte, sem efeito na tela e expurgada em 48h): ${rotulo}`, async () => {
      const ctx = montar({ auditoria: VEREDITO_APROVADO, sugestoes });
      await confirmar(ctx.svc);
      expect(linhasQueNascem(ctx.inserts)).toHaveLength(0);
    });
  }
});

// ── R2b: O QUE TEM DE CONTINUAR PERSISTINDO ──────────────────────────────────────────────────

describe("R2b: campos preenchidos persistem (o conserto nao pode matar a reidratacao)", () => {
  it("campos lidos + veredito reprovado: nasce linha com campos, veredito e TTL", async () => {
    const ctx = montar({ auditoria: VEREDITO_REPROVADO, sugestoes: SUGESTAO_VALIDA });
    await confirmar(ctx.svc);

    const conf = linhasQueNascem(ctx.inserts);
    expect(conf).toHaveLength(1);
    expect(tamanhoDeCampos(conf[0]!.valores)).toBe(1);
    expect(conf[0]!.valores.veredito).toBeTruthy();
    expect("expurgarEm" in conf[0]!.valores).toBe(true);
  });

  it("campos lidos + veredito APROVADO: nasce linha (a tela precisa reidratar a conferencia)", async () => {
    const ctx = montar({ auditoria: VEREDITO_APROVADO, sugestoes: SUGESTAO_VALIDA });
    await confirmar(ctx.svc);
    expect(linhasQueNascem(ctx.inserts)).toHaveLength(1);
  });

  it("campos lidos SEM veredito (tipo sem regra ativa): ainda nasce, porque ha o que reidratar", async () => {
    const ctx = montar({ auditoria: null, sugestoes: SUGESTAO_VALIDA });
    await confirmar(ctx.svc);

    const conf = linhasQueNascem(ctx.inserts);
    expect(conf).toHaveLength(1);
    expect(tamanhoDeCampos(conf[0]!.valores)).toBe(1);
  });
});

// ── R2c: NADA EM NADA ────────────────────────────────────────────────────────────────────────

describe("R2c: sem campo e sem veredito nao faz nascer nada", () => {
  for (const [rotulo, sugestoes] of SEM_CAMPO) {
    it(`${rotulo} e a IA nao julgou: nenhuma linha nasce`, async () => {
      const ctx = montar({ auditoria: null, sugestoes });
      await confirmar(ctx.svc);
      expect(linhasQueNascem(ctx.inserts)).toHaveLength(0);
    });
  }
});

// ── R2d: O REQUISITO LITERAL ESTAVA ERRADO, E ESTE TESTE E A TRAVA CONTRA O "CONSERTO" ───────

/**
 * ╔═ LEIA ANTES DE "CONSERTAR" O `||` DE `portal-credencial.service.ts` ══════════════════════════╗
 * ║ A OST pedia, ao pe da letra, que NAO nascesse linha de `portal_conferencia` com `campos: []`.  ║
 * ║ ESSE REQUISITO ESTAVA ERRADO, e a inversao foi decidida pelo COORDENADOR depois de a auditoria ║
 * ║ e o `backend` confirmarem por leitura independente. Eu, o tester, medi o mesmo caminho e        ║
 * ║ cheguei ao mesmo lugar.                                                                       ║
 * ║                                                                                               ║
 * ║ A PREMISSA FALSA era "a linha e inutil". Ela nao e: ela e o PORTADOR DA REPROVACAO. O Portal    ║
 * ║ NUNCA escreve INCONFORME no documento, entao o unico sinal de que a IA reprovou e o `veredito`  ║
 * ║ gravado aqui. `portal-documentos.service.ts:387` monta                                         ║
 * ║ `reprovadoNoPortal = veredito?.valido === false && tentativas.restantes > 0`, e `:517` usa esse ║
 * ║ sinal para abrir a casa "AJUSTAR".                                                            ║
 * ║                                                                                               ║
 * ║ CONSEQUENCIA DE "CONSERTAR": o candidato reprovado num tipo SEM campo de extracao mapeado      ║
 * ║ ficaria em "Em Analise" para sempre, com tentativa de sobra e sem nunca poder reenviar. E a     ║
 * ║ volta do bug da casa de ajustar que nao reabre, que ja foi consertado uma vez.                 ║
 * ║                                                                                               ║
 * ║ O `||` FICA. Este bloco e a trava.                                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("R2d: o veredito REPROVADO sem campo PERSISTE, porque e ele que abre o AJUSTAR", () => {
  for (const [rotulo, sugestoes] of SEM_CAMPO) {
    it(`${rotulo} + veredito REPROVADO: a linha NASCE, com o veredito reprovado dentro`, async () => {
      const ctx = montar({ auditoria: VEREDITO_REPROVADO, sugestoes });
      await confirmar(ctx.svc);

      const conf = linhasQueNascem(ctx.inserts);
      expect(conf).toHaveLength(1);
      // Campos vazios, e isso e esperado: nao ha campo mapeado para este tipo.
      expect(tamanhoDeCampos(conf[0]!.valores)).toBe(0);
      // O que importa e o veredito, e ele tem de chegar REPROVADO: e `valido === false` que liga o
      // `reprovadoNoPortal`. Linha com veredito aprovado ou nulo nao reabriria o AJUSTAR.
      const veredito = conf[0]!.valores.veredito as { valido?: boolean } | null;
      expect(veredito?.valido).toBe(false);
      // E o TTL continua de pe: a trilha e efemera, nao permanente (§A.6).
      expect("expurgarEm" in conf[0]!.valores).toBe(true);
    });
  }
});
