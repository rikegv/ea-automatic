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
 *   - candidato de BANCO (`as_candidatos.banco_talentos`): NÃO EXPIRA.
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
 * e-mail, telefone, data de nascimento e as identidades externas. O nome vira um marcador.
 *
 * O QUE FICA: cidade e UF, que sozinhas não identificam ninguém e sustentam a estatística regional,
 * e as candidaturas, que passam a apontar para uma pessoa sem identidade. É a mesma escolha do
 * `ExpurgoService`, que nula o CPF e o nome do substituído e mantém a linha de `dados_vaga_folha`.
 *
 * "DESCARTADO" É DO PROCESSO, NÃO DA PESSOA, e é o ponto mais delicado da regra. A mesma pessoa pode
 * estar descartada numa vaga e ativa em outra, então o prazo só começa a correr quando TODAS as
 * candidaturas dela estão encerradas. Quem tem UMA candidatura VIVA numa vaga que AINDA NÃO ACABOU
 * (`SITUACOES_VIVAS`, o complemento exato de `ehSaidaSemExito`) NÃO entra na conta, em nenhuma
 * hipótese, e quem nunca se candidatou a nada também não: sem processo encerrado não há prazo a
 * contar.
 *
 * ┌─ "VIVO" NÃO BASTA: É "VIVO E EM VAGA NÃO ENCERRADA" (decisão do diretor, opção B) ────────────┐
 * │ O BURACO QUE ISTO FECHA, e ele é o oposto do defeito acima: `APROVADO`, `ALOCADO` e            │
 * │ `ENVIADO_PARA_ADMISSAO` são situações VIVAS, então uma pessoa deixada viva numa vaga ENCERRADA │
 * │ nunca satisfazia a cláusula. O prazo de dois anos NUNCA COMEÇAVA A CORRER e o dado pessoal     │
 * │ dela ficava retido PARA SEMPRE, num processo que a operação considera morto. Existia de        │
 * │ verdade: `APROVADO` numa vaga `CANCELADA`, medido na homologação.                              │
 * │                                                                                                │
 * │ A DECISÃO É PRESERVAR O FATO E LIBERAR O PRAZO: a pessoa CONTINUA "aprovada" na trilha (ela    │
 * │ foi aprovada de verdade, e reescrever isso para "descartado" falsearia a história), e o expurgo │
 * │ é que passa a entender que a VAGA acabou. Nada é reescrito; o que mudou foi a pergunta.        │
 * │                                                                                                │
 * │ O QUE NÃO MUDOU, E É O MAIS FÁCIL DE QUEBRAR: a proteção ENTRE VAGAS continua inteira. Quem    │
 * │ está `APROVADO` numa vaga cancelada E `ATIVO` numa vaga aberta segue PROTEGIDO, porque basta   │
 * │ UMA candidatura viva em vaga não encerrada. A correção estreitou o que conta como "vivo",      │
 * │ nunca o alcance da proteção.                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RELÓGIO ACOMPANHA, e sem isso a correção não iniciaria o prazo: ela o declararia VENCIDO. Para a
 * candidatura que só passou a contar como encerrada porque a VAGA encerrou, a data de referência é
 * `vagas.encerrada_em` (carimbo de SERVIDOR, migration 0103), e nunca o `atualizado_em` dela, que o
 * encerramento da vaga não toca. O `greatest` da consulta garante a direção: a data só anda para
 * frente, então ninguém fica elegível mais cedo do que ficaria antes desta correção.
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
   *
   * ┌─ UMA INSTRUÇÃO SÓ, COM CTE QUE MODIFICA DADO, E ISSO NÃO É ESTILO ────────────────────────┐
   * │ A partir da fundação da plataforma unificadora o expurgo tem TRÊS efeitos: anonimiza a     │
   * │ pessoa, APAGA as identidades externas dela e NULA o id de match das candidaturas. A forma  │
   * │ óbvia seria três escritas numa transação, e o parecer de segurança a VETOU.                │
   * │                                                                                             │
   * │ O MOTIVO É O MODO DE FALHA, e ele é §A.33 aplicado a dado pessoal: com escritas separadas, │
   * │ a falha da SEGUNDA deixa o candidato já carimbado com `anonimizado_em`, e o predicado da    │
   * │ varredura (`c.anonimizado_em is null`) faz com que ela NUNCA MAIS volte àquela linha. O    │
   * │ identificador externo viraria permanente EM SILÊNCIO, sem nada falhar do ponto de vista do │
   * │ serviço. Numa instrução só, o banco garante que os três efeitos caem juntos ou nenhum cai. │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A VARREDURA É CICATRIZANTE, e é ela que fecha o caminho P3 do parecer ────────────────────┐
   * │ Identidade anexada DEPOIS da anonimização (uma ingestão que casasse por CPF com alguém já   │
   * │ expurgado, um reprocessamento antigo) nunca seria alcançada, porque a pessoa já não entra   │
   * │ no `update`. Por isso cada passada também apaga identidade de quem JÁ TEM `anonimizado_em`, │
   * │ e é isso que torna a rotina IDEMPOTENTE: ela conserta sozinha qualquer falha parcial de uma │
   * │ passada anterior, inclusive as anteriores a este arquivo existir.                            │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async expurgar(): Promise<number> {
    const linhas = await this.db.execute(sql`
      with alvo as (
      update as_candidatos c
         set nome = 'Candidato Expurgado',
             cpf = null,
             email = null,
             telefone = null,
             data_nascimento = null,
             anonimizado_em = now(),
             atualizado_em = now()
       where c.anonimizado_em is null
         -- ┌─ CANDIDATO DE BANCO NÃO EXPIRA (decisão do diretor), E ESTA É A LINHA MAIS PERIGOSA ┐
         -- │ A pessoa marcada está ali justamente para ser procurada daqui a três anos.            │
         -- │                                                                                       │
         -- │ A FORMA CANÔNICA É "= false", E NÃO A FORMA VERDADEIRA POR PRESENÇA. Isto lia          │
         -- │ "origem <> BANCO_TALENTOS" até a migration 0112, quando a retenção deixou de ser um    │
         -- │ valor de origem e virou coluna própria. As três maneiras de errar a troca, e o que     │
         -- │ cada uma causa, escritas aqui porque NENHUMA DELAS FALHA:                              │
         -- │   1. "and c.banco_talentos" (sinal invertido): anonimiza EXATAMENTE E SOMENTE os       │
         -- │      protegidos. É irreversível, e um teste de "o expurgo funciona" fica VERDE,        │
         -- │      porque alguém foi expurgado;                                                      │
         -- │   2. "and c.banco_talentos is not null": a coluna é NOT NULL, então isto é sempre      │
         -- │      verdadeiro e a proteção some inteira, sem nada quebrar;                           │
         -- │   3. cláusula ausente: o mesmo efeito do item 2.                                       │
         -- │                                                                                       │
         -- │ É por isso que a cobertura desta linha mede o SENTIDO da cláusula (alcança quem NÃO    │
         -- │ tem a marca, não alcança quem tem), e não a presença do nome da coluna no texto.       │
         -- └───────────────────────────────────────────────────────────────────────────────────────┘
         and c.banco_talentos = false
         -- TEM DE HAVER PROCESSO ENCERRADO: sem candidatura nenhuma não há prazo a contar.
         and exists (select 1 from as_candidaturas k where k.candidato_id = c.id)
         -- E NENHUM PROCESSO VIVO EM VAGA QUE AINDA NÃO ACABOU. Descartado numa vaga e ativo em
         -- outra não conta: o descarte é do processo, não da pessoa, e ESTA CORREÇÃO NÃO MEXEU
         -- NISSO. O que ela estreitou foi o que conta como "vivo" (agora é "vivo E em vaga não
         -- encerrada"), NUNCA o alcance da proteção entre vagas: uma candidatura viva em UMA vaga
         -- aberta continua protegendo a pessoa inteira, mesmo que ela tenha dez outras encerradas.
         -- A lista das vivas é DERIVADA do domínio (ver SITUACOES_VIVAS_SQL, acima).
         and not exists (
               select 1
                 from as_candidaturas k
                 -- OS DOIS JOINS SÃO INTERNOS E NÃO PODEM PERDER LINHA, e é isso que os torna
                 -- seguros aqui: as_candidaturas.vaga_id é NOT NULL com FK RESTRICT para vagas,
                 -- e vagas.status é NOT NULL com FK RESTRICT para as_vaga_status. Cada
                 -- candidatura casa com exatamente uma vaga, e cada vaga com exatamente um status.
                 -- Um left join diria a mesma coisa; um join que PUDESSE perder linha apagaria uma
                 -- proteção em silêncio, que é a falha mais cara possível neste arquivo.
                 join vagas v on v.id = k.vaga_id
                 join as_vaga_status s on s.codigo = v.status
                where k.candidato_id = c.id
                  and k.situacao in (${SITUACOES_VIVAS_SQL})
                  -- A RÉGUA DE "ACABOU" É O FLAG encerra DO CATÁLOGO, lido por JOIN, e NUNCA uma
                  -- lista de códigos concatenada em sql.raw: o catálogo é editável pelo diretor, e
                  -- uma lista vinda dele quebraria como TEXTO a premissa escrita lá em cima (aqui não
                  -- se concatena dado externo).
                  --
                  -- NÃO É recebe_candidato, e trocar um pelo outro inverte a regra: são perguntas
                  -- diferentes. Um status LIVRE como "Stand By" é recebe_candidato = false e
                  -- encerra = false, ou seja, VAGA PAUSADA NÃO É VAGA TERMINADA, e ler o flag
                  -- errado tornaria expurgável todo mundo dentro de uma vaga só pausada.
                  --
                  -- ┌─ A ENTREGA FICA DE FORA, E A RAZÃO NÃO É CAUTELA, É MEDIÇÃO ────────────────┐
                  -- │ O flag encerra é TRUE em três papéis: ENTREGA, FECHAMENTO e CANCELAMENTO. Sem a  │
                  -- │ condição abaixo, isto alcançaria quem estava numa vaga ENTREGUE, que é QUEM │
                  -- │ FOI CONTRATADO. O tester mediu o caso: ALOCADO há 3 anos numa vaga        │
                  -- │ ENTREGUE ERA EXPURGADO.                                                    │
                  -- │                                                                            │
                  -- │ E O EXPURGO NÃO PROTEGERIA NADA ALI, que é o ponto que decidiu: o CPF de    │
                  -- │ quem foi contratado continua na ADMISSÃO, que é outro módulo com retenção   │
                  -- │ própria. Apagar o lado de A&S deixaria as_candidaturas.admissao_id        │
                  -- │ apontando de um "Candidato Expurgado" para uma admissão que ainda guarda o  │
                  -- │ CPF: destrói o histórico da seleção e não minimiza dado nenhum.             │
                  -- │                                                                            │
                  -- │ O DIRETOR ESCREVEU "vaga encerrada (cancelada/fechada)", e é isto: os dois  │
                  -- │ desfechos em que o processo terminou SEM entrega. Reverter é apagar a       │
                  -- │ condição do papel. PELO PAPEL E NUNCA PELO CÓDIGO, que é renomeável.        │
                  -- └─────────────────────────────────────────────────────────────────────────────┘
                  --
                  -- encerrada_em is null PROTEGE, e a direção é fail-closed: vaga marcada como
                  -- encerrada SEM o carimbo de servidor (migration 0103) é vaga cujo instante de
                  -- encerramento ninguém sabe, e prazo sem data de início não começa a correr. Sem
                  -- esta metade, a linha sem carimbo cairia no relógio antigo, que é justamente o
                  -- que a correção existe para impedir.
                  and (s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is null))
         -- ┌─ O RELÓGIO, e sem esta parte a correção não INICIA o prazo: ela o declara VENCIDO ────┐
         -- │ O prazo corre do ÚLTIMO movimento, não do primeiro: quem foi descartado em três vagas │
         -- │ ao longo de dois anos ainda é alguém que o time viu recentemente.                     │
         -- │                                                                                       │
         -- │ SÓ QUE ENCERRAR A VAGA NÃO CARIMBA A CANDIDATURA de quem não segurava o encerramento  │
         -- │ (medido na homologação: a candidatura APROVADA ficou 18 SEGUNDOS ATRÁS do             │
         -- │ cancelada_em da vaga). Contando de k.atualizado_em, quem foi aprovado em 03/2024      │
         -- │ numa vaga encerrada HOJE nasceria com o prazo JÁ VENCIDO e seria anonimizado na       │
         -- │ varredura da hora seguinte, sem carência nenhuma, e isso é irreversível.              │
         -- │                                                                                       │
         -- │ ENTÃO, PARA A CANDIDATURA QUE SÓ PASSOU A CONTAR COMO ENCERRADA PORQUE A VAGA ACABOU, │
         -- │ a data de referência é o ENCERRAMENTO DA VAGA (v.encerrada_em, carimbo de SERVIDOR;   │
         -- │ data_fechamento vem do CORPO, sem piso, e como relógio seria gatilho remoto de        │
         -- │ exclusão irreversível). O case restringe o efeito a essa candidatura: quem já estava  │
         -- │ DESCARTADO continua contando do movimento dele, exatamente como antes desta correção. │
         -- │                                                                                       │
         -- │ O greatest É A PROVA DE QUE ISTO NÃO APRESSA NINGUÉM: ele só empurra a data PARA      │
         -- │ FRENTE, nunca para trás, então nenhuma pessoa fica elegível mais CEDO do que ficaria  │
         -- │ com a consulta anterior. O erro cai para o lado de não apagar.                        │
         -- │                                                                                       │
         -- │ O JOIN é interno pelo mesmo argumento de completude do bloco acima (vaga_id NOT NULL  │
         -- │ com FK RESTRICT): ele não descarta candidatura nenhuma da conta do max, e descartar   │
         -- │ uma delas poderia BAIXAR o máximo e apressar o expurgo.                               │
         -- └───────────────────────────────────────────────────────────────────────────────────────┘
         and (select max(greatest(
                           k.atualizado_em,
                           coalesce(
                             case when k.situacao in (${SITUACOES_VIVAS_SQL}) then v.encerrada_em end,
                             k.atualizado_em)))
                from as_candidaturas k
                join vagas v on v.id = k.vaga_id
               where k.candidato_id = c.id)
             <= now() - interval '${sql.raw(RetencaoCandidatosService.RETENCAO)}'
      returning c.id
      ),
      -- ─ QUEM JÁ ESTAVA ANONIMIZADO ANTES DESTA PASSADA ──────────────────────────────────────
      -- As duas listas são DISJUNTAS, e é por isso que as escritas abaixo precisam das duas: todas
      -- as CTEs enxergam o MESMO retrato do banco, o de antes do "update" do "alvo", então quem
      -- está sendo anonimizado AGORA ainda tem "anonimizado_em is null" aqui e não apareceria
      -- nesta lista. Somar "alvo" e esta é o que cobre o caso de hoje e o rastro do passado.
      ja_anonimizados as (
        select id from as_candidatos where anonimizado_em is not null
      ),
      -- ─ A IDENTIDADE EXTERNA É APAGADA, E NÃO ANONIMIZADA ───────────────────────────────────
      -- A assimetria com a linha do candidato é deliberada: a linha de identidade É o
      -- identificador, inteira. Não sobra dela nada que sustente contagem histórica, ao contrário
      -- da linha do candidato, que sustenta os aprovados das vagas passadas. Anonimizá-la deixaria
      -- uma linha vazia apontando para ninguém.
      identidades_apagadas as (
        delete from as_identidades_externas
         where candidato_id in (select id from alvo)
            or candidato_id in (select id from ja_anonimizados)
      )
      -- ─ A CTE "matches_nulados" SAIU DAQUI, E COM ELA A SEGUNDA GAVETA ──────────────────────
      -- Ela nulava "as_candidaturas.id_match_pandape", identificador da PESSOA no ATS que
      -- sobrevivia à anonimização. A COLUNA FOI DERRUBADA (migration 0112): a identidade externa
      -- tem um dono só dentro do módulo A&S, "as_identidades_externas", que é apagada pela CTE
      -- logo acima. Não há mais gaveta paralela a nular, e manter a CTE derrubaria a varredura
      -- inteira com "column does not exist".
      --
      -- "identidades_apagadas" CONTINUA, e a distinção importa para quem ler este diff: a que saiu
      -- é a da coluna morta, nunca a do desenho novo.
      -- A CONTAGEM SAI DO "alvo", e só dele: o que se reporta é quantas PESSOAS foram anonimizadas
      -- nesta passada. As linhas cicatrizadas não entram na conta, porque não são gente nova
      -- expurgada, e somá-las faria o número do log oscilar sem ninguém ter sido expurgado.
      select count(*)::int as n from alvo
    `);

    const n = contarAnonimizados(linhas);
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

/**
 * QUANTAS PESSOAS FORAM ANONIMIZADAS, lido do `select count(*)` que fecha a instrução.
 *
 * ANTES BASTAVA `linhas.length`, porque a instrução era um `update ... returning c.id` e o driver
 * devolvia uma linha por pessoa. Com a CTE, o que volta é UMA linha com a contagem, e ler o
 * `length` ali devolveria 1 em toda passada, inclusive nas passadas em que ninguém venceu prazo: o
 * log passaria a anunciar um expurgo por hora, para sempre, e o número perderia todo o valor.
 *
 * A CONTAGEM VEM DO BANCO E NÃO DA MEMÓRIA, e isso é §A.6: o `returning c.id` trazia os ids das
 * pessoas expurgadas para dentro do processo sem que ninguém precisasse deles. Agora nem isso
 * circula, só um inteiro.
 *
 * DEFENSIVO NA LEITURA porque o formato do driver não é contrato: `?? 0` em vez de `!`, e
 * `Number(...)` porque um `count` pode chegar como texto (o Postgres devolve bigint, e o cast para
 * `int` na consulta é o que normalmente evita isso; a conversão aqui é a segunda fechadura).
 */
function contarAnonimizados(linhas: unknown): number {
  const primeira = Array.isArray(linhas) ? (linhas[0] as { n?: unknown } | undefined) : undefined;
  const n = Number(primeira?.n ?? 0);
  return Number.isFinite(n) ? n : 0;
}
