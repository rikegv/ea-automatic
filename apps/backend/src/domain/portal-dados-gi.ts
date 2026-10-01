/**
 * PORTAL→GI (peças 2 e 3): o SEAM de domínio, função pura, testável sem banco nem rede.
 *
 * ESTE MÓDULO É A CONTRAPARTE do contrato do `tester` (`portal/portal-dados-gi.contrato.tester.spec.ts`,
 * §A.38/§A.40): o teste foi escrito do REQUISITO, em paralelo à construção, e este arquivo implementa
 * as assinaturas que ele exige. Ele concentra as DECISÕES (o quê persiste, o quê vai para a trilha,
 * quando expurga, o quê vai para o GI) fora da camada de I/O, para que a garantia mais sensível da
 * frente, "só o valor CONFIRMADO persiste e só dado DE PESSOA vai ao GI", seja provável por teste.
 *
 * §A.6: função pura, sem logger. Nenhum valor é impresso; as exceções NÃO carregam valor.
 */

// ── Peça 2: a gravação do dado validado pelo candidato ──────────────────────────────────────────

/** Um campo que o candidato conferiu na tela. `confirmadoPorHumano` decide se persiste (veto V12). */
export interface CampoConfirmadoGi {
  campo: string;
  rotulo: string;
  valor: string;
  /** SÓ o que o candidato confirmou persiste. A sugestão crua da IA chega com `false` e é descartada. */
  confirmadoPorHumano: boolean;
}

export interface EntradaDadosGi {
  /** A admissão do BILHETE (sessão do Portal). É nela que se grava, sempre. */
  admissaoDaSessao: string;
  /** O `jti` do link da sessão. Ancoradouro do candidato (não é usuário do sistema). */
  jtiLink: string;
  campos: CampoConfirmadoGi[];
  agora: Date;
  /**
   * A admissão que o CORPO do pedido tentou informar, se veio alguma. O controller NUNCA a manda
   * (a admissão vem só da sessão), então na prática ela é sempre indefinida por HTTP; existe aqui
   * como guarda de defesa em profundidade, exercitada pelo contrato do tester.
   */
  admissaoNoCorpo?: string;
}

export interface GravacaoDadosGi {
  admissaoId: string;
  jtiLink: string;
  /** SÓ os campos confirmados pelo humano (o que persiste). Genérico: a camada de I/O mapeia para colunas. */
  valores: Record<string, string>;
  /** Os campos que NÃO persistem (não confirmados ou vazios), por chave. */
  descartados: string[];
  /** Os RÓTULOS dos campos confirmados, para a trilha do aceite (§A.6: rótulo, nunca valor). */
  rotulosAceitos: string[];
  /** Quando esta linha deve ser expurgada (B3). */
  expurgarEm: Date;
}

/**
 * TETO de retenção do dado validado (B3 / §A.6). Escrito na confirmação: o dado sobrevive do
 * "candidato confirmou" até o "time envia ao GI", mas o EA não vira repositório permanente de RG e
 * PIS. A peça 3, quando ligar, re-carimba para "envio + margem".
 */
export const RETENCAO_DADOS_GI_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Decide O QUE persiste (só o confirmado) e O QUE vai para a trilha (só rótulos). RECUSA um corpo
 * que aponte para admissão diferente da sessão: ninguém grava dado na admissão de outra pessoa.
 *
 * §A.6: a mensagem da recusa NÃO carrega valor nem id de pessoa.
 */
export function montarGravacaoDadosGi(entrada: EntradaDadosGi): GravacaoDadosGi {
  if (entrada.admissaoNoCorpo && entrada.admissaoNoCorpo !== entrada.admissaoDaSessao) {
    // Rótulo fixo, sem PII: a divergência é o fato, o valor nunca entra na mensagem.
    throw new Error("A admissao do corpo diverge da sessao do bilhete.");
  }

  const valores: Record<string, string> = {};
  const descartados: string[] = [];
  const rotulosAceitos: string[] = [];

  for (const c of entrada.campos) {
    if (typeof c?.campo !== "string" || !c.campo) continue;
    const valor = typeof c.valor === "string" ? c.valor.trim() : "";
    if (c.confirmadoPorHumano === true && valor.length > 0) {
      valores[c.campo] = valor;
      rotulosAceitos.push(typeof c.rotulo === "string" ? c.rotulo : c.campo);
    } else {
      descartados.push(c.campo);
    }
  }

  return {
    admissaoId: entrada.admissaoDaSessao,
    jtiLink: entrada.jtiLink,
    valores,
    descartados,
    rotulosAceitos,
    expurgarEm: new Date(entrada.agora.getTime() + RETENCAO_DADOS_GI_MS),
  };
}

/** Peça 1/B3: o dado venceu? Nulo NÃO expurga (sem relógio, não apaga por engano). */
export function dadoGiExpirado(expurgarEm: Date | null, agora: Date): boolean {
  return expurgarEm != null && expurgarEm.getTime() <= agora.getTime();
}

// ── Peça 3 (INERTE): o payload SÓ de pessoa e o gatilho fail-closed ─────────────────────────────

/**
 * O que se conhece da PESSOA, achatado. É a UNIÃO de `candidatos` + `admissao_dados_gi`. Só as
 * chaves listadas aqui atravessam para o GI: qualquer chave a mais (salário, folha, situação
 * trabalhista, arquivo) é IGNORADA, e é essa allowlist que garante o "só dado de pessoa".
 */
export interface PessoaParaGi {
  nome?: string | null;
  cpf?: string | null;
  nascimento?: string | null;
  sexo?: string | null;
  email?: string | null;
  telefone?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  nacionalidade?: string | null;
  naturalidade?: string | null;
  nomeMae?: string | null;
  nomePai?: string | null;
  estadoCivil?: string | null;
  raca?: string | null;
  grauInstrucao?: string | null;
  rg?: string | null;
  rgOrgao?: string | null;
  rgUf?: string | null;
  rgDataEmissao?: string | null;
  ctpsNumero?: string | null;
  ctpsSerie?: string | null;
  ctpsUf?: string | null;
  ctpsData?: string | null;
  pis?: string | null;
  tituloNumero?: string | null;
  tituloZona?: string | null;
  tituloSecao?: string | null;
  reservista?: string | null;
  cnh?: string | null;
  cnhDataEmissao?: string | null;
  cnhDataValidade?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

/**
 * O payload da pré-admissão do GI (`FuncionarioSelecao`), SÓ com campos de pessoa. Os nomes espelham
 * os campos do GI (`docs/GI-DADOS-DA-PESSOA-PARA-VALIDAR.md`).
 *
 * PEÇA 3: o de/para de código entrou. `cidadeResid` guarda o NOME (o que o EA tem como texto), e
 * `codigoCidadeResid` guarda o CÓDIGO do GI, resolvido por um de/para injetado. Sem de/para, o código
 * nasce NULO (fail-closed: nunca se INVENTA código).
 */
export interface FuncionarioSelecao {
  nome: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  email: string | null;
  smsdddCel: string | null;
  smsNroCel: string | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  filiacaoNomeMae: string | null;
  filiacaoNomePai: string | null;
  estadoCivil: string | null;
  raca: string | null;
  grauInstrucao: string | null;
  rg: string | null;
  orgaoRG: string | null;
  ufrg: string | null;
  dtExpedicaoRG: string | null;
  carteiraTrabalho: string | null;
  serie: string | null;
  /**
   * UF de expedição da CTPS. O campo do GI é `ufExpedicao`, NÃO `ufCTPS`: `ufCTPS` não existe no
   * contrato (conferido no `openapi/v1.json` do GI, 29/09/2026) e era ignorado no envio.
   */
  ufExpedicao: string | null;
  dtExpedicaoCTPS: string | null;
  /**
   * O campo do PIS no GI é `pis` (contrato confirmado 25/09/2026), NÃO `pisNit` como constava antes.
   * OPCIONAL: veio vazio no registro real; a ausência de PIS não bloqueia o envio.
   */
  pis: string | null;
  tituloEleitor: string | null;
  titEleZona: string | null;
  titEleSecao: string | null;
  reservista: string | null;
  habilitacao: string | null;
  cnhDataEmissao: string | null;
  dataVectoHabilitacao: string | null;
  cepResid: string | null;
  /**
   * Logradouro. `tipoLogradouro` NÃO existe como campo no GI: o prefixo da via (Rua, Avenida) vive
   * concatenado AQUI. O EA coleta o logradouro já por extenso, então o tipo entra por construção no
   * texto; se um dia o tipo vier separado, é aqui que ele se concatena.
   */
  enderecoResid: string | null;
  /**
   * Número do endereço. O campo do GI é `nroEndereco`, e é **INTEIRO não-anulável** (`int32`, padrão
   * `^-?(?:0|[1-9]\d*)$`, default `0`). Por isso o valor é normalizado para dígitos e a ausência vai
   * como `0`, nunca `null`: `null` viola o contrato. Número não-numérico ("S/N", "100-A") perde o
   * sufixo, que é o limite do campo do GI, não escolha nossa.
   */
  nroEndereco: number;
  /**
   * Complemento do endereço. O campo do GI é `cplEndereco`, NÃO `complementoResid`, e tem **máximo de
   * 30 caracteres**. O valor é CORTADO em 30 antes de sair: acima disso o GI recusa o envio inteiro
   * com HTTP 400, e perder o final do complemento é melhor que perder a admissão. Decisão do diretor.
   */
  cplEndereco: string | null;
  bairroResid: string | null;
  /** NOME da cidade (o que o EA guarda). */
  cidadeResid: string | null;
  ufResid: string | null;
  /** CÓDIGO da cidade no GI (de/para). NULO quando o de/para não resolve: não se inventa código. */
  codigoCidadeResid: string | null;
  /**
   * NÃO EXISTE MAIS `codigoBcoFolha` NEM `codigoBcoPagar` AQUI, e a ausência é deliberada (decisão do
   * diretor, 01/10/2026). Os dois campos do GI referenciam a CONTA PAGADORA DA EMPRESA: a chave
   * estrangeira aponta para `TB_Banco`, que não é catálogo de bancos e sim o catálogo das CONTAS
   * bancárias da empresa (tem `nrAgencia`, `nrConta`, `chequeInicial`, `contaContabil`, `valorSaldo`).
   * Quem cadastra isso é o time de folha, na tela do GI, e o EA não tem a informação (empresa +
   * finalidade da conta) para escolher qual conta é.
   *
   * O FATO QUE FECHOU A DECISÃO: o `341` que o EA mandava é o código FEBRABAN, que no GI vive em
   * `TB_Banco.numeroBanco` (40 linhas, uma por empresa/finalidade), enquanto o campo espera a CHAVE
   * INTERNA `TB_Banco.codigoBanco`. Não existe linha com `codigoBanco = 341` entre as 165, e o GI não
   * valida a FK: aceitava em silêncio e gravava uma referência pendurada.
   *
   * O que sobra do banco DO FUNCIONÁRIO são `agencia` e `contaCorrente`, abaixo, e eles continuam
   * sendo enviados. A INSTITUIÇÃO bancária do funcionário não tem campo neste DTO (nem na folha
   * oficial `TB_Funcionario`): quem a informa é o time de folha, na tela.
   */
  agencia: string | null;
  contaCorrente: string | null;
}

/**
 * O DE/PARA de código do GI, INJETADO. Traduz o que o EA guarda como TEXTO (nome da cidade) no CÓDIGO
 * que o GI espera. Materializado a partir do catálogo de municípios do GI, nunca inventado: quando não
 * há correspondência, devolve `null` e o campo de código fica vazio.
 *
 * O `codigoBanco` SAIU junto com `codigoBcoFolha`/`codigoBcoPagar`: existia só para alimentá-los, e
 * aqueles campos são a conta pagadora da EMPRESA (ver o comentário em `FuncionarioSelecao`).
 */
export interface DeParaGi {
  codigoCidade(nome: string | null | undefined, uf: string | null | undefined): string | null;
}

/** De/para VAZIO (fail-closed): todo código é nulo. É o default quando nenhum de/para foi provido. */
export const DE_PARA_GI_VAZIO: DeParaGi = {
  codigoCidade: () => null,
};

function limpo(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

/**
 * Sexo no formato do GI: 'M' ou 'F'. O EA guarda o enum `MASCULINO`/`FEMININO`; o GI quer a letra
 * única (contrato confirmado). Qualquer outra coisa vira nulo (não se chuta sexo, §A.6/qualidade).
 */
function mapearSexo(v: unknown): string | null {
  const t = (typeof v === "string" ? v : "").trim().toUpperCase();
  if (t === "MASCULINO" || t === "M") return "M";
  if (t === "FEMININO" || t === "F") return "F";
  return null;
}

/**
 * TEXTO LIVRE: corta no `maxLength` do campo do GI. Devolve `null` intacto (o schema aceita null
 * aqui), e o corte é por caractere, sem reticências: o GI valida TAMANHO, e qualquer marca de corte
 * ocuparia espaço do próprio dado.
 *
 * POR QUE CORTAR AQUI, e por que ANULAR no helper de baixo: o GI valida tamanho e **recusa o ENVIO
 * INTEIRO com HTTP 400** (medido na produção em 01/10/2026: uma sonda reprovou 18 campos de uma vez).
 * Em texto livre (nome, endereço, filiação), o final cortado ainda é o MESMO dado, só mais curto:
 * perder o final é melhor que perder a admissão (precedente do `cplEndereco`, decisão do diretor).
 */
function cortarTexto(v: string | null, max: number): string | null {
  return v != null && v.length > max ? v.slice(0, max) : v;
}

/**
 * CÓDIGO CURTO (`maxLength` de 1 a 3): atravessa SÓ quando já cabe; não cabendo, vira **NULO**, nunca
 * cortado.
 *
 * POR QUE AQUI A REGRA É OUTRA, e não o corte do helper de cima: estes campos são de TABELA FECHADA
 * do GI. Cortar não encurta o dado, INVENTA outro: "Brasileira" cortada em 3 vira "Bra", que não é a
 * nacionalidade `010`; "Casado" cortado em 1 vira "C", que o GI leria como outro código. Um código
 * errado entra silenciosamente na folha, e campo vazio é visivelmente pendente: anular é o desfecho
 * seguro. O precedente é o `mapearSexo` deste mesmo arquivo, que devolve nulo quando não reconhece.
 *
 * ⚠️ Isto TRAVA o dano, não entrega a funcionalidade: sem de/para de catálogo (não autorizado nesta
 * rodada) os campos coletados como texto livre continuam chegando NULOS ao GI.
 */
function codigoCurto(v: string | null, max: number): string | null {
  return v != null && v.length <= max ? v : null;
}

/**
 * Número do endereço no formato do GI: `nroEndereco` é `int32` NÃO-ANULÁVEL, com padrão de dígitos e
 * default `0`. Fica só a parte numérica; vazio, ausente ou sem dígito nenhum vira `0` (o default do
 * contrato), nunca `null`, que o schema não aceita.
 */
function numeroDoEndereco(v: unknown): number {
  const digitos = (typeof v === "string" ? v : "").replace(/\D/g, "");
  if (digitos.length === 0) return 0;
  const n = Number.parseInt(digitos, 10);
  return Number.isSafeInteger(n) ? n : 0;
}

/**
 * CAMPO DE PADRÃO INTEIRO do GI (`^-?(?:0|[1-9]\d*)$`): fica só a parte numérica, SEM zero à esquerda.
 * `"0012"` e `"12"` são o MESMO inteiro, então tirar o zero é ganho puro e o valor passa a casar com o
 * padrão que o contrato exige. Sem dígito nenhum: NULO (o campo é anulável; só `nroEndereco` não é, e
 * ele tem helper próprio). Todos zeros vira `"0"`, que o padrão aceita.
 *
 * ⚠️ ESTE HELPER NÃO SERVE PARA `cpf` NEM PARA `pis`: ver `documentoNumerico`, logo abaixo, onde a
 * regra é a OPOSTA.
 */
function inteiroGi(v: string | null): string | null {
  const digitos = (typeof v === "string" ? v : "").replace(/\D/g, "");
  if (digitos.length === 0) return null;
  const semZero = digitos.replace(/^0+/, "");
  return semZero.length > 0 ? semZero : "0";
}

/**
 * DOCUMENTO NUMÉRICO (`cpf`, `pis`): limpa a máscara e **PRESERVA TODOS OS DÍGITOS**, inclusive o zero
 * à esquerda.
 *
 * POR QUE AQUI A REGRA É O OPOSTO DO `inteiroGi`: em campo de contagem, `"0012"` e `"12"` são o mesmo
 * número; em DOCUMENTO, não são o mesmo documento. `"09988877766"` sem o zero é `"9988877766"`, que
 * tem 10 dígitos e é OUTRO CPF (na prática, nenhum). Tirar o zero aqui não ajustaria o formato,
 * APAGARIA um dígito do documento da pessoa.
 *
 * FATO MEDIDO (01/10/2026), para que ninguém "conserte" isto depois: o GI guarda o CPF como número de
 * PONTO FLUTUANTE, e um registro criado naquele dia voltou `99999999999.0`. O zero à esquerda se perde
 * no ARMAZENAMENTO DO FORNECEDOR, não no nosso envio, então não há nada a normalizar deste lado: o
 * máximo que o EA pode fazer é mandar os 11 dígitos íntegros, e é o que este helper garante.
 */
function documentoNumerico(v: string | null): string | null {
  const digitos = (typeof v === "string" ? v : "").replace(/\D/g, "");
  return digitos.length > 0 ? digitos : null;
}

/**
 * Separa DDD (2 primeiros dígitos) do número. O GI quer os dois separados (grupo 4).
 *
 * O ZERO DE OPERADORA É DESCARTADO ANTES DA SEPARAÇÃO. Telefone gravado como `011999990000` produzia
 * DDD `01`, que está errado por dois motivos: `01` não é DDD nenhum (o DDD é `11`), e `smsdddCel` tem
 * padrão de inteiro, que proíbe zero à esquerda. O zero inicial é prefixo de discagem, não dígito do
 * número, então ele cai aqui.
 */
function separarTelefone(telefone: unknown): { ddd: string | null; numero: string | null } {
  const digitos = (typeof telefone === "string" ? telefone : "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (digitos.length < 10) return { ddd: null, numero: digitos.length > 0 ? digitos : null };
  return { ddd: inteiroGi(digitos.slice(0, 2)), numero: digitos.slice(2) };
}

/**
 * Monta o `FuncionarioSelecao` lendo SÓ as chaves de pessoa (allowlist). Qualquer chave a mais
 * (salário, situação trabalhista, arquivo, folha) NÃO é lida e não atravessa: é o desenho, provado
 * pelo contrato do tester.
 *
 * O de/para (`depara`) traduz cidade e banco em CÓDIGO do GI; ausente, cai no `DE_PARA_GI_VAZIO` e os
 * códigos ficam NULOS (fail-closed: nunca se inventa código). Cidade e banco por NOME seguem no
 * payload em paralelo ao código.
 *
 * TAMANHO (01/10/2026): todo campo com `maxLength` no contrato sai limitado, porque o GI valida
 * tamanho e **derruba o envio inteiro com 400**. Texto livre é CORTADO (`cortarTexto`); campo de
 * código curto vira NULO quando não cabe (`codigoCurto`). As duas regras são diferentes de propósito,
 * e o porquê está em cada helper.
 *
 * NÚMERO (01/10/2026): os campos de padrão numérico do GI têm DUAS réguas OPOSTAS, e confundi-las
 * corromperia documento de pessoa:
 *  - **contagem** (`smsdddCel`, `titEleZona`, `titEleSecao`, `codigoCidadeResid`): `inteiroGi`, SEM
 *    zero à esquerda, porque `"0012"` e `"12"` são o mesmo inteiro;
 *  - **documento** (`cpf`, `pis`): `documentoNumerico`, COM o zero à esquerda, porque tirá-lo apagaria
 *    um dígito e produziria outro número.
 *
 * `nroEndereco` tem helper próprio (`numeroDoEndereco`) por ser o único numérico NÃO-anulável.
 */
export function montarFuncionarioSelecao(
  pessoa: PessoaParaGi,
  depara: DeParaGi = DE_PARA_GI_VAZIO,
): FuncionarioSelecao {
  const p = pessoa ?? {};
  const { ddd, numero } = separarTelefone(p.telefone);
  return {
    nome: cortarTexto(limpo(p.nome), 60),
    // DOCUMENTO: todos os dígitos, com o zero à esquerda. Ver `documentoNumerico`.
    cpf: documentoNumerico(limpo(p.cpf)),
    dataNascimento: limpo(p.nascimento),
    sexo: mapearSexo(p.sexo),
    email: cortarTexto(limpo(p.email), 50),
    smsdddCel: ddd,
    smsNroCel: numero,
    nacionalidade: codigoCurto(limpo(p.nacionalidade), 3),
    naturalidade: codigoCurto(limpo(p.naturalidade), 2),
    filiacaoNomeMae: cortarTexto(limpo(p.nomeMae), 70),
    filiacaoNomePai: cortarTexto(limpo(p.nomePai), 70),
    estadoCivil: codigoCurto(limpo(p.estadoCivil), 1),
    raca: codigoCurto(limpo(p.raca), 1),
    grauInstrucao: codigoCurto(limpo(p.grauInstrucao), 1),
    rg: cortarTexto(limpo(p.rg), 20),
    orgaoRG: cortarTexto(limpo(p.rgOrgao), 15),
    ufrg: codigoCurto(limpo(p.rgUf), 2),
    dtExpedicaoRG: limpo(p.rgDataEmissao),
    carteiraTrabalho: cortarTexto(limpo(p.ctpsNumero), 10),
    serie: cortarTexto(limpo(p.ctpsSerie), 7),
    ufExpedicao: codigoCurto(limpo(p.ctpsUf), 2),
    dtExpedicaoCTPS: limpo(p.ctpsData),
    // DOCUMENTO, igual ao CPF: preserva o zero à esquerda (não é campo de contagem).
    pis: documentoNumerico(limpo(p.pis)),
    tituloEleitor: cortarTexto(limpo(p.tituloNumero), 40),
    // INTEIROS (`int16`): sem zero à esquerda. `"007"` e `"7"` são a mesma zona.
    titEleZona: inteiroGi(limpo(p.tituloZona)),
    titEleSecao: inteiroGi(limpo(p.tituloSecao)),
    reservista: cortarTexto(limpo(p.reservista), 40),
    habilitacao: cortarTexto(limpo(p.cnh), 40),
    cnhDataEmissao: limpo(p.cnhDataEmissao),
    dataVectoHabilitacao: limpo(p.cnhDataValidade),
    cepResid: cortarTexto(limpo(p.cep), 9),
    enderecoResid: cortarTexto(limpo(p.logradouro), 70),
    nroEndereco: numeroDoEndereco(p.numero),
    cplEndereco: cortarTexto(limpo(p.complemento), 30),
    bairroResid: cortarTexto(limpo(p.bairro), 60),
    cidadeResid: cortarTexto(limpo(p.cidade), 60),
    ufResid: codigoCurto(limpo(p.uf), 2),
    codigoCidadeResid: inteiroGi(depara.codigoCidade(p.cidade, p.uf)),
    agencia: cortarTexto(limpo(p.agencia), 10),
    contaCorrente: cortarTexto(limpo(p.conta), 20),
  };
}

/**
 * As colunas de `candidatos` que a leitura da pessoa consome (só dado de PESSOA, §A.6). Achatado, é a
 * metade "que o EA já tem" do `PessoaParaGi`.
 */
export interface CandidatoParaGi {
  nome?: string | null;
  cpf?: string | null;
  dataNascimento?: string | null;
  sexo?: string | null;
  email?: string | null;
  telefone?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
}

/**
 * As colunas de `admissao_dados_gi` que a leitura consome (a metade coletada pelo Portal). Nomes das
 * COLUNAS do schema (`rgNumero`, `endCep`), traduzidos para o vocabulário de `PessoaParaGi`.
 */
export interface DadosGiParaPessoa {
  nacionalidade?: string | null;
  naturalidade?: string | null;
  filiacaoNomeMae?: string | null;
  filiacaoNomePai?: string | null;
  estadoCivil?: string | null;
  raca?: string | null;
  grauInstrucao?: string | null;
  rgNumero?: string | null;
  rgOrgaoEmissor?: string | null;
  rgUf?: string | null;
  rgDataEmissao?: string | null;
  ctpsNumero?: string | null;
  ctpsSerie?: string | null;
  ctpsUf?: string | null;
  ctpsData?: string | null;
  pis?: string | null;
  tituloNumero?: string | null;
  tituloZona?: string | null;
  tituloSecao?: string | null;
  reservistaNumero?: string | null;
  cnhNumero?: string | null;
  cnhDataEmissao?: string | null;
  cnhDataValidade?: string | null;
  endCep?: string | null;
  endLogradouro?: string | null;
  endNumero?: string | null;
  endComplemento?: string | null;
  endBairro?: string | null;
  endCidade?: string | null;
  endUf?: string | null;
}

/**
 * A JUNÇÃO das duas fontes num `PessoaParaGi`, função PURA (testável sem banco). `candidatos` traz o
 * que o EA já tinha (nome, cpf, nascimento, sexo, contato, banco); `admissao_dados_gi` traz o que o
 * Portal coletou (documentos, filiação, endereço). Só dado de PESSOA (§A.6): nada de salário, folha
 * ou situação trabalhista, que o time preenche na tela do GI.
 */
export function montarPessoaParaGi(
  candidato: CandidatoParaGi | null | undefined,
  dados: DadosGiParaPessoa | null | undefined,
): PessoaParaGi {
  const c = candidato ?? {};
  const d = dados ?? {};
  return {
    nome: c.nome ?? null,
    cpf: c.cpf ?? null,
    nascimento: c.dataNascimento ?? null,
    sexo: c.sexo ?? null,
    email: c.email ?? null,
    telefone: c.telefone ?? null,
    banco: c.banco ?? null,
    agencia: c.agencia ?? null,
    conta: c.conta ?? null,
    nacionalidade: d.nacionalidade ?? null,
    naturalidade: d.naturalidade ?? null,
    nomeMae: d.filiacaoNomeMae ?? null,
    nomePai: d.filiacaoNomePai ?? null,
    estadoCivil: d.estadoCivil ?? null,
    raca: d.raca ?? null,
    grauInstrucao: d.grauInstrucao ?? null,
    rg: d.rgNumero ?? null,
    rgOrgao: d.rgOrgaoEmissor ?? null,
    rgUf: d.rgUf ?? null,
    rgDataEmissao: d.rgDataEmissao ?? null,
    ctpsNumero: d.ctpsNumero ?? null,
    ctpsSerie: d.ctpsSerie ?? null,
    ctpsUf: d.ctpsUf ?? null,
    ctpsData: d.ctpsData ?? null,
    pis: d.pis ?? null,
    tituloNumero: d.tituloNumero ?? null,
    tituloZona: d.tituloZona ?? null,
    tituloSecao: d.tituloSecao ?? null,
    reservista: d.reservistaNumero ?? null,
    cnh: d.cnhNumero ?? null,
    cnhDataEmissao: d.cnhDataEmissao ?? null,
    cnhDataValidade: d.cnhDataValidade ?? null,
    cep: d.endCep ?? null,
    logradouro: d.endLogradouro ?? null,
    numero: d.endNumero ?? null,
    complemento: d.endComplemento ?? null,
    bairro: d.endBairro ?? null,
    cidade: d.endCidade ?? null,
    uf: d.endUf ?? null,
  };
}

/** As portas do gatilho, injetadas: o cliente do GI e o log. Puras, para o gatilho ser testável. */
export interface PortasGatilhoGi {
  enviarAoGi: (payload: FuncionarioSelecao) => Promise<unknown>;
  log: (mensagem: string) => void;
}

export interface ContextoGatilhoGi {
  giConfigurado: boolean;
  pessoa: PessoaParaGi;
}

/**
 * O GATILHO DO GI, INERTE E FAIL-CLOSED. Sem cliente/credencial do GI (`giConfigurado === false`),
 * NÃO chama o cliente, loga o motivo SEM PII e devolve não-enviado. O envio real é a PEÇA 3,
 * bloqueada por insumo do fornecedor: mesmo configurado, hoje o cliente ainda não existe e o gatilho
 * segue no-op (não monta payload que não vai a lugar nenhum).
 *
 * §A.6: o log é rótulo fixo, nunca a pessoa.
 */
export async function executarGatilhoGi(
  portas: PortasGatilhoGi,
  contexto: ContextoGatilhoGi,
): Promise<{ enviado: boolean }> {
  if (!contexto.giConfigurado) {
    portas.log("GI nao configurado: gatilho inerte (peca 3 pendente).");
    return { enviado: false };
  }
  // Configurado, mas o cliente da peça 3 ainda não existe: no-op, sem montar nem chamar rede.
  portas.log("GI configurado, mas o cliente da peca 3 ainda nao existe: no-op.");
  return { enviado: false };
}
