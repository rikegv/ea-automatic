import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  admissaoConcluidaSql,
  admissaoEmAndamentoExclusivoSql,
} from "../../db/expressoes-admissao";
import { diasUteisEntre } from "../../domain/dias-uteis";
import {
  admissaoProjeto,
  admissoes,
  candidatos,
  cargos,
  clienteLojas,
  clientes,
  frenteStatusCatalogo,
  frentesAdmissao,
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

    // A LEITURA DE LOJAS / UNIDADES ENTRA POR ÚLTIMO no `Promise.all`, e a posição não é estética:
    // ela mantém a ORDEM das consultas que já existiam (projeto, vagas, status, declínios, grupos)
    // exatamente como estava. Consulta nova no meio da fila não mudaria o resultado em produção, mas
    // remontaria a ordem em que o teste desta análise devolve cada resultado.
    const [porCargo, grupos, porLoja, matriz] = await Promise.all([
      this.preenchimentoPorCargo(projetoId, projeto.codCliente, projeto.dataInicio, projeto.dataFim),
      this.alertaPorGrupo(projetoId),
      this.quadroPorLoja(
        projetoId,
        projeto.codCliente,
        projeto.dataInicio,
        projeto.dataFim,
      ),
      this.matrizCargoPorLoja(projetoId, projeto.codCliente, projeto.dataInicio, projeto.dataFim),
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
        faltam: acc.faltam + l.faltam,
      }),
      { vagas: 0, vinculadas: 0, concluidas: 0, cadastradas: 0, emAndamento: 0, pausadas: 0, declinios: 0, emBanco: 0, faltam: 0 },
    );

    return {
      projeto,
      termometro: this.termometro(projeto.dataInicio, projeto.dataFim, hoje),
      totais: {
        ...totais,
        percentual: percentual(totais.concluidas, totais.vagas),
      },
      porCargo,
      // Projeto sem turma devolve lista vazia, e a tela não desenha a seção: alerta por data de
      // entrada sem data de entrada não tem o que dizer.
      grupos,
      porLoja,
      /**
       * A MATRIZ CARGO x LOJA (cruzamento clicável, 27/08). Ela NÃO é uma terceira contagem: é a
       * MESMA consulta dos dois quadros, com o `group by` nos DOIS eixos em vez de num só. Somar a
       * matriz por cargo devolve `porCargo`, somar por loja devolve `porLoja`, e é isso que
       * garante que clicar numa linha não faça aparecer número que a tela não mostrava antes.
       */
      matriz,
    };
  }

  /**
   * STATUS POR CARGO no universo do PROJETO: quem está VINCULADO em `admissao_projeto`, e só.
   *
   * A RÉGUA É A DA META (decisão do diretor, com a diretoria olhando a Bienal): TOTAL DE VAGAS DO
   * PROJETO = Em Andamento + Concluídas + Faltam. Para essa conta fechar, os três baldes têm de
   * falar do MESMO conjunto de pessoas, e esse conjunto é o do projeto. Contar status por cliente +
   * período trazia gente que não é do projeto e a soma passava do total da meta: na Bienal, 51
   * concluídas + 62 em andamento + 51 "faltam" davam 164 contra 102 vagas, e era exatamente o que
   * não fechava na tela.
   *
   * DECLÍNIO SAIU DA MATEMÁTICA (mesma decisão) e por isso tem consulta própria, logo abaixo, ainda
   * no recorte cliente + período: ele não soma nem subtrai da meta, é informação separada de quanto
   * o cliente perdeu na janela. Nada mudou no que o card e o modal de declínios mostram.
   *
   * OS BALDES SÃO EXCLUSIVOS ENTRE SI, e sem isso a conta não fecharia por um motivo silencioso:
   * "concluída" olha as frentes e "em andamento" olha o farol, então uma admissão de farol
   * EM_ADMISSAO com o Cadastro fechado cai nos DOIS. Na Bienal eram 14 pessoas nessa situação, 14 a
   * mais na soma. A exclusão vive em `admissaoEmAndamentoExclusivoSql`, a MESMA que o Gerenciador
   * passou a usar nos cards: um balde só, contado de um jeito só, nas duas telas.
   *
   * As expressões continuam sendo as MESMAS do Gerenciador (`admissaoConcluidaSql`,
   * `admissaoEmAndamentoExclusivoSql`), importadas e não copiadas, pelo motivo escrito em
   * `db/expressoes-admissao`: o que muda aqui é o UNIVERSO, nunca a definição de cada balde.
   *
   * VINCULADAS (o "Na Esteira") sai desta mesma consulta, com o filtro que sempre teve: terminais e
   * banco fora, porque nenhum dos dois é trabalho ativo na esteira.
   *
   * CADASTRADAS é balde à parte de CONCLUÍDAS, e a diferença não é detalhe: "concluída" exige a
   * frente de INTEGRAÇÃO fechada (a última etapa da esteira), enquanto "cadastrada" é a frente de
   * Cadastro em CADASTRADO. Ela fica fora da conta da meta, como todo balde que não seja os três.
   */
  private statusPorCargoVinculados(projetoId: string) {
    return this.db
      .select({
        cargoId: admissoes.cargoId,
        cargoNome: cargos.nome,
        // TERMINAIS E BANCO FORA (decisão do diretor + §A.16): declínio e rescisão são desfecho
        // encerrado, e "em banco" é admissão parada esperando, não preenchimento de vaga.
        vinculadas: sql<number>`count(*) filter (
          where ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        // O MESMO FILTRO DE FAROL DO "NA ESTEIRA", e é a correção de 13/08/2026. Sem ele, os dois
        // baldes liam fontes diferentes sobre a MESMA pessoa: "concluída" olha as FRENTES e não
        // filtra farol, "na esteira" olha o FAROL. Quem fechou o Cadastro e DEPOIS declinou entrava
        // num e saía do outro, e a tela mostrava Concluídas (98) MAIOR que Na Esteira (96), que é
        // impossível por definição. Era uma admissão da Bienal, declinada no dia, e a varredura em
        // todos os projetos não achou outra.
        //
        // A EXPRESSÃO COMPARTILHADA NÃO MUDA (§A.26): `admissaoConcluidaSql` é a mesma do Painel e do
        // Gerenciador, e continua intacta. O que muda é o UNIVERSO desta tela, que é o do projeto e
        // já excluía terminais e banco em toda parte, menos aqui. Coerente com a §A.16: declínio não
        // deixa nada ativo, e a vaga que a pessoa declinou volta a ser vaga a preencher.
        concluidas: sql<number>`count(*) filter (
          where ${admissaoConcluidaSql}
            and ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        cadastradas: sql<number>`count(*) filter (where exists (
          select 1 from frentes_admissao fc
          where fc.admissao_id = ${admissoes.id} and fc.tipo = 'CADASTRO_CONTRATO' and fc.status = 'CADASTRADO'
        ))::int`,
        emAndamento: sql<number>`count(*) filter (where ${admissaoEmAndamentoExclusivoSql})::int`,
        // PAUSADA continua contada (o dado alimenta a tabela), mesmo sem balde próprio na tela.
        pausadas: sql<number>`count(*) filter (where ${admissoes.pausadaEm} is not null)::int`,
        emBanco: sql<number>`count(*) filter (where ${admissoes.farolGlobal} = 'BANCO_AGUARDAR')::int`,
      })
      .from(admissaoProjeto)
      .innerJoin(admissoes, eq(admissoes.id, admissaoProjeto.admissaoId))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(eq(admissaoProjeto.projetoId, projetoId))
      .groupBy(admissoes.cargoId, cargos.nome);
  }

  /**
   * DECLÍNIOS POR CARGO, fora da matemática das vagas: cliente do projeto + data de admissão dentro
   * do período, o mesmo recorte do Controle Gerencial.
   *
   * POR QUE ELE FICA NO RECORTE MAIOR (achado do diretor, conferido contra o painel filtrado por
   * 57269 e o período): quem declina não deixa nada ativo na esteira (§A.16), então 22 dos 23
   * declínios do cliente nunca entraram em `admissao_projeto`. Contá-lo entre os vinculados mostrava
   * UM declínio: o projeto tinha perdido 23 pessoas e a tela dizia que tinha perdido uma.
   *
   * É INFORMAÇÃO SEPARADA, e não um balde da meta: declínio não soma nem subtrai do total de vagas,
   * porque a vaga que a pessoa declinou continua aberta e já está contada em "Faltam". Misturar as
   * duas leituras foi o que quebrou a conta; separá-las é o que a fecha.
   */
  private declinioPorCargo(codCliente: string, dataInicio: string, dataFim: string) {
    return this.db
      .select({
        cargoId: admissoes.cargoId,
        cargoNome: cargos.nome,
        declinios: sql<number>`count(*)::int`,
      })
      .from(admissoes)
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(
        sql`${admissoes.codCliente} = ${codCliente}
            and ${admissoes.farolGlobal} in ('DECLINOU', 'RESCISAO')
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
   * projeto (a meta), as VINCULADAS e os STATUS vêm de `admissao_projeto` (o universo do projeto, o
   * único em que a conta fecha na meta) e os DECLÍNIOS vêm do recorte cliente + período, fora da
   * matemática. Ver `statusPorCargoVinculados` e `declinioPorCargo` para o porquê de cada um.
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
    const [vagas, vinculados, declinios] = await Promise.all([
      this.db
        .select({
          cargoId: projetoVagaCargo.cargoId,
          cargoNome: cargos.nome,
          vagas: sql<number>`sum(${projetoVagaCargo.quantidade})::int`,
        })
        .from(projetoVagaCargo)
        .leftJoin(cargos, eq(cargos.id, projetoVagaCargo.cargoId))
        /**
         * SÓ AS LINHAS SEM LOJA, e este filtro é a peça que impede a meta de inflar (§A.27).
         *
         * Com a regra A (02/09/2026) a linha geral do cargo CONVIVE com as cotas por loja: o cargo
         * tem 20 e as lojas repartem esses 20. Somar as duas visões daria 40 num cargo de 20, e o
         * número errado não ficaria numa célula: ele entra no percentual do cilindro, no termômetro
         * e no "faltam" do topo, e só apareceria semanas depois sem ninguém saber de onde veio.
         *
         * As cotas por GRUPO de entrada continuam somando aqui, porque elas têm `loja_id` nulo: o
         * eixo de turmas não mudou de comportamento.
         */
        .where(and(eq(projetoVagaCargo.projetoId, projetoId), isNull(projetoVagaCargo.lojaId)))
        .groupBy(projetoVagaCargo.cargoId, cargos.nome),
      this.statusPorCargoVinculados(projetoId),
      this.declinioPorCargo(codCliente, dataInicio, dataFim),
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
    for (const s of vinculados) {
      const linha = pegar(s.cargoId, s.cargoNome);
      linha.vinculadas = Number(s.vinculadas);
      linha.concluidas = Number(s.concluidas);
      linha.cadastradas = Number(s.cadastradas);
      linha.emAndamento = Number(s.emAndamento);
      linha.pausadas = Number(s.pausadas);
      linha.emBanco = Number(s.emBanco);
    }
    for (const d of declinios) pegar(d.cargoId, d.cargoNome).declinios = Number(d.declinios);

    return [...linhas.values()]
      // Maior meta primeiro: é a ordem em que o time olha o projeto (o cargo que domina a leva vem
      // no topo). Empate desempata por nome, para a ordem não dançar entre duas cargas.
      .sort((a, b) => b.vagas - a.vagas || a.cargoNome.localeCompare(b.cargoNome, "pt-BR"))
      .map((l) => ({
        ...l,
        /**
         * "FALTAM" É A META MENOS QUEM ESTÁ NA ESTEIRA, e passou a ser calculado UMA vez, aqui.
         *
         * ANTES ERAM DUAS CONTAS PARA O MESMO NÚMERO, e elas discordavam na tela (achado do diretor,
         * 13/08/2026): o topo e a tabela faziam `vagas - concluídas - em andamento`, enquanto o CARD
         * de cada cargo fazia `vagas - na esteira` por conta própria, no frontend. Na Bienal isso
         * apareceu como topo dizendo 4 e os cards somando 6 (3 + 1 + 2). Duas leituras do mesmo
         * número, com réguas diferentes, na mesma tela.
         *
         * A RÉGUA CERTA É A DO CARD (decisão do diretor), e é a que responde a pergunta de verdade:
         * vaga preenchida é vaga com GENTE na esteira, esteja essa pessoa concluída ou ainda andando.
         * Como efeito, "Na Esteira + Faltam = Total de Vagas" passa a ser identidade, e não
         * coincidência: os dois lados saem do mesmo conjunto.
         *
         * A CONTA DA META CONTINUA FECHANDO (Em Andamento + Concluídas + Faltam = vagas), porque
         * "Concluídas" ganhou o MESMO filtro de farol do "Na Esteira" (ver `statusPorCargoVinculados`),
         * então concluídas + em andamento é exatamente quem está na esteira. Sem esse par, uma
         * declinada com o Cadastro fechado contava como vaga preenchida e sumia do Na Esteira ao
         * mesmo tempo, que foi o "Concluídas 98 maior que Na Esteira 96" do mesmo print.
         *
         * SEM TRAVA EM ZERO, decisão mantida da onda 4: um cargo pode ter mais gente do que vaga, e
         * negativo aqui é a informação certa (gente ALÉM da meta). Travar em zero devolveria um total
         * maior que o resto real e a coluna deixaria de somar o total logo abaixo dela. O card exibe
         * esse mesmo número como a tag "Excedente", em vez de um "Falta" negativo.
         */
        faltam: l.vagas - l.vinculadas,
        percentual: percentual(l.concluidas, l.vagas),
      }));
  }

  /**
   * ─ LOJAS / UNIDADES: O QUADRO COMPLETO POR STATUS (evolução pedida em 27/08) ─────────────────
   *
   * POR QUE O DADO VEM DE `centro_custo` E O RÓTULO DIZ "LOJA / UNIDADE", e isto NÃO é um rótulo
   * errado a ser "corrigido" um dia (explicação do diretor, 25/08/2026): existe cliente que é UM
   * CNPJ e UM código só, com VÁRIAS LOJAS. O sistema não deixa cadastrar o mesmo cliente duas vezes
   * (código e CNPJ são únicos, §A.3), então a operação passou a escrever o nome de cada loja no
   * campo CENTRO DE CUSTO. Na prática o centro de custo virou "a loja ou unidade daquele cliente",
   * e é isso que a diretoria lê no painel. O campo continua sendo `dados_vaga_folha.centro_custo`;
   * quem muda é só o nome na tela, que diz o que o número significa para quem olha.
   *
   * ┌─ ZERO CONTA PARALELA (§A.16/§A.27, exigência do diretor) ──────────────────────────────────┐
   * │ Cada balde desta tabela é a MESMA expressão do quadro de Cargos, importada e não copiada:   │
   * │ `admissaoConcluidaSql` e `admissaoEmAndamentoExclusivoSql` são as do Gerenciador e do        │
   * │ Painel, e o filtro de farol dos terminais e do banco é o mesmo do "Na Esteira". A ÚNICA      │
   * │ diferença entre esta consulta e a `statusPorCargoVinculados` é o `group by`: lá é o cargo,   │
   * │ aqui é o centro de custo. Nenhuma régua nova entrou no sistema por causa deste quadro.       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `vagas` CONTINUA SENDO O "NA ESTEIRA", e o nome não mudou de propósito: é o número que o
   * cilindro sempre desenhou e é ele que sustenta a PROVA que já existia, de que a soma das lojas é
   * idêntica ao balde "Total De Vagas Na Esteira" do topo. As colunas novas entram ao lado dele,
   * sem tocar nessa identidade.
   *
   * `total` É O UNIVERSO INTEIRO DO PROJETO NAQUELA LOJA (decisão do diretor, 27/08: "tudo que o
   * projeto tem na loja"): a MESMA consulta, sem o filtro de farol. Ele é `na esteira + em banco +
   * os terminais que estão vinculados`, e por isso a linha fecha sozinha, sem nenhum número vindo de
   * outro recorte.
   *
   * `faltam` É `total - vagas`, a MESMA forma do quadro de Cargos (lá é `meta - vinculadas`): o que
   * a loja tem menos o que está andando. Não há meta cadastrada por loja em lugar nenhum do sistema
   * (`projeto_vaga_cargo` é por CARGO), e inventar um rateio da meta seria exatamente a conta
   * paralela que a §A.16 proíbe, então a referência é o universo da própria loja.
   *
   * ┌─ O DECLÍNIO FICA FORA DA MATEMÁTICA, COMO NO QUADRO DE CARGOS, E O MOTIVO É O MESMO ───────┐
   * │ Quem declina não deixa nada ativo na esteira (§A.16), então a maioria dos declínios NUNCA    │
   * │ entrou em `admissao_projeto`. Medido na base: a Bienal tem 32 declínios no recorte           │
   * │ cliente + período e apenas 10 terminais vinculados ao projeto. Contá-los dentro do `total`   │
   * │ misturaria dois universos na mesma linha e a soma deixaria de fechar.                        │
   * │                                                                                             │
   * │ Por isso `declinios` vem do recorte cliente + período, como em `declinioPorCargo`, e é       │
   * │ INFORMAÇÃO AO LADO, que não soma no `total` nem no `faltam`. A tela diz isso em palavras.    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * CENTRO DE CUSTO VAZIO É CASO REAL e não é descartado: em branco, só espaço ou nulo caem todos na
   * mesma chave (`null`), que a tela mostra como "não informado" (§A.11). Descartar a linha faria a
   * lista somar menos que o balde do topo sem explicar por quê. Ela vai para o FIM da lista, e não
   * para o topo do ranking: ausência de dado não é a loja que mais contrata.
   *
   * §A.6: contagem por rótulo de centro de custo. Nenhum nome, nenhum CPF.
   */
  private async quadroPorLoja(
    projetoId: string,
    codCliente: string,
    dataInicio: string,
    dataFim: string,
  ) {
    const [status, declinios, metas] = await Promise.all([
      this.statusPorLojaVinculados(projetoId),
      this.declinioPorLoja(codCliente, dataInicio, dataFim),
      this.metaPorLoja(projetoId),
    ]);
    // A meta por NOME de loja, que é a mesma chave do quadro. `null` = este cargo/loja não foi
    // detalhado, e a célula fica VAZIA na tela em vez de zero.
    const metaDe = new Map(metas.map((m) => [m.loja, Number(m.meta)]));


    const linhas = new Map<
      string,
      {
        loja: string | null;
        total: number;
        vagas: number;
        concluidas: number;
        emAndamento: number;
        pausadas: number;
        emBanco: number;
        declinios: number;
      }
    >();
    // A chave é o rótulo, e o nulo tem chave própria em vez de virar texto: uma loja chamada
    // literalmente "nao-informado" não pode se fundir com a linha de ausência de dado.
    const chave = (c: string | null) => (c === null ? "\u0000sem-loja" : c);
    const pegar = (loja: string | null) => {
      const k = chave(loja);
      const atual = linhas.get(k);
      if (atual) return atual;
      const novo = {
        loja,
        total: 0,
        vagas: 0,
        concluidas: 0,
        emAndamento: 0,
        pausadas: 0,
        emBanco: 0,
        declinios: 0,
      };
      linhas.set(k, novo);
      return novo;
    };

    /**
     * TODA LOJA COM META ENTRA NO QUADRO, mesmo sem ninguém alocado ainda (correção do diretor,
     * 02/09/2026). Antes as linhas nasciam só de quem tinha gente vinculada, então uma loja que
     * recebeu 5 vagas no planejamento e ainda não tem ninguém SUMIA da tela: o diretor distribuía 20
     * entre quatro lojas e via três. Justamente a loja que mais precisa de atenção, a vazia, era a
     * que não aparecia. Semear as linhas com as metas ANTES dos baldes resolve, e os baldes só
     * preenchem o que já existe.
     */
    for (const m of metas) if (m.loja) pegar(m.loja);

    for (const s of status) {
      const linha = pegar(s.loja ?? null);
      linha.total = Number(s.total);
      linha.vagas = Number(s.vagas);
      linha.concluidas = Number(s.concluidas);
      linha.emAndamento = Number(s.emAndamento);
      linha.pausadas = Number(s.pausadas);
      linha.emBanco = Number(s.emBanco);
    }
    /*
     * O MERGE É UMA UNIÃO, a mesma regra do quadro de Cargos: loja que só aparece nos declínios
     * (ninguém vinculado, gente que declinou) entra na lista com os baldes em zero. Sumir dali seria
     * esconder justamente a loja que perdeu todo mundo.
     */
    for (const d of declinios) pegar(d.loja ?? null).declinios = Number(d.declinios);

    return [...linhas.values()]
      .map((l) => {
        // META da loja. `null` quando o cargo não foi detalhado por loja neste projeto: a coluna
        // fica VAZIA, e não zero, porque zero diria "não falta ninguém" e a verdade é "ninguém
        // definiu meta aqui" (decisão do diretor). A linha "Sem Loja" nunca tem meta: não existe
        // meta para nenhuma loja.
        const meta = l.loja === null ? null : (metaDe.get(l.loja) ?? null);
        return {
          ...l,
          meta,
          /**
           * FALTAM = META menos NA ESTEIRA, a MESMA conta do quadro de cargos (`meta - vinculadas`).
           * É a mudança que fez esta frente existir: antes era `total - na esteira`, que contava quem
           * SAIU e não quem falta contratar, com o mesmo rótulo de uma coluna que significava outra
           * coisa duas tabelas acima.
           *
           * Sem meta, sem faltam: `null`, não zero, pelo mesmo motivo da meta.
           *
           * SEM TRAVA EM ZERO, pela razão já registrada no quadro de cargos: negativo é a informação
           * certa (gente ALÉM da meta) e travar faria a coluna deixar de somar o rodapé.
           */
          faltam: meta === null ? null : meta - l.vagas,
          /** Quem saiu da esteira: o número que a coluna Faltam carregava antes, com o nome certo. */
          foraDaEsteira: l.total - l.vagas,
        };
      })
      .sort((a, b) => {
        // Não informado por último, sempre: é o único critério que não é volume.
        if (a.loja === null) return 1;
        if (b.loja === null) return -1;
        // Maior primeiro, e empate pelo nome, para a ordem não dançar entre duas cargas (a mesma
        // regra de desempate do preenchimento por cargo). O critério é o "na esteira", que é o que
        // o cilindro desenha: a ordem da lista tem de ser a ordem das barras.
        return b.vagas - a.vagas || a.loja.localeCompare(b.loja, "pt-BR");
      });
  }

  /**
   * OS BALDES POR LOJA no universo do PROJETO: os vinculados em `admissao_projeto`, e só.
   *
   * É A IRMÃ EXATA DE `statusPorCargoVinculados`, com o mesmo universo, os mesmos filtros e as
   * mesmas expressões compartilhadas. O que muda é o `group by` e o join do anexo de folha, que é
   * onde o centro de custo mora.
   */
  private statusPorLojaVinculados(projetoId: string) {
    // `nullif(btrim(...), '')` junta o nulo e o texto em branco na MESMA chave. Sem isso, um cadastro
    // com um espaço solto viraria uma "loja" própria, chamada nada, ao lado da linha de não informado.
    const rotulo = sql<string | null>`nullif(btrim(${clienteLojas.nome}), '')`;
    return this.db
      .select({
        loja: rotulo,
        // O UNIVERSO INTEIRO DA LOJA NO PROJETO, sem filtro de farol: é o `total` da linha.
        total: sql<number>`count(*)::int`,
        // TERMINAIS E BANCO FORA (decisão do diretor + §A.16): o mesmo filtro do "Na Esteira" por
        // cargo. É este número que o cilindro desenha e que soma o balde do topo.
        vagas: sql<number>`count(*) filter (
          where ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        // O MESMO PAR DE CONDIÇÕES DO QUADRO DE CARGOS: a expressão compartilhada mais o filtro de
        // farol, sem o qual "concluídas" poderia passar de "na esteira" na mesma linha.
        concluidas: sql<number>`count(*) filter (
          where ${admissaoConcluidaSql}
            and ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        emAndamento: sql<number>`count(*) filter (where ${admissaoEmAndamentoExclusivoSql})::int`,
        pausadas: sql<number>`count(*) filter (where ${admissoes.pausadaEm} is not null)::int`,
        emBanco: sql<number>`count(*) filter (where ${admissoes.farolGlobal} = 'BANCO_AGUARDAR')::int`,
      })
      .from(admissaoProjeto)
      .innerJoin(admissoes, eq(admissoes.id, admissaoProjeto.admissaoId))
      // LEFT JOIN, e não inner: admissão SEM LOJA ainda é vaga do projeto e conta. Com inner join
      // ela sumiria da lista e a soma ficaria abaixo do balde do topo, em silêncio. Hoje a maioria
      // não tem loja, então este left join é o que sustenta a linha "Sem Loja".
      .leftJoin(clienteLojas, eq(clienteLojas.id, admissoes.lojaId))
      .where(eq(admissaoProjeto.projetoId, projetoId))
      .groupBy(rotulo);
  }

  /**
   * AS PESSOAS DE UMA LOJA no projeto (pedido do diretor, 02/09/2026): quem está ali, com a data de
   * admissão e o estado das TRÊS frentes que interessam a quem acompanha a contratação.
   *
   * SÓ AUDITORIA, EXAME E CADASTRO (decisão do diretor). Integração e iFractal ficam de fora: elas
   * acontecem depois de a pessoa já estar contratada, e o painel de Alto Volume é sobre encher a
   * vaga, não sobre o que vem depois.
   *
   * O RÓTULO VEM DO `frenteStatusCatalogo`, o MESMO que a Esteira usa. Traduzir código para texto
   * aqui criaria um segundo dicionário, e no dia em que a operação renomear um status a Esteira
   * mostraria o nome novo e este modal o antigo.
   *
   * `loja` NULA é a consulta da linha "Sem Loja": quem está no projeto sem loja vinculada.
   *
   * §A.6: nome e data de admissão são o que a tela precisa para o diretor reconhecer a pessoa. CPF
   * NÃO sai daqui.
   */
  async pessoasDaLoja(projetoId: string, loja: string | null) {
    const linhas = await this.db
      .select({
        admissaoId: admissoes.id,
        nome: candidatos.nome,
        dataAdmissao: admissoes.dataAdmissao,
        farol: admissoes.farolGlobal,
        cargo: cargos.nome,
      })
      .from(admissaoProjeto)
      .innerJoin(admissoes, eq(admissoes.id, admissaoProjeto.admissaoId))
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(clienteLojas, eq(clienteLojas.id, admissoes.lojaId))
      .where(
        and(
          eq(admissaoProjeto.projetoId, projetoId),
          loja === null ? isNull(admissoes.lojaId) : eq(clienteLojas.nome, loja),
        ),
      )
      .orderBy(asc(candidatos.nome));

    if (linhas.length === 0) return [];

    const ids = linhas.map((l) => l.admissaoId);
    const frentes = await this.db
      .select({
        admissaoId: frentesAdmissao.admissaoId,
        tipo: frentesAdmissao.tipo,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
        rotulo: frenteStatusCatalogo.rotulo,
      })
      .from(frentesAdmissao)
      .leftJoin(
        frenteStatusCatalogo,
        and(
          eq(frenteStatusCatalogo.tipo, frentesAdmissao.tipo),
          eq(frenteStatusCatalogo.codigo, frentesAdmissao.status),
        ),
      )
      .where(
        and(
          inArray(frentesAdmissao.admissaoId, ids),
          inArray(frentesAdmissao.tipo, ["AUDITORIA", "EXAME", "CADASTRO_CONTRATO"]),
        ),
      );

    const porAdmissao = new Map<string, Record<string, { rotulo: string; concluida: boolean }>>();
    for (const f of frentes) {
      const atual = porAdmissao.get(f.admissaoId) ?? {};
      // Sem linha no catálogo, mostra o CÓDIGO cru em vez de vazio: status novo sem rótulo
      // cadastrado é problema de catálogo, e esconder deixaria a célula mentindo de branco.
      atual[f.tipo] = { rotulo: f.rotulo ?? f.status, concluida: f.concluida };
      porAdmissao.set(f.admissaoId, atual);
    }

    return linhas.map((l) => ({
      admissaoId: l.admissaoId,
      nome: l.nome,
      cargo: l.cargo,
      dataAdmissao: l.dataAdmissao,
      farol: l.farol,
      // A frente que NÃO NASCEU (o Cadastro só abre com Auditoria e Exame concluídas, regra 3) vem
      // nula, e a tela mostra que ela ainda não começou, que é diferente de estar pendente.
      frentes: {
        AUDITORIA: porAdmissao.get(l.admissaoId)?.AUDITORIA ?? null,
        EXAME: porAdmissao.get(l.admissaoId)?.EXAME ?? null,
        CADASTRO_CONTRATO: porAdmissao.get(l.admissaoId)?.CADASTRO_CONTRATO ?? null,
      },
    }));
  }

  /**
   * A META POR LOJA (docs/DESENHO-META-POR-LOJA.md): quantas vagas o projeto definiu para cada loja.
   *
   * É a IRMÃ da meta por cargo, lendo a MESMA tabela (`projeto_vaga_cargo`), só que agrupando pela
   * loja em vez de pelo cargo. Cargo sem detalhamento não aparece aqui, e é isso que faz a coluna
   * nascer VAZIA em vez de zero nos projetos que ninguém detalhou: zero diria "não falta ninguém", e
   * a verdade é "ninguém definiu meta aqui".
   */
  private metaPorLoja(projetoId: string) {
    return this.db
      .select({
        loja: clienteLojas.nome,
        meta: sql<number>`sum(${projetoVagaCargo.quantidade})::int`,
      })
      .from(projetoVagaCargo)
      .innerJoin(clienteLojas, eq(clienteLojas.id, projetoVagaCargo.lojaId))
      .where(eq(projetoVagaCargo.projetoId, projetoId))
      .groupBy(clienteLojas.nome);
  }

  /**
   * DECLÍNIOS POR LOJA, fora da matemática, no recorte cliente + período.
   *
   * É A IRMÃ EXATA DE `declinioPorCargo`, pelo mesmo motivo escrito lá: quem declina não deixa nada
   * ativo na esteira (§A.16) e por isso quase nunca chegou a `admissao_projeto`. Medido na base: 32
   * declínios do cliente na janela contra 10 terminais vinculados ao projeto. Buscá-los entre os
   * vinculados mostraria menos de um terço do que o cliente perdeu naquela loja.
   */
  private declinioPorLoja(codCliente: string, dataInicio: string, dataFim: string) {
    const rotulo = sql<string | null>`nullif(btrim(${clienteLojas.nome}), '')`;
    return this.db
      .select({ loja: rotulo, declinios: sql<number>`count(*)::int` })
      .from(admissoes)
      .leftJoin(clienteLojas, eq(clienteLojas.id, admissoes.lojaId))
      .where(
        sql`${admissoes.codCliente} = ${codCliente}
            and ${admissoes.farolGlobal} in ('DECLINOU', 'RESCISAO')
            and ${admissoes.dataAdmissao} >= ${dataInicio}::date
            and ${admissoes.dataAdmissao} <= ${dataFim}::date`,
      )
      .groupBy(rotulo);
  }

  /**
   * ─ A MATRIZ CARGO x LOJA: o cruzamento clicável (pedido do diretor, 27/08) ────────────────────
   *
   * A PERGUNTA QUE ELA RESPONDE, nos dois sentidos: "deste CARGO, quantos em cada LOJA?" e "nesta
   * LOJA, quais CARGOS?". Os dois quadros que já existem não conseguem responder isso porque cada um
   * agrupa por UM eixo: somam o mesmo conjunto de gente por recortes diferentes, e cruzá-los na tela
   * exigiria adivinhar a interseção.
   *
   * ┌─ ELA NÃO É UMA TERCEIRA CONTAGEM (§A.16/§A.27) ────────────────────────────────────────────┐
   * │ É a MESMA consulta dos dois quadros, com o `group by` nos DOIS eixos em vez de num só, e com │
   * │ as MESMAS expressões compartilhadas (`admissaoConcluidaSql`,                                 │
   * │ `admissaoEmAndamentoExclusivoSql`) e o MESMO filtro de farol. Como consequência aritmética:   │
   * │ somar a matriz por cargo devolve `porCargo`, e somar por loja devolve `porLoja`.      │
   * │ Clicar numa linha nunca faz aparecer número que a tela não mostrava antes de clicar.         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O DECLÍNIO CRUZA PELO MESMO CAMINHO das irmãs: recorte cliente + período, fora da matemática,
   * porque quem declina quase nunca chegou a `admissao_projeto` (§A.16). Ele cruza cargo x loja
   * porque as duas informações moram na admissão e no anexo de folha.
   *
   * A META (`projeto_vaga_cargo`) NÃO ENTRA AQUI, e não é esquecimento: ela é cadastrada por CARGO
   * no projeto inteiro e não existe por loja em lugar nenhum do sistema. Por isso a matriz carrega
   * só os baldes de STATUS, que são os que cruzam de verdade, e a tela diz em palavras o que
   * acontece com a coluna de meta quando o cruzamento por loja está ligado.
   *
   * §A.6: contagem por id de cargo e rótulo de centro de custo. Nenhum nome, nenhum CPF.
   */
  private async matrizCargoPorLoja(
    projetoId: string,
    codCliente: string,
    dataInicio: string,
    dataFim: string,
  ) {
    const rotulo = sql<string | null>`nullif(btrim(${clienteLojas.nome}), '')`;

    const [status, declinios] = await Promise.all([
      this.db
        .select({
          cargoId: admissoes.cargoId,
          cargoNome: cargos.nome,
          loja: rotulo,
          total: sql<number>`count(*)::int`,
          vagas: sql<number>`count(*) filter (
            where ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
          )::int`,
          concluidas: sql<number>`count(*) filter (
            where ${admissaoConcluidaSql}
              and ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
          )::int`,
          emAndamento: sql<number>`count(*) filter (where ${admissaoEmAndamentoExclusivoSql})::int`,
          pausadas: sql<number>`count(*) filter (where ${admissoes.pausadaEm} is not null)::int`,
          emBanco: sql<number>`count(*) filter (where ${admissoes.farolGlobal} = 'BANCO_AGUARDAR')::int`,
        })
        .from(admissaoProjeto)
        .innerJoin(admissoes, eq(admissoes.id, admissaoProjeto.admissaoId))
        .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
        .leftJoin(clienteLojas, eq(clienteLojas.id, admissoes.lojaId))
        .where(eq(admissaoProjeto.projetoId, projetoId))
        .groupBy(admissoes.cargoId, cargos.nome, rotulo),
      this.db
        .select({
          cargoId: admissoes.cargoId,
          cargoNome: cargos.nome,
          loja: rotulo,
          declinios: sql<number>`count(*)::int`,
        })
        .from(admissoes)
        .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
        .leftJoin(clienteLojas, eq(clienteLojas.id, admissoes.lojaId))
        .where(
          sql`${admissoes.codCliente} = ${codCliente}
              and ${admissoes.farolGlobal} in ('DECLINOU', 'RESCISAO')
              and ${admissoes.dataAdmissao} >= ${dataInicio}::date
              and ${admissoes.dataAdmissao} <= ${dataFim}::date`,
        )
        .groupBy(admissoes.cargoId, cargos.nome, rotulo),
    ]);

    // A CHAVE É O PAR, e o nulo de cada eixo tem marca própria: cargo ausente e loja ausente são
    // estados reais e diferentes, e fundi-los em texto criaria uma célula que não existe.
    const linhas = new Map<
      string,
      {
        cargoId: string | null;
        cargoNome: string;
        loja: string | null;
        total: number;
        vagas: number;
        concluidas: number;
        emAndamento: number;
        pausadas: number;
        emBanco: number;
        declinios: number;
      }
    >();
    const chave = (c: string | null, l: string | null) =>
      `${c ?? "\u0000sem-cargo"}\u0001${l ?? "\u0000sem-loja"}`;
    const pegar = (cargoId: string | null, cargoNome: string | null, loja: string | null) => {
      const k = chave(cargoId, loja);
      const atual = linhas.get(k);
      if (atual) return atual;
      const novo = {
        cargoId,
        cargoNome: cargoNome ?? "não informado",
        loja,
        total: 0,
        vagas: 0,
        concluidas: 0,
        emAndamento: 0,
        pausadas: 0,
        emBanco: 0,
        declinios: 0,
      };
      linhas.set(k, novo);
      return novo;
    };

    for (const s of status) {
      const l = pegar(s.cargoId, s.cargoNome, s.loja ?? null);
      l.total = Number(s.total);
      l.vagas = Number(s.vagas);
      l.concluidas = Number(s.concluidas);
      l.emAndamento = Number(s.emAndamento);
      l.pausadas = Number(s.pausadas);
      l.emBanco = Number(s.emBanco);
    }
    // UNIÃO, como nos dois quadros: o par que só aparece nos declínios é o cargo que aquela loja
    // perdeu inteiro, e é a célula mais importante do cruzamento.
    for (const d of declinios) {
      pegar(d.cargoId, d.cargoNome, d.loja ?? null).declinios = Number(d.declinios);
    }

    return [...linhas.values()].map((l) => ({ ...l, faltam: l.total - l.vagas }));
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
