// Tipos do Portal do Candidato.
// Sugestão: mover para o pacote `shared-types` do monorepo, para o backend (NestJS) e o frontend usarem os mesmos contratos.

/** Estado de um campo lido pela IA. */
export type EstadoCampo =
  | "lido" // a Sol leu com segurança
  | "confira" // leu, mas com baixa confiança: pedir conferência
  | "nao-lido" // não conseguiu ler (ex.: parte desfocada)
  | "aguardando"; // documento ainda não enviado

export interface CampoDocumento {
  chave: string;
  rotulo: string;
  valor?: string;
  estado: EstadoCampo;
  dica?: string;
  placeholder?: string;
  /** ocupa as 2 colunas no desktop */
  largo?: boolean;
}

export type StatusDocumento =
  | "confirmado"
  | "agora"
  | "ajuste"
  | "a-enviar"
  | "pulado"
  | "entregue";

export interface DocumentoCandidato {
  id: string;
  nome: string;
  nomeCurto: string;
  dica: string;
  necessario: boolean;
  status: StatusDocumento;
  tentativa?: number;
  tentativasMax?: number;
  campos: CampoDocumento[];
}

// V5-safe (PII-free): o cabecalho do portal NUNCA recebe nome completo. Modela so o
// primeiro nome, o cargo e o cliente. A inicial do avatar deriva do primeiro nome (uma
// letra), nao ha `nome` completo nem `iniciais` multi-letra para o componente exibir.
export interface Candidato {
  primeiroNome: string;
  cargo: string;
  cliente: string;
}

/** Etapas da auditoria exibidas na tela "Analisando". */
export type ResultadoAnalise = "processando" | "concluido" | "ajuste";

export interface StatusAnalise {
  etapa: number; // 0..ETAPAS_ANALISE.length
  resultado: ResultadoAnalise;
}
