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
 * O MARCADOR QUE SUBSTITUI O NOME NO EXPURGO, escrito UMA VEZ SÓ.
 *
 * ┌─ POR QUE CONSTANTE, E NÃO O LITERAL REPETIDO NOS DOIS PONTOS ────────────────────────────────┐
 * │ O mesmo texto é gravado pelo `update` do `alvo` (quem está sendo expurgado agora) e pela CTE  │
 * │ `pessoais_cicatrizados` (quem já estava carimbado e teve o nome devolvido). A cicatrização    │
 * │ ainda COMPARA o nome com ele, na guarda de "há o que cicatrizar", e é essa terceira ocorrência │
 * │ que torna a duplicação perigosa: se os textos DIVERGIREM por um espaço, um acento ou uma      │
 * │ maiúscula, o defeito não falha, ele escolhe um de dois lados ruins.                           │
 * │   1. a guarda nunca casa com o que o `alvo` escreveu, e TODA linha anonimizada da base é      │
 * │      reescrita a cada hora, para sempre, sem nenhuma mudança de valor;                        │
 * │   2. ou a guarda casa com o marcador errado e a linha em que o nome VOLTOU nunca é alcançada, │
 * │      que é exatamente o furo que esta correção fecha.                                         │
 * │ Uma constante só, interpolada nos três lugares, torna a divergência impossível de escrever.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `sql.raw` pelo mesmo motivo da lista acima: é constante de código, nunca entrada de usuário, e
 * precisa chegar ao banco como LITERAL para que o contrato de forma leia o texto executado.
 */
const MARCADOR_EXPURGO = "Candidato Expurgado";
const MARCADOR_EXPURGO_SQL = sql.raw(`'${MARCADOR_EXPURGO.replace(/'/g, "''")}'`);

/**
 * O MARCADOR QUE SUBSTITUI O TEXTO LIVRE DO CONTATO, e ele é SEPARADO do marcador do nome.
 *
 * ┌─ POR QUE DOIS MARCADORES, E NÃO O MESMO TEXTO NOS DOIS LUGARES ──────────────────────────────┐
 * │ São campos de naturezas diferentes, lidos em telas diferentes: um é o NOME de uma pessoa na  │
 * │ lista, o outro é o RESUMO de uma ligação no histórico da candidatura. Um marcador só faria a │
 * │ linha do histórico dizer "Candidato Expurgado" onde se espera a frase do contato, e quem     │
 * │ lesse a tela concluiria que o campo foi preenchido errado, e não que ele foi expurgado.      │
 * │                                                                                              │
 * │ O RESTO DO ARGUMENTO DO MARCADOR DO NOME VALE INTEIRO AQUI: este texto é gravado pela CTE e  │
 * │ COMPARADO pela guarda de "há o que cicatrizar" da mesma CTE, então divergir por um espaço ou │
 * │ um acento não falha, escolhe um de dois lados ruins (reescrever a base de hora em hora para  │
 * │ sempre, ou nunca alcançar a linha que precisa ser limpa). Uma constante só torna isso         │
 * │ impossível de escrever.                                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const MARCADOR_RESUMO = "Resumo Expurgado";
const MARCADOR_RESUMO_SQL = sql.raw(`'${MARCADOR_RESUMO.replace(/'/g, "''")}'`);

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
 * O TEXTO LIVRE ESCRITO PELO OPERADOR SAI JUNTO, e é o terceiro furo que esta rotina fechou: o
 * `resumo` dos contatos (substituído por marcador, a coluna é NOT NULL), o `motivo_descarte` das
 * candidaturas (nulado) e o `motivo` dos eventos do histórico (nulado), que é a SEGUNDA CÓPIA da
 * mesma frase, gravada pela mesma transação da saída. Anonimizar o CPF e deixar o telefone digitado
 * à mão na linha ao lado é minimização aparente, e nular a frase num lugar só é a mesma coisa. Ver
 * as CTEs `contatos_expurgados`, `motivos_expurgados` e `motivos_do_historico_expurgados`.
 *
 * O QUE FICA: cidade e UF, que sozinhas não identificam ninguém e sustentam a estatística regional,
 * e as candidaturas, que passam a apontar para uma pessoa sem identidade. É a mesma escolha do
 * `ExpurgoService`, que nula o CPF e o nome do substituído e mantém a linha de `dados_vaga_folha`.
 *
 * "DESCARTADO" É DO PROCESSO, NÃO DA PESSOA, e é o ponto mais delicado da regra. A mesma pessoa pode
 * estar descartada numa vaga e ativa em outra, então o prazo só começa a correr quando TODAS as
 * candidaturas dela estão encerradas. Quem tem UMA candidatura VIVA numa vaga que AINDA NÃO ACABOU
 * (`SITUACOES_VIVAS`, o complemento exato de `ehSaidaSemExito`) NÃO entra na conta, em nenhuma
 * hipótese.
 *
 * ┌─ QUEM NUNCA SE CANDIDATOU A NADA TAMBÉM TEM PRAZO, E ISSO MUDOU (furo 1 de LGPD) ─────────────┐
 * │ ATÉ AQUI A RÉGUA DIZIA "sem processo encerrado não há prazo a contar", e exigia               │
 * │ `exists (select 1 from as_candidaturas ...)`. A consequência é a oposta da intenção: quem     │
 * │ entra e não casa com vaga nenhuma NUNCA satisfaz a cláusula, então o prazo NUNCA começa a     │
 * │ correr e CPF, e-mail, telefone e data de nascimento ficam retidos PARA SEMPRE. Retenção       │
 * │ indefinida é exatamente o que a LGPD proíbe, e era teórico só enquanto a base estava vazia:   │
 * │ deixa de ser no primeiro registro da INGESTÃO, que é por isso que o furo fecha ANTES dela.    │
 * │                                                                                               │
 * │ AGORA O PRAZO DESSA PESSOA CORRE DAS DATAS DELA MESMA (ver o relógio, lá embaixo). O ramo de  │
 * │ quem TEM candidatura ficou EXATAMENTE como estava: a correção ACRESCENTA uma população, e     │
 * │ nunca reescreve a régua da outra.                                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
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
   * │ O expurgo tem VÁRIOS efeitos: anonimiza a pessoa, APAGA as identidades externas dela,      │
   * │ SUBSTITUI o resumo dos contatos e NULA o motivo de descarte das candidaturas. A forma      │
   * │ óbvia seria uma escrita por efeito, numa transação, e o parecer de segurança a VETOU.      │
   * │                                                                                             │
   * │ O MOTIVO É O MODO DE FALHA, e ele é §A.33 aplicado a dado pessoal: com escritas separadas, │
   * │ a falha da SEGUNDA deixa o candidato já carimbado com `anonimizado_em`, e o predicado da    │
   * │ varredura (`c.anonimizado_em is null`) faz com que ela NUNCA MAIS volte àquela linha. O    │
   * │ identificador externo (ou o telefone digitado no resumo de um contato) viraria permanente  │
   * │ EM SILÊNCIO, sem nada falhar do ponto de vista do serviço. Numa instrução só, o banco      │
   * │ garante que todos os efeitos caem juntos ou nenhum cai.                                    │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A VARREDURA É CICATRIZANTE, e é ela que fecha o caminho P3 do parecer ────────────────────┐
   * │ Identidade anexada DEPOIS da anonimização (uma ingestão que casasse por CPF com alguém já   │
   * │ expurgado, um reprocessamento antigo) nunca seria alcançada, porque a pessoa já não entra   │
   * │ no `update`. Por isso cada passada também apaga identidade de quem JÁ TEM `anonimizado_em`, │
   * │ e é isso que torna a rotina IDEMPOTENTE: ela conserta sozinha qualquer falha parcial de uma │
   * │ passada anterior, inclusive as anteriores a este arquivo existir.                            │
   * │                                                                                             │
   * │ E O MESMO VALE PARA O DADO PESSOAL, desde o fechamento do furo 2: a passada RE-NULA CPF,    │
   * │ e-mail, telefone e nascimento de quem já está carimbado, e REESCREVE O NOME com o marcador, │
   * │ porque o caminho que devolvia os quatro devolvia o nome junto, e podia devolver SÓ o nome.  │
   * │ Sem isso, uma re-identificação que                                                          │
   * │ escapasse (a porta era o `editar`) ficaria PERMANENTE, porque a varredura não volta a uma   │
   * │ linha com `anonimizado_em` preenchido. Ver a CTE `pessoais_cicatrizados`.                    │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async expurgar(): Promise<number> {
    const linhas = await this.db.execute(sql`
      with alvo as (
      update as_candidatos c
         set nome = ${MARCADOR_EXPURGO_SQL},
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
         -- ┌─ O GATE DE "TEM DE HAVER CANDIDATURA" SAIU DAQUI, E SOZINHO ELE NÃO MUDAVA NADA ────┐
         -- │ O que estava escrito nesta linha era                                                 │
         -- │   and exists (select 1 from as_candidaturas k where k.candidato_id = c.id)           │
         -- │ e ele é a definição do furo 1: sem candidatura, a régua nunca era satisfeita e o     │
         -- │ prazo NUNCA começava a correr.                                                       │
         -- │                                                                                       │
         -- │ APAGÁ-LO SOZINHO NÃO CORRIGE COISA NENHUMA, e este é o ponto que o "seguranca"        │
         -- │ MEDIU: o relógio, logo abaixo, é um "max()" sobre "as_candidaturas", e "max()" sobre  │
         -- │ conjunto VAZIO devolve NULL. "NULL <= now() - interval '2 years'" NÃO é verdadeiro,   │
         -- │ então a linha continuaria fora do "update", agora sem NENHUMA cláusula no "where" que │
         -- │ denunciasse o motivo, que é pior do que o defeito original. QUEM FAZ A CORREÇÃO       │
         -- │ EXISTIR É O "coalesce" DO RELÓGIO, e não esta remoção.                                │
         -- └───────────────────────────────────────────────────────────────────────────────────────┘
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
         --
         -- ┌─ A QUEDA, E É ELA QUE FECHA O FURO 1 ────────────────────────────────────────────────┐
         -- │ O "coalesce" resolve as DUAS populações numa expressão só, e a ordem dos argumentos   │
         -- │ é a regra inteira:                                                                    │
         -- │   1. quem TEM candidatura cai no primeiro argumento, o "max" de sempre, EXATAMENTE    │
         -- │      como antes desta correção. O "max" nunca devolve NULL para essa pessoa (ela tem  │
         -- │      ao menos uma linha), então o segundo argumento JAMAIS é avaliado para ela: o     │
         -- │      ramo de quem tem candidatura não muda em nada;                                   │
         -- │   2. quem NÃO tem candidatura nenhuma recebe NULL do "max" (conjunto vazio) e cai no  │
         -- │      segundo, que são as datas do PRÓPRIO candidato, sem ler "as_candidaturas". Uma   │
         -- │      queda que ainda lesse aquela tabela devolveria NULL de novo e deixaria o furo    │
         -- │      inteiro, escondido na nulidade em vez de visível no "where".                     │
         -- │                                                                                       │
         -- │ O "greatest" É A DEFESA, E TROCÁ-LO POR "c.criado_em" SOZINHO REABRE EXPURGO          │
         -- │ PREMATURO, QUE É IRREVERSÍVEL. A razão é medida, não estilística: "atualizado_em" tem │
         -- │ "default now()" no INSERT e NÃO tem "$onUpdate" ("db/schema/tables.ts:66"). Uma carga │
         -- │ ou migração que recue só o "criado_em" deixa o "atualizado_em" em HOJE, e o "greatest"│
         -- │ devolve hoje: ninguém é apressado. Contando só do "criado_em", a mesma linha nasceria │
         -- │ com o prazo JÁ VENCIDO e seria anonimizada na varredura da hora seguinte, sem         │
         -- │ carência nenhuma. É a mesma régua de ÚLTIMO MOVIMENTO que o ramo de cima já usa, e a  │
         -- │ direção é a mesma do "greatest" de lá: a data só anda PARA FRENTE. "least"/"min" no   │
         -- │ lugar dele puxariam a referência para trás e tornariam gente elegível mais CEDO do    │
         -- │ que ficaria antes da correção. O erro cai para o lado de não apagar.                  │
         -- └───────────────────────────────────────────────────────────────────────────────────────┘
         and coalesce(
               (select max(greatest(
                           k.atualizado_em,
                           coalesce(
                             case when k.situacao in (${SITUACOES_VIVAS_SQL}) then v.encerrada_em end,
                             k.atualizado_em)))
                  from as_candidaturas k
                  join vagas v on v.id = k.vaga_id
                 where k.candidato_id = c.id),
               greatest(c.criado_em, c.atualizado_em))
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
      ),
      -- ─ A FILA DE CONFLITO DA INGESTÃO, PELO MESMO MOTIVO E NA MESMA INSTRUÇÃO ──────────────
      --
      -- ┌─ O QUE ELA GUARDA É O MESMO IDENTIFICADOR QUE A CTE ACIMA EXISTE PARA APAGAR ────────┐
      -- │ "as_ingestao_conflitos.identificador" É o "idCandidate" do Pandapé, o MESMO valor de  │
      -- │ "as_identidades_externas", ao lado do "candidato_id". Se a linha do conflito ficasse  │
      -- │ fora do expurgo, sobraria uma ponte ligando a ficha ANONIMIZADA ao id de quem ela era │
      -- │ no ATS, onde o nome e o CPF continuam: a anonimização seria desfeita por quem tivesse │
      -- │ acesso às duas pontas, e nada falharia. Apagar a identidade e deixar a cópia ao lado  │
      -- │ é minimização APARENTE, que é o defeito que as CTEs deste arquivo existem para pegar. │
      -- └───────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- APAGADA, E NÃO ANONIMIZADA, pelo mesmo argumento da identidade externa: a linha É o
      -- identificador mais o ponteiro para a pessoa, e não sobra dela nada que sustente contagem.
      -- Um conflito de identidade de uma ficha expurgada também não tem mais o que revisar: não há
      -- pessoa a desempatar.
      --
      -- O ALCANCE É "alvo" MAIS "ja_anonimizados", como em todas as outras CTEs daqui, e pela mesma
      -- razão: a varredura NUNCA volta a uma linha carimbada, então o conflito registrado depois da
      -- anonimização (ou antes desta correção existir) ficaria retido para sempre, em silêncio.
      --
      -- "as_varredura_vagas" NÃO ENTRA AQUI, E A OMISSÃO É DELIBERADA: ela guarda id de vaga do
      -- ATS, id de vaga do EA e duas datas de processo, e não tem pessoa nenhuma dentro. Apagá-la
      -- "por simetria" destruiria a marca de água e a fronteira de propriedade da varredura, que é
      -- o que impede a ingestão de encerrar vaga de outro dono.
      conflitos_apagados as (
        delete from as_ingestao_conflitos
         where candidato_id in (select id from alvo)
            or candidato_id in (select id from ja_anonimizados)
      ),
      -- ─ A CICATRIZAÇÃO DO DADO PESSOAL, e ela é a SEGUNDA METADE DO FURO 2 ──────────────────
      --
      -- ┌─ O QUE ESTA CTE REPARA, e a recusa do "editar" sozinha NÃO repara ───────────────────┐
      -- │ A recusa que "CandidatosService.editar" passou a fazer protege o FUTURO: daqui para   │
      -- │ frente, ninguém regrava CPF, e-mail, telefone ou nascimento em linha já carimbada.    │
      -- │ Ela não repara o PASSADO, e é aí que mora o modo de falha: uma linha                  │
      -- │ re-identificada antes desta correção (ou por qualquer caminho futuro que escape)      │
      -- │ fica com "anonimizado_em" PREENCHIDO e com o dado pessoal DE VOLTA, e a varredura     │
      -- │ NUNCA MAIS passa nela, porque a régua do "alvo" é "c.anonimizado_em is null". A       │
      -- │ re-identificação vira PERMANENTE E SILENCIOSA: do ponto de vista do serviço, nada     │
      -- │ falhou.                                                                               │
      -- │                                                                                       │
      -- │ É EXATAMENTE O MESMO ARGUMENTO QUE JÁ JUSTIFICOU A CTE DAS IDENTIDADES, logo acima,    │
      -- │ e por isso esta nasce no molde dela: é a cicatrização que torna a rotina IDEMPOTENTE  │
      -- │ CONTRA O PASSADO, e não só contra a falha parcial de uma passada.                     │
      -- └───────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- ┌─ O NOME ENTRA AQUI, E A PREMISSA DE QUE ELE "JÁ É UM MARCADOR" ERA FALSA ────────────┐
      -- │ ESTAVA ESCRITO NESTA LINHA que o nome não precisava ser reescrito, porque depois do  │
      -- │ expurgo ele já seria o marcador. Isso vale para quem SÓ passou pelo "alvo", e a      │
      -- │ população que esta CTE existe para reparar é justamente a OUTRA: a de quem foi       │
      -- │ RE-IDENTIFICADO depois de carimbado, pelo "editar".                                  │
      -- │                                                                                       │
      -- │ E O "editar" ESCREVE O NOME NA MESMA INSTRUÇÃO em que escrevia os outros quatro      │
      -- │ ("candidatos.service.ts", "nome: dto.nome?.trim() ?? atual.nome"). Não existe caminho │
      -- │ que devolva CPF, e-mail, telefone ou nascimento sem poder devolver o nome junto, e o  │
      -- │ caminho real é o contrário: quem reabre uma ficha expurgada digita o NOME de volta    │
      -- │ PRIMEIRO. O nome volta junto ou volta sozinho.                                        │
      -- │                                                                                       │
      -- │ A GUARDA ABAIXO TAMBÉM PRECISAVA DELE, e sem isso a metade pior do furo ficava fora   │
      -- │ de alcance: a linha em que SÓ o nome voltou não satisfazia nenhuma das quatro         │
      -- │ condições, então a passada não a TOCAVA e ela seguia contando como expurgada com o    │
      -- │ nome real intacto. Medido contra banco pelo "seguranca". É a §A.33 aplicada a dado    │
      -- │ pessoal: do ponto de vista do serviço, nada falhou.                                   │
      -- └───────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- "anonimizado_em" E "atualizado_em" NÃO SÃO TOCADOS, e isso é deliberado: o carimbo da
      -- anonimização é a prova de QUANDO o dado pessoal saiu, e reescrevê-lo de hora em hora
      -- apagaria justamente o que se precisa provar. "atualizado_em" também fica quieto porque
      -- ele é insumo do RELÓGIO (a queda do furo 1), e empurrá-lo adiante a cada passada seria
      -- mexer em prazo de gente por efeito colateral de uma faxina.
      --
      -- A CONDIÇÃO DE "HÁ O QUE CICATRIZAR" EVITA REESCRITA INÚTIL: sem ela, toda linha
      -- anonimizada da base seria regravada a cada hora, para sempre, sem nenhuma mudança de
      -- valor. O "alvo" e esta CTE alcançam conjuntos DISJUNTOS no mesmo retrato do banco
      -- ("anonimizado_em is null" contra "is not null"), então nenhuma linha é atualizada duas
      -- vezes na mesma instrução, que o Postgres não define.
      --
      -- O PREDICADO É ESCRITO AQUI, INTEIRO, E NÃO DELEGADO A "ja_anonimizados": as duas formas
      -- enxergam o MESMO retrato do banco e são equivalentes, mas a guarda que decide EM QUEM se
      -- escreve precisa estar visível no ponto da escrita. Quem ler este bloco daqui a um ano tem
      -- de ver, sem sair da linha, que ele só alcança quem JÁ está carimbado, e nunca o contrário.
      --
      -- O MARCADOR É A MESMA CONSTANTE DO "alvo" (ver MARCADOR_EXPURGO, no topo do arquivo), aqui
      -- e na guarda. Dois literais digitados à mão divergem com o tempo, e a divergência não falha:
      -- ou a guarda nunca casa e a base inteira é reescrita de hora em hora, ou ela casa com o
      -- texto errado e a linha re-identificada nunca é alcançada.
      --
      -- A COMPARAÇÃO É "is distinct from", E NÃO "<>", porque "<>" com NULL devolve NULL, nunca
      -- verdadeiro: se um dia o nome puder ser nulo, a guarda escrita com "<>" deixaria passar em
      -- silêncio a linha sem nome. A direção certa é a que fica VERDADEIRA quando o nome não é o
      -- marcador, seja qual for o valor.
      pessoais_cicatrizados as (
        update as_candidatos
           set nome = ${MARCADOR_EXPURGO_SQL},
               cpf = null,
               email = null,
               telefone = null,
               data_nascimento = null
         where anonimizado_em is not null
           and (nome is distinct from ${MARCADOR_EXPURGO_SQL}
                or cpf is not null
                or email is not null
                or telefone is not null
                or data_nascimento is not null)
      ),
      -- ─ O TEXTO LIVRE DO CONTATO, e ele é o TERCEIRO furo do mesmo tema ─────────────────────
      --
      -- ┌─ O QUE SOBREVIVIA À ANONIMIZAÇÃO ────────────────────────────────────────────────────┐
      -- │ O expurgo alcançava "as_candidatos" e "as_identidades_externas", e NADA MAIS. O que o │
      -- │ consultor DIGITA continua sendo dado pessoal, e é onde ele aparece na prática: "liguei│
      -- │ no 11 9xxxx-xxxx", "falei com a irmã dela", "mandei e-mail para fulano@...". Nular o  │
      -- │ CPF e deixar o telefone digitado aqui é minimização APARENTE: a pessoa continua        │
      -- │ identificável e localizável pela linha ao lado, e nada falha.                          │
      -- └───────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- ┌─ A LINHA É PRESERVADA E O TEXTO É SUBSTITUÍDO, e o critério é o MESMO das duas CTEs ──┐
      -- │ acima, aplicado a um terceiro caso. A régua deste arquivo já estava escrita:           │
      -- │   - a IDENTIDADE EXTERNA é APAGADA porque a linha É o identificador, inteira, e nada  │
      -- │     sobra dela que sustente contagem;                                                  │
      -- │   - o CANDIDATO é ANONIMIZADO porque a linha sustenta a contagem histórica das vagas.  │
      -- │ O CONTATO cai no segundo caso, e não no primeiro: só o "resumo" é dado pessoal. O      │
      -- │ TIPO, o "ocorrido_em" e o "registrado_por_id" são fato de PROCESSO (houve ligação      │
      -- │ naquele dia, feita por aquele consultor), da mesma natureza das candidaturas que a     │
      -- │ linha do candidato preserva. Apagar a linha destruiria a prova de que o trabalho       │
      -- │ aconteceu, e destruiria por tabela a leitura de esforço da candidatura, sem minimizar  │
      -- │ NADA além do que a substituição do texto já minimiza.                                  │
      -- └───────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- "resumo" É NOT NULL ("db/schema/tables.ts"), então "anular" aqui é gravar um MARCADOR, e
      -- não "null": um "set resumo = null" derrubaria a varredura inteira com violação de NOT NULL,
      -- e a varredura que morre é a varredura que não expurga ninguém.
      --
      -- O ALCANCE É "alvo" MAIS "ja_anonimizados", PELO MESMO ARGUMENTO JÁ ESCRITO ACIMA: a
      -- varredura NUNCA volta a uma linha carimbada, então contato registrado DEPOIS da
      -- anonimização (ou antes desta correção existir) ficaria retido para sempre, em silêncio.
      -- É o que torna a rotina idempotente contra o passado, e não só contra a falha de uma passada.
      --
      -- A LIGAÇÃO COM A PESSOA É INDIRETA, e por isso a subconsulta: "as_contatos" pendura na
      -- CANDIDATURA, nunca no candidato. Ler "candidato_id" direto daqui não compila, e resolver
      -- isso por join no "update" mudaria a forma sem mudar o efeito.
      --
      -- A GUARDA DE "HÁ O QUE CICATRIZAR" evita reescrever de hora em hora, para sempre, todo
      -- contato de toda pessoa já anonimizada. "is distinct from" e não "<>" pela razão já escrita
      -- na CTE acima: "<>" com NULL devolve NULL, nunca verdadeiro.
      contatos_expurgados as (
        update as_contatos
           set resumo = ${MARCADOR_RESUMO_SQL}
         where candidatura_id in (
                 select k.id
                   from as_candidaturas k
                  where k.candidato_id in (select id from alvo)
                     or k.candidato_id in (select id from ja_anonimizados))
           and resumo is distinct from ${MARCADOR_RESUMO_SQL}
      ),
      -- ─ O MOTIVO DO DESCARTE, texto livre pelo mesmo motivo e com a mesma exposição ─────────
      --
      -- ┌─ ESTE VAI A NULO, E A ASSIMETRIA COM O "resumo" É DELIBERADA ────────────────────────┐
      -- │ A coluna é ANULÁVEL ("motivo_descarte text", sem NOT NULL), e nula já QUER DIZER      │
      -- │ ALGUMA COISA no vocabulário da tabela: "saiu sem motivo registrado". É exatamente o   │
      -- │ estado em que a candidatura nasce e o estado para o qual "restaurar-candidatura" a    │
      -- │ devolve. Gravar um marcador aqui inventaria um terceiro estado, que toda tela que já  │
      -- │ testa "motivoDescarte &&" passaria a EXIBIR, e o "Resumo Expurgado" apareceria como   │
      -- │ se fosse o motivo pelo qual a pessoa foi descartada.                                   │
      -- │                                                                                        │
      -- │ E A ESTATÍSTICA DE MOTIVO NÃO É DESTRUÍDA, que é a objeção que decide: o que sustenta │
      -- │ contagem de desfecho é a SITUAÇÃO ("DESCARTADO", "DESISTIU", "REPROVADO"), coluna      │
      -- │ estruturada que esta CTE não toca e que continua inteira. O "motivo_descarte" é texto │
      -- │ livre, e o próprio schema diz por quê: "o vocabulário de descarte é da operação e     │
      -- │ ainda está se formando". Nenhum relatório agrupa por ele, e nenhum poderia: são frases │
      -- │ digitadas. O que se perde é a frase de UMA pessoa cujo nome e CPF já não existem mais. │
      -- └────────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- "atualizado_em" NÃO É TOCADO, e aqui isso é mais do que higiene: "k.atualizado_em" é
      -- INSUMO DO RELÓGIO do expurgo, lá em cima. Empurrá-lo a cada passada mexeria no prazo de
      -- gente por efeito colateral de uma faxina, e é o mesmo argumento que já mantém quieto o
      -- "atualizado_em" da CTE "pessoais_cicatrizados".
      motivos_expurgados as (
        update as_candidaturas
           set motivo_descarte = null
         where (candidato_id in (select id from alvo)
                or candidato_id in (select id from ja_anonimizados))
           and motivo_descarte is not null
      ),
      -- ─ A SEGUNDA CÓPIA DA MESMA FRASE, no HISTÓRICO da candidatura ─────────────────────────
      --
      -- ┌─ SEM ESTA CTE, A DE CIMA É MINIMIZAÇÃO APARENTE ─────────────────────────────────────┐
      -- │ "gravarSaidaDaCandidatura" ("as/candidatos/encerrar-candidatura.ts") escreve a MESMA   │
      -- │ string nos DOIS lugares, na MESMA transação: em "as_candidaturas.motivo_descarte" e no │
      -- │ "motivo" do evento que ela insere em "as_candidatura_etapas". O próprio schema diz que │
      -- │ a repetição é de propósito, porque a candidatura guarda o estado de HOJE e o histórico │
      -- │ guarda o instante da decisão.                                                          │
      -- │                                                                                        │
      -- │ ENTÃO NULAR SÓ UM DOS DOIS NÃO EXPURGA NADA: a frase digitada sobrevive inteira na     │
      -- │ linha ao lado, e nada falha do ponto de vista do serviço, que é exatamente o modo de   │
      -- │ falha que este arquivo inteiro existe para fechar. É o mesmo argumento do resumo do    │
      -- │ contato, aplicado à cópia que ninguém tinha visto.                                     │
      -- └────────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- ┌─ O ALCANCE É A COLUNA INTEIRA, E NÃO SÓ O EVENTO DE SAÍDA ───────────────────────────┐
      -- │ Não há filtro por tipo de evento aqui, de propósito: TODO "motivo" desta tabela é      │
      -- │ texto livre digitado pelo operador, com a mesma exposição, e NENHUM escritor grava     │
      -- │ rótulo derivado. São SETE pontos que inserem evento hoje, e QUATRO deles gravam a      │
      -- │ frase: a SAÍDA (a cópia de que fala o bloco acima), a TROCA DE VAGA                    │
      -- │ ("candidatos.service", "motivo: texto(dto.motivo)", frase de um Master corrigindo dado │
      -- │ vivo), a finalização de posição e a REENTRADA ("restaurar-candidatura.ts",             │
      -- │ "motivo: trilha.motivo"). Os outros três já gravam nulo ou nem passam o campo.         │
      -- │                                                                                        │
      -- │ FILTRAR POR "situacao is not null" (ou seja, "só o desfecho") DEIXARIA DUAS DELAS       │
      -- │ RETIDAS PARA SEMPRE: a troca de vaga e a reentrada gravam "situacao" NULA de propósito, │
      -- │ porque não são desfecho, e são digitadas pela mesma gente, sobre a mesma pessoa.        │
      -- └────────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- ┌─ O ACEITE NÃO SAI, E A DISTINÇÃO PRECISA ESTAR ESCRITA ──────────────────────────────┐
      -- │ A MESMA TABELA guarda "aceite" e "aceite_numero", que são a trilha do aceite de        │
      -- │ passagem (§A.3 regra 8), e a §A.6 os classifica como "log de auditoria sensível,       │
      -- │ PERMANENTE e consultável". Apagá-los por simetria com o "motivo" destruiria a prova de │
      -- │ que alguém atravessou uma guarda, que é a decisão mais cara de desfazer do módulo.     │
      -- │                                                                                        │
      -- │ E A NATUREZA DOS DOIS É OPOSTA, que é o que justifica o corte: o "motivo" é FRASE      │
      -- │ LIVRE sobre a PESSOA, onde o telefone e o nome do parente aparecem na prática; o       │
      -- │ aceite é um NOME DE GUARDA e um NÚMERO, vocabulário fechado escrito pelo sistema, sem  │
      -- │ nada do candidato dentro. Quem decidiu sai do "por_id", que é usuário INTERNO. Não há  │
      -- │ dado pessoal a minimizar ali, e há trilha a preservar: um sai porque é dado pessoal, o │
      -- │ outro fica porque é auditoria. "situacao", "etapa_para", "posicao_lado" e              │
      -- │ "ocorrido_em" ficam pelo mesmo motivo do aceite: são fato de PROCESSO, e é deles que a │
      -- │ linha do tempo da vaga é lida depois que a pessoa vira anônima.                        │
      -- └────────────────────────────────────────────────────────────────────────────────────────┘
      --
      -- A FORMA É NULO, E NÃO MARCADOR, PELO MESMO ARGUMENTO DA CTE ACIMA, E ELE VALE AQUI COM
      -- MAIS FORÇA: a coluna é ANULÁVEL ("motivo text", sem NOT NULL) e nula JÁ QUER DIZER ALGUMA
      -- COISA no vocabulário desta tabela, "evento sem motivo registrado". É o estado da esmagadora
      -- maioria das linhas (a entrada e o movimento de etapa nem passam o campo, e a reversão do
      -- envio grava "motivo: null" explicitamente). Um marcador inventaria um TERCEIRO estado, que
      -- o histórico da candidatura exibiria como se fosse a frase que alguém escreveu. A assimetria
      -- com o "resumo" do contato continua sendo a mesma e única: lá a coluna é NOT NULL e não há
      -- nulo para gravar.
      --
      -- O ALCANCE É "alvo" MAIS "ja_anonimizados", e a subconsulta é INDIRETA pela mesma razão do
      -- contato: o evento pendura na CANDIDATURA, nunca no candidato, e não há "candidato_id" para
      -- ler daqui. A guarda de "há o que expurgar" evita gravar nulo por cima de nulo, de hora em
      -- hora, em todo evento de toda pessoa já anonimizada, e ela é a maioria das linhas da tabela.
      motivos_do_historico_expurgados as (
        update as_candidatura_etapas
           set motivo = null
         where candidatura_id in (
                 select k.id
                   from as_candidaturas k
                  where k.candidato_id in (select id from alvo)
                     or k.candidato_id in (select id from ja_anonimizados))
           and motivo is not null
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
      -- nesta passada. As linhas cicatrizadas (identidade externa apagada, conflito da ingestão
      -- apagado, dado pessoal re-nulado,
      -- resumo de contato substituído, motivo de descarte e motivo do histórico nulados) NÃO entram
      -- na conta, porque não
      -- são gente nova expurgada, e somá-las faria o número do log oscilar sem ninguém ter sido
      -- expurgado. Nenhuma das CTEs novas acrescenta NADA ao log (§A.6).
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
