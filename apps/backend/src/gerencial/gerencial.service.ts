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
  /**
   * Status da frente AUDITORIA (ANALISE_PENDENTE, AGUARDA_REENVIO, ANALISE_OK, DECLINOU). A frente
   * que diz se o documento da pessoa está EM ANÁLISE ou voltou para reenvio, que é o que o card novo
   * responde.
   */
  auditoria?: string;
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

/**
 * O CAMPO QUE UMA CONSULTA DEIXA DE FORA do próprio recorte ("nada filtra a si mesmo"). Cada card e
 * cada gráfico passa o seu; `null` aplica tudo, que é o caso dos KPIs.
 */
type CampoDoRecorte =
  | "dia"
  | "mes"
  | "cliente"
  | "farol"
  | "contrato"
  | "auditoria"
  | "exame"
  | "cargo"
  | null;

export interface LinhaSegmento {
  chave: string;
  rotulo: string;
  total: number;
}

@Injectable()
export class GerencialService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * MULTI-SELEÇÃO (onda 5): a lista de valores de UM campo do recorte.
   *
   * A tela manda os escolhidos separados por vírgula, e a limpeza é feita aqui porque a lista é
   * montada por concatenação: acrescentar e remover deixa vírgula sobrando, e um pedaço vazio viraria
   * `coluna = ''`, que filtra por nada e some com o painel inteiro. Vazio depois da limpeza significa
   * SEM FILTRO, não filtro por vazio.
   */
  private lista(valor?: string): string[] {
    return (valor ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  /**
   * OR DENTRO DO CAMPO, que junto com o `and` do `onde()` fecha a regra do painel: dois clientes é
   * "um ou o outro", cliente com cargo é "os dois ao mesmo tempo".
   *
   * ENTRE PARÊNTESES quando há mais de um: sem eles o `or` vazaria para fora e se ligaria ao `and`
   * dos outros campos, que em SQL tem precedência maior, trazendo linha que o recorte não pediu. Com
   * UM valor só devolve a igualdade crua, sem parêntese e sem `or`, para o SQL sair idêntico ao de
   * antes desta onda (§A.26): é assim que a esmagadora maioria dos cliques do painel segue rodando.
   *
   * Sem `any()`/`in` com array de propósito, mantendo o que o farol já fazia: o parâmetro seguiria
   * como texto e o Postgres cobraria o cast, enquanto um OR de igualdades usa o mesmo índice sem
   * pedir nada em troca.
   */
  private ou(valores: string[], monta: (v: string) => SQL): SQL | null {
    if (valores.length === 0) return null;
    if (valores.length === 1) return monta(valores[0]);
    return sql`(${valores.map(monta).reduce((acc, c) => sql`${acc} or ${c}`)})`;
  }

  /**
   * Condições do recorte. `exceto` deixa de fora UM campo, o da própria consulta que está sendo
   * montada, e é o que faz valer a regra "nada filtra a si mesmo": o gráfico de dias mostra os 31 com
   * o dia escolhido em destaque, e o card de Cliente mostra os clientes com os escolhidos acesos.
   *
   * Sem isso o card encolhia para a linha clicada e não sobrava onde clicar para escolher a segunda,
   * então a multi-seleção com Ctrl (onda 5) simplesmente não teria como acontecer dentro dos cards.
   * Os KPIs e os gráficos seguem aplicando TUDO, inclusive o campo do card: o número do topo tem de
   * contar exatamente o recorte, senão a tela se contradiz.
   */
  private condicoes(
    f: FiltrosGerencial,
    exceto: CampoDoRecorte = null,
  ): SQL[] {
    const cond: SQL[] = [];
    /** Acrescenta o recorte de um campo, já com a multi-seleção resolvida. */
    const campo = (valor: string | undefined, monta: (v: string) => SQL) => {
      const c = this.ou(this.lista(valor), monta);
      if (c) cond.push(c);
    };
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
    if (exceto !== "cliente") campo(f.codCliente, (v) => sql`a.cod_cliente = ${v}`);
    if (exceto !== "farol") campo(f.farol, (v) => sql`a.farol_global::text = ${v}`);
    // CARD CADASTRO: a exceção da multi-seleção, e ela é do DOMÍNIO, não do código.
    //
    // Este card consolida DUAS TRILHAS PARALELAS em colunas diferentes: `CAD:` é a frente de Cadastro
    // (`fc.status`) e `ASS:` é o estado do envelope na própria admissão (`clicksign_status`, INT-4).
    // A mesma admissão pode estar nas duas ao mesmo tempo, e é isso que muda a regra.
    //
    // REGRA DO DIRETOR: OU dentro da trilha, E entre trilhas. Dentro da trilha os status são
    // EXCLUSIVOS (ninguém está "a cadastrar" e "cadastrado"), então somar é o certo: A Cadastrar +
    // Cadastrado = 1.681. Entre trilhas, somar não responderia nada, porque todo assinado já está
    // cadastrado e a união devolveria 1.573, o mesmo número de só "Cadastrado"; cruzar responde a
    // pergunta de operação: Cadastrado + Assinado = 1.520, e Cadastrado + Aguardando Assinatura = 0.
    //
    // O `and` entre as duas trilhas sai de graça: são duas condições separadas em `cond`, e o
    // `onde()` já liga tudo por and. Item sem trilha continua sendo descartado, inclusive no meio de
    // uma lista válida, que é o mesmo cuidado de antes com recorte malformado.
    const porTrilha: Record<string, string[]> = { CAD: [], ASS: [] };
    for (const item of this.lista(f.contrato)) {
      const sep = item.indexOf(":");
      if (sep < 0) continue;
      const trilha = item.slice(0, sep);
      const valor = item.slice(sep + 1);
      if (valor && porTrilha[trilha]) porTrilha[trilha].push(valor);
    }
    if (exceto !== "contrato") {
      campo(porTrilha.CAD.join(","), (v) => sql`fc.status = ${v}`);
      campo(porTrilha.ASS.join(","), (v) => sql`a.clicksign_status::text = ${v}`);
    }
    // A SALA DE ESPERA NÃO RECORTA ESTE LADO, e a tentativa anterior mostrou por quê. O card da Sala
    // chegou a recortar as admissões por `cod_cliente in (quem tem gente na Sala)`, e o painel passou
    // a responder com as admissões CONCLUÍDAS daqueles clientes: dado verdadeiro, resposta errada,
    // porque quem clica na Sala quer ver a Sala, não a esteira dos mesmos clientes. A análise da Sala
    // agora vive onde ela é lida, nas linhas da tabela de Farol, e este lado segue intocado (§A.26).
    if (exceto !== "exame") campo(f.exame, (v) => sql`fe.status = ${v}`);
    if (exceto !== "auditoria") campo(f.auditoria, (v) => sql`fa.status = ${v}`);
    if (exceto !== "cargo") campo(f.cargoId, (v) => sql`a.cargo_id = ${v}`);
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
  private onde(f: FiltrosGerencial, exceto: CampoDoRecorte = null): SQL {
    const cond = this.condicoes(f, exceto);
    if (cond.length === 0) return sql`true`;
    return cond.reduce((acc, c) => sql`${acc} and ${c}`);
  }

  /**
   * A base do recorte. Os LEFT JOIN nas frentes de EXAME, CADASTRO e AUDITORIA não multiplicam
   * linha: existe no máximo uma frente por (admissão + tipo), garantido pelo unique
   * `frentes_admissao_admissao_id_tipo_unique` e conferido no acervo (zero duplicidade). A contagem
   * do painel continua sendo uma linha por admissão.
   *
   * A AUDITORIA entrou por último e é a única das três que mexeu no `base()` depois de o painel já
   * estar validado, então a prova foi feita de novo, não herdada: as 8 consultas foram capturadas da
   * tela em três recortes (sem filtro, por farol e por cliente) antes e depois do join, e a resposta
   * saiu idêntica campo a campo. O que sustenta isso é o mesmo unique de sempre, e o LEFT garante
   * que admissão sem frente de auditoria continue na conta (9 do acervo não têm).
   */
  private base(f: FiltrosGerencial, exceto: CampoDoRecorte = null): SQL {
    return sql`
      from admissoes a
      left join frentes_admissao fe on fe.admissao_id = a.id and fe.tipo = 'EXAME'
      left join frente_status_catalogo cat on cat.tipo = 'EXAME' and cat.codigo = fe.status
      left join frentes_admissao fc on fc.admissao_id = a.id and fc.tipo = 'CADASTRO_CONTRATO'
      left join frentes_admissao fa on fa.admissao_id = a.id and fa.tipo = 'AUDITORIA'
      left join frente_status_catalogo cata on cata.tipo = 'AUDITORIA' and cata.codigo = fa.status
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
  private salaRespondeAoRecorte(f: FiltrosGerencial): boolean {
    return (
      !f.de && !f.ate && !f.contrato && !f.exame && !f.auditoria && !f.dia && !f.mes
    );
  }

  /** O painel está recortado PELA SALA, seja pelo card (fila inteira) ou por uma situação dela. */
  private recorteDaSala(f: FiltrosGerencial): boolean {
    return Boolean(f.sala || f.salaStatus);
  }

  /**
   * Recorte da Sala: só o que ela tem de verdade (cliente, cargo e o próprio sub-status). É por aqui
   * que os filtros COMBINAM: com a AVL filtrada, clicar num sub-status mostra aquele status dentro da
   * AVL, porque as duas condições entram na mesma consulta.
   */
  private ondeSala(f: FiltrosGerencial): SQL {
    const cond: SQL[] = [];
    // A multi-seleção vale aqui também, com as COLUNAS DA SALA: dois clientes escolhidos no painel
    // recortam a fila da Sala pelos mesmos dois, senão o card e as linhas dela responderiam por um
    // conjunto diferente do resto da tela.
    for (const c of [
      this.ou(this.lista(f.codCliente), (v) => sql`s.cod_cliente = ${v}`),
      this.ou(this.lista(f.cargoId), (v) => sql`s.cargo_id = ${v}`),
      this.ou(this.lista(f.salaStatus), (v) => sql`s.status_id = ${v}`),
    ]) {
      if (c) cond.push(c);
    }
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
    const [kpis, cliente, farol, contrato, auditoria, exame, cargo, porDia, mesAMes, sala] =
      await Promise.all([
        this.kpis(f),
        recorteDaSala ? this.segClienteSala(f) : this.segCliente(f),
        this.segFarol(f),
        this.segContrato(f),
        this.segAuditoria(f),
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
      // A AUDITORIA entra ANTES do Exame, que é a ordem do processo: as duas frentes nascem juntas
      // (regra 1 do domínio), mas o documento é o que trava a esteira primeiro.
      segmentos: { cliente, farol, contrato, auditoria, exame, cargo },
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
  /**
   * OS NOMES por trás do card "Em Admissão" (melhoria EAC, item 13).
   *
   * O CARD DIZ QUANTOS, e a pergunta seguinte é sempre QUEM. Até aqui o número era um beco: para
   * saber os nomes, a pessoa saía do painel e ia refazer o mesmo recorte no Gerenciador, na mão.
   *
   * REUSA O `base()` E O `onde()`, e é isso que faz o modal acompanhar o filtro ativo por
   * construção: se a tela está filtrada por cliente e período, a lista vem daquele recorte, sem
   * régua nova para divergir do número que a pessoa acabou de ler. Acrescenta APENAS o recorte de
   * farol do card (EM_ADMISSAO e BANCO_AGUARDAR), o mesmo par que o KPI conta.
   *
   * PAGINADO, e não "todos de uma vez": são 120 pessoas hoje e podem ser milhares, e o modal existe
   * para consultar, não para exportar.
   *
   * §A.6: nome e o mínimo para identificar de quem se fala (cliente e cargo, que são catálogo). Sem
   * CPF, sem contato e sem documento. Os nomes NÃO são logados em lugar nenhum.
   */
  async nomesEmAdmissao(f: FiltrosGerencial, page = 1, pageSize = 50) {
    const p = Math.max(1, Math.floor(page));
    const tamanho = Math.min(200, Math.max(1, Math.floor(pageSize)));
    const offset = (p - 1) * tamanho;

    const [linhas, [contagem]] = await Promise.all([
      // O NOME vem por SUBCONSULTA e não por join, e não é preferência: `base()` já termina no
      // `where`, então qualquer `join` escrito aqui cairia DEPOIS dele e o Postgres recusaria. A
      // alternativa seria mexer no `base()`, que é compartilhado pelas oito consultas do painel
      // validado (§A.26). A subconsulta é correlacionada por CPF, que é a chave da tabela.
      this.db.execute(sql`
        select (select nome from candidatos c where c.cpf = a.candidato_cpf) as candidato,
               coalesce(nullif(cl.nome_operacao, ''), cl.razao_social, a.cod_cliente) as cliente,
               cg.nome as cargo,
               a.data_admissao as data_admissao,
               a.farol_global::text as farol
        ${this.base(f)} and a.farol_global in ('EM_ADMISSAO','BANCO_AGUARDAR')
        order by 1 asc
        limit ${tamanho} offset ${offset}
      `) as unknown as Promise<
        Array<{
          candidato: string;
          cliente: string | null;
          cargo: string | null;
          data_admissao: string | null;
          farol: string;
        }>
      >,
      this.db.execute(sql`
        select count(*)::int as total
        ${this.base(f)} and a.farol_global in ('EM_ADMISSAO','BANCO_AGUARDAR')
      `) as unknown as Promise<Array<{ total: number }>>,
    ]);

    const total = Number(contagem?.total ?? 0);
    return {
      items: linhas.map((l) => ({
        candidato: l.candidato,
        cliente: l.cliente,
        cargo: l.cargo,
        dataAdmissao: l.data_admissao,
        farol: l.farol,
      })),
      total,
      page: p,
      pageSize: tamanho,
      totalPages: Math.max(1, Math.ceil(total / tamanho)),
    };
  }

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
      ${this.base(f, "cliente")} and a.cod_cliente is not null
      group by 1, 2 order by 3 desc, 2
    `)) as unknown as LinhaSegmento[];
  }

  private async segFarol(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.farol_global::text as chave, a.farol_global::text as rotulo, count(*)::int as total
      ${this.base(f, "farol")}
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
      ${this.base(f, "contrato")}
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

  /**
   * AUDITORIA por status (onda 4). Espelha o card de Exame: uma linha por status que EXISTE no
   * recorte, com o rótulo do catálogo `frente_status_catalogo` e ordem por contagem, maior primeiro.
   *
   * É este card que responde "quantas pessoas estão com documento em análise ou de volta para
   * reenvio": são as linhas `ANALISE_PENDENTE` e `AGUARDA_REENVIO`. Status sem ninguém no recorte não
   * vira linha, como em todos os outros cards, então "reenvio" só aparece quando existir alguém nele.
   *
   * O rótulo vem do CATÁLOGO, nunca de lista fixa: quem renomear o status na administração renomeia
   * aqui junto, e uma lista no código nasceria desatualizada.
   */
  private async segAuditoria(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select fa.status as chave,
             coalesce(cata.rotulo, fa.status) as rotulo,
             count(*)::int as total
      ${this.base(f, "auditoria")} and fa.status is not null
      group by 1, 2 order by 3 desc
    `)) as unknown as LinhaSegmento[];
  }

  private async segExame(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select fe.status as chave,
             coalesce(cat.rotulo, fe.status) as rotulo,
             count(*)::int as total
      ${this.base(f, "exame")} and fe.status is not null
      group by 1, 2 order by 3 desc
    `)) as unknown as LinhaSegmento[];
  }

  private async segCargo(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.cargo_id::text as chave, cg.nome as rotulo, count(*)::int as total
      ${this.base(f, "cargo")} and a.cargo_id is not null
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
