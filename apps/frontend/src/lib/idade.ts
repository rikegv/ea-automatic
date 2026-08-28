/**
 * A IDADE A PARTIR DA DATA DE NASCIMENTO, e o aviso de menor de idade (ajuste 5 do diretor).
 *
 * ┌─ ESTE ARQUIVO NÃO INVENTA NADA: ele MUDA DE LUGAR o que já existia ─────────────────────────┐
 * │ A régua vinha do wizard de Nova Admissão (`app/(app)/nova/page.tsx`), onde `calcIdade` era   │
 * │ função local e `menorIdade` era um booleano derivado ali mesmo. O diretor pediu a MESMA      │
 * │ inteligência no cadastro de candidato do A&S, e a única forma de não ter duas versões dela é │
 * │ ter uma só. O corpo de `calcIdade` foi copiado LINHA POR LINHA, sem ajuste de comportamento  │
 * │ nem de texto (§A.26): a mesma expressão regular, a mesma correção de aniversário e o mesmo   │
 * │ `null` para data que não casa.                                                               │
 * │                                                                                              │
 * │ POR QUE ISSO IMPORTA: o wizard é tela validada e em produção. Se a idade que ele mostra      │
 * │ mudasse de valor por causa desta mudança, seria uma regressão silenciosa numa tela que        │
 * │ ninguém pediu para mexer. Por isso o teste do arquivo trava o comportamento em vez de         │
 * │ descrevê-lo.                                                                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: idade é DERIVADA de um dado que o formulário já tem na mão. Nada é persistido por causa
 * disto, nada trafega, e a data de nascimento não passa a aparecer em lugar nenhum novo.
 */

/** A MAIORIDADE, em um lugar só. Escrita como constante para o teste poder citá-la. */
export const MAIORIDADE = 18;

/**
 * A idade em anos completos, ou `null` quando a data não é uma data ISO (`AAAA-MM-DD`).
 *
 * `null` É "NÃO DÁ PARA SABER", e não zero: campo vazio, meio digitado ou em outro formato não tem
 * idade, e devolver zero faria o chamador tratar quem não informou nada como recém-nascido, o que
 * dispararia o aviso de menor de idade em todo formulário em branco.
 */
export function calcIdade(nasc: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nasc);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hoje = new Date();
  let idade = hoje.getFullYear() - y;
  if (hoje.getMonth() + 1 < mo || (hoje.getMonth() + 1 === mo && hoje.getDate() < d)) idade--;
  return idade;
}

/**
 * A pessoa é menor de idade?
 *
 * IDADE DESCONHECIDA NÃO É MENOR DE IDADE (`null` devolve `false`), e essa é a mesma leitura que o
 * wizard já fazia (`idade !== null && idade < 18`). Um formulário em branco não pode acusar menor de
 * idade: o aviso perderia o sentido justamente por aparecer sempre.
 */
export function ehMenorDeIdade(idade: number | null): boolean {
  return idade !== null && idade < MAIORIDADE;
}

/** O texto da idade sob o campo. Mesmo formato do wizard ("N anos"). */
export function rotuloIdade(idade: number | null): string | null {
  return idade === null ? null : `${idade} anos`;
}

/** O texto do aviso, com o mesmo enunciado que o wizard já mostrava. */
export function avisoMenorDeIdade(idade: number | null): string | null {
  return ehMenorDeIdade(idade) ? `Candidato menor de idade (${idade} anos)` : null;
}
