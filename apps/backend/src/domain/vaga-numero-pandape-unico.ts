/**
 * ─ A VIOLAÇÃO DO NÚMERO DO PANDAPÉ REPETIDO, RECONHECIDA EM UM LUGAR SÓ ────────────────────────
 *
 * A migration 0150 criou `uq_vagas_id_vacancy_pandape`, o unique PARCIAL que torna IMPOSSÍVEL duas
 * vagas com o mesmo número do Pandapé. Este arquivo é a outra metade da decisão do diretor: a
 * violação tem de chegar a quem digitou como FRASE, nunca como erro cru.
 *
 * ┌─ O RECONHECIMENTO É POR CÓDIGO E POR NOME DE ÍNDICE, NUNCA POR TEXTO ────────────────────────┐
 * │ `23505` é o `SQLSTATE` de violação de unique, e é contrato do Postgres: ele não muda de versão │
 * │ para versão. A MENSAGEM muda, é traduzida pelo locale do servidor e já mudou de formato entre │
 * │ releases, então um `includes("duplicate key")` quebra CALADO, no pior momento possível: a      │
 * │ violação volta a sair como 500 e ninguém percebe, porque o caminho de erro não tem teste de    │
 * │ produção. Pelo mesmo motivo o NOME DO ÍNDICE é exigido: a tabela `vagas` tem outros uniques, e │
 * │ responder "número do Pandapé repetido" a qualquer 23505 mentiria sobre qual campo colidiu.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6: A MENSAGEM DO POSTGRES NÃO É REPASSADA, E AQUI NÃO É ESCRÚPULO DE ESTILO ─────────────┐
 * │ O `detail` do 23505 carrega o VALOR que violou o índice ("Key (id_vacancy_pandape)=(3781368)  │
 * │ already exists"), e o repasse publicaria dado de origem na resposta de erro e no log. O que    │
 * │ sai daqui é uma frase FIXA, sem interpolação nenhuma: nem o número, que é o identificador da   │
 * │ vaga no ATS e não acrescenta nada para quem acabou de digitá-lo.                               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOIS NOMES DE PROPRIEDADE porque os drivers divergem: o `postgres` (postgres-js, que é o desta
 * casa) expõe `constraint_name`, o `pg` (node-postgres) expõe `constraint`. Ler os dois custa uma
 * linha e protege de uma troca de driver virar regressão silenciosa no caminho de erro.
 */

/** O nome do unique parcial criado pela migration 0150. É ele que identifica a colisão. */
export const UQ_VAGAS_ID_VACANCY_PANDAPE = "uq_vagas_id_vacancy_pandape";

/**
 * A FRASE QUE CHEGA A QUEM DIGITOU O NÚMERO.
 *
 * §A.11: sem travessão. §A.24 não se aplica (mensagem de erro não é título nem tag), então escrita
 * normal, maiúscula só na primeira palavra. Ela diz o que aconteceu E o que fazer: sem a segunda
 * parte, quem está cadastrando não sabe que a vaga já existe em outra linha e cadastra de novo.
 */
export const MENSAGEM_NUMERO_PANDAPE_DUPLICADO =
  "Já existe uma vaga com esse número do Pandapé. Cada vaga do Pandapé tem uma linha só no EA: " +
  "procure a vaga pelo número na Central de Vagas em vez de cadastrar outra.";

/** O que um erro de driver do Postgres oferece, e nada além do que esta régua lê. */
interface ErroDeDriver {
  readonly code?: unknown;
  readonly constraint_name?: unknown;
  readonly constraint?: unknown;
}

/**
 * `23505` é o SQLSTATE de violação de unique. Só o código, nunca a mensagem.
 *
 * ┌─ PRIVADA DE PROPÓSITO, E A PRIVACIDADE É A TRAVA ─────────────────────────────────────────────┐
 * │ Ela diz SIM para a colisão de QUALQUER unique da tabela. Exportada ao lado da estrita, viraria │
 * │ a escolha errada mais fácil de fazer: quem precisasse tratar a colisão do número importaria a  │
 * │ primeira que o editor sugerisse, e passaria a responder "número do Pandapé repetido" a uma      │
 * │ colisão de candidatura, mentindo sobre qual campo colidiu. O único símbolo público que decide  │
 * │ é `ehNumeroPandapeDuplicado`, que exige AS DUAS condições.                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function ehViolacaoDeUnique(err: unknown): boolean {
  const e = (err ?? {}) as ErroDeDriver;
  return typeof e.code === "string" && e.code === "23505";
}

/** O nome da restrição violada, nos dois dialetos de driver. Vazio quando não há. Privada, idem. */
function restricaoViolada(err: unknown): string {
  const e = (err ?? {}) as ErroDeDriver;
  if (typeof e.constraint_name === "string") return e.constraint_name;
  if (typeof e.constraint === "string") return e.constraint;
  return "";
}

/**
 * ESTE erro é a colisão do número do Pandapé, e não outra qualquer.
 *
 * AS DUAS CONDIÇÕES JUNTAS, e nenhuma sozinha: o código sem o nome responderia pela colisão de
 * qualquer unique da tabela, e o nome sem o código casaria um erro que nem é de unicidade.
 */
export function ehNumeroPandapeDuplicado(err: unknown): boolean {
  return ehViolacaoDeUnique(err) && restricaoViolada(err) === UQ_VAGAS_ID_VACANCY_PANDAPE;
}
