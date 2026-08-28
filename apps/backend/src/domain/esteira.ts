/**
 * Regras puras da Esteira/Faróis (CLAUDE.md §A.3 / F8 / F12). Sem dependência de DB — testáveis
 * isoladamente. Complementam `frentes.ts` (gate contínuo do Cadastro, regra 3) cobrindo a
 * operação de status por frente e a reversão (recuo de etapa) com alerta.
 */
import {
  STATUS_CADASTRO_CONTRATO,
  STATUS_EXAME,
  STATUS_EXAME_LIBERADO_SEM_ASO,
  STATUS_INTEGRACAO,
} from "@ea/shared-types";
import { podeAbrirCadastro, type EstadoFrente, type FrenteTipo } from "./frentes";

/**
 * Progressão operacional dos status por frente — ordem do catálogo seedado
 * (`frente_status_catalogo.ordem`), que é a fonte de verdade dos seletores no front.
 *
 * EXAME e CADASTRO_CONTRATO já vêm em progressão nas arrays de `@ea/shared-types`. Em AUDITORIA,
 * o array de shared-types lista `ANALISE_OK` primeiro (prioridade de exibição/filtro), então a
 * progressão real (pendente → reenvio → ok → declinou) é fixada aqui — é o que define o que é
 * "recuo" (reversão). O conjunto de códigos é idêntico ao de shared-types.
 */
export const ORDEM_STATUS: Record<FrenteTipo, string[]> = {
  AUDITORIA: ["ANALISE_PENDENTE", "AGUARDA_REENVIO", "ANALISE_OK", "DECLINOU"],
  EXAME: [...STATUS_EXAME],
  CADASTRO_CONTRATO: [...STATUS_CADASTRO_CONTRATO],
  INTEGRACAO: [...STATUS_INTEGRACAO],
  /**
   * VAZIO DE PROPÓSITO, e esta é a linha mais importante do arquivo para a frente do iFractal.
   *
   * O catálogo de status do iFractal é GERENCIÁVEL pelo time (renomeia, acrescenta, escolhe qual
   * conclui), então a lista vive na TABELA `frente_status_catalogo`, não aqui. Deixar a semente
   * escrita neste mapa criaria uma segunda verdade que envelheceria no primeiro rename, e as
   * funções puras deste arquivo passariam a recusar um status que a tela oferece.
   *
   * Consequência deliberada: `isStatusValido` e `isReversao` respondem `false` para IFRACTAL, e o
   * serviço da Esteira NÃO os consulta para esta frente. Ele resolve validade e conclusão lendo o
   * catálogo do banco (`catalogoDinamico`). `isReversao` falso também é o comportamento pedido: no
   * iFractal o consultor move livre, em qualquer direção, sem alerta de recuo.
   */
  IFRACTAL: [],
};

/**
 * Status terminal que conclui cada frente (insumo do gate — regra 3).
 *
 * CADASTRO_CONTRATO conclui em `CADASTRADO` (era `INTEGRACAO` até a migration 0026, que renomeou o
 * concluinte). Esta linha é a chave de conclusão da frente: dela dependem `conclui()`, o gate do
 * Cadastro, `kitLiberado()` (gate F12 do kit/F9) e o disparo do envelope na Clicksign (INT-4).
 * Trocar o código aqui sem migrar `frentes_admissao.status` junto pararia o kit e a assinatura.
 */
export const STATUS_CONCLUI: Record<FrenteTipo, string> = {
  AUDITORIA: "ANALISE_OK",
  EXAME: "APTO",
  CADASTRO_CONTRATO: "CADASTRADO",
  // Concluir a INTEGRAÇÃO é o FIM da esteira: a admissão passa a viver no Gerenciador.
  INTEGRACAO: "REALIZADO",
  // SEMENTE, não verdade: quem conclui a frente do iFractal é a coluna `conclui` do catálogo no
  // banco, que o time edita. Este valor existe porque o mapa é TOTAL e serve de referência do que
  // o seed grava; nenhum caminho de código do iFractal o consulta.
  IFRACTAL: "FINALIZADO",
};

/**
 * Status que TAMBÉM concluem a frente, além do terminal principal de `STATUS_CONCLUI`.
 *
 * Existe por causa do `DESCONSIDERADA` da INTEGRAÇÃO (decisão do diretor): a admissão concluiu o
 * onboarding sem passar pela integração, então a frente FECHA (sai da fila, conta como concluída),
 * mas o terminal "de êxito" continua sendo o `REALIZADO`, que é o que diz que a integração
 * aconteceu de verdade. Dois sentidos diferentes, dois códigos diferentes.
 *
 * Só a INTEGRAÇÃO tem entrada aqui: para as demais frentes o mapa é vazio e `conclui()` responde
 * exatamente como antes.
 */
const CONCLUI_TAMBEM: Partial<Record<FrenteTipo, readonly string[]>> = {
  INTEGRACAO: ["DESCONSIDERADA"],
};

/** O status conclui a frente? */
/**
 * FRENTES CUJO CATÁLOGO DE STATUS VIVE NO BANCO, e não neste arquivo.
 *
 * Quem estiver aqui NÃO passa por `isStatusValido`/`conclui`: o serviço da Esteira resolve pelo
 * `frente_status_catalogo`. A lista existe para o desvio ser explícito e pesquisável, em vez de um
 * `if (tipo === "IFRACTAL")` solto no meio do serviço.
 */
export const FRENTES_STATUS_DINAMICO: readonly FrenteTipo[] = ["IFRACTAL"];

export function ehStatusDinamico(tipo: FrenteTipo): boolean {
  return FRENTES_STATUS_DINAMICO.includes(tipo);
}

export function conclui(tipo: FrenteTipo, status: string): boolean {
  return status === STATUS_CONCLUI[tipo] || (CONCLUI_TAMBEM[tipo] ?? []).includes(status);
}

/** O status pertence ao catálogo daquela frente? */
export function isStatusValido(tipo: FrenteTipo, status: string): boolean {
  return ORDEM_STATUS[tipo].includes(status);
}

/**
 * A transição `de → para` é um recuo (reversão) na progressão da frente?
 * Status fora do catálogo nunca caracteriza reversão (indexOf -1).
 */
export function isReversao(tipo: FrenteTipo, de: string, para: string): boolean {
  const ordem = ORDEM_STATUS[tipo];
  const i = ordem.indexOf(de);
  const j = ordem.indexOf(para);
  if (i === -1 || j === -1) return false;
  return j < i;
}

/**
 * O status ABRE O GATE do Cadastro? É a mesma pergunta que `podeAbrirCadastro` faz sobre a frente,
 * aqui em cima de um status solto.
 *
 * Existe por causa do "Liberado Para Cadastro Sem ASO": a AUDITORIA abre o gate concluindo, e o
 * EXAME abre de DUAS formas, concluindo ou sendo liberado. Uma função só, para o alerta de reversão
 * abaixo e o gate de verdade não poderem discordar sobre o que é "estar liberado".
 */
function abreGate(tipo: FrenteTipo, status: string): boolean {
  if (tipo === "EXAME" && status === STATUS_EXAME_LIBERADO_SEM_ASO) return true;
  return conclui(tipo, status);
}

/**
 * A reversão derruba um Cadastro já aberto? Verdadeiro quando uma frente que sustentava o gate
 * (AUDITORIA ou EXAME) deixa de sustentá-lo, recuando o gate, enquanto o Cadastro estava aberto. É o
 * gatilho do alerta de confirmação (reabrir pendência num candidato já em cadastro).
 *
 * DESFAZER A LIBERAÇÃO SEM ASO ENTRA AQUI (decisão do diretor, ajuste final da OST). Antes o teste
 * era `conclui(de)`, e o status liberado não conclui: voltar dele para "Agendado" fechava o gate EM
 * SILÊNCIO, numa admissão que podia já estar cadastrada, integrada e com o contrato em assinatura.
 * O alerta que o APTO sempre teve passa a valer para ele, que é o mesmo perigo pela mesma porta.
 *
 * O QUE **NÃO** ALERTA, e é o outro lado da mesma régua: ir do liberado para o APTO (o ASO chegou) e
 * do APTO para o liberado não avisam nada, porque o gate continua aberto nos dois. O alerta é sobre
 * FECHAR o gate, não sobre trocar de status.
 *
 * `cadastroAbertoAgora` deve ser derivado de `podeAbrirCadastro(frentes)` ANTES da mudança.
 */
export function reversaoDerrubaCadastro(
  tipo: FrenteTipo,
  de: string,
  para: string,
  cadastroAbertoAgora: boolean,
): boolean {
  return (
    (tipo === "AUDITORIA" || tipo === "EXAME") &&
    abreGate(tipo, de) &&
    !abreGate(tipo, para) &&
    cadastroAbertoAgora
  );
}

/**
 * A transição está DESFAZENDO a liberação sem ASO? Serve ao recado do alerta, que precisa dizer o
 * que de fato aconteceu: "reabrir pendência" descreve o recuo do APTO, não este caso.
 */
export function desfazLiberacaoSemAso(tipo: FrenteTipo, de: string, para: string): boolean {
  return tipo === "EXAME" && de === STATUS_EXAME_LIBERADO_SEM_ASO && !abreGate(tipo, para);
}

/** Reexporta o gate puro para quem opera a esteira (estado da regra 3). */
export { podeAbrirCadastro };
export type { EstadoFrente };
