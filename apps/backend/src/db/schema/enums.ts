import { pgEnum } from "drizzle-orm/pg-core";

/** RBAC (CLAUDE.md §A.3): Comum (consultor) · Master · Super Admin. */
export const papelEnum = pgEnum("papel", ["COMUM", "MASTER", "SUPER_ADMIN"]);

/** Farol global da admissão (§A.3). EM_ADMISSAO (inicial) · BANCO_AGUARDAR (Aud=ok & Exame=apto &
 * sem data_admissao; unifica o antigo BANCO_PAUSADA) · ADMISSAO_CONCLUIDA (etapas + contrato
 * assinado) · DECLINOU · RESCISAO. */
export const farolGlobalEnum = pgEnum("farol_global", [
  "EM_ADMISSAO",
  "BANCO_AGUARDAR",
  "ADMISSAO_CONCLUIDA",
  "DECLINOU",
  "RESCISAO",
  // Pré-admissão do Pandapé (Liberação Admissional, Parte 1): chegou pelo webhook mas ainda SEM
  // cliente/cargo (de/para manual). Fica na sala de espera até o consultor atribuir e liberar; não
  // vaza em fila/KPI da esteira nem do Gerenciador (excluída junto de DECLINOU/RESCISAO).
  "AGUARDANDO_LIBERACAO",
  // Pré-admissão RECUSADA na Liberação (Parte 2): terminal, fora de fila/KPI (como o declínio).
  // Reversível pela reativação (volta a AGUARDANDO_LIBERACAO).
  "LIBERACAO_RECUSADA",
]);

/** Frentes paralelas e independentes (§A.3 / F12). */
export const frenteTipoEnum = pgEnum("frente_tipo", [
  "AUDITORIA",
  "EXAME",
  "CADASTRO_CONTRATO",
  // Última etapa da esteira (decisão do diretor). Nasce quando o Cadastro conclui, e só para
  // cliente que exige integração.
  "INTEGRACAO",
]);

/** Modalidade da integração agendada. */
export const tipoIntegracaoEnum = pgEnum("tipo_integracao", ["ONLINE", "PRESENCIAL"]);

/**
 * Tipo de serviço do vínculo cliente↔empresa Soulan (OST estrutural). Derivado do código "Empresa"
 * da base: 1,3=TEMPORARIO · 2=TERCEIRO · 4=ESTAGIO · 5,6=INTERNO · >6=FOPAG (documento usa o CNPJ do
 * próprio cliente). É a mesma taxonomia de `admissoes.tipo_contrato`.
 */
export const tipoServicoEnum = pgEnum("tipo_servico", [
  "TEMPORARIO",
  "TERCEIRO",
  "ESTAGIO",
  "INTERNO",
  "FOPAG",
  // APRENDIZ (OST Onda 3, item 7): a taxonomia do vínculo tinha 5 valores e a de `tipo_contrato`
  // tem 6 ("Jovem Aprendiz" ficava de fora). Sem ele, admissão de Jovem Aprendiz em cliente com
  // mais de um vínculo não teria vínculo a resolver. Aditivo: nenhum vínculo existente muda.
  "APRENDIZ",
]);

/** Origem da admissão (Fase 5 / INT-1): MANUAL (wizard F6) ou PANDAPE (sync via webhook/pull). */
export const origemEnum = pgEnum("origem", ["MANUAL", "PANDAPE"]);

/** Sexo do candidato. Usado pela régua padrão: Reservista só é obrigatório para MASCULINO. */
export const sexoEnum = pgEnum("sexo", ["MASCULINO", "FEMININO"]);

/** Fornecedor do exame admissional (seleção FIXA no modal de agendamento da aba EXAME). */
// O enum `fornecedor_exame` SAIU (OST do fornecedor por clínica): o fornecedor virou coluna de texto
// na clínica e no endereço do agendamento, para poder ser cadastrado sem migração. O TIPO continua
// dropado na migração 0053, porque nenhuma coluna o usa mais e tipo órfão só confunde quem lê o
// schema depois.

/** Exigência de um documento na régua (cliente + cargo). */
export const exigenciaEnum = pgEnum("exigencia_documento", [
  "OBRIGATORIO",
  "NAO_OBRIGATORIO",
  "FACULTATIVO",
]);

/** Estado de um documento exigido na admissão — SÓ status, nunca o arquivo (§A.3 regra 7). */
export const estadoDocumentoEnum = pgEnum("estado_documento", [
  "PENDENTE",
  "ENTREGUE",
  "INCONFORME",
  // Documento COLETADO (baixado do Pandapé e gravado na régua) porém ainda NÃO auditado pela IA:
  // desacoplamento coleta/auditoria (a coleta não se perde se a IA cair). Não é ENTREGUE (segue
  // faltante na régua) nem INCONFORME; a auditoria fica pendente e é reprocessável.
  "AGUARDANDO_AUDITORIA",
]);

/** Sinalizador de preenchimento da admissão (§A.3 / F5). Marca, nunca bloqueia (regra 5). */
export const sinalizadorEnum = pgEnum("sinalizador_preenchimento", [
  "PENDENTE",
  "PARCIAL",
  "OK",
  "INCONFORMIDADE",
  "COMPETENCIAS",
]);

/**
 * Tipo de não conformidade (Fase 2C — tela de Não Conformidades). Três gatilhos:
 * NC1 = Auditoria concluída com obrigatórios pendentes; NC2 = Exame "apto" sem ASO (aceite do
 * consultor é o gatilho); NC3 = Cadastro incompleto (flags manuais — kit/assinatura/realizado).
 */
export const ncTipoEnum = pgEnum("nc_tipo", ["NC1", "NC2", "NC3"]);

/** Estado de resolução da NC. O registro PERMANECE no histórico mesmo após resolvida. */
export const ncStatusEnum = pgEnum("nc_status", ["ABERTA", "RESOLVIDA"]);

/**
 * Status do envelope de assinatura na Clicksign (INT-4 / F9). SEM_ENVELOPE (inicial — kit ainda
 * não gerado) · AGUARDANDO_ASSINATURA (envelope disparado) · ASSINADO (document_closed) ·
 * CANCELADO (reenvio por correção — §A.5). Estado, nunca URL/PII (§A.6).
 */
export const clicksignStatusEnum = pgEnum("clicksign_status", [
  "SEM_ENVELOPE",
  "AGUARDANDO_ASSINATURA",
  "ASSINADO",
  "CANCELADO",
  "EXPIRADO",
]);

/**
 * Via 2 — liberação por determinação da diretoria. NENHUMA = NC comum (penaliza o consultor);
 * PENDENTE = consultor flagou e aguarda supervisão; APROVADA = exceção reconhecida (não penaliza);
 * REPROVADA = volta a ser NC comum (Via 1).
 */
export const ncLiberacaoEnum = pgEnum("nc_liberacao", [
  "NENHUMA",
  "PENDENTE",
  "APROVADA",
  "REPROVADA",
]);

/** Sentido do trajeto no formulário de VT (§A.17): ida e volta são descritos separadamente. */
export const sentidoVtEnum = pgEnum("sentido_vt", ["IDA", "VOLTA"]);

/**
 * Cartão de transporte usado em cada condução (§A.17). Lista fechada definida pelo diretor;
 * OUTRO abre campo de texto obrigatório (`cartaoOutro`) para o candidato nomear o cartão.
 */
export const cartaoVtEnum = pgEnum("cartao_vt", ["BILHETE_UNICO", "CARTAO_TOP", "OUTRO"]);

/**
 * Status de cadastro do pacote de benefícios do candidato (§A.17 etapa 4). É POR CANDIDATO/admissão,
 * não por benefício: a pergunta que a operação faz é "os benefícios desta pessoa já foram
 * cadastrados?", e não "o VR já foi?". Toda admissão nasce PENDENTE.
 */
export const statusCadastroBeneficioEnum = pgEnum("status_cadastro_beneficio", [
  "PENDENTE",
  "CADASTRADO",
  // OS DOIS ESTÁGIOS DA TELA DE BENEFÍCIOS (§A.17 etapa 4, decisão do diretor). O pacote inteiro
  // caminha junto: é UM status por admissão, não um por benefício, porque a pergunta da operação é
  // "os benefícios desta pessoa já foram calculados?" e não "o VR já foi?".
  "AGUARDANDO_CALCULO",
  "BENEFICIO_CALCULADO",
  // ÓRFÃO: o terceiro estágio existiu por uma versão e o diretor decidiu por DOIS. Fica no enum
  // porque Postgres não remove valor sem recriar o tipo, e fora da sequência porque ninguém deve
  // voltar a usá-lo. Nenhuma linha o usa.
  "FINALIZADO",
]);

/**
 * A SEQUÊNCIA, na ordem em que a fila anda. Vive aqui, ao lado do enum, para a régua do botão, a do
 * lote e a do backend lerem a MESMA fonte: dois lugares diferentes divergiriam no primeiro ajuste.
 *
 * SÃO DOIS ESTÁGIOS (decisão do diretor), e o segundo ENCERRA: quem é marcado como calculado sai da
 * fila de trabalho e passa a viver na aba de Finalizados. O caminho é de ida e VOLTA: reverter traz
 * a pessoa de volta para a fila, e é o mesmo endpoint, com o destino invertido.
 *
 * `PENDENTE`, `CADASTRADO` e `FINALIZADO` são valores órfãos do enum e ficam fora daqui: nenhuma
 * linha os usa, e ninguém deve voltar a usá-los.
 */
export const SEQUENCIA_BENEFICIO = ["AGUARDANDO_CALCULO", "BENEFICIO_CALCULADO"] as const;
export type StatusBeneficio = (typeof SEQUENCIA_BENEFICIO)[number];

/** De onde veio o pedido da Sala de Espera: o próprio cliente ou a área de Seleção. */
export const origemSalaEsperaEnum = pgEnum("origem_sala_espera", ["CLIENTE", "SELECAO"]);

/**
 * ALTO VOLUME (onda 1): por qual porta a admissão foi ligada ao projeto.
 *
 * LIBERACAO é o caminho normal, o flag marcado no ato da liberação (onda 2), que é a FONTE
 * DEFINITIVA do projeto. CORRECAO é o conserto posterior, quando o consultor liberou sem flag ou
 * escolheu o projeto errado e alguém puxou a admissão para o projeto certo pela tela do Alto Volume
 * (onda 3).
 *
 * Os dois valem igual para a contagem: o que a origem guarda é a TRILHA de como o vínculo nasceu,
 * junto de `vinculado_por` e `vinculado_em`. Sem ela, um projeto cheio de correção manual seria
 * indistinguível de um projeto liberado certo desde o começo, e ninguém saberia onde o processo está
 * falhando.
 */
export const origemVinculoProjetoEnum = pgEnum("origem_vinculo_projeto", ["LIBERACAO", "CORRECAO"]);
