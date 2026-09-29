/**
 * ─ O GATE DE DADO PESSOAL DO PRINT (§A.6, §3.4 do DESENHO-CENTRAL-DE-AJUDA) ─────────────────────
 *
 * ESCRITO PELO `tester`, NÃO PELO AUTOR DO MOTOR (§A.38). O motor está sendo construído AGORA, em
 * paralelo: este arquivo nasce VERMELHO por ausência de `./pii`, e é isso que se espera na primeira
 * rodada (§A.40, o teste vem do REQUISITO, não do código).
 *
 * ┌─ POR QUE ESTE É O TESTE QUE NÃO PODE FALHAR ─────────────────────────────────────────────────┐
 * │ Print vai para o repositório e REPOSITÓRIO GUARDA PARA SEMPRE: um PNG com CPF real não se     │
 * │ desfaz com um commit de remoção, e a foto continua no histórico de todo clone. É a mesma      │
 * │ régua da §A.33: abster-se é seguro, gravar errado é IRREVERSÍVEL. Por isso a recusa é FALHA    │
 * │ DURA, e não aviso: aviso que ninguém lê não é detecção.                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O GATE É ALLOWLIST, NUNCA DENYLIST (veto do `seguranca`, achado 2) ─────────────────────────┐
 * │ "Nome de pessoa fora da allowlist" não é computável por denylist: nenhuma regra de forma      │
 * │ distingue "Juliana Petrocelli Barbosa" de "Soulan Serviços Terceirizados", e a tela da casa é │
 * │ inteira em title case por regra (§A.24). Um detector de forma degenera nos DOIS extremos, e   │
 * │ OS DOIS SÃO DEFEITO:                                                                          │
 * │   . o que PASSA TUDO vaza, e o vazamento é permanente;                                        │
 * │   . o que RECUSA TUDO não vaza e é pior na prática, porque 400 prints param de gravar, e a    │
 * │     saída que a pressão encontra é ENFRAQUECER O GATE para destravar a frente. Esse é o modo  │
 * │     de falha realista, e é por isso que metade deste arquivo mede APROVAÇÃO.                  │
 * │ A régua computável: o valor é aprovado quando está na ALLOWLIST do arnês (ou é máscara         │
 * │ declarada da interface); todo o resto é recusa.                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  auditarTelaDoManual, type AllowlistArnes, auditarDom, auditarTexto, textoAuditavel } from "./pii";

/**
 * ─ A ALLOWLIST DO ARNÊS, que é o contrato do gate (§3.4, item 2) ───────────────────────────────
 *
 * O arnês EXPORTA o que criou; o gate só conhece isto. Nomes realistas de propósito (o padrão dos
 * `arnes-*` de A&S), CPF da faixa 999 com dígito válido, e-mail `.invalid` (RFC 2606), telefone de
 * zeros.
 *
 * `mascaras` NÃO É CONVENIÊNCIA, é o que impede o gate de recusar a própria interface. Estes dez
 * valores foram MEDIDOS no código de produção (`grep placeholder=` em `apps/frontend/src`): são as
 * máscaras e os exemplos que as telas de Nova Admissão, Sala De Espera, Assinante Da Empresa e o
 * Portal já mostram hoje. Nenhum deles é dado de ninguém, e todos violam a régua literal: o CPF de
 * máscara não é da faixa 999, e `email@soulan.com.br` não termina em `.invalid`. Sem esta lista,
 * o gate correto recusa TODA tela com formulário, que é a metade do manual.
 */
const ALLOWLIST: AllowlistArnes = {
  nomes: ["Mariana Alves Ribeiro", "Carlos Eduardo Nunes", "Fernanda Lima Souza"],
  cpfs: ["99900000191", "99900000272"],
  emails: ["mariana.alves@exemplo.invalid", "carlos.nunes@exemplo.invalid"],
  telefones: ["(11) 00000-0000"],
  datasNascimento: ["15/03/1988"],
  enderecos: ["Rua Sintetica, 100, Sala 1, Sao Paulo, SP"],
  salarios: ["R$ 1.518,00"],
  contasBancarias: ["0001", "00000000-0"],
  matriculas: ["999001"],
  mascaras: [
    "000.000.000-00",
    "(11) 90000-0000",
    "(11) 99999-0000",
    "00000-000",
    "Maria Souza",
    "maria@exemplo.com",
    "nome@email.com",
    "voce@empresa.com",
    "email@soulan.com.br",
    "seu.email@soulan.com.br",
  ],
};

describe("auditarTexto: o que o gate RECUSA (fail-closed)", () => {
  it("recusa CPF fora da faixa sintética, COM máscara", () => {
    const v = auditarTexto("Candidato: 123.456.789-09", ALLOWLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "CPF")).toBe(true);
  });

  /**
   * SEM MÁSCARA É O CASO QUE MAIS ESCAPA, porque a tela mostra o CPF formatado e o atributo de
   * dado (`title`, `data-*`, valor de campo) costuma carregar o número cru. Um gate que só entende
   * a máscara sente-se seguro e deixa passar exatamente a cópia que ninguém olha.
   */
  it("recusa CPF fora da faixa sintética SEM máscara (11 dígitos crus)", () => {
    const v = auditarTexto("cpf=12345678909", ALLOWLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "CPF")).toBe(true);
  });

  it("recusa e-mail que não termina em .invalid", () => {
    const v = auditarTexto("Contato: joao.pereira@gmail.com", ALLOWLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "EMAIL")).toBe(true);
  });

  /**
   * E-MAIL DE DOMÍNIO DA CASA TAMBÉM É RECUSADO, e este caso é o mais provável de todos: a
   * homologação tem usuário interno de verdade, e `@soulan.com.br` é dado pessoal do mesmo jeito.
   * A régua é `.invalid`, e não "domínio conhecido". A ÚNICA exceção é o valor de máscara
   * declarado, que é literal e conferível, e não uma família de domínio liberada.
   */
  it("recusa e-mail corporativo interno de PESSOA, mesmo com o domínio na lista de máscara", () => {
    const v = auditarTexto("Responsável: henrique.vieira@soulan.com.br", ALLOWLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "EMAIL")).toBe(true);
  });

  /**
   * ─ ESTA ASSERÇÃO FOI INVERTIDA POR ATO DO DIRETOR (rodada 4, 28/09/2026) ─────────────────────
   *
   * O detector genérico de nome por léxico foi DESLIGADO (`DETECTOR_GENERICO_DE_NOME`, `pii.ts`): o
   * manual é INTERNO, quem o lê já acessa o sistema e já manipula o dado do candidato NA FONTE. Nome
   * de CANDIDATO em tela deixa de recusar o print.
   *
   * O QUE ELA PASSA A PROVAR é a mesma coisa pelo outro lado, e é o que impede a inversão de virar
   * "o gate parou de olhar nome": o nome do CANDIDATO passa, e o nome de COLEGA do time, na mesma
   * frase, continua recusando. O limite do que foi liberado fica medido, e não descrito.
   */
  it("nome de CANDIDATO passa no gate da IMAGEM; nome de COLEGA, na mesma frase, continua recusando", () => {
    // O GATE DA IMAGEM é `auditarTelaDoManual` desde o veto do `seguranca` (rodada 5): a chave do
    // diretor vale ali, e `auditarTexto` é a régua COMPLETA que a asserção de POPULAÇÃO usa.
    expect(auditarTelaDoManual("Candidato: Juliana Petrocelli Barbosa", ALLOWLIST).aprovado).toBe(true);
    const comColega = auditarTelaDoManual("Candidato: Juliana Petrocelli Barbosa, responsável Rosangela Petrocelli", ALLOWLIST, {
      nomes: ["Rosangela Petrocelli"],
      emails: [],
    });
    expect(comColega.aprovado).toBe(false);
    expect(comColega.achados.map((a) => a.tipo)).toContain("NOME_DE_USUARIO");
  });

  it("recusa telefone que não é o padrão de zeros do arnês (§3.4, item 3)", () => {
    const v = auditarTexto("Telefone: (11) 98765-4321", ALLOWLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "TELEFONE")).toBe(true);
  });

  /**
   * ─ PÁGINA SEM TEXTO NENHUM: FAIL-CLOSED, E ESTA É UMA DECISÃO QUE O COORDENADOR CONFIRMA ─────
   *
   * Texto vazio é PII-limpo por definição, e é justamente por isso que aprová-lo é a armadilha: a
   * única causa realista de tela sem texto é a captura ter acontecido ANTES da tela carregar (ou
   * depois de um 500, ou numa sessão que caiu). Aprovar significa gravar 400 PNGs de tela branca
   * com carimbo de gate verde. A régua da §A.33 vale aqui inteira: na dúvida, não grava.
   */
  it("recusa página sem texto nenhum: tela vazia é captura quebrada, não captura limpa", () => {
    expect(auditarTexto("", ALLOWLIST).aprovado).toBe(false);
    expect(auditarTexto("   \n\t  ", ALLOWLIST).aprovado).toBe(false);
  });
});

/**
 * ─ OS DADOS PESSOAIS QUE NÃO TINHAM REGRA NENHUMA (veto do `seguranca`, achado 3) ──────────────
 *
 * Ele mediu na homologação: data de nascimento em 2.535 linhas, endereço em 2.176, salário em
 * 2.327, conta e agência bancária em 126, mais matrícula e pretensão salarial. O gate do desenho
 * cobria CPF, nome, e-mail e telefone, e deixava passar os cinco.
 *
 * ┌─ POR QUE A REGRA DELES É POR RÓTULO, E NÃO POR FORMA ────────────────────────────────────────┐
 * │ "15/03/1988" e "01/10/2026" são a mesma forma, e um é dado pessoal e o outro é a data de      │
 * │ admissão que o manual PRECISA mostrar. "R$ 1.518,00" pode ser salário ou o valor do VT. Uma   │
 * │ regra de forma recusa as duas coisas e cai no extremo "recusa tudo" do achado 2. A régua      │
 * │ computável é CONTEXTO DE RÓTULO: valor vizinho de um rótulo sensível ("Nascimento", "Salário",│
 * │ "Agência", "Conta", "Endereço", "Matrícula", "Pretensão") tem de estar na allowlist.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Salário e conta bancária são MAIS sensíveis que o telefone que o gate já protegia, e eram os
 * únicos sem uma linha de regra.
 */
describe("auditarTexto: os cinco dados sensíveis que o desenho não cobria", () => {
  const casos: Array<[string, string]> = [
    ["data de nascimento", "Nascimento: 04/11/1979"],
    ["endereço", "Endereço: Avenida Paulista, 1578, apto 91, São Paulo"],
    ["salário", "Salário: R$ 7.320,45"],
    ["agência bancária", "Agência: 3841"],
    ["conta bancária", "Conta: 87421-6"],
    ["matrícula", "Matrícula: 40871"],
    ["pretensão salarial", "Pretensão salarial: R$ 4.100,00"],
  ];

  for (const [nome, texto] of casos) {
    it(`recusa ${nome} fora do arnês`, () => {
      const v = auditarTexto(texto, ALLOWLIST);
      expect(v.aprovado, texto).toBe(false);
      expect(v.achados.length, texto).toBeGreaterThan(0);
    });
  }

  it("aprova os MESMOS rótulos quando o valor é o do arnês", () => {
    const v = auditarTexto(
      [
        "Nascimento: 15/03/1988",
        "Endereço: Rua Sintetica, 100, Sala 1, Sao Paulo, SP",
        "Salário: R$ 1.518,00",
        "Agência: 0001",
        "Conta: 00000000-0",
        "Matrícula: 999001",
      ].join("\n"),
      ALLOWLIST,
    );
    expect(v.achados).toEqual([]);
    expect(v.aprovado).toBe(true);
  });

  /**
   * O CONTRA-CASO QUE MANTÉM O GATE USÁVEL: data de admissão, previsão de entrega, valor de tarifa
   * de VT e código de cliente NÃO são dado pessoal, aparecem em quase todo print, e nenhum deles
   * está na allowlist. Recusá-los é o extremo "recusa tudo".
   */
  it("NÃO recusa data e valor de rótulo não sensível (admissão, entrega, tarifa, cliente)", () => {
    const v = auditarTexto(
      [
        "Data de admissão: 01/10/2026",
        "Previsão de entrega: 20/10/2026",
        "Tarifa: R$ 5,20",
        "Cliente: 0042",
        "Vaga: SIM-2026-0501",
      ].join("\n"),
      ALLOWLIST,
    );
    expect(v.achados).toEqual([]);
    expect(v.aprovado).toBe(true);
  });
});

describe("auditarTexto: o que o gate APROVA (sem isto a frente é inviável)", () => {
  it("aprova o cenário sintético legítimo inteiro, de uma vez", () => {
    const tela = [
      "Nova Admissão",
      "Mariana Alves Ribeiro",
      "999.000.001-91",
      "mariana.alves@exemplo.invalid",
      "(11) 00000-0000",
    ].join("\n");
    const v = auditarDom(domDe(tela), ALLOWLIST);
    expect(v.achados).toEqual([]);
    expect(v.aprovado).toBe(true);
  });

  it("aprova CPF da faixa 999 com e sem máscara", () => {
    expect(auditarTexto("Cliente 0042 / 999.000.002-72", ALLOWLIST).aprovado).toBe(true);
    expect(auditarTexto("cpf=99900000272", ALLOWLIST).aprovado).toBe(true);
  });

  /**
   * ─ AS MÁSCARAS DA PRÓPRIA INTERFACE, MEDIDAS NO CÓDIGO ───────────────────────────────────────
   *
   * Estas dez strings estão em `placeholder=` hoje, nas telas que o manual mais precisa mostrar. Um
   * gate que as recuse bloqueia Nova Admissão, Sala De Espera, Assinante Da Empresa e o Portal, e
   * o manual perde o wizard inteiro. Note que `000.000.000-00` é CPF de prefixo 000, `Maria Souza`
   * é nome de pessoa em forma perfeita e `email@soulan.com.br` não termina em `.invalid`: são
   * exatamente os três que a régua literal recusaria.
   */
  it("NÃO recusa as máscaras e os exemplos que as telas já mostram", () => {
    for (const m of ALLOWLIST.mascaras ?? []) {
      const v = auditarTexto(`Campo obrigatório ${m}`, ALLOWLIST);
      expect(v.achados, `a máscara "${m}" é da interface, não de pessoa`).toEqual([]);
    }
  });

  it("máscara declarada não abre a porta: valor parecido, mas diferente, continua recusado", () => {
    // Um dígito diferente da máscara já é um CPF potencialmente real.
    expect(auditarTexto("000.000.000-01", ALLOWLIST).aprovado).toBe(false);
    // O NOME SAIU DESTA ASSERÇÃO, e não por enfraquecimento: com o detector genérico desligado, nome
    // parecido com o exemplo não é mais recusado por léxico. A propriedade da MÁSCARA continua medida
    // pelo CPF, que é o caso em que ela nasceu.
    expect(auditarTexto("000.000.000-02", ALLOWLIST).aprovado).toBe(false);
  });

  /**
   * OS RÓTULOS DA CASA SÃO TITLE CASE POR REGRA (§A.24), então a tela inteira é coalhada de
   * sequências de palavras capitalizadas. Um detector de nome que só olhe a forma recusa a própria
   * interface, e aí o gate reprova 100% dos prints.
   */
  it("NÃO confunde rótulo em title case do sistema com nome de pessoa", () => {
    const rotulos = [
      "Gestão Das Assinaturas",
      "Central De Ajuda",
      "Prontos Para Solicitar",
      "Aguardando Assinatura",
      "Sem Envelope",
      "Nova Admissão",
      "Pendências Obrigatórias",
      "Soul ADM",
      "Data De Admissão",
      "Tipo De Marcação",
      "Não Conformidades",
      "Sala De Espera",
      "Assinante Da Empresa",
      "Gerador De Kit",
      "Liberação Admissional",
      "Controle Gerencial",
    ];
    for (const r of rotulos) {
      const v = auditarTexto(r, ALLOWLIST);
      expect(v.achados, `o rótulo "${r}" não é nome de pessoa`).toEqual([]);
    }
  });

  /**
   * RAZÃO SOCIAL DE CLIENTE APARECE EM TODO PRINT DA ESTEIRA, e é o caso que o `seguranca` usou
   * para provar que denylist não fecha: nenhuma regra de forma separa razão social de nome de
   * pessoa. Ela não é dado pessoal, e recusá-la bloqueia a esteira inteira.
   */
  it("NÃO trata razão social nem nome de empresa como nome de pessoa", () => {
    const v = auditarTexto(
      "Soulan Serviços Terceirizados Ltda · Grupo Soulan · Soul ADM · SouTalent",
      ALLOWLIST,
    );
    expect(v.achados).toEqual([]);
  });

  /**
   * NÚMERO NÃO É CPF SÓ POR TER DÍGITOS. A esteira mostra código de cliente, CNPJ, data e valor em
   * toda tela. Recusar qualquer sequência longa de dígitos é o jeito mais fácil de tornar o gate
   * inútil, e é o defeito gêmeo de não recusar nada.
   */
  it("NÃO trata CNPJ, data e valor como CPF", () => {
    const v = auditarTexto(
      "CNPJ 12.345.678/0001-95 · Admissão 01/10/2026 · R$ 2.450,00 · Cliente 0042",
      ALLOWLIST,
    );
    expect(v.achados.filter((a) => a.tipo === "CPF")).toEqual([]);
  });

  /**
   * ─ A TELA REALISTA INTEIRA, QUE É A PROVA DE QUE O GATE NÃO DEGENEROU ────────────────────────
   *
   * Cada teste de aprovação acima mede um pedaço. Este mede a soma, que é o que o motor vai
   * encontrar: menu lateral, cabeçalho de coluna, pill de status, formulário com máscara, uma
   * linha de arnês, e os números que não são de pessoa. Se este teste ficar vermelho, o lote de
   * 280 a 400 prints não grava nenhum, e a frente para.
   */
  it("aprova uma TELA REALISTA inteira: menu, tabela, pill, formulário e a linha do arnês", () => {
    const tela = [
      "Início · Nova Admissão · Liberação Admissional · Esteira Admissional · Gerenciador",
      "Candidato · Cliente · Cargo · Contrato · Data adm. · Auditoria · Exame · Cadastro · Status · Pendências Obrig.",
      "Mariana Alves Ribeiro · 999.000.001-91 · Soulan Serviços Terceirizados Ltda · Auxiliar De Limpeza",
      "Temporário · 01/10/2026 · Análise Ok · Apto · A Cadastrar · Em Admissão · Completo",
      "Nascimento: 15/03/1988 · Salário: R$ 1.518,00 · Matrícula: 999001",
      "CPF 000.000.000-00 · Telefone (11) 90000-0000 · E-mail nome@email.com · CEP 00000-000",
      "Cliente 0042 · CNPJ 12.345.678/0001-95 · Total 1.432 · Declínios 724",
    ].join("\n");
    const v = auditarTexto(tela, ALLOWLIST);
    expect(v.achados).toEqual([]);
    expect(v.aprovado).toBe(true);
  });
});

describe("textoAuditavel: de onde o gate lê (o ataque começa aqui)", () => {
  /**
   * ─ O FURO QUE GRAVA PII DE VERDADE (veto do `seguranca`, achado 1) ───────────────────────────
   *
   * `innerText` e `textContent` NÃO ENXERGAM VALOR DE CAMPO. Num input controlado do React o valor
   * mora na propriedade `.value` do elemento, e o CPF do candidato está exatamente aí, nas telas
   * medidas por ele: `nova/page.tsx:1087` e `:1099`, `sala-espera/page.tsx:508` e `:523`,
   * `admin/assinante-empresa/page.tsx:448` e `:463`, `components/portal/Identificacao.tsx:305`.
   *
   * E o valor de campo É VISÍVEL NO PNG: é o texto que a pessoa digitou, desenhado dentro da
   * caixa. Então este é o único furo desta lista que grava PII no repositório sem nenhuma outra
   * condição: basta o motor tirar o print de um wizard preenchido. Um gate que lê só o texto do DOM
   * aprova essa captura com folga.
   */
  it("enxerga o valor de campo na PROPRIEDADE .value (input controlado do React)", () => {
    const raiz = document.createElement("div");
    const campo = document.createElement("input");
    campo.value = "123.456.789-09"; // propriedade, sem atributo: o caso do React
    raiz.appendChild(campo);

    expect(raiz.textContent ?? "").not.toContain("123.456.789-09"); // a armadilha, provada
    expect(textoAuditavel(raiz)).toContain("123.456.789-09");
    expect(auditarDom(raiz, ALLOWLIST).aprovado).toBe(false);
  });

  it("enxerga o valor de textarea e de select, não só de input", () => {
    const raiz = document.createElement("div");
    const area = document.createElement("textarea");
    // O VALOR CARREGA UM CPF, e não um nome: o que este teste mede é `textoAuditavel` ENXERGAR o
    // valor de `textarea`, e ele precisa de uma camada viva para virar recusa. O detector de nome foi
    // desligado pelo diretor; o CPF continua sendo forma, e não inferência.
    area.value = "Motivo: conferir o CPF 123.456.789-09 da ficha";
    raiz.appendChild(area);
    expect(textoAuditavel(raiz)).toContain("123.456.789-09");
    expect(auditarDom(raiz, ALLOWLIST).aprovado).toBe(false);
  });

  it("enxerga o valor quando ele vem por ATRIBUTO, e não por propriedade", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<input value="12345678909" />`;
    expect(textoAuditavel(raiz)).toContain("12345678909");
    expect(auditarDom(raiz, ALLOWLIST).aprovado).toBe(false);
  });

  /**
   * ─ O CPF QUEBRADO POR ELEMENTO ───────────────────────────────────────────────────────────────
   *
   * A tabela da casa formata dado por pedaço, então o mesmo CPF aparece partido em dois `<span>`
   * sem nenhum espaço entre eles. Lendo nó por nó, o gate vê "123.456." e "789-09", nenhum dos
   * dois com forma de CPF, e APROVA. No PNG, a pessoa lê o CPF inteiro, porque o navegador
   * renderiza colado. O texto auditado precisa ser o texto RENDERIZADO, não a lista dos nós.
   */
  it("pega CPF real partido entre elementos inline (o gate lê o texto renderizado)", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<td><span>123.456.</span><span>789-09</span></td>`;
    const v = auditarDom(raiz, ALLOWLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "CPF")).toBe(true);
  });

  /**
   * E O CONTRÁRIO, que é o que impede a correção acima de virar um gate que recusa tudo: dígitos
   * de CÉLULAS DIFERENTES não se somam em um CPF fantasma. Colar o documento inteiro e varrer
   * runs de 11 dígitos reprova qualquer tabela com duas colunas numéricas vizinhas.
   */
  it("NÃO fabrica CPF juntando dígitos de células separadas da tabela", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<table><tr><td>1234</td><td>5678901</td><td>2345678</td></tr></table>`;
    const v = auditarDom(raiz, ALLOWLIST);
    expect(v.achados.filter((a) => a.tipo === "CPF")).toEqual([]);
  });

  /**
   * ─ O DADO QUE O PIXEL NÃO MOSTRA, E QUE AINDA ASSIM PRECISA SER RECUSADO ─────────────────────
   *
   * `title` e `aria-label` não saem no PNG. Recusar por causa deles parece rigor inútil, e não é,
   * por dois motivos. Primeiro: se o atributo tem o nome real, a LINHA tem o nome real, e o
   * recorte pode mudar amanhã sem ninguém reavaliar o gate. Segundo: é o sinal mais confiável de
   * que a captura pegou dado de PRODUÇÃO em vez do arnês, e este é o alarme que importa. Além
   * disso o `title` vira tooltip, e tooltip aberto no print é dado visível.
   */
  it("lê também os atributos que o pixel esconde: title, aria-label, alt e placeholder", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `
      <button title="Abrir ficha de Juliana Petrocelli Barbosa">Ver</button>
      <span aria-label="CPF 123.456.789-09">documento</span>
      <img alt="Foto de Roberto Carlos Menezes" />
      <input placeholder="joao.pereira@gmail.com" />
    `;
    const texto = textoAuditavel(raiz);
    expect(texto).toContain("Juliana Petrocelli Barbosa");
    expect(texto).toContain("123.456.789-09");
    expect(texto).toContain("Roberto Carlos Menezes");
    expect(texto).toContain("joao.pereira@gmail.com");
    expect(auditarDom(raiz, ALLOWLIST).aprovado).toBe(false);
  });

  it("o DOM sintético legítimo, com os mesmos atributos e com campo preenchido, passa", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `
      <button title="Abrir ficha de Mariana Alves Ribeiro">Ver</button>
      <span aria-label="CPF 999.000.001-91">documento</span>
      <input placeholder="000.000.000-00" />
    `;
    const campo = document.createElement("input");
    campo.value = "999.000.001-91";
    raiz.appendChild(campo);

    const v = auditarDom(raiz, ALLOWLIST);
    expect(v.achados).toEqual([]);
    expect(v.aprovado).toBe(true);
  });

  /**
   * NOME DENTRO DE `<script>` É DADO IGUAL: o Next embute o payload do servidor em
   * `<script id="__NEXT_DATA__">`, e ali passa a resposta crua da API, com nome e CPF de quem a
   * tela listou. Não sai no PNG, e é o indicador mais forte de que a captura não é do arnês.
   */
  it("enxerga o payload embutido em script, que é onde o dado cru da API mora", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<script type="application/json">{"nome":"Juliana Petrocelli Barbosa","cpf":"12345678909"}</script>`;
    expect(auditarDom(raiz, ALLOWLIST).aprovado).toBe(false);
  });

  /**
   * CAMPO DE SENHA: o valor NUNCA entra no texto auditado, e isto não é exceção ao achado 1, é o
   * complemento dele. A senha não é dado de candidato, é CREDENCIAL: auditá-la significa carregá-la
   * em memória e, no primeiro achado, IMPRIMI-LA na mensagem de erro do motor e no log do CI, que é
   * onde ela sobrevive (§A.6: credencial não aparece em log). O print da tela de login se resolve
   * não digitando senha, não auditando-a.
   */
  it("NUNCA lê o valor de campo de senha (credencial não entra em texto auditado nem em log)", () => {
    const raiz = document.createElement("div");
    const senha = document.createElement("input");
    senha.type = "password";
    senha.value = "SenhaReal#2026";
    raiz.appendChild(senha);
    expect(textoAuditavel(raiz)).not.toContain("SenhaReal#2026");
  });
});

describe("a forma do veredito: a recusa tem de ser ACIONÁVEL", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /**
   * Recusa sem o valor achado obriga quem investiga a abrir a tela à mão e adivinhar. Mas o valor
   * no achado é PII, então ele serve para a MENSAGEM de erro do motor, e não para log persistido
   * (§A.6: CPF não aparece em log). Quem grava o veredito em arquivo grava o `tipo`, nunca o
   * `valor`, e isso é responsabilidade de quem consome.
   */
  it("o veredito nomeia o TIPO e o TRECHO de cada achado, e acha TODOS, não só o primeiro", () => {
    // A TERCEIRA CAMADA MUDOU DE NOME: era `NOME` (léxico, desligado pelo diretor), passa a ser
    // `NOME_DE_USUARIO` (denylist de equipe, busca literal). O que o teste mede é o mesmo: o veredito
    // acha TODOS os achados, e não para no primeiro.
    const v = auditarTelaDoManual(
      "Rosangela Petrocelli Barbosa · 123.456.789-09 · joao.pereira@gmail.com",
      ALLOWLIST,
      { nomes: ["Rosangela Petrocelli Barbosa"], emails: [] },
    );
    expect(v.aprovado).toBe(false);
    const tipos = [...new Set(v.achados.map((a) => a.tipo))].sort();
    expect(tipos).toEqual(["CPF", "EMAIL", "NOME_DE_USUARIO"]);
    for (const a of v.achados) expect(String(a.valor).length).toBeGreaterThan(0);
  });

  it("aprovado e achados nunca discordam", () => {
    const limpo = auditarTexto("Mariana Alves Ribeiro · 999.000.001-91", ALLOWLIST);
    expect(limpo.aprovado).toBe(limpo.achados.length === 0);
    const sujo = auditarTexto("Juliana Petrocelli Barbosa", ALLOWLIST);
    expect(sujo.aprovado).toBe(sujo.achados.length === 0);
  });

  /**
   * ALLOWLIST VAZIA RECUSA, e este é o caso do arnês que não rodou. Se a lista vier vazia por
   * qualquer motivo (falha do seed, import errado, variável não carregada), a única leitura segura
   * é "não sei o que é sintético nesta tela", e a resposta é não gravar. Um gate que aprove tudo
   * quando a allowlist está vazia falha aberto exatamente no dia em que o arnês falhou.
   */
  it("allowlist vazia RECUSA tela com conteúdo, em vez de aprovar por não ter com o que comparar", () => {
    const vazia: AllowlistArnes = { nomes: [], cpfs: [], emails: [] };
    const v = auditarTexto("Mariana Alves Ribeiro · 999.000.001-91", vazia);
    expect(v.aprovado).toBe(false);
  });
});

/** Monta um DOM de teste a partir de linhas de texto, uma por parágrafo. */
function domDe(texto: string): HTMLElement {
  const raiz = document.createElement("div");
  for (const linha of texto.split("\n")) {
    const p = document.createElement("p");
    p.textContent = linha;
    raiz.appendChild(p);
  }
  return raiz;
}
