import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";

/**
 * PAINEL DA DIRETORIA (OST do dashboard executivo). Uma leitura só, agregada, sem PII.
 *
 * A REGRA CENTRAL, e o que ela impõe ao desenho: **tudo é filtro e tudo se relaciona**. Clicar numa
 * linha de tabela (um cliente, um farol, um cargo) ou numa coluna de gráfico (um dia, um mês) filtra
 * o painel INTEIRO, e os demais números recalculam. Por isso existe UM endpoint que devolve tudo a
 * partir do MESMO recorte: dois endpoints se desencontrariam na primeira combinação de filtros.
 *
 * A DATA DO EIXO É `data_admissao` (decisão do diretor), não `criado_em`. O motivo é medido: a base
 * inteira foi importada entre 13 e 30 de julho de 2026, então `criado_em` empilharia 2.400 admissões
 * em 18 dias e não diria nada. `data_admissao` é a data do negócio e cobre 99,7% das admissões; as
 * poucas sem data entram nos KPIs (que contam admissão, não dia) e ficam fora dos gráficos, porque
 * não há dia onde colocá-las.
 *
 * UM GRÁFICO NÃO FILTRA A SI MESMO. Clicar no dia 12 filtra KPIs e tabelas, mas o gráfico de dias
 * continua mostrando os 31, com o dia 12 destacado; senão a barra clicada viraria a única do gráfico
 * e não haveria como trocar de dia. Mesma regra para o mês.
 *
 * §A.6: só contagens, códigos e rótulos de catálogo (cliente, cargo, status). Nenhum dado pessoal.
 */
export interface FiltrosGerencial {
  /** Período por `data_admissao` (YYYY-MM-DD). */
  de?: string;
  ate?: string;
  codCliente?: string;
  /**
   * Farol. Aceita UM valor (clique na linha da tabela Farol) ou uma LISTA separada por vírgula
   * (clique num card de KPI). A lista existe porque um KPI é um CONJUNTO de faróis (em admissão =
   * EM_ADMISSAO + BANCO_AGUARDAR), e o card tem de filtrar exatamente o que ele conta, senão o
   * número do card e o número do painel filtrado se contradizem na cara do diretor. Pela mesma
   * regra, "Aguardando Liberação" filtra só `AGUARDANDO_LIBERACAO`, que é só o que ele conta.
   */
  farol?: string;
  /**
   * Card CONTRATO, que passou a ser POR STATUS (decisão do diretor; antes era por tipo de contrato).
   *
   * O valor carrega a TRILHA junto, porque o card consolida DUAS trilhas paralelas que vivem em
   * lugares diferentes: `CAD:<status da frente CADASTRO_CONTRATO>` ou `ASS:<clicksign_status>`. Sem
   * o prefixo, "CADASTRADO" e "ASSINADO" seriam ambíguos na hora de montar o filtro.
   */
  contrato?: string;
  /** Status da frente EXAME (APTO, CANCELADO, A_AGENDAR, ASO_PENDENTE, AGENDADO). */
  exame?: string;
  cargoId?: string;
  /** Dia do mês (1..31), vindo do clique na coluna do gráfico. */
  dia?: number;
  /** Mês (1..12), vindo do clique na coluna do gráfico mês a mês. */
  mes?: number;
  /** Ano do mês clicado (o gráfico mostra o corrente e o anterior). */
  ano?: number;
  /**
   * SUB-STATUS DA SALA DE ESPERA clicado (o `id` do catálogo `sala_espera_status`), vindo das linhas
   * da Sala dentro da tabela de Farol. É um RECORTE DA SALA: o painel passa a responder quem está
   * naquele status, por cliente e por cargo, lendo `sala_espera`.
   *
   * O lado das admissões fica VAZIO neste recorte, e isso é a correção do erro anterior. A primeira
   * tentativa recortava as admissões por `cod_cliente in (quem tem gente na Sala)`, e o painel
   * respondia com as admissões CONCLUÍDAS daqueles clientes: quem clica na fila da Sala quer ver a
   * fila, não a esteira de quem por acaso divide o cliente com ela.
   */
  salaStatus?: string;
  /**
   * CARD DA SALA clicado: o mesmo recorte do `salaStatus`, só que da fila INTEIRA, sem escolher
   * situação. O painel passa a mostrar a composição da Sala (cliente, cargo e as situações), e o lado
   * das admissões sai, pela mesma razão: quem aguarda na Sala ainda não tem admissão.
   */
  sala?: boolean;
}

export interface LinhaSegmento {
  chave: string;
  rotulo: string;
  total: number;
}

@Injectable()
export class GerencialService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Condições do recorte. `exceto` deixa de fora o próprio eixo do gráfico que está sendo montado
   * (ver "um gráfico não filtra a si mesmo").
   */
  private condicoes(f: FiltrosGerencial, exceto: "dia" | "mes" | null = null): SQL[] {
    const cond: SQL[] = [];
    // RECORTE DA SALA (sub-status clicado): o lado das admissões sai INTEIRO, e é de propósito.
    //
    // Quem está na fila da Sala não tem admissão: `sala_espera` nasceu separada justamente porque
    // aquele registro não cabe em `admissoes` (nem CPF ele tem, §A.3). Então a resposta honesta para
    // "quantas admissões estão neste sub-status da Sala" é NENHUMA, e o painel diz "sem dados neste
    // recorte" em vez de inventar vínculo.
    //
    // A tentativa anterior inventou: ligou os dois lados pelo cliente (`cod_cliente in (...)`) e
    // trouxe as admissões CONCLUÍDAS de quem tinha gente na Sala. Por isso a condição aqui é o corte
    // seco, e não um join: qualquer ponte entre as tabelas volta a responder outra pergunta.
    //
    // Quem responde este recorte são `segClienteSala`/`segCargoSala` e o `salaEspera`, que leem
    // `sala_espera`. As consultas de admissão seguem com o mesmo SQL de sempre, só que sem linha.
    //
    // Vale para os dois jeitos de entrar no recorte da Sala: o CARD (a fila inteira) e a LINHA de
    // sub-status (uma situação). São o mesmo recorte com granularidade diferente, então compartilham
    // o mesmo corte em vez de cada um inventar o seu.
    if (this.recorteDaSala(f)) cond.push(sql`false`);
    if (f.de) cond.push(sql`a.data_admissao >= ${f.de}::date`);
    if (f.ate) cond.push(sql`a.data_admissao <= ${f.ate}::date`);
    if (f.codCliente) cond.push(sql`a.cod_cliente = ${f.codCliente}`);
    // Um valor vira igualdade; vários viram um OR entre parênteses. Sem `any()` de propósito: o
    // parâmetro seguiria como texto e o Postgres cobraria o cast do array, e um OR de igualdades usa
    // o mesmo índice sem pedir nada em troca.
    const farois = (f.farol ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (farois.length > 0) {
      const alternativas = farois
        .map((v) => sql`a.farol_global::text = ${v}`)
        .reduce((acc, c) => sql`${acc} or ${c}`);
      cond.push(sql`(${alternativas})`);
    }
    if (f.contrato) {
      // `CAD:` lê a frente de Cadastro; `ASS:` lê o estado do envelope na admissão (INT-4).
      const sep = f.contrato.indexOf(":");
      const trilha = sep >= 0 ? f.contrato.slice(0, sep) : "";
      const valor = sep >= 0 ? f.contrato.slice(sep + 1) : "";
      if (trilha === "CAD" && valor) cond.push(sql`fc.status = ${valor}`);
      if (trilha === "ASS" && valor) cond.push(sql`a.clicksign_status::text = ${valor}`);
    }
    // A SALA DE ESPERA NÃO RECORTA ESTE LADO, e a tentativa anterior mostrou por quê. O card da Sala
    // chegou a recortar as admissões por `cod_cliente in (quem tem gente na Sala)`, e o painel passou
    // a responder com as admissões CONCLUÍDAS daqueles clientes: dado verdadeiro, resposta errada,
    // porque quem clica na Sala quer ver a Sala, não a esteira dos mesmos clientes. A análise da Sala
    // agora vive onde ela é lida, nas linhas da tabela de Farol, e este lado segue intocado (§A.26).
    if (f.exame) cond.push(sql`fe.status = ${f.exame}`);
    if (f.cargoId) cond.push(sql`a.cargo_id = ${f.cargoId}`);
    if (f.dia && exceto !== "dia") {
      cond.push(sql`extract(day from a.data_admissao) = ${f.dia}`);
    }
    if (f.mes && exceto !== "mes") {
      cond.push(sql`extract(month from a.data_admissao) = ${f.mes}`);
      if (f.ano) cond.push(sql`extract(year from a.data_admissao) = ${f.ano}`);
    }
    return cond;
  }

  /** Monta o `WHERE` do recorte (sempre com pelo menos uma condição verdadeira, para simplificar). */
  private onde(f: FiltrosGerencial, exceto: "dia" | "mes" | null = null): SQL {
    const cond = this.condicoes(f, exceto);
    if (cond.length === 0) return sql`true`;
    return cond.reduce((acc, c) => sql`${acc} and ${c}`);
  }

  /**
   * A base do recorte. Os LEFT JOIN nas frentes de EXAME e de CADASTRO não multiplicam linha: existe
   * no máximo uma frente por (admissão + tipo), garantido pelo unique `frentes_admissao_admissao_id_
   * tipo_unique` e conferido no acervo (zero duplicidade). A contagem do painel continua sendo uma
   * linha por admissão.
   */
  private base(f: FiltrosGerencial, exceto: "dia" | "mes" | null = null): SQL {
    return sql`
      from admissoes a
      left join frentes_admissao fe on fe.admissao_id = a.id and fe.tipo = 'EXAME'
      left join frente_status_catalogo cat on cat.tipo = 'EXAME' and cat.codigo = fe.status
      left join frentes_admissao fc on fc.admissao_id = a.id and fc.tipo = 'CADASTRO_CONTRATO'
      left join clientes cl on cl.cod_cliente = a.cod_cliente
      left join cargos cg on cg.id = a.cargo_id
      where ${this.onde(f, exceto)}
    `;
  }

  /**
   * A SALA DE ESPERA NO PAINEL: o que ela pode e o que ela NÃO pode responder.
   *
   * `sala_espera` é tabela à parte de `admissoes` e só conhece CLIENTE e CARGO. Ela não tem
   * `data_admissao`, farol, contrato nem exame, então há recortes do painel que ela simplesmente não
   * sabe responder. Quando um desses está ligado, a Sala fica FORA da conta em vez de entrar
   * ignorando o filtro: um número que ignora o recorte é pior que um número ausente, porque a tela
   * afirma que aquilo pertence ao conjunto filtrado quando não pertence.
   *
   * Exemplo do estrago que isto evita: com "Exame Admissional = Apto" ligado, o painel mostra só
   * admissões aptas; somar registros da Sala, que nunca tiveram exame, inflaria o card com gente que
   * o recorte excluiu.
   */
  /** O painel está recortado PELA SALA, seja pelo card (fila inteira) ou por uma situação dela. */
  private recorteDaSala(f: FiltrosGerencial): boolean {
    return Boolean(f.sala || f.salaStatus);
  }

  private salaRespondeAoRecorte(f: FiltrosGerencial): boolean {
    return !f.de && !f.ate && !f.contrato && !f.exame && !f.dia && !f.mes;
  }

  /**
   * Recorte da Sala: só o que ela tem de verdade (cliente, cargo e o próprio sub-status). É por aqui
   * que os filtros COMBINAM: com a AVL filtrada, clicar num sub-status mostra aquele status dentro da
   * AVL, porque as duas condições entram na mesma consulta.
   */
  private ondeSala(f: FiltrosGerencial): SQL {
    const cond: SQL[] = [];
    if (f.codCliente) cond.push(sql`s.cod_cliente = ${f.codCliente}`);
    if (f.cargoId) cond.push(sql`s.cargo_id = ${f.cargoId}`);
    if (f.salaStatus) cond.push(sql`s.status_id = ${f.salaStatus}`);
    if (cond.length === 0) return sql`true`;
    return cond.reduce((acc, c) => sql`${acc} and ${c}`);
  }

  /**
   * CLIENTE e CARGO no recorte da Sala: as mesmas duas tabelas do painel, lidas de `sala_espera` em
   * vez de `admissoes`. É o que responde "quem está aguardando candidatura, e em qual cliente e cargo".
   *
   * Só a fila viva (`encerra = false`, sem admissão vinculada), a mesma régua do card e das linhas:
   * três leituras que discordassem entre si sobre quem está na fila seriam três respostas para a
   * mesma pergunta.
   */
  private async segClienteSala(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    if (!this.salaRespondeAoRecorte(f)) return [];
    return (await this.db.execute(sql`
      select s.cod_cliente as chave,
             coalesce(nullif(cl.nome_operacao, ''), cl.razao_social, s.cod_cliente) as rotulo,
             count(*)::int as total
      from sala_espera s
      join sala_espera_status st on st.id = s.status_id
      left join clientes cl on cl.cod_cliente = s.cod_cliente
      where ${this.ondeSala(f)} and st.encerra = false and s.admissao_id is null
      group by 1, 2 order by 3 desc, 2
    `)) as unknown as LinhaSegmento[];
  }

  private async segCargoSala(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    if (!this.salaRespondeAoRecorte(f)) return [];
    return (await this.db.execute(sql`
      select s.cargo_id::text as chave, cg.nome as rotulo, count(*)::int as total
      from sala_espera s
      join sala_espera_status st on st.id = s.status_id
      left join cargos cg on cg.id = s.cargo_id
      where ${this.ondeSala(f)} and st.encerra = false and s.admissao_id is null
      group by 1, 2 order by 3 desc, 2
    `)) as unknown as LinhaSegmento[];
  }

  /**
   * CONSULTA PARALELA da Sala de Espera. NÃO passa pelo `base()` de propósito: aquele parte de
   * `admissoes` e um registro da Sala sem vínculo não tem admissão para juntar. Ficam duas leituras
   * independentes, e o painel soma o que faz sentido somar.
   *
   * SEM DUPLA CONTAGEM, que é o ponto delicado do card de declínios: registro da Sala com
   * `admissao_id` preenchido JÁ está contado do lado das admissões (é a mesma pessoa, o mesmo
   * processo). Por isso `pendentes` e `declinios` exigem `admissao_id is null`. O `emAdmissao` conta
   * justamente os vinculados, mas ele é informativo da Sala e nunca entra em soma com o lado das
   * admissões.
   *
   * §A.6: só contagens e rótulos de catálogo, nenhum dado pessoal.
   */
  private async salaEspera(f: FiltrosGerencial) {
    const vazio = { pendentes: 0, emAdmissao: 0, declinios: 0, subStatus: [] as LinhaSegmento[] };
    if (!this.salaRespondeAoRecorte(f)) return vazio;

    const onde = this.ondeSala(f);
    const [linha] = (await this.db.execute(sql`
      select
        count(*) filter (where st.encerra = false and s.admissao_id is null)::int as pendentes,
        count(*) filter (where s.admissao_id is not null)::int as em_admissao,
        count(*) filter (where st.encerra = true and s.admissao_id is null)::int as declinios
      from sala_espera s
      join sala_espera_status st on st.id = s.status_id
      where ${onde}
    `)) as unknown as Array<{ pendentes: number; em_admissao: number; declinios: number }>;

    // DESDOBRAMENTO por sub-status: é o que a tela mostra como LINHAS DENTRO DA TABELA DE FAROL,
    // junto com os faróis de admissão (decisão do diretor: toda a análise num lugar só). Por isso ele
    // é lido SEMPRE, e não mais só quando havia um cliente escolhido: as linhas fazem parte da
    // leitura padrão do painel, não de um desdobramento sob demanda. Respeita o recorte de cliente e
    // de cargo pelo `ondeSala`, então filtrar um cliente muda as contagens destas linhas.
    //
    // Com um FAROL DE ADMISSÃO filtrado, as linhas da Sala saem: a tabela passa a falar de um farol
    // específico da esteira, e quem aguarda na Sala não está nele. Continuar listando somaria ao card
    // uma fila que o recorte excluiu. Isto não mexe no card de declínios, que tem regra própria
    // (`parcelaDeclinioSala`) e segue somando com `farol=DECLINOU`.
    //
    // Os rótulos vêm do CATÁLOGO (`sala_espera_status`), nunca de lista fixa: o diretor cria e
    // renomeia status por tela, e uma lista no código nasceria desatualizada no primeiro cadastro.
    const subStatus = f.farol
      ? []
      : ((await this.db.execute(sql`
          select st.id::text as chave, st.nome as rotulo, count(*)::int as total
          from sala_espera s
          join sala_espera_status st on st.id = s.status_id
          where ${onde} and st.encerra = false and s.admissao_id is null
          group by 1, 2 order by 3 desc, 2
        `)) as unknown as LinhaSegmento[]);

    return {
      pendentes: Number(linha?.pendentes ?? 0),
      emAdmissao: Number(linha?.em_admissao ?? 0),
      declinios: Number(linha?.declinios ?? 0),
      subStatus,
    };
  }

  /**
   * A parcela da Sala que entra no CARD GERAL DE DECLÍNIOS (decisão do diretor: número consolidado,
   * sem segmentar a origem na tela).
   *
   * Só entra quando o recorte ADMITE declínio. Com o painel filtrado por outro farol (por exemplo
   * "Admissão Concluída"), somar os declínios da Sala mostraria declínio dentro de um recorte que
   * pediu justamente o contrário.
   */
  private parcelaDeclinioSala(f: FiltrosGerencial, declinios: number): number {
    const farois = (f.farol ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (farois.length > 0 && !farois.includes("DECLINOU")) return 0;
    return declinios;
  }

  /**
   * Tudo o que o painel mostra, do MESMO recorte.
   *
   * NO RECORTE DA SALA, duas tabelas trocam de fonte: Cliente e Cargo passam a ser lidas de
   * `sala_espera`, porque são as duas perguntas que a Sala sabe responder (qual cliente e qual cargo
   * têm gente naquele status). As demais seguem lendo admissões e vêm vazias, que é a resposta certa
   * para quem ainda não tem admissão. A troca acontece AQUI, na montagem: nenhuma consulta de
   * admissão é alterada para isso (§A.26).
   */
  async painel(f: FiltrosGerencial) {
    const recorteDaSala = this.recorteDaSala(f);
    const [kpis, cliente, farol, contrato, exame, cargo, porDia, mesAMes, sala] = await Promise.all([
      this.kpis(f),
      recorteDaSala ? this.segClienteSala(f) : this.segCliente(f),
      this.segFarol(f),
      this.segContrato(f),
      this.segExame(f),
      recorteDaSala ? this.segCargoSala(f) : this.segCargo(f),
      this.seriePorDia(f),
      this.serieMesAMes(f),
      this.salaEspera(f),
    ]);
    return {
      // O card de declínios é CONSOLIDADO: declínio do fluxo de admissão mais declínio que morreu
      // ainda na Sala, sem separar a origem na tela. A soma acontece AQUI, na montagem da resposta,
      // e não dentro do `kpis()`: assim o `base()` e o `condicoes()` seguem intocados e as outras
      // sete consultas do painel não sabem que a Sala existe (§A.26).
      kpis: { ...kpis, declinios: kpis.declinios + this.parcelaDeclinioSala(f, sala.declinios) },
      sala,
      segmentos: { cliente, farol, contrato, exame, cargo },
      series: { porDia, mesAMes },
      // O ano de referência do comparativo é resolvido pelo RELÓGIO, então em 2027 o painel passa a
      // comparar 2027 com 2026 sozinho, sem tocar em código (decisão do diretor).
      anoCorrente: new Date().getFullYear(),
    };
  }

  /**
   * Os CINCO números do topo. Cada um é uma fatia do farol.
   *
   * "AGUARDANDO LIBERAÇÃO" CONTA SÓ QUEM ESTÁ AGUARDANDO. `LIBERACAO_RECUSADA` ficava somada aqui e
   * inflava o card com caso ENCERRADO: recusa é desfecho, já foi tratada, e ninguém está esperando
   * decisão sobre ela. O painel mostrava duas admissões "a liberar" que não existiam como trabalho
   * (correção pedida pelo diretor). A recusa continua na tabela de Farol, porque lá é um status real
   * do acervo; o que ela não faz é entrar na contagem de pendência.
   *
   * Consequência aceita: os cards deixam de fechar a soma de `trabalhadas`, que já não fechava
   * (RESCISAO nunca teve card). `trabalhadas` é o total do recorte, não a soma dos outros quatro.
   */
  private async kpis(f: FiltrosGerencial) {
    const [row] = (await this.db.execute(sql`
      select
        count(*)::int as trabalhadas,
        count(*) filter (where a.farol_global = 'AGUARDANDO_LIBERACAO')::int as aguardando_liberacao,
        count(*) filter (where a.farol_global in ('EM_ADMISSAO','BANCO_AGUARDAR'))::int as em_admissao,
        count(*) filter (where a.farol_global = 'ADMISSAO_CONCLUIDA')::int as ativos,
        count(*) filter (where a.farol_global = 'DECLINOU')::int as declinios
      ${this.base(f)}
    `)) as unknown as Array<{
      trabalhadas: number;
      aguardando_liberacao: number;
      em_admissao: number;
      ativos: number;
      declinios: number;
    }>;
    return {
      trabalhadas: row?.trabalhadas ?? 0,
      aguardandoLiberacao: row?.aguardando_liberacao ?? 0,
      emAdmissao: row?.em_admissao ?? 0,
      ativos: row?.ativos ?? 0,
      declinios: row?.declinios ?? 0,
    };
  }

  private async segCliente(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.cod_cliente as chave,
             coalesce(nullif(cl.nome_operacao, ''), cl.razao_social, a.cod_cliente) as rotulo,
             count(*)::int as total
      ${this.base(f)} and a.cod_cliente is not null
      group by 1, 2 order by 3 desc, 2
    `)) as unknown as LinhaSegmento[];
  }

  private async segFarol(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.farol_global::text as chave, a.farol_global::text as rotulo, count(*)::int as total
      ${this.base(f)}
      group by 1 order by 3 desc
    `)) as unknown as LinhaSegmento[];
  }

  /**
   * CONTRATO POR STATUS (decisão do diretor). Antes este card quebrava por TIPO de contrato
   * (temporário, terceiro); agora mostra em que ponto do contrato cada admissão está, no mesmo
   * modelo do card de Exame.
   *
   * O card consolida DUAS TRILHAS PARALELAS, e isso muda como ele se lê:
   *  - CADASTRO, que é a frente `CADASTRO_CONTRATO` (A Cadastrar → Cadastrado);
   *  - ASSINATURA, que NÃO é frente: vive em `admissoes.clicksign_status` (INT-4).
   *
   * As duas correm ao mesmo tempo, então uma admissão pode estar Cadastrada E Assinada, e vai contar
   * nas duas linhas. As 4 linhas NÃO somam o total do recorte, e isso é correto: cada PAR fecha a sua
   * própria trilha. No acervo atual são 1.516 admissões nas duas condições, então tratar isso como
   * uma fila única exigiria inventar uma ordem entre trilhas que o processo não tem.
   *
   * REATIVO COMO OS DEMAIS (ajuste do diretor). As contagens sempre vieram do recorte, mas as quatro
   * linhas ficavam na tela mesmo zeradas, e o card parecia congelado: filtrar "Admissão Concluída"
   * fazia Cliente, Cargo e Exame encolherem para o que existe, enquanto o Cadastro seguia exibindo
   * quatro status, três deles em zero. Agora linha sem dado SAI, e o card fica vazio quando o recorte
   * não tem cadastro nenhum, com a mesma leitura dos outros.
   *
   * ORDEM POR CONTAGEM, maior primeiro (ajuste do diretor), como Cliente e Cargo. O empate mantém a
   * ordem do processo (a cadastrar, cadastrado, aguardando assinatura, assinado), porque `sort` é
   * estável: com dois status na mesma contagem, quem vem antes no caminho aparece antes.
   *
   * Uma consulta só, com contagem condicional, sobre o MESMO recorte dos demais cards.
   */
  private async segContrato(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    const [l] = (await this.db.execute(sql`
      select
        count(*) filter (where fc.status = 'A_CADASTRAR')::int as a_cadastrar,
        count(*) filter (where fc.status = 'CADASTRADO')::int as cadastrado,
        count(*) filter (where a.clicksign_status::text = 'AGUARDANDO_ASSINATURA')::int as aguardando,
        count(*) filter (where a.clicksign_status::text = 'ASSINADO')::int as assinado
      ${this.base(f)}
    `)) as unknown as Array<{
      a_cadastrar: number;
      cadastrado: number;
      aguardando: number;
      assinado: number;
    }>;
    return [
      { chave: "CAD:A_CADASTRAR", rotulo: "A Cadastrar", total: Number(l?.a_cadastrar ?? 0) },
      { chave: "CAD:CADASTRADO", rotulo: "Cadastrado", total: Number(l?.cadastrado ?? 0) },
      {
        chave: "ASS:AGUARDANDO_ASSINATURA",
        rotulo: "Aguardando Assinatura",
        total: Number(l?.aguardando ?? 0),
      },
      { chave: "ASS:ASSINADO", rotulo: "Assinado", total: Number(l?.assinado ?? 0) },
    ]
      .filter((linha) => linha.total > 0)
      .sort((a, b) => b.total - a.total);
  }

  private async segExame(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select fe.status as chave,
             coalesce(cat.rotulo, fe.status) as rotulo,
             count(*)::int as total
      ${this.base(f)} and fe.status is not null
      group by 1, 2 order by 3 desc
    `)) as unknown as LinhaSegmento[];
  }

  private async segCargo(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.cargo_id::text as chave, cg.nome as rotulo, count(*)::int as total
      ${this.base(f)} and a.cargo_id is not null
      group by 1, 2 order by 3 desc, 2
    `)) as unknown as LinhaSegmento[];
  }

  /** Colunas 1 a 31: quantas admissões caem em cada dia do mês, dentro do recorte. */
  private async seriePorDia(f: FiltrosGerencial) {
    const linhas = (await this.db.execute(sql`
      select extract(day from a.data_admissao)::int as dia, count(*)::int as total
      ${this.base(f, "dia")} and a.data_admissao is not null
      group by 1 order by 1
    `)) as unknown as Array<{ dia: number; total: number }>;
    const porDia = new Map(linhas.map((l) => [Number(l.dia), Number(l.total)]));
    // Devolve os 31 dias SEMPRE, inclusive os zerados: o gráfico tem eixo fixo e não pode "encolher".
    return Array.from({ length: 31 }, (_, i) => ({ dia: i + 1, total: porDia.get(i + 1) ?? 0 }));
  }

  /** Doze meses do ano corrente ao lado do MESMO mês do ano anterior (comparativo do diretor). */
  private async serieMesAMes(f: FiltrosGerencial) {
    const linhas = (await this.db.execute(sql`
      select extract(year from a.data_admissao)::int as ano,
             extract(month from a.data_admissao)::int as mes,
             count(*)::int as total
      ${this.base(f, "mes")} and a.data_admissao is not null
      group by 1, 2 order by 1, 2
    `)) as unknown as Array<{ ano: number; mes: number; total: number }>;

    const anoCorrente = new Date().getFullYear();
    const chave = (ano: number, mes: number) => `${ano}-${mes}`;
    const mapa = new Map(linhas.map((l) => [chave(Number(l.ano), Number(l.mes)), Number(l.total)]));
    return Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      atual: mapa.get(chave(anoCorrente, i + 1)) ?? 0,
      anterior: mapa.get(chave(anoCorrente - 1, i + 1)) ?? 0,
    }));
  }
}
