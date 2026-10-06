import { normBusca } from "@/lib/busca-nome";

/**
 * O recorte do cliente que a busca da tela de Clientes enxerga: as colunas que a tabela mostra. É
 * um subconjunto do `Cliente` da página, de propósito, para a função pura não depender da tela.
 */
export interface ClienteBuscavel {
  codCliente: string;
  razaoSocial: string;
  cnpj: string | null;
  nomeOperacao: string | null;
  empresaVinculo?: string | null;
  cnpjVinculo?: string | null;
  tipoServicoRotulo?: string | null;
  ativo: boolean;
}

/**
 * A BUSCA DA TELA DE CLIENTES, em função pura (pedido do diretor: casar TODAS as colunas da tabela).
 *
 * Mora aqui, e não inline no componente, para o teste do `tester` guardar a régua de verdade: com o
 * match inline, o teste só checava uma réplica e a divergência passava despercebida. O match casa o
 * termo, pela régua `normBusca` (sem acento, sem caixa, a mesma da Esteira), contra: código, razão
 * social, CNPJ, nome de operação, empresa do vínculo, CNPJ do vínculo, tipo de serviço e o rótulo de
 * status. Cada campo nulável vira "" para a ausência não sumir da busca. Termo vazio não filtra.
 */
export function casaBuscaCliente(c: ClienteBuscavel, termo: string): boolean {
  const q = normBusca(termo);
  if (!q) return true;
  const campos = [
    c.codCliente,
    c.razaoSocial,
    c.cnpj ?? "",
    c.nomeOperacao ?? "",
    c.empresaVinculo ?? "",
    c.cnpjVinculo ?? "",
    c.tipoServicoRotulo ?? "",
    c.ativo ? "ativo" : "inativo",
  ];
  return campos.some((campo) => normBusca(campo).includes(q));
}
