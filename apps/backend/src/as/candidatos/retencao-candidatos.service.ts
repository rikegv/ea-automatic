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
 * candidaturas dela estão encerradas SEM ÊXITO (descarte ou desistência). Quem tem uma candidatura
 * ativa, aprovada ou contratada NÃO entra na conta, em nenhuma hipótese, e quem nunca se candidatou
 * a nada também não: sem processo encerrado não há prazo a contar.
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
    void this.expurgar();
    this.timer = setInterval(
      () => void this.expurgar(),
      RetencaoCandidatosService.INTERVALO_MS,
    );
    this.timer.unref?.();
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
         -- o descarte é do processo, não da pessoa.
         and not exists (
               select 1 from as_candidaturas k
                where k.candidato_id = c.id
                  and k.situacao in ('ATIVO', 'APROVADO', 'CONTRATADO'))
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
