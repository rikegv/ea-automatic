/**
 * REGRAS DE DOMÍNIO DA VAGA (A&S, Central de Vagas, onda 1).
 *
 * Funções PURAS, testáveis sem banco e sem HTTP, no mesmo padrão do resto de `domain/`. A tela e o
 * service consomem daqui; nenhuma delas reimplementa a régua por conta própria.
 */

/**
 * NORMALIZAÇÃO DO CÓDIGO. Aparar espaço e subir a caixa é o mínimo para o mesmo código digitado de
 * duas formas ("sl123" e "SL123 ") não virar dois códigos diferentes.
 *
 * A CAIXA ALTA É DELIBERADA e vem da base real: além dos números puros, existe a família `SL...`, e
 * foi exatamente ali que uma limpeza anterior apagou as letras e transformou códigos distintos no
 * mesmo número. Aqui as letras ficam, apenas padronizadas.
 */
export function normalizarCodigoVaga(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/**
 * A TRAVA DE DUPLICIDADE: UM CÓDIGO = UM PROCESSO SELETIVO (correção do diretor, 21/08).
 *
 * O código é o número que o Pandapé gera para UMA abertura, digitado à mão pelo consultor. Cada
 * processo gera um número novo, ninguém reaproveita: então o mesmo cliente com o mesmo cargo tem
 * códigos DIFERENTES a cada abertura, e isso é o correto.
 *
 * O QUE ESTA FUNÇÃO SUBSTITUI: a trava anterior era "um código = um cargo" (barrava o mesmo código
 * apontando para cargos diferentes e liberava o código repetido no mesmo cargo). Ela contradizia o
 * mundo real nas duas pontas: proibia o que acontece e permitia o que não pode. A régua certa não
 * olha o cargo, olha o número: código já usado no sistema é duplicidade, ponto.
 *
 * ALCANCE: vale do CADASTRO NOVO PARA FRENTE. A importação da base (onda 3) NÃO passa por aqui, de
 * propósito, porque a base histórica traz códigos repetidos e travar a importação perderia vaga; lá
 * a linha conflitante entra marcada para revisão. É pelo mesmo motivo que o banco tem índice comum,
 * e não unique, em `vagas.codigo`.
 */
export function codigoJaUsado(codigo: string, existentes: string[]): boolean {
  const alvo = normalizarCodigoVaga(codigo);
  return existentes.some((e) => normalizarCodigoVaga(e) === alvo);
}

/**
 * A CONTRAPARTE DA ABERTURA (frente 2 da OST de 22/08).
 *
 * Toda vaga tem os dois lados preenchidos, e nunca os dois na mão: quem abre é carimbado pelo PAPEL
 * DE A&S da sessão, e a trilha pede só o lado oposto. Recruiter abrindo grava `recruiter = eu` e
 * escolhe o consultor; consultor abrindo grava `consultor = eu` e escolhe o recruiter.
 *
 * POR QUE UMA FUNÇÃO PURA, e não um `if` no service: é a régua que a tela e o backend precisam
 * responder igual. A tela usa para saber qual seletor desenhar, o service para saber em qual coluna
 * carimbar, e as duas leem daqui.
 *
 * `papelAs` nulo é quem não trabalha em A&S: devolve os dois lados vazios, e quem decide o que fazer
 * com isso é o service (hoje, barrar a abertura com mensagem clara).
 */
export function ladosDaVaga(
  papelAs: "CONSULTOR" | "RECRUITER" | null | undefined,
  quemAbreId: string,
  contraparteId: string | null | undefined,
): { consultorId: string | null; recruiterId: string | null } {
  if (papelAs === "RECRUITER") {
    return { recruiterId: quemAbreId, consultorId: contraparteId ?? null };
  }
  if (papelAs === "CONSULTOR") {
    return { consultorId: quemAbreId, recruiterId: contraparteId ?? null };
  }
  return { consultorId: null, recruiterId: null };
}

/**
 * A TRAVA DO FECHAMENTO: não se fecha mais vaga do que se abriu.
 *
 * O nº de vagas fechadas é quantas posições foram preenchidas de fato, então ele cabe dentro da meta
 * e nunca acima dela. Vazio (ninguém informou) não é erro: só o número maior que a meta é.
 */
export function vagasFechadasExcedemPosicoes(
  vagasFechadas: number | null | undefined,
  posicoes: number,
): boolean {
  if (vagasFechadas === null || vagasFechadas === undefined) return false;
  return vagasFechadas > posicoes;
}
