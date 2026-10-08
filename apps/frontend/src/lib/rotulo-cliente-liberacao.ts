/**
 * Rótulo e busca do cliente no seletor da Liberação Admissional (/liberacao).
 *
 * DECISÃO DO DIRETOR (ajuste do dropdown de cliente): a opção mostra, na mesma linha e sempre, o
 * NOME DA OPERAÇÃO e o CNPJ formatado, nessa ordem. O CÓDIGO do cliente NÃO entra: a seleção não
 * conhece o código do sistema do GI, então só confundia. A busca casa pelo nome (via rótulo) e pelo
 * CNPJ só em dígitos (via o campo `busca` da opção do `Select`), então quem digita "12345678000190"
 * acha o "12.345.678/0001-90" sem precisar da pontuação.
 *
 * Pura e sem dependência de browser: mora no lib para ser testável fora do componente de página.
 */

interface ClienteRotulo {
  razaoSocial: string;
  nomeOperacao: string | null;
  cnpj: string | null;
}

/** Só os dígitos do CNPJ: alimenta a BUSCA (quem digita só números acha o formatado). */
export function cnpjDigitos(cnpj: string | null): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

/**
 * CNPJ FORMATADO para EXIBIÇÃO: "12.345.678/0001-90". Sem CNPJ cadastrado (ou com formato
 * inesperado), mostra "Não Cadastrado" (§A.24 title case, §A.11 sem travessão), nunca vazio.
 */
export function fmtCnpj(cnpj: string | null): string {
  const d = cnpjDigitos(cnpj);
  if (d.length !== 14) return "Não Cadastrado";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Rótulo do cliente no seletor: "nome operacional · CNPJ formatado". Sem nome operacional, cai para
 * a razão social (o CNPJ continua). O código NÃO entra (ver o bloco acima).
 */
export function rotuloCliente(c: ClienteRotulo): string {
  return `${c.nomeOperacao ?? c.razaoSocial} · ${fmtCnpj(c.cnpj)}`;
}
