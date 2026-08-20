/**
 * @ea/shared-types — contratos de domínio compartilhados entre backend, frontend e ai-service.
 * Fase 0: vocabulário do domínio (CLAUDE.md §A.3) + utilitários puros. Sem dependências de runtime.
 */

// ── Papéis de acesso (RBAC) ────────────────────────────────────────────────
export const PAPEL = ["COMUM", "MASTER", "SUPER_ADMIN"] as const;
export type Papel = (typeof PAPEL)[number];

// ── Áreas do sistema (segmentação do módulo de A&S) ────────────────────────
/**
 * ÁREA é a segunda dimensão da permissão, ao lado do PAPEL, e as duas respondem perguntas
 * diferentes: o papel diz QUANTO o usuário manda, a área diz ONDE ele manda.
 *
 * O papel deixou de significar "vê tudo" e passou a significar "manda na minha área": um MASTER de
 * A&S manda no módulo de A&S e não enxerga a Admissão, e vice-versa. O SUPER_ADMIN fica ACIMA da
 * segmentação e não depende de área nenhuma, que é a mesma proteção que o bypass de menu já tinha
 * (ninguém consegue se trancar fora do próprio sistema).
 *
 * A ÁREA NUNCA CONCEDE, SÓ LIMITA. Ela é um TETO aplicado por cima da permissão de menu que já
 * existia, nunca uma fonte de acesso novo. É essa propriedade que tornou a virada segura: com todo
 * usuário em [ADM] e todo menu em [ADM], o filtro é uma identidade e ninguém perdeu nada.
 */
export const AREA = ["ADM", "AS"] as const;
export type Area = (typeof AREA)[number];

/** Rótulos de exibição das áreas (UI, §A.24 title case). */
export const AREA_LABEL: Record<Area, string> = {
  ADM: "Admissão",
  AS: "Atração E Seleção",
};

// ── Gestão de usuários (OST-EA-GESTAO-USUARIOS — restrito Master/Super Admin) ───────────────
/** Item da listagem/administração de usuários. NUNCA carrega senhaHash (§A.6). */
export interface UsuarioListItem {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
  /**
   * ÁREAS do usuário (segmentação do módulo de A&S). Lista VAZIA é um estado real e visível: é o
   * usuário sem área, que enxerga só o Início (fail-closed) e recebe a tag "Sem Área" na tabela.
   */
  areas?: Area[];
}

/** Resposta da criação/reset de usuário: a senha temporária em claro só trafega UMA vez. */
export interface CriarUsuarioResposta {
  usuario: UsuarioListItem;
  senhaTemporaria: string;
}

/** Resposta do reset de senha (Master/Super Admin). */
export interface ResetSenhaResposta {
  senhaTemporaria: string;
}

/**
 * Código de erro estável no corpo do 403 quando o usuário ainda tem senha temporária. O frontend
 * detecta este código para redirecionar à tela de troca obrigatória no primeiro acesso.
 */
export const SENHA_TEMPORARIA_CODE = "SENHA_TEMPORARIA" as const;

// ── Farol global da admissão (§A.3) ────────────────────────────────────────
// EM_ADMISSAO: status inicial (era "ATIVO"). BANCO_AGUARDAR: Auditoria=ok & Exame=apto &
// data_admissao ausente (unifica o antigo "BANCO_PAUSADA"). ADMISSAO_CONCLUIDA: todas as etapas
// concluídas + contrato assinado (flag manual até a INT-4). DECLINOU/RESCISAO mantidos.
export const FAROL_GLOBAL = [
  "EM_ADMISSAO",
  "BANCO_AGUARDAR",
  "ADMISSAO_CONCLUIDA",
  "DECLINOU",
  "RESCISAO",
  // Pré-admissão do Pandapé aguardando cliente/cargo (Liberação Admissional). Estado manual: a
  // automação do farol NÃO o sobrescreve até a liberação atribuir cliente/cargo.
  "AGUARDANDO_LIBERACAO",
  // Pré-admissão RECUSADA na Liberação (Parte 2, só Master/Super Admin). Terminal: fora de fila/KPI,
  // como o declínio. Reversível (reativar → volta a AGUARDANDO_LIBERACAO).
  "LIBERACAO_RECUSADA",
] as const;
export type FarolGlobal = (typeof FAROL_GLOBAL)[number];

/** Rótulos de exibição do farol global (UI). */
export const FAROL_GLOBAL_LABEL: Record<FarolGlobal, string> = {
  EM_ADMISSAO: "Em Admissão",
  // "Banco, Aguardar" (correção do bug de 13/08/2026): é como o Controle Gerencial já escrevia e
  // como a operação fala. O rótulo é único para as três telas dizerem a mesma coisa.
  BANCO_AGUARDAR: "Banco, Aguardar",
  ADMISSAO_CONCLUIDA: "Admissão Concluída",
  DECLINOU: "Declinou",
  RESCISAO: "Rescisão",
  AGUARDANDO_LIBERACAO: "Aguardando Liberação",
  LIBERACAO_RECUSADA: "Liberação Recusada",
};

// ── Origem da admissão (Fase 5 / INT-1) ────────────────────────────────────
// MANUAL: criada pelo wizard (F6). PANDAPE: criada pela sync do ATS (webhook/pull). Alimenta o
// badge de origem no Gerenciador/Esteira do frontend.
export const ORIGEM = ["MANUAL", "PANDAPE"] as const;
export type Origem = (typeof ORIGEM)[number];

// ── Frentes paralelas e independentes (F12 / §A.3) ─────────────────────────
export const FRENTE = ["AUDITORIA", "EXAME", "CADASTRO_CONTRATO", "INTEGRACAO"] as const;
export type Frente = (typeof FRENTE)[number];

// ── Status por frente (dados reais — §A.3) ─────────────────────────────────
export const STATUS_AUDITORIA = [
  "ANALISE_OK",
  "ANALISE_PENDENTE",
  "AGUARDA_REENVIO",
  "DECLINOU",
] as const;
export type StatusAuditoria = (typeof STATUS_AUDITORIA)[number];

/**
 * Status da frente EXAME.
 *
 * OST Onda 2: entram DOIS status novos, e nenhum deles conclui a frente. Eles descrevem a espera
 * entre o exame e o ASO, que antes era invisível (a frente ficava em "Agendado" tanto para quem tinha
 * exame amanhã quanto para quem fez o exame semana passada e não mandou o ASO):
 *  - `AGUARDANDO_ASO`: a previsão do ASO é POSTERIOR à data do exame, ou seja, a espera é esperada.
 *  - `ASO_PENDENTE`: a data e hora do exame já passaram e não há ASO anexado, ou seja, está atrasado.
 *
 * O `APTO` NÃO muda e continua sendo o único que conclui a frente e abre o gate do Cadastro (decisão
 * do diretor: "Apto - Exame Finalizado" é o APTO que já existe, não um status novo).
 */
export const STATUS_EXAME = [
  "A_AGENDAR",
  "AGENDADO",
  "AGUARDANDO_ASO",
  "ASO_PENDENTE",
  "APTO",
  "CANCELADO",
] as const;
export type StatusExame = (typeof STATUS_EXAME)[number];

/** Os dois status de espera do ASO: automáticos, derivados pelo scheduler, nunca concluem a frente. */
export const STATUS_EXAME_ESPERA_ASO = ["AGUARDANDO_ASO", "ASO_PENDENTE"] as const;

/**
 * Cadastro/Contrato tem DOIS status: "A Cadastrar" e "Cadastrado" (concluinte).
 *
 * Reorganização (decisão do diretor): `ENVIAR`/`ENVIADO` e `INTEGRACAO` eram resíduo da esteira
 * manual antiga. `ENVIAR`/`ENVIADO` nunca tiveram uma admissão sequer e saíram, porque o estado do
 * contrato hoje vive em `admissoes.clicksign_status` (INT-4), não aqui. `INTEGRACAO` virou
 * `CADASTRADO` e **trouxe o `conclui: true` junto** (migration 0026).
 *
 * O `CADASTRADO` intermediário (não concluinte, também sem uso) foi REMOVIDO e cedeu o nome ao
 * concluinte: existe UM "Cadastrado" só, e ele conclui a frente. Dois status com o mesmo rótulo e
 * sentidos diferentes seria exatamente o que a reorganização veio eliminar.
 *
 * A ORDEM importa: `ORDEM_STATUS` (domain/esteira.ts) deriva daqui e define o que é reversão.
 */
export const STATUS_CADASTRO_CONTRATO = ["A_CADASTRAR", "CADASTRADO"] as const;
export type StatusCadastroContrato = (typeof STATUS_CADASTRO_CONTRATO)[number];

/**
 * Status da frente INTEGRAÇÃO, a ÚLTIMA etapa da esteira (decisão do diretor).
 *
 * `REALIZADO` é o único concluinte, e concluir aqui é o fim do processo: a admissão sai da esteira e
 * passa a viver no Gerenciador. `DECLINOU` e `RESCISAO` são os desfechos de quem não seguiu, e usam
 * os MESMOS nomes dos faróis existentes de propósito: o diretor decidiu não criar estado novo
 * (nada de "CANCELADA"), então o desfecho da frente e o farol da admissão falam a mesma língua.
 *
 * A integração roda em PARALELO com a assinatura do contrato, e não depois dela. Por isso a
 * INTEGRACAO fica fora do gate do kit (`kitLiberado`), que segue exigindo só Auditoria, Exame e
 * Cadastro: às vezes o candidato está em integração e aproveita-se para reforçar a assinatura.
 */
export const STATUS_INTEGRACAO = [
  "A_AGENDAR",
  "AGENDADO",
  "REALIZADO",
  // DESCONSIDERADA (decisão do diretor): a pessoa concluiu o onboarding mas NÃO passou pela
  // integração. NÃO é declínio (ela foi admitida) e NÃO é realizada (a integração não aconteceu).
  // Conclui a frente, então sai da fila e conta como admissão concluída.
  "DESCONSIDERADA",
  "DECLINOU",
  "RESCISAO",
] as const;
export type StatusIntegracao = (typeof STATUS_INTEGRACAO)[number];

/** Tipo da integração agendada (decisão do diretor). */
export const TIPO_INTEGRACAO = ["ONLINE", "PRESENCIAL"] as const;
export type TipoIntegracao = (typeof TIPO_INTEGRACAO)[number];

/** Rótulos de exibição da frente INTEGRAÇÃO (§A.24: tag em Title Case). */
export const STATUS_INTEGRACAO_LABEL: Record<StatusIntegracao, string> = {
  A_AGENDAR: "A Agendar",
  AGENDADO: "Agendado",
  REALIZADO: "Realizado",
  DESCONSIDERADA: "Concluída Sem Integração",
  DECLINOU: "Declinou",
  RESCISAO: "Rescisão",
};

// ── Exigência documental na régua (cliente + cargo) ────────────────────────
export const EXIGENCIA_DOCUMENTO = ["OBRIGATORIO", "NAO_OBRIGATORIO", "FACULTATIVO"] as const;
export type ExigenciaDocumento = (typeof EXIGENCIA_DOCUMENTO)[number];

/**
 * DOCUMENTOS PADRÃO da régua documental (decisão do diretor). FONTE ÚNICA, consumida pelo botão
 * "Aplicar documentos padrão" da tela `/admin/regua`, pela aplicação em massa nos pares pendentes e
 * pelo `seed-regua-padrao.ts`. Vive aqui, e não no seed, justamente para que as três bocas não
 * possam discordar entre si.
 *
 * São `codigo` de `tipos_documento`, todos aplicados como **OBRIGATORIO**. Os demais tipos ativos do
 * catálogo ficam NAO_OBRIGATORIO, que já é o default da tela.
 *
 * O **ASO NÃO entra** (decisão do diretor): quem controla o exame é a frente EXAME (§A.16), e cobrá-lo
 * também na régua criaria exigência duplicada da mesma coisa.
 *
 * Nota herdada do seed: o RESERVISTA é OBRIGATORIO aqui, mas é **condicional na completude**, só conta
 * como pendência para candidato do sexo masculino (`regua-completude.service`).
 */
export const CODIGOS_REGUA_PADRAO = [
  "RG",
  "CPF",
  "CTPS",
  "COMPROVANTE_RESIDENCIA",
  "DADOS_BANCARIOS",
  "COMPROVANTE_ESCOLARIDADE",
  "RESERVISTA",
] as const;
export type CodigoReguaPadrao = (typeof CODIGOS_REGUA_PADRAO)[number];

// ── Não conformidades (Fase 2C) ────────────────────────────────────────────
export const NC_TIPO = ["NC1", "NC2", "NC3"] as const;
export type NcTipo = (typeof NC_TIPO)[number];

export const NC_STATUS = ["ABERTA", "RESOLVIDA"] as const;
export type NcStatus = (typeof NC_STATUS)[number];

export const NC_LIBERACAO = ["NENHUMA", "PENDENTE", "APROVADA", "REPROVADA"] as const;
export type NcLiberacao = (typeof NC_LIBERACAO)[number];

/** Rótulos curtos dos gatilhos de NC (consumidos pela tela e pelos filtros). */
export const NC_TIPO_ROTULO: Record<NcTipo, string> = {
  NC1: "Auditoria Sem Documentos",
  NC2: "Exame Sem ASO",
  NC3: "Cadastro Incompleto",
};

/** Termo de ciência fixo do aceite "apto sem ASO" (gatilho da NC2). */
export const TERMO_APTO_SEM_ASO =
  "Estou ciente que estou marcando este candidato como apto sem o ASO anexado.";

// ── Clicksign — assinatura do contrato (INT-4 / F9) ────────────────────────
// SEM_ENVELOPE: kit ainda não gerado (inicial). AGUARDANDO_ASSINATURA: envelope disparado.
// ASSINADO: document_closed (contrato arquivado no Drive). CANCELADO: reenvio por correção (§A.5).
// EXPIRADO: passou do prazo de assinatura sem fechar nem ser cancelado (o `deadline_at` que o EA
// manda no envelope). Detectado pelo tick; é estado TERMINAL de abandono, não falha de sistema.
export const CLICKSIGN_STATUS = [
  "SEM_ENVELOPE",
  "AGUARDANDO_ASSINATURA",
  "ASSINADO",
  "CANCELADO",
  "EXPIRADO",
] as const;
export type ClicksignStatus = (typeof CLICKSIGN_STATUS)[number];

/** Rótulos de exibição do status Clicksign (UI). */
export const CLICKSIGN_STATUS_LABEL: Record<ClicksignStatus, string> = {
  // §A.24: rótulo de status é TAG, então title case.
  SEM_ENVELOPE: "Sem Envelope",
  AGUARDANDO_ASSINATURA: "Aguardando Assinatura",
  ASSINADO: "Assinado",
  CANCELADO: "Cancelado",
  EXPIRADO: "Expirado",
};

// ── Fase 4 — Auditoria documental por IA (F2 / INT-3) ──────────────────────
/** Veredito da IA sobre um documento. Mapeia para estado_documento no banco (ver abaixo). */
export const AUDITORIA_STATUS = ["VALIDADO", "INCONFORME", "PENDENTE"] as const;
export type AuditoriaStatus = (typeof AUDITORIA_STATUS)[number];

/** Estado IA → estado_documento persistido (§A.3 regra 7 — só status, nunca o arquivo). */
export const AUDITORIA_PARA_ESTADO: Record<
  AuditoriaStatus,
  "ENTREGUE" | "INCONFORME" | "PENDENTE"
> = {
  VALIDADO: "ENTREGUE",
  INCONFORME: "INCONFORME",
  PENDENTE: "PENDENTE",
};

/**
 * Resultado da auditoria de UM documento. `motivo` é o veredito textual da regra — NUNCA deve
 * conter PII extraída do documento (§A.6). É o shape devolvido pelo ai-service e repassado ao front.
 */
export interface ResultadoAuditoria {
  valido: boolean;
  status: AuditoriaStatus;
  motivo: string;
  camposConferidos: string[];
  /**
   * Campos do cadastro que NÃO conferem com o documento (melhorias EAC, item 8). Só vem na auditoria
   * do comprovante bancário, e só quando o cadastro foi enviado para comparação.
   *
   * SEPARADO DO `status` DE PROPÓSITO, e é o que faz este aviso não bloquear. Divergência entre o que
   * o candidato digitou e o que está no comprovante não torna o documento inválido: o comprovante
   * pode estar perfeito e o erro ser de digitação, que é a hipótese mais provável. O documento segue
   * o veredito das regras (VALIDADO continua VALIDADO, a régua fecha) e a divergência vira AVISO,
   * fiel à regra 5 do domínio (§A.3): sinalizador marca, nunca impede.
   *
   * §A.6: RÓTULOS de campo ("agencia", "conta"), jamais os valores de qualquer um dos lados.
   */
  divergenciasCadastro?: string[];
}

/** Regra de auditoria configurável pelo admin (Master/Super Admin) por tipo de documento. */
export interface RegraAuditoria {
  id: string;
  tipoDocumentoId: string;
  descricaoRegra: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** Progresso da régua obrigatória de uma admissão (barra "X de Y"). Sem PII — só rótulos. */
export interface ProgressoRegua {
  obrigatoriosTotal: number;
  obrigatoriosEntregues: number;
  faltantes: string[];
  completa: boolean;
}

/**
 * Subpastas criadas pelo EA dentro de "{nome} — {nome_operacao}" no Drive (INT-2). O roteamento
 * por tipo de documento é resolvido pelo backend; estes são os quatro destinos fixos.
 */
export const DRIVE_SUBPASTA = ["ASO", "ADMISSAO", "BENEFICIOS", "DOCUMENTOS_PESSOAIS"] as const;
export type DriveSubpasta = (typeof DRIVE_SUBPASTA)[number];

/** Resultado do arquivamento no Drive ao fechar a régua obrigatória. */
export interface ArquivamentoDrive {
  pastaUrl: string;
  arquivados: number;
  /** Arquivos PULADOS por já estarem no destino com o mesmo conteúdo (checar antes de subir). */
  ignorados?: number;
  /** A pasta do prontuário já existia e foi reutilizada, em vez de criada agora. */
  pastaJaExistia?: boolean;
  /**
   * Ids das OUTRAS pastas do mesmo prontuário encontradas no Drive (OST da duplicação). O módulo do
   * Drive não apaga nada (§A.6), então elas voltam aqui para o EA avisar o diretor, que consolida e
   * remove à mão. Vazio é o caso normal.
   */
  duplicatas?: string[];
  /**
   * Arquivos que NÃO subiram neste lote. Uma falha por arquivo não derruba mais o arquivamento
   * inteiro: a pasta e o que subiu são preservados, o link volta, e a próxima tentativa completa o
   * resto (a checagem por md5 impede reenvio). Zero é o caso normal.
   */
  falhas?: number;
  /** Motivos distintos das falhas (ex.: "TimeoutError"), sem PII. */
  motivoFalhas?: string[];
}

/**
 * Valida um CPF brasileiro pelos dígitos verificadores (F3 — CPF é a chave de identidade).
 * Aceita com ou sem máscara. Rejeita sequências repetidas (ex.: 000.000.000-00).
 */
export function isValidCpf(input: string): boolean {
  const cpf = (input ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += digits[i] * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

/** Normaliza um CPF para 11 dígitos sem máscara (uso como chave técnica). */
export function normalizeCpf(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Benefícios que TÊM valor (§A.17 etapa 4).
 *
 * ATENÇÃO, ISTO NÃO É MAIS A FONTE DA VERDADE (OST cadastro de benefícios por tela). A régua passou
 * a ser a COLUNA `beneficios_catalogo.exige_valor`, mantida pela tela `/admin/beneficios` e servida
 * às telas pelo `/catalogos/beneficios`. Esta lista fica como FALLBACK, para nome legado que nunca
 * passou pelo backfill (migration 0040) e para o texto achatado das 2.188 admissões importadas, que
 * não têm linha no catálogo.
 *
 * Por que ela saiu do comando: casava por TEXTO DO NOME, então benefício novo nascia sem exigir
 * valor (e só deploy corrigia) e RENOMEAR um benefício mudava a exigência em silêncio.
 *
 * A lista original é do diretor: VR, VA, AM, Cesta básica, PLR e Auxílio creche. Os demais do
 * catálogo (VT, Assistência Odontológica, Seguro de vida, Refeição no local) não têm valor.
 */
const BENEFICIOS_COM_VALOR = [
  "VR", // VR (Vale-Refeição)
  "VA", // VA (Vale-Alimentação)
  "AM", // AM (Assistência Médica)
  "CESTA BASICA",
  "PLR", // Participação nos lucros (PLR)
  "AUXILIO CRECHE",
] as const;

/** Maiúsculas e sem acento: o catálogo é editável e o nome chega com acento ("Auxílio creche"). */
function normalizarNomeBeneficio(nome: string): string {
  return (nome ?? "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * O benefício exige valor? Casa por PREFIXO ("VR (Vale-Refeição)", "Cesta básica") ou pelo código
 * entre parênteses ("Participação nos lucros (PLR)").
 *
 * O código entre parênteses existe porque casar só por prefixo NÃO funciona: "Participação nos
 * lucros (PLR)" não começa com "PLR". Era o furo da regra antiga, que só olhava prefixo.
 */
export function beneficioExigeValor(nome: string): boolean {
  const n = normalizarNomeBeneficio(nome);
  return BENEFICIOS_COM_VALOR.some((chave) => n.startsWith(chave) || n.includes(`(${chave})`));
}

// ── Uniforme e EPI (OST Onda 3, item 1) ────────────────────────────────────
/**
 * TAMANHOS E ITENS SÃO CATÁLOGO FECHADO, e vivem aqui por um motivo: a tela de Liberação escolhe e
 * o backend valida com as MESMAS listas. Nada é digitável (decisão do diretor), então uma lista
 * copiada no frontend seria a porta para gravar tamanho que o backend recusa, ou aceitar tamanho que
 * a tela nunca ofereceu.
 */

/** Camiseta: só alfabético. */
export const TAMANHOS_CAMISETA = ["P", "M", "G", "GG", "G1", "G2", "G3", "G4"] as const;

/** Numéricos 34 a 50, usados por calça e bota. */
const TAMANHOS_NUMERICOS = Array.from({ length: 17 }, (_, i) => String(34 + i));

/**
 * Calça: alfabético E numérico na MESMA lista (decisão do diretor). São três campos no total
 * (camiseta, calça, bota), e a calça é o único que aceita as duas formas, porque o fornecedor de
 * uniforme trabalha com as duas.
 */
export const TAMANHOS_CALCA = [...TAMANHOS_CAMISETA, ...TAMANHOS_NUMERICOS] as readonly string[];

/** Bota: só numérico. */
export const TAMANHOS_BOTA = TAMANHOS_NUMERICOS as readonly string[];

/** Itens de EPI selecionáveis. "OUTROS" é o único que abre campo de digitação. */
export const ITENS_EPI = ["CAPACETE", "LUVA", "OCULOS", "OUTROS"] as const;
export type ItemEpi = (typeof ITENS_EPI)[number];

/** Rótulo de tela de cada item de EPI (§A.24: tag em title case). */
export const ROTULO_ITEM_EPI: Record<ItemEpi, string> = {
  CAPACETE: "Capacete",
  LUVA: "Luva",
  OCULOS: "Óculos",
  OUTROS: "Outros",
};

/** Teto do texto livre do "Outros" do EPI. Espelhado na coluna do banco. */
export const EPI_OUTROS_MAX = 200;

export function ehTamanhoCamiseta(v: string): boolean {
  return (TAMANHOS_CAMISETA as readonly string[]).includes(v);
}
export function ehTamanhoCalca(v: string): boolean {
  return TAMANHOS_CALCA.includes(v);
}
export function ehTamanhoBota(v: string): boolean {
  return TAMANHOS_BOTA.includes(v);
}
export function ehItemEpi(v: string): v is ItemEpi {
  return (ITENS_EPI as readonly string[]).includes(v);
}

// ── Relatório exportável de candidatos (melhorias EAC, item 11c) ────────────
/**
 * O CATÁLOGO DE COLUNAS DO RELATÓRIO, ÚNICO PARA OS DOIS LADOS.
 *
 * O consultor marca o que quer levar e o arquivo sai só com o marcado. A lista mora aqui, e não em
 * cada app, porque ela é ao mesmo tempo o que a tela desenha e o que o backend aceita: com duas
 * cópias, uma coluna marcada na tela sairia em branco na planilha (ou seria recusada) no primeiro
 * ajuste feito de um lado só.
 *
 * §A.6 (minimização): BANCO, AGÊNCIA e CONTA do candidato e o CPF do substituído ficam DE FORA de
 * propósito. O schema marca esses campos como exibíveis só na ficha da própria admissão, nunca em
 * superfície coletiva, e um relatório baixável é a superfície coletiva por definição. Decisão
 * confirmada pelo diretor ao abrir o item 11c.
 */
export const GRUPOS_COLUNA_RELATORIO = ["CANDIDATO", "ADMISSAO", "FOLHA"] as const;
export type GrupoColunaRelatorio = (typeof GRUPOS_COLUNA_RELATORIO)[number];

/** Rótulo do grupo no seletor de colunas (§A.24: título em title case). */
export const ROTULO_GRUPO_COLUNA_RELATORIO: Record<GrupoColunaRelatorio, string> = {
  CANDIDATO: "Dados Do Candidato",
  ADMISSAO: "Dados Da Admissão",
  FOLHA: "Dados De Vaga E Folha",
};

export interface ColunaRelatorio {
  /** Chave técnica: o que a tela envia e o backend valida. */
  chave: string;
  /** Cabeçalho da coluna na planilha e rótulo da caixa de seleção. */
  rotulo: string;
  grupo: GrupoColunaRelatorio;
  /** Largura da coluna no xlsx, em caracteres. */
  largura: number;
}

export const COLUNAS_RELATORIO: readonly ColunaRelatorio[] = [
  { chave: "nome", rotulo: "Nome", grupo: "CANDIDATO", largura: 32 },
  { chave: "cpf", rotulo: "CPF", grupo: "CANDIDATO", largura: 14 },
  { chave: "telefone", rotulo: "Telefone", grupo: "CANDIDATO", largura: 16 },
  { chave: "email", rotulo: "E-mail", grupo: "CANDIDATO", largura: 28 },
  { chave: "dataNascimento", rotulo: "Data De Nascimento", grupo: "CANDIDATO", largura: 18 },
  { chave: "sexo", rotulo: "Sexo", grupo: "CANDIDATO", largura: 12 },
  { chave: "codCliente", rotulo: "Código Do Cliente", grupo: "ADMISSAO", largura: 16 },
  { chave: "cliente", rotulo: "Cliente", grupo: "ADMISSAO", largura: 30 },
  { chave: "cargo", rotulo: "Cargo", grupo: "ADMISSAO", largura: 26 },
  { chave: "tipoContrato", rotulo: "Tipo De Contrato", grupo: "ADMISSAO", largura: 18 },
  { chave: "matricula", rotulo: "Matrícula", grupo: "ADMISSAO", largura: 14 },
  { chave: "dataAdmissao", rotulo: "Data De Admissão", grupo: "ADMISSAO", largura: 18 },
  { chave: "status", rotulo: "Status", grupo: "ADMISSAO", largura: 20 },
  { chave: "origem", rotulo: "Origem", grupo: "ADMISSAO", largura: 12 },
  { chave: "criadoEm", rotulo: "Criada Em", grupo: "ADMISSAO", largura: 18 },
  { chave: "salario", rotulo: "Salário", grupo: "FOLHA", largura: 14 },
  { chave: "beneficios", rotulo: "Benefícios", grupo: "FOLHA", largura: 30 },
  { chave: "escala", rotulo: "Escala", grupo: "FOLHA", largura: 24 },
  { chave: "setor", rotulo: "Setor", grupo: "FOLHA", largura: 20 },
  { chave: "departamento", rotulo: "Departamento", grupo: "FOLHA", largura: 22 },
  { chave: "centroCusto", rotulo: "Centro De Custo", grupo: "FOLHA", largura: 18 },
  { chave: "gestorBp", rotulo: "Gestor BP", grupo: "FOLHA", largura: 24 },
  { chave: "motivo", rotulo: "Motivo Da Contratação", grupo: "FOLHA", largura: 24 },
  { chave: "tempoContrato", rotulo: "Tempo De Contrato", grupo: "FOLHA", largura: 18 },
  { chave: "endereco", rotulo: "Endereço", grupo: "FOLHA", largura: 40 },
];

/** As colunas já marcadas quando o consultor abre o seletor (o pedido original do item 11c). */
export const COLUNAS_RELATORIO_PADRAO: readonly string[] = ["nome", "telefone"];

export function ehColunaRelatorio(chave: string): boolean {
  return COLUNAS_RELATORIO.some((c) => c.chave === chave);
}

/**
 * Filtra o que veio da tela contra o catálogo e devolve na ORDEM CANÔNICA (a do catálogo), sem
 * repetição. A ordem das colunas do arquivo não depende, então, da ordem em que as caixas foram
 * marcadas: duas exportações do mesmo conjunto saem sempre iguais.
 */
export function normalizarColunasRelatorio(pedidas: readonly string[]): string[] {
  const querida = new Set(pedidas);
  return COLUNAS_RELATORIO.filter((c) => querida.has(c.chave)).map((c) => c.chave);
}
