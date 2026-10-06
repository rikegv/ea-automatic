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
 * A UNIDADE DO SALÁRIO: a guarda que impede o `default 'M'` do fornecedor de declarar MENSAL sozinho.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO (§A.38/§A.40), sem Postgres e sem rede.
 *
 * ┌─ O QUE ESTA RÉGUA EXISTE PARA IMPEDIR, e foi MEDIDO na produção em 01/10/2026 ─────────────────┐
 * │ `dados_vaga_folha.salario` é um `numeric(12,2)` SEM unidade, e há **7 admissões VIVAS com 9,34   │
 * │ (2) e 10,90 (5)**, que são valores de HORA. No GI, `tipoSalario` tem **`default 'M'` (Mês)**.    │
 * │ Enviar o salário sem a unidade faz aquelas 7 entrarem na folha como **salário MENSAL de R$ 9,34**│
 * │ passando por TODAS as guardas que já existiam: valor positivo, empresa e filial resolvidas, par  │
 * │ conhecido. O fornecedor responde sucesso, o EA carimba o envio, nada falha, e o erro aparece no  │
 * │ holerite. É a família da §A.33.                                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ O PERIGO NÃO É MANDAR O CAMPO ERRADO, É OMITIR. Por isso a régua central deste arquivo não é "o
 * campo saiu do payload": é **o `POST` inteiro não aconteceu**. Guarda implementada esvaziando o campo
 * seria exatamente cair no default do fornecedor, que é o dano. Todo teste de recusa aqui afirma, junto,
 * que `criarFuncionarioSelecao` **não foi chamado nenhuma vez**.
 *
 * SÃO DOIS MOTIVOS DISTINTOS, e confundi-los numa asserção só perderia a diferença que a tela precisa
 * mostrar ao time:
 *   - `GI_SALARIO_SEM_UNIDADE`: **ninguém declarou**. Ação: alguém olha o valor e declara (0140).
 *   - `GI_SALARIO_HORISTA_SEM_JORNADA`: **declarou HORA** e **falta a JORNADA** em horas que o
 *     `tipoSalario = 'H'` exige do outro lado (`qtdeHorasMes`/`qtdeHorasSem`, ambos `default 0`). Ação:
 *     informar a jornada. **Desde a 0140 isto é PENDÊNCIA PREENCHÍVEL, não recusa perpétua**, e a
 *     diferença importa: admissão auditada que o sistema recusa PARA SEMPRE é indistinguível de admissão
 *     quebrada, porque não há o que preencher.
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

describe("a UNIDADE barra o POST inteiro, nao o campo", () => {
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

  it("SEM unidade declarada: recusa GI_SALARIO_SEM_UNIDADE e NENHUM POST acontece", async () => {
    const { svc, criar, marcarEnviado } = envio(contratacaoCom(null));

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_SEM_UNIDADE" });
    expect(criar, "criou FuncionarioSelecao na producao do fornecedor sem unidade").not.toHaveBeenCalled();
    // E a idempotência NÃO é carimbada: a admissão continua pendente e reenviável depois da declaração.
    expect(marcarEnviado, "carimbou envio que nao aconteceu").not.toHaveBeenCalled();
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

  it("os DOIS motivos sao DIFERENTES, e a diferenca e o que a tela mostra ao time", async () => {
    // "é horista e falta a jornada" e "ninguém declarou" pedem ações diferentes (nenhuma do time x
    // declarar a unidade). Uma asserção só de "recusou" perderia justamente isso.
    const semUnidade = await envio(contratacaoCom(null)).svc.enviarManual(ADM, "a");
    const horista = await envio(contratacaoCom("HORA")).svc.enviarManual(ADM, "a");

    expect(semUnidade.motivo).not.toBe(horista.motivo);
    expect(semUnidade.motivo).toBe("GI_SALARIO_SEM_UNIDADE");
    expect(horista.motivo).toBe("GI_SALARIO_HORISTA_SEM_JORNADA");
  });

  it("grafia fora do CHECK do banco e tratada como NAO DECLARADA, nunca como palpite", async () => {
    // A coluna tem CHECK, então grafia criativa é sinal de escrita por fora. O desfecho seguro é recusar
    // como "ninguém declarou", e NUNCA deduzir pela letra parecida ("Horista" não vira `H`).
    for (const grafia of ["Horista", "MES", "mensal ao mes", "", "   ", "M", "H", "QUINZENA"]) {
      const { svc, criar } = envio(contratacaoCom(grafia));
      const r = await svc.enviarManual(ADM, "autor-sintetico");
      expect(r.motivo, `grafia "${grafia}"`).toBe("GI_SALARIO_SEM_UNIDADE");
      expect(criar, `grafia "${grafia}" virou envio`).not.toHaveBeenCalled();
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

describe("o perigo e OMITIR: a guarda nao esvazia o campo, ela barra o envio", () => {
  it("no caso RECUSADO, TODAS as outras guardas passavam: so a unidade parou o envio", () => {
    /**
     * É ESTE TESTE QUE PROVA O DANO, e não o de cima: ele mostra que o payload de 9,34 sem unidade está
     * COMPLETO aos olhos de todas as guardas anteriores (empresa e filial resolvidas, par real, salário
     * positivo). Sem a guarda da unidade, o `POST` sairia, o GI aplicaria `default 'M'` e o holerite
     * viria com R$ 9,34 mensais. A recusa é a única coisa entre o dado e a folha.
     */
    const payload = montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, contratacaoCom(null));

    expect(payload.codigoEmpresa).toBe(1);
    expect(payload.codigoFilial).toBe(4);
    expect(payload.salario).toBe(9.34);
    expect(PAR_CONHECIDO(1, 4)).toBe(true);
    // A unidade é a ÚNICA coisa faltando, e ela é o que recusa.
    expect(payload.tipoSalario).toBeNull();
    expect(recusaDaContratacaoGi(payload, PAR_CONHECIDO)).toBe("GI_SALARIO_SEM_UNIDADE");
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
// A ORDEM DAS TRÊS RECUSAS DO SALÁRIO, que o produto fixou e que a trilha lê
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("a ORDEM: salario invalido, depois sem unidade, depois horista sem jornada", () => {
  /**
   * A ORDEM É INFORMAÇÃO, não detalhe de implementação: cada motivo manda o time a uma ação diferente, e
   * trocar a ordem faz um caso ser reportado como outro.
   *
   * O FUNDAMENTO de cada degrau:
   *  1. `GI_SALARIO_INVALIDO` vem primeiro porque o problema é do próprio número, e declarar a unidade de
   *     um número que não serve não conserta nada.
   *  2. `GI_SALARIO_SEM_UNIDADE` vem antes do insumo que a unidade exige: não há como cobrar jornada em
   *     horas de quem ainda não disse que é horista.
   *  3. `GI_SALARIO_HORISTA_SEM_JORNADA` é o último, e é o único que o time NÃO resolve sozinho.
   */
  function payload(salario: unknown, tipoSalario: unknown) {
    // `codigoCliente` resolvido e DISTINTO de empresa e filial: as três recusas medidas aqui são as do
    // SALÁRIO, e o cliente não resolvido abafaria todas elas (ele é a ÚLTIMA da ordem, então só aparece
    // quando o resto passou). Ver a régua da ordem completa em `gi/gi-cliente-e-cidades.tester.spec.ts`.
    return { codigoEmpresa: 1, codigoFilial: 4, codigoCliente: 12345, salario, tipoSalario } as never;
  }

  it("salario ZERO com unidade FALTANDO reporta o SALARIO, nao a unidade", () => {
    expect(recusaDaContratacaoGi(payload(0, null), PAR_CONHECIDO)).toBe("GI_SALARIO_INVALIDO");
  });

  it("salario NEGATIVO com unidade HORA reporta o SALARIO, nao o horista", () => {
    expect(recusaDaContratacaoGi(payload(-100, "H"), PAR_CONHECIDO)).toBe("GI_SALARIO_INVALIDO");
  });

  it("salario VALIDO sem unidade reporta SEM UNIDADE, nunca horista sem horas", () => {
    expect(recusaDaContratacaoGi(payload(9.34, null), PAR_CONHECIDO)).toBe("GI_SALARIO_SEM_UNIDADE");
  });

  it("salario VALIDO com unidade HORA reporta HORISTA SEM HORAS, nunca sem unidade", () => {
    expect(recusaDaContratacaoGi(payload(9.34, "H"), PAR_CONHECIDO)).toBe(
      "GI_SALARIO_HORISTA_SEM_JORNADA",
    );
  });

  it("salario VALIDO com unidade MENSAL nao recusa por nada", () => {
    expect(recusaDaContratacaoGi(payload(9.34, "M"), PAR_CONHECIDO)).toBeNull();
  });

  it("a sequencia COMPLETA das tres, na ordem, com o mesmo cenario evoluindo", () => {
    // Lido de cima para baixo, é o caminho que uma admissão percorre à medida que o time a conserta.
    expect(recusaDaContratacaoGi(payload(0, null), PAR_CONHECIDO)).toBe("GI_SALARIO_INVALIDO");
    expect(recusaDaContratacaoGi(payload(9.34, null), PAR_CONHECIDO)).toBe("GI_SALARIO_SEM_UNIDADE");
    expect(recusaDaContratacaoGi(payload(9.34, "H"), PAR_CONHECIDO)).toBe(
      "GI_SALARIO_HORISTA_SEM_JORNADA",
    );
    expect(recusaDaContratacaoGi(payload(9.34, "M"), PAR_CONHECIDO)).toBeNull();
  });
});
