import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { SITUACOES_VIVAS } from "../../domain/candidatura";

/**
 * A LISTA DAS SITUAÇÕES VIVAS, em SQL, para o `not exists` do expurgo.
 *
 * `sql.raw` E NÃO PARÂMETRO porque a subconsulta usa o ALIAS `k`, e a coluna do drizzle se
 * qualificaria como `as_candidaturas.situacao`, que não é o que o alias exige. Os valores vêm de
 * `SITUACOES_VIVAS`, constante de código derivada do vocabulário, e NUNCA de entrada de usuário:
 * não há concatenação de dado externo aqui. É o mesmo padrão do predicado do índice parcial em
 * `db/schema/tables.ts`, e pelo mesmo motivo.
 *
 * ┌─ POR QUE ESTA LISTA NÃO PODE SER DIGITADA À MÃO, e este é o ponto §A.6 do arquivo ────────────┐
 * │ ELA ESTAVA DIGITADA, com três valores, e a consequência é IRREVERSÍVEL: uma situação viva      │
 * │ ausente desta linha faz o expurgo enxergar uma pessoa EM PROCESSO como pessoa sem processo, e  │
 * │ anonimizá-la em silêncio, passados os 2 anos. Nenhum alarme toca, porque do ponto de vista do  │
 * │ serviço nada falhou. Foi exatamente o que o modelo de posição criaria: `ALOCADO` nasceu VIVO   │
 * │ no vocabulário e ficaria de fora daqui, e alguém ocupando posição OFICIAL de uma vaga seria    │
 * │ tratado como candidato encerrado. A janela é lenta, o defeito não.                             │
 * │                                                                                                │
 * │ DERIVAR É A CORREÇÃO INTEIRA, e a direção é fail-closed: `SITUACOES_VIVAS` é o complemento de  │
 * │ `ehSaidaSemExito`, então situação nova nasce VIVA, isto é, PROTEGIDA do expurgo, até alguém    │
 * │ decidir explicitamente que ela encerra o processo. O erro cai para o lado de não apagar.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const SITUACOES_VIVAS_SQL = sql.raw(SITUACOES_VIVAS.map((s) => `'${s}'`).join(", "));

/**
 * EXPURGO POR RETENÇÃO da Central de Candidatos (decisão do diretor, §A.6).
 *
 * A REGRA, em duas linhas:
 *   - candidato DESCARTADO: expurgado automaticamente 2 ANOS depois;
 *   - candidato de BANCO (`origem = BANCO_TALENTOS`): NÃO EXPIRA.
 *
 * O PRECEDENTE REUSADO é o `ExpurgoService` da Admissão (`admissoes/expurgo.service.ts`), e ele
 * encaixa inteiro: varredura in-process a cada 1h, com `timer.unref()`, que nula os identificadores
 * das linhas cujo prazo venceu e PRESERVA A LINHA. Não é o expurgo da staging: aquele apaga ARQUIVO
 * do disco por mtime, e aqui não há arquivo nenhum. O que se toma emprestado é o padrão do sweep e,
 * principalmente, a decisão de ANONIMIZAR em vez de DELETAR.
 *
 * POR QUE ANONIMIZAR E NÃO APAGAR A LINHA, que é a pergunta que o desenho tem de responder: apagar o
 * candidato levaria junto as candidaturas dele (a FK é CASCADE) e, com elas, a contagem de quem foi
 * aprovado em vagas passadas. Um processo de dois anos atrás passaria a mostrar 7 aprovados onde
 * houve 10, e o indicador de entrega da vaga mentiria para sempre. O que a LGPD pede é que o dado
 * PESSOAL não fique retido além do necessário, e é exatamente o dado pessoal que sai daqui: CPF,
 * e-mail, telefone, data de nascimento e o id do ATS. O nome é substituído por um marcador.
 *
 * O QUE FICA: cidade e UF, que sozinhas não identificam ninguém e sustentam a estatística regional,
 * e as candidaturas, que passam a apontar para uma pessoa sem identidade. É a mesma escolha do
 * `ExpurgoService`, que nula o CPF e o nome do substituído e mantém a linha de `dados_vaga_folha`.
 *
 * "DESCARTADO" É DO PROCESSO, NÃO DA PESSOA, e é o ponto mais delicado da regra. A mesma pessoa pode
 * estar descartada numa vaga e ativa em outra, então o prazo só começa a correr quando TODAS as
 * candidaturas dela estão encerradas SEM ÊXITO (descarte ou desistência). Quem tem UMA candidatura
 * VIVA (`SITUACOES_VIVAS`, o complemento exato de `ehSaidaSemExito`) NÃO entra na conta, em nenhuma
 * hipótese, e quem nunca se candidatou a nada também não: sem processo encerrado não há prazo a
 * contar.
 *
 * §A.6: este serviço não loga NADA além de uma contagem. Nenhum nome, nenhum id, nenhum CPF.
 */
@Injectable()
export class RetencaoCandidatosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("RetencaoCandidatosService");
  private timer?: NodeJS.Timeout;
  /** Mesma cadência do `ExpurgoService`: uma varredura por hora basta para um prazo de 2 anos. */
  private static readonly INTERVALO_MS = 60 * 60 * 1000;
  /** O prazo do diretor. Constante nomeada para a régua ser lida, não deduzida do SQL. */
  private static readonly RETENCAO = "2 years";

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  onModuleInit(): void {
    this.varrer();
    this.timer = setInterval(
      () => this.varrer(),
      RetencaoCandidatosService.INTERVALO_MS,
    );
    this.timer.unref?.();
  }

  /**
   * ─ A VARREDURA QUE FALHA VIRA LOG, E O PROCESSO SEGUE ────────────────────────────────────────
   *
   * ESTE MÉTODO EXISTE POR UM MOTIVO SÓ, e ele não é de estilo: as duas chamadas do `onModuleInit`
   * disparavam `void this.expurgar()` SEM captura. Promessa rejeitada sem `catch` é
   * `unhandledRejection`, e no Node 20 (esta VM roda a v20.20.2) isso MATA O PROCESSO. Não há
   * nenhum handler de `unhandledRejection` nem de `uncaughtException` no backend, conferido por
   * varredura: o comportamento padrão vale inteiro.
   *
   * O TAMANHO DO ESTRAGO É O PONTO. `onModuleInit` roda no BOOT, antes da primeira requisição, e o
   * serviço sobe sob `systemd --user` com restart automático: a falha da varredura vira
   * CRASH-LOOP, e leva junto Esteira, Admissões, Clicksign e o tick do cron, que não têm nada a
   * ver com A&S. Um expurgo que não rodou é uma linha de log; um backend que não sobe é a operação
   * inteira parada.
   *
   * O GATILHO IMEDIATO ERA CONHECIDO (a consulta cita valores de enum que um banco ainda não
   * migrado não conhece, e o Postgres devolve `invalid input value for enum`), mas a correção NÃO É
   * sobre ele: qualquer falha futura, uma queda de conexão na passada horária que seja, derrubava
   * o processo do mesmo jeito. É a captura que fecha isso, e não a ordem de subida.
   *
   * O PADRÃO É O DA CASA, o mesmo do `clicksign_notificado_em` (§A.5): falha registrada como ERRO,
   * visível, que não derruba o job. A varredura seguinte tenta de novo, e para um prazo de 2 anos
   * perder uma passada de hora em hora não custa nada.
   *
   * §A.6: SÓ A MENSAGEM DO ERRO VAI PARA O LOG. Nem o objeto do erro, nem a `detail` do Postgres
   * (que carrega o VALOR que violou a restrição, e num expurgo de candidato esse valor é o CPF),
   * nem a query, nem os parâmetros, nem o stack. Nenhum id, nenhum nome.
   */
  private varrer(): void {
    void this.expurgar().catch((err: unknown) => {
      this.logger.error(`Falha na varredura de retenção A&S: ${mensagemDoErro(err)}`);
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Uma passada. Devolve quantos candidatos foram anonimizados.
   *
   * O `update ... where` inteiro em SQL, e não em duas etapas (buscar depois atualizar), porque em
   * duas etapas os ids das pessoas a expurgar circulariam pela memória do processo sem necessidade,
   * e porque a operação passa a ser atômica: ou a linha vira anônima, ou fica como estava.
   */
  async expurgar(): Promise<number> {
    const linhas = await this.db.execute(sql`
      update as_candidatos c
         set nome = 'Candidato Expurgado',
             cpf = null,
             email = null,
             telefone = null,
             data_nascimento = null,
             id_candidate_pandape = null,
             anonimizado_em = now(),
             atualizado_em = now()
       where c.anonimizado_em is null
         -- CANDIDATO DE BANCO NÃO EXPIRA (decisão do diretor). É o banco de talentos: a pessoa está
         -- ali justamente para ser procurada daqui a três anos.
         and c.origem <> 'BANCO_TALENTOS'
         -- TEM DE HAVER PROCESSO ENCERRADO: sem candidatura nenhuma não há prazo a contar.
         and exists (select 1 from as_candidaturas k where k.candidato_id = c.id)
         -- E NENHUM PROCESSO VIVO OU BEM-SUCEDIDO. Descartado numa vaga e ativo em outra não conta:
         -- o descarte é do processo, não da pessoa. A lista das vivas é DERIVADA do domínio
         -- (ver SITUACOES_VIVAS_SQL, acima): digitá-la aqui é como uma pessoa em processo vira
         -- expurgada em silêncio.
         and not exists (
               select 1 from as_candidaturas k
                where k.candidato_id = c.id
                  and k.situacao in (${SITUACOES_VIVAS_SQL}))
         -- O PRAZO CORRE DO ÚLTIMO ENCERRAMENTO, não do primeiro: quem foi descartado em três vagas
         -- ao longo de dois anos ainda é alguém que o time viu recentemente.
         and (select max(k.atualizado_em) from as_candidaturas k where k.candidato_id = c.id)
             <= now() - interval '${sql.raw(RetencaoCandidatosService.RETENCAO)}'
      returning c.id
    `);

    const n = Array.isArray(linhas) ? linhas.length : (linhas as { length?: number }).length ?? 0;
    // §A.6: só a CONTAGEM vai para o log. Nome, id e CPF nunca.
    if (n > 0) this.logger.log(`Retenção A&S: ${n} candidato(s) anonimizado(s) por prazo vencido.`);
    return n;
  }
}

/**
 * A MENSAGEM, E NADA MAIS, do que quer que tenha sido lançado.
 *
 * §A.6 EM UMA LINHA: o erro do driver carrega mais do que a frase. O `detail` do Postgres traz o
 * valor que violou a restrição, e a `query` traz o SQL com os parâmetros; num serviço que mexe em
 * CPF, e-mail e telefone, publicar qualquer um dos dois no log seria vazar o dado que a varredura
 * existe para apagar. Só `message` sai daqui, e o que não for `Error` vira um rótulo fixo em vez de
 * um `String(err)` que serializaria o objeto inteiro.
 */
function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : "erro sem mensagem";
}
