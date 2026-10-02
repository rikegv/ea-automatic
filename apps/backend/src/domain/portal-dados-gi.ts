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

import { tipoServicoDeContrato, type TipoServico } from "./vinculo";

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

// ── Peça 3 (INERTE): as DUAS allowlists FECHADAS e o gatilho fail-closed ────────────────────────

/**
 * ═══ O INVARIANTE DA ALLOWLIST, REESCRITO EM 01/10/2026 (autorização do diretor) ═══
 *
 * ANTES: "só dado de PESSOA atravessa para o GI; salário e situação trabalhista NUNCA".
 *
 * AGORA: **dado de PESSOA, MAIS os campos de CONTRATAÇÃO nomeados em `ContratacaoGi`, e NADA MAIS.**
 * São SETE: `salario`, `tipoSalario` (a UNIDADE do salário), `dataAdmissao`, `vinculo`, `tipoContrato`
 * (o PRAZO do GI, derivado do vínculo), `codigoEmpresa` e `codigoFilial`.
 *
 * O SÉTIMO ENTROU EM 01/10/2026, e ele é CORREÇÃO DE BLOQUEIO, não campo a mais: `tipoSalario` tem
 * `default 'M'` (Mês) no GI, e o EA tem 7 admissões VIVAS com salário de HORA (`9,34` e `10,90`). Sem
 * declarar a unidade, aquelas 7 entrariam na folha como salário MENSAL de R$ 9,34, em silêncio
 * (§A.33). Ver `tipoSalarioGi` e a recusa `GI_SALARIO_SEM_UNIDADE`.
 *
 * O QUE **NÃO** MUDOU, e é a metade que importa: as allowlists continuam **FECHADAS**. De
 * `dados_vaga_folha`, que tem dezenas de colunas, atravessa **SÓ o `salario`**: benefícios, escala,
 * centro de custo, departamento, setor, gestor BP, motivo, tempo de contrato, uniforme, EPI e **os
 * dados do SUBSTITUÍDO (nome e CPF, regra 10 do §A.3)** NÃO atravessam, e continuam sendo preenchidos
 * pelo time na tela do GI.
 *
 * SÃO **DUAS** ALLOWLISTS, E ISSO É A FECHADURA, não organização de arquivo. Uma interface só,
 * alargada, perderia a capacidade de AFIRMAR o que não atravessa. Com duas, o invariante fica DIZÍVEL e
 * testável, e a contratação entra por um **SEGUNDO parâmetro NOMEADO** de `montarFuncionarioSelecao`,
 * nunca por dentro do objeto de pessoa. Isso preserva INTACTA a garantia original, hoje provada em
 * teste, de que **uma chave a mais no objeto de PESSOA não atravessa**
 * (`portal/portal-dados-gi.contrato.tester.spec.ts`, R5). O salário tem UMA porta, e ela tem nome.
 *
 * §A.6: salário é dado sensível de outra natureza. NUNCA entra em log, em mensagem de erro nem em
 * retorno de método, em nenhum caminho. Este módulo não tem logger, de propósito.
 */

/**
 * ALLOWLIST 1: o que se conhece da PESSOA, achatado. É a UNIÃO de `candidatos` + `admissao_dados_gi`.
 * Só as chaves listadas aqui atravessam para o GI: qualquer chave a mais (salário, folha, situação
 * trabalhista, arquivo) é IGNORADA. Dado de CONTRATAÇÃO **não entra aqui**: tem tipo e parâmetro
 * próprios (`ContratacaoGi`), ver o invariante logo acima.
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
  /** SIGLA DA UF de nascimento (`naturalidade` no GI, `maxLength` 2). NÃO é a cidade. */
  naturalidade?: string | null;
  /**
   * CIDADE de nascimento (`cidadeNascimento` no GI, `maxLength` 30). Campo DIFERENTE da `naturalidade`,
   * e é dele que sai também o `codMunicipioNascto` (o código, pelo de/para). 0141.
   */
  cidadeNascimento?: string | null;
  nomeMae?: string | null;
  nomePai?: string | null;
  estadoCivil?: string | null;
  raca?: string | null;
  grauInstrucao?: string | null;
  rg?: string | null;
  rgOrgao?: string | null;
  rgUf?: string | null;
  /** Cidade de emissão do RG (`cidadeRG` no GI, `maxLength` 30). 0141. */
  rgCidade?: string | null;
  rgDataEmissao?: string | null;
  ctpsNumero?: string | null;
  ctpsSerie?: string | null;
  ctpsUf?: string | null;
  /** Cidade de expedição da CTPS (`cidadeExpedicao` no GI, `maxLength` 30). 0141. */
  ctpsCidade?: string | null;
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
 * ═══ ALLOWLIST 2: os NOVE campos de CONTRATAÇÃO, e SÓ eles ═══
 *
 * Eram SETE até 01/10/2026; a JORNADA (`qtdeHorasMes`, `qtdeHorasSem`) entrou com a 0140, autorizada
 * pelo diretor, porque sem ela o `tipoSalario = 'H'` grava horista com ZERO horas (ver `tipoSalarioGi`).
 * **`salarioHora` NÃO entrou**, e a ausência é deliberada e justificada lá, não um campo esquecido.
 *
 * TIPO PRÓPRIO, SEPARADO DE `PessoaParaGi` de propósito (ver o invariante no topo do bloco).
 *
 * ESTE TIPO JÁ FALA O VOCABULÁRIO DO GI: valores traduzidos, códigos resolvidos, números validados. A
 * tradução do lado do EA acontece antes daqui, em `montarContratacaoGi`.
 *
 * ⚠️ ACRESCENTAR CAMPO AQUI É ROMPER O INVARIANTE DO MÓDULO, não "mapear um campo a mais".
 */
export interface ContratacaoGi {
  /** `double` no GI (nullable, default `0`). Nulo aqui = NÃO RESOLVIDO, e o envio é RECUSADO. */
  salario: number | null;
  /**
   * A UNIDADE do salário: `tipoSalario` do GI, 1 caractere, **`default 'M'` (Mês)**. O EA traduz `HORA`
   * para `H` e `MENSAL` para `M`.
   *
   * TRÊS DESFECHOS, e são os SETE valores, não dois:
   *  - `M`, `D`, `Q`, `A`, `C`, `T` → **ENVIAM**. Cada um diz o período inteiro no próprio par
   *    valor+unidade, e não exige nada ao lado.
   *  - `H` → envia **se a JORNADA estiver informada**; sem ela, **RECUSA**
   *    (`GI_SALARIO_HORISTA_SEM_JORNADA`): o GI precisa de `qtdeHorasMes` e `qtdeHorasSem`, os dois com
   *    default `0`, e desde a 0140 o EA TEM as colunas para guardá-los. É pendência preenchível, não
   *    recusa perpétua. Ver `tipoSalarioGi`.
   *  - `null` (ninguém declarou) → **RECUSA** (`GI_SALARIO_SEM_UNIDADE`): cair no default do fornecedor
   *    é justamente o dano.
   *
   * O `H` SEM JORNADA ATRAVESSA ATÉ O PAYLOAD DE PROPÓSITO, mesmo recusando: é ele que permite à guarda
   * dizer o motivo CERTO ("é horista e falta a jornada") em vez do motivo errado ("ninguém declarou").
   * Quem impede o envio é a recusa encostada no `POST`, não o esvaziamento do campo, exatamente como
   * empresa e filial nulas são marca interna e nunca valor a enviar.
   */
  tipoSalario: TipoSalarioGi | null;
  /**
   * A JORNADA em horas (`qtdeHorasMes` / `qtdeHorasSem` no GI), os dois `double` com **`default 0`**.
   *
   * SÓ SÃO EXIGIDOS QUANDO A UNIDADE É `H`, e isso é recorte medido, não economia: o `H` é a única
   * unidade cujo valor **não fecha sozinho** (preço da hora sem quantidade de horas não é remuneração).
   * `M`, `D`, `Q`, `A`, `C` e `T` dizem o período inteiro no próprio par valor+unidade.
   *
   * Nulo é "não informado", **nunca `0`**: zero aqui é o default do fornecedor, que é o dano.
   *
   * ⚠️ OS DOIS, OU NENHUM. Jornada mensal preenchida ao lado de semanal zerada é contradição gravada na
   * folha. Quem exige o par é `recusaDaContratacaoGi`.
   */
  qtdeHorasMes: number | null;
  qtdeHorasSem: number | null;
  /** `date-time` no GI. "YYYY-MM-DD", que é o que uma coluna `date` entrega e o GI já aceita. */
  dataAdmissao: string | null;
  /** `vinculo` do GI: 1 caractere, tabela fechada de 18 valores. Nulo quando não se reconhece. */
  vinculo: string | null;
  /**
   * `tipoContrato` do GI: **`D` Determinado / `I` Indeterminado**, o PRAZO. DERIVADO do vínculo. Ver a
   * colisão de nome documentada em `prazoContratoGi`: ele NÃO é o nosso `admissoes.tipo_contrato`.
   */
  tipoContrato: "D" | "I" | null;
  /** `int16` OBRIGATÓRIO no GI. Nulo aqui = NÃO RESOLVIDO, e o envio é RECUSADO (nunca `0`). */
  codigoEmpresa: number | null;
  codigoFilial: number | null;
  /**
   * ═══ O CLIENTE FINAL (`codigoCliente` do GI), E ELE **NÃO** É A EMPRESA DO GRUPO ═══
   *
   * ⚠️ NÃO CONFUNDIR com `codigoEmpresa`/`codigoFilial`, logo acima: aqueles são a empresa do **Grupo
   * Soulan** que registra o vínculo (saem de `cliente_vinculos`). Este é o **CLIENTE FINAL**, o tomador,
   * aquele para quem a pessoa vai trabalhar, e sai de `admissoes.cod_cliente`.
   *
   * DE/PARA DIRETO, SEM TABELA, e isto é MEDIDO (02/10/2026, `docs/MAPA-GI-CLIENTE-E-CIDADES.md`):
   * `clientes.cod_cliente` é numérico em **244 dos 251** clientes, e **243 dos 244 casam com um
   * `codigoCliente` real do GI** (cruzado com os 7.525 distintos do catálogo de centro de custo), **99%**.
   * O único fora é `26360`, provável falso negativo da amostra (a lista do GI veio só de clientes COM
   * centro de custo). Então não há de/para a materializar: o código é o mesmo nos dois lados.
   *
   * `int32` com **`default 0`** no GI, e é esse default que obriga a recusa: **`0` não é "vazio", é
   * REFERÊNCIA A CLIENTE INEXISTENTE**, exatamente a família do registro órfão já medido em
   * empresa/filial. Nulo aqui é marca interna de "NÃO RESOLVIDO" (cliente ausente, ou `cod_cliente` não
   * numérico, que são 7 na base), e `recusaDaContratacaoGi` RECUSA com `GI_CLIENTE_NAO_RESOLVIDO`. Nunca
   * se envia `0`, e nunca se "conserta" um código de cliente por palpite.
   */
  codigoCliente: number | null;
}

/** Contratação TODA nula: o default quando não se leu contratação nenhuma. Tudo nulo = tudo recusado. */
export const CONTRATACAO_GI_VAZIA: ContratacaoGi = {
  salario: null,
  tipoSalario: null,
  qtdeHorasMes: null,
  qtdeHorasSem: null,
  dataAdmissao: null,
  vinculo: null,
  tipoContrato: null,
  codigoEmpresa: null,
  codigoFilial: null,
  codigoCliente: null,
};

/**
 * DE/PARA do `vinculo` do GI, em DOIS SALTOS, e o primeiro salto é REUSO, não tabela nova.
 *
 * SALTO 1, `admissoes.tipo_contrato` (texto livre) para `TipoServico`: é `tipoServicoDeContrato` de
 * `domain/vinculo.ts`, que JÁ EXISTE, já tem a tabela literal exaustiva das grafias medidas (`temp`,
 * `terc`, `esta`, `inter`, `apren`, `jovem aprendiz`), já normaliza igual (NFD, sem acento, minúsculas,
 * ponto final da abreviação fora) e já é fail-closed. **NÃO SE COPIA AQUELA TABELA:** duas tabelas
 * literais do mesmo dado divergem no primeiro ajuste, e a divergência seria calada.
 *
 * SALTO 2, `TipoServico` para o código do `vinculo`: é a tabela abaixo, 6 entradas, códigos conferidos
 * na `description` do contrato do GI. Declarada como `Record<TipoServico, string>` FECHADO sobre o enum:
 * tipo de serviço novo **não compila** sem decisão humana, que é exatamente o que se quer de um campo
 * que vai para a folha.
 *
 * ⚠️ NÃO SE REUSA `vinculoDaAdmissao` NEM `resolverVinculoId`: os dois devolvem `null` quando o cliente
 * tem MENOS DE DOIS vínculos ativos (a "regra de ouro" de `vinculo.ts`), de propósito, porque servem
 * para decidir se a TELA precisa perguntar o contrato. Isso é 233 de 234 clientes. Por aquele caminho
 * ~90% das resoluções viriam vazias e pareceriam "o dado não existe". Aqui a resolução é DEDICADA.
 *
 * `ESTA. FOPAG` (5 admissões) **não é pergunta aberta**: `tipoServicoDeContrato` já o deixa fora por
 * decisão registrada do diretor (fica como está, não se adivinha), e então o vínculo sai NULO.
 */
const VINCULO_GI_POR_TIPO_SERVICO: Record<TipoServico, string> = {
  TEMPORARIO: "4", // `4` Temporário (Lei 6.019): regime próprio, NÃO é CLT a prazo.
  TERCEIRO: "1", // `1` Contrato CLT.
  INTERNO: "1", // `1` Contrato CLT.
  FOPAG: "1", // `1` Contrato CLT.
  ESTAGIO: "J", // `J` Estagiário (Nova Lei 11.788/2008).
  APRENDIZ: "H", // `H` Menor Aprendiz (Lei 10.097/2000).
};

/**
 * Os 18 valores de `vinculo` do contrato do GI (`description` de `TB_FuncionarioSelecaoAPI`, copiada em
 * `docs/GI-CATALOGOS-DA-DESCRIPTION.md`). É o LIMITE EXTERNO: nada fora daqui é `vinculo` para o GI.
 */
const VINCULOS_DO_CONTRATO_GI: ReadonlySet<string> = new Set([
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "C", "D", "E", "F", "G", "H", "I", "J", "K",
]);

/**
 * ═══ REDE DE RUNTIME DO `vinculo` (achado do `tester`, 01/10/2026) ═══
 *
 * O TIPO NÃO BASTA, E AQUI ELE NÃO PROTEGE NADA: `ContratacaoGi.vinculo` é `string | null`, união
 * **ABERTA**, então `vinculo: "Temporário"` atravessaria **sem cast e sem o compilador reclamar** para um
 * campo de 1 caractere com lista fechada no GI. O `Add` do fornecedor aceita a letra em silêncio e grava
 * folha: é a família da §A.33, em que o dano é irreversível e nada falha.
 *
 * O CONJUNTO PERMITIDO É DERIVADO DA PRÓPRIA TABELA DE DE/PARA, e não recopiado, e a escolha é
 * deliberada: se fosse uma segunda lista literal (`{4, 1, J, H}`), o dia em que o diretor autorizasse o
 * `7` exigiria lembrar de dois lugares, e esquecer o segundo faria o código autorizado sair **NULO em
 * silêncio**, que é a divergência calada que esta frente inteira existe para evitar. Derivando, a tabela
 * segue sendo a ÚNICA fonte da verdade, e o conjunto dos 18 do contrato fica como limite externo (um
 * teste prova que a tabela nunca produz nada fora dele).
 *
 * É o mesmo padrão do `codigoCurto` deste arquivo: valor fora do conjunto fechado sai NULO, nunca
 * repassado. Campo vazio é visivelmente pendente; letra errada em campo de folha, não.
 */
function vinculoGiValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const emitiveis = new Set<string>(Object.values(VINCULO_GI_POR_TIPO_SERVICO));
  return emitiveis.has(v) && VINCULOS_DO_CONTRATO_GI.has(v) ? v : null;
}

/**
 * ═══ REDE DE RUNTIME DO PRAZO (`tipoContrato` do GI) ═══
 *
 * Mesmo motivo do `vinculoGiValido`: o campo do GI tem lista fechada de DOIS valores, e repasse cru
 * deixaria o nosso `tipo_contrato` por extenso ("Temporário") atravessar para o campo de PRAZO da folha,
 * que é exatamente a colisão de nome documentada em `prazoContratoGi`. Fora de `{D, I}`: NULO.
 */
function prazoGiValido(v: unknown): "D" | "I" | null {
  return v === "D" || v === "I" ? v : null;
}

/**
 * `admissoes.tipo_contrato` (texto livre) para o `vinculo` do GI. Desconhecido, vazio ou ambíguo:
 * **null**, nunca um palpite. O fail-closed é herdado do `tipoServicoDeContrato`.
 *
 * O ESPAÇO INTERNO É COLAPSADO AQUI, E NÃO NO `norm()` DE `domain/vinculo.ts`, e a escolha é de alcance
 * (§A.26): aquele `norm()` é lido pela resolução de vínculo que decide RÉGUA DOCUMENTAL de cliente, já
 * validada e em produção, e alargar a normalização dela por causa do GI mexeria em código validado para
 * resolver problema de outra frente. Nenhum dos 12 valores medidos na produção tem espaço duplo interno,
 * então aqui isto é tolerância para o que vier do Pandapé ou de uma importação nova. O resto da
 * normalização (caixa, acento, ponto final da abreviação) continua sendo a do `tipoServicoDeContrato`,
 * que é a única tabela literal do assunto.
 */
export function mapearVinculoGi(tipoContrato: string | null | undefined): string | null {
  const texto = typeof tipoContrato === "string" ? tipoContrato.replace(/\s+/g, " ") : tipoContrato;
  const tipo = tipoServicoDeContrato(texto);
  return tipo ? VINCULO_GI_POR_TIPO_SERVICO[tipo] : null;
}

/**
 * ⚠️ COLISÃO DE NOME, e ela sozinha gravaria lixo na folha sem nenhum erro aparecer ⚠️
 *
 * **O GI TEM um campo `tipoContrato`, e ele NÃO É O NOSSO.** No GI é `maxLength` 1, `D` Determinado ou
 * `I` Indeterminado, **com default `I`**: é o PRAZO. O nosso `admissoes.tipo_contrato` (Temporário,
 * Terceirizado, Estágio, Interno, Fopag, Jovem Aprendiz) é o REGIME, e no GI vira **`vinculo`**.
 *
 * POR QUE O PRAZO ENTRA NO ENVIO: o default `I` do fornecedor faz o campo ser GRAVADO de qualquer jeito.
 * Mandar `vinculo = 7` (CLT Prazo Determinado) sem o prazo gravaria "prazo determinado" com
 * "indeterminado" ao lado, contraditório e silencioso. Então o prazo é **DERIVADO DO VÍNCULO**, aqui, e
 * não coletado em lugar nenhum: assim a contradição é estruturalmente impossível, não só improvável.
 *
 * O ACOPLAMENTO, que é o invariante testado: **`1` obriga `I`**, e **`D` tem QUATRO origens**.
 *
 * ═══ RESPONDIDO PELO DIRETOR EM 01/10/2026: `D` PASSOU A TER QUATRO ORIGENS, NÃO UMA ═══
 *
 * ANTES, e estava ERRADO: `4` (Temporário), `J` (Estagiário) e `H` (Menor Aprendiz) saíam com o prazo
 * **NULO**. A redação de então dizia que nulo "preserva o comportamento de hoje", e isso é verdade
 * sobre o EA e **falso sobre a folha**: o campo tem `default 'I'` no GI, então nulo não deixa o campo
 * vazio, **faz o fornecedor gravar `I` (Indeterminado)**. Os três são contratos COM PRAZO (Lei 6.019,
 * Lei 11.788, Lei 10.097), logo o silêncio do EA produzia o prazo ERRADO para os três, calado. Não
 * decidir não era neutro: era decidir pelo default do fornecedor.
 *
 * AGORA, por decisão do diretor, a tabela está FECHADA e completa:
 *
 *     `1` Contrato CLT             → `I`
 *     `4` Temporário               → `D`   (passou a sair; antes nulo → `I` por default)
 *     `7` CLT Prazo Determinado    → `D`
 *     `J` Estagiário               → `D`   (passou a sair; antes nulo → `I` por default)
 *     `H` Menor Aprendiz           → `D`   (passou a sair; antes nulo → `I` por default)
 *
 * ⚠️ POR QUE O TESTE DO SENTIDO INVERSO MUDOU DE EXPECTATIVA, e não "quebrou": ele exigia que `D`
 * saísse **só** do `7`, porque naquele momento essa era a regra inteira. A trava que ele existe para dar
 * continua valendo e continua testada, só com a lista certa: **`D` sai de `{4, 7, J, H}` e de mais
 * nada; `I` sai só do `1`; todo outro vínculo sai NULO.** O que o teste pega é a tabela editada pela
 * metade (alguém dar `D` a um vínculo que não é desses quatro, ou trocar o prazo do `1`), e isso ele
 * segue pegando. O acoplamento `1 → I` e `7 → D` não foi tocado.
 *
 * O PRAZO SEGUE DERIVADO DO VÍNCULO, e isso é o que importa preservar: não é coletado em lugar nenhum,
 * então "vínculo a prazo determinado com prazo indeterminado ao lado" continua estruturalmente
 * impossível. `dados_vaga_folha.tempo_contrato` **não** é lido aqui.
 */
const PRAZO_DETERMINADO_POR_VINCULO: ReadonlySet<string> = new Set([
  "4", // Temporário (Lei 6.019): regime próprio, com prazo.
  "7", // CLT Prazo Determinado: o nome do vínculo já é o prazo.
  "J", // Estagiário (Lei 11.788): termo de compromisso com vigência.
  "H", // Menor Aprendiz (Lei 10.097): contrato de aprendizagem com prazo.
]);

export function prazoContratoGi(vinculo: string | null | undefined): "D" | "I" | null {
  if (vinculo === "1") return "I";
  if (typeof vinculo === "string" && PRAZO_DETERMINADO_POR_VINCULO.has(vinculo)) return "D";
  return null;
}

/**
 * SALÁRIO no formato do GI: `double` com padrão decimal. O Drizzle entrega `numeric(12,2)` como STRING
 * ("1800.00"), então sai como NÚMERO, o que dispensa discussão de zero à esquerda e de vírgula decimal.
 *
 * **AUSENTE, ZERO ou NEGATIVO vira `null`, e o chamador RECUSA o envio.** Os três são desfechos do mesmo
 * problema e nenhum pode ir para a folha: o `default` do campo é `0`, e salário zero em folha é salário
 * ERRADO, não campo vazio; e o `pattern` do GI aceita negativo (`-?`), então o negativo precisa de
 * recusa explícita, não se confia no fornecedor para barrar.
 *
 * §A.6: nada é impresso aqui, e o motivo da recusa (lá no serviço) é código fechado SEM o valor.
 * Salário em log é remuneração em log.
 */
function salarioGi(v: unknown): number | null {
  const bruto = typeof v === "number" ? v : Number((typeof v === "string" ? v.trim() : "") || NaN);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : null;
}

/**
 * ═══ A UNIDADE DO SALÁRIO, E POR QUE ELA É BLOQUEIO DE DISPARO ═══
 *
 * O VALOR SOZINHO NÃO DIZ NADA. `dados_vaga_folha.salario` é um `numeric(12,2)` sem unidade, e medido
 * na produção em 01/10/2026 há **7 admissões VIVAS com `9,34` (2) e `10,90` (5)**, que são valores de
 * HORA, mais **72 linhas abaixo de 100** na base inteira. No GI, `tipoSalario` tem **`default 'M'`
 * (Mês)**: enviar o salário sem a unidade faz aquelas 7 entrarem na folha como **salário MENSAL de
 * R$ 9,34 e R$ 10,90**, passando por todas as guardas que já existem (valor positivo, empresa e filial
 * resolvidas, par conhecido). É a família da §A.33: o fornecedor responde sucesso, o EA carimba o
 * envio, nada falha, e o erro aparece no holerite.
 *
 * ⚠️ **NUNCA SE DEDUZ A UNIDADE, E NUNCA SE CAI NO DEFAULT.** Heurística por faixa de valor está
 * VETADA (casamento aproximado sobre remuneração, erra calado nos dois sentidos: horista de R$ 120 e
 * mensalista de R$ 90 existem). E o `default 'M'` do fornecedor é o próprio dano, não um fallback: por
 * isso a ausência vira NULO aqui e **RECUSA** lá (`GI_SALARIO_SEM_UNIDADE`), encostada no `POST`.
 * Regra permanente do diretor: nenhum salário é gravado na folha sem auditoria do time, e DECLARAR a
 * unidade É esse ato de auditoria (as três colunas da 0140 são carimbadas juntas).
 *
 * ═══ SÃO AS **SETE** DO FORNECEDOR, E A VERSÃO DE DUAS ERA PIOR QUE NÃO TER COLUNA ═══
 *
 * A lista do GI tem SETE valores, conferidos na `description` de `TB_FuncionarioSelecaoAPI` em
 * 01/10/2026: `A` Aula (Professor), `C` Comissão, `D` Dia, `H` Hora, `M` Mês, `Q` Quinzenal, `T` Tarefa.
 * O rascunho desta frente oferecia **só `HORA` e `MENSAL`**, e o desfecho disso é o oposto do objetivo:
 * sem `DIA` e sem `QUINZENAL`, o diarista e o quinzenalista **não têm onde se declarar**, e diante de
 * duas opções erradas o time marca `MENSAL`. Aí o valor errado passa a carregar **um selo dizendo que
 * alguém conferiu**, e isso é pior que a ausência de selo: o selo desliga a desconfiança de quem lê
 * depois. **Escolha binária obrigatória FABRICA declaração falsa.** Com as sete, declarar a verdade é
 * sempre possível, e o selo volta a significar o que diz.
 *
 * O de/para segue sendo um `Record` FECHADO sobre a união do EA (mesmo padrão de
 * `VINCULO_GI_POR_TIPO_SERVICO`): unidade nova no banco **não compila** sem decisão humana. A diferença
 * é que agora não se espera unidade nova nenhuma, porque a lista é a do fornecedor INTEIRA.
 *
 * ═══ `H` EXIGE A JORNADA, E DESDE A 0140 ISSO É PENDÊNCIA PREENCHÍVEL, NÃO BECO ═══
 *
 * Medido no contrato: ao lado de `salario` e `tipoSalario` existem **`salarioHora`**, **`qtdeHorasMes`**
 * e **`qtdeHorasSem`**, os três `double` anuláveis **com `default 0`**. O EA emite SÓ os campos nomeados
 * nas duas allowlists, e o resto do payload assume o default do fornecedor. Então `tipoSalario = 'H'`
 * sem jornada grava um horista com **ZERO horas por mês**: troca "R$ 9,34 por mês" por "R$ 9,34 por hora
 * vezes 0 horas", que não é melhor, é outro valor errado, pela MESMA falha de `default 0` que o
 * `salarioGi` deste arquivo já recusa no valor.
 *
 * **A 0140 TROUXE A JORNADA** (`dados_vaga_folha.jornada_horas_mes` e `jornada_horas_sem`), e com ela o
 * desfecho mudou de natureza. Antes, horista auditado era recusado PARA SEMPRE, e **uma admissão que o
 * time auditou e que o sistema recusa para sempre é indistinguível de uma admissão quebrada**: não há o
 * que preencher nem o que corrigir. Agora a recusa (`GI_SALARIO_HORISTA_SEM_JORNADA`) **nomeia o que
 * falta** e se resolve informando a jornada. §A.6: o motivo continua sem carregar valor nenhum.
 *
 * ⚠️ **NÃO SE DERIVA UMA JORNADA DA OUTRA.** 44 h/semana para 220 h/mês usa o fator 30/7 e o DSR, que é
 * convenção de folha, varia por acordo coletivo, e derivar aqui seria o mesmo "casamento aproximado
 * sobre remuneração" que foi vetado para a unidade. As duas são COLETADAS, e as duas são exigidas
 * juntas: 220 h/mês ao lado de ZERO h/semana é contradição gravada na folha, não campo vazio.
 *
 * ⚠️ **`salarioHora` FICA FORA DA ALLOWLIST, e é decisão fail-closed, não esquecimento.** O contrato não
 * descreve o campo (sem `description`, só `double` default `0`), e em folha brasileira "valor hora"
 * costuma ser DERIVADO (salário ÷ horas do mês) para calcular hora extra, não insumo de cadastro. O par
 * `salario` + `tipoSalario` já diz "9,34 por hora" por inteiro; escrever o mesmo número TAMBÉM em
 * `salarioHora` seria o EA afirmando algo sobre um campo cuja semântica não mediu, e **mandar os dois
 * errado é tão ruim quanto mandar zero**. Fica com o default do fornecedor, e a conta é dele.
 * **PENDÊNCIA REGISTRADA, não resolvida:** se o time de folha confirmar que o GI lê `salarioHora` em vez
 * de `salario` para o horista, isto muda, e muda com uma linha na allowlist 2.
 */
export type SalarioUnidadeEa =
  | "AULA"
  | "COMISSAO"
  | "DIA"
  | "HORA"
  | "MENSAL"
  | "QUINZENAL"
  | "TAREFA";

/** O `tipoSalario` do GI: 1 caractere, os SETE da `description` do contrato. */
export type TipoSalarioGi = "A" | "C" | "D" | "H" | "M" | "Q" | "T";

/**
 * As unidades que o EA declara (`dados_vaga_folha.salario_unidade`), e o CHECK do banco espelha.
 *
 * ORDEM ALFABÉTICA, que é a mesma do CHECK da 0140 de propósito: a conferência entre a lista do código
 * e a do banco passa a ser leitura direta, em vez de busca.
 */
export const SALARIO_UNIDADES_EA: readonly SalarioUnidadeEa[] = [
  "AULA",
  "COMISSAO",
  "DIA",
  "HORA",
  "MENSAL",
  "QUINZENAL",
  "TAREFA",
];

/**
 * De/para da unidade do EA para o `tipoSalario` do GI. `Record` FECHADO de propósito (ver acima).
 *
 * A COLUNA GUARDA O VOCABULÁRIO DO EA, NÃO A LETRA DO FORNECEDOR, pelo mesmo motivo que
 * `admissoes.tipo_contrato` não guarda o `vinculo` do GI: letra do fornecedor no nosso banco amarra a
 * coluna ao contrato dele, e o dia em que o alfabeto mudar a coluna vira lixo sem nada falhar.
 */
const TIPO_SALARIO_GI_POR_UNIDADE: Record<SalarioUnidadeEa, TipoSalarioGi> = {
  AULA: "A", // `A` Aula (Professor)
  COMISSAO: "C", // `C` Comissao
  DIA: "D", // `D` Dia
  HORA: "H", // `H` Hora  ← a única que exige jornada junto (ver acima)
  MENSAL: "M", // `M` Mês  ← o `default` do fornecedor, e por isso o nulo não pode virar ele
  QUINZENAL: "Q", // `Q` Quinzenal
  TAREFA: "T", // `T` Tarefa
};

/**
 * `dados_vaga_folha.salario_unidade` (varchar livre, do ponto de vista do TypeScript) para o
 * `tipoSalario` do GI. Desconhecido, vazio ou ausente: **null**, nunca um palpite e nunca o default do
 * fornecedor. Normaliza só caixa e espaço de borda: a coluna tem CHECK no banco, então grafia criativa
 * aqui é sinal de que alguém escreveu por fora, e o desfecho seguro é recusar.
 */
export function tipoSalarioGi(unidade: string | null | undefined): TipoSalarioGi | null {
  const t = (typeof unidade === "string" ? unidade : "").trim().toUpperCase();
  return (TIPO_SALARIO_GI_POR_UNIDADE as Record<string, TipoSalarioGi | undefined>)[t] ?? null;
}

/**
 * ═══ REDE DE RUNTIME DA UNIDADE (mesmo padrão de `vinculoGiValido`/`prazoGiValido`) ═══
 *
 * O TIPO NÃO BASTA na fronteira do payload: um `as`, um `JSON.parse` ou uma leitura nova de banco
 * fariam `"MENSAL"` (o vocabulário do EA!) atravessar para um campo de 1 caractere, e o GI aceitaria
 * a letra `M`... ou gravaria lixo, dependendo do que ele faça com os 5 caracteres restantes. O
 * conjunto permitido é DERIVADO do de/para, nunca recopiado: unidade nova autorizada no `Record` passa
 * a ser emitível sozinha, em vez de sair NULA em silêncio por esquecimento de uma segunda lista.
 */
function tipoSalarioGiValido(v: unknown): TipoSalarioGi | null {
  const emitiveis = new Set<unknown>(Object.values(TIPO_SALARIO_GI_POR_UNIDADE));
  return emitiveis.has(v) ? (v as TipoSalarioGi) : null;
}

/**
 * ═══ REDE DE RUNTIME DA JORNADA, e ela é a MESMA régua do CHECK da 0140, de propósito ═══
 *
 * `qtdeHorasMes`/`qtdeHorasSem` são `double` no GI com **`default 0`**, e no EA a coluna é
 * `numeric(6,2)`, que o Drizzle entrega como **STRING**. Então aqui há duas conversões a errar: texto
 * que não é número, e o ZERO, que neste campo **não é "informado como zero"**, é exatamente o default do
 * fornecedor que a frente existe para não reproduzir. Os dois viram `null`, e `null` RECUSA.
 *
 * O TETO É FÍSICO, NÃO TRABALHISTA (744 = 31×24, 168 = 7×24), espelhando o CHECK do banco: jornada acima
 * do teto da CLT é legítima em regime próprio, e o que a régua precisa pegar é o 2200 digitado no lugar
 * de 220. Fail-closed em todos os degraus.
 */
export const TETO_FISICO_JORNADA = {
  /** 31 × 24: o máximo de horas que EXISTE num mês. Espelha `ck_dados_vaga_folha_jornada_horas_mes`. */
  mes: 744,
  /** 7 × 24: o máximo de horas que EXISTE numa semana. Espelha `ck_dados_vaga_folha_jornada_horas_sem`. */
  sem: 168,
} as const;

function jornadaHorasGi(v: unknown, tetoFisico: number): number | null {
  const bruto = typeof v === "number" ? v : Number((typeof v === "string" ? v.trim() : "") || NaN);
  return Number.isFinite(bruto) && bruto > 0 && bruto <= tetoFisico ? bruto : null;
}

/**
 * Um vínculo de `cliente_vinculos`, no mínimo que a resolução de empresa+filial precisa saber.
 * `empresa_codigo` e `filial` são `varchar` LIVRES no EA e `int16` no GI: validar é obrigatório.
 */
export interface VinculoEmpresaFilial {
  tipoServico: string;
  empresaCodigo?: string | null;
  filial?: string | null;
  ativo?: boolean | null;
}

/**
 * EMPRESA + FILIAL do GI, resolvidas por (`cod_cliente` + `tipo_servico`) em `cliente_vinculos`.
 *
 * ONDE O DADO ESTÁ, medido na produção em 01/10/2026: `cliente_vinculos` tem `empresa_codigo` e `filial`
 * LADO A LADO, em **244 vínculos, 243 com filial, 25 empresas, 9 filiais**, em pares numéricos pequenos
 * que casam com o `int16` do GI e com os pares REAIS do fornecedor (`1/4` em 165 clientes, `2/4` em 29,
 * `1/2` em 7, `1/5` em 5). O `clientes.empresa_grupo` NÃO serve e não é lido: é o nome por extenso, em
 * 114 de 251 clientes, e **sem filial nenhuma**.
 *
 * A CHAVE É DETERMINÍSTICA: a unique `uq_cliente_vinculo_tipo` garante UM vínculo por (cliente + tipo),
 * então não existe "pegar o primeiro da lista", que é como se escolhe a linha errada em silêncio.
 *
 * ⚠️ RESOLUÇÃO DEDICADA, SEM O ATALHO DO `< 2`: ver o aviso em `VINCULO_GI_POR_TIPO_SERVICO`.
 *
 * FAIL-CLOSED em CADA degrau: tipo irreconhecível, vínculo ausente, vínculo inativo, ou empresa/filial
 * que não casa com a régua do `int16` devolvem **null**, e o envio é RECUSADO.
 *
 * ⚠️ A RÉGUA DA EMPRESA NÃO É A DA FILIAL: empresa `0` recusa (não existe no GI), filial `0` PASSA (é
 * estabelecimento real, em todas as 47 empresas). Ver `codigoEmpresaInt16`/`codigoFilialInt16`.
 */
export function resolverEmpresaFilialGi(
  vinculos: VinculoEmpresaFilial[] | null | undefined,
  tipoContrato: string | null | undefined,
): { empresa: number; filial: number } | null {
  const tipo = tipoServicoDeContrato(tipoContrato);
  if (!tipo) return null;
  const achado = (vinculos ?? []).find((v) => v?.ativo !== false && v?.tipoServico === tipo);
  if (!achado) return null;
  const empresa = codigoEmpresaInt16(achado.empresaCodigo);
  const filial = codigoFilialInt16(achado.filial);
  if (empresa == null || filial == null) return null;
  return { empresa, filial };
}

/**
 * ⚠️ EMPRESA E FILIAL TÊM RÉGUAS DIFERENTES, e confundi-las dá FALSO NEGATIVO ⚠️
 *
 * MEDIDO em 01/10/2026 contra a lista autoritativa do GI (`Empresa/GetAll`, 127 pares), comparada com
 * os 244 vínculos do EA: **243 dos 244 casam EXATAMENTE com um par real, zero divergências.**
 *
 *  - **empresa `0` NÃO EXISTE no GI.** Nenhum dos 127 pares tem empresa 0, então `0` ali é recusa certa.
 *  - **filial `0` EXISTE, e para TODAS as 47 empresas** (`(1,0)`, `(2,0)`, `(3,0)`, ...). É
 *    ESTABELECIMENTO REAL, não placeholder. O EA tem 2 vínculos com filial 0 (`44/0` e `43/0`), e os
 *    dois casam com pares reais. Recusar filial 0 reprovaria admissão legítima.
 *  - o único vínculo problemático da base é um com `empresa_codigo = '99'` e **filial NULA**, e é esse
 *    que a régua tem de pegar.
 *
 * E É POR ISSO QUE A GUARDA NÃO OLHA O VALOR, OLHA A RESOLUÇÃO: o `0` da filial legítima é
 * INDISTINGUÍVEL do `0` que a omissão produz (o campo é `int16` sem default, omitir manda `0`). Então a
 * trava não pode ser "o valor é diferente de 0": é **"foi RESOLVIDO explicitamente a partir de
 * `cliente_vinculos`, e o par existe na lista do GI"**. Resolvido como 0 passa; não resolvido recusa.
 * Dois fatos diferentes que dão no mesmo número, e é a presença da resolução (`null` ou não) que separa.
 */

/** EMPRESA: inteiro de `int16` >= 1. `0` recusa, porque empresa 0 não existe no GI. */
function codigoEmpresaInt16(v: unknown): number | null {
  return inteiroNaFaixaInt16(v, /^[1-9]\d*$/);
}

/** FILIAL: inteiro de `int16` >= 0, **o `0` ACEITO** (é estabelecimento real). Nula ou texto recusa. */
function codigoFilialInt16(v: unknown): number | null {
  return inteiroNaFaixaInt16(v, /^(?:0|[1-9]\d*)$/);
}

/**
 * Inteiro que casa com o padrão dado e cabe em `short`. Recusa texto, vazio, sinal, zero à esquerda
 * ("04") e decimal: campo `varchar` livre do EA indo para campo tipado do fornecedor exige esta régua,
 * porque sem ela o 400 do GI derruba o envio inteiro.
 */
function inteiroNaFaixaInt16(v: unknown, padrao: RegExp): number | null {
  const t = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!padrao.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return n <= 32767 ? n : null;
}

/** O que o EA tem do lado dele, CRU, para virar uma `ContratacaoGi`. */
export interface EntradaContratacaoGi {
  /** `dados_vaga_folha.salario` (`numeric(12,2)`), que o Drizzle entrega como STRING. */
  salario?: string | number | null;
  /**
   * `dados_vaga_folha.salario_unidade` (`varchar(10)`, 0140): `HORA` ou `MENSAL`, DECLARADO pelo time.
   * Ausente ou nulo é "ninguém declarou", e o envio é RECUSADO. Ver `tipoSalarioGi`.
   */
  salarioUnidade?: string | null;
  /**
   * `dados_vaga_folha.jornada_horas_mes` / `jornada_horas_sem` (`numeric(6,2)`, 0140), que o Drizzle
   * entrega como STRING. Só importam quando a unidade é `HORA`; nas demais são repassadas se existirem
   * (jornada informada é melhor que o `default 0` do fornecedor) e a ausência não recusa.
   */
  jornadaHorasMes?: string | number | null;
  jornadaHorasSem?: string | number | null;
  /** `admissoes.data_admissao` (`date`), que o Drizzle entrega como "YYYY-MM-DD". */
  dataAdmissao?: string | null;
  /** `admissoes.tipo_contrato`, TEXTO LIVRE `varchar(60)`. */
  tipoContrato?: string | null;
  /** Os vínculos do cliente da admissão (`cliente_vinculos`), de onde saem empresa e filial. */
  vinculos?: VinculoEmpresaFilial[] | null;
  /**
   * `admissoes.cod_cliente`, a chave do CLIENTE FINAL no EA (`varchar`). Vira o `codigoCliente` (`int32`)
   * do GI DIRETO, sem de/para (99% de casamento medido). Ausente, ou não numérico, resolve para NULO e o
   * envio é RECUSADO: nunca `0`. Ver `codigoCliente` em `ContratacaoGi`.
   *
   * ⚠️ É O MESMO VALOR que `lerContratacao` já traz do banco para achar o vínculo do cliente: não se abre
   * consulta nova para isto.
   */
  codCliente?: string | number | null;
  /**
   * Os vínculos dos **OUTROS** clientes cujo `cod_cliente` tem a MESMA BASE NUMÉRICA deste (ver
   * `SUFIXO_DE_CONTRATO_NO_COD_CLIENTE`). Serve a UMA pergunta só, e é a que autoriza tirar o sufixo:
   * *"a base deste código já resolve para outro cliente no MESMO par empresa/filial?"*. Ausente ou vazio
   * é "não colide com ninguém".
   *
   * ⚠️ **NÃO ENTRA EM `resolverEmpresaFilialGi`**, e a separação é o ponto: empresa e filial continuam
   * saindo de `vinculos`, os vínculos DESTE cliente e de mais ninguém. Misturar as duas listas faria o
   * vínculo do irmão virar a empresa da admissão, que é o erro exato que este campo existe para evitar.
   * Só o código sem sufixo é afetado por ele, e só para dizer SIM ou NÃO.
   */
  vinculosDeOutrosClientesDaMesmaBase?: VinculoEmpresaFilial[] | null;
}

/**
 * Monta a `ContratacaoGi` traduzindo do vocabulário do EA para o do GI. Função PURA, testável sem banco.
 *
 * O PRAZO É DERIVADO DO VÍNCULO AQUI, e não lido de lugar nenhum: é o que torna impossível a contradição
 * "vínculo a prazo determinado com prazo indeterminado ao lado" (ver `prazoContratoGi`).
 *
 * §A.6: o salário passa por aqui e não é logado. Esta função não imprime nada, nem em erro.
 */
export function montarContratacaoGi(
  entrada: EntradaContratacaoGi | null | undefined,
): ContratacaoGi {
  const e = entrada ?? {};
  const vinculo = mapearVinculoGi(e.tipoContrato);
  const empresaFilial = resolverEmpresaFilialGi(e.vinculos, e.tipoContrato);
  return {
    salario: salarioGi(e.salario),
    // A UNIDADE é DECLARADA, nunca deduzida do valor. Não declarada: nulo, e a guarda do envio recusa.
    tipoSalario: tipoSalarioGi(e.salarioUnidade),
    // A JORNADA é INFORMADA, nunca derivada (nem uma da outra, nem da `escala`): ver `jornadaHorasGi`.
    // Zero e fora de faixa física caem para nulo, porque zero aqui É o default que faz o dano.
    qtdeHorasMes: jornadaHorasGi(e.jornadaHorasMes, TETO_FISICO_JORNADA.mes),
    qtdeHorasSem: jornadaHorasGi(e.jornadaHorasSem, TETO_FISICO_JORNADA.sem),
    dataAdmissao: limpo(e.dataAdmissao ?? null),
    vinculo,
    tipoContrato: prazoContratoGi(vinculo),
    codigoEmpresa: empresaFilial?.empresa ?? null,
    codigoFilial: empresaFilial?.filial ?? null,
    // O CLIENTE FINAL, de/para DIRETO de `admissoes.cod_cliente` (medido, 99%). `0`, vazio, não numérico
    // ou fora da faixa do `int32` caem para NULO, e a guarda do envio recusa: `0` seria referência a
    // cliente inexistente, não campo vazio.
    //
    // O SUFIXO DE CONTRATO (`51525-TEMP.`) É TIRADO **AQUI, NA SAÍDA**, e em lugar nenhum mais: ver
    // `codigoClienteGiDoCodigoDoEa`. O par empresa/filial entra na conta porque é ele que prova que
    // tirar o sufixo não funde dois clientes do outro lado.
    codigoCliente: codigoClienteGiDoCodigoDoEa(
      e.codCliente,
      empresaFilial,
      e.vinculosDeOutrosClientesDaMesmaBase,
    ),
  };
}

/**
 * CLIENTE FINAL no formato do GI: inteiro de `int32`, **>= 1**.
 *
 * A RÉGUA É A DA EMPRESA, NÃO A DA FILIAL, e a diferença é deliberada: filial `0` é estabelecimento real
 * no GI e PASSA, mas **cliente `0` é o `default` do campo**, isto é, o valor que a omissão produz. Aceitar
 * `0` aqui seria aceitar exatamente o que a guarda existe para impedir.
 *
 * RECUSA texto, vazio, sinal e decimal: `cod_cliente` é `varchar` livre no EA e o campo do outro lado é
 * tipado com `pattern`, então um valor que não casa derruba o envio INTEIRO com 400.
 *
 * ⚠️ OS 7 CÓDIGOS COM SUFIXO DE CONTRATO (`51525-TEMP.`) CAEM AQUI, e **é o chamador que os trata**:
 * `codigoClienteGiDoCodigoDoEa` tira o sufixo na saída quando a base não colide. Esta função é a régua do
 * código NUMÉRICO e continua sendo só isso, de propósito.
 *
 * ⚠️ O ZERO À ESQUERDA É **ABSORVIDO**, NÃO RECUSADO, e aqui a régua é a do `inteiroGi` e **NÃO** a do
 * `inteiroNaFaixaInt16` (que recusa `"04"` em empresa/filial). O campo do outro lado é `int32`: `"00123"`
 * e `"123"` são o MESMO cliente, então recusar por formatação reprovaria admissão LEGÍTIMA por um zero
 * que não muda o número. É o oposto de `documentoNumerico`, onde o zero é dígito do documento.
 *
 * MEDIDO na produção em 02/10/2026, para que ninguém aperte isto depois: **ZERO** dos 251 clientes e
 * **ZERO** das 3.021 admissões têm `cod_cliente` com zero à esquerda, e o maior código é `57460` (bem
 * dentro do `int32`). A tolerância é defesa contra digitação futura, não remendo de dado existente.
 *
 * O QUE CONTINUA RECUSANDO, e é o que a guarda existe para pegar: `"0"`, `"000"`, vazio e não numérico.
 * `0` é o `default` do campo no GI, isto é, o valor que a omissão produz, e ele é referência a cliente
 * INEXISTENTE. Nunca se envia `0`.
 */
function codigoClienteInt32(v: unknown): number | null {
  const t = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  // `0*[1-9]\d*`: absorve o zero à esquerda e recusa `"0"`/`"000"` (que não têm dígito significativo).
  if (!/^0*[1-9]\d*$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return n <= 2147483647 ? n : null;
}

/**
 * ═══ O SUFIXO DE CONTRATO DO `cod_cliente`, E POR QUE ELE SAI **SÓ AQUI** ═══
 *
 * **O SUFIXO É REGRA DE NEGÓCIO DO DIRETOR, NÃO SUJEIRA DE CARGA.** Na plataforma do EA, `51525` e
 * `51525-TEMP.` são **o MESMO cliente com CONTRATOS DIFERENTES**, e é o sufixo que os separa: cadastro,
 * vínculo, vaga e admissão são de um ou de outro. Então o EA **continua guardando `51525-TEMP.`
 * INTACTO**, em toda tabela e em toda tela. Quem normaliza é **o montador do envio, e mais ninguém**.
 *
 * ⚠️ **NÃO MOVA ISTO PARA O LEITOR, E MUITO MENOS PARA UMA ESCRITA.** Se alguém ler isto como
 * "normalização boba de string" e subir a função para `lerContratacao`, ou pior, para o cadastro do
 * cliente, o sufixo deixa de separar os contratos DENTRO do EA, que é a razão de ele existir. Aqui é
 * tradução de SAÍDA, igual à do vínculo e à do tipo de salário: entra o vocabulário do EA, sai o do GI.
 *
 * **POR QUE TIRAR O SUFIXO NA SAÍDA É SEGURO: QUEM SEPARA DO OUTRO LADO É A EMPRESA/FILIAL.** O
 * `codigoCliente` do GI é `int32`, então `51525-TEMP.` **não cabe** lá de jeito nenhum, e mandar o
 * código cru é o que **recusava o envio** antes desta regra. Mas o payload **já leva
 * `codigoEmpresa`/`codigoFilial`** (de `cliente_vinculos`, ver `resolverEmpresaFilialGi`), e eles caem em
 * empresas DIFERENTES para os dois cadastros. MEDIDO na produção em 02/10/2026:
 *
 * | `cod_cliente` | empresa/filial | tipo de serviço |
 * |---|---|---|
 * | `51525`       | **2/4** SOULAN ADM          | TERCEIRO   |
 * | `51525-TEMP.` | **1/4** SOULAN CONSULTORIA  | TEMPORARIO |
 *
 * Com `codigoCliente = 51525` nos dois, o GI continua recebendo DOIS envios distinguíveis, porque o par
 * empresa/filial vai no mesmo payload. O sufixo separa na plataforma; a empresa separa no GI.
 *
 * ✅ **PROVADO CONTRA O FORNECEDOR, NÃO DEDUZIDO (02/10/2026):** dois registros foram enviados com o
 * MESMO `codigoCliente` 51525 em empresas diferentes (`2/4` e `1/4`), e **o GI guardou os dois
 * separados**. A premissa não é raciocínio nosso: foi medida do outro lado.
 *
 * ═══ A RÉGUA DA COLISÃO É DERIVADA DO DADO, NÃO UMA LISTA DE EXCEÇÃO ═══
 *
 * O argumento acima **só vale enquanto o par empresa/filial de fato separar**. Quando NÃO separa, tirar o
 * sufixo fundiria dois clientes do EA num único cliente do GI, e aí o envio precisa **RECUSAR**: nenhum
 * dos dois desfechos alternativos é admissível, porque mandar o sufixo não cabe no `int32` e inventar um
 * código novo é exatamente o que o fail-closed desta frente proíbe.
 *
 * Então a régua é **"a base deste código já resolve para OUTRO cliente no MESMO par empresa/filial?"**, e
 * ela é respondida pelos vínculos (`vinculosDeOutrosClientesDaMesmaBase`), não por código escrito à mão.
 * O caso seguinte nasce coberto sem ninguém lembrar, e nenhum `cod_cliente` fica literal aqui.
 *
 * O CASO QUE A RÉGUA PEGA, medido na mesma data: **`57315` tem DUAS linhas com sufixo** (`57315-T` e
 * `57315-TEMP.`) e **as duas são `1/4` TEMPORARIO**. Sem sufixo elas ficariam idênticas em cliente,
 * empresa e filial, isto é, o GI não teria como separá-las: **as duas recusam**, por esta régua e não por
 * uma exceção nominal. (`57315` base, `2/4` TERCEIRO, segue válido e normal, porque é numérico.)
 *
 * **SEM O PAR RESOLVIDO, RECUSA.** Se empresa/filial não resolveu, não há como PROVAR que a base não
 * colide, e a prova é a condição de tirar o sufixo. Na prática isso não muda motivo de recusa nenhum:
 * `GI_SEM_EMPRESA_FILIAL` é conferido ANTES de `GI_CLIENTE_NAO_RESOLVIDO` em `recusaDaContratacaoGi`, e é
 * ele que a tela mostra. É o caso do `56702-T`, que **não tem vínculo nenhum** na base.
 *
 * **VÍNCULO INATIVO DO IRMÃO NÃO COLIDE**, pela mesma razão que ele não resolve empresa/filial em
 * `resolverEmpresaFilialGi`: um cadastro cujo vínculo está inativo **nunca chega a ser enviado**, então
 * não existe ambiguidade do outro lado para desfazer.
 *
 * O CÓDIGO NUMÉRICO NÃO PASSA POR NADA DISTO: `codigoClienteInt32` resolve e a função retorna antes. Os
 * 244 clientes numéricos da base seguem com o comportamento de sempre, linha por linha.
 */
const SUFIXO_DE_CONTRATO_NO_COD_CLIENTE = /^(0*[1-9]\d*)-\S+$/;

/**
 * A BASE NUMÉRICA de um `cod_cliente` **que tem sufixo de contrato**. `null` quando não há sufixo (o
 * código é numérico puro, ou é lixo que não começa por número significativo): assim o chamador distingue
 * "não precisa de normalização" de "normalizou".
 */
export function baseDoCodClienteComSufixo(v: unknown): number | null {
  const t = typeof v === "string" ? v.trim() : "";
  const m = SUFIXO_DE_CONTRATO_NO_COD_CLIENTE.exec(t);
  return m ? codigoClienteInt32(m[1]) : null;
}

/**
 * A BASE NUMÉRICA de QUALQUER `cod_cliente`: o próprio número quando ele é numérico puro, e a base quando
 * ele tem sufixo de contrato. É por aqui que o leitor junta os IRMÃOS de uma base (`51525` e
 * `51525-TEMP.` devolvem os dois `51525`), e a régua mora NUMA FUNÇÃO SÓ, testável sem banco: fazer esse
 * casamento em SQL colocaria uma segunda cópia da régua onde nenhum teste a executa.
 */
export function baseNumericaDoCodCliente(v: unknown): number | null {
  return codigoClienteInt32(v) ?? baseDoCodClienteComSufixo(v);
}

/**
 * O `codigoCliente` do GI a partir do `cod_cliente` do EA, **com o sufixo de contrato tirado na saída**
 * quando (e somente quando) a base não colide. Ver o bloco de `SUFIXO_DE_CONTRATO_NO_COD_CLIENTE` para o
 * porquê do sufixo existir e o porquê de ser seguro tirá-lo aqui.
 *
 * Fail-closed em todos os degraus, e **nunca `0`**: sem base válida, sem par empresa/filial resolvido, ou
 * com colisão na base, devolve `null` e `recusaDaContratacaoGi` recusa o envio.
 */
function codigoClienteGiDoCodigoDoEa(
  cod: unknown,
  par: { empresa: number; filial: number } | null,
  vinculosDeOutrosClientesDaMesmaBase: VinculoEmpresaFilial[] | null | undefined,
): number | null {
  // Caminho de SEMPRE, 244 dos 251 clientes: numérico resolve direto e nada abaixo roda.
  const direto = codigoClienteInt32(cod);
  if (direto != null) return direto;

  const base = baseDoCodClienteComSufixo(cod);
  if (base == null) return null;
  // Sem o par, não há prova de que a base não colide, e a prova é a condição de tirar o sufixo.
  if (!par) return null;

  const colide = (vinculosDeOutrosClientesDaMesmaBase ?? []).some(
    (v) =>
      v?.ativo !== false &&
      codigoEmpresaInt16(v?.empresaCodigo) === par.empresa &&
      codigoFilialInt16(v?.filial) === par.filial,
  );
  return colide ? null : base;
}

/**
 * A REDE DE RUNTIME do cliente, na fronteira do payload, no mesmo molde de `vinculoGiValido` e
 * `tipoSalarioGiValido`: uma `ContratacaoGi` montada POR FORA de `montarContratacaoGi` chegaria com
 * string, com `0` ou com decimal, e este é o único ponto por onde um valor alcança o fornecedor.
 */
function codigoClienteGiValido(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2147483647 ? v : null;
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
  /** SIGLA DA UF de nascimento (`maxLength` 2 no contrato). NÃO é a cidade: ver `cidadeNascimento`. */
  naturalidade: string | null;
  /**
   * CIDADE de nascimento (`maxLength` 30). Campo SEPARADO da `naturalidade` no contrato do GI, e
   * confirmado pela POSIÇÃO no schema (vizinho de `dataNascimento` e `sexo`), porque o contrato não traz
   * `description` nestes campos.
   */
  cidadeNascimento: string | null;
  /**
   * CÓDIGO (IBGE) do município de nascimento, `int`. DERIVADO, nunca coletado: sai do **MESMO de/para**
   * que `codigoCidadeResid` usa (`GI_DEPARA_CIDADES`), aplicado a `cidadeNascimento` + `naturalidade` (a
   * UF de nascimento). **UM de/para serve os DOIS campos de código de município.**
   *
   * ⚠️ O de/para está **VAZIO** hoje, então este campo e o `codigoCidadeResid` saem os DOIS nulos, e é
   * fail-closed por desenho: não se INVENTA código de município. Preencher o de/para liga os dois juntos.
   */
  codMunicipioNascto: string | null;
  filiacaoNomeMae: string | null;
  filiacaoNomePai: string | null;
  estadoCivil: string | null;
  raca: string | null;
  grauInstrucao: string | null;
  rg: string | null;
  orgaoRG: string | null;
  /** CIDADE de emissão do RG (`maxLength` 30). Fica entre `orgaoRG` e `ufrg` no schema, e é daí que o
   * de/para foi confirmado: o contrato não descreve o campo. NÃO é a cidade da CTPS. */
  cidadeRG: string | null;
  ufrg: string | null;
  dtExpedicaoRG: string | null;
  carteiraTrabalho: string | null;
  serie: string | null;
  /**
   * UF de expedição da CTPS. O campo do GI é `ufExpedicao`, NÃO `ufCTPS`: `ufCTPS` não existe no
   * contrato (conferido no `openapi/v1.json` do GI, 29/09/2026) e era ignorado no envio.
   */
  ufExpedicao: string | null;
  /**
   * CIDADE de expedição da **CTPS** (`maxLength` 30). O nome do campo no GI não menciona CTPS, e por isso
   * ele é o mais fácil de trocar pelo `cidadeRG`: o de/para vem da vizinhança com `ufExpedicao`, que é a
   * UF da CTPS. Mesma classe de risco da colisão já paga pelo `tipoContrato` (ver `prazoContratoGi`).
   */
  cidadeExpedicao: string | null;
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

  // ══ OS SETE CAMPOS DE CONTRATAÇÃO (allowlist 2, autorizada pelo diretor em 01/10/2026) ═════════
  // Vêm de `ContratacaoGi`, JÁ traduzidos e validados, nunca do objeto de PESSOA.

  /**
   * SALÁRIO. `double` nullable com default `0` no GI, e sai como NÚMERO. Nulo aqui NÃO é um valor a
   * enviar: é marca de "não resolvido", e `recusaDaContratacaoGi` RECUSA o envio. §A.6: campo sensível,
   * NUNCA logado.
   */
  salario: number | null;
  /**
   * A UNIDADE do salário (`H` Hora / `M` Mês). **O campo tem `default 'M'` no GI**, e é esse default que
   * faria as 7 horistas medidas (`9,34` e `10,90`) entrarem na folha como salário MENSAL.
   *
   * OS SETE PODEM SER ENVIADOS, e o `H` depende da jornada. Nulo é marca de "o time NÃO DECLAROU", e `H`
   * sem jornada é marca de "horista sem jornada": os dois são recusados por `recusaDaContratacaoGi`
   * (`GI_SALARIO_SEM_UNIDADE` e `GI_SALARIO_HORISTA_SEM_JORNADA`) IMEDIATAMENTE antes do `POST`, então
   * nenhum dos dois atravessa. Ver `tipoSalarioGi` para por que o `H` exige `qtdeHorasMes`/`qtdeHorasSem`
   * e por que isso deixou de ser recusa sem saída.
   */
  tipoSalario: TipoSalarioGi | null;
  /**
   * A JORNADA em horas (`qtdeHorasMes` / `qtdeHorasSem`), os dois `double` com **`default 0`** no GI.
   * Chegam JÁ validados por `jornadaHorasGi` (número > 0, dentro do teto físico), e o nulo é marca
   * interna de "não informado": `recusaDaContratacaoGi` o recusa quando a unidade é `H`, e nas outras
   * unidades ele simplesmente não é enviado.
   *
   * `salarioHora` NÃO ESTÁ AQUI de propósito, e o motivo está em `tipoSalarioGi`: o contrato não descreve
   * o campo, em folha brasileira "valor hora" normalmente é derivado, e escrever remuneração em campo de
   * semântica não medida é tão ruim quanto mandar zero.
   */
  qtdeHorasMes: number | null;
  qtdeHorasSem: number | null;
  /**
   * DATA DE ADMISSÃO. `date-time` nullable no GI, sem default. Sai como "YYYY-MM-DD", que é o que o
   * Drizzle entrega de uma coluna `date` e o que o GI já aceita nos outros `date-time` deste payload
   * (`dataNascimento` entra assim desde o registro real criado em 01/10/2026).
   */
  dataAdmissao: string | null;
  /**
   * VÍNCULO: 1 caractere, tabela fechada de 18 valores no GI. Vem do nosso `tipo_contrato` em dois
   * saltos, reusando `tipoServicoDeContrato` (ver `VINCULO_GI_POR_TIPO_SERVICO`). Desconhecido: NULO.
   */
  vinculo: string | null;
  /**
   * PRAZO do contrato no GI (`D`/`I`), **DERIVADO do `vinculo`**, nunca coletado. Está aqui por força de
   * INVARIANTE, não por pedido: o campo tem default `I` no fornecedor, então é gravado de todo jeito, e
   * deixá-lo de fora é que criaria a contradição silenciosa. Ver `prazoContratoGi`.
   *
   * ⚠️ NÃO É o nosso `admissoes.tipo_contrato`. Mesma palavra, outro dado.
   */
  tipoContrato: "D" | "I" | null;
  /**
   * EMPRESA e FILIAL do GI. `int16`, e no contrato os DOIS únicos campos que este payload toca **sem
   * `"null"` no `type` e sem default** (`type: ["integer","string"]`).
   *
   * AQUI SÃO `number | null`, E O NULO É MARCA INTERNA DE "NÃO RESOLVIDO", nunca um valor a enviar. Quem
   * garante que ele não chega ao fornecedor é `recusaDaContratacaoGi`, chamado pelo `EnviarParaGiService`
   * IMEDIATAMENTE antes do `POST`.
   *
   * POR QUE RECUSAR E NÃO DEIXAR OMITIR: omitir um `int16` obrigatório faz o fornecedor gravar `0`, e o
   * registro órfão que isso cria já foi medido na produção dele
   * (`docs/GI-RELEITURA-E-TESTE-RESULTADO.md`).
   *
   * ⚠️ MAS A TRAVA NÃO É "diferente de 0", É "RESOLVIDO": **filial `0` é LEGÍTIMA** no GI (existe para
   * todas as 47 empresas, e 2 vínculos do EA a usam). O `0` legítimo e o `0` da omissão são o MESMO
   * número, então quem separa os dois é a presença da resolução (`null` ou não), não o valor. Empresa
   * `0`, essa sim, não existe no GI e é recusada pelo valor.
   */
  codigoEmpresa: number | null;
  codigoFilial: number | null;
  /**
   * CLIENTE FINAL (`int32`, **default `0`**). ⚠️ NÃO é a empresa do grupo (`codigoEmpresa`/`codigoFilial`):
   * é o TOMADOR, e sai de `admissoes.cod_cliente` por de/para DIRETO (99% de casamento medido em
   * 02/10/2026, `docs/MAPA-GI-CLIENTE-E-CIDADES.md`).
   *
   * Nulo é marca interna de "NÃO RESOLVIDO" e nunca um valor a enviar: `recusaDaContratacaoGi` recusa com
   * `GI_CLIENTE_NAO_RESOLVIDO`, encostado no `POST`. **`0` nunca sai**, porque `0` não é vazio, é
   * referência a cliente inexistente, a mesma família do registro órfão já medido em empresa/filial.
   */
  codigoCliente: number | null;
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

/**
 * De/para VAZIO (fail-closed): todo código é nulo. É o default.
 *
 * O PREDICADO DO PAR DE EMPRESA/FILIAL NÃO MORA AQUI, e a ausência é deliberada. Ele chegou a ser um
 * membro opcional de `DeParaGi`, e o efeito apareceu de fora: `DeParaGi` é o contrato que o MONTADOR
 * consome, o montador não usa o predicado (quem usa é o `EnviarParaGiService`), e todo dublê de
 * de/para de CIDADE passou a ter de declarar um membro que não tem nada a ver com cidade. Outra sessão
 * rodou o gate, viu vermelho em `portal-dados-gi.montador.spec.ts` e gastou tempo descobrindo que não
 * era dela. O predicado tem tipo próprio (`ParEmpresaFilialConhecido`, com
 * `NENHUM_PAR_EMPRESA_FILIAL` como default fail-closed) e é injetado em quem o usa.
 */
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
 *
 * CONTRATAÇÃO (01/10/2026): o TERCEIRO parâmetro, `contratacao`, é a ÚNICA porta dos seis campos
 * autorizados. Ele chega JÁ traduzido e validado por `montarContratacaoGi`, então aqui não há tradução
 * nem palpite: os valores são copiados. Ausente, cai em `CONTRATACAO_GI_VAZIA` e os seis saem NULOS, que
 * é o comportamento de antes desta rodada. Nada de folha entra pelo objeto de PESSOA, e é por isso que a
 * garantia "chave a mais na pessoa não atravessa" segue inteira e segue testada.
 */
export function montarFuncionarioSelecao(
  pessoa: PessoaParaGi,
  depara: DeParaGi = DE_PARA_GI_VAZIO,
  contratacao: ContratacaoGi = CONTRATACAO_GI_VAZIA,
): FuncionarioSelecao {
  const p = pessoa ?? {};
  const c = contratacao ?? CONTRATACAO_GI_VAZIA;
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
    // AS TRÊS CIDADES SÃO **TEXTO LIVRE**, cortadas em 30 por `cortarTexto`, o mesmo helper do nome e do
    // endereço (o GI valida tamanho e derruba o envio INTEIRO com 400).
    //
    // ⚠️ **NUNCA `codigoCurto` AQUI**, e o caso que decide isso é real: "Vila Bela da Santíssima
    // Trindade" tem **32 caracteres**. Por `codigoCurto` ela chegaria ao GI como NULO, ou seja, o MESMO
    // nada de antes desta frente, calado, depois de toda a coleta ter sido construída para trazê-la.
    // Cidade é TEXTO: truncar perde o final do nome, anular perde a cidade. `codigoCurto` existe para
    // campo de CÓDIGO (`naturalidade`, `sexo`, `raca`), onde cortar INVENTARIA outro valor.
    cidadeNascimento: cortarTexto(limpo(p.cidadeNascimento), 30),
    // O CÓDIGO do município de nascimento, pelo MESMO de/para de `codigoCidadeResid`, com a UF vinda da
    // `naturalidade` (que é a UF, não a cidade). De/para vazio: NULO, nunca inventado.
    codMunicipioNascto: inteiroGi(depara.codigoCidade(p.cidadeNascimento, p.naturalidade)),
    filiacaoNomeMae: cortarTexto(limpo(p.nomeMae), 70),
    filiacaoNomePai: cortarTexto(limpo(p.nomePai), 70),
    estadoCivil: codigoCurto(limpo(p.estadoCivil), 1),
    raca: codigoCurto(limpo(p.raca), 1),
    grauInstrucao: codigoCurto(limpo(p.grauInstrucao), 1),
    rg: cortarTexto(limpo(p.rg), 20),
    orgaoRG: cortarTexto(limpo(p.rgOrgao), 15),
    cidadeRG: cortarTexto(limpo(p.rgCidade), 30),
    ufrg: codigoCurto(limpo(p.rgUf), 2),
    dtExpedicaoRG: limpo(p.rgDataEmissao),
    carteiraTrabalho: cortarTexto(limpo(p.ctpsNumero), 10),
    serie: cortarTexto(limpo(p.ctpsSerie), 7),
    ufExpedicao: codigoCurto(limpo(p.ctpsUf), 2),
    cidadeExpedicao: cortarTexto(limpo(p.ctpsCidade), 30),
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
    // ── Os NOVE campos de contratação, e SÓ eles, do SEGUNDO parâmetro NOMEADO. ──
    // As REDES DE RUNTIME (`vinculoGiValido`/`prazoGiValido`/`tipoSalarioGiValido`/`jornadaHorasGi`) ficam AQUI, na fronteira do payload,
    // e não em `montarContratacaoGi`: é este o único ponto por onde um valor chega ao fornecedor, então é
    // aqui que a lista fechada tem de ser conferida, inclusive quando a `ContratacaoGi` foi montada por
    // fora. Repasse cru deixava "Temporário" atravessar para campo de 1 caractere (§A.33).
    salario: c.salario,
    tipoSalario: tipoSalarioGiValido(c.tipoSalario),
    // A jornada repassa pela MESMA rede do montador, pelo mesmo motivo das outras três: `ContratacaoGi`
    // montada por fora chegaria com `0` (o default do fornecedor) ou com string, e aqui é a fronteira.
    qtdeHorasMes: jornadaHorasGi(c.qtdeHorasMes, TETO_FISICO_JORNADA.mes),
    qtdeHorasSem: jornadaHorasGi(c.qtdeHorasSem, TETO_FISICO_JORNADA.sem),
    dataAdmissao: c.dataAdmissao,
    vinculo: vinculoGiValido(c.vinculo),
    tipoContrato: prazoGiValido(c.tipoContrato),
    codigoEmpresa: c.codigoEmpresa,
    codigoFilial: c.codigoFilial,
    // O CLIENTE FINAL passa pela MESMA rede de runtime das outras quatro, e pelo mesmo motivo: esta é a
    // fronteira do payload, e `0`/string/decimal vindos de uma `ContratacaoGi` montada por fora viram
    // NULO aqui, para a guarda do `POST` recusar em vez de o fornecedor gravar cliente inexistente.
    codigoCliente: codigoClienteGiValido(c.codigoCliente),
  };
}

/** Códigos FECHADOS de recusa por contratação incompleta. §A.6: nunca carregam valor, só o motivo. */
export type GiRecusaContratacao =
  | "GI_SEM_EMPRESA_FILIAL"
  | "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO"
  | "GI_SALARIO_INVALIDO"
  | "GI_SALARIO_SEM_UNIDADE"
  | "GI_SALARIO_HORISTA_SEM_JORNADA"
  | "GI_CLIENTE_NAO_RESOLVIDO";

/**
 * A lista AUTORITATIVA de pares (empresa, filial) do GI, injetada. `false` = par não verificado.
 *
 * POR QUE VALIDAR O PAR, e não só os dois campos em separado: `empresa 1 / filial 37` é numericamente
 * válido nos dois campos e **não existe no fornecedor**. Checagem campo a campo não pega isso, e o
 * registro nasce apontando para um estabelecimento que não há.
 *
 * FAIL-CLOSED: sem lista configurada, NADA é par conhecido e todo envio é recusado. Nunca se envia par
 * não verificado.
 */
export type ParEmpresaFilialConhecido = (empresa: number, filial: number) => boolean;

/** Nenhum par é conhecido (fail-closed). Default quando nenhuma lista foi provida. */
export const NENHUM_PAR_EMPRESA_FILIAL: ParEmpresaFilialConhecido = () => false;

/**
 * AS DUAS GUARDAS DURAS da contratação. Devolve o código da recusa, ou `null` quando pode enviar.
 *
 * FUNÇÃO PURA de propósito: a decisão fica testável sem rede, e o `EnviarParaGiService` a chama
 * IMEDIATAMENTE antes do `POST`, que é onde o dano aconteceria e onde a guarda não pode ser contornada.
 *
 *  - `GI_SEM_EMPRESA_FILIAL`: um dos dois `int16` obrigatórios **não foi RESOLVIDO** (`null`). A régua é a
 *    PRESENÇA da resolução, não o valor: **filial `0` resolvida PASSA**, porque filial 0 é estabelecimento
 *    real em todas as 47 empresas do GI; o que não passa é filial não resolvida, que viraria `0` por
 *    omissão e daria no mesmo número querendo dizer outra coisa. Empresa `0` continua recusada por outro
 *    motivo: empresa 0 não existe no fornecedor.
 *  - `GI_PAR_EMPRESA_FILIAL_DESCONHECIDO`: os dois resolveram, mas o PAR não está na lista autoritativa
 *    do GI. `1/37` é válido campo a campo e inexistente lá.
 *  - `GI_SALARIO_INVALIDO`: salário ausente, zero ou negativo. Zero em folha é salário ERRADO, não campo
 *    vazio, e o `default 0` do campo faria o erro entrar sozinho.
 *  - `GI_SALARIO_SEM_UNIDADE`: o valor existe e é válido, e **ninguém declarou se é por HORA ou por
 *    MÊS**. É a guarda do bloqueio medido em 01/10/2026: 7 admissões VIVAS com `9,34` e `10,90`, e o
 *    `tipoSalario` do GI com `default 'M'`. Sem a declaração, aquelas 7 entram na folha como MENSAL e
 *    nada falha. **Não se deduz pela faixa do valor** (vetado) e **não se cai no default**: recusa.
 *  - `GI_SALARIO_HORISTA_SEM_JORNADA`: a unidade FOI declarada e é **HORA**, e **falta a JORNADA** em
 *    horas que o `tipoSalario = 'H'` exige do outro lado (`qtdeHorasMes` e `qtdeHorasSem`, ambos com
 *    default `0`). Enviar criaria "R$ 9,34 por hora vezes 0 horas", que é a MESMA falha de default `0`
 *    em campo de folha.
 *
 *    ⚠️ **ESTA RECUSA DEIXOU DE SER UM BECO, e é isso que o nome passou a dizer.** Até a 0140 o EA não
 *    tinha jornada em lugar nenhum, então o horista auditado era recusado PARA SEMPRE, e **uma admissão
 *    que o time auditou e que o sistema recusa para sempre é indistinguível de uma admissão quebrada**.
 *    Com as colunas `jornada_horas_mes`/`jornada_horas_sem`, a recusa é **PENDÊNCIA PREENCHÍVEL**: o
 *    código nomeia O QUE FALTA (a jornada), e informar a jornada destrava o envio. §A.6: o código
 *    continua fechado e **não carrega valor**, nem o salário nem as horas.
 *
 *    E EXIGE **AS DUAS**, mensal e semanal. Uma só, no fornecedor, grava 220 h/mês ao lado de ZERO
 *    h/semana, que é contradição, não campo vazio, e deriválas uma da outra é regra de folha (fator
 *    30/7 e DSR, variável por acordo coletivo), vetada pelo mesmo motivo que a dedução da unidade.
 *
 *    E É SÓ PARA `H`. As outras seis unidades dizem o período inteiro no próprio par valor+unidade, e
 *    exigir jornada delas seria inventar obrigação que o contrato não pede. Jornada informada numa
 *    unidade não-`H` É enviada de todo jeito: informada é sempre melhor que o `default 0`.
 *
 *  - `GI_CLIENTE_NAO_RESOLVIDO`: o **CLIENTE FINAL** (`codigoCliente`, o tomador, NÃO a empresa do grupo)
 *    não resolveu a partir de `admissoes.cod_cliente`. Ou a admissão está sem cliente (a pré-admissão do
 *    Pandapé nasce assim), ou o `cod_cliente` não resolve para um inteiro válido. Os **7 com SUFIXO DE
 *    CONTRATO** da base (`51525-TEMP.`) **não caem mais aqui por serem não numéricos**: o sufixo é tirado
 *    na saída e eles resolvem, exceto quando a base COLIDE no mesmo par empresa/filial (ver
 *    `SUFIXO_DE_CONTRATO_NO_COD_CLIENTE`), e aí esta recusa é o desfecho, de propósito. A régua é a MESMA da
 *    empresa, não a da filial: **`0` recusa**, porque `0` é o `default` do campo no GI, isto é, o valor
 *    que a omissão produz, e ele é referência a cliente INEXISTENTE. Destrava-se cadastrando/corrigindo o
 *    `cod_cliente`, nunca mandando `0`. §A.6: o código não carrega o valor.
 *
 * A ORDEM É DELIBERADA: o valor é conferido ANTES da unidade, e a unidade DECLARADA antes do insumo que
 * ela exige. Salário ausente/zero é problema do próprio número, e declarar a unidade de um número que
 * não serve não conserta nada; e distinguir "não declarou" de "declarou horista sem jornada" é o que faz
 * a tela dizer ao time a coisa certa a fazer, que são duas coisas diferentes.
 *
 * §A.6: o código é fechado e **não carrega o valor**. Salário em log é remuneração em log.
 */
export function recusaDaContratacaoGi(
  payload: FuncionarioSelecao,
  parConhecido: ParEmpresaFilialConhecido = NENHUM_PAR_EMPRESA_FILIAL,
): GiRecusaContratacao | null {
  const empresa = payload.codigoEmpresa;
  const filial = payload.codigoFilial;
  // RESOLUÇÃO, não valor: `null` é "não resolvido". Empresa tem o piso 1 a mais, porque empresa 0 não
  // existe no GI; filial 0 é legítima e passa. Segunda linha de defesa para quem monte a
  // `ContratacaoGi` por fora de `montarContratacaoGi`.
  if (!(typeof empresa === "number" && Number.isInteger(empresa) && empresa > 0)) {
    return "GI_SEM_EMPRESA_FILIAL";
  }
  if (!(typeof filial === "number" && Number.isInteger(filial) && filial >= 0)) {
    return "GI_SEM_EMPRESA_FILIAL";
  }
  if (!parConhecido(empresa, filial)) return "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO";
  if (!(typeof payload.salario === "number" && payload.salario > 0)) return "GI_SALARIO_INVALIDO";
  // A UNIDADE, e aqui a régua é PRESENÇA DA DECLARAÇÃO, igual à de empresa/filial: `M` é o default do
  // fornecedor, então "não declarado" e "declarado como mensal" produziriam o MESMO envio querendo dizer
  // coisas diferentes. Quem separa os dois é o nulo, e é por isso que ele não pode virar `M` aqui.
  //
  // ⚠️ A LISTA É DERIVADA DO DE/PARA, não recopiada aqui, e a escolha é a mesma de `vinculoGiValido`: uma
  // segunda lista literal (`H`/`M`/`D`/...) faria a unidade nova autorizada no `Record` ser recusada em
  // silêncio por esquecimento deste ponto, que é a divergência calada que a frente existe para evitar.
  if (!tipoSalarioGiValido(payload.tipoSalario)) return "GI_SALARIO_SEM_UNIDADE";
  // DECLARADO HORISTA: o `H` sem `qtdeHorasMes`/`qtdeHorasSem` grava "valor por hora vezes 0 horas" na
  // folha, pelo `default 0` dos dois campos. **AS DUAS são exigidas** (uma só grava contradição), e só
  // para o `H` (as outras seis unidades fecham o período no próprio par valor+unidade). O `H` chegou até
  // aqui de propósito: é ele que permite nomear ESTE motivo, que diz O QUE FALTA, em vez do motivo de
  // "não declarou". Desde a 0140 isso é PENDÊNCIA PREENCHÍVEL, não recusa perpétua.
  if (payload.tipoSalario === "H") {
    const mes = payload.qtdeHorasMes;
    const sem = payload.qtdeHorasSem;
    const horaValida = (v: number | null): boolean => typeof v === "number" && v > 0;
    if (!(horaValida(mes) && horaValida(sem))) return "GI_SALARIO_HORISTA_SEM_JORNADA";
  }
  // O CLIENTE FINAL vem POR ÚLTIMO de propósito: as recusas anteriores são as que o time já conhece e já
  // sabe destravar, e pôr uma nova à frente delas trocaria o motivo que a tela mostra hoje em toda
  // admissão incompleta. Régua de PRESENÇA DA RESOLUÇÃO mais piso 1, igual à da empresa: cliente `0` é o
  // default do fornecedor, não um cliente.
  if (!(typeof payload.codigoCliente === "number" && Number.isInteger(payload.codigoCliente) && payload.codigoCliente > 0)) {
    return "GI_CLIENTE_NAO_RESOLVIDO";
  }
  return null;
}

/**
 * ═══ A INVALIDAÇÃO DO SELO DO SALÁRIO, E POR QUE ELA MORA NUM LUGAR SÓ ═══
 *
 * **TODA ESCRITA EM `dados_vaga_folha.salario` ZERA `salario_unidade`, `salario_auditado_em` e
 * `salario_auditado_por`.** Autorizado pelo diretor em 01/10/2026, inclusive em código já validado.
 *
 * O QUE ISSO IMPEDE, e é o oposto exato da regra do diretor ("nenhum salário vai para a folha sem
 * auditoria do time"): sem a invalidação, o lápis troca R$ 9,34 por R$ 2.000 e o carimbo de ontem
 * continua lá. O selo passa a certificar um valor que ninguém olhou, e **a EDIÇÃO sai LAVADA pela
 * auditoria anterior**. Pior que não ter selo: o selo desliga a desconfiança de quem lê depois, e a
 * guarda do envio (`GI_SALARIO_SEM_UNIDADE`) deixa de morder justamente no caso em que deveria.
 *
 * ⚠️ **UM LUGAR SÓ, E ISSO É O PONTO, NÃO ESTILO.** A invalidação repetida à mão em N escritores é a
 * invalidação que o escritor N+1 esquece, e o esquecimento é **CALADO**: nada falha, o selo antigo
 * simplesmente permanece. Então existe esta constante, existe `comSalarioInvalidandoSelo()`, e existe um teste que
 * VARRE O FONTE (`portal-dados-gi.montador.spec.ts`) reprovando qualquer escrita de `salario` em
 * `dados_vaga_folha` que não passe por aqui. O SÉTIMO escritor nasce coberto sem ninguém lembrar.
 *
 * POR QUE NÃO UM TRIGGER DE BANCO, que seria literalmente impossível de esquecer: **não existe UM
 * trigger nas 140 migrations deste repositório**, e **não existe caminho de teste contra Postgres real**
 * (`docs/FRENTE-REGISTRADA-TESTE-POSTGRES-REAL.md`). O trigger seria a única guarda, numa convenção
 * nova, sem nenhum teste capaz de executá-la: é exatamente o padrão do incidente de 18/09/2026, em que
 * 3.680 testes verdes conviveram com a instrução central da frente sendo incapaz de rodar. Fica
 * REGISTRADO como o desenho certo para quando a frente do Postgres real existir.
 */
export const INVALIDACAO_DO_SELO_DO_SALARIO = {
  salarioUnidade: null,
  salarioAuditadoEm: null,
  salarioAuditadoPor: null,
} as const;

/**
 * O patch de `dados_vaga_folha` que grava `salario` **e derruba o selo junto**, numa expressão só.
 *
 * É A ÚNICA FORMA AUTORIZADA de escrever salário, e o teste de varredura do fonte é quem faz valer o
 * "única". Use em `insert().values()` e em `update().set()` igualmente: no INSERT o selo já nasceria
 * nulo por construção (coluna omitida), e declarar de todo jeito é deliberado, para quem lê o escritor
 * não precisar saber disso de cabeça, e para o escritor continuar correto se um dia a coluna ganhar
 * default.
 *
 * ⚠️ `salario === undefined` NÃO INVALIDA NADA, e este ramo é o que faz o lápis continuar correto. No
 * Drizzle, `undefined` em `.set()` significa **"não toque nesta coluna"** e `null` significa **"grave
 * NULL"**. O `editar` (`admissoes.service.ts`) manda `undefined` quando a edição não mexeu no salário:
 * ali **não houve escrita**, então não há selo a derrubar, e invalidar seria apagar a auditoria de quem
 * só trocou o centro de custo. É a diferença entre "o valor mudou" e "o formulário passou por aqui".
 *
 * ⚠️ **A DECLARAÇÃO DA UNIDADE NÃO PASSA POR AQUI.** Quem grava `salario_unidade` + os carimbos é o ato de
 * auditoria, e ele não escreve `salario`. Se um dia uma tela corrigir o valor E declarar a unidade no
 * mesmo gesto, o jeito certo é `{ ...comSalarioInvalidandoSelo(patch, v), salarioUnidade: u, salarioAuditadoEm: new
 * Date(), salarioAuditadoPor: autor }`, nessa ordem: o selo novo sobrescreve a invalidação, de propósito,
 * porque ali houve declaração nova de verdade.
 */
export function comSalarioInvalidandoSelo<T extends object>(
  patch: T,
  salario: string | null | undefined,
): T & PatchDeSalario {
  // Nada a invalidar quando a coluna não é tocada (ver o aviso acima). As três chaves ficam AUSENTES,
  // não nulas: ausente é "não toque", nulo seria "apague", e aqui a diferença é a auditoria de alguém.
  if (salario === undefined) return { ...patch, salario: undefined };
  return { ...patch, salario, ...INVALIDACAO_DO_SELO_DO_SALARIO };
}

/** O que `comSalarioInvalidandoSelo` acrescenta ao patch: o valor, e as três colunas do selo zeradas (ou ausentes). */
export interface PatchDeSalario {
  salario: string | null | undefined;
  salarioUnidade?: null;
  salarioAuditadoEm?: null;
  salarioAuditadoPor?: null;
}

/**
 * ══ A DECLARAÇÃO DA UNIDADE, QUE É O ATO DE AUDITORIA (OST do salário horista) ═════════════════
 *
 * Regra permanente do diretor: **nenhum salário é gravado na folha sem auditoria do time.** Quem
 * escolhe "por hora" ou "mensal" está, naquele gesto, afirmando que OLHOU o valor. Então a unidade e
 * os dois carimbos (`salario_auditado_em`, `salario_auditado_por`) são UMA COISA SÓ: não há um seletor
 * e um "conferi" separados, há um gesto e as colunas carimbadas juntas.
 *
 * ┌─ POR QUE ISTO NÃO ENTRA NO `comSalarioInvalidandoSelo`, e sim POR CIMA dele ──────────────────┐
 * │ Os dois helpers respondem perguntas opostas, e juntá-los apagaria a distinção: o primeiro trata │
 * │ da ESCRITA DO VALOR (que invalida auditoria anterior), este trata da DECLARAÇÃO (que carimba    │
 * │ auditoria nova). A composição `comDeclaracaoDaUnidadeDoSalario(comSalarioInvalidandoSelo(...))` │
 * │ é a ordem documentada: a invalidação zera, e a declaração sobrescreve DEPOIS, de propósito,     │
 * │ porque ali houve declaração de verdade no mesmo gesto. Salvar valor SEM declarar unidade cai no  │
 * │ caso de baixo (`undefined`) e o selo fica zerado, que é exatamente o desejado.                  │
 * │                                                                                               │
 * │ E a composição é o que mantém a VARREDURA DO FONTE verde sem afrouxá-la                        │
 * │ (`portal-dados-gi.montador.spec.ts`): a statement continua contendo a chamada do helper do      │
 * │ salário e continua sem `salario:` e sem `salarioAuditadoEm:` escritos à mão fora dele.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: aqui não há dado pessoal e **nenhum valor de remuneração**. A unidade é uma classificação de
 * lista fechada, a jornada é um número de horas, o autor é um id de usuário INTERNO.
 */
export interface DeclaracaoDaUnidadeDoSalario {
  salarioUnidade: string;
  /** `numeric(6,2)`: o Drizzle quer STRING na escrita. `null` LIMPA (ver a nota em `comDeclaracao…`). */
  jornadaHorasMes: string | null;
  jornadaHorasSem: string | null;
  salarioAuditadoEm: Date;
  /** `null` só nos caminhos sem usuário (ingestão automática), que nunca declaram unidade. */
  salarioAuditadoPor: string | null;
}

/** O que a declaração acrescenta ao patch. Ausente = nada declarado, nada tocado. */
export interface PatchDaDeclaracaoDaUnidade {
  salarioUnidade?: string;
  jornadaHorasMes?: string | null;
  jornadaHorasSem?: string | null;
  salarioAuditadoEm?: Date;
  salarioAuditadoPor?: string | null;
}

/** Jornada (`numeric(6,2)`) na forma canônica de ESCRITA, ou `null`. Zero é `null`: zero é o default do GI. */
function jornadaCanonica(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/** Unidade na forma canônica de comparação (a lista fechada é toda em maiúscula). */
function unidadeCanonica(v: unknown): string {
  return (typeof v === "string" ? v : "").trim().toUpperCase();
}

/**
 * A DECLARAÇÃO que este gesto produziu, ou `undefined` quando NÃO houve declaração nova.
 *
 * ⚠️ **"A UNIDADE FOI DECLARADA", NÃO "O FORMULÁRIO PASSOU POR AQUI".** É a mesma distinção que o
 * `comSalarioInvalidandoSelo` faz com `undefined`, e aqui ela é obrigatória por um motivo concreto: o
 * lápis do Gerenciador PRÉ-PREENCHE a unidade e a devolve em TODO salvamento. Carimbar a cada
 * salvamento faria a data do selo avançar sozinha e o autor virar quem só trocou o centro de custo,
 * ou seja, uma auditoria que ninguém fez com a assinatura de quem não a fez. Então:
 *  - unidade vazia/ausente            -> `undefined` (nada declarado; quem zera o selo é a escrita do valor);
 *  - unidade IGUAL à já gravada, com a MESMA jornada -> `undefined` (o carimbo anterior permanece);
 *  - qualquer diferença               -> declaração nova, com autor e data de AGORA.
 *
 * `anterior` nulo significa "sem declaração anterior conhecida" (linha nova, ou liberação, em que o
 * gesto do consultor é a própria auditoria da folha): aí qualquer unidade enviada é declaração nova.
 */
export function declaracaoDaUnidadeDoSalario(
  enviado: {
    salarioUnidade?: string | null;
    jornadaHorasMes?: string | number | null;
    jornadaHorasSem?: string | number | null;
  },
  anterior:
    | {
        salarioUnidade?: string | null;
        jornadaHorasMes?: string | number | null;
        jornadaHorasSem?: string | number | null;
      }
    | null
    | undefined,
  autorId: string | null | undefined,
  agora: Date = new Date(),
): DeclaracaoDaUnidadeDoSalario | undefined {
  const unidade = unidadeCanonica(enviado.salarioUnidade);
  if (unidade === "") return undefined;
  const mes = jornadaCanonica(enviado.jornadaHorasMes);
  const sem = jornadaCanonica(enviado.jornadaHorasSem);
  if (
    anterior &&
    unidadeCanonica(anterior.salarioUnidade) === unidade &&
    jornadaCanonica(anterior.jornadaHorasMes) === mes &&
    jornadaCanonica(anterior.jornadaHorasSem) === sem
  ) {
    return undefined;
  }
  return {
    salarioUnidade: unidade,
    jornadaHorasMes: mes,
    jornadaHorasSem: sem,
    salarioAuditadoEm: agora,
    salarioAuditadoPor: autorId ?? null,
  };
}

/**
 * Acrescenta a DECLARAÇÃO ao patch de `dados_vaga_folha`. Sem declaração, devolve o patch INTACTO.
 *
 * ⚠️ A JORNADA É ESCRITA JUNTO, inclusive como `null`, e isso é deliberado: declarar `MENSAL` sobre uma
 * linha que tinha 220 h/mês precisa LIMPAR as horas, senão fica jornada de horista pendurada numa
 * unidade mensal e o fornecedor recebe a contradição calado. A jornada é parte da declaração, não um
 * campo solto: jornada enviada sem unidade é ignorada aqui de propósito (não há declaração a carimbar).
 */
export function comDeclaracaoDaUnidadeDoSalario<T extends object>(
  patch: T,
  declaracao: DeclaracaoDaUnidadeDoSalario | undefined,
): T & PatchDaDeclaracaoDaUnidade {
  if (!declaracao) return patch;
  return { ...patch, ...declaracao };
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
  cidadeNascimento?: string | null;
  filiacaoNomeMae?: string | null;
  filiacaoNomePai?: string | null;
  estadoCivil?: string | null;
  raca?: string | null;
  grauInstrucao?: string | null;
  rgNumero?: string | null;
  rgOrgaoEmissor?: string | null;
  rgUf?: string | null;
  rgCidade?: string | null;
  rgDataEmissao?: string | null;
  ctpsNumero?: string | null;
  ctpsSerie?: string | null;
  ctpsUf?: string | null;
  ctpsCidade?: string | null;
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
    cidadeNascimento: d.cidadeNascimento ?? null,
    nomeMae: d.filiacaoNomeMae ?? null,
    nomePai: d.filiacaoNomePai ?? null,
    estadoCivil: d.estadoCivil ?? null,
    raca: d.raca ?? null,
    grauInstrucao: d.grauInstrucao ?? null,
    rg: d.rgNumero ?? null,
    rgOrgao: d.rgOrgaoEmissor ?? null,
    rgUf: d.rgUf ?? null,
    rgCidade: d.rgCidade ?? null,
    rgDataEmissao: d.rgDataEmissao ?? null,
    ctpsNumero: d.ctpsNumero ?? null,
    ctpsSerie: d.ctpsSerie ?? null,
    ctpsUf: d.ctpsUf ?? null,
    ctpsCidade: d.ctpsCidade ?? null,
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
