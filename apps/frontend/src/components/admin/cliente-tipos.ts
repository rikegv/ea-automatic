import type { TipoMarcacao } from "@ea/shared-types";

/**
 * Tipos compartilhados da tela de Clientes e do modal de cadastro/edição (`ClienteModal`). Moram
 * fora da `page.tsx` para que o modal e a página leiam a MESMA forma, sem duplicar a interface nem
 * importar de um arquivo de rota. A resposta de `GET /admin/clientes` traz todas as colunas do
 * cliente (o service faz `select()` sem projeção), então os atributos de padrão abaixo vêm prontos.
 */
export interface Cliente {
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
  // Atributos fixos e de padrão do cliente (§A.3). O padrão pré-preenche o wizard; editáveis.
  empresaGrupo?: string | null;
  regiao?: string | null;
  descricaoRegiao?: string | null;
  beneficiosPadrao?: string | null;
  escalaPadrao?: string | null;
  enderecoPadrao?: string | null;
  // Camada de pagamento do benefício (§A.17 etapa 4). Nascem nulas: "não informado" na ausência.
  periodicidadeBeneficio: "CADA_5_DIAS" | "CADA_15_DIAS" | "MENSAL" | null;
  diaPagamentoBeneficio: number | null;
  diasPrimeiroCredito: number | null;
  // Tipo de marcação de ponto no iFractal. NOT NULL no banco (default APLICATIVO).
  tipoMarcacao: TipoMarcacao;
  ativo: boolean;
  // Vínculo cliente ↔ entidade Soulan empregadora (resolvido no backend).
  empresaVinculo?: string | null;
  cnpjVinculo?: string | null;
  tipoServico?: string | null;
  tipoServicoRotulo?: string | null;
  // Opção de vínculo atual (id do catálogo) para pré-selecionar o select na edição.
  vinculoOpcaoId?: string | null;
  // Segmento e comercial (Onda E). Guardamos o ID; o rótulo do segmento vem resolvido do backend,
  // o do comercial NÃO (§A.6) e é resolvido pelo catálogo que a tela já carrega.
  segmentoId?: number | null;
  comercialId?: number | null;
  segmentoRotulo?: string | null;
}

/** Opção de vínculo (empresa Soulan/tipo/filial) para o select de contrato do cliente. */
export interface VinculoOpcao {
  id: string;
  label: string;
  tipoServico: string;
}
