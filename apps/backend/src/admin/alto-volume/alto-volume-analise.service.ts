import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { admissaoConcluidaSql, admissaoEmAndamentoSql } from "../../db/expressoes-admissao";
import { diasUteisEntre } from "../../domain/dias-uteis";
import {
  admissaoProjeto,
  admissoes,
  cargos,
  clientes,
  projetoGrupoEntrada,
  projetoVagaCargo,
  projetosAltoVolume,
} from "../../db/schema";

/**
 * ALTO VOLUME (onda 4): a ANÁLISE do projeto, a pergunta que a frente inteira existe para responder.
 *
 * "Das 57 vagas de Atendente, quantas já fecharam, e dá tempo até a data de entrada?" A esteira sabe
 * conduzir cada admissão, o Gerenciador sabe listar todas, e nenhum dos dois sabe responder isso,
 * porque a pergunta é por PROJETO e o projeto não existia como recorte até esta frente.
 *
 * §A.26: LEITURA PARALELA, zero escrita. Este serviço não tem `insert`, `update` nem `delete`, não
 * chama nada da esteira e não passa pelo `aplicarLiberacao`. Ele parte de `admissao_projeto` (o
 * vínculo das ondas 2 e 3) e faz join com o que já existe. Desligar este arquivo não muda uma linha
 * do que a operação faz hoje.
 *
 * OS BALDES SÃO OS MESMOS DO GERENCIADOR, por importação e não por cópia
 * (`db/expressoes-admissao`): "concluída" aqui e lá é a mesma condição, então o painel do projeto não
 * pode divergir do resto do sistema quando a regra mudar. Foi assim que a frente INTEGRAÇÃO entrou
 * sem quebrar contagem, e é a razão de o diretor ter pedido a extração.
 *
 * PAUSADA TEM BALDE PRÓPRIO (decisão do diretor). Ela não é "em andamento" (não está andando) nem
 * concluída, e some da conta seria pior: o projeto tem prazo, e quem está parado dentro dele é
 * exatamente quem precisa aparecer.
 *
 * §A.6: contagens, códigos e rótulos de catálogo. Nenhum CPF, nenhum nome de candidato: esta tela
 * responde quantos, não quem. Quem responde "quem" é a tela de vínculos da onda 3.
 */
@Injectable()
export class AltoVolumeAnaliseService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * O painel inteiro do projeto numa leitura só, como o Controle Gerencial: cabeçalho, termômetro,
   * baldes, preenchimento por cargo e, quando o projeto usa turmas, o alerta por grupo.
   *
   * UM ENDPOINT E NÃO CINCO, pelo mesmo motivo do painel da diretoria: os números têm de vir do
   * MESMO instante e do MESMO recorte. Dois endpoints se desencontram na primeira troca de projeto,
   * e as barras mostrariam o preenchimento de um enquanto o termômetro conta os dias de outro.
   */
  async analise(projetoId: string, hoje = new Date()) {
    const [projeto] = await this.db
      .select({
        id: projetosAltoVolume.id,
        nome: projetosAltoVolume.nome,
        codCliente: projetosAltoVolume.codCliente,
        clienteRazaoSocial: clientes.razaoSocial,
        clienteNomeOperacao: clientes.nomeOperacao,
        dataInicio: projetosAltoVolume.dataInicio,
        dataFim: projetosAltoVolume.dataFim,
        ativo: projetosAltoVolume.ativo,
      })
      .from(projetosAltoVolume)
      .innerJoin(clientes, eq(clientes.codCliente, projetosAltoVolume.codCliente))
      .where(eq(projetosAltoVolume.id, projetoId));
    if (!projeto) throw new NotFoundException("Projeto de Alto Volume não encontrado.");

    const [porCargo, grupos] = await Promise.all([
      this.preenchimentoPorCargo(projetoId, projeto.codCliente, projeto.dataInicio, projeto.dataFim),
      this.alertaPorGrupo(projetoId),
    ]);

    // Os totais saem da SOMA das linhas por cargo, e não de uma consulta própria. Não é economia de
    // consulta: é a garantia de que o topo da tela é a soma do que está embaixo. Total calculado à
    // parte é como um painel começa a se contradizer.
    const totais = porCargo.reduce(
      (acc, l) => ({
        vagas: acc.vagas + l.vagas,
        vinculadas: acc.vinculadas + l.vinculadas,
        concluidas: acc.concluidas + l.concluidas,
        cadastradas: acc.cadastradas + l.cadastradas,
        emAndamento: acc.emAndamento + l.emAndamento,
        pausadas: acc.pausadas + l.pausadas,
        declinios: acc.declinios + l.declinios,
        emBanco: acc.emBanco + l.emBanco,
      }),
      { vagas: 0, vinculadas: 0, concluidas: 0, cadastradas: 0, emAndamento: 0, pausadas: 0, declinios: 0, emBanco: 0 },
    );

    return {
      projeto,
      termometro: this.termometro(projeto.dataInicio, projeto.dataFim, hoje),
      totais: {
        ...totais,
        faltam: Math.max(0, totais.vagas - totais.concluidas),
        percentual: percentual(totais.concluidas, totais.vagas),
      },
      porCargo,
      // Projeto sem turma devolve lista vazia, e a tela não desenha a seção: alerta por data de
      // entrada sem data de entrada não tem o que dizer.
      grupos,
    };
  }

  /**
   * STATUS POR CARGO no universo do PAINEL: cliente do projeto + data de admissão dentro do período.
   *
   * O DEFEITO QUE ISTO CORRIGE (achado do diretor, conferido contra o Controle Gerencial filtrado por
   * 57269 e o período): os baldes de status contavam só entre os VINCULADOS, e declínio não é
   * vinculado. Pela §A.16 quem declina não deixa nada ativo na esteira, então 22 dos 23 declínios do
   * cliente no período nunca entraram em `admissao_projeto` e o balde mostrava 1. O projeto perdeu 23
   * pessoas e a tela dizia que tinha perdido uma.
   *
   * AS DUAS CONTAGENS RESPONDEM PERGUNTAS DIFERENTES, e é por isso que convivem:
   *  - VÍNCULO (`admissao_projeto`) responde "quem estamos contando neste projeto": alimenta o Na
   *    Esteira e o preenchimento da meta. Declínio fica fora de propósito.
   *  - CLIENTE + PERÍODO responde "o que aconteceu com a operação deste cliente nesta janela":
   *    alimenta os baldes de status, exatamente como o Controle Gerencial responde. É a realidade,
   *    inclusive o que se perdeu.
   * Misturar as duas foi o erro; separá-las é a correção.
   *
   * MESMO RECORTE DO PAINEL, para os dois números não divergirem: `cod_cliente` e
   * `data_admissao BETWEEN início AND fim`, o mesmo par de condições do `condicoes()` do gerencial. E
   * as MESMAS expressões (`admissaoConcluidaSql`, `admissaoEmAndamentoSql`), importadas e não
   * copiadas, pelo motivo escrito em `db/expressoes-admissao`.
   *
   * CADASTRADAS é balde à parte de CONCLUÍDAS, e a diferença não é detalhe: "concluída" exige a
   * frente de INTEGRAÇÃO fechada (a última etapa da esteira), enquanto "cadastrada" é a frente de
   * Cadastro em CADASTRADO. Hoje, na Bienal, são 0 e 37: as 37 estão cadastradas e ainda esperando
   * integração. O painel mostra as 37 na tabela de Cadastro, e sem este balde a análise pareceria
   * estar escondendo trabalho que já foi feito.
   */
  private statusPorCargo(codCliente: string, dataInicio: string, dataFim: string) {
    return this.db
      .select({
        cargoId: admissoes.cargoId,
        cargoNome: cargos.nome,
        concluidas: sql<number>`count(*) filter (where ${admissaoConcluidaSql})::int`,
        cadastradas: sql<number>`count(*) filter (where exists (
          select 1 from frentes_admissao fc
          where fc.admissao_id = ${admissoes.id} and fc.tipo = 'CADASTRO_CONTRATO' and fc.status = 'CADASTRADO'
        ))::int`,
        emAndamento: sql<number>`count(*) filter (where ${admissaoEmAndamentoSql})::int`,
        // PAUSADA continua contada (o dado alimenta a tabela), mesmo sem balde próprio na tela.
        pausadas: sql<number>`count(*) filter (where ${admissoes.pausadaEm} is not null)::int`,
        declinios: sql<number>`count(*) filter (where ${admissoes.farolGlobal} in ('DECLINOU', 'RESCISAO'))::int`,
        // EM BANCO (decisão do diretor): admissão de banco não é preenchimento (sai dos cilindros,
        // ver `preenchimentoPorCargo`), então ganha contagem própria para o card dividido. Mesmo
        // universo dos demais status (cliente + período), para o card ler tudo do mesmo recorte.
        emBanco: sql<number>`count(*) filter (where ${admissoes.farolGlobal} = 'BANCO_AGUARDAR')::int`,
      })
      .from(admissoes)
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(
        sql`${admissoes.codCliente} = ${codCliente}
            and ${admissoes.dataAdmissao} >= ${dataInicio}::date
            and ${admissoes.dataAdmissao} <= ${dataFim}::date`,
      )
      .groupBy(admissoes.cargoId, cargos.nome);
  }

  /**
   * PREENCHIMENTO POR CARGO: a meta do projeto contra o que já está na esteira, e o status real.
   *
   * TRÊS CONSULTAS E UM MERGE, e não um `full join` em SQL cru. O motivo é concreto: as expressões
   * compartilhadas (`admissaoConcluidaSql`) qualificam as colunas pela tabela, e isso só é renderizado
   * corretamente dentro do construtor de consulta do Drizzle. Em SQL cru elas saem sem qualificação e
   * o Postgres recusa por ambiguidade assim que há join. Entre copiar a expressão para dentro de um
   * SQL cru e juntar resultados em memória, o merge é o que preserva a fonte única.
   *
   * CADA CONSULTA RESPONDE UMA PERGUNTA, e o merge não as confunde: as VAGAS vêm do cadastro do
   * projeto (a meta), as VINCULADAS vêm de `admissao_projeto` (o Na Esteira) e os STATUS vêm do
   * universo cliente + período (a realidade, igual à do painel). Ver `statusPorCargo` para o porquê.
   *
   * O MERGE É UMA UNIÃO, não uma interseção, e isso é regra de tela: cargo com vaga e ninguém
   * vinculado é a linha MAIS importante (é o que falta contratar), e cargo com gente vinculada e
   * nenhuma vaga cadastrada é erro de cadastro que precisa aparecer em vez de sumir. As pontas todas
   * entram na lista.
   *
   * As vagas somam por cargo IGNORANDO o grupo: a linha responde pelo cargo no projeto inteiro, e a
   * cota por turma é assunto do alerta por grupo, mais abaixo.
   */
  private async preenchimentoPorCargo(
    projetoId: string,
    codCliente: string,
    dataInicio: string,
    dataFim: string,
  ) {
    const [vagas, vinculadas, status] = await Promise.all([
      this.db
        .select({
          cargoId: projetoVagaCargo.cargoId,
          cargoNome: cargos.nome,
          vagas: sql<number>`sum(${projetoVagaCargo.quantidade})::int`,
        })
        .from(projetoVagaCargo)
        .leftJoin(cargos, eq(cargos.id, projetoVagaCargo.cargoId))
        .where(eq(projetoVagaCargo.projetoId, projetoId))
        .groupBy(projetoVagaCargo.cargoId, cargos.nome),
      // VÍNCULO: quem foi ligado ao projeto e está ATIVO na esteira. Responde "Na Esteira" e o
      // preenchimento da meta, e SOMENTE isso. Não responde status, pelo motivo do bloco abaixo.
      //
      // TERMINAIS E BANCO FORA (decisão do diretor + §A.16): declínio e rescisão são desfecho
      // encerrado, e "em banco" (BANCO_AGUARDAR) é admissão parada esperando, não preenchimento de
      // vaga. Nenhum dos dois é trabalho ativo na esteira, então nenhum conta no cilindro. O declínio
      // vinculado era exatamente a diferença de 1 que o diretor via no Vendedor I: uma admissão
      // declinada seguia contada como "Na Esteira".
      this.db
        .select({
          cargoId: admissoes.cargoId,
          cargoNome: cargos.nome,
          vinculadas: sql<number>`count(*)::int`,
        })
        .from(admissaoProjeto)
        .innerJoin(admissoes, eq(admissoes.id, admissaoProjeto.admissaoId))
        .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
        .where(
          sql`${admissaoProjeto.projetoId} = ${projetoId}
              and ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')`,
        )
        .groupBy(admissoes.cargoId, cargos.nome),
      this.statusPorCargo(codCliente, dataInicio, dataFim),
    ]);

    const linhas = new Map<
      string,
      {
        cargoId: string | null;
        cargoNome: string;
        vagas: number;
        vinculadas: number;
        concluidas: number;
        cadastradas: number;
        emAndamento: number;
        pausadas: number;
        declinios: number;
        emBanco: number;
      }
    >();
    // Cargo NULO é possível (admissão sem cargo atribuído) e vira uma chave própria em vez de ser
    // descartada: some da tela seria pior, porque ela conta no vínculo e ninguém entenderia a
    // diferença entre o total e a soma das linhas.
    const chave = (cargoId: string | null) => cargoId ?? "sem-cargo";
    const pegar = (cargoId: string | null, cargoNome: string | null) => {
      const k = chave(cargoId);
      const atual = linhas.get(k);
      if (atual) return atual;
      const novo = {
        cargoId,
        cargoNome: cargoNome ?? "não informado",
        vagas: 0,
        vinculadas: 0,
        concluidas: 0,
        cadastradas: 0,
        emAndamento: 0,
        pausadas: 0,
        declinios: 0,
        emBanco: 0,
      };
      linhas.set(k, novo);
      return novo;
    };

    for (const v of vagas) pegar(v.cargoId, v.cargoNome).vagas = Number(v.vagas);
    for (const l of vinculadas) pegar(l.cargoId, l.cargoNome).vinculadas = Number(l.vinculadas);
    for (const s of status) {
      const linha = pegar(s.cargoId, s.cargoNome);
      linha.concluidas = Number(s.concluidas);
      linha.cadastradas = Number(s.cadastradas);
      linha.emAndamento = Number(s.emAndamento);
      linha.pausadas = Number(s.pausadas);
      linha.declinios = Number(s.declinios);
      linha.emBanco = Number(s.emBanco);
    }

    return [...linhas.values()]
      // Maior meta primeiro: é a ordem em que o time olha o projeto (o cargo que domina a leva vem
      // no topo). Empate desempata por nome, para a ordem não dançar entre duas cargas.
      .sort((a, b) => b.vagas - a.vagas || a.cargoNome.localeCompare(b.cargoNome, "pt-BR"))
      .map((l) => ({
        ...l,
        // "Faltam" é contra a META, não contra quem está vinculado: o projeto precisa de 57
        // Atendentes fechados, e ter 57 vinculados não fecha nenhuma vaga sozinho.
        faltam: Math.max(0, l.vagas - l.concluidas),
        percentual: percentual(l.concluidas, l.vagas),
      }));
  }

  /**
   * ALERTA POR GRUPO DE ENTRADA: passada a data da leva, quantas daquela turma não fecharam.
   *
   * Só existe para projeto que usa turmas, e devolve lista vazia para os demais (a Bienal é assim: o
   * pessoal entra de uma vez). O `atrasadas` só é contado depois da data de entrada, porque antes
   * dela não há atraso nenhum: a turma ainda tem prazo.
   */
  private async alertaPorGrupo(projetoId: string) {
    // AS SUBCONSULTAS USAM O NOME DA TABELA ESCRITO, e isso não é preferência de estilo: o Drizzle só
    // qualifica coluna por tabela quando a consulta EXTERNA tem join, e esta não tem. Passar
    // `projetoGrupoEntrada.id` pelo template renderizaria um `"id"` solto que, dentro da subconsulta,
    // o Postgres resolveria para o `id` da tabela DE DENTRO. Não daria erro: daria número errado em
    // silêncio, que é o pior desfecho possível num painel de contagem.
    const grupos = await this.db
      .select({
        id: projetoGrupoEntrada.id,
        rotulo: projetoGrupoEntrada.rotulo,
        dataEntrada: projetoGrupoEntrada.dataEntrada,
        vagas: sql<number>`(
          select coalesce(sum(projeto_vaga_cargo.quantidade), 0)::int
            from projeto_vaga_cargo
           where projeto_vaga_cargo.grupo_id = projeto_grupo_entrada.id
        )`,
        vinculadas: sql<number>`(
          select count(*)::int from admissao_projeto
           where admissao_projeto.grupo_id = projeto_grupo_entrada.id
        )`,
        // A tabela de admissões entra SEM alias para a expressão compartilhada (que qualifica por
        // `admissoes`) resolver. Com alias, a única saída seria copiar a condição.
        concluidas: sql<number>`(
          select count(*)::int
            from admissao_projeto
            join admissoes on admissoes.id = admissao_projeto.admissao_id
           where admissao_projeto.grupo_id = projeto_grupo_entrada.id
             and ${admissaoConcluidaSql}
        )`,
        /** Já passou a data da leva? É o que separa "ainda tem prazo" de "atrasou". */
        entrou: sql<boolean>`(projeto_grupo_entrada.data_entrada <= current_date)`,
      })
      .from(projetoGrupoEntrada)
      .where(eq(projetoGrupoEntrada.projetoId, projetoId))
      .orderBy(asc(projetoGrupoEntrada.dataEntrada));

    return grupos.map((g) => ({
      ...g,
      vagas: Number(g.vagas),
      vinculadas: Number(g.vinculadas),
      concluidas: Number(g.concluidas),
      atrasadas: g.entrou ? Math.max(0, Number(g.vinculadas) - Number(g.concluidas)) : 0,
      percentual: percentual(Number(g.concluidas), Number(g.vagas)),
    }));
  }

  /**
   * TERMÔMETRO: quantos dias faltam até o fim do projeto, e em que faixa isso está.
   *
   * Calculado no BACKEND e não na tela, de propósito: o navegador do consultor está no fuso dele e a
   * VM está em UTC, e "faltam 3 dias" não pode depender de quem abriu a tela. A faixa é derivada
   * aqui pelo mesmo motivo, para as duas telas que um dia mostrarem o termômetro concordarem.
   *
   * As faixas (7 e 3 dias) são de leitura, não de negócio: uma semana ainda dá para reagir, três
   * dias é a última chamada, prazo vencido é vermelho independentemente do preenchimento.
   */
  private termometro(dataInicio: string, dataFim: string, hoje: Date) {
    const dia = 24 * 60 * 60 * 1000;
    const emDias = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
    const hojeIso = hoje.toISOString().slice(0, 10);
    const hojeUtc = Date.parse(`${hojeIso}T00:00:00Z`);

    const inicio = emDias(dataInicio);
    const fim = emDias(dataFim);
    const iniIso = dataInicio.slice(0, 10);
    const fimIso = dataFim.slice(0, 10);

    // DIA ÚTIL, não dia corrido (decisão do diretor). Contar corrido dizia "faltam 10 dias" num
    // período que pega dois fins de semana e o 7 de setembro, e ninguém audita documento no domingo:
    // o prazo REAL de captação é em dia útil. A régua e os feriados nacionais vivem em
    // `domain/dias-uteis`, com a lei de cada data escrita ao lado.
    const totalDias = diasUteisEntre(iniIso, fimIso);
    // "Restantes" exclui HOJE: a pergunta do card é quanto AINDA dá para trabalhar, e o dia que já
    // está correndo não é prazo disponível. Depois do fim, negativo, para a faixa "encerrado" seguir
    // funcionando como antes.
    const restantes =
      hojeUtc > fim
        ? -diasUteisEntre(fimIso, hojeIso)
        : diasUteisEntre(
            new Date(Math.max(hojeUtc + dia, inicio)).toISOString().slice(0, 10),
            fimIso,
          );
    // Antes de começar, "decorridos" é zero e não negativo: projeto que ainda não abriu não gastou
    // prazo nenhum, e barra negativa não existe.
    const decorridos =
      hojeUtc < inicio ? 0 : Math.min(totalDias, diasUteisEntre(iniIso, hojeUtc > fim ? fimIso : hojeIso));

    /**
     * QUANTO FALTA PARA COMEÇAR, contando HOJE (correção pedida pelo diretor).
     *
     * O card estava dizendo "8 dias úteis até o fim" para um projeto que nem tinha começado, e o
     * número certo não era esse: a pergunta de quem olha um projeto futuro é quanto tempo ainda há
     * para CAPTAR antes de a operação abrir. Conta de HOJE (inclusive, porque hoje ainda dá para
     * trabalhar) até a VÉSPERA do início (no dia da abertura não falta mais nada para começar).
     * Em 11/08/2026, contra a Bienal que abre em 01/09, dá 15.
     */
    const diasParaInicio =
      hojeUtc >= inicio
        ? 0
        : diasUteisEntre(hojeIso, new Date(inicio - dia).toISOString().slice(0, 10));

    const situacao =
      restantes < 0 ? "encerrado" : restantes <= 3 ? "critico" : restantes <= 7 ? "atencao" : "ok";

    return {
      totalDias,
      decorridos,
      diasRestantes: restantes,
      /** Zero depois que o projeto abriu: aí a pergunta volta a ser o prazo até o fim. */
      diasParaInicio,
      situacao: situacao as "ok" | "atencao" | "critico" | "encerrado",
      /** Quanto do prazo já passou, para a barra do termômetro. */
      percentualDecorrido: percentual(decorridos, totalDias),
    };
  }
}

/**
 * Percentual inteiro, com o denominador zero devolvendo ZERO em vez de NaN.
 *
 * Zero é o valor honesto aqui: projeto sem vaga cadastrada não está 100% preenchido, está sem meta.
 * NaN vazaria para a tela como "NaN%" e, pior, como largura inválida na barra.
 */
function percentual(parte: number, total: number): number {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}
