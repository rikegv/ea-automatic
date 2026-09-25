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
 * os campos do GI (`docs/GI-DADOS-DA-PESSOA-PARA-VALIDAR.md`). `codigoBcoFolha`/`codigoCidadeResid`
 * NÃO estão aqui: são de/para de código, da peça 3; aqui vai o NOME.
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
  ufCTPS: string | null;
  dtExpedicaoCTPS: string | null;
  pisNit: string | null;
  tituloEleitor: string | null;
  titEleZona: string | null;
  titEleSecao: string | null;
  reservista: string | null;
  habilitacao: string | null;
  cnhDataEmissao: string | null;
  dataVectoHabilitacao: string | null;
  cepResid: string | null;
  enderecoResid: string | null;
  numeroResid: string | null;
  complementoResid: string | null;
  bairroResid: string | null;
  /** NOME da cidade; o `codigoCidadeResid` é peça 3. */
  cidadeResid: string | null;
  ufResid: string | null;
  /** NOME do banco; o `codigoBcoFolha`/`codigoBcoPagar` é peça 3. */
  bancoNome: string | null;
  agencia: string | null;
  contaCorrente: string | null;
}

function limpo(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

/** Separa DDD (2 primeiros dígitos) do número. O GI quer os dois separados (grupo 4). */
function separarTelefone(telefone: unknown): { ddd: string | null; numero: string | null } {
  const digitos = (typeof telefone === "string" ? telefone : "").replace(/\D/g, "");
  if (digitos.length < 10) return { ddd: null, numero: digitos.length > 0 ? digitos : null };
  return { ddd: digitos.slice(0, 2), numero: digitos.slice(2) };
}

/**
 * Monta o `FuncionarioSelecao` lendo SÓ as chaves de pessoa (allowlist). Qualquer chave a mais
 * (salário, situação trabalhista, arquivo, folha) NÃO é lida e não atravessa: é o desenho, provado
 * pelo contrato do tester. Cidade e banco guardam o NOME (de/para para código é peça 3).
 */
export function montarFuncionarioSelecao(pessoa: PessoaParaGi): FuncionarioSelecao {
  const p = pessoa ?? {};
  const { ddd, numero } = separarTelefone(p.telefone);
  const cpf = limpo(p.cpf);
  return {
    nome: limpo(p.nome),
    cpf: cpf ? cpf.replace(/\D/g, "") : null,
    dataNascimento: limpo(p.nascimento),
    sexo: limpo(p.sexo),
    email: limpo(p.email),
    smsdddCel: ddd,
    smsNroCel: numero,
    nacionalidade: limpo(p.nacionalidade),
    naturalidade: limpo(p.naturalidade),
    filiacaoNomeMae: limpo(p.nomeMae),
    filiacaoNomePai: limpo(p.nomePai),
    estadoCivil: limpo(p.estadoCivil),
    raca: limpo(p.raca),
    grauInstrucao: limpo(p.grauInstrucao),
    rg: limpo(p.rg),
    orgaoRG: limpo(p.rgOrgao),
    ufrg: limpo(p.rgUf),
    dtExpedicaoRG: limpo(p.rgDataEmissao),
    carteiraTrabalho: limpo(p.ctpsNumero),
    serie: limpo(p.ctpsSerie),
    ufCTPS: limpo(p.ctpsUf),
    dtExpedicaoCTPS: limpo(p.ctpsData),
    pisNit: limpo(p.pis),
    tituloEleitor: limpo(p.tituloNumero),
    titEleZona: limpo(p.tituloZona),
    titEleSecao: limpo(p.tituloSecao),
    reservista: limpo(p.reservista),
    habilitacao: limpo(p.cnh),
    cnhDataEmissao: limpo(p.cnhDataEmissao),
    dataVectoHabilitacao: limpo(p.cnhDataValidade),
    cepResid: limpo(p.cep),
    enderecoResid: limpo(p.logradouro),
    numeroResid: limpo(p.numero),
    complementoResid: limpo(p.complemento),
    bairroResid: limpo(p.bairro),
    cidadeResid: limpo(p.cidade),
    ufResid: limpo(p.uf),
    bancoNome: limpo(p.banco),
    agencia: limpo(p.agencia),
    contaCorrente: limpo(p.conta),
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
