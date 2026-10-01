import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import {
  NENHUM_PAR_EMPRESA_FILIAL,
  montarContratacaoGi,
  recusaDaContratacaoGi,
  resolverEmpresaFilialGi,
  type FuncionarioSelecao,
  type ParEmpresaFilialConhecido,
  type PessoaParaGi,
  type VinculoEmpresaFilial,
} from "../domain/portal-dados-gi";

/**
 * O FAIL-CLOSED DE EMPRESA E FILIAL: sem os dois resolvidos, o envio ao GI é RECUSADO.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO (§A.38/§A.40 regra 2), em paralelo à construção.
 *
 * POR QUE A RECUSA, e isto foi MEDIDO, não deduzido: `codigoEmpresa` e `codigoFilial` são os dois
 * únicos campos do envio que são `int16` NÃO-ANULÁVEIS e SEM default (`docs/MAPA-GI-RELEITURA-SCHEMA.md`
 * §2). Omitir um `short` não-anulável em .NET não derruba o request: cai no `default(short)` = **0**, e
 * o registro nasce na produção do fornecedor com empresa 0 e filial 0, ÓRFÃO, sem nenhum erro aparecer.
 * Mandar `0` é pior que não mandar nada, porque nada falha e ninguém fica sabendo.
 *
 * E a FILIAL NÃO DERIVA DE NADA no EA (`clientes.empresa_grupo` dá a empresa em 80% das admissões
 * vivas; a filial, em 0%). Então a recusa não é zelo teórico: é o estado NORMAL até o diretor fornecer
 * a tabela de filial.
 *
 * ⚠️ ASSINATURA ASSUMIDA, declarada porque a construção não havia terminado: o serviço continua sendo
 * `EnviarParaGiService` e a recusa sai pelo `GiEnvioResultado` (`{ enviado: false, motivo: CODIGO }`),
 * com um motivo FECHADO e sem PII, do mesmo formato dos que já existem (`GI_SEM_EMPRESA_FILIAL` é o
 * nome esperado, mas o teste aceita qualquer código fechado, porque o nome é do construtor).
 * O construtor é chamado de forma TOLERANTE a dependência nova (ver `construir`).
 *
 * §A.6: toda entrada é sintética (CPF de faixa reservada), e nenhum valor de pessoa é asserido em
 * mensagem de falha.
 */

const CPF_SINTETICO = "99988877766";
const PESSOA: PessoaParaGi = { nome: "Zarolina Trevisanto Quembe", cpf: CPF_SINTETICO };

/** A contratação que o leitor devolveria, SEM empresa e SEM filial (o estado normal hoje). */
const CONTRATACAO_SEM_CLIENTE: Record<string, unknown> = {
  salario: "1500.50",
  dataAdmissao: "2026-11-03",
  tipoContrato: "Temporário",
  codCliente: "00123",
};

/** Como cada cenário resolve empresa e filial. `null` = não resolveu. */
interface Resolucao {
  empresa: number | null;
  filial: number | null;
}

/**
 * Dublê TOLERANTE a nome de método: qualquer método cujo nome fale de EMPRESA devolve
 * `resolucao.empresa`, qualquer um que fale de FILIAL devolve `resolucao.filial`, e o resto devolve o
 * default. Assim o teste não depende de ter acertado o nome que a construção escolheu
 * (`codigoEmpresa`, `empresaDoCliente`, `resolverEmpresa`, ...).
 */
function dubleTolerante(
  explicitos: Record<string, unknown>,
  resolucao: Resolucao,
  padrao: (nome: string) => unknown,
): Record<string, unknown> {
  const alvo: Record<string, unknown> = { ...explicitos };
  return new Proxy(alvo, {
    get(obj, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in obj) return obj[prop];
      // `then` tem de ficar undefined: um objeto com `then` é tratado como Promise pelo `await`.
      if (prop === "then" || prop === "constructor") return undefined;
      if (/empresa/i.test(prop)) return () => resolucao.empresa;
      if (/filial/i.test(prop)) return () => resolucao.filial;
      return () => padrao(prop);
    },
  });
}

interface Montagem {
  servico: EnviarParaGiService;
  criar: ReturnType<typeof vi.fn>;
  marcarEnviado: ReturnType<typeof vi.fn>;
  payloads: FuncionarioSelecao[];
}

/**
 * Constrói o serviço de forma TOLERANTE a dependência nova: passa três dublês extras depois dos
 * quatro conhecidos. Argumento sobrando é ignorado pelo JavaScript, então isto funciona com a
 * assinatura de hoje E com uma que tenha ganhado um repositório de de/para de cliente.
 */
function construir(resolucao: Resolucao, contratacao: Record<string, unknown>): Montagem {
  const payloads: FuncionarioSelecao[] = [];
  const criar = vi.fn(async (p: FuncionarioSelecao): Promise<GiCriacaoResultado> => {
    payloads.push(p);
    return { ok: true, funcionarioSelecaoId: "GI-SINTETICO-1" };
  });
  const giApi = {
    configurado: () => true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;

  const marcarEnviado = vi.fn(async () => {});
  const leitor = dubleTolerante(
    {
      jaEnviado: vi.fn(async () => false),
      lerPessoa: vi.fn(async () => PESSOA),
      marcarEnviado,
    },
    resolucao,
    (nome) =>
      // Qualquer leitura nova de contratação/admissão/vaga devolve o pacote sem cliente resolvido.
      /contrat|admissao|vaga|folha|cliente|dados/i.test(nome) ? contratacao : null,
  );

  const depara = dubleTolerante({ codigoCidade: () => null }, resolucao, () => null);

  const config = {
    get: (k: string) => (k === "GI_DISPARO_ARMADO" ? "true" : undefined),
  } as unknown as ConfigService;

  const Ctor = EnviarParaGiService as unknown as new (...args: unknown[]) => EnviarParaGiService;
  const extra = () => dubleTolerante({}, resolucao, () => null);
  const servico = new Ctor(config, giApi, leitor, depara, extra(), extra(), extra());
  return { servico, criar, marcarEnviado, payloads };
}

const ADMISSAO = "00000000-0000-0000-0000-000000000000";

/** Um motivo FECHADO: código em caixa alta, sem espaço e sem nenhum valor de dado dentro. */
function motivoFechado(motivo: string): boolean {
  return /^GI_[A-Z0-9_]+$/.test(motivo);
}

describe("fail-closed: sem empresa E filial resolvidas, o envio ao GI e RECUSADO", () => {
  /**
   * ⚠️ ESTES TRES TESTES FALHAM ENQUANTO A GUARDA NAO EXISTIR. Hoje `enviarManual` com
   * `GI_DISPARO_ARMADO=true` monta o payload e chama `criarFuncionarioSelecao` sem olhar empresa nem
   * filial, então ele cria o registro órfão. É esse o conserto que o requisito pede.
   */
  it("nada resolvido: criarFuncionarioSelecao NAO e chamado", async () => {
    const m = construir({ empresa: null, filial: null }, CONTRATACAO_SEM_CLIENTE);
    const r = await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(r.enviado).toBe(false);
    expect(m.criar, "o envio foi disparado sem empresa/filial: registro orfao no GI").not.toHaveBeenCalled();
  });

  it("SO a empresa resolvida (o caso dos 80%): ainda assim NAO envia", async () => {
    // A filial não deriva de nada no EA. Resolver metade do cliente é o cenário MAIS comum, e é o que
    // um `if (!empresa) recusa` deixaria passar: filial cairia em 0, e o registro seria órfão de filial.
    const m = construir({ empresa: 1, filial: null }, { ...CONTRATACAO_SEM_CLIENTE, codigoEmpresa: 1 });
    const r = await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(r.enviado).toBe(false);
    expect(m.criar, "enviou com filial nao resolvida").not.toHaveBeenCalled();
  });

  it("SO a filial resolvida: tambem NAO envia", async () => {
    const m = construir({ empresa: null, filial: 7 }, { ...CONTRATACAO_SEM_CLIENTE, codigoFilial: 7 });
    const r = await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(r.enviado).toBe(false);
    expect(m.criar, "enviou com empresa nao resolvida").not.toHaveBeenCalled();
  });

  it("a recusa tem motivo FECHADO, sem PII, e nao mente dizendo que enviou", async () => {
    const m = construir({ empresa: null, filial: null }, CONTRATACAO_SEM_CLIENTE);
    const r = await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(r).toEqual({ enviado: false, motivo: r.motivo });
    expect(motivoFechado(r.motivo), `motivo "${r.motivo}" nao e um codigo fechado`).toBe(true);
    // §A.6: nem CPF, nem nome, nem o id da admissão podem viajar no motivo.
    expect(r.motivo).not.toContain(CPF_SINTETICO);
    expect(r.motivo.toUpperCase()).not.toContain("ZAROLINA");
    expect(r.motivo).not.toContain(ADMISSAO);
    // E NÃO pode ser `GI_ENVIADO` nem `GI_FALHA_ENVIO`: a recusa acontece ANTES de tocar a rede, e
    // chamar isso de falha de envio esconderia a causa real de quem for olhar a trilha.
    expect(["GI_ENVIADO", "GI_FALHA_ENVIO"]).not.toContain(r.motivo);
  });

  it("recusado, a idempotencia NAO e carimbada (a admissao segue enviavel depois)", async () => {
    // Carimbar `marcarEnviado` numa recusa prenderia a admissão para sempre em `GI_JA_ENVIADO`, e ela
    // nunca mais seria enviada quando a filial chegasse. A recusa tem de ser REPETÍVEL.
    const m = construir({ empresa: null, filial: null }, CONTRATACAO_SEM_CLIENTE);
    await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(m.marcarEnviado).not.toHaveBeenCalled();
    const r2 = await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(r2.enviado).toBe(false);
    expect(m.criar).not.toHaveBeenCalled();
  });
});

describe("fail-closed: NENHUM payload enviado ao GI leva empresa 0 nem chave ausente", () => {
  /**
   * O INVARIANTE que vale qualquer que seja o mecanismo: se `criarFuncionarioSelecao` FOI chamado, a
   * chave existe nos dois campos, e EMPRESA nunca vale 0.
   *
   * ⚠️ CORRIGIDO em 01/10/2026, e a correção é a lição deste arquivo: a primeira versão exigia
   * `codigoFilial !== 0` junto com a empresa, com o fundamento de que "os pares reais começam em 1".
   * Aqueles pares (`1/4`, `2/4`, `1/2`, `1/5`) eram os mais FREQUENTES NO EA, não a lista autoritativa
   * do fornecedor. Lida a lista inteira (`Empresa/GetAll`, 127 pares), **filial 0 existe para TODAS as
   * 47 empresas** e é estabelecimento real; o EA tem 2 vínculos com filial 0 (`43/0` e `44/0`) e os
   * dois casam com pares reais. A régua antiga reprovaria admissão legítima.
   *
   * O FUNDAMENTO CERTO, e ele nunca foi sobre o valor: **não se manda `0` porque o valor NÃO FOI
   * RESOLVIDO**, e não porque `0` seja inválido. O `0` da filial legítima é indistinguível do `0` que a
   * omissão produz (`int16` sem default), então o que protege é a filial ter vindo de
   * `cliente_vinculos` por resolução explícita, e o PAR existir na lista do GI. Ver o describe seguinte.
   */
  const CENARIOS: ReadonlyArray<{ nome: string; resolucao: Resolucao; contratacao: Record<string, unknown> }> = [
    { nome: "nada resolvido", resolucao: { empresa: null, filial: null }, contratacao: CONTRATACAO_SEM_CLIENTE },
    { nome: "so empresa", resolucao: { empresa: 1, filial: null }, contratacao: { ...CONTRATACAO_SEM_CLIENTE, codigoEmpresa: 1 } },
    { nome: "so filial", resolucao: { empresa: null, filial: 7 }, contratacao: { ...CONTRATACAO_SEM_CLIENTE, codigoFilial: 7 } },
    { nome: "empresa 0 explicita", resolucao: { empresa: 0, filial: 0 }, contratacao: { ...CONTRATACAO_SEM_CLIENTE, codigoEmpresa: 0, codigoFilial: 0 } },
    { nome: "os dois resolvidos", resolucao: { empresa: 1, filial: 7 }, contratacao: { ...CONTRATACAO_SEM_CLIENTE, codigoEmpresa: 1, codigoFilial: 7 } },
  ];

  for (const c of CENARIOS) {
    it(`cenario "${c.nome}": nenhum payload sai sem a chave, e empresa nunca e 0`, async () => {
      const m = construir(c.resolucao, c.contratacao);
      await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
      for (const p of m.payloads) {
        const obj = p as unknown as Record<string, unknown>;
        for (const campo of ["codigoEmpresa", "codigoFilial"]) {
          const v = obj[campo];
          expect(v, `${campo} ausente no payload enviado (cenario ${c.nome})`).not.toBeUndefined();
          expect(v, `${campo} nulo no payload enviado (cenario ${c.nome})`).not.toBeNull();
        }
        // SÓ a empresa: empresa 0 não existe em nenhum dos 127 pares do GI. Filial 0 existe em todos
        // os 47 e NÃO é asserida aqui de propósito (ver o comentário do describe).
        expect(String(obj.codigoEmpresa), `empresa 0 no payload (cenario ${c.nome})`).not.toBe("0");
      }
    });
  }

  it("o cenario `empresa 0 explicita` tambem e RECUSADO: 0 nao e resolucao, e ausencia", async () => {
    // `0` é justamente o valor que o .NET usa para "não veio". Aceitá-lo como código válido de
    // empresa anularia toda a guarda.
    const m = construir({ empresa: 0, filial: 0 }, { ...CONTRATACAO_SEM_CLIENTE, codigoEmpresa: 0, codigoFilial: 0 });
    const r = await m.servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(r.enviado).toBe(false);
    expect(m.criar).not.toHaveBeenCalled();
  });
});

describe("fail-closed: a guarda nova NAO desarma as travas que ja existiam", () => {
  it("o gatilho AUTOMATICO continua sendo incapaz de criar", async () => {
    const m = construir({ empresa: 1, filial: 7 }, { ...CONTRATACAO_SEM_CLIENTE, codigoEmpresa: 1, codigoFilial: 7 });
    const r = await m.servico.enviar(ADMISSAO);
    expect(r.enviado).toBe(false);
    expect(m.criar).not.toHaveBeenCalled();
  });

  it("com GI_DISPARO_ARMADO desligada nada e criado, nem com cliente resolvido", async () => {
    const payloads: FuncionarioSelecao[] = [];
    const criar = vi.fn(async (p: FuncionarioSelecao): Promise<GiCriacaoResultado> => {
      payloads.push(p);
      return { ok: true, funcionarioSelecaoId: "GI-SINTETICO-2" };
    });
    const giApi = { configurado: () => true, criarFuncionarioSelecao: criar } as unknown as GiApiService;
    const resolucao: Resolucao = { empresa: 1, filial: 7 };
    const leitor = dubleTolerante(
      {
        jaEnviado: vi.fn(async () => false),
        lerPessoa: vi.fn(async () => PESSOA),
        marcarEnviado: vi.fn(async () => {}),
      },
      resolucao,
      () => ({ ...CONTRATACAO_SEM_CLIENTE, codigoEmpresa: 1, codigoFilial: 7 }),
    );
    const depara = dubleTolerante({ codigoCidade: () => null }, resolucao, () => null);
    const config = { get: () => undefined } as unknown as ConfigService;
    const Ctor = EnviarParaGiService as unknown as new (...args: unknown[]) => EnviarParaGiService;
    const servico = new Ctor(config, giApi, leitor, depara);
    const r = await servico.enviarManual(ADMISSAO, "autor-sintetico");
    expect(r.enviado).toBe(false);
    expect(criar).not.toHaveBeenCalled();
  });
});


// ── A PROVA PRECISA, nas funções PURAS: o que protege é a RESOLUÇÃO, não o valor ────────────────

/**
 * AMOSTRA de pares REAIS do fornecedor, medidos em `Empresa/GetAll` (01/10/2026, 127 pares, 47
 * empresas). **É AMOSTRA, não a lista inteira**, e está aqui só para o teste poder injetar um
 * `ParEmpresaFilialConhecido` plausível: a lista autoritativa mora no produto, por injeção, e não se
 * duplica aqui (duas listas do mesmo dado divergem no primeiro ajuste).
 *
 * Os dois pares com filial 0 são os que o EA usa de verdade (`43/0` e `44/0`), e os `(n,0)` existem para
 * TODAS as 47 empresas.
 */
const PARES_REAIS_AMOSTRA: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 2], [1, 4], [1, 5],
  [2, 0], [2, 4],
  [3, 0], [4, 0],
  [43, 0], [44, 0],
];

/** O predicado de par, como o produto o recebe por injeção. */
const PAR_CONHECIDO: ParEmpresaFilialConhecido = (empresa, filial) =>
  PARES_REAIS_AMOSTRA.some(([e, f]) => e === empresa && f === filial);

/** Um vínculo de `cliente_vinculos` com os códigos crus (como o `varchar` do EA entrega). */
function vinculoCru(empresaCodigo: string | null, filial: string | null): VinculoEmpresaFilial {
  return { tipoServico: "TEMPORARIO", empresaCodigo, filial, ativo: true };
}

/** Payload mínimo só com o que as guardas duras leem. */
function payloadCom(empresa: unknown, filial: unknown, salario = 1500.5): FuncionarioSelecao {
  return { codigoEmpresa: empresa, codigoFilial: filial, salario } as unknown as FuncionarioSelecao;
}

describe("EMPRESA e FILIAL tem reguas DIFERENTES: empresa 0 recusa, filial 0 PASSA", () => {
  /**
   * ⚠️ ESTE DESCRIBE FOI INVERTIDO em 01/10/2026, e o motivo tem de ficar escrito para ninguém refazer
   * o caminho: a primeira versão recusava filial 0 junto com empresa 0, apoiada em quatro pares que
   * eram os mais FREQUENTES NO EA e não a lista do fornecedor.
   *
   * MEDIDO em `Empresa/GetAll`, 127 pares, 47 empresas, cruzado com os 244 vínculos do EA (**243 casam
   * exatamente, zero divergências**):
   *   - **empresa 0 não existe em nenhum dos 127.** Recusar está certo.
   *   - **filial 0 existe para TODAS as 47 empresas** (`(1,0)`, `(2,0)`, `(3,0)`, `(4,0)`, ...). É
   *     ESTABELECIMENTO REAL. O EA tem `43/0` e `44/0`, os dois casando com pares reais do GI.
   *   - o único vínculo problemático da base tem empresa `99` e **filial NULA**, e é esse que a régua
   *     precisa pegar.
   *
   * O FUNDAMENTO DE NÃO MANDAR `0` NUNCA FOI "o valor 0 é inválido": é **"o valor não foi RESOLVIDO"**.
   * O que protege é o par ter vindo de `cliente_vinculos` por resolução explícita.
   */
  it("FILIAL 0 RESOLVIDA PASSA: e estabelecimento real nas 47 empresas do fornecedor", () => {
    expect(resolverEmpresaFilialGi([vinculoCru("1", "0")], "Temporário")).toEqual({
      empresa: 1,
      filial: 0,
    });
  });

  it("os dois vinculos REAIS do EA com filial 0 (43/0 e 44/0) resolvem", () => {
    // Estes dois existem na produção e casam com pares reais do GI. A régua antiga os reprovaria, e a
    // admissão legítima seria recusada sem motivo.
    expect(resolverEmpresaFilialGi([vinculoCru("43", "0")], "Temporário")).toEqual({
      empresa: 43,
      filial: 0,
    });
    expect(resolverEmpresaFilialGi([vinculoCru("44", "0")], "Temporário")).toEqual({
      empresa: 44,
      filial: 0,
    });
  });

  it("EMPRESA 0 RECUSA: empresa 0 nao existe em nenhum dos 127 pares", () => {
    expect(resolverEmpresaFilialGi([vinculoCru("0", "4")], "Temporário")).toBeNull();
    expect(resolverEmpresaFilialGi([vinculoCru("0", "0")], "Temporário")).toBeNull();
  });

  it("recusaDaContratacaoGi: empresa 0 recusa, filial 0 nao e motivo de recusa", () => {
    expect(recusaDaContratacaoGi(payloadCom(0, 4), PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
    // Com o par conhecido `(1,0)`, filial 0 não produz recusa NENHUMA.
    expect(recusaDaContratacaoGi(payloadCom(1, 0), PAR_CONHECIDO)).toBeNull();
  });

  it("montarContratacaoGi entrega filial 0 como RESOLVIDA, nao como vazia", () => {
    const c = montarContratacaoGi({
      salario: "1500.50",
      dataAdmissao: "2026-11-03",
      tipoContrato: "Temporário",
      vinculos: [vinculoCru("43", "0")],
    });
    expect(c.codigoEmpresa).toBe(43);
    expect(c.codigoFilial).toBe(0);
  });
});

describe("RESOLVIDA como 0 x NAO RESOLVIDA: dois fatos diferentes no mesmo numero", () => {
  /**
   * ESTE É O TESTE QUE SEPARA AS DUAS COISAS, e é o que o valor `0` sozinho não expressa. O campo é
   * `int16` SEM default, então omitir manda `0`: a filial legítima 0 e a filial que ninguém resolveu
   * chegam ao fornecedor como o MESMO número. O que as distingue é a PRESENÇA da resolução (`null` ou
   * não) vinda de `cliente_vinculos`, e é isso que protege do registro órfão.
   */
  it("filial RESOLVIDA como 0 a partir de cliente_vinculos: PASSA", () => {
    const c = montarContratacaoGi({
      salario: "1500.50",
      tipoContrato: "Temporário",
      vinculos: [vinculoCru("1", "0")],
    });
    expect(c.codigoFilial).toBe(0);
    expect(recusaDaContratacaoGi({ ...payloadCom(c.codigoEmpresa, c.codigoFilial) }, PAR_CONHECIDO)).toBeNull();
  });

  it("filial NAO RESOLVIDA (nula no vinculo): RECUSA, e e o vinculo problematico da base", () => {
    // O único vínculo divergente dos 244 é exatamente este: empresa preenchida, filial NULA.
    const c = montarContratacaoGi({
      salario: "1500.50",
      tipoContrato: "Temporário",
      vinculos: [vinculoCru("99", null)],
    });
    expect(c.codigoEmpresa).toBeNull();
    expect(c.codigoFilial).toBeNull();
    expect(recusaDaContratacaoGi(payloadCom(c.codigoEmpresa, c.codigoFilial), PAR_CONHECIDO)).toBe(
      "GI_SEM_EMPRESA_FILIAL",
    );
  });

  it("filial AUSENTE no vinculo (string vazia): RECUSA, nao vira 0", () => {
    expect(resolverEmpresaFilialGi([vinculoCru("1", "")], "Temporário")).toBeNull();
    expect(resolverEmpresaFilialGi([vinculoCru("1", "   ")], "Temporário")).toBeNull();
  });

  it("sem vinculo nenhum, e com vinculo INATIVO: RECUSA (nada a resolver)", () => {
    expect(resolverEmpresaFilialGi([], "Temporário")).toBeNull();
    expect(resolverEmpresaFilialGi(null, "Temporário")).toBeNull();
    expect(
      resolverEmpresaFilialGi([{ ...vinculoCru("1", "0"), ativo: false }], "Temporário"),
    ).toBeNull();
  });

  it("o payload com filial undefined ou nula RECUSA, mesmo com empresa boa", () => {
    expect(recusaDaContratacaoGi(payloadCom(1, null), PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
    expect(recusaDaContratacaoGi(payloadCom(1, undefined), PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
  });
});

describe("as travas de FORMATO seguem valendo nos dois campos", () => {
  /**
   * Aceitar filial 0 não afrouxa mais nada: `varchar` livre do EA indo para `int16` do fornecedor segue
   * exigindo régua, porque o GI recusa o ENVIO INTEIRO com 400 quando o padrão não casa.
   */
  const RUINS: ReadonlyArray<{ valor: string; porque: string }> = [
    { valor: "04", porque: "zero a esquerda viola o pattern do GI" },
    { valor: "0004", porque: "zero a esquerda, varias casas" },
    { valor: "32768", porque: "estoura o int16 (teto 32767)" },
    { valor: "99999", porque: "estoura o int16" },
    { valor: "abc", porque: "texto" },
    { valor: "1a", porque: "texto misturado" },
    { valor: "", porque: "vazio" },
    { valor: "   ", porque: "so espaco" },
    { valor: "-1", porque: "sinal negativo (o pattern do GI aceitaria, a folha nao)" },
    { valor: "-0", porque: "zero com sinal" },
    { valor: "1.5", porque: "decimal" },
    { valor: "1,5", porque: "decimal com virgula" },
  ];

  for (const r of RUINS) {
    it(`FILIAL "${r.valor}" nao resolve :: ${r.porque}`, () => {
      expect(resolverEmpresaFilialGi([vinculoCru("1", r.valor)], "Temporário")).toBeNull();
    });
    it(`EMPRESA "${r.valor}" nao resolve :: ${r.porque}`, () => {
      expect(resolverEmpresaFilialGi([vinculoCru(r.valor, "0")], "Temporário")).toBeNull();
    });
  }

  it("o teto do int16 em ponto: 32767 resolve, 32768 nao", () => {
    expect(resolverEmpresaFilialGi([vinculoCru("32767", "32767")], "Temporário")).toEqual({
      empresa: 32767,
      filial: 32767,
    });
    expect(resolverEmpresaFilialGi([vinculoCru("32767", "32768")], "Temporário")).toBeNull();
  });

  it("recusaDaContratacaoGi nao aceita numero decimal nem string no payload", () => {
    expect(recusaDaContratacaoGi(payloadCom(1.5, 0), PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
    expect(recusaDaContratacaoGi(payloadCom("1", "0"), PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
  });
});

describe("O PAR, nao os campos: numericamente valido e INEXISTENTE no GI tem de RECUSAR", () => {
  /**
   * É O FURO QUE SOBRA DEPOIS DE CONSERTAR O `0`, e ele é invisível para qualquer validação campo a
   * campo: **`empresa 1 / filial 37`** é um `int16` perfeito nos dois lados e **não existe** entre os
   * 127 pares do fornecedor. O registro nasceria apontando para um estabelecimento que não há, e o GI
   * aceita calado (não valida a chave estrangeira, o mesmo comportamento medido no `codigoBcoFolha`).
   *
   * A lista autoritativa dos 127 pares entra no produto por INJEÇÃO. O default é fail-closed
   * (`NENHUM_PAR_EMPRESA_FILIAL`): sem lista, nada é par conhecido e todo envio é recusado, que é o
   * comportamento certo para um dado que não se pode chutar.
   */
  it("empresa 1 / filial 37: valido campo a campo, RECUSADO como par", () => {
    // Campo a campo, os dois passam: inteiros, dentro do int16, sem zero à esquerda.
    expect(resolverEmpresaFilialGi([vinculoCru("1", "37")], "Temporário")).toEqual({
      empresa: 1,
      filial: 37,
    });
    // Como PAR, não existe no fornecedor.
    expect(recusaDaContratacaoGi(payloadCom(1, 37), PAR_CONHECIDO)).toBe(
      "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO",
    );
  });

  it("a filial certa da empresa errada tambem RECUSA (o par e que importa)", () => {
    // `4` é filial real da empresa 1 e da 2; `43` e `44` só existem com filial 0. Cruzar é o erro que
    // só o par pega.
    expect(recusaDaContratacaoGi(payloadCom(43, 4), PAR_CONHECIDO)).toBe(
      "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO",
    );
  });

  it("os pares REAIS da amostra PASSAM (o conserto nao pode fechar demais)", () => {
    for (const [empresa, filial] of PARES_REAIS_AMOSTRA) {
      expect(
        recusaDaContratacaoGi(payloadCom(empresa, filial), PAR_CONHECIDO),
        `par ${empresa}/${filial}`,
      ).toBeNull();
    }
  });

  it("FAIL-CLOSED sem lista: nenhum par e conhecido, e todo envio recusa", () => {
    // É o default do produto hoje, e é o certo: par não verificado não vai para a folha.
    expect(recusaDaContratacaoGi(payloadCom(1, 0), NENHUM_PAR_EMPRESA_FILIAL)).toBe(
      "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO",
    );
    expect(recusaDaContratacaoGi(payloadCom(1, 0))).toBe("GI_PAR_EMPRESA_FILIAL_DESCONHECIDO");
  });

  it("a ordem das guardas: NAO RESOLVIDO antes de PAR DESCONHECIDO", () => {
    // A ordem é informação para quem lê a trilha: "não resolvi o vínculo" e "o par não existe no GI"
    // pedem ações diferentes (cadastrar o vínculo x corrigir o código). Trocar a ordem faria o primeiro
    // caso ser reportado como o segundo.
    expect(recusaDaContratacaoGi(payloadCom(null, null), PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
  });

  it("par conhecido mas SALARIO invalido ainda recusa (as guardas nao se anulam)", () => {
    expect(recusaDaContratacaoGi(payloadCom(1, 0, 0), PAR_CONHECIDO)).toBe("GI_SALARIO_INVALIDO");
    expect(recusaDaContratacaoGi(payloadCom(1, 0, -100), PAR_CONHECIDO)).toBe("GI_SALARIO_INVALIDO");
  });
});
