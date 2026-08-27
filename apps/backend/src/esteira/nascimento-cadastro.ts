import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { frentesAdmissao } from "../db/schema";
import { STATUS_INICIAL_FRENTE } from "../domain/admissao";

type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | DbTransaction;

/**
 * NASCIMENTO DO CADASTRO, DA INTEGRAÇÃO **E DO IFRACTAL**, numa porta só (decisão do diretor, item 1
 * da OST dos 3 ajustes, estendida pela frente do iFractal).
 *
 * A REGRA NOVA: a Integração deixa de esperar o carimbo "Cadastrado" e passa a nascer no MESMO
 * instante que o Cadastro, quando o gate da regra 3 abre (Auditoria + Exame concluídas). Ela nasce
 * IGUAL a qualquer outra integração, no mesmo `A_AGENDAR`, sem marcação nem tratamento especial:
 * quem olha a fila não distingue quem chegou por aqui de quem chegou pelo caminho antigo.
 *
 * POR QUE UMA FUNÇÃO SÓ, e não a linha repetida onde já se inseria o Cadastro (§A.26). O Cadastro
 * nasce em TRÊS lugares, e não em um:
 *   1. `esteira.service.mudarStatus`      — o consultor move o status na tela;
 *   2. `auditoria.service.concluirFrente` — a I.A fecha a Auditoria sozinha (Fase 4, regra 2);
 *   3. `esteira.service.concluirExamePorAso` — o ASO validado pela I.A fecha o Exame.
 * Escrever a Integração à mão nos três é a receita do defeito que originou a §A.26: a transição
 * pós-ASO parou de funcionar porque só dois caminhos foram tocados, e nenhum teste pegou, porque o
 * elo que faltava não tinha teste. Com uma porta só, um caminho novo que nasça amanhã ou passa por
 * aqui, ou não cria Cadastro nenhum.
 *
 * O QUE NÃO MUDA, e é o motivo de o alcance ser seguro (§A.27):
 *   - `admissaoConcluidaSql` (Painel, Gerenciador, Alto Volume) exige Cadastro CONCLUÍDO e sem
 *     integração pendente. Com o Cadastro ainda aberto a primeira metade já é falsa, então
 *     antecipar o nascimento da Integração não move uma linha sequer daquela contagem.
 *   - o gate do kit (`kitLiberado`) nunca olhou a Integração, que roda em paralelo à assinatura;
 *   - `deriveFarolGlobal` olha só Auditoria e Exame.
 * O único número que se mexe é a fila da própria aba INTEGRAÇÃO, que é o alvo do pedido.
 *
 * O IFRACTAL ENTRA AQUI, e o motivo é o parágrafo acima: pendurando-o nesta porta ele herda os TRÊS
 * gatilhos de graça, sem que nenhum dos três caminhos precise ser tocado. Foi exatamente o que a
 * §A.26 cobra. Diferenças para com a Integração, ambas decisão do diretor:
 *   - nasce para TODOS os clientes, sem flag de "exige": todo cliente marca ponto de alguma forma;
 *   - o status inicial vem do CÓDIGO do catálogo (`STATUS_IFRACTAL_INICIAL`), porque a lista de
 *     status do iFractal é gerenciável e só o código é estável;
 *   - NÃO entra em gate nenhum. Não abre frente, não libera kit e, sobretudo, não entra em
 *     `admissaoConcluidaSql`: a admissão termina sem esperar o iFractal, e nenhuma das três
 *     contagens (Painel, Gerenciador, Alto Volume) se move por causa dele.
 *
 * IDEMPOTENTE pelo unique `(admissao_id, tipo)`: dois cliques simultâneos, ou um caminho que já
 * tenha criado a frente antes, caem no `onConflictDoNothing` e não duplicam nada.
 *
 * §A.6: opera só por id de admissão e tipo de frente, sem nenhum dado pessoal.
 */
export async function nascerCadastroEIntegracao(
  tx: Executor,
  opts: { admissaoId: string; agora: Date; exigeIntegracao: boolean },
): Promise<{ cadastroId: string | null; integracaoNasceu: boolean; ifractalNasceu: boolean }> {
  const { admissaoId, agora, exigeIntegracao } = opts;

  const [cadastro] = await tx
    .insert(frentesAdmissao)
    .values({
      admissaoId,
      tipo: "CADASTRO_CONTRATO",
      status: STATUS_INICIAL_FRENTE.CADASTRO_CONTRATO,
      concluida: false,
      dataInicio: agora,
    })
    .onConflictDoNothing({ target: [frentesAdmissao.admissaoId, frentesAdmissao.tipo] })
    .returning({ id: frentesAdmissao.id });

  // CLIENTE QUE NÃO EXIGE INTEGRAÇÃO segue fechando no Cadastro, exatamente como antes: a frente
  // não nasce, e o carimbo `concluiSemIntegracao` (esteira.service) continua sendo alcançado na
  // conclusão. É a metade da regra que esta OST NÃO toca.
  let integracaoNasceu = false;
  if (exigeIntegracao) {
    const [integracao] = await tx
      .insert(frentesAdmissao)
      .values({
        admissaoId,
        tipo: "INTEGRACAO",
        status: STATUS_INICIAL_FRENTE.INTEGRACAO,
        concluida: false,
        dataInicio: agora,
      })
      .onConflictDoNothing({ target: [frentesAdmissao.admissaoId, frentesAdmissao.tipo] })
      .returning({ id: frentesAdmissao.id });
    integracaoNasceu = Boolean(integracao);
  }

  // IFRACTAL: sem condicional, para TODOS os clientes. A frente da credencial de ponto abre junto
  // do Cadastro e o time de Ponto trabalha nela em paralelo ao resto da esteira.
  const [ifractal] = await tx
    .insert(frentesAdmissao)
    .values({
      admissaoId,
      tipo: "IFRACTAL",
      status: STATUS_INICIAL_FRENTE.IFRACTAL,
      concluida: false,
      dataInicio: agora,
    })
    .onConflictDoNothing({ target: [frentesAdmissao.admissaoId, frentesAdmissao.tipo] })
    .returning({ id: frentesAdmissao.id });
  const ifractalNasceu = Boolean(ifractal);

  // `returning` volta vazio quando o conflito engoliu o insert (a frente já existia). Quem chamou
  // precisa do id de qualquer forma, então relê. Custo de uma consulta só no caminho raro.
  if (cadastro) return { cadastroId: cadastro.id, integracaoNasceu, ifractalNasceu };
  const [existente] = await tx
    .select({ id: frentesAdmissao.id })
    .from(frentesAdmissao)
    .where(
      and(
        eq(frentesAdmissao.admissaoId, admissaoId),
        eq(frentesAdmissao.tipo, "CADASTRO_CONTRATO"),
      ),
    );
  return { cadastroId: existente?.id ?? null, integracaoNasceu, ifractalNasceu };
}
