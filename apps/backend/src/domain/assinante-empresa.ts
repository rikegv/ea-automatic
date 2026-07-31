/**
 * DOMÍNIO PURO do ASSINANTE DA EMPRESA (INT-4). Sem I/O.
 *
 * O CONTEXTO: um contrato de trabalho tem DOIS assinantes, o funcionário e a empresa. O funcionário é
 * individual por admissão (vem do candidato). A empresa é institucional: quase sempre a MESMA pessoa
 * assina por todos os contratos, e um ou outro cliente exige representante próprio.
 *
 * O MODELO é o mesmo da pasta-pai do Drive (§A.5 / `drive-pasta-pai.service`): um PADRÃO e EXCEÇÕES
 * por cliente. A precedência é `exceção do cliente > padrão`, e está isolada aqui como função pura
 * para ser testável sem banco.
 *
 * §A.6: o CPF do representante é PII. É persistido por necessidade (a Clicksign exige documentação do
 * signatário para a assinatura ter valor jurídico) e NUNCA é logado, igual ao CPF do candidato.
 */

/** Papéis do requirement da Clicksign usados pelo EA (confirmados na sondagem de 28/07). */
export const PAPEL_FUNCIONARIO = "employee";
export const PAPEL_EMPRESA = "employer";

/**
 * GRUPOS de assinatura (campo `group` do signatário na Clicksign). Grupo maior só assina depois que
 * TODOS do grupo anterior assinaram, e só é NOTIFICADO quando o grupo dele fica ativo. Mesmo grupo
 * significa assinatura EM PARALELO, sem ordem entre si.
 *
 * O funcionário é sempre o grupo 1 e assina primeiro. Os representantes da empresa vêm depois, cada
 * um no grupo derivado da ORDEM cadastrada. O ganho operacional é a notificação: quem assina dezenas
 * de contratos não recebe convite enquanto não for a vez dele.
 *
 * ARMADILHA CONHECIDA (sondagem de 28/07): omitir o campo `group` NÃO cai no grupo 1, como a
 * documentação diz. A API atribui `max+1`, ou seja, joga o signatário para o FIM da fila. Por isso o
 * EA manda o grupo EXPLÍCITO em todo signatário, sempre.
 */
export const GRUPO_FUNCIONARIO = 1;

/**
 * Grupo do representante da empresa a partir da ORDEM cadastrada: ordem 1 vira grupo 2, ordem 2 vira
 * grupo 3, e assim por diante, porque o grupo 1 é do funcionário.
 *
 * Representantes na MESMA ordem caem no MESMO grupo, que é exatamente o que faz eles assinarem em
 * paralelo. Lacuna na ordem é tolerada pela API (grupos não precisam ser contíguos), então não
 * normalizamos a numeração: a ordem que o diretor cadastrou é a que vale.
 */
export function grupoDaOrdem(ordem: number): number {
  return Math.max(1, Math.trunc(ordem)) + GRUPO_FUNCIONARIO;
}

/** Só dígitos. */
export function soDigitos(cpf: string | null | undefined): string {
  return (cpf ?? "").replace(/\D/g, "");
}

/**
 * CPF com dígito verificador conferido. Rejeita também as sequências repetidas (00000000000 até
 * 99999999999), que passam no cálculo mas não são CPF.
 *
 * Por que validar aqui e não só confiar na Clicksign: um CPF inválido só estouraria na hora de criar
 * o signatário, ou seja, no meio do disparo do envelope, com o kit já gerado. Barrar no cadastro faz
 * o erro aparecer para quem pode corrigi-lo, no momento certo.
 */
export function cpfValido(cpf: string | null | undefined): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || new Set(d).size === 1) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(d[i]) * (tamanho + 1 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== Number(d[tamanho])) return false;
  }
  return true;
}

/** "11144477735" -> "111.444.777-35". Formato que a API da Clicksign exige (cru dá 400). */
export function formatarCpf(cpf: string): string {
  const d = soDigitos(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** E-mail aceitável. Deliberadamente simples: quem valida de verdade é o envio da Clicksign. */
export function emailValido(email: string | null | undefined): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((email ?? "").trim());
}

/**
 * Nome aceito pela Clicksign como signatário: NOME E SOBRENOME (duas palavras no mínimo) e SEM
 * DÍGITO. Levantado contra a API em 28/07: "Joao" e "Representante Cliente 631" são recusados com
 * `name não está em um formato válido`; "Representante Cliente" passa.
 *
 * Por que validar no cadastro e não deixar a Clicksign reclamar: a recusa dela só apareceria na hora
 * de criar o signatário, ou seja, no meio do disparo do envelope, com o kit já gerado e o consultor
 * sem entender o que houve. Mesma razão do CPF.
 */
export function nomeSignatarioValido(nome: string | null | undefined): boolean {
  const n = (nome ?? "").trim();
  if (!/^[\p{L}'\-.\s]+$/u.test(n)) return false; // letras, apóstrofo, hífen e ponto; nunca dígito
  return n.split(/\s+/).filter((p) => p.length > 0).length >= 2;
}

/** Um representante da empresa, como a tela cadastra e como o envelope consome. */
export interface AssinanteEmpresa {
  /** `null` = é o PADRÃO (vale para todo cliente sem exceção própria). */
  codCliente: string | null;
  nome: string;
  email: string;
  cpf: string;
  /** Ordem de assinatura no escopo. Mesma ordem = paralelo; ordens diferentes = sequência. */
  ordem: number;
  ativo: boolean;
  /** Vínculo (item 7): nível MAIS específico do escopo. `null`/ausente = escopo do cliente. */
  clienteVinculoId?: string | null;
}

/**
 * QUEM ASSINA pela empresa nesta admissão: o CONJUNTO INTEIRO da exceção do cliente, se ele tiver
 * qualquer representante próprio ativo; senão, o conjunto padrão. Lista vazia quando não há nenhum
 * dos dois (o chamador NÃO monta o envelope).
 *
 * TUDO OU NADA, nunca mistura. Se o cliente tem representante próprio, o padrão não entra junto: um
 * conjunto meio-cliente meio-padrão seria imprevisível, e a ordem de assinatura ficaria decidida por
 * acidente de cadastro em vez de decisão de quem cadastrou.
 *
 * Inativo nunca é escolhido. Desativar TODOS os representantes de um cliente faz ele voltar ao
 * padrão, que é o comportamento esperado de quem desliga a exceção.
 *
 * Ordena por `ordem` (e por nome no empate) para o envelope sair sempre igual: sem isso, a ordem dos
 * signatários no envelope dependeria da ordem que o banco devolveu.
 */
export function resolverAssinantes(
  candidatos: AssinanteEmpresa[],
  codCliente: string | null | undefined,
  clienteVinculoId?: string | null,
): AssinanteEmpresa[] {
  const ativos = candidatos.filter((c) => c.ativo);
  const cod = (codCliente ?? "").trim();
  // TRÊS NÍVEIS desde o item 7, do mais específico ao mais geral: vínculo (cliente + contrato),
  // cliente, padrão. Quem assina pelo contrato Temporário pode não ser quem assina pelo
  // Terceirizado do MESMO cliente, e o nível do vínculo é o único que sabe distinguir os dois.
  // Conjunto VAZIO num nível não é resposta: cai para o próximo, como o cliente já caía no padrão.
  const doVinculo = clienteVinculoId
    ? ativos.filter((c) => c.clienteVinculoId === clienteVinculoId)
    : [];
  const doCliente = cod
    ? ativos.filter((c) => (c.codCliente ?? "").trim() === cod && !c.clienteVinculoId)
    : [];
  const conjunto =
    doVinculo.length > 0
      ? doVinculo
      : doCliente.length > 0
        ? doCliente
        : ativos.filter((c) => c.codCliente === null && !c.clienteVinculoId);
  return [...conjunto].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * FASE do envelope, para a tela avisar o certo antes de uma ação destrutiva. O consultor não precisa
 * saber em que estado a Clicksign está: o sistema detecta.
 *
 *  - `NAO_ENVIADO`: kit anexado na fila, envelope ainda não existe. Cancelar/trocar não toca a
 *    Clicksign e não notifica ninguém.
 *  - `ENVIADO`: envelope em andamento, o funcionário ainda não assinou. Cancelar interrompe e o
 *    funcionário é notificado.
 *  - `ASSINADO`: já assinado. Cancelar aqui é o caso mais grave: desfaz um documento válido e o
 *    funcionário precisa ser avisado.
 *  - `ENCERRADO`: cancelado ou expirado, nada a desfazer.
 */
export type FaseEnvelope = "NAO_ENVIADO" | "ENVIADO" | "ASSINADO" | "ENCERRADO";

/** Deriva a fase a partir do status do envelope e da existência de kit anexado. */
export function faseEnvelope(clicksignStatus: string, temKit: boolean): FaseEnvelope {
  if (clicksignStatus === "AGUARDANDO_ASSINATURA") return "ENVIADO";
  if (clicksignStatus === "ASSINADO") return "ASSINADO";
  if (clicksignStatus === "CANCELADO" || clicksignStatus === "EXPIRADO") return "ENCERRADO";
  return temKit ? "NAO_ENVIADO" : "ENCERRADO";
}

/**
 * Aviso de confirmação por fase. O texto muda porque a CONSEQUÊNCIA muda: sem envelope não há quem
 * notificar; com envelope em andamento o funcionário recebe o aviso; já assinado, desfaz-se um
 * documento válido.
 */
export function avisoDaFase(fase: FaseEnvelope, acao: "cancelar" | "trocar"): string {
  const fim =
    acao === "trocar"
      ? " Depois disso, envie o kit novo pelo Gerador de Kit."
      : "";
  switch (fase) {
    case "NAO_ENVIADO":
      return (
        "Esta ação vai cancelar o envelope atual, que ainda NÃO foi enviado. Ninguém é notificado." +
        fim
      );
    case "ENVIADO":
      return (
        "Esta ação vai cancelar o envelope em andamento na Clicksign e notificar o funcionário." + fim
      );
    case "ASSINADO":
      return (
        "Esta ação vai cancelar um envelope JÁ ASSINADO e notificar o funcionário. O contrato deixa " +
        "de valer no EA." + fim
      );
    default:
      return "Este envelope já está encerrado (cancelado ou expirado). Não há o que cancelar." + fim;
  }
}
