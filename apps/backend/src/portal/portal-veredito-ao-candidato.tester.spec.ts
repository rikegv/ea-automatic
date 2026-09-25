import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO (§A.40 regra 2).
 *
 * REQUISITO R4: O CANDIDATO VÊ O MOTIVO. A rota do Portal devolve VEREDITO e MOTIVO LEGÍVEL,
 * dizendo o que corrigir.
 *
 * ┌─ O QUE FALHA HOJE, medido no código ────────────────────────────────────────────────────────┐
 * │ O leitor devolve `auditoria: { valido, status, motivo }`, e `portal-credencial.service.ts`    │
 * │ usa esse bloco para UMA coisa só: decidir se queima tentativa (`registrarDesfecho`). O        │
 * │ `lerComIa` devolve `{ campos, origem }` e o motivo é DESCARTADO ali mesmo. O que chega ao     │
 * │ candidato é `{ entregue: true, sugestao, jaConfirmado }`.                                     │
 * │                                                                                               │
 * │ O EFEITO REAL, e ele é o oposto do que o desenho promete: o candidato reprovado recebe uma    │
 * │ resposta de SUCESSO, não sabe que foi reprovado, não sabe o que corrigir, reenvia o MESMO     │
 * │ arquivo e queima as três tentativas sem nunca ter lido um motivo. É o mesmo buraco que o ASO  │
 * │ tinha na esteira e que já foi corrigido lá.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ONDE O AUTOR ERRA, E É O ITEM 7 ───────────────────────────────────────────────────────────┐
 * │ `entregue` JÁ EXISTE na resposta e parece um veredito. NÃO É. Ele responde "o arquivo chegou  │
 * │ ao armazenamento?", que é a confirmação do lado do servidor (veto V11), e vale `true` também  │
 * │ para o documento que a IA reprovou, porque o arquivo chegou mesmo.                            │
 * │                                                                                               │
 * │ As duas saídas erradas, as duas plausíveis:                                                   │
 * │  a) reusar `entregue` como veredito. O candidato reprovado passa a ver "não foi possível      │
 * │     enviar", reenvia por achar que foi a rede, e queima tentativa por um envio que deu certo; │
 * │  b) devolver SÓ o texto do motivo. A tela passa a decidir aprovado ou reprovado lendo frase   │
 * │     escrita por um modelo de IA, que muda de redação a cada versão do prompt.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E É O ITEM 6: o motivo vem de um MODELO DE IA, ou seja, é texto livre que ninguém revisou
 * antes de sair. Texto livre é exatamente por onde o dado pessoal volta (é o motivo declarado de
 * `portal-evento.ts` recusar campo de observação). A rede tem de estar do NOSSO lado: o que o modelo
 * escreveu não pode ser repassado cru só porque o destino é a tela do próprio candidato.
 */

const MB = 1024 * 1024;

/** O que o modelo escreveu, e que NÃO pode sair daqui como está. §A.6. */
const PII = {
  nome: "Fulano De Tal",
  nomeMae: "Maria Das Dores",
  cpfCru: "52998224725",
  cpfPontuado: "529.982.247-25",
  nascimento: "14/03/1990",
  rg: "12.345.678-9",
};

/**
 * O motivo TÍPICO de um modelo que recebeu nome e CPF na entrada: ele repete o que comparou. Esta é
 * a forma real, não uma hipótese, porque a régua de auditoria manda conferir o documento CONTRA o
 * cadastro, então a frase que explica a reprovação cita os dois lados.
 */
const MOTIVO_COM_PII =
  `O CPF lido no documento (${PII.cpfPontuado}) não confere com o do cadastro. ` +
  `O nome ${PII.nome}, filho de ${PII.nomeMae}, nascido em ${PII.nascimento}, aparece ilegível. ` +
  `O RG ${PII.rg} está cortado na foto.`;

const MOTIVO_LIMPO =
  "A foto está cortada e o número do documento não aparece inteiro. Envie o documento sobre uma " +
  "superfície plana, com as quatro bordas visíveis.";

const LINHA = {
  id: "cred-1",
  admissaoId: "adm-1",
  tipoDocumentoId: "tipo-1",
  objeto: "opaco/RG__uuid.pdf",
  contentType: "application/pdf",
  bytesConcedidos: 5 * MB,
  confirmadoEm: null as Date | null,
};

function montar(opts: {
  /** O bloco de auditoria que o leitor devolve. `null` = tipo sem regra ativa. */
  auditoria?: { valido: boolean; status: string; motivo: string; camposConferidos?: string[] } | null;
  semRegraAtiva?: boolean;
  /** O bloco de sugestões do leitor (auto-preenchimento). Ausente = sem sugestão. */
  sugestoes?: {
    origem: string;
    exigeConfirmacaoHumana: boolean;
    campos: Array<{ campo: string; rotulo: string; valor: string; confianca: number; lido: boolean }>;
  } | null;
}) {
  const logs: string[] = [];
  const escritas: Array<{ valores: Record<string, unknown> }> = [];

  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    // O LINK VIVO, conferido pela confirmação desde a frente da IDENTIDADE. Sempre em pé aqui.
    const linhas = chaves.includes("suspensoAte")
      ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
      : chaves.includes("reprovacoes")
      ? [{ reprovacoes: 1 }]
      : chaves.includes("descricaoRegra")
        ? opts.semRegraAtiva
          ? []
          : [{ descricaoRegra: "o CPF do documento tem de coincidir com o do cadastro" }]
        : chaves.includes("nome") && chaves.includes("cpf")
          ? [{ nome: PII.nome, cpf: PII.cpfCru }]
          : chaves.includes("codigo") && chaves.includes("nome")
            ? [{ codigo: "RG", nome: "RG" }]
            : [];
    const b = {
      from: () => b,
      innerJoin: () => b,
      where: () => Promise.resolve(linhas),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(linhas).then(ok),
    };
    return b;
  };

  const db = {
    select,
    query: { portalCredenciais: { findFirst: async () => ({ ...LINHA }) } },
    update: () => ({
      set: (valores: Record<string, unknown>) => {
        escritas.push({ valores });
        const fim = {
          where: () => fim,
          returning: async () => [{ id: LINHA.id }],
          then: (ok: (v: unknown) => unknown) => Promise.resolve(undefined).then(ok),
        };
        return fim;
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => undefined,
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  };

  const armazenamento = {
    consultarMetadado: async (objeto: string) => ({ objeto, bytes: 1024, contentType: "application/pdf" }),
    nomeDoBucket: () => "balde",
    corrigirContentType: async () => true,
    apagarObjeto: async () => true,
  };

  const leitor = {
    configurado: () => true,
    ler: async () => ({
      aceito: true,
      chegada: { tamanhoBytes: 1024 },
      auditoria: opts.auditoria === undefined ? null : opts.auditoria,
      sugestoes: opts.sugestoes ?? null,
    }),
  };

  /** A trilha, e tudo o que passou por ela, para a conferência de §A.6. */
  const eventos: Array<{ tipo: string; dados: Record<string, unknown> }> = [];
  const trilha = {
    configurada: () => true,
    registrar: vi.fn(async (tipo: string, dados: Record<string, unknown>) => {
      eventos.push({ tipo, dados: dados ?? {} });
    }),
  };

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    trilha as never,
  );

  // Todo log do serviço é capturado: motivo com PII em `logger.log` é a mesma fuga, por outra porta.
  for (const metodo of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn((svc as unknown as { log: Record<string, unknown> }).log as never, metodo).mockImplementation(
      ((...a: unknown[]) => {
        logs.push(a.map((x) => String(x)).join(" "));
      }) as never,
    );
  }

  return { svc, eventos, logs, escritas };
}

const confirmar = (svc: PortalCredencialService) =>
  svc.confirmar({
    admissaoId: "adm-1",
    jtiLink: "jti-1",
    credencialId: "cred-1",
    avisoDoNavegador: true,
  });

const REPROVADO = { valido: false, status: "INCONFORME", motivo: MOTIVO_LIMPO, camposConferidos: ["cpf"] };
const APROVADO = { valido: true, status: "VALIDADO", motivo: "Documento legível e conferido.", camposConferidos: ["cpf"] };

/**
 * O MOTIVO QUE CHEGOU AO CANDIDATO, procurado na resposta sem exigir um nome de campo específico.
 * O requisito manda devolver motivo legível; ele NÃO manda como se chama o campo, e travar o nome
 * mediria desenho em vez da propriedade pedida.
 */
function motivoDa(resposta: Record<string, unknown>): string | null {
  const candidatos = [
    resposta.motivo,
    resposta.motivoLegivel,
    resposta.mensagem,
    (resposta.veredito as Record<string, unknown> | undefined)?.mensagem,
    (resposta.veredito as Record<string, unknown> | undefined)?.motivo,
    (resposta.auditoria as Record<string, unknown> | undefined)?.mensagem,
    (resposta.auditoria as Record<string, unknown> | undefined)?.motivo,
  ];
  const achado = candidatos.find((c) => typeof c === "string" && c.trim().length > 0);
  return typeof achado === "string" ? achado : null;
}

/**
 * O VEREDITO LEGÍVEL POR MÁQUINA: um valor que separa aprovado de reprovado SEM ler frase.
 * Aceita booleano ou código curto, e recusa de propósito o `entregue` (que é chegada, não veredito)
 * e o próprio motivo (que é texto).
 */
function vereditoDa(resposta: Record<string, unknown>): unknown {
  const alvos: unknown[] = [
    resposta.veredito,
    resposta.aprovado,
    resposta.valido,
    resposta.statusAuditoria,
    (resposta.veredito as Record<string, unknown> | undefined)?.status,
    (resposta.veredito as Record<string, unknown> | undefined)?.valido,
    (resposta.auditoria as Record<string, unknown> | undefined)?.status,
    (resposta.auditoria as Record<string, unknown> | undefined)?.valido,
  ];
  return alvos.find(
    (v) => typeof v === "boolean" || (typeof v === "string" && /^[A-Z_]{3,30}$/.test(v)),
  );
}

describe("R4.5: reprovou, a resposta carrega VEREDITO e MOTIVO", () => {
  it("a reprovação chega ao candidato, com o que corrigir", async () => {
    const ctx = montar({ auditoria: REPROVADO });

    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;

    expect(
      vereditoDa(r),
      `a resposta não distingue aprovado de reprovado por campo nenhum. Recebido: ${JSON.stringify(r)}`,
    ).toBeDefined();
    expect(
      motivoDa(r),
      `a resposta não carrega motivo: o candidato foi reprovado e não sabe o que corrigir. Recebido: ${JSON.stringify(r)}`,
    ).toBeTruthy();
  });

  /**
   * O MOTIVO NÃO PRECISA SER A FRASE DO MODELO, e travar a frase dele aqui seria medir desenho e
   * ainda brigar com o item 6. O que o requisito pede é que o candidato saiba O QUE CORRIGIR, e
   * isso se mede pela VARIAÇÃO: uma frase única para toda reprovação não ensina nada, e manda o
   * candidato reenviar o mesmo arquivo até esgotar as três tentativas.
   */
  it("o motivo VARIA conforme o que houve: frase única não ensina o que corrigir", async () => {
    const ilegivel = motivoDa(
      (await confirmar(montar({ auditoria: { ...REPROVADO, motivo: "A foto está borrada e ilegível." } }).svc)) as never,
    );
    const vencido = motivoDa(
      (await confirmar(montar({ auditoria: { ...REPROVADO, motivo: "O documento está vencido desde 2024." } }).svc)) as never,
    );

    expect(ilegivel).toBeTruthy();
    expect(vencido).toBeTruthy();
    expect(
      ilegivel,
      "documento ilegível e documento vencido recebem a MESMA frase: o candidato não sabe o que corrigir",
    ).not.toEqual(vencido);
  });

  it("aprovado também vem com veredito: silêncio não é aprovação", async () => {
    const ctx = montar({ auditoria: APROVADO });
    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    expect(vereditoDa(r)).toBeDefined();
  });
});

describe("R4.6, §A.6: o motivo vem de um modelo, então a rede é NOSSA", () => {
  it("nenhum dado pessoal escrito pelo modelo atravessa para a resposta", async () => {
    const ctx = montar({ auditoria: { ...REPROVADO, motivo: MOTIVO_COM_PII } });

    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    const motivo = motivoDa(r);
    expect(motivo, "sem motivo não há o que conferir: o item 5 é pré-requisito deste").toBeTruthy();

    for (const [rotulo, valor] of Object.entries(PII)) {
      expect(motivo, `o motivo repassou ${rotulo} escrito pelo modelo, cru`).not.toContain(valor);
    }
  });

  /**
   * O CASO QUE NÃO TEM DEFESA, e ele é o mais comum da operação: o candidato sobe, por engano, o
   * documento de OUTRA PESSOA (o do cônjuge, o do filho, a foto errada do rolo da câmera). A régua
   * manda conferir contra o cadastro, então a reprovação existe justamente PORQUE os dados não são
   * os dele, e a frase do modelo explica a reprovação CITANDO o que leu no papel.
   *
   * "É a tela do próprio candidato" deixa de valer aqui: o dado exibido é de terceiro, e quem o
   * exibiu foi o nosso servidor, repassando texto que nenhum humano revisou.
   */
  it("o documento de OUTRA pessoa não devolve o dado dela na frase da reprovação", async () => {
    const DE_TERCEIRO = {
      nome: "Joana Ribeiro Prado",
      cpf: "111.444.777-35",
      nascimento: "02/09/1974",
    };
    const ctx = montar({
      auditoria: {
        ...REPROVADO,
        motivo:
          `O documento enviado é de ${DE_TERCEIRO.nome}, CPF ${DE_TERCEIRO.cpf}, ` +
          `nascida em ${DE_TERCEIRO.nascimento}, e não do candidato do cadastro.`,
      },
    });

    const motivo = motivoDa((await confirmar(ctx.svc)) as unknown as Record<string, unknown>);
    expect(motivo, "o item 5 é pré-requisito deste").toBeTruthy();
    for (const [rotulo, valor] of Object.entries(DE_TERCEIRO)) {
      expect(motivo, `o motivo exibiu ${rotulo} de TERCEIRO na tela do candidato`).not.toContain(valor);
    }
  });

  it("e o motivo com dado pessoal não vai para a trilha nem para o log", async () => {
    const ctx = montar({ auditoria: { ...REPROVADO, motivo: MOTIVO_COM_PII } });

    await confirmar(ctx.svc);

    const registrado = JSON.stringify(ctx.eventos) + ctx.logs.join(" ");
    for (const [rotulo, valor] of Object.entries(PII)) {
      expect(registrado, `${rotulo} apareceu na trilha ou no log`).not.toContain(valor);
    }
    // O texto do motivo, inteiro, também não: a trilha guarda CÓDIGO, nunca frase (portal-evento.ts).
    expect(registrado).not.toContain("não confere com o do cadastro");
  });
});

describe("R4.7: aprovado e reprovado se distinguem SEM interpretar texto", () => {
  it("o valor do veredito MUDA entre aprovado e reprovado", async () => {
    const aprovado = (await confirmar(montar({ auditoria: APROVADO }).svc)) as unknown as Record<string, unknown>;
    const reprovado = (await confirmar(montar({ auditoria: REPROVADO }).svc)) as unknown as Record<string, unknown>;

    const a = vereditoDa(aprovado);
    const b = vereditoDa(reprovado);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a, "aprovado e reprovado devolvem o MESMO veredito: a tela teria de ler a frase").not.toEqual(b);
  });

  /**
   * O ERRO (a) do cabeçalho. `entregue` responde à chegada do arquivo, e reprovar um documento que
   * chegou NÃO é falha de envio: virar `false` faz a tela dizer que o envio não deu certo, e o
   * candidato reenviar o mesmo arquivo, queimando tentativa por um envio que funcionou.
   */
  it("`entregue` continua TRUE no reprovado: o arquivo chegou, quem não serve é o documento", async () => {
    const ctx = montar({ auditoria: REPROVADO });
    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    expect(r.entregue).toBe(true);
  });

  /**
   * O ERRO (b). Um campo de veredito cujo valor seja a própria frase do modelo não resolve nada:
   * continua sendo a tela interpretando texto, só que com outro nome.
   */
  it("o veredito NÃO é o texto do motivo disfarçado de campo", async () => {
    const ctx = montar({ auditoria: REPROVADO });
    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    const veredito = vereditoDa(r);
    expect(typeof veredito === "boolean" || /^[A-Z_]{3,30}$/.test(String(veredito))).toBe(true);
  });

  /**
   * TIPO SEM REGRA ATIVA É ESCALADA AO HUMANO, NÃO REPROVAÇÃO DO CANDIDATO. O serviço já trata isso
   * no teto (`regras.length > 0`), e o veredito ao candidato tem de concordar: dizer "reprovado" a
   * quem mandou documento bom, porque ninguém cadastrou regra, é acusar a pessoa do nosso buraco.
   */
  it("sem regra ativa, o candidato NÃO é informado como reprovado", async () => {
    const ctx = montar({
      semRegraAtiva: true,
      auditoria: { valido: false, status: "PENDENTE", motivo: "validação manual necessária" },
    });

    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    const veredito = vereditoDa(r);
    expect(veredito === false || veredito === "INCONFORME").toBe(false);
  });
});

describe("R4: o que já funcionava continua funcionando", () => {
  it("a confirmação repetida segue idempotente e não reprocessa", async () => {
    const ctx = montar({ auditoria: REPROVADO });
    const svc = ctx.svc as unknown as { db: { query: { portalCredenciais: { findFirst: () => unknown } } } };
    svc.db.query.portalCredenciais.findFirst = async () => ({ ...LINHA, confirmadoEm: new Date() });

    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;

    expect(r.jaConfirmado).toBe(true);
  });
});

/**
 * A TRADUÇÃO DO MOTIVO, QUE É ONDE O REQUISITO PODE FALHAR SEM NINGUÉM VER.
 *
 * A saída passou a ser uma frase de lista fechada, escolhida por TERMOS achados no texto do modelo
 * (`domain/portal-motivo-candidato.ts`). Isso resolve o item 6 e cria um risco novo, que é o item 5
 * pelo avesso: a frase pode ser CLARA, LEGÍVEL e ERRADA.
 *
 * DIZER A COISA ERRADA CUSTA MAIS QUE NÃO DIZER NADA. Quem lê "confira se enviou a frente e o verso"
 * depois de mandar uma foto tremida manda a MESMA foto de novo, agora com o verso junto, e queima a
 * segunda das três tentativas fazendo exatamente o que o sistema pediu. Duas frases depois, a
 * pendência cai para a fila do time e o documento sempre esteve certo: faltava foco.
 *
 * A ORDEM DOS TERMOS É A PRIORIDADE, e `INCOMPLETO` vem ANTES de `ILEGIVEL` carregando as palavras
 * `frente`, `verso`, `pagina`, `falta` e `cortad`. São palavras que aparecem em motivo de QUALQUER
 * natureza, porque o modelo descreve o documento antes de dizer o defeito dele.
 */
describe("R4.5 pelo avesso: a frase certa para o defeito certo", () => {
  const frase = async (motivo: string) =>
    motivoDa((await confirmar(montar({ auditoria: { ...REPROVADO, motivo } }).svc)) as never);

  it("foto tremida da FRENTE do documento é problema de LEITURA, não de peça faltando", async () => {
    const dita = await frase("A imagem da frente do documento está tremida e não é possível ler os campos.");
    expect(
      dita,
      "o candidato mandou uma foto ruim e vai ser mandado conferir frente e verso: reenvia a mesma foto e queima tentativa",
    ).not.toContain("frente e o verso");
  });

  it("falta de nitidez é falta de FOCO, e a palavra `falta` não pode decidir sozinha", async () => {
    const dita = await frase("Falta nitidez na imagem: os caracteres não são legíveis.");
    expect(dita).not.toContain("frente e o verso");
  });

  it("documento VENCIDO continua sendo tratado como vencido mesmo citando a frente", async () => {
    const dita = await frase("A data de validade impressa na frente do documento já expirou.");
    expect(dita).toMatch(/validade|atualizado/i);
  });

  it("e o que o modelo escreveu NUNCA vaza junto da frase escolhida", async () => {
    const ctx = montar({
      auditoria: { ...REPROVADO, motivo: `Documento de ${PII.nome}, CPF ${PII.cpfPontuado}, ilegível.` },
    });
    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    const inteiro = JSON.stringify(r);
    expect(inteiro).not.toContain(PII.nome);
    expect(inteiro).not.toContain(PII.cpfPontuado);
  });
});

/**
 * AJUSTE 4: a sugestão que a tela de conferência mostra carrega SÓ os campos preenchíveis do leitor
 * (nome, RG, nascimento, filiação), NUNCA os rótulos de AUDITORIA (`camposConferidos`: Legibilidade,
 * Foto, Assinatura, Tipo de documento). Antes eles eram empurrados para `campos` como itens vazios
 * ("não consegui ler este campo") e poluíam a tela com linhas que o candidato não tem como preencher.
 */
describe("R4.8: a conferência mostra os campos do leitor, não os rótulos de auditoria", () => {
  const SUGESTOES = {
    origem: "IA_SUGESTAO",
    exigeConfirmacaoHumana: true,
    campos: [
      { campo: "nomeCompleto", rotulo: "Nome completo", valor: "Fulano De Tal", confianca: 0.96, lido: true },
      { campo: "rgNumero", rotulo: "Número do RG", valor: "", confianca: 0, lido: false },
      { campo: "dataNascimento", rotulo: "Data de nascimento", valor: "1990-03-14", confianca: 0.9, lido: true },
    ],
  };
  // Os rótulos que a auditoria confere e que NÃO podem virar campo da conferência.
  const CONFERIDOS = ["Legibilidade", "Foto", "Assinatura", "Tipo de documento"];

  const camposDaResposta = (r: Record<string, unknown>) => {
    const sugestao = r.sugestao as { campos?: Array<{ campo: string; rotulo: string }> } | null | undefined;
    return sugestao?.campos ?? [];
  };

  it("os rótulos de auditoria NÃO aparecem entre os campos da sugestão", async () => {
    const ctx = montar({
      auditoria: { ...APROVADO, camposConferidos: CONFERIDOS },
      sugestoes: SUGESTOES,
    });
    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    const campos = camposDaResposta(r);

    // Só os três campos do leitor entraram.
    expect(campos.map((c) => c.campo).sort()).toEqual(["dataNascimento", "nomeCompleto", "rgNumero"]);
    // Nenhum rótulo de auditoria virou linha da conferência.
    for (const rotulo of CONFERIDOS) {
      expect(
        campos.some((c) => c.campo === rotulo || c.rotulo === rotulo),
        `o rótulo de auditoria "${rotulo}" poluiu a tela de conferência`,
      ).toBe(false);
    }
  });

  it("o campo não lido do leitor continua chegando, para a tela saber o que perguntar", async () => {
    const ctx = montar({
      auditoria: { ...APROVADO, camposConferidos: CONFERIDOS },
      sugestoes: SUGESTOES,
    });
    const r = (await confirmar(ctx.svc)) as unknown as Record<string, unknown>;
    const rg = camposDaResposta(r).find((c) => c.campo === "rgNumero");
    expect(rg).toBeDefined();
  });
});
