/**
 * OBRIGATORIEDADE DE PENDÊNCIA POR CLIENTE (OST da tela de gestão de obrigatoriedade). Domínio PURO.
 *
 * O PROBLEMA. `pendenciasObrigatorias` era uma lista GLOBAL cobrada de todo mundo. Nem todo cliente
 * trabalha com todo item: quando o Centro de Custo entrou como obrigatório, cliente que não usa
 * Centro de Custo passou de "completo" para "parcial" sem nada ter mudado no processo dele.
 *
 * A CHAVE É CANÔNICA, não o rótulo. O rótulo ("Centro de custo", "Gestor / BP") é texto de tela e já
 * mudou uma vez; a chave (`CENTRO_CUSTO`, `GESTOR_BP`) é contrato de banco e não muda. Isto é o que
 * impede a config de um cliente virar lixo silencioso no dia em que alguém melhorar um rótulo.
 *
 * AUSÊNCIA DE LINHA = OBRIGATÓRIO. É a decisão que preserva o comportamento atual: cliente sem
 * configuração nenhuma se comporta exatamente como hoje, e nenhum cliente existente muda até o
 * diretor mexer. Só linha com `obrigatorio = false` desliga.
 *
 * §A.6: só códigos de cliente e chaves de item. Nenhum dado pessoal.
 */

/** As chaves configuráveis, na ORDEM em que a tela as apresenta. */
export const CHAVES_PENDENCIA = [
  "CLIENTE",
  "CARGO",
  "SALARIO",
  "TIPO_CONTRATO",
  "DATA_ADMISSAO",
  "TERMO_BANCO",
  "BENEFICIOS",
  "ESCALA",
  "CENTRO_CUSTO",
  "SETOR",
  "GESTOR_BP",
  // UNIFORME (OST Onda 3, item 1): a pendência é RESPONDER "possui uniforme? sim/não", não ter
  // uniforme. Configurável como os demais, então cliente que não trabalha com uniforme desliga.
  "UNIFORME",
] as const;

export type ChavePendencia = (typeof CHAVES_PENDENCIA)[number];

/**
 * Rótulo de cada chave. É a MESMA string que a régua devolve como pendência hoje, de propósito: a
 * tela do card, o modal e o log de passagem continuam lendo exatamente o texto que já liam.
 */
export const ROTULO_PENDENCIA: Record<ChavePendencia, string> = {
  CLIENTE: "Cliente",
  CARGO: "Cargo",
  SALARIO: "Salário",
  TIPO_CONTRATO: "Tipo de contrato",
  DATA_ADMISSAO: "Data de admissão",
  TERMO_BANCO: "Termo de Banco",
  BENEFICIOS: "Pacote de benefícios",
  ESCALA: "Escala",
  CENTRO_CUSTO: "Centro de custo",
  SETOR: "Setor",
  GESTOR_BP: "Gestor / BP",
  UNIFORME: "Uniforme",
};

/**
 * Descrição curta por item, para a tela dizer o que cada interruptor governa sem o diretor precisar
 * adivinhar. §A.11: sem travessão.
 */
export const AJUDA_PENDENCIA: Record<ChavePendencia, string> = {
  CLIENTE: "Cliente vinculado à admissão.",
  CARGO: "Cargo vinculado à admissão.",
  SALARIO: "Salário da folha.",
  TIPO_CONTRATO: "Temporário, Terceirizado, Estágio, Interno, Fopag ou Jovem Aprendiz.",
  DATA_ADMISSAO: "Data de admissão. Não é cobrada em admissão de banco, que cobra o Termo.",
  TERMO_BANCO: "Termo de Banco entregue. Só vale para admissão de banco.",
  BENEFICIOS: "Pacote de benefícios, estruturado ou o texto legado.",
  ESCALA: "Escala de trabalho.",
  CENTRO_CUSTO: "Centro de custo da folha.",
  SETOR: "Setor da folha.",
  GESTOR_BP: "Gestor ou BP responsável.",
  UNIFORME: "Respondido se o candidato possui uniforme. Ter uniforme não bloqueia o fluxo.",
};

/**
 * A configuração de UM cliente: o conjunto de chaves DESLIGADAS. Guardar o que está desligado (e não
 * o que está ligado) é o que faz "sem config" significar "tudo obrigatório" sem nenhum caso especial.
 */
export type ConfigPendencias = ReadonlySet<ChavePendencia>;

/** Config vazia: tudo obrigatório. É o padrão de qualquer cliente que o diretor não configurou. */
export const TUDO_OBRIGATORIO: ConfigPendencias = new Set<ChavePendencia>();

/**
 * O item é exigido deste cliente? Config ausente ou chave ausente da config → sim.
 *
 * É a única função que decide isso, e é por onde os QUATRO pontos de cálculo passam. Um ponto novo
 * que esqueça de consultá-la volta a cobrar item desligado, então ela é o gargalo de propósito.
 */
export function exigido(chave: ChavePendencia, config?: ConfigPendencias | null): boolean {
  return !config?.has(chave);
}

/** Uma linha da configuração, como a tela e o banco a enxergam. */
export interface ItemConfigPendencia {
  chave: ChavePendencia;
  rotulo: string;
  ajuda: string;
  obrigatorio: boolean;
}

/** Monta a lista COMPLETA de itens de um cliente, na ordem da tela, a partir do que está desligado. */
export function itensDoCliente(config?: ConfigPendencias | null): ItemConfigPendencia[] {
  return CHAVES_PENDENCIA.map((chave) => ({
    chave,
    rotulo: ROTULO_PENDENCIA[chave],
    ajuda: AJUDA_PENDENCIA[chave],
    obrigatorio: exigido(chave, config),
  }));
}

/** Valida uma chave vinda da rede (payload da tela) antes de virar linha de banco. */
export function ehChaveValida(v: unknown): v is ChavePendencia {
  return typeof v === "string" && (CHAVES_PENDENCIA as readonly string[]).includes(v);
}
