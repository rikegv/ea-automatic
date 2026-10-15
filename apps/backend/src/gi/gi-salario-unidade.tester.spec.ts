import { describe, expect, it, vi } from "vitest";
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
  tipoSalarioGi,
  type ContratacaoGi,
  type FuncionarioSelecao,
  type ParEmpresaFilialConhecido,
  type PessoaParaGi,
  SALARIO_UNIDADES_EA,
} from "../domain/portal-dados-gi";

/**
 * A UNIDADE DO SALÁRIO: a regra NOVA do diretor (14/10/2026) e a guarda do HORISTA que FICOU.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO (§A.38/§A.40), sem Postgres e sem rede.
 *
 * ┌─ A REGRA MUDOU (decisao do diretor, 14/10/2026, permanente) ────────────────────────────────────┐
 * │ ANTES: unidade NAO declarada (nula) RECUSAVA o envio (`GI_SALARIO_SEM_UNIDADE`), para o salario   │
 * │ de HORA nao cair no `default 'M'` do fornecedor de forma calada.                                  │
 * │                                                                                                   │
 * │ AGORA: unidade nula **NAO trava mais**. Se o time nao cadastrou a unidade, ela e cadastrada        │
 * │ DEPOIS na Folha (a Folha nao deixa seguir sem ela), entao o envio ao G.I vai com `tipoSalario:    │
 * │ null` e o fornecedor aplica o default dele. A recusa `GI_SALARIO_SEM_UNIDADE` FOI REMOVIDA de      │
 * │ `recusaDaContratacaoGi`; o motivo segue no TYPE e no mapa de mensagens por compatibilidade, mas    │
 * │ nunca mais e retornado.                                                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ O QUE ESTE ARQUIVO PROVA AGORA, e sao duas coisas:
 *   1. **Unidade nula NAO trava o envio**, e o campo ATRAVESSA como `null` (nunca vira `M` sozinho: quem
 *      aplica o default e o fornecedor, nao o EA deduzindo). O envio ACONTECE e a idempotencia e
 *      carimbada normalmente.
 *   2. **HORISTA sem jornada CONTINUA recusando** (`GI_SALARIO_HORISTA_SEM_JORNADA`): declarar `H` sem a
 *      jornada (`qtdeHorasMes`/`qtdeHorasSem`, ambos `default 0` no GI) gravaria "valor por hora vezes 0
 *      horas". Essa recusa e PENDENCIA PREENCHIVEL: informar a jornada destrava. Para ela, e so para
 *      ela, o `POST` inteiro nao pode acontecer.
 *
 * §A.6: toda entrada é SINTÉTICA (CPF de faixa reservada, nome inventado, domínio de homologação), e
 * nenhum valor de remuneração é impresso em mensagem de falha que não seja o próprio sintético.
 */

const ADM = "22222222-2222-2222-2222-222222222222";

/** Nada aqui existe: CPF da faixa reservada 999, nome inventado, domínio de homologação. */
const PESSOA: PessoaParaGi = {
  nome: "Zarolina Trevisanto Quembe",
  cpf: "99988877766",
  email: "zarolina@homolog.local",
};

/** O par `1/4`, REAL, medido em `Empresa/GetAll` no fornecedor. */
const PAR_CONHECIDO: ParEmpresaFilialConhecido = (empresa, filial) => empresa === 1 && filial === 4;

/**
 * A contratação de uma admissão COMPLETA no vocabulário do EA, com a unidade como parâmetro. Tudo o mais
 * passa em todas as outras guardas de propósito: é isso que faz a unidade ser a ÚNICA variável do
 * experimento, e o que permite afirmar que, sem esta guarda, o envio aconteceria.
 */
function contratacaoCom(
  salarioUnidade: string | null,
  jornada?: { mes?: string | number | null; sem?: string | number | null },
): ContratacaoGi {
  return montarContratacaoGi({
    jornadaHorasMes: jornada?.mes ?? null,
    jornadaHorasSem: jornada?.sem ?? null,
    // 9,34 é um dos valores medidos na produção, e é HORA na vida real. Entra aqui porque é exatamente a
    // linha que a guarda existe para pegar, e porque ele passa, sozinho, por todas as outras guardas.
    salario: "9.34",
    salarioUnidade,
    dataAdmissao: "2026-11-03",
    tipoContrato: "Temporário",
    vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "4", ativo: true }],
    // O CLIENTE FINAL entrou aqui em 02/10/2026 pelo MESMO motivo que a unidade entrou na fixture do
    // `gi-empresa-filial-failclosed`: `recusaDaContratacaoGi` passou a exigir o cliente resolvido, e sem
    // ele a unidade deixava de ser a ÚNICA variável do experimento (todo cenário voltava
    // `GI_CLIENTE_NAO_RESOLVIDO`). Nenhuma asserção foi afrouxada: é uma admissão COMPLETA, que é o único
    // cenário em que a pergunta deste arquivo tem sentido.
    //
    // O VALOR É `"00123"` DE PROPÓSITO: o zero à esquerda é ABSORVIDO no cliente (`int32`, 123), ao
    // contrário de empresa/filial (`int16`), que recusam `"04"`. A prova dessa assimetria tem casa
    // própria: `gi/gi-cliente-e-cidades.tester.spec.ts`.
    codCliente: "00123",
  });
}

/** O serviço de envio com o disparo ARMADO, que é o único estado em que o `POST` chegaria a acontecer. */
function envio(contratacao: ContratacaoGi) {
  // O parâmetro é TIPADO de propósito: é ele que permite ler o payload REALMENTE enviado
  // (`criar.mock.calls[0][0]`), e é essa leitura que prova que a jornada chegou ao fornecedor, em vez de
  // só provar que a chamada aconteceu.
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const marcarEnviado = vi.fn(async () => {});
  const giApi = {
    configurado: () => true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => false,
    // Porta nova da cadeia (06/10/2026): `lerEstado` e a leitura AUTORITATIVA de farol, pausa e
    // origem. Dublê vivo e nao encerrado, para este arquivo continuar medindo o que ele mede.
    lerEstado: async () => ({ farolGlobal: "EM_ADMISSAO", pausadaEm: null, origem: "MANUAL" }),
    lerPessoa: async () => PESSOA,
    lerContratacao: async () => contratacao,
    marcarEnviado,
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: "true" })[k],
  } as unknown as ConfigService;
  return { svc: new EnviarParaGiService(config, giApi, leitor, depara), criar, marcarEnviado };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A GUARDA BARRA O `POST` INTEIRO: nada é criado no fornecedor
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("a UNIDADE nula NAO trava o envio; so o HORISTA sem jornada barra o POST", () => {
  it("CANARIO: com a unidade MENSAL declarada, o envio ACONTECE e o POST e feito", async () => {
    /**
     * ESTE TESTE É A METADE INDISPENSÁVEL DA RÉGUA, e sem ele os de baixo não valem nada: ele prova que
     * o cenário chega até o `POST` quando a unidade existe. Sem o canário, qualquer recusa por outro
     * motivo (par desconhecido, pessoa faltando, disparo desarmado) faria os testes de recusa passarem
     * "por acidente", medindo uma guarda que não é esta.
     */
    const { svc, criar } = envio(contratacaoCom("MENSAL"));

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(criar, "a unica variavel do experimento e a unidade").toHaveBeenCalledTimes(1);
  });

  it("SEM unidade declarada: o envio ACONTECE e o payload sai com tipoSalario null", async () => {
    // Regra NOVA do diretor (14/10/2026): unidade nula NAO trava mais. O `POST` acontece, o campo
    // atravessa como `null`, e o fornecedor aplica o default dele. A unidade e cadastrada depois na Folha.
    const { svc, criar, marcarEnviado } = envio(contratacaoCom(null));

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(criar).toHaveBeenCalledTimes(1);
    expect(criar.mock.calls[0][0].tipoSalario, "unidade nula virou M em vez de null").toBeNull();
    // E a idempotência É carimbada: o envio aconteceu, como em qualquer envio de verdade.
    expect(marcarEnviado).toHaveBeenCalledTimes(1);
  });

  it("unidade HORA SEM jornada: recusa GI_SALARIO_HORISTA_SEM_JORNADA e NENHUM POST acontece", async () => {
    /**
     * O ACHADO MAIS IMPORTANTE DA RODADA, e o que surpreende: declarar `H` NÃO basta. Ao lado de
     * `salario`/`tipoSalario` o contrato tem `salarioHora`, `qtdeHorasMes` e `qtdeHorasSem`, **todos com
     * `default 0`**, e o EA emite só os campos nomeados da allowlist. Então `tipoSalario = 'H'` sem
     * jornada gravaria um horista com ZERO horas por mês: trocaria "R$ 9,34 mensal" por "R$ 9,34 por hora
     * vezes 0 horas", que não é melhor, é outro valor errado, pela MESMA falha de default `0`.
     */
    const { svc, criar, marcarEnviado } = envio(contratacaoCom("HORA"));

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_HORISTA_SEM_JORNADA" });
    expect(criar, "gravou horista com ZERO horas na folha do fornecedor").not.toHaveBeenCalled();
    expect(marcarEnviado, "carimbou envio que nao aconteceu").not.toHaveBeenCalled();
  });

  it("unidade HORA COM jornada: o envio ACONTECE, e a recusa era PENDENCIA, nao beco", async () => {
    // A 0140 mudou a NATUREZA da recusa do `H`: antes era perpétua (indistinguível de admissão quebrada),
    // agora nomeia o que falta e destrava quando o time informa. Este teste é o que prova que destrava.
    const { svc, criar } = envio(contratacaoCom("HORA", { mes: "220.00", sem: "44.00" }));

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(criar).toHaveBeenCalledTimes(1);
    // E a jornada CHEGA ao fornecedor: enviar `H` sem ela é o dano que a guarda existe para impedir.
    const enviado = criar.mock.calls[0][0];
    expect(enviado.qtdeHorasMes).toBe(220);
    expect(enviado.qtdeHorasSem).toBe(44);
  });

  it("AS DUAS OU NENHUMA: jornada mensal sem a semanal (e vice-versa) RECUSA", async () => {
    // 220 h/mês ao lado de ZERO h/semana é contradição gravada na folha, não campo vazio, porque o campo
    // que falta não fica vazio: vira o `default 0` do fornecedor. E não se deriva uma da outra (o fator
    // 30/7 e o DSR são convenção de folha, variam por acordo), que seria o mesmo casamento aproximado
    // sobre remuneração que foi vetado para a unidade.
    for (const meia of [{ mes: 220, sem: null }, { mes: null, sem: 44 }]) {
      const { svc, criar } = envio(contratacaoCom("HORA", meia));
      const r = await svc.enviarManual(ADM, "autor-sintetico");
      expect(r.motivo, JSON.stringify(meia)).toBe("GI_SALARIO_HORISTA_SEM_JORNADA");
      expect(criar, JSON.stringify(meia)).not.toHaveBeenCalled();
    }
  });

  it("jornada ZERO e jornada acima do TETO FISICO recusam igual a jornada ausente", async () => {
    // Zero é o default do fornecedor (o dano), e 2200 é o dígito a mais digitado no lugar de 220. Os dois
    // chegam ao payload como NULO e caem na mesma recusa, que é o desfecho seguro.
    for (const ruim of [{ mes: 0, sem: 0 }, { mes: 2200, sem: 44 }, { mes: 220, sem: 169 }]) {
      const { svc, criar } = envio(contratacaoCom("HORA", ruim));
      const r = await svc.enviarManual(ADM, "autor-sintetico");
      expect(r.motivo, JSON.stringify(ruim)).toBe("GI_SALARIO_HORISTA_SEM_JORNADA");
      expect(criar, JSON.stringify(ruim)).not.toHaveBeenCalled();
    }
  });

  it("a jornada NAO e exigida das outras unidades, e NAO e enviada quando nao informada", async () => {
    // Recorte medido, não economia: `H` é a única unidade cujo valor não fecha sozinho (preço da hora sem
    // quantidade de horas não é remuneração). `M`, `D`, `Q`, `A`, `C` e `T` dizem o período inteiro no
    // próprio par valor+unidade, então exigir jornada delas seria inventar pendência.
    for (const unidade of ["MENSAL", "DIA", "QUINZENAL", "AULA", "COMISSAO", "TAREFA"]) {
      const { svc, criar } = envio(contratacaoCom(unidade));
      const r = await svc.enviarManual(ADM, "autor-sintetico");
      expect(r.motivo, unidade).toBe("GI_ENVIADO");
      expect(
        criar.mock.calls[0][0].qtdeHorasMes,
        `${unidade} enviou jornada que ninguem informou`,
      ).toBeNull();
    }
  });

  it("unidade nula ENVIA e HORISTA sem jornada RECUSA: desfechos e acoes diferentes", async () => {
    // Os dois sao casos diferentes com acoes diferentes: unidade nula segue (a Folha cobra depois),
    // horista sem jornada para (o time informa a jornada e destrava). Agora um deles nem recusa mais.
    const semUnidade = await envio(contratacaoCom(null)).svc.enviarManual(ADM, "a");
    const horista = await envio(contratacaoCom("HORA")).svc.enviarManual(ADM, "a");

    expect(semUnidade).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(horista).toEqual({ enviado: false, motivo: "GI_SALARIO_HORISTA_SEM_JORNADA" });
  });

  it("grafia fora do CHECK do banco e tratada como NAO DECLARADA (null), nunca como palpite", async () => {
    // A coluna tem CHECK, então grafia criativa é sinal de escrita por fora. O desfecho é tratar como
    // "não declarada" (`tipoSalario` null), e NUNCA deduzir pela letra parecida ("Horista" não vira `H`).
    // E unidade nula NAO trava mais (regra do diretor): o envio ACONTECE com o campo nulo.
    for (const grafia of ["Horista", "MES", "mensal ao mes", "", "   ", "M", "H", "QUINZENA"]) {
      const { svc, criar } = envio(contratacaoCom(grafia));
      const r = await svc.enviarManual(ADM, "autor-sintetico");
      expect(r, `grafia "${grafia}"`).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
      expect(criar.mock.calls[0][0].tipoSalario, `grafia "${grafia}" virou palpite`).toBeNull();
    }
    // ⚠️ `"M"` e `"H"` entram na lista do lixo DE PROPÓSITO: a coluna do EA guarda o VOCABULÁRIO DO EA
    // (`MENSAL`, `HORA`), não a letra do fornecedor. Letra na coluna é sinal de escrita por fora, e aceitá-la
    // amarraria a coluna ao alfabeto do GI, que é o que a frente evitou.
    //
    // E as SETE palavras do EA, com caixa e espaço de borda, são as aceitas (o CHECK da 0140).
    expect(tipoSalarioGi(" mensal ")).toBe("M");
    expect(tipoSalarioGi("Hora")).toBe("H");
    expect(SALARIO_UNIDADES_EA.map((u) => tipoSalarioGi(u))).toEqual(["A", "C", "D", "H", "M", "Q", "T"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// NUNCA SE CAI NO DEFAULT: o campo CHEGA ao payload, e é a guarda que para o envio
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("o campo ATRAVESSA o payload: unidade nula passa, horista sem jornada barra", () => {
  it("unidade nula: o campo ATRAVESSA como null e NENHUMA guarda recusa (envio liberado)", () => {
    /**
     * O payload de 9,34 sem unidade está COMPLETO aos olhos de todas as guardas: empresa e filial
     * resolvidas, par real, salário positivo, cliente resolvido. A unidade nula atravessa como `null` e,
     * pela regra nova do diretor (14/10/2026), NÃO recusa mais: o G.I aplica o default dele e a unidade é
     * cadastrada depois na Folha. O que o montador NÃO faz é transformar o nulo em `M` sozinho.
     */
    const payload = montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, contratacaoCom(null));

    expect(payload.codigoEmpresa).toBe(1);
    expect(payload.codigoFilial).toBe(4);
    expect(payload.salario).toBe(9.34);
    expect(PAR_CONHECIDO(1, 4)).toBe(true);
    // A unidade atravessa como NULO, e NÃO recusa.
    expect(payload.tipoSalario).toBeNull();
    expect(recusaDaContratacaoGi(payload, PAR_CONHECIDO)).toBeNull();
  });

  it("o H ATRAVESSA o payload de proposito, e quem o impede de chegar ao GI e a RECUSA", () => {
    // Montador que zerasse o `H` transformaria "horista declarado" em "ninguém declarou", perderia o
    // motivo certo na trilha e deixaria o payload IDÊNTICO ao de quem não declarou nada. A guarda mora no
    // envio, encostada no `POST`, exatamente como empresa e filial nulas são marca interna.
    const payload = montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, contratacaoCom("HORA"));

    expect(payload.tipoSalario).toBe("H");
    expect(recusaDaContratacaoGi(payload, PAR_CONHECIDO)).toBe("GI_SALARIO_HORISTA_SEM_JORNADA");
  });

  it("NULO no payload NAO e `M`: nao declarado e declarado mensal sao fatos diferentes", () => {
    // Se o nulo virasse `M` em qualquer ponto do caminho, os dois produziriam o MESMO envio querendo
    // dizer coisas diferentes, e a guarda ficaria sem como distingui-los. Quem os separa é o nulo.
    expect(montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, contratacaoCom(null)).tipoSalario)
      .toBeNull();
    expect(montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, contratacaoCom("MENSAL")).tipoSalario)
      .toBe("M");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A ORDEM DAS RECUSAS DO SALÁRIO, que o produto fixou e que a trilha lê
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("a ORDEM: so salario negativo recusa; nulo/zero e unidade nula PASSAM; horista sem jornada barra", () => {
  /**
   * A ORDEM É INFORMAÇÃO, não detalhe de implementação: cada motivo manda o time a uma ação diferente, e
   * trocar a ordem faz um caso ser reportado como outro.
   *
   * O FUNDAMENTO de cada degrau:
   *  1. `GI_SALARIO_INVALIDO` vem primeiro, mas AGORA só quando o salário é NEGATIVO (regra do diretor,
   *     15/10/2026): salário nulo/ausente/zero deixou de travar, é preenchido DEPOIS na Folha. Só o
   *     NEGATIVO recusa, porque é dado CORROMPIDO (não existe folha negativa), não pendência preenchível.
   *  2. UNIDADE nula NÃO é degrau (regra do diretor, 14/10/2026): ela PASSA, o envio segue com
   *     `tipoSalario` null e o G.I aplica o default. A recusa `GI_SALARIO_SEM_UNIDADE` foi removida.
   *  3. `GI_SALARIO_HORISTA_SEM_JORNADA` segue valendo quando a unidade DECLARADA é `H` e falta a
   *     jornada, e é o único que o time NÃO resolve sozinho.
   */
  function payload(salario: unknown, tipoSalario: unknown) {
    // `codigoCliente` resolvido e DISTINTO de empresa e filial: as três recusas medidas aqui são as do
    // SALÁRIO, e o cliente não resolvido abafaria todas elas (ele é a ÚLTIMA da ordem, então só aparece
    // quando o resto passou). Ver a régua da ordem completa em `gi/gi-cliente-e-cidades.tester.spec.ts`.
    return { codigoEmpresa: 1, codigoFilial: 4, codigoCliente: 12345, salario, tipoSalario } as never;
  }

  it("salario ZERO com unidade FALTANDO NAO recusa mais: zero e unidade nula PASSAM", () => {
    // Regra nova do diretor (15/10/2026): zero nao trava (so negativo). Unidade nula tambem passa.
    expect(recusaDaContratacaoGi(payload(0, null), PAR_CONHECIDO)).toBeNull();
  });

  it("salario NEGATIVO com unidade HORA reporta o SALARIO, nao o horista", () => {
    expect(recusaDaContratacaoGi(payload(-100, "H"), PAR_CONHECIDO)).toBe("GI_SALARIO_INVALIDO");
  });

  it("salario VALIDO sem unidade NAO recusa mais: unidade nula passa a guarda", () => {
    expect(recusaDaContratacaoGi(payload(9.34, null), PAR_CONHECIDO)).toBeNull();
  });

  it("salario VALIDO com unidade HORA reporta HORISTA SEM HORAS, nunca sem unidade", () => {
    expect(recusaDaContratacaoGi(payload(9.34, "H"), PAR_CONHECIDO)).toBe(
      "GI_SALARIO_HORISTA_SEM_JORNADA",
    );
  });

  it("salario VALIDO com unidade MENSAL nao recusa por nada", () => {
    expect(recusaDaContratacaoGi(payload(9.34, "M"), PAR_CONHECIDO)).toBeNull();
  });

  it("a sequencia COMPLETA, na ordem, com o mesmo cenario evoluindo", () => {
    // Lido de cima para baixo, é o caminho que uma admissão percorre à medida que o time a conserta.
    // Salário NEGATIVO (corrompido) recusa; conserta o valor e a unidade nula JÁ PASSA (envio liberado);
    // se o time declarar HORA sem jornada, volta a recusar até informar a jornada; MENSAL libera.
    expect(recusaDaContratacaoGi(payload(-100, null), PAR_CONHECIDO)).toBe("GI_SALARIO_INVALIDO");
    expect(recusaDaContratacaoGi(payload(9.34, null), PAR_CONHECIDO)).toBeNull();
    expect(recusaDaContratacaoGi(payload(9.34, "H"), PAR_CONHECIDO)).toBe(
      "GI_SALARIO_HORISTA_SEM_JORNADA",
    );
    expect(recusaDaContratacaoGi(payload(9.34, "M"), PAR_CONHECIDO)).toBeNull();
  });
});
