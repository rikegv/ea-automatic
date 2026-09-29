/**
 * ─ A REGRA DE RÓTULO `GESTOR`: A PROTEÇÃO QUE SUBSTITUIU A DENYLIST (rodada 3, 28/09/2026) ───────
 *
 * ESCRITO PELO `tester` (§A.38), contra o requisito, com texto INJETADO. Nada aqui consulta o banco.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, E O QUE ACONTECE SE ELE SUMIR ─────────────────────────────────┐
 * │ `dados_vaga_folha.gestor_bp` deixou de ser lido: a régua dele em `lote.ts` é `ROTULO`, e a fonte  │
 * │ não alimenta mais a denylist. Ou seja, NÃO HÁ MAIS REDE por baixo: se a regra de rótulo `GESTOR`  │
 * │ do gate não pegar a tela, PII de terceiro vai para PNG no git, que guarda para sempre (§A.33).    │
 * │ O par é este: `regua-das-colunas-de-pessoa.tester.spec.ts` prova que a fonte não é lida, e este    │
 * │ arquivo prova que a proteção nova existe de verdade.                                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÃO **DUAS CAMADAS**, E ELAS NÃO SE SOMAM TÃO BEM QUANTO PARECE ────────────────────────────┐
 * │ Camada 1, DENYLIST: o valor da coluna vira `negados.nomesDeColuna` e é PROCURADO na imagem. Pega   │
 * │ o que ESTÁ no banco no arranque, e só com DUAS palavras ou mais (`variantesDeNomeDeUsuario`         │
 * │ devolve `[]` para uma palavra).                                                                   │
 * │ Camada 2, RÓTULO: recusa a imagem que DESENHA o campo. Depois da rodada 4 ela traz                  │
 * │ `exigeFormaDeNome`, então só emite achado quando o valor colhido PARECE NOME para o léxico.        │
 * │                                                                                                  │
 * │ A INTERSEÇÃO DOS DOIS BURACOS é o que este arquivo mede, e é o bloco vermelho do fim: valor de     │
 * │ UMA palavra e nome de duas palavras que o léxico não conhece não são pegos por NENHUMA das duas.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nomes inventados, e-mail `.invalid`, CPF da faixa `999` com dígito válido. O gestor das
 * fixtures não é gestor de ninguém.
 */
import { describe, expect, it } from "vitest";
import { auditarTexto, montarVocabularioDoSistema, type AllowlistArnes } from "./pii";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["mariana.alves@exemplo.invalid"],
};

const achadosDeGestor = (texto: string, a: AllowlistArnes = ALLOWLIST) =>
  auditarTexto(texto, a).achados.filter((x) => x.tipo === "GESTOR");

/**
 * ─ O TEXTO É O QUE `textoAuditavel` PRODUZ, E NÃO O HTML DA TELA ────────────────────────────────
 *
 * Os dois modais reais desenham rótulo e valor como elementos de BLOCO separados, então o texto
 * auditado traz um por LINHA, e o valor cai no SEGMENTO SEGUINTE. Foi por isso que o molde do
 * `ENDERECO` (resto da MESMA linha) nasceria INERTE aqui: o resto da linha do rótulo é vazio.
 */
const campo = (rotulo: string, valor: string) => `Cliente\nACME Servicos\n${rotulo}\n${valor}\nSalário\nR$ 0,00`;

/**
 * UM NOME QUE O LÉXICO CONHECE, de propósito: depois da rodada 4 a regra de rótulo só emite achado
 * quando o valor PARECE nome, então usar um valor qualquer aqui mediria o léxico, e não o rótulo.
 */
const GESTOR_COM_FORMA_DE_NOME = "Joaquim Petrocelli Barbosa";

describe("a regra `GESTOR` recusa a tela que DESENHA o campo", () => {
  /**
   * OS TRÊS RÓTULOS FORAM MEDIDOS NO CÓDIGO DAS TELAS, e o teste os repete um a um em vez de testar
   * "um deles": tela nova costuma escrever a variante que ninguém lembrou, e uma variante que não
   * dispara é a tela inteira passando com o campo desenhado.
   */
  it.each([
    ["Gestor BP", "AdmissaoDetalheModal e ApresentacaoIntegracaoModal"],
    ["Gestor / BP", "EditAdmissaoModal, nova/page, PendenciasModal e liberacao/page"],
    ["Gestor / BP *", "o campo obrigatório de `/nova`, com o asterisco"],
    ["gestor_bp", "a chave crua do de/para de rótulos"],
    ["Gestor", "a tela futura que escrever só o prenome do campo"],
  ])("o rótulo %s dispara o achado (%s)", (rotulo) => {
    const achados = achadosDeGestor(campo(rotulo, GESTOR_COM_FORMA_DE_NOME));
    expect(achados.length, `o rótulo "${rotulo}" não disparou`).toBeGreaterThan(0);
    expect(achados[0].valor).toContain("Joaquim");
  });

  /**
   * O VALOR NO SEGMENTO SEGUINTE É O CASO REAL, e este teste existe para travar a volta do molde do
   * `ENDERECO`: com `restoDaFrase` sozinho, o resto da linha do rótulo é VAZIO nos dois modais, a
   * regra aprova, e o sintoma é zero achado numa tela que desenha o campo.
   */
  it("o valor está na LINHA SEGUINTE, e a regra não fica inerte por causa disso", () => {
    const texto = `Gestor / BP\n${GESTOR_COM_FORMA_DE_NOME}\nMotivo\nSubstituicao`;
    expect(achadosDeGestor(texto).length).toBeGreaterThan(0);
  });

  it("o achado é do tipo GESTOR, e a tela inteira é RECUSADA", () => {
    const v = auditarTexto(campo("Gestor BP", GESTOR_COM_FORMA_DE_NOME), ALLOWLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((x) => x.tipo === "GESTOR")).toBe(true);
  });
});

describe("o que o ARNÊS declara passa, e SÓ isso", () => {
  /**
   * SEM ESTA DISPENSA A REGRA DEGENERA em "recusa tudo": o arnês PREENCHE o campo do gestor nas telas
   * que ele mesmo monta, e a tela do próprio arnês seria recusada por um dado que não é de ninguém.
   */
  it("o gestor SINTÉTICO declarado em `gestores` não vira achado", () => {
    const SINTETICO = GESTOR_COM_FORMA_DE_NOME;
    const texto = campo("Gestor / BP", SINTETICO);
    expect(achadosDeGestor(texto, { ...ALLOWLIST, gestores: [SINTETICO] })).toEqual([]);
    // E sem a declaração, o MESMO texto é recusado: a dispensa é do valor declarado, não do rótulo.
    expect(achadosDeGestor(texto).length).toBeGreaterThan(0);
  });

  /**
   * `gestores` É UM SACO SEPARADO DE `nomes`, e a asserção trava a fusão dos dois: um saco só de
   * "permitidos" transforma uma dispensa estreita em larga sem ninguém perceber, e a dispensa de
   * gestor passaria a valer para o léxico de nome da tela inteira.
   */
  it("declarar em `nomes` NÃO dispensa a regra de rótulo", () => {
    const SINTETICO = GESTOR_COM_FORMA_DE_NOME;
    const comNome = { ...ALLOWLIST, nomes: [...ALLOWLIST.nomes, SINTETICO] };
    expect(achadosDeGestor(campo("Gestor / BP", SINTETICO)).length).toBeGreaterThan(0);
    expect(achadosDeGestor(campo("Gestor / BP", SINTETICO), comNome).length).toBeGreaterThan(0);
  });
});

describe("O CAMPO VAZIO NÃO É DADO DE NINGUÉM", () => {
  /**
   * §A.11: o marcador de célula vazia é "não informado", e o `ApresentacaoIntegracaoModal` ainda
   * desenha o glifo quando o valor é nulo. Sem esta dispensa, TODA tela com o campo VAZIO seria
   * recusada com um achado cujo "valor" é o texto fixo da interface, e o gate degeneraria justamente
   * onde não há dado nenhum a proteger.
   */
  it.each(["não informado", "—", "-"])("o marcador %s não vira achado", (marcador) => {
    expect(achadosDeGestor(campo("Gestor BP", marcador))).toEqual([]);
  });

  /**
   * A DISPENSA É DO MARCADOR INTEIRO, e não de um prefixo: "não informado, falar com <fulano>" tem
   * gente dentro, e continua sendo achado.
   */
  it("o marcador com texto colado CONTINUA sendo achado", () => {
    const achados = achadosDeGestor(
      campo("Gestor BP", `não informado, falar com ${GESTOR_COM_FORMA_DE_NOME}`),
    );
    expect(achados.length).toBeGreaterThan(0);
  });
});

describe("OS FALSOS POSITIVOS MEDIDOS NA EXECUÇÃO REAL (rodada 3)", () => {
  /**
   * ─ O QUE ESTE BLOCO MEDE, E POR QUE ELE É O ITEM MAIS IMPORTANTE DA RODADA ───────────────────
   *
   * ┌─ O CUSTO DO FALSO POSITIVO NÃO É "UM PRINT A MENOS" ─────────────────────────────────────────┐
   * │ Essa é a frase que aparece no código, e ela é verdadeira UMA vez. Repetida, ela vira outra       │
   * │ coisa: gate que recusa tela por rótulo de campo é gate que não deixa o manual existir, e gate    │
   * │ que não deixa o manual existir é gate que alguém vai desligar. O falso positivo não derruba a    │
   * │ proteção hoje, derruba a proteção no dia em que ela atrapalhar o suficiente.                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OS TRÊS CASOS SÃO DA EXECUÇÃO REAL, com a régua nova, e NENHUM deles é gente: são RÓTULOS DE
   * CAMPO que caíram no segmento seguinte porque o campo anterior estava vazio.
   */
  it("`GESTOR: Tempo de contrato` não é gente, e não pode virar achado", () => {
    const texto = "Gestor / BP *\nTempo de contrato\n90 dias";
    expect(achadosDeGestor(texto).map((x) => x.valor)).toEqual([]);
  });

  it("`GESTOR: Uniforme` não é gente, e não pode virar achado", () => {
    const texto = "Gestor BP\nUniforme\nSim";
    expect(achadosDeGestor(texto).map((x) => x.valor)).toEqual([]);
  });

  it("`ENDERECO: de trabalho` é o resto do PRÓPRIO rótulo, e não um endereço", () => {
    const texto = "Endereço de trabalho\nRua Inventada, 100";
    const achados = auditarTexto(texto, ALLOWLIST).achados.filter((x) => x.tipo === "ENDERECO");
    expect(achados.map((x) => x.valor)).not.toContain("de trabalho");
  });

  /**
   * O CONTROLE DO BLOCO: se a correção dos três casos acima for feita alargando a dispensa, ESTE
   * teste fica vermelho e denuncia. Campo de gestor com gente dentro continua sendo achado, e é essa
   * a linha que separa "consertar o falso positivo" de "desligar a regra".
   */
  it("CONTROLE: o campo com gente de verdade continua sendo recusado", () => {
    expect(
      achadosDeGestor(`Gestor / BP *\n${GESTOR_COM_FORMA_DE_NOME}\n90 dias`).length,
    ).toBeGreaterThan(0);
  });
});

describe("A COBERTURA DAS DUAS CAMADAS JUNTAS (o que a rodada 4 deixou aberto)", () => {
  /**
   * ─ ESTE BLOCO É O ACHADO DA RODADA, E ELE ESTÁ VERMELHO DE PROPÓSITO ────────────────────────
   *
   * ┌─ O QUE FOI MEDIDO, com as duas camadas LIGADAS ─────────────────────────────────────────────┐
   * │ A camada 1 (denylist) recebe o valor em `nomesDeColuna`; a camada 2 (rótulo) exige forma de     │
   * │ nome. Injetando o valor NAS DUAS, o gate devolve ZERO achado para:                              │
   * │   . o valor de UMA palavra (41 dos 431 medidos na base): a denylist ignora uma palavra           │
   * │     (`variantesDeNomeDeUsuario` devolve `[]`) e o rótulo o descarta por não parecer nome;        │
   * │   . o nome de DUAS palavras que o léxico não conhece (a fatia dos "71 por serem nome real que o  │
   * │     léxico não conhece", do próprio levantamento da frente).                                    │
   * │                                                                                                │
   * │ Ou seja, a mesma fatia que a rodada 3 existiu para fechar continua aberta depois da rodada 4,    │
   * │ agora por outro caminho: antes a denylist era inerte para ela, agora o `exigeFormaDeNome`         │
   * │ devolve o rótulo ao mesmo limite do léxico. "As duas se cobrem" é verdade para o valor com forma  │
   * │ de nome, e não é verdade para esta fatia.                                                        │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NÃO É PARA "CONSERTAR" AFROUXANDO O TESTE. O conserto, se o coordenador decidir por ele, é de
   * régua, e as opções que a medição sugere são duas: (a) a denylist passar a procurar o valor
   * LITERAL, e não só as variantes de duas palavras, para o que vem de COLUNA; ou (b) a regra de
   * rótulo emitir o achado quando o valor colhido não for rótulo de campo conhecido, em vez de exigir
   * forma de nome. As duas alcançam código validado, então a decisão é dele (§A.26, §A.27).
   */
  const NEGADOS_COM_O_GESTOR = (valor: string) => ({
    nomes: [],
    emails: [],
    nomesDeColuna: [valor],
  });

  it("valor de UMA palavra: nenhuma das duas camadas o pega", () => {
    const UMA_PALAVRA = "Quintanilha";
    const texto = campo("Gestor BP", UMA_PALAVRA);
    const v = auditarTexto(texto, ALLOWLIST, NEGADOS_COM_O_GESTOR(UMA_PALAVRA));
    expect(
      v.achados,
      "são 41 dos 431 valores da base, e é a fatia que motivou a troca de instrumento",
    ).not.toEqual([]);
  });

  it("nome de DUAS palavras que o léxico não conhece: nenhuma das duas camadas o pega", () => {
    const DESCONHECIDO = "Ademar Quintanilha";
    const texto = campo("Gestor / BP", DESCONHECIDO);
    const v = auditarTexto(texto, ALLOWLIST, NEGADOS_COM_O_GESTOR(DESCONHECIDO));
    expect(v.achados).not.toEqual([]);
  });

  /**
   * O CONTROLE DO BLOCO: com forma de nome conhecida, as duas camadas funcionam. Sem este par, o
   * vermelho acima poderia ser lido como "o gate não faz nada", que não é o caso.
   */
  it("CONTROLE: com forma de nome que o léxico conhece, o gate recusa", () => {
    const v = auditarTexto(
      campo("Gestor BP", GESTOR_COM_FORMA_DE_NOME),
      ALLOWLIST,
      NEGADOS_COM_O_GESTOR(GESTOR_COM_FORMA_DE_NOME),
    );
    expect(v.aprovado).toBe(false);
  });
});

describe("O INVARIANTE DO CONSERTO DE CUSTO: `montarVocabularioDoSistema`", () => {
  /**
   * ─ OTIMIZAÇÃO SÓ REGRIDE EM SILÊNCIO SE A SAÍDA MUDAR ───────────────────────────────────────
   *
   * O conserto que tirou o custo daquela função (compilar a denylist ANTES do laço, em vez de a cada
   * um dos ~6.100 valores) é de ALGORITMO: a semântica tem de ser byte a byte a mesma. Teste de tempo
   * seria instável na máquina de CI; teste de SAÍDA não é, e é ele que pega a regressão de verdade,
   * que seria a ordem mudar ou um valor sumir.
   */
  const VALORES = [
    "ACME Servicos LTDA",
    "BC Campinas Parque D Pedro Shopping",
    "São Paulo",
    "Ferraz de Vasconcelos",
    "Escala 12x36",
    "ACME Servicos LTDA",
    "",
    null,
    undefined,
  ];
  const NEGADOS = { nomes: ["Rosangela Petrocelli Barbosa"], emails: ["rosangela.barbosa@homolog.invalid"] };

  it("a MESMA entrada devolve a MESMA lista, na MESMA ordem", () => {
    const a = montarVocabularioDoSistema(VALORES, NEGADOS);
    const b = montarVocabularioDoSistema(VALORES, NEGADOS);
    expect(a.valores).toEqual(b.valores);
  });

  it("a ordem é a da PRIMEIRA aparição, sem duplicata e sem vazio", () => {
    const { valores } = montarVocabularioDoSistema(VALORES, NEGADOS);
    expect(valores).toEqual([
      "ACME Servicos LTDA",
      "BC Campinas Parque D Pedro Shopping",
      "São Paulo",
      "Ferraz de Vasconcelos",
      "Escala 12x36",
    ]);
  });

  /**
   * O QUE A FUNÇÃO EXISTE PARA FAZER continua sendo feito: valor de catálogo que CARREGA um nome
   * negado não entra no vocabulário, senão a dispensa por catálogo desligaria a denylist da equipe.
   */
  it("valor de catálogo que contém nome da denylist NÃO entra no vocabulário", () => {
    const { valores } = montarVocabularioDoSistema(
      [...VALORES, "Loja da Rosangela Petrocelli Barbosa"],
      NEGADOS,
    );
    expect(valores).not.toContain("Loja da Rosangela Petrocelli Barbosa");
  });

  it("com denylist vazia, nada é subtraído", () => {
    const { valores } = montarVocabularioDoSistema(
      ["Loja da Rosangela Petrocelli Barbosa"],
      { nomes: [], emails: [] },
    );
    expect(valores).toEqual(["Loja da Rosangela Petrocelli Barbosa"]);
  });
});
