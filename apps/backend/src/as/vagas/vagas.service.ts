import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AsOcupacaoVaga,
  AsVagaFechamentoBloqueado,
  CandidaturaEtapa,
  CandidaturaSituacao,
  FecharVagaRecusa,
  PapelAs,
  VagaCamposObrigatorios,
  VagaContextoAs,
  VagaListItem,
  VagaMetaReducao,
  VagaStatus,
} from "@ea/shared-types";
import {
  OPCAO_OUTRA,
  OPCAO_OUTROS,
  REGIAO_OUTRAS,
  contraparteDe,
  exigeMotivoContratacao,
  exigeTempoContrato,
  isValidCpf,
  nomeDaUf,
  normalizeCpf,
  regiaoPertenceAUf,
  textoPendencia,
  vagaPendencias,
} from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidatos,
  asCandidaturas,
  beneficiosCatalogo,
  cargos,
  clientes,
  escalasCatalogo,
  motivosContratacao,
  usuarios,
  vagaBeneficio,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import {
  kpisDoFunil,
  ocupacaoDaVaga,
  pendentesDeTratamento,
  posicaoNoFunil,
} from "../../domain/candidatura";
import {
  codigoJaUsado,
  ehStatusDaTrilha,
  ladosDaVaga,
  statusVivoDaVaga,
  escolaridadeVivaDaVaga,
  normalizarCodigoVaga,
  excessoDePosicoes,
  type ExcessoDePosicoes,
  type VagaStatusDaTrilha,
} from "../../domain/vaga";
import type { CreateVagaDto, EditarPosicoesVagaDto, FecharVagaDto } from "./vagas.dto";
import { EtapasFunilService } from "../etapas/etapas-funil.service";

/**
 * O EXECUTOR DENTRO DA TRANSAÇÃO, tipado como a casa já tipa (`admissoes.service`, `esteira`): o
 * fechamento lê e escreve pelo `tx`, e não pelo `this.db`, para que tudo aconteça sob a mesma linha
 * de vaga travada.
 */
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * UMA CANDIDATURA DA VAGA, do jeito que o fechamento precisa dela: o suficiente para a trava 5
 * montar a lista de pendentes e para a trava 6 derivar a ocupação. É a MESMA leitura servindo as
 * duas, e é por isso que a forma é uma só.
 *
 * §A.6: nome, sim (a tela precisa dizer QUEM está pendurado no funil); CPF e contato, nunca.
 */
interface LinhaDeCandidatura {
  candidaturaId: string;
  candidatoId: string;
  candidatoNome: string;
  etapa: CandidaturaEtapa;
  situacao: CandidaturaSituacao;
  posicaoLado: string | null;
}

/**
 * UMA CANDIDATURA DA LISTAGEM, do jeito que a consulta agregada de `ocupacaoPorVaga` a devolve.
 *
 * TRÊS COLUNAS, E CADA UMA SERVE A UMA RÉGUA DIFERENTE: `situacao` responde quem OCUPA posição,
 * `posicaoLado` separa a entrega OFICIAL da de BANCO, e `etapa` alimenta a contagem do funil. A
 * forma é UMA SÓ porque a LEITURA é uma só: a mesma lista é entregue a `ocupacaoDaVaga` e a
 * `kpisDoFunil`, e é isso que impede os dois números de discordarem sobre o mesmo instante.
 *
 * É ESTRUTURALMENTE COMPATÍVEL COM `ItemDeOcupacao` E COM `ItemDoFunil`, cada um lendo o que lhe
 * interessa e ignorando o resto. Duas listas separadas seriam duas leituras do mesmo fato.
 *
 * §A.6: três colunas de PROCESSO. Nenhuma identifica pessoa.
 */
interface LinhaDeOcupacao {
  situacao: CandidaturaSituacao;
  posicaoLado: string | null;
  etapa: string;
}

/**
 * CENTRAL DE VAGAS (A&S): a vaga nasce pela trilha de abertura e termina pela ação de fechar.
 *
 * A LINHA É A IDENTIDADE. Cada abertura é uma vaga com `id` próprio do EA; o `codigo` é o número do
 * PROCESSO SELETIVO, digitado à mão e único no sistema.
 *
 * A TRAVA DE DUPLICIDADE vive no cadastro, e só nele: a importação da base (onda 3) não passa por
 * este caminho de propósito, porque lá o código repetido é marcado para revisão em vez de perder a
 * linha. É pelo mesmo motivo que o banco tem índice comum, e não unique, em `vagas.codigo`.
 *
 * OS DOIS LADOS DA VAGA saem do PAPEL DE A&S de quem abre (`ladosDaVaga`, no domínio): um lado é
 * carimbado da sessão, o outro é a contraparte escolhida na trilha. Nunca os dois na mão.
 *
 * §A.6: vaga não carrega dado pessoal de CANDIDATO. O nome e o CPF do SUBSTITUÍDO são de
 * funcionário, e o CPF PERSISTE por decisão do diretor (22/08): é exigência legal do cadastro do
 * ADM. Nunca vai para log e nunca sai em exportação, e a rota inteira é fechada pelo menu `as-vagas`.
 * O expurgo de 48h da ADMISSÃO (regra 10 da §A.3) não foi tocado: é outra tabela e outro gatilho.
 */
@Injectable()
export class VagasService {
  /**
   * `EtapasFunilService` entra aqui por UM motivo só, e ele é o defeito SILENCIOSO desta frente: a
   * lista de candidatos pendentes do fechamento é ordenada PELA ORDEM DO FUNIL, e essa ordem era
   * `CANDIDATURA_ETAPAS.indexOf(...)`, uma constante de código. Com a lista virando dado do diretor,
   * um `indexOf` sobre qualquer outra lista continuaria compilando e passaria a ordenar errado sem
   * erro nenhum, que é pior do que quebrar. A ordem passa a vir da coluna `ordem` do catálogo.
   */
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly etapas: EtapasFunilService,
  ) {}

  /**
   * Lista as vagas com cargo, cliente, autor e os dois lados JÁ RESOLVIDOS em nome.
   *
   * LEFT JOIN em TODOS os vínculos (cargo, cliente, autor, consultor e recruiter) porque todos são
   * nuláveis por desenho: INNER JOIN sumiria em silêncio com a vaga sem cliente vinculado, que é
   * justamente a que precisa aparecer para alguém vincular.
   *
   * O CARGO ENTROU NESSA LISTA COM O RASCUNHO (OST de 25/08), e isto não é detalhe de estilo: com o
   * `innerJoin` que estava aqui, o rascunho salvo antes de escolher o cargo SUMIRIA da listagem, e
   * quem salvasse para continuar depois não teria como voltar nele.
   *
   * A OCUPAÇÃO DERIVADA VAI JUNTO, e ela já mora no TIPO COMPARTILHADO. Havia aqui uma interseção
   * local (`VagaListItem & { ocupacao }`), temporária por PROCESSO e não por tipagem:
   * `packages/shared-types` é ARQUIVO DE DONO ÚNICO (§A.39), e o dono é o coordenador. O campo já
   * trafegava em runtime enquanto o tipo não o declarava; o dono escreveu o campo
   * (`ocupacao: AsOcupacaoVaga`, em `VagaListItem`), e a interseção saiu. Um tipo só, nada muda em
   * runtime.
   *
   * ELA VEM SEMPRE PREENCHIDA, inclusive na vaga sem candidatura nenhuma (tudo zero). Campo opcional
   * obrigaria cada leitor a decidir o que fazer com a ausência, e o zero já é a resposta certa: vaga
   * sem gente dentro tem zero posições entregues.
   */
  async list(): Promise<VagaListItem[]> {
    const consultor = alias(usuarios, "consultor");
    const recruiter = alias(usuarios, "recruiter");
    const autor = alias(usuarios, "autor");
    // O QUARTO ALIAS DE `usuarios`: quem FORÇOU o fechamento. Ele é nulável duas vezes (a vaga
    // normal não tem forçamento, e o autor do forçamento vira nulo se o usuário for apagado), então
    // o join é LEFT como os outros três.
    const forcadoPor = alias(usuarios, "forcado_por");

    const linhas = await this.db
      .select({
        v: vagas,
        cargoNome: cargos.nome,
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        abertoPorNome: autor.nome,
        consultorNome: consultor.nome,
        recruiterNome: recruiter.nome,
        fechamentoForcadoPorNome: forcadoPor.nome,
      })
      .from(vagas)
      .leftJoin(cargos, eq(cargos.id, vagas.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, vagas.codCliente))
      .leftJoin(autor, eq(autor.id, vagas.abertoPorId))
      .leftJoin(consultor, eq(consultor.id, vagas.consultorId))
      .leftJoin(recruiter, eq(recruiter.id, vagas.recruiterId))
      .leftJoin(forcadoPor, eq(forcadoPor.id, vagas.fechamentoForcadoPorId))
      .orderBy(desc(vagas.criadoEm));

    const porVaga = await this.beneficiosPorVaga(linhas.map((l) => l.v.id));
    const ocupacoes = await this.ocupacaoPorVaga(
      linhas.map((l) => ({ id: l.v.id, posicoesOficiais: l.v.posicoesOficiais })),
    );
    // UMA CONSULTA PARA A PÁGINA INTEIRA, e não uma por vaga: a listagem não pagina, então buscar o
    // rastro linha a linha viraria centenas de idas ao banco para responder "vazio" em quase todas.
    const reducoes = await this.metaReducoesPorVaga(linhas.map((l) => l.v.id));

    return linhas.map(({ v, ...l }) => ({
      id: v.id,
      codigo: v.codigo,
      nomeDivulgacao: v.nomeDivulgacao,
      cargoId: v.cargoId,
      cargoNome: l.cargoNome,
      codCliente: v.codCliente,
      // O rótulo do cliente no sistema é sempre "código - nome de operação" (padrão do wizard); sem
      // nome de operação cadastrado, cai na razão social, que é o que existe.
      clienteNome: v.codCliente ? (l.clienteOperacao ?? l.clienteRazao ?? null) : null,
      idVacancyPandape: v.idVacancyPandape,
      natureza: v.natureza,
      vinculo: v.vinculo,
      // O status dormente "VAGA_BANCO" é traduzido na ENTRADA (item 8, 07/09): a régua e o porquê
      // estão em `statusVivoDaVaga`. Hoje ela nunca dispara, porque nenhuma linha usa o valor.
      status: statusVivoDaVaga(v.status),
      sazonalidade: v.sazonalidade,
      posicoesOficiais: v.posicoesOficiais,
      posicoesBanco: v.posicoesBanco,
      // Traduzida na ENTRADA, como o status: o "TECNICO" solto virou Técnico Completo (item 3).
      escolaridade: escolaridadeVivaDaVaga(v.escolaridade),
      salarioAbertura: v.salarioAbertura,
      salarioFechamento: v.salarioFechamento,
      beneficios: porVaga.get(v.id) ?? [],
      dataAbertura: v.dataAbertura,
      dataLimite: v.dataLimite,
      abertoPorNome: l.abertoPorNome,
      criadoEm: v.criadoEm.toISOString(),

      solicitanteNome: v.solicitanteNome,
      solicitanteTelefone: v.solicitanteTelefone,
      solicitanteEmail: v.solicitanteEmail,
      dataSolicitacao: v.dataSolicitacao,
      dataAlinhamento: v.dataAlinhamento,
      envioShortlist: v.envioShortlist,
      /**
       * O ID VIAJA JUNTO DO NOME (item 16, 07/09) porque o FILTRO casa por ID. Por nome, dois
       * consultores homônimos viram um só no filtro, e o time acabaria olhando a fila de outra
       * pessoa achando que é a sua. O nome continua sendo o que a coluna MOSTRA.
       */
      consultorId: v.consultorId,
      consultorNome: l.consultorNome,
      recruiterNome: l.recruiterNome,
      tempoContrato: v.tempoContrato,
      motivo: v.motivo,
      justificativaMotivo: v.justificativaMotivo,
      tipoSubstituicao: v.tipoSubstituicao,
      substituidoNome: v.substituidoNome,
      substituidoCpf: v.substituidoCpf,
      localTrabalho: v.localTrabalho,
      regiaoEstado: v.regiaoEstado,
      regioes: v.regioes ?? [],
      regioesOutras: v.regioesOutras,
      horarioEscala: v.horarioEscala,
      modeloTrabalho: v.modeloTrabalho,
      detalheHibrido: v.detalheHibrido,
      confidencial: v.confidencial,
      divulgarEmpresa: v.divulgarEmpresa,

      faixaEtaria: v.faixaEtaria,
      genero: v.genero,
      idiomas: v.idiomas ?? [],
      idiomasOutros: v.idiomasOutros,
      cursosConhecimentos: v.cursosConhecimentos,
      testes: v.testes ?? [],
      testesOutro: v.testesOutro,
      experiencia: v.experiencia,
      atribuicoes: v.atribuicoes,
      perfilComportamental: v.perfilComportamental,
      ambiente: v.ambiente,
      etapasPs: v.etapasPs ?? [],
      etapasPsOutra: v.etapasPsOutra,
      observacoes: v.observacoes,

      dataFechamento: v.dataFechamento,
      vagasFechadas: v.vagasFechadas,
      vagasFechadasBanco: v.vagasFechadasBanco,
      dataPrevistaInicio: v.dataPrevistaInicio,
      enviarParaAdmissao: v.enviarParaAdmissao,
      /*
       * A OCUPAÇÃO DERIVADA, ao lado dos contadores DIGITADOS do fechamento, e não no lugar deles.
       *
       * `vagasFechadas` e `vagasFechadasBanco` continuam exatamente onde estavam, com o mesmo valor:
       * quem decide se a tela passa a ler a derivada ou o número digitado é outra etapa, e é decisão
       * do diretor. Aqui a listagem só passa a CARREGAR a resposta derivada, que antes só existia no
       * painel de uma vaga por vez.
       */
      ocupacao: ocupacoes.get(v.id) ?? this.ocupacaoVazia(v.id, v.posicoesOficiais),
      /**
       * A TRILHA DO FORÇADO, e ela é NULA na esmagadora maioria das vagas: só existe quando um
       * Master fechou com posição oficial em aberto.
       *
       * O DISCRIMINADOR É A DATA, e não o autor: o autor vira nulo sozinho quando o usuário é
       * apagado (`on delete set null`), e a trilha continua verdadeira sem ele, dizendo QUANDO e
       * QUANTAS faltavam. Usar o autor como discriminador faria a exceção desaparecer da tela no dia
       * em que alguém saísse da empresa.
       *
       * `faltavam` VEM DO BANCO E NÃO É RECALCULADO: ele é o carimbo do instante do forçamento, e é
       * essa a razão de ele estar guardado (o único número derivado que este módulo guarda).
       */
      fechamentoForcado: v.fechamentoForcadoEm
        ? {
            porNome: l.fechamentoForcadoPorNome ?? null,
            quandoIso: v.fechamentoForcadoEm.toISOString(),
            faltavam: v.fechamentoForcadoFaltavam ?? 0,
          }
        : null,
      /**
       * O RASTRO DA REDUÇÃO DE META, da mais ANTIGA para a mais RECENTE, e VAZIO na esmagadora
       * maioria das vagas (ninguém mexeu na meta). Ele viaja na LISTAGEM pela mesma razão do
       * forçamento: a pergunta que ele responde ("esta vaga fechou porque entregou, ou porque
       * encolheram a meta?") nasce OLHANDO A LISTA, e uma requisição por linha entregaria a
       * resposta depois da conclusão de quem perguntou.
       */
      metaReducoes: reducoes.get(v.id) ?? [],
    }));
  }

  /**
   * OPÇÕES DOS SELETORES SERVIDAS PELO PRÓPRIO MÓDULO DE A&S.
   *
   * POR QUE NÃO REUSAR `/catalogos`, que já devolve cargos, clientes, benefícios e motivos:
   * `CatalogosController` está carimbado como área **ADM** em `AREA_POR_CONTROLLER`. Um Master de
   * A&S chamando aquela rota seria barrado pelo teto de área, e a trilha abriria com os seletores
   * vazios, sem erro visível. Hoje isso não aparece porque quem valida é SUPER_ADMIN, que fica acima
   * da segmentação; apareceria no dia em que o diretor liberasse o menu para o time de A&S.
   *
   * A ALTERNATIVA seria marcar aquela controller também como AS, e ela foi DESCARTADA: é código de
   * autorização já validado, e alargar a área de uma controller da Admissão para resolver um seletor
   * de A&S é mexer no teto de acesso de outra frente (§A.26).
   *
   * §A.6: só id, código e nome de catálogo. Nenhum dado pessoal de candidato.
   */
  async opcoes(): Promise<{
    cargos: { id: string; nome: string }[];
    clientes: {
      codCliente: string;
      rotulo: string;
      enderecoPadrao: string | null;
      escalaPadrao: string | null;
      /**
       * O SOLICITANTE HERDADO (item 1 da OST de 22/08): quem pediu a última vaga deste cliente EM QUE
       * ALGUÉM PREENCHEU O CONTATO (correção de 25/08, ver o comentário da consulta abaixo).
       *
       * Cliente sem vaga anterior, ou com vagas anteriores todas sem contato, vem com os três nulos, e
       * o passo 2 nasce em branco. Isso NÃO é falha da herança: é não haver o que herdar.
       */
      solicitanteNome: string | null;
      solicitanteTelefone: string | null;
      solicitanteEmail: string | null;
    }[];
    beneficios: { id: string; nome: string; exigeValor: boolean }[];
    motivos: string[];
    /**
     * AS ESCALAS DO CADASTRO DO MENU GERENCIAL (item 5 da OST de 22/08).
     *
     * É O MESMO `escalas_catalogo` da tela `/admin/escalas` e da Liberação Admissional, lido sem
     * tocar em nada dele, exatamente como o diretor pediu.
     *
     * POR QUE SERVIDO DAQUI, e não pelo `/catalogos/escalas` que já existe: aquela controller está
     * carimbada como área ADM em `AREA_POR_CONTROLLER`, e um Master de A&S chamando-a seria barrado
     * pelo teto de área, abrindo a trilha com o seletor de escala vazio e SEM erro visível. Hoje
     * ninguém veria, porque quem valida é SUPER_ADMIN; apareceria no dia em que o menu fosse
     * liberado para o time de A&S. É a mesma decisão, e pelo mesmo motivo, já tomada para cargos,
     * clientes, benefícios e motivos logo acima. Alargar a área daquela controller para resolver um
     * seletor de A&S seria mexer no teto de acesso de outra frente (§A.26).
     *
     * SÓ AS ATIVAS: inativar no catálogo é exclusão lógica, e o inativo não se oferece em cadastro
     * novo. O catálogo está sujo (duplicatas de caixa, placeholders), e limpá-lo é frente futura do
     * diretor: esta frente não deduplica nada, só oferece o que está lá.
     */
    escalas: string[];
    /**
     * OS CONSULTORES DE A&S, para o FILTRO da coluna "Consultor Responsável" (item 16 do mapa do
     * time, 07/09).
     *
     * §A.37 MANDA O CATÁLOGO VIR DE UM ENDPOINT, e não das linhas já carregadas na tela, e a razão é
     * prática: derivando das linhas, a lista de opções ENCOLHE assim que o primeiro consultor é
     * escolhido (a tela passa a mostrar só as vagas dele), e não há como somar o segundo sem limpar o
     * filtro antes. Vindo daqui, a lista é sempre a mesma.
     *
     * A LISTA É DE QUEM TEM PAPEL DE CONSULTOR, não de quem já aparece em alguma vaga: consultor
     * recém-marcado aparece no filtro antes de abrir a primeira vaga, e a lista não muda conforme o
     * recorte da tela.
     *
     * §A.6: id e NOME, de um USUÁRIO do sistema. Nenhum dado de candidato, nenhum CPF, nenhum
     * contato. É o mesmo par que o `contextoAs` já devolve para o seletor da trilha.
     */
    consultores: { id: string; nome: string }[];
  }> {
    const [
      listaCargos,
      listaClientes,
      listaBeneficios,
      listaMotivos,
      ultimoSolicitante,
      listaEscalas,
      listaConsultores,
    ] = await Promise.all([
      this.db
        .select({ id: cargos.id, nome: cargos.nome })
        .from(cargos)
        .where(eq(cargos.ativo, true))
        .orderBy(asc(cargos.nome)),
      // Os padrões do cliente vêm JUNTO das opções porque é a trilha que pré-preenche local de
      // trabalho e escala (§A.3, F1): buscá-los numa segunda chamada faria o passo 4 piscar.
      this.db
        .select({
          codCliente: clientes.codCliente,
          razaoSocial: clientes.razaoSocial,
          nomeOperacao: clientes.nomeOperacao,
          enderecoPadrao: clientes.enderecoPadrao,
          escalaPadrao: clientes.escalaPadrao,
        })
        .from(clientes)
        .where(eq(clientes.ativo, true))
        .orderBy(asc(clientes.razaoSocial)),
      // O CADASTRO DE BENEFÍCIOS QUE JÁ EXISTE: a mesma tabela que alimenta a tela de Benefícios e a
      // ficha da admissão. `exigeValor` é o que diz se o campo de valor acende ao lado. Só os
      // ATIVOS: inativar no catálogo é exclusão lógica, e o inativo não se oferece em cadastro novo.
      this.db
        .select({
          id: beneficiosCatalogo.id,
          nome: beneficiosCatalogo.nome,
          exigeValor: beneficiosCatalogo.exigeValor,
        })
        .from(beneficiosCatalogo)
        .where(eq(beneficiosCatalogo.ativo, true))
        .orderBy(asc(beneficiosCatalogo.nome)),
      // O catálogo de motivos que a Nova Admissão já usa. A vaga guarda o NOME escolhido, como
      // `dados_vaga_folha.motivo` faz, e não uma FK: motivo inativado depois não trava vaga antiga.
      this.db
        .select({ nome: motivosContratacao.nome })
        .from(motivosContratacao)
        .where(eq(motivosContratacao.ativo, true))
        .orderBy(asc(motivosContratacao.nome)),
      /**
       * O CONTATO FOCAL DA ÚLTIMA VAGA DE CADA CLIENTE (item 1).
       *
       * `DISTINCT ON (cod_cliente)` com `ORDER BY cod_cliente, criado_em DESC` devolve UMA linha por
       * cliente, a mais recente. É a forma de o Postgres responder "o último de cada grupo" em uma
       * varredura só, sem subconsulta por cliente e sem trazer a tabela inteira para a memória do
       * Node só para descartar quase tudo.
       *
       * VEM JUNTO DAS OPÇÕES, e não numa rota "buscar solicitante do cliente X": o passo 1 e o passo
       * 2 são cliques seguidos, e uma chamada por troca de cliente faria o formulário piscar. É a
       * mesma decisão que já trouxe `enderecoPadrao` e `escalaPadrao` para cá.
       *
       * A ÚLTIMA VAGA **QUE TEM** SOLICITANTE, e não simplesmente a última (correção de 25/08).
       *
       * O `isNotNull(solicitanteNome)` no filtro é a correção inteira, e ela conserta um defeito que
       * ainda não tinha aparecido na base: sem ele, bastava alguém abrir UMA vaga daquele cliente sem
       * preencher o contato para a herança MORRER PARA SEMPRE naquele cliente, apesar de existir a
       * vaga anterior com o contato certo logo atrás. A vaga mais nova ganhava o `DISTINCT ON` e
       * respondia "não tem solicitante", e nada na tela dizia que havia um.
       *
       * TELEFONE E E-MAIL SEGUEM O NOME, da MESMA vaga, mesmo quando estão vazios: são o contato de
       * UMA pessoa, e catar cada pedaço da vaga em que ele estiver preenchido montaria um contato que
       * nunca existiu, com o nome de um solicitante e o telefone de outro.
       *
       * §A.6: nome, telefone e e-mail são de CONTATO DO CLIENTE (a pessoa que pediu a vaga), não de
       * candidato. É o mesmo dado que a vaga já mostra na listagem.
       */
      this.db
        .selectDistinctOn([vagas.codCliente], {
          codCliente: vagas.codCliente,
          solicitanteNome: vagas.solicitanteNome,
          solicitanteTelefone: vagas.solicitanteTelefone,
          solicitanteEmail: vagas.solicitanteEmail,
        })
        .from(vagas)
        .where(and(isNotNull(vagas.codCliente), isNotNull(vagas.solicitanteNome)))
        .orderBy(asc(vagas.codCliente), desc(vagas.criadoEm)),
      this.db
        .select({ nome: escalasCatalogo.nome })
        .from(escalasCatalogo)
        .where(eq(escalasCatalogo.ativo, true))
        .orderBy(asc(escalasCatalogo.nome)),
      // SÓ OS ATIVOS COM PAPEL DE CONSULTOR. Quem foi desativado não é oferecido em filtro novo, pela
      // mesma régua dos demais catálogos daqui; a vaga antiga dele continua mostrando o nome na
      // coluna, porque a coluna lê a vaga e não esta lista.
      this.db
        .select({ id: usuarios.id, nome: usuarios.nome })
        .from(usuarios)
        .where(and(eq(usuarios.ativo, true), eq(usuarios.papelAs, "CONSULTOR")))
        .orderBy(asc(usuarios.nome)),
    ]);

    const solicitantePorCliente = new Map(
      ultimoSolicitante
        .filter((u) => u.codCliente !== null)
        .map((u) => [u.codCliente as string, u]),
    );

    return {
      cargos: listaCargos,
      clientes: listaClientes.map((c) => {
        const ultimo = solicitantePorCliente.get(c.codCliente);
        return {
          codCliente: c.codCliente,
          rotulo: `${c.codCliente} - ${c.nomeOperacao ?? c.razaoSocial}`,
          enderecoPadrao: c.enderecoPadrao,
          escalaPadrao: c.escalaPadrao,
          solicitanteNome: ultimo?.solicitanteNome ?? null,
          solicitanteTelefone: ultimo?.solicitanteTelefone ?? null,
          solicitanteEmail: ultimo?.solicitanteEmail ?? null,
        };
      }),
      beneficios: listaBeneficios,
      motivos: listaMotivos.map((m) => m.nome),
      escalas: listaEscalas.map((e) => e.nome),
      consultores: listaConsultores,
    };
  }

  /**
   * O CONTEXTO DE A&S DE QUEM ABRE (frente 2).
   *
   * Duas respostas numa: qual lado a pessoa ocupa, e quem são as pessoas do lado oposto. A tela usa
   * a primeira para dizer "você entra como Recruiter" e a segunda para desenhar UM seletor só.
   *
   * O PAPEL É LIDO DO BANCO, não do token, e isso é deliberado: o JWT de produção não tem este campo
   * e não vai ganhar um por causa desta frente. Quem trocou de lado hoje de manhã abre a vaga da
   * tarde já do lado certo, sem precisar sair e entrar de novo.
   */
  async contextoAs(usuarioId: string): Promise<VagaContextoAs> {
    const eu = await this.db.query.usuarios.findFirst({ where: eq(usuarios.id, usuarioId) });
    const papelAs = (eu?.papelAs ?? null) as PapelAs | null;
    if (!papelAs) return { papelAs: null, nome: eu?.nome ?? "", contraparte: [] };

    const ladoOposto = contraparteDe(papelAs);
    const pessoas = await this.db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(and(eq(usuarios.ativo, true), eq(usuarios.papelAs, ladoOposto)))
      .orderBy(asc(usuarios.nome));

    return { papelAs, nome: eu?.nome ?? "", contraparte: pessoas };
  }

  /**
   * ABRIR A VAGA, nos DOIS estados em que ela pode nascer (OST de 25/08).
   *
   * RASCUNHO é a vaga salva pela metade, para continuar depois: ela grava o que houver e NÃO cobra
   * obrigatório nenhum. ABERTA é a vaga publicada, e é só aí que a régua cobra.
   *
   * UM CAMINHO SÓ para os dois, e isso é deliberado: uma rota "criar rascunho" separada duplicaria as
   * validações de formato, de benefício, de região e de CPF, e as duas cópias divergiriam na primeira
   * correção feita em uma delas. O que muda entre os dois estados é UMA linha, `travaObrigatorios`.
   */
  async create(dto: CreateVagaDto, abertoPorId: string): Promise<VagaListItem> {
    const status = this.travaStatusDaTrilha(dto.status, "ABERTA");
    const campos = this.camposDaTrilha(dto, status);
    this.travaObrigatorios(campos, status);

    await this.travaDuplicidadeDeCodigo(campos.codigo, null);
    const beneficios = await this.validaBeneficios(dto.beneficios ?? []);

    // OS DOIS LADOS DA VAGA, pela régua do domínio. Quem não tem papel de A&S não abre vaga, nem em
    // rascunho: sem isso a vaga nasceria sem lado nenhum e ninguém saberia de quem ela é. Isto NÃO é
    // campo do formulário, é autoria, e por isso a régua do rascunho não o alcança.
    const lados = await this.ladosDeQuemAbre(abertoPorId, dto.contraparteId);

    // TRANSAÇÃO porque são duas escritas: a vaga e os benefícios dela. Sem ela, uma falha no segundo
    // insert deixaria a vaga gravada sem os benefícios que o consultor marcou, em silêncio.
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(vagas)
        .values({
          ...campos,
          abertoPorId,
          consultorId: lados.consultorId,
          recruiterId: lados.recruiterId,
        })
        .returning({ id: vagas.id });

      if (beneficios.length > 0) {
        await tx
          .insert(vagaBeneficio)
          .values(
            beneficios.map((b) => ({ vagaId: row.id, beneficioId: b.beneficioId, valor: b.valor })),
          );
      }
      return row.id;
    });

    return this.devolverVaga(id, "Vaga criada, mas não encontrada na listagem.");
  }

  /**
   * CONTINUAR O RASCUNHO, e PUBLICAR quando ele estiver pronto (OST de 25/08).
   *
   * SÓ RASCUNHO ENTRA AQUI. Vaga publicada não volta para a trilha por este caminho: ela já está na
   * mão do time, já pode ter sido divulgada, e reabri-la para edição livre é outra decisão, que o
   * diretor não pediu (§A.14). Quem tenta recebe conflito com o motivo, não um erro genérico.
   *
   * PUBLICAR É ESTA MESMA ROTA com `status` diferente de RASCUNHO: é o momento em que a régua dos
   * obrigatórios passa a valer, e ela vale sobre o CORPO INTEIRO que a trilha mandou, não sobre o que
   * estava gravado antes. Assim a tela e o servidor conferem exatamente a mesma coisa.
   *
   * A AUTORIA NÃO TROCA DE MÃO: `abertoPorId` fica como estava, e os dois lados são recalculados a
   * partir do PAPEL DE QUEM ABRIU, não de quem está editando. Um rascunho aberto por outra pessoa não
   * muda de dono porque alguém entrou nele para completar um campo.
   *
   * ┌─ ESTA ROTA TAMBÉM ESCREVE A META, E O RASTRO FALTAVA AQUI (veto mantido, 09/09) ───────────┐
   * │ `posicoes_oficiais` tem DOIS escritores: a rota irmã das posições, que já registra a        │
   * │ redução desde a auditoria de 09/09, e ESTA, que gravava o número novo em silêncio. O desvio │
   * │ do gate de Master continuava inteiro pela porta de trás: rascunho com meta 5, alocam-se e   │
   * │ finalizam-se as posições (o rascunho RECEBE candidato de propósito), e um PATCH com         │
   * │ `{ posicoesOficiais: 1, status: "ABERTA" }` publicava a vaga com a meta já rebaixada. Do    │
   * │ lado do fechamento, `faltam` dava zero, a vaga fechava pela porta NORMAL, sem Master, com a │
   * │ trilha do forçamento em branco e `vaga_meta_reducoes` VAZIA.                                │
   * │                                                                                            │
   * │ A RESPOSTA É A MESMA DA ROTA IRMÃ, e é a peça que já existe aplicada na porta que ficou de  │
   * │ fora: `reducaoDeMeta` decidida ANTES da escrita (depois dela o número anterior não existe   │
   * │ mais em lugar nenhum) e gravada na MESMA transação. NENHUM `@Roles` novo, NENHUMA trava     │
   * │ nova: a decisão do diretor é RASTRO, e baixar a meta continua sendo do consultor.           │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async atualizar(
    id: string,
    dto: CreateVagaDto,
    /**
     * QUEM EDITOU, DA SESSÃO, para o rastro da redução nascer em nome de alguém.
     *
     * OPCIONAL NA ASSINATURA E OBRIGATÓRIO NA PRÁTICA: a única chamada de produção é a da
     * controller, que passa `user.id` e tem teste próprio para isso (`vagas.rastro-reducao-na-
     * trilha.spec.ts`). O padrão segue o da coluna no banco (`por_id` é `set null`): sem o autor a
     * linha ainda diz QUANDO e de quanto para quanto, e perder a LINHA seria muito pior do que
     * perder o NOME.
     */
    autorId: string | null = null,
  ): Promise<VagaListItem> {
    const atual = await this.db.query.vagas.findFirst({ where: eq(vagas.id, id) });
    if (!atual) throw new NotFoundException("Vaga não encontrada.");
    if (atual.status !== "RASCUNHO") {
      throw new ConflictException(
        "Esta vaga já foi publicada e não volta para a trilha de abertura. Recarregue a página.",
      );
    }

    const status = this.travaStatusDaTrilha(dto.status, "RASCUNHO");
    const campos = {
      ...this.camposDaTrilha(dto, status),
      posicoesOficiais: this.metaOficialDaTrilha(dto, atual),
    };
    this.travaObrigatorios(campos, status);

    await this.travaDuplicidadeDeCodigo(campos.codigo, id);
    const beneficios = await this.validaBeneficios(dto.beneficios ?? []);
    const lados = await this.ladosDeQuemAbre(atual.abertoPorId, dto.contraparteId);

    /*
     * ┌─ A META NÃO DESCE ABAIXO DO QUE JÁ FOI ENTREGUE, TAMBÉM POR AQUI (auditoria, 09/09) ──────┐
     * │ A TRAVA EXISTIA NUMA PORTA E FALTAVA NA IRMÃ. `editarPosicoes` recusa baixar a meta abaixo │
     * │ da ocupação DERIVADA desde a frente dos dois contadores; ESTA rota, que é o outro escritor │
     * │ de `posicoes_oficiais`, gravava qualquer número. O rascunho RECEBE candidato e pode ter    │
     * │ posição FINALIZADA (é o mesmo fato que abriu o buraco do rastro), então dava para PUBLICAR │
     * │ uma vaga com meta 1 tendo 3 pessoas já entregues: um número IMPOSSÍVEL, que faz a ocupação │
     * │ da tela nascer estourada e o `faltam` do fechamento nascer negativo.                       │
     * │                                                                                           │
     * │ ISTO NÃO TRANSFORMA O RASTRO EM TRAVA, e a distinção é a decisão do diretor: BAIXAR a meta │
     * │ continua PASSANDO e continua sendo do consultor, com `vaga_meta_reducoes` gravado como     │
     * │ hoje. O que esta linha barra é outra coisa, e não é decisão de negócio nenhuma: meta ABAIXO│
     * │ do que já foi ENTREGUE. Reduzir de 5 para 3 com 3 entregues passa; para 2, não.            │
     * │                                                                                           │
     * │ A RÉGUA É `excessoDePosicoes`, do domínio, com o MESMO insumo da rota irmã (a ocupação     │
     * │ derivada, não o carimbo `vagas_fechadas`, que na vaga viva é sempre nulo e nunca acusaria  │
     * │ nada) e a MESMA frase. Uma segunda régua aqui divergiria da primeira na correção seguinte. │
     * │                                                                                           │
     * │ ANTES DA ESCRITA E ANTES DO RASTRO: a tentativa recusada não pode deixar meia mudança nem  │
     * │ uma linha de redução que não aconteceu.                                                    │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const ocupacao =
      (await this.ocupacaoPorVaga([{ id, posicoesOficiais: atual.posicoesOficiais }])).get(id) ??
      this.ocupacaoVazia(id, atual.posicoesOficiais);
    const excesso = excessoDePosicoes(
      { vagasFechadas: ocupacao.finalizadasOficial, vagasFechadasBanco: ocupacao.finalizadasBanco },
      { posicoesOficiais: campos.posicoesOficiais, posicoesBanco: campos.posicoesBanco },
    );
    if (excesso) throw new BadRequestException(this.mensagemDeExcesso(excesso));

    /*
     * O RASTRO É DECIDIDO ANTES DA ESCRITA, pela mesma razão escrita na `editarPosicoes`: depois do
     * `update` o número ANTERIOR não existe mais em lugar nenhum, e quem grava primeiro não tem mais
     * como responder "de quanto para quanto".
     */
    const reducao = this.reducaoDeMeta(atual, campos);

    // OS BENEFÍCIOS SÃO SUBSTITUÍDOS, não mesclados: a trilha manda a lista COMPLETA do que está
    // marcado, então o que sumiu da lista foi desmarcado pela pessoa. Mesclar deixaria no banco um
    // benefício que a tela não mostra mais e ninguém conseguiria tirar.
    await this.db.transaction(async (tx) => {
      await tx
        .update(vagas)
        .set({
          ...campos,
          consultorId: lados.consultorId,
          recruiterId: lados.recruiterId,
          atualizadoEm: new Date(),
        })
        .where(eq(vagas.id, id));

      /*
       * A MESMA TRANSAÇÃO DA ESCRITA, como na rota irmã: rastro que pode FALTAR quando a escrita deu
       * certo não é rastro, seria de novo a meta menor sem ninguém para responder por ela.
       */
      if (reducao) {
        await tx.insert(vagaMetaReducoes).values({
          vagaId: id,
          deOficiais: reducao.deOficiais,
          paraOficiais: reducao.paraOficiais,
          deBanco: reducao.deBanco,
          paraBanco: reducao.paraBanco,
          porId: autorId,
        });
      }

      await tx.delete(vagaBeneficio).where(eq(vagaBeneficio.vagaId, id));
      if (beneficios.length > 0) {
        await tx
          .insert(vagaBeneficio)
          .values(beneficios.map((b) => ({ vagaId: id, beneficioId: b.beneficioId, valor: b.valor })));
      }
    });

    return this.devolverVaga(id, "Vaga salva, mas não encontrada na listagem.");
  }

  /**
   * ─ A META OFICIAL NA CONTINUAÇÃO DO RASCUNHO: CORPO SEM O CAMPO PRESERVA O NÚMERO ─────────────
   *
   * A REGRA DA CASA NESTA ROTA É "O CORPO É COMPLETO": campo ausente é campo LIMPO, e é assim que o
   * idioma, o escape de "Outros" e o detalhe do híbrido somem quando a pessoa desmarca a opção. A
   * META OFICIAL É A ÚNICA EXCEÇÃO, e ela não é de conforto: é a condição para o rastro existir.
   *
   * APAGAR UMA META QUE EXISTIA NÃO É "DEFINIR", É PERDER INFORMAÇÃO, e é a redução mais completa
   * que há: com `posicoes_oficiais` nula, `travaPosicoesOficiais` devolve `null` de saída e o
   * fechamento deixa de ter gate NENHUM, sem Master e sem trilha de forçamento. Pior ainda em dois
   * passos: 5 vira nulo (silencioso), e depois o nulo vira 1, que o rastro lê como "definir" e não
   * registra. As quatro posições somem sem uma linha em lugar nenhum.
   *
   * E O RASTRO NÃO SABE ESCREVER "VIROU NULO": `vaga_meta_reducoes.para_oficiais` é NOT NULL e
   * `> 0` por check (0099), de propósito, porque a vaga também recusa meta zero. Registrar o
   * apagamento exigiria mudar a tabela, que é outra decisão e ninguém pediu (§A.14).
   *
   * ENTÃO A META NÃO É APAGADA POR AUSÊNCIA, e isto NÃO é trava: nada é recusado, nenhum papel é
   * exigido, nenhuma requisição falha. Quem quer BAIXAR a meta manda o número novo, e aí a linha de
   * rastro nasce. O que deixa de existir é o caminho de perdê-la em silêncio. O único efeito
   * colateral é que "voltar a não ter meta" deixa de ser possível pela trilha, e isso ninguém pediu:
   * publicar já exige o campo, e o rascunho continua nascendo sem meta normalmente.
   *
   * O BANCO NÃO ENTRA NESTA EXCEÇÃO, e a assimetria é a mesma da tabela e da vaga: `posicoes_banco`
   * é NOT NULL, ausente vale ZERO, e "sem banco" é RESPOSTA e não lacuna. Baixá-lo a zero é uma
   * redução de verdade, representável na linha do rastro, e é registrada como tal.
   */
  private metaOficialDaTrilha(
    dto: CreateVagaDto,
    atual: { posicoesOficiais: number | null },
  ): number | null {
    return dto.posicoesOficiais ?? atual.posicoesOficiais ?? null;
  }

  /**
   * ─ A TRILHA DE ABERTURA NÃO ENCERRA VAGA (achado bloqueante da auditoria, 08/09) ──────────────
   *
   * SÓ `RASCUNHO` E `ABERTA` SAEM DAQUI. Quem quiser terminar a vaga usa a porta do fechamento, que
   * é onde vivem a trava de todo candidato tratado, a das posições oficiais, o 403 de quem não pode
   * forçar e a trilha do forçamento. Nenhuma delas rodava quando esta rota gravava o status cru.
   *
   * O CENÁRIO ERA ALCANÇÁVEL, e não teórico: o rascunho RECEBE candidato, então um COMUM pegava um
   * rascunho com gente pendurada, publicava como `FECHADA` e a vaga terminava sem nada rodar, sem
   * ninguém ser avisado e sem uma linha de trilha dizendo que aquilo aconteceu.
   *
   * POR QUE AQUI TAMBÉM, SE O DTO JÁ RECUSA. Porque a autoridade deste módulo é declaradamente o
   * SERVICE (é o argumento que dispensa o `@Roles` na rota de fechar), e um argumento desses só se
   * sustenta se a régua estiver onde ele diz que está. O DTO protege a rota HTTP de hoje; esta
   * linha protege a operação de qualquer chamador que apareça amanhã, inclusive uma rotina de
   * importação, que não passa por DTO nenhum.
   *
   * A LISTA VEM DO DOMÍNIO (`VAGA_STATUS_DA_TRILHA`) e não é redigitada: duas cópias da mesma régua
   * divergem na primeira correção feita só em uma delas, que é o defeito que este módulo já pagou.
   */
  private travaStatusDaTrilha(
    pedido: string | undefined,
    padrao: VagaStatusDaTrilha,
  ): VagaStatusDaTrilha {
    const status = pedido ?? padrao;
    if (!ehStatusDaTrilha(status)) {
      throw new BadRequestException(
        "Esta tela salva a vaga como rascunho ou publica a vaga aberta, e nada mais. Para encerrar a vaga, use a ação de fechar vaga, que é onde o sistema confere os candidatos pendentes e as posições preenchidas.",
      );
    }
    return status;
  }

  /**
   * O CORPO DA TRILHA VIRANDO COLUNAS, uma vez só, para a criação e para a continuação do rascunho.
   *
   * TODA A HIGIENE DE CAMPO MORA AQUI: escape que só sobrevive com a opção marcada, tempo de contrato
   * que só existe em vínculo com prazo, região conferida contra a UF, CPF com dígito conferido. Antes
   * de existir a continuação do rascunho isto vivia dentro do `create`; duplicá-lo no `atualizar`
   * teria feito o rascunho e a publicação limparem coisas diferentes.
   */
  private camposDaTrilha(dto: CreateVagaDto, status: VagaStatus) {
    // A DATA LIMITE não depende mais da sazonalidade (correção de 21/08): vale em qualquer vaga e
    // segue opcional. A data de ABERTURA é obrigatória para PUBLICAR, e quem cobra é a régua.
    const regiao = this.validaRegioes(dto.regiaoEstado, dto.regioes, dto.regioesOutras);
    const codigoLimpo = dto.codigo ? normalizarCodigoVaga(dto.codigo) : "";

    return {
      // Código em branco é ausência, não string vazia: o rascunho pode ainda não ter número.
      codigo: codigoLimpo || null,
      cargoId: dto.cargoId ?? null,
      nomeDivulgacao: texto(dto.nomeDivulgacao),
      codCliente: dto.codCliente?.trim() || null,
      // A PONTE DO PANDAPÉ (onda 4): guarda o código e mais nada. Nenhuma chamada de API.
      idVacancyPandape: texto(dto.idVacancyPandape),
      natureza: dto.natureza ?? null,
      vinculo: dto.vinculo ?? null,
      status,
      sazonalidade: dto.sazonalidade ?? "OPERACAO_PADRAO",
      // OS DOIS CONTADORES (25/08). O oficial ausente é NULL (rascunho sem meta), o de banco ausente
      // é ZERO: a coluna é NOT NULL DEFAULT 0 e "sem banco" é resposta, não lacuna.
      posicoesOficiais: dto.posicoesOficiais ?? null,
      posicoesBanco: dto.posicoesBanco ?? 0,
      escolaridade: dto.escolaridade ?? null,
      salarioAbertura: dto.salarioAbertura ?? null,
      dataAbertura: data(dto.dataAbertura),
      dataLimite: data(dto.dataLimite),

      solicitanteNome: texto(dto.solicitanteNome),
      solicitanteTelefone: texto(dto.solicitanteTelefone),
      solicitanteEmail: texto(dto.solicitanteEmail),
      dataSolicitacao: data(dto.dataSolicitacao),
      dataAlinhamento: data(dto.dataAlinhamento),
      envioShortlist: data(dto.envioShortlist),

      /**
       * TEMPO DE CONTRATO SÓ EM VÍNCULO COM PRAZO (item 2). A tela esconde o campo fora dos três
       * vínculos, mas quem GRAVA é aqui: sem esta linha, trocar o vínculo depois de escolher o tempo
       * deixaria um prazo órfão gravado numa vaga efetiva, invisível na tela e presente no banco.
       * Mesma decisão já tomada para `detalheHibrido` fora do modelo híbrido.
       */
      tempoContrato: exigeTempoContrato(dto.vinculo) ? texto(dto.tempoContrato) : null,
      /**
       * MOTIVO, JUSTIFICATIVA E SUBSTITUIÇÃO SÓ NO VÍNCULO TEMPORÁRIO (item 1, decisão do diretor
       * 07/09). A tela esconde os campos fora do temporário; quem GRAVA é aqui, pela mesma razão
       * escrita no `tempoContrato` logo acima: sem esta metade, quem preenchesse o motivo e depois
       * trocasse o vínculo para Efetivo deixaria um motivo órfão no banco, invisível na trilha.
       *
       * NO CPF DO SUBSTITUÍDO ISSO É MAIS QUE ARRUMAÇÃO, É §A.6: dado pessoal que a vaga não precisa
       * mais não fica guardado. A minimização acontece na gravação, não na exibição.
       *
       * O `tempoContrato` acima NÃO ENTRA nesta condição, e é de propósito: ele tem régua própria e
       * três vínculos (`exigeTempoContrato`), e some junto seria mudar uma decisão de 22/08 que
       * ninguém pediu para mudar.
       */
      motivo: exigeMotivoContratacao(dto.vinculo) ? texto(dto.motivo) : null,
      justificativaMotivo: exigeMotivoContratacao(dto.vinculo)
        ? texto(dto.justificativaMotivo)
        : null,
      tipoSubstituicao: exigeMotivoContratacao(dto.vinculo) ? (dto.tipoSubstituicao ?? null) : null,
      substituidoNome: exigeMotivoContratacao(dto.vinculo) ? texto(dto.substituidoNome) : null,
      /**
       * §A.6: o CPF do substituído é dado pessoal e é tratado como tal TAMBÉM NO RASCUNHO. O número
       * nunca volta na mensagem de erro, nunca vai para log e a rota inteira segue fechada pelo menu
       * `as-vagas`. O rascunho afrouxa a régua dos OBRIGATÓRIOS, nunca a de dado sensível.
       *
       * O QUE O RASCUNHO AFROUXA, e só isto: a CONFERÊNCIA DO DÍGITO. No rascunho o número entra como
       * está, porque "salva o que tiver" inclui o CPF digitado pela metade, e recusar o rascunho
       * inteiro por causa de um dígito faltando faria o consultor perder os outros 37 campos. NA
       * PUBLICAÇÃO o dígito é conferido, e é lá que o CPF errado é barrado: nenhum CPF inválido chega
       * a uma vaga publicada.
       */
      substituidoCpf: exigeMotivoContratacao(dto.vinculo)
        ? this.validaCpfSubstituido(dto.substituidoCpf, status === "RASCUNHO")
        : null,

      localTrabalho: texto(dto.localTrabalho),
      regiaoEstado: regiao.uf,
      regioes: regiao.regioes,
      regioesOutras: regiao.outras,
      horarioEscala: texto(dto.horarioEscala),
      modeloTrabalho: dto.modeloTrabalho ?? null,
      // O detalhe do híbrido só existe no híbrido: guardá-lo depois de a pessoa trocar o modelo
      // deixaria na vaga uma frase que a tela nem mostra mais.
      detalheHibrido: dto.modeloTrabalho === "HIBRIDO" ? texto(dto.detalheHibrido) : null,
      confidencial: dto.confidencial ?? false,
      divulgarEmpresa: dto.divulgarEmpresa ?? true,

      faixaEtaria: texto(dto.faixaEtaria),
      genero: dto.genero ?? "INDIFERENTE",
      idiomas: dto.idiomas?.length ? dto.idiomas : null,
      // O escape só sobrevive se "Outros" estiver marcado: guardar o texto de um escape que a pessoa
      // desmarcou deixaria na vaga um idioma que a tela não mostra mais.
      idiomasOutros: dto.idiomas?.includes(OPCAO_OUTROS) ? texto(dto.idiomasOutros) : null,
      cursosConhecimentos: texto(dto.cursosConhecimentos),
      testes: dto.testes?.length ? dto.testes : null,
      testesOutro: texto(dto.testesOutro),
      experiencia: texto(dto.experiencia),
      atribuicoes: texto(dto.atribuicoes),
      perfilComportamental: texto(dto.perfilComportamental),
      ambiente: texto(dto.ambiente),
      etapasPs: dto.etapasPs?.length ? dto.etapasPs : null,
      etapasPsOutra: dto.etapasPs?.includes(OPCAO_OUTRA) ? texto(dto.etapasPsOutra) : null,
      observacoes: texto(dto.observacoes),
    };
  }

  /**
   * A RÉGUA DOS OBRIGATÓRIOS, COBRADA SÓ NO PUBLICAR (itens 2 a 4 da OST de 25/08).
   *
   * A MESMA FUNÇÃO QUE A TELA USA (`vagaPendencias`, no shared-types). Duas cópias da régua acabariam
   * em "a tela deixou publicar e o servidor recusou", que é o pior dos dois mundos: o trabalho já
   * feito e a mensagem chegando do lado errado.
   *
   * A MENSAGEM LISTA TUDO DE UMA VEZ, com o passo e o nome do campo, porque quem preenche 38 campos
   * não pode descobrir as pendências uma por uma. A tela já barra antes de chegar aqui; esta trava é
   * para o corpo montado fora dela, e é a autoridade.
   */
  private travaObrigatorios(campos: VagaCamposObrigatorios, status: VagaStatus): void {
    if (status === "RASCUNHO") return;
    const pendencias = vagaPendencias(campos);
    if (pendencias.length === 0) return;

    throw new BadRequestException(
      "A vaga não pode ser publicada com campo obrigatório em branco. " +
        pendencias.map(textoPendencia).join("; ") +
        ". Salve como rascunho ou preencha o que falta.",
    );
  }

  /**
   * OS DOIS LADOS DA VAGA a partir de quem a abriu, com a régua do domínio.
   *
   * O PAPEL É LIDO DO BANCO na hora, e não do token, pela mesma razão do `contextoAs`: quem trocou de
   * lado hoje de manhã abre a vaga da tarde já do lado certo.
   */
  private async ladosDeQuemAbre(
    abertoPorId: string | null,
    contraparteId: string | null | undefined,
  ): Promise<{ consultorId: string | null; recruiterId: string | null }> {
    if (!abertoPorId) return { consultorId: null, recruiterId: null };
    const eu = await this.db.query.usuarios.findFirst({ where: eq(usuarios.id, abertoPorId) });
    if (!eu?.papelAs) {
      throw new BadRequestException(
        "Seu usuário ainda não tem papel de A&S (Consultor ou Recruiter). Peça ao administrador para definir o papel antes de abrir uma vaga.",
      );
    }
    return ladosDaVaga(eu.papelAs, abertoPorId, contraparteId);
  }

  /** A vaga recém-escrita, relida pela listagem, que é a forma que a tela conhece. */
  private async devolverVaga(id: string, seSumir: string): Promise<VagaListItem> {
    const vaga = (await this.list()).find((v) => v.id === id);
    if (!vaga) throw new BadRequestException(seSumir);
    return vaga;
  }

  /**
   * EDITAR SÓ OS DOIS CONTADORES (decisão do diretor, 25/08: "continuam editáveis depois").
   *
   * CAMINHO ESTREITO DE PROPÓSITO. A vaga publicada continua NÃO voltando para a trilha de abertura,
   * como estava decidido: esta rota escreve DUAS colunas e mais nenhuma. Foi assim para atender o
   * "editáveis depois" sem transformar a vaga publicada numa linha de tabela editável, que é outra
   * decisão e não foi pedida (§A.14/§A.26).
   *
   * VAGA ENCERRADA NÃO ENTRA. Depois do fechamento a meta já foi confrontada com a contagem, e mexer
   * nela ali reescreveria a história do processo: uma vaga que fechou 3 de 3 viraria "3 de 1" com uma
   * edição, e o indicador de entrega passaria a mentir sobre um processo terminado.
   *
   * A RÉGUA DOS DOIS LADOS VALE AQUI TAMBÉM, e não é redundância: baixar a meta abaixo do que já foi
   * ENTREGUE é a mesma inconsistência que a trava do fechamento existe para impedir, chegando pela
   * outra ponta.
   *
   * ┌─ `excessoDePosicoes` NÃO PERDEU A RAZÃO DE EXISTIR: ELE MUDOU DE DONO E DE INSUMO ─────────┐
   * │ Ele era chamado em DOIS lugares. No `fechar()`, comparando a meta com o número DIGITADO, e  │
   * │ lá ele morreu junto com o número digitado. AQUI ele fica, e a pergunta continua precisando  │
   * │ de resposta: "dá para reduzir a meta para 2 se 3 posições já foram ENTREGUES?". O que muda  │
   * │ é de onde vem a contagem: era `vagas_fechadas` (o carimbo do fechamento, que numa vaga      │
   * │ ainda VIVA é sempre nulo, e portanto nunca acusava nada), passa a ser a OCUPAÇÃO DERIVADA.  │
   * │ Com o insumo antigo esta trava não protegia coisa alguma na vaga aberta, que é a única que  │
   * │ chega aqui.                                                                                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async editarPosicoes(
    id: string,
    dto: EditarPosicoesVagaDto,
    autorId: string,
  ): Promise<VagaListItem> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, id) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    if (vaga.status === "FECHADA" || vaga.status === "ENTREGUE" || vaga.status === "CANCELADA") {
      throw new ConflictException(
        "Esta vaga já foi encerrada: as posições não mudam depois do fechamento. Recarregue a página.",
      );
    }

    // A ENTREGA REAL DA VAGA, pela mesma consulta agregada e pela mesma régua do domínio que a
    // listagem usa. Uma contagem própria aqui seria mais uma cópia da régua de posição.
    const ocupacao =
      (await this.ocupacaoPorVaga([{ id, posicoesOficiais: vaga.posicoesOficiais }])).get(id) ??
      this.ocupacaoVazia(id, vaga.posicoesOficiais);

    const excesso = excessoDePosicoes(
      {
        vagasFechadas: ocupacao.finalizadasOficial,
        vagasFechadasBanco: ocupacao.finalizadasBanco,
      },
      { posicoesOficiais: dto.posicoesOficiais, posicoesBanco: dto.posicoesBanco },
    );
    if (excesso) throw new BadRequestException(this.mensagemDeExcesso(excesso));

    /*
     * O RASTRO É DECIDIDO ANTES DA ESCRITA, porque depois dela o número ANTERIOR não existe mais em
     * lugar nenhum: quem grava primeiro e pergunta depois não tem mais como responder "de quanto
     * para quanto".
     */
    const reducao = this.reducaoDeMeta(vaga, dto);

    /*
     * ┌─ A MESMA TRANSAÇÃO, e é isto que faz o rastro ser rastro ─────────────────────────────────┐
     * │ Rastro que pode FALTAR quando a escrita deu certo não é rastro: seria exatamente o estado  │
     * │ que esta frente existe para eliminar, a meta menor sem ninguém para responder por ela. Um  │
     * │ `update` e um `insert` soltos admitem a queda entre os dois; dentro da transação, ou as    │
     * │ duas coisas acontecem, ou nenhuma acontece.                                                │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    await this.db.transaction(async (tx) => {
      await tx
        .update(vagas)
        .set({
          posicoesOficiais: dto.posicoesOficiais,
          posicoesBanco: dto.posicoesBanco,
          atualizadoEm: new Date(),
        })
        .where(eq(vagas.id, id));

      if (reducao) {
        await tx.insert(vagaMetaReducoes).values({
          vagaId: id,
          deOficiais: reducao.deOficiais,
          paraOficiais: reducao.paraOficiais,
          deBanco: reducao.deBanco,
          paraBanco: reducao.paraBanco,
          porId: autorId,
        });
      }
    });

    return this.devolverVaga(id, "Posições salvas, mas a vaga não foi encontrada na listagem.");
  }

  /**
   * ─ HOUVE REDUÇÃO? A pergunta que decide se nasce uma linha de rastro ──────────────────────────
   *
   * SÓ A REDUÇÃO É REGISTRADA (decisão do diretor). AUMENTAR a meta não contorna gate nenhum: ele
   * AFASTA o fechamento em vez de aproximá-lo, e registrar aumento encheria a trilha de ruído
   * justamente no caso inofensivo. Salvar o mesmo par de números também não é evento: é a tela
   * mandando de volta o que já estava lá.
   *
   * QUALQUER UM DOS DOIS LADOS gera a linha, e a linha carrega OS DOIS, porque o gesto é uma
   * requisição só. Quem baixou apenas o banco sai com `deOficiais === paraOficiais`, e é assim que
   * a tela lê "esta redução não mexeu no oficial".
   *
   * META QUE NÃO EXISTIA NÃO FOI REDUZIDA. Com `posicoesOficiais` nula (rascunho sem meta), passar a
   * ter meta é DEFINIR, não baixar, e por isso o lado oficial não dispara nada sozinho. Se o gesto
   * reduzir o BANCO na mesma requisição, a linha nasce por causa do banco e o `deOficiais` vai NULO
   * para o banco de dados, que é a verdade do que havia antes.
   *
   * ┌─ AS DUAS PORTAS QUE ESCREVEM A META USAM ESTA MESMA PERGUNTA (conserto de 09/09) ──────────┐
   * │ ELA NASCEU PARA A ROTA DAS POSIÇÕES e agora atende também a CONTINUAÇÃO DO RASCUNHO, que   │
   * │ era o escritor esquecido e por onde o desvio do gate continuava inteiro. Por isso o segundo │
   * │ parâmetro deixou de ser o DTO daquela rota e passou a ser o PAR DE NÚMEROS: uma segunda     │
   * │ cópia desta régua divergiria da primeira na correção seguinte, que é o defeito que este     │
   * │ módulo já pagou várias vezes.                                                              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private reducaoDeMeta(
    antes: { posicoesOficiais: number | null; posicoesBanco: number },
    depois: { posicoesOficiais: number | null; posicoesBanco: number },
  ): {
    deOficiais: number | null;
    paraOficiais: number;
    deBanco: number;
    paraBanco: number;
  } | null {
    const oficialCaiu =
      antes.posicoesOficiais !== null &&
      depois.posicoesOficiais !== null &&
      depois.posicoesOficiais < antes.posicoesOficiais;
    const bancoCaiu = depois.posicoesBanco < antes.posicoesBanco;
    if (!oficialCaiu && !bancoCaiu) return null;

    /**
     * SEM META OFICIAL DEPOIS, NÃO HÁ LINHA A ESCREVER, e este caso é ESTREITO e sem gate a
     * contornar: chegar aqui exige a vaga NÃO TER meta oficial nem antes nem depois (a rota das
     * posições exige o número, e a trilha PRESERVA o que existia, ver `metaOficialDaTrilha`), então
     * o lado oficial não caiu, o que caiu foi o BANCO, e o banco não segura fechamento nenhum
     * (`travaPosicoesOficiais` só olha o oficial). A linha não é omitida por escolha: `para_oficiais`
     * é NOT NULL e `> 0` na tabela, e inventar um zero descreveria um estado que a vaga nunca teve.
     */
    if (depois.posicoesOficiais === null) return null;

    return {
      deOficiais: antes.posicoesOficiais,
      paraOficiais: depois.posicoesOficiais,
      deBanco: antes.posicoesBanco,
      paraBanco: depois.posicoesBanco,
    };
  }

  /**
   * A FRASE DO EXCESSO, e ela MUDOU DE ASSUNTO junto com o insumo.
   *
   * ANTES ELA FALAVA DE "VAGAS FECHADAS", o número digitado no formulário de fechamento. Esse número
   * deixou de existir como decisão, então a frase que mandava corrigi-lo mandaria a pessoa mexer num
   * campo que a tela não tem mais. Agora ela fala do que de fato aconteceu: a vaga já ENTREGOU tantas
   * posições, e a meta não pode ficar abaixo disso.
   *
   * O QUE FAZER VEM JUNTO. Quem lê está com o formulário aberto e precisa saber qual número serve, e
   * não só que o dele não serve.
   */
  private mensagemDeExcesso(excesso: ExcessoDePosicoes): string {
    const entregues =
      excesso.lado === "OFICIAIS"
        ? `${excesso.informado} ${excesso.informado === 1 ? "posição oficial" : "posições oficiais"}`
        : `${excesso.informado} ${excesso.informado === 1 ? "posição de banco" : "posições de banco"}`;
    const lado = excesso.lado === "OFICIAIS" ? "oficial" : "de banco";
    return (
      `Esta vaga já entregou ${entregues}: a meta ${lado} não pode ficar abaixo do que já foi ` +
      `preenchido. Informe ${excesso.informado} ou mais.`
    );
  }

  /**
   * ─ FECHAR A VAGA: QUEM DIZ QUE ELA ENTREGOU SÃO AS CANDIDATURAS, NÃO O FORMULÁRIO ─────────────
   *
   * A RÉGUA É DO DIRETOR: a vaga só fecha quando TODAS as posições OFICIAIS estão preenchidas. O
   * contador de BANCO não participa do gate, e essa exclusão é o coração da regra: reserva não é
   * entrega, então vinte pessoas no banco não ajudam a fechar uma vaga com cinco oficiais vazias.
   *
   * QUEM CONTA É A DERIVADA (`ocupacao.finalizadasOficial`), a MESMA leitura que enche o cilindro da
   * tela. É por isso que a tela e a trava não têm como discordar: elas não são duas contas, são a
   * mesma conta lida duas vezes. O número DIGITADO no formulário deixou de decidir qualquer coisa.
   *
   * AS TRÊS TRAVAS, NESTA ORDEM, e as três são independentes:
   *   VAGA ABERTA: a vaga só fecha uma vez.
   *   TRAVA 5: TODO CANDIDATO TRATADO. Bloqueio DURO, sem forçar, nem para Master: fechar deixando
   *     alguém pendurado no funil é autorizar o silêncio com uma pessoa que foi entrevistada.
   *   TRAVA 6: A VAGA ENTREGOU O QUE PROMETEU. Bloqueio COM aceite de Master, porque acontece de o
   *     cliente desistir de duas das cinco posições e a vaga precisar encerrar mesmo assim.
   * A 5 VEM PRIMEIRO porque ela fala do PROCESSO (tem gente esperando resposta) e a 6 fala dos
   * NÚMEROS. E limpar a 5 NÃO ajuda a passar na 6: descartar quem sobrou não entrega posição nenhuma.
   *
   * ┌─ POR QUE ISTO VIROU UMA TRANSAÇÃO COM `SELECT ... FOR UPDATE` NA LINHA DA VAGA ────────────┐
   * │ ENQUANTO O NÚMERO VINHA DIGITADO NÃO HAVIA CORRIDA A PERDER: o formulário trazia a resposta │
   * │ pronta. Decidindo por CONTAGEM DE CANDIDATURAS, há: um consultor finaliza a última posição  │
   * │ no exato instante em que outro fecha a vaga, e o fechamento decide sobre uma fotografia     │
   * │ velha. Uma consulta solta antes do update responde sobre o PASSADO.                        │
   * │                                                                                            │
   * │ A ORDEM É A MESMA DA APROVAÇÃO (`candidatos.service.mudarSituacaoOcupandoPosicao`): abre a  │
   * │ transação, TRAVA A LINHA DA VAGA, só então conta, decide e grava. A VAGA É O RECURSO        │
   * │ DISPUTADO NOS DOIS CAMINHOS, então é a linha dela que serializa a disputa e os dois locks   │
   * │ SE ENXERGAM: a finalização que chegar no meio de um fechamento espera, e quando ela contar, │
   * │ contará com a vaga já encerrada, caindo na trava de status.                                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * UMA LEITURA SÓ SERVE AS DUAS TRAVAS. As candidaturas da vaga são lidas UMA VEZ, sob o lock, e a
   * mesma lista responde "sobrou alguém sem decisão?" (trava 5) e "quantas posições foram
   * entregues?" (trava 6). Duas consultas responderiam sobre dois instantes.
   *
   * `enviarParaAdmissao` REGISTRA A INTENÇÃO e não liga nada: a ponte com a esteira é frente
   * separada. Nenhuma admissão, frente ou documento nasce daqui.
   */
  async fechar(id: string, dto: FecharVagaDto, user: AuthUser): Promise<VagaListItem> {
    // LIDO ANTES DE ABRIR A TRANSAÇÃO: é catálogo de 5 a 10 linhas, servido de cache, e não tem
    // nada a ver com a linha travada da vaga. Buscá-lo lá dentro só alongaria o tempo com a trava
    // segurada, sem nenhuma garantia a mais.
    const ordemDoFunil = await this.etapas.ordemPorCodigo();

    await this.db.transaction(async (tx) => {
      // ── A LINHA DA VAGA É TRAVADA ANTES DE QUALQUER CONTAGEM. Daqui até o fim da transação,
      // nenhuma finalização de posição nesta mesma vaga passa deste ponto.
      const [vaga] = await tx
        .select({
          id: vagas.id,
          status: vagas.status,
          posicoesOficiais: vagas.posicoesOficiais,
        })
        .from(vagas)
        .where(eq(vagas.id, id))
        .for("update");
      if (!vaga) throw new BadRequestException("Vaga não encontrada.");
      if (vaga.status !== "ABERTA") {
        throw new ConflictException("Esta vaga já foi fechada. Recarregue a página.");
      }

      const linhas = await this.candidaturasDaVaga(tx, id);

      // TRAVA 5: candidato ainda EM SELEÇÃO segura o fechamento, e ninguém força esta.
      this.travaCandidatosPendentes(linhas, ordemDoFunil);

      /*
       * A OCUPAÇÃO DERIVADA, pela régua do domínio e sobre a MESMA lista já lida. Somar "quem
       * entregou posição" aqui seria mais uma cópia da régua que o módulo passou uma frente inteira
       * eliminando, e é essa cópia que faz a tela e a trava darem números diferentes em silêncio.
       */
      const ocupacao = ocupacaoDaVaga(vaga.posicoesOficiais, linhas);

      // TRAVA 6: a vaga entregou as posições OFICIAIS? Devolve o que gravar quando um Master forçou.
      const forcado = this.travaPosicoesOficiais(vaga.posicoesOficiais, ocupacao, dto, user);

      await tx
        .update(vagas)
        .set({
          dataFechamento: dto.dataFechamento,
          /**
           * OS DOIS CONTADORES VIRAM CARIMBO DA DERIVADA, e não morrem: o que morreu foi o número
           * DIGITADO. Eles gravam `finalizadasOficial` e `finalizadasBanco` do instante do
           * fechamento, e é o que a tela lê na vaga ENCERRADA (a derivada dela pode mudar depois, e
           * o histórico de uma vaga terminada não pode).
           *
           * NÃO É UM CONTADOR DUPLICADO NO SENTIDO QUE O MÓDULO RECUSA: enquanto a vaga está VIVA
           * ninguém escreve aqui e a tela lê a derivada. O carimbo nasce no gesto que encerra o
           * processo, pela mesma razão do `faltavam` do forçado: é a fotografia de um fato.
           */
          vagasFechadas: ocupacao.finalizadasOficial,
          vagasFechadasBanco: ocupacao.finalizadasBanco,
          salarioFechamento: dto.salarioFechamento ?? null,
          dataPrevistaInicio: data(dto.dataPrevistaInicio),
          enviarParaAdmissao: dto.enviarParaAdmissao ?? false,
          /**
           * ENTREGUE quando ALGUMA posição foi preenchida, dos dois lados. O lado do banco entra na
           * conta porque ele é posição preenchida de verdade, e chamar de FECHADA uma vaga que
           * entregou três pessoas para o banco apagaria justamente o indicador de sucesso que o
           * vocabulário de status preserva de propósito.
           *
           * O QUE MUDOU AQUI É A FONTE, NÃO A REGRA: antes a pergunta era feita ao número digitado,
           * agora é feita à contagem das candidaturas. Uma vaga que entregou de fato continua saindo
           * ENTREGUE; a que fecha sem ninguém dentro continua saindo FECHADA.
           */
          status: ocupacao.finalizadas > 0 ? "ENTREGUE" : "FECHADA",
          /**
           * A TRILHA DO FORÇADO, escrita na MESMA gravação que encerra a vaga: um `update` só, então
           * não existe o estado de vaga fechada à força sem trilha.
           */
          ...(forcado
            ? {
                fechamentoForcadoPorId: user.id,
                fechamentoForcadoEm: new Date(),
                fechamentoForcadoFaltavam: forcado.faltavam,
              }
            : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(vagas.id, id));
    });

    return this.devolverVaga(id, "Vaga fechada, mas não encontrada na listagem.");
  }

  /**
   * ─ A TRAVA 6: A VAGA SÓ FECHA QUANDO ENTREGOU AS POSIÇÕES OFICIAIS ────────────────────────────
   *
   * O BANCO NÃO ENTRA NA CONTA, e é o ponto que mais se erra: uma vaga de 5 oficiais com 20 pessoas
   * entregues ao banco continua devendo as 5. Reserva não é entrega, e somar os dois lados aqui
   * deixaria fechar uma vaga que não contratou ninguém.
   *
   * ┌─ A AUTORIZAÇÃO MORA AQUI, E NUNCA EM `@Roles` NA ROTA ─────────────────────────────────────┐
   * │ TODO CONSULTOR PRECISA PODER FECHAR UMA VAGA COMPLETA. Só o FORÇAR é de Master, então um    │
   * │ `@Roles("MASTER","SUPER_ADMIN")` no handler barraria o fechamento NORMAL do COMUM, que é    │
   * │ regressão silenciosa: a vaga que entregou tudo deixaria de fechar para quem a operou.       │
   * │                                                                                            │
   * │ O PADRÃO É O DA LIBERAÇÃO DE APTO SEM ASO (`esteira.service.ts`), idêntico em forma: o      │
   * │ COMUM leva trava dura SEM opção de forçar, o MASTER confirma e a exceção fica registrada em │
   * │ NOME DELE. A tela esconder o botão é conveniência; o guard é a autoridade.                  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * META NULA NÃO TEM TETO A COBRAR: ausência de meta não é meta zero, e recusar o fechamento por
   * causa dela inventaria uma trava que ninguém configurou. Vaga em rascunho nem chega aqui (só a
   * ABERTA passa), mas a coluna é nulável e o tipo é honesto sobre isso.
   *
   * Devolve `null` quando não houve exceção, ou o que gravar na trilha quando houve.
   */
  private travaPosicoesOficiais(
    meta: number | null,
    ocupacao: { finalizadasOficial: number },
    dto: FecharVagaDto,
    user: AuthUser,
  ): { faltavam: number } | null {
    if (meta === null || meta === undefined) return null;

    const faltam = meta - ocupacao.finalizadasOficial;
    if (faltam <= 0) return null;

    // O PAPEL É RESOLVIDO NO SERVIDOR, e volta no corpo da recusa só para a tela não oferecer ao
    // COMUM um botão que vai receber 403. Quem decide continua sendo esta função.
    const podeForcar = user.papel === "MASTER" || user.papel === "SUPER_ADMIN";

    if (!dto.forcar) {
      /**
       * A RECUSA É ESTRUTURADA, e não uma frase: a tela precisa dizer "3 de 5" e oferecer o
       * forçamento a quem pode, sem recontar nada e sem casar por texto de mensagem (é para isso
       * que `motivo` existe).
       *
       * A `message` VIAJA JUNTO porque a mensagem de erro do sistema vem do backend, sempre: sem
       * ela, qualquer caminho que caia no tratamento genérico mostraria "Conflict" ao consultor.
       */
      const corpo: FecharVagaRecusa & { message: string } = {
        motivo: "POSICOES_OFICIAIS_ABERTAS",
        faltam,
        posicoesOficiais: meta,
        finalizadasOficial: ocupacao.finalizadasOficial,
        podeForcar,
        message:
          faltam === 1
            ? `Esta vaga tem ${meta} ${meta === 1 ? "posição oficial" : "posições oficiais"} e 1 ainda não foi preenchida. Finalize a posição que falta, ou peça a um Master para encerrar assim mesmo.`
            : `Esta vaga tem ${meta} posições oficiais e ${faltam} ainda não foram preenchidas. Finalize as posições que faltam, ou peça a um Master para encerrar assim mesmo.`,
      };
      throw new ConflictException(corpo);
    }

    if (!podeForcar) {
      throw new ForbiddenException(
        "Encerrar a vaga com posição oficial em aberto é ação de Master. Finalize as posições que faltam, ou peça a um Master para encerrar assim mesmo.",
      );
    }

    return { faltavam: faltam };
  }

  /**
   * AS CANDIDATURAS DA VAGA, LIDAS UMA VEZ SÓ, e as duas travas do fechamento bebem daqui.
   *
   * O LADO DA POSIÇÃO VEM JUNTO porque a ocupação derivada separa OFICIAL de BANCO, e é essa
   * separação que impede vinte pessoas na reserva de fecharem uma vaga com as oficiais vazias.
   *
   * LIDA COM O EXECUTOR DA TRANSAÇÃO (o `tx`), e não com `this.db`: uma leitura por fora do lock
   * responderia sobre um instante anterior ao da decisão, que é exatamente o defeito que o
   * `FOR UPDATE` existe para fechar.
   *
   * §A.6: sai o id da candidatura, o id e o NOME do candidato, a etapa, a situação e o lado. Sem
   * CPF, sem contato, e a consulta não chega a SELECIONAR o CPF, mesmo tendo a tabela no join.
   */
  private async candidaturasDaVaga(
    tx: DbTransaction,
    vagaId: string,
  ): Promise<LinhaDeCandidatura[]> {
    return tx
      .select({
        candidaturaId: asCandidaturas.id,
        candidatoId: asCandidaturas.candidatoId,
        candidatoNome: asCandidatos.nome,
        etapa: asCandidaturas.etapa,
        situacao: asCandidaturas.situacao,
        posicaoLado: asCandidaturas.posicaoLado,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(eq(asCandidaturas.vagaId, vagaId))
      .orderBy(asc(asCandidatos.nome));
  }

  /**
   * A TRAVA 5: A VAGA SÓ ENCERRA COM TODOS OS CANDIDATOS TRATADOS (ajuste do diretor).
   *
   * TRATADO É TER RECEBIDO UMA DECISÃO: `APROVADO`, `ENVIADO_PARA_ADMISSAO`, `DESCARTADO` ou `DESISTIU`. SÓ
   * `ATIVO` é pendente. A régua é do domínio (`pendentesDeTratamento`, em `domain/candidatura`), e
   * NÃO é reescrita aqui: uma segunda lista de situações neste arquivo divergiria da primeira no dia
   * em que o vocabulário mudasse.
   *
   * O QUE ELA IMPEDE: a vaga fechar deixando gente PENDURADA no funil, sem ninguém nunca ter dito o
   * que aconteceu com ela. Quem foi entrevistado e nunca soube do resultado some junto com a vaga.
   *
   * POR QUE A RECUSA DEVOLVE A LISTA, e não só a frase: para a tela abrir o modal e o consultor
   * tratar cada pendente ALI MESMO. Só com "há 3 candidatos pendentes", a tela teria de mandar a
   * pessoa procurar quem são, em outra tela, e voltar. O corpo estruturado é o mesmo espírito do
   * `needsConfirmation` da Esteira, com `needsConfirmation: false`: aqui NÃO existe "confirmar mesmo
   * assim", porque não é aceite de pendência, é bloqueio.
   *
   * ORDEM DA LISTA: pela etapa do funil, do fim para o começo. Quem está na Aprovação é o mais caro
   * de esquecer e é o primeiro que o consultor precisa decidir; quem está na Captação é o descarte
   * em massa que ele faz por último.
   *
   * ELA DEIXOU DE FAZER A PRÓPRIA CONSULTA e passou a RECEBER as linhas, e a mudança não é de
   * estilo: a leitura agora acontece DENTRO da transação do fechamento, sob a linha da vaga travada,
   * e serve também a trava 6. Duas consultas responderiam sobre dois instantes diferentes, e a
   * segunda delas sobre um instante anterior ao da decisão. A régua da trava não mudou uma vírgula.
   *
   * §A.6: sai o id da candidatura, o id e o NOME do candidato e a etapa. Sem CPF, sem contato, sem
   * identificador direto, e a consulta não chega a SELECIONAR o CPF, mesmo tendo a tabela no join.
   */
  private travaCandidatosPendentes(
    linhas: LinhaDeCandidatura[],
    ordemDoFunil: ReadonlyMap<string, number>,
  ): void {
    const pendentes = pendentesDeTratamento(linhas);
    if (pendentes.length === 0) return;

    /*
     * DO FIM DO FUNIL PARA O COMEÇO, e a ordem agora vem do CATÁLOGO (`posicaoNoFunil`, no domínio),
     * não de um `indexOf` sobre lista de código. O mapa inclui as etapas INATIVAS de propósito: quem
     * ficou parado numa etapa que saiu de circulação precisa de uma posição na fila, não de um
     * buraco, e `indexOf` daria `-1` a ele, jogando-o para ANTES da Captação.
     */
    const ordenados = [...pendentes].sort(
      (a, b) => posicaoNoFunil(b.etapa, ordemDoFunil) - posicaoNoFunil(a.etapa, ordemDoFunil),
    );

    const corpo: AsVagaFechamentoBloqueado = {
      needsConfirmation: false,
      reason: "candidatosPendentes",
      message:
        pendentes.length === 1
          ? "Esta vaga ainda tem 1 candidato em seleção. Trate esse candidato (aprovar, contratar, descartar ou registrar desistência) antes de encerrar a vaga."
          : `Esta vaga ainda tem ${pendentes.length} candidatos em seleção. Trate cada um (aprovar, contratar, descartar ou registrar desistência) antes de encerrar a vaga.`,
      pendentes: ordenados.map((p) => ({
        candidaturaId: p.candidaturaId,
        candidatoId: p.candidatoId,
        candidatoNome: p.candidatoNome,
        etapa: p.etapa,
      })),
    };
    throw new ConflictException(corpo);
  }

  /**
   * A TRAVA DE DUPLICIDADE, no único lugar em que ela existe.
   *
   * Lê só os códigos iguais ao digitado, não a tabela inteira: é a informação mínima que a régua
   * precisa, e mantém a checagem barata mesmo com a base importada dentro.
   */
  private async travaDuplicidadeDeCodigo(
    codigo: string | null,
    ignorarVagaId: string | null,
  ): Promise<void> {
    // SEM CÓDIGO NÃO HÁ DUPLICIDADE. O rascunho pode ainda não ter número, e cobrar unicidade de uma
    // ausência barraria todos os rascunhos sem código a partir do segundo.
    if (!codigo) return;

    const existentes = await this.db
      .select({ codigo: vagas.codigo })
      .from(vagas)
      .where(
        // A PRÓPRIA VAGA FICA DE FORA quando o rascunho é salvo de novo: sem isto, o segundo
        // "Salvar Rascunho" acusaria o código do próprio rascunho como duplicado dele mesmo.
        ignorarVagaId
          ? and(eq(vagas.codigo, codigo), ne(vagas.id, ignorarVagaId))
          : eq(vagas.codigo, codigo),
      );

    if (
      !codigoJaUsado(
        codigo,
        existentes.map((e) => e.codigo ?? ""),
      )
    ) {
      return;
    }

    throw new ConflictException(
      `O código ${codigo} já está em uso por outra vaga. Cada processo seletivo tem um código ` +
        `próprio: confira o número no Pandapé.`,
    );
  }

  /**
   * A RÉGUA DA REGIÃO (item 7): a região marcada tem de pertencer ao ESTADO escolhido.
   *
   * POR QUE NO SERVICE, e não só no DTO: a lista de regiões válidas MUDA conforme a UF, e um `@IsIn`
   * só sabe conferir contra uma lista fixa. Com a união dos 27 estados, "Zona Leste" passaria numa
   * vaga do Ceará. Aqui a UF é lida primeiro e a conferência é feita contra as regiões dela.
   *
   * SEM UF, NÃO HÁ REGIÃO. A tela encadeia (a segunda lista nasce fechada), e o backend fecha a
   * mesma porta: região marcada sem estado escolhido é corpo montado fora da tela, e é barrado em
   * vez de gravar uma lista de regiões que ninguém sabe de onde são.
   */
  private validaRegioes(
    uf: string | null | undefined,
    regioes: string[] | null | undefined,
    outras: string | null | undefined,
  ): { uf: string | null; regioes: string[] | null; outras: string | null } {
    const estado = uf?.trim() || null;
    const marcadas = (regioes ?? []).map((r) => r.trim()).filter(Boolean);

    if (!estado) {
      if (marcadas.length > 0) {
        throw new BadRequestException(
          "Escolha o estado antes de marcar as regiões de abordagem.",
        );
      }
      return { uf: null, regioes: null, outras: null };
    }

    const forasteira = marcadas.find((r) => !regiaoPertenceAUf(estado, r));
    if (forasteira) {
      throw new BadRequestException(
        `A região "${forasteira}" não pertence a ${nomeDaUf(estado)}. Recarregue a página e escolha de novo.`,
      );
    }

    return {
      uf: estado,
      regioes: marcadas.length > 0 ? marcadas : null,
      // O escape só sobrevive com "Outras" marcada, pela mesma razão de idiomas e etapas: texto de
      // um escape desmarcado é região que a tela não mostra mais e o banco continua guardando.
      outras: marcadas.includes(REGIAO_OUTRAS) ? texto(outras) : null,
    };
  }

  /**
   * O CPF DO SUBSTITUÍDO (item 3): existe, é validado e PERSISTE.
   *
   * VALIDAR O DÍGITO é o que separa "o time do ADM tem o número" de "o time do ADM tem onze dígitos
   * quaisquer". Um CPF errado só aparece no dia do eSocial, tarde demais para corrigir na origem.
   *
   * `parcial` é o RASCUNHO: o número entra como está, sem conferência de dígito, porque o rascunho
   * guarda o que houver. Ele continua limitado aos 11 dígitos da coluna, então um campo digitado pela
   * metade não vira lixo de tamanho arbitrário no banco. A conferência volta a valer na publicação.
   *
   * §A.6: a mensagem de erro NÃO REPETE O NÚMERO. Ela diz que o CPF não confere e para por aí, senão
   * o dado pessoal viajaria na resposta de erro e, dali, para qualquer log de cliente HTTP.
   */
  private validaCpfSubstituido(bruto: string | null | undefined, parcial = false): string | null {
    const digitos = bruto ? normalizeCpf(bruto) : "";
    if (!digitos) return null;
    if (parcial) return digitos.slice(0, 11);
    if (!isValidCpf(digitos)) {
      throw new BadRequestException(
        "O CPF do substituído não confere. Confira os dígitos e informe de novo.",
      );
    }
    return digitos;
  }

  /**
   * Confere que todo benefício marcado existe e está ATIVO no catálogo, antes de gravar.
   *
   * A FK já garantiria a existência, mas o erro dela chega como violação de constraint, que a tela
   * não sabe explicar. Aqui a resposta é 400 com o motivo, e o benefício inativo (que a FK aceitaria)
   * também é barrado.
   */
  private async validaBeneficios(
    itens: { beneficioId: string; valor?: string }[],
  ): Promise<{ beneficioId: string; valor: string | null }[]> {
    const porId = new Map<string, string | null>();
    for (const i of itens) porId.set(i.beneficioId, i.valor ?? null);
    if (porId.size === 0) return [];

    const ids = [...porId.keys()];
    const achados = await this.db
      .select({ id: beneficiosCatalogo.id })
      .from(beneficiosCatalogo)
      .where(and(inArray(beneficiosCatalogo.id, ids), eq(beneficiosCatalogo.ativo, true)));

    if (achados.length !== ids.length) {
      throw new BadRequestException(
        "Benefício não encontrado no cadastro de benefícios. Recarregue a página e tente de novo.",
      );
    }
    return ids.map((beneficioId) => ({ beneficioId, valor: porId.get(beneficioId) ?? null }));
  }

  /**
   * Benefícios das vagas listadas, em UMA consulta só (nada de uma consulta por linha).
   *
   * INNER JOIN no catálogo porque o nome do benefício mora lá: a vaga guarda o vínculo e o valor, e é
   * o catálogo que responde como ele se chama hoje.
   */
  /**
   * ─ A OCUPAÇÃO DERIVADA DE TODAS AS VAGAS DA LISTAGEM, EM UMA CONSULTA SÓ ──────────────────────
   *
   * UMA CONSULTA AGREGADA, E NUNCA UMA POR VAGA. O painel responde por UMA vaga e pode se dar ao
   * luxo de ler as candidaturas dela; a listagem traz a tabela inteira (`list()` não pagina), então
   * uma consulta por linha viraria centenas de idas ao banco na tela mais pesada do módulo. É o
   * mesmo motivo, e o mesmo formato, de `beneficiosPorVaga` logo abaixo: agrupa no banco, monta o
   * `Map` no Node. O índice `idx_as_candidaturas_vaga_situacao` serve exatamente esta consulta.
   *
   * O `group by (vaga, situação, LADO)` DEVOLVE CONTAGENS, E A RÉGUA CONTINUA SENDO A DO DOMÍNIO. As
   * contagens são expandidas de volta em uma lista de candidaturas e entregues a `ocupacaoDaVaga`,
   * em vez de a consulta somar "quem consome posição" no SQL. Somar no SQL seria reescrever a régua
   * pela sexta vez, e é exatamente a cópia que o módulo passou a frente inteira eliminando: no dia
   * em que uma situação nova entrar, a tela e a trava passariam a dar números diferentes em
   * silêncio. Uma lista só, e a listagem lê dela.
   *
   * ┌─ O LADO ENTROU NO AGRUPAMENTO, E A CONSULTA CONTINUA SENDO UMA SÓ ─────────────────────────┐
   * │ A separação da entrega em OFICIAL e BANCO não custou uma consulta a mais nem uma consulta   │
   * │ por vaga: `posicao_lado` é mais uma coluna do MESMO `group by`. O que muda é o número de    │
   * │ linhas devolvidas (no máximo o dobro, e só nas vagas que de fato usam o banco), não o       │
   * │ número de idas ao banco, que continua em três para a página inteira.                        │
   * │                                                                                            │
   * │ O NULO NÃO É TRATADO AQUI: quem dobra `NULL` em OFICIAL é `ladoDaCandidatura`, dentro do    │
   * │ domínio, e é por isso que a consulta não escreve um `coalesce`. Um `coalesce` em SQL seria  │
   * │ a régua do lado copiada para fora do domínio, no mesmo arquivo em que o comentário acima    │
   * │ explica por que isso já custou caro cinco vezes.                                            │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: só `vaga_id`, `situacao`, `posicao_lado` e uma contagem. Nenhum dado de candidato sai
   * desta consulta, e nenhum dos quatro identifica pessoa.
   */
  private async ocupacaoPorVaga(
    vagasDaPagina: { id: string; posicoesOficiais: number | null }[],
  ): Promise<Map<string, AsOcupacaoVaga>> {
    const mapa = new Map<string, AsOcupacaoVaga>();
    if (vagasDaPagina.length === 0) return mapa;

    const linhas = await this.db
      .select({
        vagaId: asCandidaturas.vagaId,
        situacao: asCandidaturas.situacao,
        posicaoLado: asCandidaturas.posicaoLado,
        etapa: asCandidaturas.etapa,
        quantas: sql<number>`count(*)::int`,
      })
      .from(asCandidaturas)
      .where(
        inArray(
          asCandidaturas.vagaId,
          vagasDaPagina.map((v) => v.id),
        ),
      )
      .groupBy(
        asCandidaturas.vagaId,
        asCandidaturas.situacao,
        asCandidaturas.posicaoLado,
        asCandidaturas.etapa,
      );

    const porVaga = new Map<string, LinhaDeOcupacao[]>();
    for (const l of linhas) {
      const lista = porVaga.get(l.vagaId) ?? [];
      // A contagem volta a ser uma lista de candidaturas para o domínio decidir o que cada uma vale.
      for (let i = 0; i < Number(l.quantas); i++) {
        lista.push({ situacao: l.situacao, posicaoLado: l.posicaoLado, etapa: l.etapa });
      }
      porVaga.set(l.vagaId, lista);
    }

    for (const v of vagasDaPagina) {
      const itens = porVaga.get(v.id) ?? [];
      mapa.set(v.id, {
        vagaId: v.id,
        posicoesOficiais: v.posicoesOficiais,
        // A MESMA LISTA ALIMENTA AS DUAS RÉGUAS, e é isso que impede a fileira de KPIs de discordar
        // do cilindro da vaga: os dois números saem do mesmo instante e da mesma leitura.
        ...ocupacaoDaVaga(v.posicoesOficiais, itens),
        ...kpisDoFunil(itens),
      });
    }
    return mapa;
  }

  /**
   * A OCUPAÇÃO DE QUEM NÃO TEM NINGUÉM DENTRO. Existe como rede: `ocupacaoPorVaga` já devolve a
   * linha zerada de toda vaga da página, e esta função só cobre o caso de a listagem chegar aqui com
   * uma vaga que não passou por lá. Zerada é a resposta certa, e `undefined` obrigaria a tela a
   * inventar uma.
   */
  private ocupacaoVazia(vagaId: string, posicoesOficiais: number | null): AsOcupacaoVaga {
    // OS DOIS GRUPOS DE KPI VÊM VAZIOS, e vazios é a resposta certa: a vaga sem ninguém dentro tem
    // zero em toda etapa e em todo desfecho. Omiti los obrigaria a tela a inventar o que fazer com a
    // ausência, que é a mesma razão de esta função existir.
    return {
      vagaId,
      posicoesOficiais,
      ...ocupacaoDaVaga(posicoesOficiais, []),
      ...kpisDoFunil([]),
    };
  }

  /**
   * ─ O RASTRO DA REDUÇÃO DE META, DE TODAS AS VAGAS DA PÁGINA, EM UMA CONSULTA ──────────────────
   *
   * UMA CONSULTA SÓ, pelo mesmo motivo dos benefícios e da ocupação: a listagem não pagina, e uma
   * ida ao banco por linha responderia "vazio" centenas de vezes na tela mais pesada do módulo.
   *
   * `asc(criadoEm)` É A ORDEM DO CONTRATO, da redução mais ANTIGA para a mais RECENTE, e ela não é
   * estética: a leitura da trilha é "5 para 3, depois 3 para 1". Invertida, ela conta a história de
   * trás para frente e o encolhimento total fica ilegível. O índice `(vaga_id, criado_em)` serve
   * exatamente esta consulta.
   *
   * O AUTOR VEM POR `leftJoin`, e não por `innerJoin`, exatamente como o autor do fechamento
   * forçado: o `on delete set null` faz o `por_id` virar nulo quando o usuário é apagado, e um
   * `innerJoin` sumiria em silêncio com a redução justamente nesse caso. Sem o nome, ela ainda diz
   * QUANDO e de quanto para quanto.
   *
   * `deOficiais` NULO VIRA `paraOficiais` NA LEITURA, e o contrato é honesto sobre isso: nulo é
   * "não havia meta oficial antes" (rascunho), e o lado oficial não foi REDUZIDO nesse gesto, que é
   * o mesmo que a tela lê quando os dois números são iguais. O banco guarda a verdade crua; a
   * tradução acontece aqui, num lugar só.
   *
   * §A.6: quatro números, um nome de usuário INTERNO e uma data. Nenhum dado de candidato.
   */
  private async metaReducoesPorVaga(vagaIds: string[]): Promise<Map<string, VagaMetaReducao[]>> {
    const mapa = new Map<string, VagaMetaReducao[]>();
    if (vagaIds.length === 0) return mapa;

    const linhas = await this.db
      .select({
        vagaId: vagaMetaReducoes.vagaId,
        deOficiais: vagaMetaReducoes.deOficiais,
        paraOficiais: vagaMetaReducoes.paraOficiais,
        deBanco: vagaMetaReducoes.deBanco,
        paraBanco: vagaMetaReducoes.paraBanco,
        porNome: usuarios.nome,
        criadoEm: vagaMetaReducoes.criadoEm,
      })
      .from(vagaMetaReducoes)
      .leftJoin(usuarios, eq(usuarios.id, vagaMetaReducoes.porId))
      .where(inArray(vagaMetaReducoes.vagaId, vagaIds))
      .orderBy(asc(vagaMetaReducoes.criadoEm));

    for (const l of linhas) {
      const atual = mapa.get(l.vagaId) ?? [];
      atual.push({
        deOficiais: l.deOficiais ?? l.paraOficiais,
        paraOficiais: l.paraOficiais,
        deBanco: l.deBanco,
        paraBanco: l.paraBanco,
        porNome: l.porNome ?? null,
        quandoIso: l.criadoEm.toISOString(),
      });
      mapa.set(l.vagaId, atual);
    }
    return mapa;
  }

  private async beneficiosPorVaga(
    vagaIds: string[],
  ): Promise<Map<string, { id: string; nome: string; valor: string | null }[]>> {
    const mapa = new Map<string, { id: string; nome: string; valor: string | null }[]>();
    if (vagaIds.length === 0) return mapa;

    const linhas = await this.db
      .select({
        vagaId: vagaBeneficio.vagaId,
        id: beneficiosCatalogo.id,
        nome: beneficiosCatalogo.nome,
        valor: vagaBeneficio.valor,
      })
      .from(vagaBeneficio)
      .innerJoin(beneficiosCatalogo, eq(beneficiosCatalogo.id, vagaBeneficio.beneficioId))
      .where(inArray(vagaBeneficio.vagaId, vagaIds))
      .orderBy(asc(beneficiosCatalogo.nome));

    for (const l of linhas) {
      const atual = mapa.get(l.vagaId) ?? [];
      atual.push({ id: l.id, nome: l.nome, valor: l.valor });
      mapa.set(l.vagaId, atual);
    }
    return mapa;
  }
}

/** Texto opcional: em branco é ausência, não string vazia gravada no banco. */
function texto(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Data opcional: mesma régua do texto, para o `date` não receber string vazia. */
function data(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}
