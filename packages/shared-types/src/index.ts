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
   * PAPEL DE A&S (frente 1, 22/08): CONSULTOR ou RECRUITER. `null` para quem não trabalha em A&S,
   * que é o estado de todo mundo que já estava cadastrado antes deste campo existir.
   */
  papelAs?: PapelAs | null;
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
 *
 * OST "Liberado Para Cadastro Sem ASO": entra um TERCEIRO status que não conclui, e ele é diferente
 * dos dois de espera. Os dois descrevem a espera; este DESTRAVA o avanço no meio dela, porque o
 * cliente precisa da pessoa trabalhando antes de o ASO ficar pronto. A admissão anda até o fim da
 * trilha (Cadastro, Integração, kit e assinatura) e CONTINUA na fila do Exame até o ASO subir.
 *
 * Quem enxerga esse "liberado" é o GATE (`podeAbrirCadastro`), NÃO o bit `concluida`: o bit responde
 * também "saiu da fila?" e "a frente terminou?", e a resposta a essas duas continua sendo não.
 *
 * A POSIÇÃO NO ARRAY É A ORDEM OPERACIONAL, e ela define o que é reversão (`ORDEM_STATUS`): entre
 * ASO_PENDENTE e APTO, porque liberar é o último degrau antes do apto, e voltar dali é recuo.
 */
export const STATUS_EXAME = [
  "A_AGENDAR",
  "AGENDADO",
  "AGUARDANDO_ASO",
  "ASO_PENDENTE",
  "LIBERADO_SEM_ASO",
  "APTO",
  "CANCELADO",
] as const;
export type StatusExame = (typeof STATUS_EXAME)[number];

/** Os dois status de espera do ASO: automáticos, derivados pelo scheduler, nunca concluem a frente. */
export const STATUS_EXAME_ESPERA_ASO = ["AGUARDANDO_ASO", "ASO_PENDENTE"] as const;

/**
 * O status que LIBERA O AVANÇO sem concluir o Exame (OST "Liberado Para Cadastro Sem ASO").
 *
 * Constante e não literal solta: ele é lido pelo gate, pela trava da data, pela blindagem do
 * scheduler, pela whitelist do ASO e pela expressão de admissão concluída. Cinco lugares com a mesma
 * string escrita à mão divergiriam no primeiro rename.
 */
export const STATUS_EXAME_LIBERADO_SEM_ASO = "LIBERADO_SEM_ASO";

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
/**
 * TIPO DE MARCAÇÃO DE PONTO do cliente (frente iFractal). O cliente escolhe, e TODA admissão dele
 * herda: é atributo do contrato com o cliente, não da pessoa.
 *
 * NASCE `APLICATIVO` PARA TODOS, e isso é decisão do diretor, não default preguiçoso: o aplicativo é
 * o caso majoritário, e o time ajusta depois a minoria que usa cartão ou biometria. Coluna NOT NULL
 * com default, então nenhum cliente existente fica sem resposta nem exige backfill à parte.
 */
export const TIPO_MARCACAO = ["CARTAO", "BIOMETRIA", "RECONHECIMENTO_FACIAL", "APLICATIVO"] as const;
export type TipoMarcacao = (typeof TIPO_MARCACAO)[number];

/** §A.24: é tag, então title case. */
export const TIPO_MARCACAO_LABEL: Record<TipoMarcacao, string> = {
  CARTAO: "Cartão",
  BIOMETRIA: "Biometria",
  RECONHECIMENTO_FACIAL: "Reconhecimento Facial",
  APLICATIVO: "Aplicativo",
};

/**
 * OS STATUS DE NASCIMENTO DA FRENTE IFRACTAL, e SÓ de nascimento.
 *
 * LEIA ISTO ANTES DE USAR: ao contrário das outras quatro frentes, o iFractal tem catálogo de status
 * **GERENCIÁVEL** (decisão do diretor). O time renomeia, acrescenta e escolhe qual status conclui a
 * frente, pela tela do menu gerencial. A FONTE DA VERDADE É A TABELA `frente_status_catalogo`, e
 * esta lista é consumida UMA vez, no seed, e nunca mais.
 *
 * É por isso que `ORDEM_STATUS.IFRACTAL` fica VAZIO no domínio: nenhuma régua de código deve fingir
 * que sabe a lista de uma frente cuja lista o usuário edita.
 */
export const STATUS_IFRACTAL_SEMENTE = [
  { codigo: "NAO_CADASTRADO", rotulo: "Não Cadastrado", ordem: 1, conclui: false },
  { codigo: "CADASTRADO", rotulo: "Cadastrado", ordem: 2, conclui: false },
  { codigo: "PENDENTE_DE_ENVIO", rotulo: "Pendente De Envio", ordem: 3, conclui: false },
  { codigo: "FINALIZADO", rotulo: "Finalizado", ordem: 4, conclui: true },
] as const;

/** O status em que toda frente iFractal nasce. Renomeável na tela; o CÓDIGO é que é estável. */
export const STATUS_IFRACTAL_INICIAL = "NAO_CADASTRADO";

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
  /**
   * Ids dos arquivos CRIADOS nesta chamada, na ordem em que subiram. Serve a quem precisa do link do
   * ARQUIVO (a coleta de VT grava a URL para a tela de Benefícios abrir o formulário), e não só o da
   * pasta. Arquivo ignorado por já estar no destino NÃO entra: ele não foi criado agora.
   *
   * Por que o id vem do upload e não de uma busca por nome depois: a mesma pessoa pode ter DOIS
   * arquivos de mesmo nome na mesma pasta (o candidato reenvia o formulário), e a busca não saberia
   * qual dos dois é o desta vez.
   */
  arquivosIds?: string[];
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
 * §A.6 (minimização): BANCO, AGÊNCIA e CONTA do candidato e o CPF do substituído continuam DE FORA
 * de propósito, e a decisão foi REAFIRMADA pelo diretor ao abrir todos os demais campos. O schema
 * marca esses quatro como exibíveis só na ficha da própria admissão, nunca em superfície coletiva,
 * e um relatório baixável é a superfície coletiva por definição. Todo o resto do que está cadastrado
 * é marcável; o PII que já saía (CPF do candidato, e-mail, telefone, nascimento) sai exatamente
 * como saía, sem afrouxar nada.
 */
export const GRUPOS_COLUNA_RELATORIO = [
  "CANDIDATO",
  "ADMISSAO",
  "FOLHA",
  "UNIFORME",
  "SUBSTITUICAO",
  "CLIENTE",
  "VINCULO",
  "BENEFICIOS",
  "FRENTES",
  "EXAME",
  "INTEGRACAO",
  "ASSINATURA",
  "CONTROLE",
  "VT",
  "IFRACTAL",
] as const;
export type GrupoColunaRelatorio = (typeof GRUPOS_COLUNA_RELATORIO)[number];

/** Rótulo do grupo no seletor de colunas (§A.24: título em title case). */
export const ROTULO_GRUPO_COLUNA_RELATORIO: Record<GrupoColunaRelatorio, string> = {
  CANDIDATO: "Dados Do Candidato",
  ADMISSAO: "Dados Da Admissão",
  FOLHA: "Dados De Vaga E Folha",
  UNIFORME: "Uniforme E EPI",
  SUBSTITUICAO: "Substituição",
  CLIENTE: "Empresa E Cliente",
  VINCULO: "Vínculo E Entidade Soulan",
  BENEFICIOS: "Benefícios",
  FRENTES: "Frentes Da Esteira",
  EXAME: "Exame",
  INTEGRACAO: "Integração",
  ASSINATURA: "Assinatura",
  CONTROLE: "Controle Da Admissão",
  VT: "Formulário De VT",
  IFRACTAL: "iFractal",
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
  // ── Candidato ──────────────────────────────────────────────────────────────
  { chave: "nome", rotulo: "Nome", grupo: "CANDIDATO", largura: 32 },
  { chave: "cpf", rotulo: "CPF", grupo: "CANDIDATO", largura: 14 },
  { chave: "telefone", rotulo: "Telefone", grupo: "CANDIDATO", largura: 16 },
  { chave: "email", rotulo: "E-mail", grupo: "CANDIDATO", largura: 28 },
  { chave: "dataNascimento", rotulo: "Data De Nascimento", grupo: "CANDIDATO", largura: 18 },
  { chave: "sexo", rotulo: "Sexo", grupo: "CANDIDATO", largura: 12 },
  // ── Admissão ───────────────────────────────────────────────────────────────
  { chave: "codCliente", rotulo: "Código Do Cliente", grupo: "ADMISSAO", largura: 16 },
  { chave: "cliente", rotulo: "Cliente", grupo: "ADMISSAO", largura: 30 },
  { chave: "cargo", rotulo: "Cargo", grupo: "ADMISSAO", largura: 26 },
  { chave: "tipoContrato", rotulo: "Tipo De Contrato", grupo: "ADMISSAO", largura: 18 },
  { chave: "matricula", rotulo: "Matrícula", grupo: "ADMISSAO", largura: 14 },
  { chave: "dataAdmissao", rotulo: "Data De Admissão", grupo: "ADMISSAO", largura: 18 },
  { chave: "status", rotulo: "Status", grupo: "ADMISSAO", largura: 20 },
  { chave: "origem", rotulo: "Origem", grupo: "ADMISSAO", largura: 12 },
  { chave: "criadoEm", rotulo: "Criada Em", grupo: "ADMISSAO", largura: 18 },
  // ── Vaga e folha ───────────────────────────────────────────────────────────
  { chave: "salario", rotulo: "Salário", grupo: "FOLHA", largura: 14 },
  // A coluna "Benefícios" passou a ler o PACOTE ESTRUTURADO (`admissao_beneficio`), o mesmo que a
  // tela de Benefícios usa, com o valor de cada um. Antes ela levava o TEXTO LIVRE legado, que é
  // outro campo: o benefício real da pessoa nunca tinha saído no relatório. O texto legado
  // continua marcável na sua própria coluna (`beneficiosTextoLivre`), então nada se perdeu, e a
  // admissão importada, que só tem o texto, cai nele automaticamente.
  { chave: "beneficios", rotulo: "Benefícios", grupo: "FOLHA", largura: 40 },
  { chave: "escala", rotulo: "Escala", grupo: "FOLHA", largura: 24 },
  { chave: "setor", rotulo: "Setor", grupo: "FOLHA", largura: 20 },
  { chave: "departamento", rotulo: "Departamento", grupo: "FOLHA", largura: 22 },
  { chave: "centroCusto", rotulo: "Centro De Custo", grupo: "FOLHA", largura: 18 },
  { chave: "gestorBp", rotulo: "Gestor BP", grupo: "FOLHA", largura: 24 },
  { chave: "motivo", rotulo: "Motivo Da Contratação", grupo: "FOLHA", largura: 24 },
  { chave: "tempoContrato", rotulo: "Tempo De Contrato", grupo: "FOLHA", largura: 18 },
  { chave: "endereco", rotulo: "Endereço", grupo: "FOLHA", largura: 40 },
  // ── Uniforme e EPI ─────────────────────────────────────────────────────────
  { chave: "possuiUniforme", rotulo: "Possui Uniforme", grupo: "UNIFORME", largura: 16 },
  { chave: "uniformeCamiseta", rotulo: "Tamanho De Camiseta", grupo: "UNIFORME", largura: 20 },
  { chave: "uniformeCalca", rotulo: "Tamanho De Calça", grupo: "UNIFORME", largura: 18 },
  { chave: "uniformeBota", rotulo: "Tamanho De Bota", grupo: "UNIFORME", largura: 18 },
  { chave: "possuiEpi", rotulo: "Possui EPI", grupo: "UNIFORME", largura: 14 },
  { chave: "epiItens", rotulo: "Itens De EPI", grupo: "UNIFORME", largura: 28 },
  { chave: "epiOutros", rotulo: "EPI Outros", grupo: "UNIFORME", largura: 24 },
  // ── Substituição ───────────────────────────────────────────────────────────
  // O CPF do substituído NÃO entra (decisão do diretor, mantida): §A.3 regra 10, retenção mínima
  // com expurgo automático em 48h. Só o nome e a data prevista do expurgo.
  { chave: "substituidoNome", rotulo: "Nome Do Substituído", grupo: "SUBSTITUICAO", largura: 30 },
  {
    chave: "substituicaoExpurgarEm",
    rotulo: "Expurgo Do CPF Previsto Para",
    grupo: "SUBSTITUICAO",
    largura: 26,
  },
  // ── Empresa e cliente ──────────────────────────────────────────────────────
  { chave: "clienteCnpj", rotulo: "CNPJ Do Cliente", grupo: "CLIENTE", largura: 20 },
  { chave: "clienteRazaoSocial", rotulo: "Razão Social", grupo: "CLIENTE", largura: 34 },
  { chave: "clienteNomeOperacao", rotulo: "Nome De Operação", grupo: "CLIENTE", largura: 30 },
  { chave: "clienteEmpresaGrupo", rotulo: "Empresa Do Grupo", grupo: "CLIENTE", largura: 24 },
  { chave: "clienteRegiao", rotulo: "Região", grupo: "CLIENTE", largura: 16 },
  { chave: "clienteDescricaoRegiao", rotulo: "Descrição Da Região", grupo: "CLIENTE", largura: 28 },
  { chave: "clienteBeneficiosPadrao", rotulo: "Benefícios Padrão", grupo: "CLIENTE", largura: 40 },
  { chave: "clienteEscalaPadrao", rotulo: "Escala Padrão", grupo: "CLIENTE", largura: 24 },
  { chave: "clienteEnderecoPadrao", rotulo: "Endereço Padrão", grupo: "CLIENTE", largura: 40 },
  {
    chave: "clientePeriodicidadeBeneficio",
    rotulo: "Periodicidade Do Benefício",
    grupo: "CLIENTE",
    largura: 24,
  },
  {
    chave: "clienteDiaPagamentoBeneficio",
    rotulo: "Dia De Pagamento Do Benefício",
    grupo: "CLIENTE",
    largura: 28,
  },
  {
    chave: "clienteDiasPrimeiroCredito",
    rotulo: "Dias Para O 1º Crédito",
    grupo: "CLIENTE",
    largura: 22,
  },
  // ── Vínculo e entidade Soulan ──────────────────────────────────────────────
  { chave: "vinculoEmpresaCodigo", rotulo: "Empresa Soulan", grupo: "VINCULO", largura: 18 },
  { chave: "vinculoTipoServico", rotulo: "Tipo De Serviço", grupo: "VINCULO", largura: 20 },
  { chave: "vinculoFilial", rotulo: "Filial", grupo: "VINCULO", largura: 14 },
  { chave: "vinculoFopag", rotulo: "Fopag", grupo: "VINCULO", largura: 12 },
  { chave: "vinculoEntidade", rotulo: "Entidade", grupo: "VINCULO", largura: 30 },
  { chave: "vinculoEntidadeCnpj", rotulo: "CNPJ Da Entidade", grupo: "VINCULO", largura: 20 },
  // ── Benefícios ─────────────────────────────────────────────────────────────
  {
    chave: "beneficiosTextoLivre",
    rotulo: "Benefícios (Texto Livre)",
    grupo: "BENEFICIOS",
    largura: 40,
  },
  {
    chave: "statusCadastroBeneficio",
    rotulo: "Status Do Cadastro Do Benefício",
    grupo: "BENEFICIOS",
    largura: 28,
  },
  {
    chave: "beneficiosEntrouEm",
    rotulo: "Entrou Na Fila De Benefícios Em",
    grupo: "BENEFICIOS",
    largura: 28,
  },
  // ── Frentes da esteira ─────────────────────────────────────────────────────
  { chave: "frenteAuditoria", rotulo: "Status Auditoria", grupo: "FRENTES", largura: 24 },
  {
    chave: "frenteAuditoriaConcluidaEm",
    rotulo: "Auditoria Concluída Em",
    grupo: "FRENTES",
    largura: 22,
  },
  {
    chave: "frenteAuditoriaResponsavel",
    rotulo: "Responsável Auditoria",
    grupo: "FRENTES",
    largura: 26,
  },
  { chave: "frenteExame", rotulo: "Status Exame", grupo: "FRENTES", largura: 20 },
  { chave: "frenteExameConcluidaEm", rotulo: "Exame Concluído Em", grupo: "FRENTES", largura: 22 },
  { chave: "frenteExameResponsavel", rotulo: "Responsável Exame", grupo: "FRENTES", largura: 26 },
  { chave: "frenteCadastro", rotulo: "Status Cadastro", grupo: "FRENTES", largura: 22 },
  {
    chave: "frenteCadastroConcluidaEm",
    rotulo: "Cadastro Concluído Em",
    grupo: "FRENTES",
    largura: 22,
  },
  {
    chave: "frenteCadastroResponsavel",
    rotulo: "Responsável Cadastro",
    grupo: "FRENTES",
    largura: 26,
  },
  { chave: "frenteIntegracao", rotulo: "Status Integração", grupo: "FRENTES", largura: 22 },
  {
    chave: "frenteIntegracaoConcluidaEm",
    rotulo: "Integração Concluída Em",
    grupo: "FRENTES",
    largura: 22,
  },
  {
    chave: "frenteIntegracaoResponsavel",
    rotulo: "Responsável Integração",
    grupo: "FRENTES",
    largura: 26,
  },
  // ── Exame ──────────────────────────────────────────────────────────────────
  { chave: "exameData", rotulo: "Data Do Exame", grupo: "EXAME", largura: 16 },
  { chave: "exameHorario", rotulo: "Horário Do Exame", grupo: "EXAME", largura: 16 },
  { chave: "exameClinica", rotulo: "Clínica", grupo: "EXAME", largura: 30 },
  { chave: "exameFornecedor", rotulo: "Fornecedor Do Exame", grupo: "EXAME", largura: 20 },
  { chave: "exameLocal", rotulo: "Local Do Exame", grupo: "EXAME", largura: 36 },
  { chave: "exameValor", rotulo: "Valor Do Exame", grupo: "EXAME", largura: 16 },
  { chave: "examePrevisaoAso", rotulo: "Previsão Do ASO", grupo: "EXAME", largura: 18 },
  { chave: "exameReagendamentos", rotulo: "Reagendamentos", grupo: "EXAME", largura: 16 },
  { chave: "asoValidado", rotulo: "ASO Validado", grupo: "EXAME", largura: 14 },
  // ── Integração ─────────────────────────────────────────────────────────────
  { chave: "integracaoData", rotulo: "Data Da Integração", grupo: "INTEGRACAO", largura: 20 },
  { chave: "integracaoHorario", rotulo: "Horário Da Integração", grupo: "INTEGRACAO", largura: 20 },
  { chave: "integracaoTipo", rotulo: "Tipo De Integração", grupo: "INTEGRACAO", largura: 18 },
  {
    chave: "integracaoConsultor",
    rotulo: "Consultor Da Integração",
    grupo: "INTEGRACAO",
    largura: 26,
  },
  // ── Assinatura ─────────────────────────────────────────────────────────────
  { chave: "clicksignStatus", rotulo: "Status Da Assinatura", grupo: "ASSINATURA", largura: 22 },
  {
    chave: "clicksignEnviadoEm",
    rotulo: "Enviado Para Assinatura Em",
    grupo: "ASSINATURA",
    largura: 26,
  },
  { chave: "clicksignNotificadoEm", rotulo: "Notificado Em", grupo: "ASSINATURA", largura: 20 },
  { chave: "clicksignEnvelopeId", rotulo: "Envelope", grupo: "ASSINATURA", largura: 24 },
  {
    chave: "contratoAssinadoDriveUrl",
    rotulo: "Contrato Assinado",
    grupo: "ASSINATURA",
    largura: 44,
  },
  { chave: "kitAssinaturaEm", rotulo: "Kit Gerado Em", grupo: "ASSINATURA", largura: 20 },
  // ── Controle da admissão ───────────────────────────────────────────────────
  { chave: "isBanco", rotulo: "Admissão De Banco", grupo: "CONTROLE", largura: 18 },
  {
    chave: "sinalizadorPreenchimento",
    rotulo: "Sinalizador De Preenchimento",
    grupo: "CONTROLE",
    largura: 26,
  },
  {
    chave: "pendenciasObrigatorias",
    rotulo: "Pendências Obrigatórias",
    grupo: "CONTROLE",
    largura: 44,
  },
  {
    chave: "docsObrigatoriosPendentes",
    rotulo: "Documentos Obrigatórios Pendentes",
    grupo: "CONTROLE",
    largura: 30,
  },
  { chave: "pausadaEm", rotulo: "Pausada Em", grupo: "CONTROLE", largura: 20 },
  { chave: "pausaMotivo", rotulo: "Motivo Da Pausa", grupo: "CONTROLE", largura: 36 },
  { chave: "motivoDeclinio", rotulo: "Motivo Do Declínio", grupo: "CONTROLE", largura: 28 },
  { chave: "consultor", rotulo: "Consultor Responsável", grupo: "CONTROLE", largura: 26 },
  { chave: "divergenciaBancaria", rotulo: "Divergência Bancária", grupo: "CONTROLE", largura: 24 },
  { chave: "possivelDuplicata", rotulo: "Possível Duplicata", grupo: "CONTROLE", largura: 18 },
  {
    chave: "observacaoLiberacao",
    rotulo: "Observação Da Liberação",
    grupo: "CONTROLE",
    largura: 40,
  },
  { chave: "recusadoEm", rotulo: "Recusada Em", grupo: "CONTROLE", largura: 20 },
  { chave: "idVacancy", rotulo: "Id Da Vaga No Pandapé", grupo: "CONTROLE", largura: 22 },
  {
    chave: "drivePastaUrl",
    rotulo: "Pasta Do Prontuário No Drive",
    grupo: "CONTROLE",
    largura: 44,
  },
  { chave: "driveAsoUrl", rotulo: "ASO No Drive", grupo: "CONTROLE", largura: 44 },
  { chave: "atualizadoEm", rotulo: "Atualizada Em", grupo: "CONTROLE", largura: 20 },
  // ── Formulário de VT ───────────────────────────────────────────────────────
  // Endereço RESIDENCIAL do candidato: entra por decisão do diretor (quem exporta já tem acesso ao
  // dado na ficha). Sai sempre do formulário MAIS RECENTE da admissão, nunca de um antigo.
  { chave: "vtOptante", rotulo: "Optante De VT", grupo: "VT", largura: 16 },
  { chave: "vtCep", rotulo: "CEP", grupo: "VT", largura: 12 },
  { chave: "vtLogradouro", rotulo: "Logradouro", grupo: "VT", largura: 36 },
  { chave: "vtNumero", rotulo: "Número", grupo: "VT", largura: 12 },
  { chave: "vtComplemento", rotulo: "Complemento", grupo: "VT", largura: 20 },
  { chave: "vtBairro", rotulo: "Bairro", grupo: "VT", largura: 24 },
  { chave: "vtCidade", rotulo: "Cidade", grupo: "VT", largura: 22 },
  { chave: "vtUf", rotulo: "UF", grupo: "VT", largura: 8 },
  { chave: "vtTotalIda", rotulo: "VT Total Ida", grupo: "VT", largura: 14 },
  { chave: "vtTotalVolta", rotulo: "VT Total Volta", grupo: "VT", largura: 14 },
  { chave: "vtTotalDia", rotulo: "VT Total Dia", grupo: "VT", largura: 14 },
  // ── iFractal ───────────────────────────────────────────────────────────────
  // A SENHA sai em texto, por decisão do diretor: ela é DESCARTÁVEL (o iFractal a envia ao
  // funcionário e força a troca no primeiro acesso), então não é credencial durável. Como todas as
  // outras, a coluna nasce DESMARCADA: só deixa o sistema se alguém marcar. §A.6: em log, nunca.
  { chave: "ifractalLogin", rotulo: "Login iFractal", grupo: "IFRACTAL", largura: 24 },
  { chave: "ifractalSenha", rotulo: "Senha iFractal", grupo: "IFRACTAL", largura: 20 },
  { chave: "ifractalTipoMarcacao", rotulo: "Tipo De Marcação", grupo: "IFRACTAL", largura: 24 },
  { chave: "ifractalStatus", rotulo: "Status iFractal", grupo: "IFRACTAL", largura: 22 },
];

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

// ── A&S / Central de Vagas (onda 1) ────────────────────────────────────────
/**
 * VOCABULÁRIO DA VAGA, em um lugar só. Backend valida o DTO com estas listas e o frontend monta os
 * seletores com estes mesmos rótulos: duas cópias divergiriam no primeiro ajuste, e o sintoma seria
 * um valor aceito pela tela e recusado pela API.
 *
 * Os valores espelham os enums do banco (`vaga_natureza`, `vaga_vinculo`, `vaga_status`,
 * `vaga_sazonalidade`, `vaga_escolaridade`), que por sua vez espelham a base real de gestão de vaga.
 */
export const VAGA_NATUREZA = [
  "EFETIVA",
  "TEMPORARIA",
  "REPOSICAO_EFETIVA",
  "TERCEIRA",
  "ESTAGIO",
  "VAGA_BANCO",
] as const;
export type VagaNatureza = (typeof VAGA_NATUREZA)[number];

/** Rótulos como a operação fala (§A.24: tag em title case). */
export const VAGA_NATUREZA_LABEL: Record<VagaNatureza, string> = {
  EFETIVA: "Efetiva",
  TEMPORARIA: "Temporária",
  REPOSICAO_EFETIVA: "Reposição Efetiva",
  TERCEIRA: "Terceira",
  ESTAGIO: "Estágio",
  VAGA_BANCO: "Vaga Banco",
};

export const VAGA_VINCULO = [
  // EFETIVO e PJ na frente porque é assim que o formulário de abertura pergunta ("( )Efetivo
  // ( )Pessoa Jurídica (PJ)( )Temporário..."). A ordem aqui é só de exibição; no banco o enum
  // acrescenta no fim, que é o que `ALTER TYPE ADD VALUE` permite.
  "EFETIVO",
  "PJ",
  "TEMPORARIO",
  "TERCEIRIZADO",
  "ESTAGIO",
  "INTERNO",
  "FOPAG",
  "JOVEM_APRENDIZ",
] as const;
export type VagaVinculo = (typeof VAGA_VINCULO)[number];

export const VAGA_VINCULO_LABEL: Record<VagaVinculo, string> = {
  EFETIVO: "Efetivo",
  PJ: "Pessoa Jurídica (PJ)",
  TEMPORARIO: "Temporário",
  TERCEIRIZADO: "Terceirizado",
  ESTAGIO: "Estágio",
  INTERNO: "Interno",
  FOPAG: "Fopag",
  JOVEM_APRENDIZ: "Jovem Aprendiz",
};

/**
 * OS ESTADOS DA VAGA, com o RASCUNHO na frente porque ele é o PRIMEIRO da vida dela.
 *
 * RASCUNHO é a vaga que ainda não nasceu para o time: existe, guarda o que já foi preenchido e não
 * cobra obrigatório nenhum. ABERTA é a vaga publicada, e é dela para frente que valem entrega,
 * fechamento e cancelamento. A passagem de um para o outro é o PUBLICAR, e é lá, e só lá, que a
 * régua dos obrigatórios cobra (`vagaPendencias`).
 */
export const VAGA_STATUS = [
  "RASCUNHO",
  "ABERTA",
  "ENTREGUE",
  "FECHADA",
  "CANCELADA",
  "VAGA_BANCO",
] as const;
export type VagaStatus = (typeof VAGA_STATUS)[number];

export const VAGA_STATUS_LABEL: Record<VagaStatus, string> = {
  RASCUNHO: "Rascunho",
  ABERTA: "Aberta",
  ENTREGUE: "Entregue",
  FECHADA: "Fechada",
  CANCELADA: "Cancelada",
  VAGA_BANCO: "Vaga Banco",
};

/**
 * A RÉGUA DOS OBRIGATÓRIOS DA VAGA, declarada UMA VEZ e lida pelos dois lados.
 *
 * POR QUE AQUI, e não uma lista na tela e outra no service: a tela precisa da régua para desenhar o
 * asterisco vermelho e para listar o que falta na hora de publicar; o backend precisa da MESMA régua
 * para recusar a publicação de um corpo montado fora da tela. Duas cópias divergem no primeiro campo
 * que alguém acrescentar, e a divergência aparece como "a tela deixou publicar e o servidor recusou".
 *
 * O QUE ESTÁ AQUI É A RÉGUA DE HOJE, e ela não mudou nesta frente (decisão do diretor, 25/08): os
 * itens 1 a 4 da OST tratam de COMO e QUANDO cobrar, não de O QUE cobrar. Acrescentar um campo
 * obrigatório no futuro é acrescentar UMA linha nesta lista, e o asterisco, a trava do publicar e a
 * mensagem do servidor passam a contá-lo juntos, sem tocar em mais nada.
 *
 * `passo` é 0-based, como o estado da trilha; `passoRotulo` é o nome do passo como o Stepper mostra.
 * `ancora` é o id do campo na tela, e é o que faz o item da lista de pendências ser CLICÁVEL: clicar
 * leva ao passo e põe o cursor no campo.
 */
export interface VagaPendencia {
  campo: string;
  rotulo: string;
  /** Artigo do rótulo, para a frase sair em português: "falta o Código", "falta a Data de abertura". */
  artigo: "o" | "a";
  passo: number;
  passoRotulo: string;
  ancora: string;
}

export const VAGA_OBRIGATORIOS: readonly VagaPendencia[] = [
  { campo: "codigo", rotulo: "Código da vaga", artigo: "o", passo: 0, passoRotulo: "A Vaga", ancora: "vaga-codigo" },
  { campo: "nomeDivulgacao", rotulo: "Nome de divulgação", artigo: "o", passo: 0, passoRotulo: "A Vaga", ancora: "vaga-nome-divulgacao" },
  { campo: "cargoId", rotulo: "Cargo", artigo: "o", passo: 0, passoRotulo: "A Vaga", ancora: "vaga-cargo" },
  // OS DOIS CONTADORES DA VAGA (25/08): só o OFICIAL é obrigatório. O de banco nasce zero e zero é
  // resposta legítima (a maioria das vagas não reserva excedente), então cobrá-lo aqui transformaria
  // o estado normal da vaga em pendência de publicação.
  { campo: "posicoesOficiais", rotulo: "Nº de posições oficiais", artigo: "o", passo: 0, passoRotulo: "A Vaga", ancora: "vaga-posicoes-oficiais" },
  { campo: "natureza", rotulo: "Natureza", artigo: "a", passo: 0, passoRotulo: "A Vaga", ancora: "vaga-natureza" },
  { campo: "sazonalidade", rotulo: "Sazonalidade", artigo: "a", passo: 0, passoRotulo: "A Vaga", ancora: "vaga-sazonalidade" },
  { campo: "status", rotulo: "Status", artigo: "o", passo: 0, passoRotulo: "A Vaga", ancora: "vaga-status" },
  { campo: "dataAbertura", rotulo: "Data de abertura", artigo: "a", passo: 1, passoRotulo: "Quem Pediu", ancora: "vaga-data-abertura" },
];

/**
 * O que a régua precisa ler. Aceita o nº de posições como número (backend) ou texto (campo da tela).
 */
export interface VagaCamposObrigatorios {
  codigo?: string | null;
  nomeDivulgacao?: string | null;
  cargoId?: string | null;
  posicoesOficiais?: number | string | null;
  natureza?: string | null;
  sazonalidade?: string | null;
  status?: string | null;
  dataAbertura?: string | null;
}

/**
 * O que falta para a vaga poder ser PUBLICADA, na ordem da trilha.
 *
 * DEVOLVE A LISTA INTEIRA, nunca o primeiro que falhou: quem preenche 38 campos não pode descobrir
 * as pendências uma por uma, com uma volta ao servidor entre cada duas.
 *
 * `posicoesOficiais` tem régua própria porque zero não é "preenchido": vaga com zero posição oficial
 * não é vaga. O contador de BANCO não entra na régua: lá zero é o estado normal, não uma lacuna.
 */
export function vagaPendencias(v: VagaCamposObrigatorios): VagaPendencia[] {
  const vazio = (x: unknown) => x === null || x === undefined || String(x).trim() === "";
  return VAGA_OBRIGATORIOS.filter((p) => {
    const valor = (v as Record<string, unknown>)[p.campo];
    if (p.campo === "posicoesOficiais") return vazio(valor) || Number(valor) <= 0;
    return vazio(valor);
  });
}

/** A pendência escrita como o time lê: "Passo 1 · A Vaga: falta o Código da vaga" (§A.11). */
export function textoPendencia(p: VagaPendencia): string {
  return `Passo ${p.passo + 1} · ${p.passoRotulo}: falta ${p.artigo} ${p.rotulo}`;
}

export const VAGA_SAZONALIDADE = ["OPERACAO_PADRAO", "SAZONAL"] as const;
export type VagaSazonalidade = (typeof VAGA_SAZONALIDADE)[number];

export const VAGA_SAZONALIDADE_LABEL: Record<VagaSazonalidade, string> = {
  OPERACAO_PADRAO: "Operação Padrão",
  SAZONAL: "Sazonal",
};

export const VAGA_ESCOLARIDADE = [
  "FUNDAMENTAL_INCOMPLETO",
  "FUNDAMENTAL_COMPLETO",
  "MEDIO_INCOMPLETO",
  "MEDIO_COMPLETO",
  "TECNICO",
  "SUPERIOR_INCOMPLETO",
  "SUPERIOR_COMPLETO",
  "POS_GRADUACAO",
] as const;
export type VagaEscolaridade = (typeof VAGA_ESCOLARIDADE)[number];

export const VAGA_ESCOLARIDADE_LABEL: Record<VagaEscolaridade, string> = {
  FUNDAMENTAL_INCOMPLETO: "Fundamental Incompleto",
  FUNDAMENTAL_COMPLETO: "Fundamental Completo",
  MEDIO_INCOMPLETO: "Médio Incompleto",
  MEDIO_COMPLETO: "Médio Completo",
  TECNICO: "Técnico",
  SUPERIOR_INCOMPLETO: "Superior Incompleto",
  SUPERIOR_COMPLETO: "Superior Completo",
  POS_GRADUACAO: "Pós-graduação",
};

export const VAGA_MODELO_TRABALHO = ["PRESENCIAL", "HOME_OFFICE", "HIBRIDO"] as const;
export type VagaModeloTrabalho = (typeof VAGA_MODELO_TRABALHO)[number];

export const VAGA_MODELO_TRABALHO_LABEL: Record<VagaModeloTrabalho, string> = {
  PRESENCIAL: "Presencial",
  HOME_OFFICE: "Home Office",
  HIBRIDO: "Híbrido",
};

export const VAGA_TIPO_SUBSTITUICAO = [
  "FERIAS",
  "LICENCA_MATERNIDADE",
  "AUXILIO_DOENCA",
  "SUBSTITUICAO",
] as const;
export type VagaTipoSubstituicao = (typeof VAGA_TIPO_SUBSTITUICAO)[number];

export const VAGA_TIPO_SUBSTITUICAO_LABEL: Record<VagaTipoSubstituicao, string> = {
  FERIAS: "Férias",
  LICENCA_MATERNIDADE: "Licença Maternidade",
  AUXILIO_DOENCA: "Auxílio Doença",
  SUBSTITUICAO: "Substituição",
};

export const VAGA_GENERO = ["INDIFERENTE", "MASCULINO", "FEMININO"] as const;
export type VagaGenero = (typeof VAGA_GENERO)[number];

export const VAGA_GENERO_LABEL: Record<VagaGenero, string> = {
  INDIFERENTE: "Indiferente",
  MASCULINO: "Masculino",
  FEMININO: "Feminino",
};

/**
 * TESTES aplicados no processo, seleção múltipla. Lista fechada do formulário de papel, mais o campo
 * "outro" em texto, que é como o formulário resolve o que a lista não cobre.
 */
export const VAGA_TESTES = ["EXCEL", "REDACAO", "LOGICA", "INGLES", "PSICOMETRICO"] as const;
export type VagaTeste = (typeof VAGA_TESTES)[number];

export const VAGA_TESTE_LABEL: Record<VagaTeste, string> = {
  EXCEL: "Excel",
  REDACAO: "Redação",
  LOGICA: "Lógica",
  INGLES: "Inglês",
  PSICOMETRICO: "Psicométrico",
};

/**
 * TEMPO DE CONTRATO: a mesma lista de dias que a Nova Admissão já usa (§A.22), mais "Indeterminado",
 * que é o que o formulário de vaga escreve quando o contrato é por prazo aberto.
 */
export const VAGA_TEMPO_CONTRATO = [
  "30",
  "60",
  "90",
  "120",
  "150",
  "180",
  "210",
  "240",
  "270",
  "INDETERMINADO",
] as const;
export type VagaTempoContrato = (typeof VAGA_TEMPO_CONTRATO)[number];

export function rotuloTempoContrato(v: string): string {
  return v === "INDETERMINADO" ? "Indeterminado" : `${v} dias`;
}

/**
 * PAPEL DE A&S da pessoa: os dois lados da vaga. Fixo por usuário, e separado do `Papel` do RBAC.
 * `null` é o estado de quem não trabalha em A&S, que é a maioria de quem já está cadastrado.
 */
export const PAPEL_AS = ["CONSULTOR", "RECRUITER"] as const;
export type PapelAs = (typeof PAPEL_AS)[number];

export const PAPEL_AS_LABEL: Record<PapelAs, string> = {
  CONSULTOR: "Consultor",
  RECRUITER: "Recruiter",
};

/** O lado OPOSTO ao de quem abre a vaga: é o que a trilha pede, porque o outro é carimbado sozinho. */
export function contraparteDe(papel: PapelAs): PapelAs {
  return papel === "CONSULTOR" ? "RECRUITER" : "CONSULTOR";
}

// ── Regiões de abordagem, nível Brasil (item 7 da OST de 22/08) ────────────────
//
// MORA AQUI DENTRO, e não num arquivo próprio, por uma razão de RUNTIME que custou uma queda.
//
// Este pacote é consumido de DUAS formas diferentes, e elas exigem coisas opostas de um
// `export * from "./outro-arquivo"`:
//   1. O BACKEND, em produção, carrega `dist/index.js` como ESM de verdade (o package.json diz
//      "type": "module"). O Node ESM EXIGE a extensão `.js` no caminho relativo, senão morre com
//      ERR_MODULE_NOT_FOUND no boot.
//   2. O FRONTEND resolve o pacote PELO FONTE, por path alias, e o webpack do Next NÃO mapeia
//      `./x.js` para `./x.ts`. Com a extensão, a build do frontend falha com "Module not found".
//
// Escrever com extensão quebrava o frontend; escrever sem quebrava o backend NO PRÓXIMO RESTART, e
// esse é o detalhe traiçoeiro: o processo já no ar continuava servindo normalmente, então o defeito
// ficou invisível até alguém reiniciar. Um arquivo só não tem esse problema, e o pacote sempre foi
// de arquivo único: o arquivo separado é que era a exceção.
/** O valor que representa "o que a lista não cobre". Ao escolher, a tela abre o campo de texto. */
export const REGIAO_OUTRAS = "Outras";

export interface UfOpcao {
  /** Sigla, e a chave de tudo: é o que a vaga grava em `regiao_estado`. */
  uf: string;
  nome: string;
}

/** As 27 unidades da federação (26 estados e o Distrito Federal), em ordem alfabética de nome. */
export const UFS: UfOpcao[] = [
  { uf: "AC", nome: "Acre" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" },
  { uf: "BA", nome: "Bahia" },
  { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PA", nome: "Pará" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
];

/**
 * AS REGIÕES DE CADA UF. A ordem dentro de cada estado é deliberada: a CAPITAL e a região
 * metropolitana dela vêm primeiro, porque são a maioria das vagas, e depois os demais polos em
 * ordem de porte. "Outras" fecha sempre.
 */
export const REGIOES_POR_UF: Record<string, string[]> = {
  AC: [
    "Rio Branco",
    "Região Metropolitana de Rio Branco",
    "Cruzeiro do Sul",
    "Sena Madureira",
    "Tarauacá",
    "Feijó",
    "Brasileia e Xapuri",
    "Plácido de Castro",
    REGIAO_OUTRAS,
  ],
  AL: [
    "Maceió",
    "Região Metropolitana de Maceió",
    "Arapiraca",
    "Palmeira dos Índios",
    "União dos Palmares",
    "São Miguel dos Campos",
    "Penedo",
    "Santana do Ipanema",
    "Delmiro Gouveia",
    REGIAO_OUTRAS,
  ],
  AP: [
    "Macapá",
    "Santana",
    "Laranjal do Jari",
    "Porto Grande",
    "Mazagão",
    "Oiapoque",
    REGIAO_OUTRAS,
  ],
  AM: [
    "Manaus",
    "Região Metropolitana de Manaus",
    "Manacapuru",
    "Itacoatiara",
    "Parintins",
    "Coari",
    "Tefé",
    "Tabatinga",
    "Humaitá",
    "Lábrea",
    REGIAO_OUTRAS,
  ],
  BA: [
    "Salvador",
    "Região Metropolitana de Salvador",
    "Feira de Santana",
    "Vitória da Conquista",
    "Ilhéus e Itabuna",
    "Juazeiro",
    "Barreiras",
    "Santo Antônio de Jesus",
    "Jequié",
    "Alagoinhas",
    "Teixeira de Freitas",
    "Guanambi",
    "Irecê",
    "Paulo Afonso",
    REGIAO_OUTRAS,
  ],
  CE: [
    "Fortaleza",
    "Região Metropolitana de Fortaleza",
    "Caucaia",
    "Maracanaú",
    "Sobral",
    "Juazeiro do Norte e Crato",
    "Iguatu",
    "Quixadá",
    "Limoeiro do Norte",
    "Itapipoca",
    REGIAO_OUTRAS,
  ],
  DF: [
    "Brasília (Plano Piloto)",
    "Águas Claras",
    "Guará",
    "Taguatinga",
    "Ceilândia",
    "Samambaia",
    "Gama e Santa Maria",
    "Sobradinho",
    "Planaltina",
    "Núcleo Bandeirante e Riacho Fundo",
    "Entorno do DF",
    REGIAO_OUTRAS,
  ],
  ES: [
    "Vitória",
    "Região Metropolitana da Grande Vitória",
    "Vila Velha",
    "Serra",
    "Cariacica e Viana",
    "Guarapari",
    "Cachoeiro de Itapemirim",
    "Linhares",
    "Aracruz",
    "Colatina",
    "São Mateus",
    REGIAO_OUTRAS,
  ],
  GO: [
    "Goiânia",
    "Região Metropolitana de Goiânia",
    "Aparecida de Goiânia",
    "Anápolis",
    "Luziânia e Entorno do DF",
    "Águas Lindas de Goiás",
    "Rio Verde",
    "Itumbiara",
    "Catalão",
    "Jataí",
    "Caldas Novas",
    "Uruaçu e Porangatu",
    REGIAO_OUTRAS,
  ],
  MA: [
    "São Luís",
    "Região Metropolitana de São Luís",
    "São José de Ribamar",
    "Imperatriz",
    "Caxias",
    "Timon",
    "Codó",
    "Bacabal",
    "Santa Inês",
    "Açailândia",
    "Balsas",
    REGIAO_OUTRAS,
  ],
  MT: [
    "Cuiabá",
    "Região Metropolitana do Vale do Rio Cuiabá",
    "Várzea Grande",
    "Rondonópolis",
    "Sinop",
    "Sorriso",
    "Lucas do Rio Verde",
    "Tangará da Serra",
    "Primavera do Leste",
    "Cáceres",
    "Barra do Garças",
    "Alta Floresta",
    REGIAO_OUTRAS,
  ],
  MS: [
    "Campo Grande",
    "Dourados",
    "Três Lagoas",
    "Corumbá",
    "Ponta Porã",
    "Naviraí",
    "Nova Andradina",
    "Aquidauana",
    REGIAO_OUTRAS,
  ],
  MG: [
    "Belo Horizonte",
    "Região Metropolitana de Belo Horizonte",
    "Contagem",
    "Betim",
    "Uberlândia",
    "Uberaba",
    "Juiz de Fora",
    "Montes Claros",
    "Divinópolis",
    "Ipatinga e Vale do Aço",
    "Governador Valadares",
    "Sete Lagoas",
    "Varginha",
    "Poços de Caldas",
    "Pouso Alegre",
    "Patos de Minas",
    "Barbacena",
    "Teófilo Otoni",
    REGIAO_OUTRAS,
  ],
  PA: [
    "Belém",
    "Região Metropolitana de Belém",
    "Ananindeua",
    "Marituba",
    "Castanhal",
    "Abaetetuba",
    "Santarém",
    "Marabá",
    "Parauapebas",
    "Tucuruí",
    "Altamira",
    "Redenção",
    "Paragominas",
    REGIAO_OUTRAS,
  ],
  PB: [
    "João Pessoa",
    "Região Metropolitana de João Pessoa",
    "Santa Rita e Bayeux",
    "Campina Grande",
    "Guarabira",
    "Patos",
    "Sousa e Cajazeiras",
    REGIAO_OUTRAS,
  ],
  PR: [
    "Curitiba",
    "Região Metropolitana de Curitiba",
    "São José dos Pinhais",
    "Londrina",
    "Maringá",
    "Ponta Grossa",
    "Cascavel",
    "Foz do Iguaçu",
    "Toledo",
    "Guarapuava",
    "Paranaguá e Litoral",
    "Apucarana",
    "Campo Mourão",
    "Umuarama",
    "Pato Branco",
    "Francisco Beltrão",
    REGIAO_OUTRAS,
  ],
  PE: [
    "Recife",
    "Região Metropolitana do Recife",
    "Jaboatão dos Guararapes",
    "Olinda",
    "Paulista",
    "Cabo de Santo Agostinho",
    "Caruaru",
    "Vitória de Santo Antão",
    "Garanhuns",
    "Petrolina",
    "Serra Talhada",
    "Salgueiro",
    REGIAO_OUTRAS,
  ],
  PI: [
    "Teresina",
    "Região Integrada da Grande Teresina",
    "Parnaíba",
    "Picos",
    "Floriano",
    "Piripiri",
    "Campo Maior",
    "São Raimundo Nonato",
    REGIAO_OUTRAS,
  ],
  RJ: [
    "Rio de Janeiro (capital)",
    "Zona Sul (RJ)",
    "Zona Norte (RJ)",
    "Zona Oeste (RJ)",
    "Centro (RJ)",
    "Barra da Tijuca",
    "Baixada Fluminense (Nova Iguaçu, Duque de Caxias, Belford Roxo)",
    "Niterói e São Gonçalo",
    "Região dos Lagos (Cabo Frio, Búzios)",
    "Macaé e Rio das Ostras",
    "Campos dos Goytacazes",
    "Volta Redonda e Barra Mansa",
    "Petrópolis e Região Serrana",
    "Angra dos Reis e Costa Verde",
    REGIAO_OUTRAS,
  ],
  RN: [
    "Natal",
    "Região Metropolitana de Natal",
    "Parnamirim",
    "São Gonçalo do Amarante",
    "Mossoró",
    "Caicó",
    "Currais Novos",
    "Açu",
    "Pau dos Ferros",
    REGIAO_OUTRAS,
  ],
  RS: [
    "Porto Alegre",
    "Região Metropolitana de Porto Alegre",
    "Canoas",
    "Gravataí e Alvorada",
    "Novo Hamburgo e São Leopoldo",
    "Caxias do Sul e Serra Gaúcha",
    "Pelotas",
    "Rio Grande",
    "Santa Maria",
    "Passo Fundo",
    "Santa Cruz do Sul e Lajeado",
    "Ijuí e Santo Ângelo",
    "Uruguaiana e Fronteira Oeste",
    "Bagé",
    REGIAO_OUTRAS,
  ],
  RO: [
    "Porto Velho",
    "Ji-Paraná",
    "Ariquemes",
    "Vilhena",
    "Cacoal",
    "Rolim de Moura",
    "Jaru",
    "Guajará-Mirim",
    REGIAO_OUTRAS,
  ],
  RR: [
    "Boa Vista",
    "Rorainópolis",
    "Caracaraí",
    "Mucajaí",
    "Alto Alegre",
    "Pacaraima",
    REGIAO_OUTRAS,
  ],
  SC: [
    "Florianópolis",
    "Região Metropolitana de Florianópolis",
    "São José e Palhoça",
    "Joinville",
    "Blumenau",
    "Itajaí e Balneário Camboriú",
    "Brusque",
    "Jaraguá do Sul",
    "Criciúma",
    "Tubarão",
    "Chapecó",
    "Lages",
    "Caçador e Videira",
    REGIAO_OUTRAS,
  ],
  /**
   * SÃO PAULO: o recorte JÁ VALIDADO pelo diretor, copiado sem alteração (§A.14). Não acrescentar
   * polos do interior aqui sem pedido: "Interior de SP" é a linha que o diretor aprovou para cobrir
   * tudo que está fora da Grande SP.
   */
  SP: [
    "São Paulo capital",
    "Zona Norte",
    "Zona Sul",
    "Zona Leste",
    "Zona Oeste",
    "Centro",
    "ABC (Santo André, São Bernardo, São Caetano, Diadema)",
    "Guarulhos",
    "Osasco, Barueri e Alphaville",
    "Grande SP (demais)",
    "Interior de SP",
    REGIAO_OUTRAS,
  ],
  SE: [
    "Aracaju",
    "Região Metropolitana de Aracaju",
    "Nossa Senhora do Socorro",
    "Lagarto",
    "Itabaiana",
    "Estância",
    "Propriá",
    REGIAO_OUTRAS,
  ],
  TO: [
    "Palmas",
    "Araguaína",
    "Gurupi",
    "Porto Nacional",
    "Paraíso do Tocantins",
    "Colinas do Tocantins",
    "Dianópolis",
    REGIAO_OUTRAS,
  ],
};

/** Nome da UF pela sigla. Sigla desconhecida devolve a própria sigla, nunca quebra a exibição. */
export function nomeDaUf(uf: string): string {
  return UFS.find((u) => u.uf === uf)?.nome ?? uf;
}

/**
 * As regiões de uma UF. UF vazia ou desconhecida devolve lista VAZIA, e é o que faz a segunda lista
 * nascer fechada enquanto ninguém escolheu o estado.
 */
export function regioesDaUf(uf: string | null | undefined): string[] {
  if (!uf) return [];
  return REGIOES_POR_UF[uf] ?? [];
}

/**
 * A régua que a tela e o backend precisam responder igual: a região escolhida pertence mesmo à UF?
 *
 * Existe porque a tela é encadeada e o corpo do POST não é: quem trocar o estado depois de marcar as
 * regiões, ou montar a requisição na mão, mandaria região de um estado com a sigla de outro. Aqui a
 * combinação é conferida antes de gravar.
 */
export function regiaoPertenceAUf(uf: string, regiao: string): boolean {
  return regioesDaUf(uf).includes(regiao);
}


/**
 * TEMPO DE CONTRATO SÓ EXISTE EM CONTRATO COM PRAZO (item 2 da OST de 22/08).
 *
 * Perguntar "quantos dias dura?" numa vaga EFETIVA é perguntar o que não tem resposta, e o campo
 * ficava lá, vazio, em toda vaga efetiva. Nos três vínculos abaixo o prazo é da natureza do
 * contrato: temporário tem prazo por lei, estágio e jovem aprendiz têm termo com vigência.
 *
 * A RÉGUA VIVE AQUI, e não num `if` na tela, porque as duas pontas precisam responder igual: a tela
 * decide se DESENHA o campo, o service decide se GRAVA o valor. Quem trocar o vínculo depois de
 * escolher o tempo não deixa para trás um prazo órfão de um vínculo que não tem prazo.
 */
export const VINCULOS_COM_TEMPO_CONTRATO = ["TEMPORARIO", "ESTAGIO", "JOVEM_APRENDIZ"] as const;

export function exigeTempoContrato(vinculo: string | null | undefined): boolean {
  return (VINCULOS_COM_TEMPO_CONTRATO as readonly string[]).includes(vinculo ?? "");
}

/**
 * O VALOR SENTINELA DAS LISTAS COM ESCAPE. Escolher esta opção abre o campo de texto ao lado, e o
 * que a pessoa escrever é o que fica gravado na vaga.
 *
 * POR QUE UM SENTINELA, e não deixar a lista vazia significar "outro": vazio é "ninguém respondeu",
 * que é estado diferente de "respondeu algo que a lista não tinha". Misturar os dois apagaria a
 * diferença entre a vaga incompleta e a vaga com resposta fora do catálogo.
 */
export const OPCAO_OUTROS = "Outros";
export const OPCAO_OUTRA = "Outra";
export const OPCAO_OUTRO = "Outro";

/**
 * IDIOMAS EXIGIDOS, seleção MÚLTIPLA (item 6, valores aprovados pelo diretor).
 *
 * Era caixa de texto: "inglês avançado", "Inglês/Espanhol", "ingles basico" eram três grafias da
 * mesma exigência e nenhuma delas filtrável. Em lista, a vaga que pede inglês é achável.
 */
export const VAGA_IDIOMAS = [
  "Inglês",
  "Espanhol",
  "Francês",
  "Italiano",
  "Alemão",
  "Mandarim",
  "Libras",
  OPCAO_OUTROS,
] as const;

/** FAIXA ETÁRIA pretendida, seleção única. "Indiferente" é resposta, não ausência de resposta. */
export const VAGA_FAIXA_ETARIA = [
  "Indiferente",
  "18 a 25 anos",
  "18 a 30 anos",
  "20 a 40 anos",
  "25 a 40 anos",
  "30 a 50 anos",
  "Acima de 40 anos",
  OPCAO_OUTRA,
] as const;

/**
 * ETAPAS DO PROCESSO SELETIVO COM A EMPRESA, seleção MÚLTIPLA. A ordem da lista é a ordem em que as
 * etapas costumam acontecer, e não alfabética, porque é assim que o time lê o processo.
 */
export const VAGA_ETAPAS_PS = [
  "Entrevista com RH",
  "Entrevista com o gestor",
  "Entrevista técnica",
  "Dinâmica de grupo",
  "Teste prático",
  "Painel",
  "Entrevista final com a diretoria",
  OPCAO_OUTRA,
] as const;

/** DETALHE DO HÍBRIDO, seleção única. Só aparece quando o modelo de trabalho é HIBRIDO. */
export const VAGA_DETALHE_HIBRIDO = [
  "1 dia presencial",
  "2 dias presenciais",
  "3 dias presenciais",
  "4 dias presenciais",
  OPCAO_OUTRO,
] as const;

/**
 * HORÁRIO E ESCALA: o valor sentinela do escape (item 5). O catálogo de escalas é o
 * `escalas_catalogo` que a Liberação já usa, servido por `/catalogos/escalas`, e ele NÃO é tocado
 * por esta frente. Quem escolher esta opção escreve a escala à mão, e o que for escrito FICA NA
 * VAGA: não entra no catálogo, de propósito (decisão do diretor).
 */
export const ESCALA_OUTRA = "Outra escala";

/**
 * LEITURA DE VOLTA DE UMA LISTA COM ESCAPE.
 *
 * A vaga grava UM texto só, seja ele uma opção da lista ou o que a pessoa escreveu no escape. Ao
 * reabrir a vaga (ficha, clonagem), é preciso decidir qual dos dois controles recebe o valor: se o
 * texto está na lista, ele é a opção escolhida; se não está, ele é o escape preenchido.
 *
 * É o que faz a CLONAGEM devolver a vaga do jeito que ela foi preenchida, em vez de perder o que
 * estava fora do catálogo.
 */
export function separarOpcaoEscape(
  valor: string | null | undefined,
  opcoes: readonly string[],
  sentinela: string,
): { opcao: string; texto: string } {
  const v = valor?.trim() ?? "";
  if (!v) return { opcao: "", texto: "" };
  if (opcoes.includes(v) && v !== sentinela) return { opcao: v, texto: "" };
  return { opcao: sentinela, texto: v };
}

/**
 * Item da listagem da Central de Vagas. Traz cargo e cliente JÁ RESOLVIDOS em nome, porque é o que a
 * tela mostra; devolver só os ids obrigaria a tela a cruzar duas listas para escrever uma linha.
 *
 * `codCliente` nulo é estado REAL e esperado (a vaga sem cliente vinculado), exibido como
 * "não informado" (§A.11), nunca como traço.
 */
export interface VagaListItem {
  id: string;
  /**
   * O NÚMERO DO PROCESSO SELETIVO. Nulo é estado REAL da vaga em RASCUNHO, que ainda não tem número:
   * a listagem mostra "não informado" (§A.11). Da publicação em diante ele existe, porque a régua
   * dos obrigatórios (`vagaPendencias`) não deixa publicar sem ele.
   */
  codigo: string | null;
  /**
   * OS CAMPOS QUE O RASCUNHO PODE NÃO TER AINDA (OST de 25/08): nome de divulgação, cargo, natureza,
   * nº de posições e data de abertura nascem NULÁVEIS porque a vaga salva pela metade é um estado
   * legítimo. Obrigatórios eles continuam sendo, e a régua (`vagaPendencias`) não deixa PUBLICAR sem
   * eles: o que mudou foi o momento da cobrança. A tela mostra "não informado" (§A.11).
   */
  nomeDivulgacao: string | null;
  cargoId: string | null;
  cargoNome: string | null;
  codCliente: string | null;
  clienteNome: string | null;
  natureza: VagaNatureza | null;
  vinculo: VagaVinculo | null;
  status: VagaStatus;
  sazonalidade: VagaSazonalidade;
  /**
   * OS DOIS CONTADORES DA VAGA (decisão do diretor, 25/08), cada um com a sua META aqui e a sua
   * CONTAGEM no bloco de fechamento: oficiais são as contratações de verdade, banco é o excedente
   * aprovado que fica reservado. É o par que deixa a tela dizer "6 de 10 Oficiais, 3 de 10 Banco".
   *
   * OFICIAIS é nulável (o rascunho pode não ter meta ainda) e BANCO não é: vaga sem banco tem banco
   * ZERO, não banco "não informado". A assimetria é a mesma da coluna do banco de dados.
   */
  posicoesOficiais: number | null;
  posicoesBanco: number;
  escolaridade: VagaEscolaridade | null;
  /**
   * OS DOIS SALÁRIOS DO FORMULÁRIO: com que valor a vaga abriu e com que valor ela fechou. Forma
   * canônica do `numeric` ("2500.00"); a tela formata em pt-BR na exibição.
   */
  salarioAbertura: string | null;
  salarioFechamento: string | null;
  /**
   * Benefícios selecionados do cadastro de benefícios (a mesma fonte da tela de Benefícios), cada um
   * com o SEU valor. `valor` nulo é benefício que não tem valor a informar, não é zero.
   */
  beneficios: { id: string; nome: string; valor: string | null }[];
  dataAbertura: string | null;
  dataLimite: string | null;
  abertoPorNome: string | null;
  criadoEm: string;

  // ── Abertura (passos 1 a 4) ──────────────────────────────────────────────
  // CENTRO DE CUSTO SAIU DA TRILHA (item 4 da OST de 22/08) e por isso saiu daqui: a coluna
  // `vagas.centro_custo` continua no banco, dormente, porque apagar coluna é destrutivo e o campo
  // pode voltar. Nada mais lê nem escreve nela.
  solicitanteNome: string | null;
  solicitanteTelefone: string | null;
  solicitanteEmail: string | null;
  dataSolicitacao: string | null;
  dataAlinhamento: string | null;
  envioShortlist: string | null;
  /** Os dois lados da vaga, já resolvidos em nome: um veio de quem abriu, o outro foi escolhido. */
  consultorNome: string | null;
  recruiterNome: string | null;
  tempoContrato: string | null;
  motivo: string | null;
  justificativaMotivo: string | null;
  tipoSubstituicao: VagaTipoSubstituicao | null;
  substituidoNome: string | null;
  /**
   * CPF DE QUEM SERÁ SUBSTITUÍDO, em dígitos ("12345678901"); a tela aplica a máscara na exibição.
   *
   * ELE PERSISTE, e isso é decisão do diretor (22/08), diferente do CPF de substituição da ADMISSÃO
   * (`dados_vaga_folha.substituido_cpf`), que tem expurgo em 48h pela regra 10 da §A.3. Aqui a
   * exigência é legal e continuada: o time de cadastro do ADM precisa do número para a folha e o
   * eSocial. §A.6 continua valendo no resto: nunca vai para log, nunca sai em exportação.
   *
   * O EXPURGO DA ADMISSÃO NÃO FOI TOCADO por esta frente: são tabelas e regras diferentes.
   */
  substituidoCpf: string | null;
  localTrabalho: string | null;
  /** UF escolhida no passo 4 (item 7). Comanda quais regiões a segunda lista oferece. */
  regiaoEstado: string | null;
  /** Regiões marcadas DENTRO da UF acima. Lista fechada por estado, seleção múltipla. */
  regioes: string[];
  /** O que a lista de regiões não cobriu, escrito à mão. Só existe com "Outras" marcada. */
  regioesOutras: string | null;
  /** Escala escolhida no catálogo `escalas_catalogo`, ou o texto livre de "Outra escala". */
  horarioEscala: string | null;
  modeloTrabalho: VagaModeloTrabalho | null;
  detalheHibrido: string | null;
  confidencial: boolean;
  divulgarEmpresa: boolean;

  // ── Requisitos (passo 5) ─────────────────────────────────────────────────
  faixaEtaria: string | null;
  genero: VagaGenero;
  /** Idiomas marcados na lista fechada. "Outros" leva o texto para `idiomasOutros`. */
  idiomas: string[];
  idiomasOutros: string | null;
  /** Segue TEXTO ABERTO por decisão do diretor: é o campo mais colado na realidade de cada cliente. */
  cursosConhecimentos: string | null;
  testes: string[];
  testesOutro: string | null;
  experiencia: string | null;
  atribuicoes: string | null;
  perfilComportamental: string | null;
  ambiente: string | null;
  /** Etapas marcadas na lista fechada. "Outra" leva o texto para `etapasPsOutra`. */
  etapasPs: string[];
  etapasPsOutra: string | null;
  observacoes: string | null;

  // ── Fechamento (preenchido só na ação Fechar Vaga) ───────────────────────
  dataFechamento: string | null;
  /**
   * A CONTAGEM, um número por meta. `vagasFechadas` conta as posições OFICIAIS preenchidas (é o que
   * ela sempre contou, por isso não mudou de nome) e `vagasFechadasBanco` conta as de banco. Nulo é
   * "ninguém informou", que é o estado de toda vaga ainda aberta, e não zero preenchidas.
   */
  vagasFechadas: number | null;
  vagasFechadasBanco: number | null;
  dataPrevistaInicio: string | null;
  /** Intenção declarada no fechamento. Registra, não liga nada na esteira (frente separada). */
  enviarParaAdmissao: boolean;
}

/**
 * CONTEXTO DE A&S de quem está com a tela aberta, servido junto das opções da trilha.
 *
 * A tela precisa saber DUAS coisas antes de desenhar o passo 3: qual lado a pessoa ocupa (para dizer
 * "você entra como Recruiter") e quem são as pessoas do lado oposto (para o seletor). Quem não tem
 * papel de A&S recebe `papelAs: null`, e a trilha explica em vez de mostrar um seletor vazio.
 */
export interface VagaContextoAs {
  papelAs: PapelAs | null;
  nome: string;
  /** Pessoas do lado OPOSTO, ativas. Vazio quando ninguém foi marcado ainda. */
  contraparte: { id: string; nome: string }[];
}
