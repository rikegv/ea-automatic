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
  AsCandidaturaParaReabrir,
  AsEtapaFunil,
  AsOcupacaoVaga,
  AsVagaCancelamentoBloqueado,
  AsVagaFechamentoBloqueado,
  CandidaturaEtapa,
  CandidaturaSituacao,
  AsVagaReabrirNegado,
  AsVagaReabrirOrigem,
  AsVagaReabrirPrevia,
  FecharVagaRecusa,
  PapelAs,
  PosicaoLado,
  VagaCamposObrigatorios,
  VagaContextoAs,
  VagaListItem,
  VagaMetaReducao,
  VagaStatus,
} from "@ea/shared-types";
import {
  CANDIDATURA_SITUACOES,
  type AsVagaCancelamentoPrevia,
  OPCAO_OUTRA,
  OPCAO_OUTROS,
  POSICAO_LADOS,
  REGIAO_OUTRAS,
  candidaturaEncerradaParaCancelamento,
  contraparteDe,
  exigeMotivoContratacao,
  exigeTempoContrato,
  isValidCpf,
  nomeDaUf,
  normalizeCpf,
  regiaoPertenceAUf,
  seguraOCancelamento,
  textoPendencia,
  vagaPendencias,
} from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidatos,
  asCandidaturaEtapas,
  asCandidaturas,
  beneficiosCatalogo,
  cargos,
  clientes,
  escalasCatalogo,
  motivosContratacao,
  usuarios,
  asVagaStatusEventos,
  vagaBeneficio,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import {
  ACEITE_REABERTURA_SEM_ORIGEM,
  candidaturaViva,
  consomePosicao,
  kpisDoFunil,
  ladoDaCandidatura,
  ocupacaoDaVaga,
  ocupadasPorLado,
  pendentesDeTratamento,
  posicaoNoFunil,
  tetoDoLado,
} from "../../domain/candidatura";
import {
  codigoJaUsado,
  ladosDaVaga,
  statusVivoDaVaga,
  escolaridadeVivaDaVaga,
  normalizarCodigoVaga,
  excessoDePosicoes,
  type ExcessoDePosicoes,
} from "../../domain/vaga";
import type {
  CancelarVagaDto,
  CreateVagaDto,
  EditarPosicoesVagaDto,
  FecharVagaDto,
  MoverStatusVagaDto,
  ReabrirVagaDto,
} from "./vagas.dto";
import { gravarSaidaDaCandidatura } from "../candidatos/encerrar-candidatura";
import { restaurarCandidatura } from "../candidatos/restaurar-candidatura";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import {
  VagaStatusService,
  type ReguaDeStatusDaVaga,
} from "../vaga-status/vaga-status.service";
import { motivosDeCancelamentoAtivos } from "../motivos-cancelamento/motivos-cancelamento.service";

/**
 * O EXECUTOR DENTRO DA TRANSAÇÃO, tipado como a casa já tipa (`admissoes.service`, `esteira`): o
 * fechamento lê e escreve pelo `tx`, e não pelo `this.db`, para que tudo aconteça sob a mesma linha
 * de vaga travada.
 */
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * QUEM EXECUTA UMA CONSULTA: a conexão ou a transação.
 *
 * ELE EXISTE PORQUE O MESMO CONJUNTO É LIDO DE DOIS LUGARES: a PRÉVIA do reabrir lê fora de
 * transação nenhuma (é leitura, não decide nada) e o REABRIR relê sob a linha da vaga travada, que é
 * onde a decisão vale. Duas cópias da consulta divergiriam no primeiro ajuste, e a que divergisse
 * seria a da tela, mostrando um conjunto que a gravação não aceita.
 */
type ExecutorDeConsulta = Database | DbTransaction;

/**
 * UMA CANDIDATURA DO CONJUNTO DO REABRIR: quem é, como ela está HOJE, e de onde ela veio.
 *
 * `situacaoAtual` É O RETRATO DE AGORA e `situacaoOrigem` é o de ANTES DA SAÍDA. As duas são
 * necessárias e não se substituem: a primeira é a guarda de "quem está vivo não volta" e a cláusula
 * do `where` da restauração; a segunda é para ONDE a pessoa volta, e ela é NULA no cancelamento
 * antigo, que não a gravava.
 *
 * §A.6: nome, etapa, situações, lado, motivo e data do processo, mais um booleano dizendo que a
 * pessoa já foi expurgada. Nenhum CPF, nenhum contato.
 */
interface LinhaParaReabrir {
  candidaturaId: string;
  candidatoId: string;
  candidatoNome: string;
  situacaoAtual: CandidaturaSituacao;
  etapaOrigem: CandidaturaEtapa;
  situacaoOrigem: Extract<CandidaturaSituacao, "ATIVO" | "ALOCADO"> | null;
  posicaoLadoOrigem: PosicaoLado | null;
  motivoSaida: string | null;
  saidaEm: Date | null;
  anonimizado: boolean;
}

/**
 * ─ O AVISO DO CANCELAMENTO: O TIPO SUBIU PARA O VOCABULÁRIO COMPARTILHADO ─────────────────────
 *
 * ELE NASCEU AQUI e foi promovido pelo COORDENADOR, que é o dono único de `@ea/shared-types`
 * (§A.39): enquanto ele morava neste arquivo, a tela precisava declarar um ESPELHO campo por campo,
 * e duas declarações da mesma forma concordam no dia em que são escritas e divergem na primeira vez
 * que alguém acrescenta um campo em uma só. Agora é uma forma só, lida pelos dois lados.
 *
 * O REEXPORT É DELIBERADO, e não preguiça de atualizar os chamadores: quem já importava o tipo
 * DESTE arquivo continua importando daqui, sem uma linha de mudança. A porta é a mesma, o que mudou
 * é de onde o tipo vem.
 */
export type { AsVagaCancelamentoPorSituacao, AsVagaCancelamentoPrevia } from "@ea/shared-types";

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
  /**
   * ┌─ O CANCELAMENTO NÃO ACRESCENTOU DEPENDÊNCIA DE CONSTRUTOR, E ISSO É DELIBERADO ────────────┐
   * │ Ele precisa de duas coisas de fora: o CATÁLOGO DE MOTIVOS (para recusar motivo inventado) e │
   * │ a GRAVAÇÃO DA SAÍDA da candidatura (para o forçado encerrar quem atropelou, §A.6). As duas  │
   * │ chegam como FUNÇÃO DE MÓDULO (`motivosDeCancelamentoAtivos` e `gravarSaidaDaCandidatura`),  │
   * │ e não como service injetado, por duas razões: mexer na assinatura de um construtor alcança  │
   * │ todo código já validado que constrói este service (§A.26), e injetar o `CandidatosService`  │
   * │ aqui criaria uma amarração entre os dois módulos por causa de duas escritas.                 │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly etapas: EtapasFunilService,
    /**
     * O CATÁLOGO DE STATUS (onda B2). É dele que sai TODO código que este serviço grava em
     * `vagas.status`: nenhum literal sobrou neste arquivo, e a busca é sempre pelo PAPEL.
     *
     * A RÉGUA DE USO, em uma frase: o CATÁLOGO se lê ANTES da transação, e o STATUS DA VAGA se lê
     * SEMPRE sob o `SELECT ... FOR UPDATE`. As duas metades importam. Ler o catálogo dentro da
     * transação só alongaria o tempo com a trava segurada; ler o status da vaga fora dela desfaria
     * a correção de 09/09, que é decidir sobre o instante travado e não sobre uma fotografia velha.
     */
    private readonly statusVaga: VagaStatusService,
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
    // O CATÁLOGO ANTES DE TUDO: é ele que diz qual código é o da ABERTURA e se o pedido da tela pode
    // ser gravado pela trilha. Nenhum literal de status sai deste arquivo.
    const regua = await this.statusVaga.regua();
    const status = this.travaStatusDaTrilha(regua, dto.status, "ABERTURA");
    const campos = this.camposDaTrilha(regua, dto, status);
    this.travaObrigatorios(regua, campos, status);

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
    const regua = await this.statusVaga.regua();
    const atual = await this.db.query.vagas.findFirst({ where: eq(vagas.id, id) });
    if (!atual) throw new NotFoundException("Vaga não encontrada.");
    // SÓ RASCUNHO ENTRA, e a pergunta é pelo PAPEL: o código continua sendo `RASCUNHO`, mas quem o
    // afirma passa a ser o catálogo. Comparar com o literal voltaria a errar no dia em que a linha
    // fosse recadastrada com outro código.
    if (!regua.ehDoPapel(atual.status, "RASCUNHO")) {
      throw new ConflictException(
        "Esta vaga já foi publicada e não volta para a trilha de abertura. Recarregue a página.",
      );
    }

    const status = this.travaStatusDaTrilha(regua, dto.status, "RASCUNHO");
    const campos = {
      ...this.camposDaTrilha(regua, dto, status),
      posicoesOficiais: this.metaOficialDaTrilha(dto, atual),
    };
    this.travaObrigatorios(regua, campos, status);

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
   * A LISTA VEM DO CATÁLOGO (o flag `daTrilha` de `as_vaga_status`) e não é redigitada: duas cópias
   * da mesma régua divergem na primeira correção feita só em uma delas, que é o defeito que este
   * módulo já pagou.
   *
   * ┌─ O FLAG É PERMISSÃO, E A DIREÇÃO CONTINUA SENDO A QUE PROTEGE ────────────────────────────┐
   * │ `daTrilha` é FALSO por padrão na coluna e FALSO no nascimento de todo status novo, então um │
   * │ status que o diretor acrescentar ao catálogo nasce RECUSADO por esta porta até alguém       │
   * │ decidir o contrário. É o mesmo fail-closed da lista que ele substituiu, que era permissão   │
   * │ explícita justamente porque "proibição esquece a terceira folha" (o `ENTREGUE`).            │
   * │                                                                                            │
   * │ O INATIVO TAMBÉM É RECUSADO (`regua.daTrilha` confere os dois): status fora de circulação   │
   * │ não recebe vaga nova, ou a publicação criaria o status fantasma pela porta da frente.       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O PADRÃO ENTRA POR PAPEL, E NÃO POR CÓDIGO: `ABERTURA` e `RASCUNHO` são papéis de sistema, com
   * exatamente uma linha cada (índice parcial único), então o padrão continua apontando para a linha
   * certa depois de o diretor renomear "Aberta" para o que quiser.
   */
  private travaStatusDaTrilha(
    regua: ReguaDeStatusDaVaga,
    pedido: string | undefined,
    papelPadrao: "ABERTURA" | "RASCUNHO",
  ): string {
    const status = pedido ?? regua.codigoDoPapel(papelPadrao);
    if (!regua.existe(status) || !regua.daTrilha(status)) {
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
  private camposDaTrilha(regua: ReguaDeStatusDaVaga, dto: CreateVagaDto, status: VagaStatus) {
    // "ISTO É O RASCUNHO?" PERGUNTADO AO PAPEL, e não ao literal. O código continua sendo
    // `RASCUNHO`; o que muda é que a resposta deixa de depender de o literal e o catálogo
    // concordarem por coincidência. É a mesma pergunta que a régua dos obrigatórios faz logo abaixo.
    const ehRascunho = regua.ehDoPapel(status, "RASCUNHO");
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
        ? this.validaCpfSubstituido(dto.substituidoCpf, ehRascunho)
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
  private travaObrigatorios(
    regua: ReguaDeStatusDaVaga,
    campos: VagaCamposObrigatorios,
    status: VagaStatus,
  ): void {
    // O RASCUNHO NÃO COBRA OBRIGATÓRIO, e quem diz que este é o rascunho é o PAPEL. Um status novo
    // que o diretor crie e marque `daTrilha` NÃO herda a folga: ele não tem papel de RASCUNHO, então
    // publicar nele cobra a régua inteira, que é a direção segura.
    if (regua.ehDoPapel(status, "RASCUNHO")) return;
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
    /*
     * A LISTA DE TRÊS LITERAIS QUE HAVIA AQUI VIROU O FLAG `encerra` DO CATÁLOGO (onda B2).
     *
     * ELA ERA UMA PROIBIÇÃO ENUMERADA (`FECHADA`, `ENTREGUE`, `CANCELADA`), que é a direção que o
     * módulo já pagou para descobrir que esquece folha: um status terminal novo passaria por aqui
     * sem que ninguém notasse, e as posições de uma vaga encerrada voltariam a ser editáveis, com os
     * carimbos de contagem já congelados. O flag responde pela propriedade, e não pela lista.
     */
    const regua = await this.statusVaga.regua();
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, id) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    if (regua.encerra(vaga.status)) {
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
    /*
     * O CATÁLOGO DE STATUS, PELA MESMA RAZÃO E COM UMA A MAIS: a régua é SÍNCRONA depois de
     * construída, então dentro da transação não sobra `await` de catálogo para alguém, um dia,
     * "aproveitar a viagem" e buscar a vaga junto por fora do lock. O status da vaga continua sendo
     * lido lá dentro, sob o `FOR UPDATE`, e só lá.
     */
    const regua = await this.statusVaga.regua();
    const codigoEntrega = regua.codigoDoPapel("ENTREGA");
    const codigoFechamento = regua.codigoDoPapel("FECHAMENTO");

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
      /*
       * A TRAVA DE ORIGEM, AGORA PELO PAPEL: só a vaga em ABERTURA fecha. O código continua sendo
       * `ABERTA`, e é justamente por isso que perguntar pelo papel importa: o literal concorda com o
       * catálogo por coincidência, e a coincidência acaba no dia em que a linha for recadastrada.
       *
       * SEGUE SENDO A TRAVA QUE RECUSA A CORRIDA, e não só a ordena: o `FOR UPDATE` serializa duas
       * requisições, e quem chega em segundo lugar encontra a vaga já encerrada e para AQUI.
       */
      if (!regua.ehDoPapel(vaga.status, "ABERTURA")) {
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
           * ─ O INSTANTE DO ENCERRAMENTO, DO SERVIDOR, e ele NÃO é `data_fechamento` ───────────
           *
           * §A.6: este carimbo é o RELÓGIO DA RETENÇÃO. O expurgo de candidatos trata "vivo em
           * vaga encerrada" como processo encerrado, e conta o prazo de 2 anos A PARTIR DAQUI para
           * quem só passou a contar como encerrado porque a vaga acabou. Sem ele, o prazo dessa
           * pessoa contaria do `atualizado_em` da CANDIDATURA, que este fechamento não toca: quem
           * foi aprovado em 2024 numa vaga fechada hoje nasceria com o prazo JÁ VENCIDO e seria
           * anonimizado na varredura da hora seguinte, sem carência nenhuma.
           *
           * `new Date()` E NUNCA `dto.dataFechamento`, que é a data do FATO COMERCIAL e vem do
           * corpo, sem piso: lida como relógio, ela vira gatilho REMOTO de exclusão irreversível
           * de dado pessoal, acionável por qualquer COMUM que digite 2019 no campo.
           */
          encerradaEm: new Date(),
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
           *
           * O CÓDIGO VEM DO PAPEL, E NUNCA DO LITERAL (onda B2). A FK pega o código INEXISTENTE; ela
           * não pega o código existente e ERRADO, e é aí que mora o dano: gravar aqui o código do
           * CANCELAMENTO seria FK válida, desfecho falso e permanente, carimbado junto de
           * `vagas_fechadas` e `data_fechamento`. Os dois códigos foram resolvidos ANTES da
           * transação, e o diretor pode renomear "Entregue" sem que esta linha perca o alvo.
           */
          status: ocupacao.finalizadas > 0 ? codigoEntrega : codigoFechamento,
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
   * ─ CANCELAR A VAGA (onda B1): a SEGUNDA porta para o estado terminal, e ela sabe disso ─────────
   *
   * O QUE ELA É: o registro de que o processo NÃO VAI MAIS ACONTECER. Não é fechar mal, é outra
   * coisa: o `fechar` responde "a vaga entregou o que prometeu?", e este responde "por que isto
   * acabou?". O status `CANCELADA` já existia no enum e já era LIDO em quatro pontos (o desfecho da
   * vaga, onde ele VENCE TUDO; os contadores congelados; o card de KPI); o que faltava era o
   * ESCRITOR.
   *
   * ┌─ AS TRAVAS, NESTA ORDEM, e a primeira é a que o desenho original tinha esquecido ──────────┐
   * │ 1. STATUS DE ORIGEM: só a vaga no papel ABERTURA cancela (o catálogo responde, desde a B2;  │
   * │    antes era `VAGA_STATUS_QUE_CANCELAM`, no domínio). É ela que impede cancelar uma vaga já ENTREGUE (o que APAGARIA a entrega da │
   * │    leitura, porque `CANCELADA` vence tudo), que torna o duplo clique inofensivo e que faz a │
   * │    corrida entre duas requisições ser RECUSADA, e não só ordenada: o `FOR UPDATE` serializa │
   * │    as duas, mas quem chega em segundo lugar só para por causa desta lista.                   │
   * │ 2. MOTIVO DO CATÁLOGO: o nome tem de existir e estar ATIVO. Sem isto, o campo seria texto   │
   * │    livre com aparência de catálogo, e a auditoria leria depois o que alguém tiver digitado.  │
   * │ 3. QUEM AINDA SEGURA O CANCELAMENTO: bloqueio COM aceite de Master, e a régua é do domínio  │
   * │    compartilhado (`seguraOCancelamento`: `ATIVO` e `ALOCADO` seguram; aprovado, enviado para │
   * │    a admissão, descartado e desistente NÃO).                                                 │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A TRAVA 3 NÃO É `pendentesDeTratamento`, E CONFUNDI-LAS INVERTE A DECISÃO DO DIRETOR ─────┐
   * │ A régua do FECHAMENTO (`SITUACOES_TRATADAS`) inclui `ALOCADO`, porque lá a pergunta é       │
   * │ "sobrou alguém sem DECISÃO?" e alocar é a decisão mais definitiva de todas. Reusá-la aqui   │
   * │ deixaria um COMUM cancelar, sem trava nenhuma, uma vaga com cinco pessoas ALOCADAS dentro,  │
   * │ que é o oposto do que o diretor decidiu. São duas perguntas diferentes, e por isso duas     │
   * │ réguas. `SITUACOES_TRATADAS` NÃO foi tocada: ela é a trava 5 do fechamento, e mexer nela    │
   * │ para "ficar coerente" quebraria a outra frente por alcance.                                  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A TRANSAÇÃO E O `SELECT ... FOR UPDATE` SÃO OS MESMOS DO `fechar`, pela mesma razão medida: a
   * finalização de posição (`candidatos.service.mudarSituacaoOcupandoPosicao`) disputa A MESMA LINHA
   * de vaga. Sem o lock, o cancelamento decide sobre uma fotografia velha e os carimbos de contagem
   * saem errados.
   *
   * O CATÁLOGO DE MOTIVOS É LIDO ANTES DE ABRIR A TRANSAÇÃO, e a ordem do funil também, pelo
   * argumento já escrito no `fechar`: são catálogos pequenos, não têm nada a ver com a linha travada,
   * e buscá-los lá dentro só alongaria o tempo com a trava segurada.
   *
   * §A.6: nenhum CPF em lugar nenhum, nenhum log com dado de pessoa. O corpo da recusa carrega nome,
   * etapa e situação, exatamente o que a recusa do fechamento já trafega hoje em produção.
   */
  async cancelar(id: string, dto: CancelarVagaDto, user: AuthUser): Promise<VagaListItem> {
    /*
     * O MOTIVO É CONFERIDO CONTRA O CATÁLOGO, e é conferido AQUI, fora da transação. Um nome que não
     * está na lista ativa é erro de CORPO, não conflito de estado: recusar antes de travar a linha
     * da vaga é a diferença entre um 400 imediato e um lock segurado à toa.
     */
    const motivosAtivos = await motivosDeCancelamentoAtivos(this.db);
    if (!motivosAtivos.some((m) => m.nome === dto.motivo)) {
      throw new BadRequestException("Motivo de cancelamento inválido. Escolha um motivo da lista.");
    }

    const ordemDoFunil = await this.etapas.ordemPorCodigo();
    // O CATÁLOGO DE STATUS, ANTES DA TRANSAÇÃO, como no fechamento: aqui ele responde as duas
    // perguntas do cancelamento, "de onde pode cancelar" (papel ABERTURA) e "o que gravar" (papel
    // CANCELAMENTO). O status da VAGA continua sendo lido sob o `FOR UPDATE`, logo abaixo.
    const regua = await this.statusVaga.regua();
    const codigoCancelamento = regua.codigoDoPapel("CANCELAMENTO");

    await this.db.transaction(async (tx) => {
      // ── A LINHA DA VAGA É TRAVADA ANTES DE QUALQUER CONTAGEM, como no fechamento.
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

      /*
       * TRAVA 1, A DE ORIGEM. A frase é própria e diz o que aconteceu: quem chega aqui numa vaga já
       * encerrada está com a tela velha, seja por duplo clique, seja porque outra pessoa encerrou a
       * vaga enquanto o modal estava aberto.
       */
      if (!regua.ehDoPapel(vaga.status, "ABERTURA")) {
        throw new ConflictException("Esta vaga já foi encerrada. Recarregue a página.");
      }

      const linhas = await this.candidaturasDaVaga(tx, id);

      // TRAVA 3. Devolve `null` quando ninguém segurava, ou o que carimbar quando um Master forçou.
      const forcado = this.travaCandidatosQueSeguram(linhas, ordemDoFunil, dto, user);

      /*
       * ┌─ A TRILHA DA VAGA PASSA A SER ESCRITA AQUI TAMBÉM, e ela era o buraco do módulo ────────┐
       * │ `as_vaga_status_eventos` tinha ZERO LINHAS (conferido no banco): só o `moverStatus` a    │
       * │ escrevia, e o cancelamento guardava a história em colunas soltas da própria vaga que     │
       * │ NINGUÉM LÊ (não estão no `VagaListItem` nem em tela nenhuma). O movimento mais caro do   │
       * │ módulo era o único que não aparecia na linha do tempo da vaga.                            │
       * │                                                                                          │
       * │ E A TRILHA VIROU REQUISITO, e não zelo: a REABERTURA limpa os carimbos de cancelamento   │
       * │ da linha da vaga (eles descrevem o estado ATUAL, e vaga reaberta não está cancelada), e  │
       * │ limpar só deixou de apagar o fato porque o fato passou a viver AQUI. É por isso que a    │
       * │ observação do evento carrega o MOTIVO e o tamanho da exceção do forçado: sem eles, a     │
       * │ limpeza levaria embora a única cópia.                                                     │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * NA MESMA TRANSAÇÃO da gravação do status, como no `moverStatus`: rastro que pode faltar
       * quando a escrita deu certo não é rastro. E ANTES do encerramento das candidaturas, porque é
       * o ID DELE que cada saída carimba como marcador.
       *
       * §A.6: id de vaga, dois códigos, id de usuário INTERNO, data, o motivo do catálogo e a
       * observação de quem cancelou. Nenhum dado de candidato, e o número do forçado é contagem.
       */
      const [evento] = await tx
        .insert(asVagaStatusEventos)
        .values({
          vagaId: id,
          de: vaga.status,
          para: codigoCancelamento,
          // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
          porId: user.id,
          observacao: this.narrativaDoCancelamento(dto, forcado),
        })
        .returning({ id: asVagaStatusEventos.id });

      /*
       * ┌─ O FORÇADO ENCERRA QUEM ELE ATROPELOU, E ISTO É §A.6, NÃO CORTESIA ────────────────────┐
       * │ O expurgo por retenção só anonimiza candidato SEM NENHUMA candidatura viva, e `ATIVO` e │
       * │ `ALOCADO` são vivas. Uma candidatura deixada viva numa vaga CANCELADA nunca satisfaz a  │
       * │ cláusula: nome, CPF, e-mail, telefone e data de nascimento ficariam retidos PARA SEMPRE  │
       * │ num processo que a operação considera morto, e o prazo de dois anos nunca começaria a   │
       * │ correr. E este é o caso de uso PRINCIPAL do `forcar`, não uma borda.                     │
       * │                                                                                         │
       * │ NA MESMA TRANSAÇÃO, e pelo MECANISMO QUE JÁ EXISTE (`gravarSaidaDaCandidatura`, a mesma  │
       * │ gravação do `registrarSaida`): uma segunda régua de saída divergiria da primeira, e a    │
       * │ régua do motivo obrigatório e do evento no histórico está escrita lá.                    │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (forcado) {
        for (const linha of forcado.seguravamCandidaturas) {
          await gravarSaidaDaCandidatura(
            tx,
            {
              id: linha.candidaturaId,
              etapa: linha.etapa,
              situacao: linha.situacao,
              /*
               * O LADO VIAJA JUNTO porque é ele que a REABERTURA lê para devolver a pessoa à
               * posição de onde ela veio. Adivinhar depois é o que o desenho anterior fazia, e é
               * PROVADAMENTE errado: existe na base uma candidatura EM SELEÇÃO com posição OFICIAL
               * marcada (foi alocada, enviada para a admissão, e a reversão do envio não limpa o
               * lado), então "tem lado, logo estava alocada" fabricaria uma entrega que não houve.
               */
              posicaoLado: linha.posicaoLado,
            },
            "DESCARTADO",
            /*
             * O MOTIVO É DERIVADO do motivo do cancelamento, e não uma frase genérica: a pessoa não
             * desistiu nem foi reprovada, o processo dela terminou porque a VAGA terminou, e é isso
             * que a linha do tempo dela precisa dizer daqui a seis meses.
             */
            `Vaga cancelada: ${dto.motivo}`,
            user.id,
            /*
             * O MARCADOR ESTRUTURAL, e é ele que torna a reabertura possível sem chute. Antes, o
             * único sinal de "esta pessoa saiu POR CAUSA do cancelamento" era o TEXTO do motivo,
             * logo acima, e aquele campo é digitável à mão por qualquer consultor: casar por texto
             * ressuscitaria quem a seleção descartou de propósito e viraria atalho para burlar a
             * ciência de reentrada. Apontando para ESTE evento, a reabertura enxerga exatamente
             * quem saiu NESTE cancelamento, e um segundo cancelamento da mesma vaga tem o conjunto
             * dele, sem as duas saídas colidirem no unique parcial das candidaturas vivas.
             */
            evento.id,
          );
        }
      }

      /*
       * A OCUPAÇÃO DERIVADA, lida SOB O LOCK e sobre a MESMA lista, como no fechamento.
       *
       * ELA É LIDA ANTES DO ENCERRAMENTO ACIMA (a lista `linhas` é a fotografia do instante em que a
       * vaga foi travada), e isso é DELIBERADO: os carimbos têm de contar quantas posições a vaga
       * chegou a entregar DE VERDADE, e não zero. Quem foi alocado ENTREGOU a posição, o fato
       * aconteceu, e o desfecho já diz separadamente que a vaga foi cancelada.
       */
      const ocupacao = ocupacaoDaVaga(vaga.posicoesOficiais, linhas);

      await tx
        .update(vagas)
        .set({
          // O CÓDIGO VEM DO PAPEL, resolvido antes da transação. UMA LINHA, e é a que a onda B1
          // deixou escrita à mão: `CANCELADA` era literal aqui, e o dano de um literal errado neste
          // ponto é o pior do módulo, porque `CANCELADA` VENCE TUDO no desfecho da vaga.
          status: codigoCancelamento,
          /*
           * A DATA DO FATO vai para `data_fechamento`, e não o `now()`: é ela que o contador de dias
           * em aberto lê. Sem ela, a vaga cancelada ficaria com o contador em branco PARA SEMPRE, e
           * a célula escreveria "não informado" (medido na leitura da tela).
           */
          dataFechamento: dto.dataCancelamento,
          /*
           * OS DOIS CARIMBOS DE CONTAGEM, pela MESMA derivada do fechamento. Sem eles a origem da
           * contagem responde "ausente" na vaga encerrada e O CILINDRO MOSTRA ZERO: quem foi
           * entregue de fato sumiria da tela no instante do cancelamento.
           */
          vagasFechadas: ocupacao.finalizadasOficial,
          vagasFechadasBanco: ocupacao.finalizadasBanco,
          /*
           * A TRILHA DO CANCELAMENTO, na MESMA gravação que muda o status: um `update` só, então não
           * existe o estado de vaga cancelada sem trilha.
           *
           * QUEM e QUANDO vêm da SESSÃO e do SERVIDOR, nunca do corpo. O `dataCancelamento` do corpo
           * é o fato comercial, que pode ser anterior; `cancelada_em` é o instante do gesto.
           */
          canceladaPorId: user.id,
          canceladaEm: new Date(),
          /*
           * O MESMO CARIMBO DO FECHAMENTO, e ele NÃO é redundante com `cancelada_em`: `encerrada_em`
           * responde "quando esta vaga ACABOU", nas DUAS portas, e é a coluna que a retenção lê
           * (§A.6). `cancelada_em` responde "quando ELA FOI CANCELADA", e não existe na vaga fechada.
           * Uma consulta só, para as duas portas, é o que impede a régua do expurgo de virar duas.
           */
          encerradaEm: new Date(),
          cancelamentoMotivo: dto.motivo,
          cancelamentoObservacao: texto(dto.observacao),
          /*
           * ┌─ O CARIMBO DO FORÇADO VEM DO RETORNO DA TRAVA, E NUNCA DE `dto.forcar` ────────────┐
           * │ Um COMUM pode mandar `forcar: true` numa vaga em que NINGUÉM segura: a trava não    │
           * │ dispara, o papel nem chega a ser conferido, e o cancelamento é legítimo. Carimbando │
           * │ pelo campo do corpo, essa vaga sairia marcada como "cancelada à força por um COMUM, │
           * │ com 0 segurando": trilha MENTINDO, no campo que existe só para registrar exceção,   │
           * │ e o CHECK do banco (`> 0`) recusaria a gravação inteira por cima. É o mesmo desenho  │
           * │ do forçamento do fechamento, e pela mesma razão.                                    │
           * └────────────────────────────────────────────────────────────────────────────────────┘
           */
          ...(forcado
            ? {
                cancelamentoForcadoPorId: user.id,
                cancelamentoForcadoEm: new Date(),
                cancelamentoForcadoSeguravam: forcado.seguravam,
              }
            : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(vagas.id, id));
    });

    return this.devolverVaga(id, "Vaga cancelada, mas não encontrada na listagem.");
  }

  /**
   * ─ O AVISO DO CANCELAMENTO (onda B3, peça 1): quantos processos JÁ ESTÃO ENCERRADOS ────────────
   *
   * ┌─ A PERGUNTA QUE O DIRETOR FEZ, e ela não é a da trava ─────────────────────────────────────┐
   * │ Ele viu o sistema DEIXAR cancelar uma vaga com gente dentro, e o sistema estava certo: a    │
   * │ pessoa tinha DESISTIDO dez horas antes, e quem desistiu não segura cancelamento nenhum. O   │
   * │ que faltava não era trava, era INFORMAÇÃO: o modal dizia nada sobre as pessoas cujo         │
   * │ processo já tinha acabado, então cancelar parecia estar apagando gente viva.                │
   * │                                                                                            │
   * │ INFORMA, NÃO TRAVA. Nada aqui recusa nada. Quem recusa é a trava do `cancelar`, que olha o  │
   * │ lado OPOSTO desta mesma régua.                                                              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A RÉGUA É O COMPLEMENTO EXATO DA TRAVA: `candidaturaEncerradaParaCancelamento`, a mesma função
   * de que `seguraOCancelamento` é a negação, e que o `travaCandidatosQueSeguram` já usa pelo outro
   * lado. NENHUMA LISTA NOVA DE SITUAÇÃO é escrita, aqui nem em lugar nenhum desta frente: duas
   * listas iguais concordam por coincidência e param de concordar na primeira situação nova.
   *
   * A QUEBRA POR SITUAÇÃO VAI JUNTO porque "3 encerrados" e "1 aprovado, 1 enviado para a admissão
   * e 1 desistente" respondem perguntas diferentes, e é a segunda que faz o consultor decidir. A
   * lista sai na ORDEM DO VOCABULÁRIO (`CANDIDATURA_SITUACOES`), e não na ordem que o banco
   * devolver, senão o modal muda de ordem a cada abertura.
   *
   * §A.6: NÚMEROS E SITUAÇÕES, e mais nada. Sem nome, sem CPF, sem e-mail, sem telefone, sem id de
   * candidato. A MESMA informação COM NOME já é servida a qualquer consultor com o menu por
   * `GET as/candidatos/vaga/:vagaId`: um número por situação é estritamente menos. E nada disto é
   * logado: este service não tem `Logger` nenhum, deliberadamente.
   */
  async previaDoCancelamento(id: string): Promise<AsVagaCancelamentoPrevia> {
    /*
     * `group by` NO BANCO, e não a lista inteira trazida para contar aqui: a vaga de alto volume tem
     * centenas de candidaturas, e o que a tela precisa são seis números. Trazer as linhas seria
     * trafegar o que a §A.6 manda não trafegar para responder o que uma contagem responde.
     */
    const linhas = await this.db
      .select({
        situacao: asCandidaturas.situacao,
        quantos: sql<number>`count(*)::int`,
      })
      .from(asCandidaturas)
      .where(eq(asCandidaturas.vagaId, id))
      .groupBy(asCandidaturas.situacao);

    const porSituacao = CANDIDATURA_SITUACOES.filter(candidaturaEncerradaParaCancelamento)
      .map((situacao) => ({
        situacao,
        quantos: Number(linhas.find((l) => l.situacao === situacao)?.quantos ?? 0),
      }))
      // A SITUAÇÃO COM ZERO NÃO ENTRA: o modal lista o que EXISTE, e uma linha "0 desistentes" é
      // ruído que empurra para baixo as que importam.
      .filter((l) => l.quantos > 0);

    return {
      vagaId: id,
      encerrados: porSituacao.reduce((total, l) => total + l.quantos, 0),
      porSituacao,
    };
  }

  /** Só o MASTER e o SUPER_ADMIN reabrem, e o papel é lido da SESSÃO, nunca do corpo. */
  private podeReabrir(user: AuthUser): boolean {
    return user.papel === "MASTER" || user.papel === "SUPER_ADMIN";
  }

  /**
   * ─ QUEM O CANCELAMENTO DERRUBOU, E COMO O SISTEMA SABE DISSO ───────────────────────────────────
   *
   * ┌─ O DISCRIMINADOR É "EXISTE EVENTO DE CANCELAMENTO?", NUNCA "A LISTA VEIO VAZIA" ───────────┐
   * │ MEDIDO NO `cancelar`, LOGO ACIMA: o evento do cancelamento é inserido SEMPRE, mas as        │
   * │ candidaturas só são encerradas DENTRO do `if (forcado)`. Ou seja, o cancelamento NORMAL, o  │
   * │ da vaga que ninguém segurava, produz um evento com ZERO pessoas apontando para ele.         │
   * │                                                                                            │
   * │ Quem raciocinar "consultei o evento, veio vazio, logo é cancelamento antigo, ofereço todos  │
   * │ os DESCARTADO da vaga" oferece para ressurreição EXATAMENTE QUEM A SELEÇÃO RECUSOU POR      │
   * │ MÉRITO, num cancelamento que não descartou ninguém. É o cenário que a migration 0104 existe │
   * │ para impedir, chegando por outra porta. Daí os TRÊS valores de `AsVagaReabrirOrigem`, e não │
   * │ um booleano.                                                                                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O ESCOPO É O ÚLTIMO EVENTO DE CANCELAMENTO, NUNCA "TODOS OS EVENTOS DA VAGA" ─────────────┐
   * │ A 0104 admite mais de um cancelamento na mesma vaga (cancelar, reabrir sem trazer ninguém,  │
   * │ realocar, cancelar de novo). Sem este escopo, o Master restaura gente de cancelamentos      │
   * │ ANTERIORES: como a restauração escreve `situacao` direto e NÃO passa pela trava de          │
   * │ capacidade do caminho travado, três ALOCADO entram numa vaga de duas posições, o cilindro   │
   * │ passa a mentir e o gate de Master do `fechar` fica contornável. E duas linhas vivas da mesma│
   * │ pessoa na mesma vaga estouram `uq_as_candidaturas_viva`, derrubando a transação inteira.    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O CONJUNTO SAI DO MARCADOR ESTRUTURAL (`vaga_status_evento_id`), e NUNCA do texto do motivo, que
   * é digitável à mão por qualquer consultor (o DTO da saída pede dois caracteres). Casar por texto
   * ressuscitaria quem a seleção descartou de propósito e viraria atalho para burlar a ciência de
   * reentrada.
   *
   * `situacao is not null` NO EVENTO: só DESFECHO entra. É a segunda razão, independente do id, pela
   * qual o evento do RETORNO (que grava situação nula) nunca reaparece no conjunto do próximo
   * reabrir.
   *
   * QUEM JÁ ESTÁ DE VOLTA NÃO É OFERECIDO. Se o candidato já tem candidatura VIVA nesta vaga (ele
   * foi realocado depois, por reentrada), restaurar a linha morta dele é impossível pelo unique
   * parcial e seria um lote inteiro perdido no 23505. Ele é filtrado AQUI para a tela não oferecer
   * uma escolha condenada, e a decisão é retomada sob o lock, no `reabrir`.
   */
  private async conjuntoDoReabrir(
    executor: ExecutorDeConsulta,
    vagaId: string,
    codigoCancelamento: string,
  ): Promise<{
    origem: AsVagaReabrirOrigem;
    linhas: LinhaParaReabrir[];
    daVaga: LinhaDeCandidatura[];
  }> {
    /*
     * AS CANDIDATURAS DA VAGA, LIDAS UMA VEZ SÓ, e as três perguntas desta frente bebem daqui: quem
     * já está de volta (para não oferecer escolha condenada), a ocupação por lado (para a trava de
     * capacidade) e, no caminho SEM ORIGEM, a própria linha da saída. Três consultas responderiam
     * sobre três instantes diferentes, e duas delas sobre um instante anterior ao da decisão.
     *
     * §A.6: nome, etapa, situação, lado, o motivo do descarte e um booleano de expurgo. Sem CPF, sem
     * contato, e a consulta não chega a SELECIONAR o CPF, mesmo tendo a tabela no join.
     */
    const daVaga = await executor
      .select({
        candidaturaId: asCandidaturas.id,
        candidatoId: asCandidaturas.candidatoId,
        candidatoNome: asCandidatos.nome,
        etapa: asCandidaturas.etapa,
        situacao: asCandidaturas.situacao,
        posicaoLado: asCandidaturas.posicaoLado,
        motivoDescarte: asCandidaturas.motivoDescarte,
        atualizadoEm: asCandidaturas.atualizadoEm,
        anonimizadoEm: asCandidatos.anonimizadoEm,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(eq(asCandidaturas.vagaId, vagaId))
      .orderBy(asc(asCandidatos.nome));

    const jaDeVolta = new Set(
      daVaga.filter((l) => candidaturaViva(l.situacao)).map((l) => l.candidatoId),
    );

    const [evento] = await executor
      .select({ id: asVagaStatusEventos.id })
      .from(asVagaStatusEventos)
      .where(
        and(
          eq(asVagaStatusEventos.vagaId, vagaId),
          eq(asVagaStatusEventos.para, codigoCancelamento),
        ),
      )
      .orderBy(desc(asVagaStatusEventos.em))
      .limit(1);

    if (!evento) {
      /*
       * ─ O CAMINHO SEM ORIGEM: o cancelamento é ANTERIOR ao carimbo (medição M1 do mapa) ────────
       *
       * Não há evento, então o sistema NÃO SABE quem saiu por causa do cancelamento nem onde cada um
       * estava. A leitura honesta é a única que sobra: o cancelamento escreve DESCARTADO, então o
       * conjunto é o dos DESCARTADO daquela vaga.
       *
       * `DESISTIU` NÃO ENTRA, e esta é a exigência mais importante deste caminho: o cancelamento só
       * encerra quem estava VIVO, e uma desistência é ato da própria pessoa. Ela jamais foi causada
       * pelo cancelamento, e oferecê-la é 100% invenção. É literalmente o caso do diretor: a pessoa
       * desistiu dez horas ANTES de a vaga ser cancelada.
       *
       * A ORIGEM VAI NULA DE PROPÓSITO, e não adivinhada: "tem `posicao_lado`, logo estava alocado"
       * é FALSO e MEDIDO (há candidatura ATIVO com lado OFICIAL pendurado na base agora, porque a
       * reversão do envio não limpa o lado). Quem volta por aqui volta EM SELEÇÃO.
       *
       * `motivoSaida` E `saidaEm` SAEM DA PRÓPRIA LINHA (o motivo do descarte e o último movimento
       * dela): é o melhor dado que existe sem evento, e é ele que deixa o Master distinguir
       * "descartado por perfil em 03/2025" de "descartado no dia do cancelamento" em vez de decidir
       * reconhecendo nome.
       */
      return {
        origem: "SEM_ORIGEM",
        linhas: daVaga
          .filter((l) => l.situacao === "DESCARTADO" && !jaDeVolta.has(l.candidatoId))
          .map((l) => ({
            candidaturaId: l.candidaturaId,
            candidatoId: l.candidatoId,
            candidatoNome: l.candidatoNome,
            situacaoAtual: l.situacao,
            etapaOrigem: l.etapa,
            situacaoOrigem: null,
            posicaoLadoOrigem: null,
            /*
             * O MOTIVO E A DATA SAEM DA PRÓPRIA LINHA, que é o melhor dado que existe sem evento: o
             * motivo do descarte e o último movimento dela, que numa candidatura descartada e nunca
             * mais tocada É o instante do descarte. São eles que deixam o Master distinguir
             * "descartado por perfil em 03/2025" de "descartado no dia do cancelamento", em vez de
             * decidir reconhecendo nome, que é o gesto que a ciência de reentrada existe para
             * impedir.
             */
            motivoSaida: l.motivoDescarte,
            saidaEm: l.atualizadoEm,
            anonimizado: l.anonimizadoEm !== null,
          })),
        daVaga,
      };
    }

    const doEvento = await executor
      .select({
        candidaturaId: asCandidaturas.id,
        candidatoId: asCandidaturas.candidatoId,
        candidatoNome: asCandidatos.nome,
        situacaoAtual: asCandidaturas.situacao,
        etapaOrigem: asCandidaturaEtapas.etapaPara,
        situacaoOrigem: asCandidaturaEtapas.situacaoOrigem,
        posicaoLadoOrigem: asCandidaturaEtapas.posicaoLadoOrigem,
        motivoSaida: asCandidaturaEtapas.motivo,
        saidaEm: asCandidaturaEtapas.ocorridoEm,
        anonimizadoEm: asCandidatos.anonimizadoEm,
      })
      .from(asCandidaturaEtapas)
      .innerJoin(asCandidaturas, eq(asCandidaturas.id, asCandidaturaEtapas.candidaturaId))
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(
        and(
          eq(asCandidaturas.vagaId, vagaId),
          eq(asCandidaturaEtapas.vagaStatusEventoId, evento.id),
          isNotNull(asCandidaturaEtapas.situacao),
        ),
      )
      .orderBy(asc(asCandidatos.nome));

    const linhas: LinhaParaReabrir[] = doEvento
      .filter((l) => !jaDeVolta.has(l.candidatoId))
      .map((l) => ({
        candidaturaId: l.candidaturaId,
        candidatoId: l.candidatoId,
        candidatoNome: l.candidatoNome,
        situacaoAtual: l.situacaoAtual,
        etapaOrigem: l.etapaOrigem,
        /*
         * A ORIGEM É LIDA, NUNCA ADIVINHADA, e a leitura é ESTREITA: só `ATIVO` e `ALOCADO` voltam.
         * Qualquer outro valor gravado na coluna (um desfecho que o forçado nunca produz) vira nulo,
         * e nulo volta em seleção. Fail-closed: o erro possível é trazer alguém em seleção quando
         * ele estava alocado, nunca inventar uma entrega.
         */
        situacaoOrigem:
          l.situacaoOrigem === "ATIVO" || l.situacaoOrigem === "ALOCADO" ? l.situacaoOrigem : null,
        posicaoLadoOrigem: l.posicaoLadoOrigem === "BANCO" || l.posicaoLadoOrigem === "OFICIAL"
          ? l.posicaoLadoOrigem
          : null,
        motivoSaida: l.motivoSaida,
        saidaEm: l.saidaEm,
        anonimizado: l.anonimizadoEm !== null,
      }));

    /*
     * O EVENTO EXISTE E NINGUÉM APONTA PARA ELE: o cancelamento foi NORMAL, a vaga estava vazia de
     * processo vivo e nada foi encerrado. Não há o que desfazer, e a lista vazia é a resposta certa.
     * Dizer `SEM_ORIGEM` aqui é o erro que o veto matou: ofereceria os DESCARTADO de sempre.
     */
    return {
      origem: linhas.length > 0 ? "COM_ORIGEM" : "NINGUEM_DESCARTADO",
      linhas,
      daVaga,
    };
  }

  /**
   * ─ A PRÉVIA DO REABRIR: o que o Master vê ANTES de escolher ────────────────────────────────────
   *
   * ELA NÃO ESCREVE NADA e não trava a linha da vaga: é leitura. A decisão vale sob o lock, no
   * `reabrir`, e é lá que o conjunto é recalculado. Uma prévia velha não autoriza nada.
   *
   * QUEM NÃO É MASTER RECEBE LISTA VAZIA, em vez de erro. A rota já leva `@Roles`, então isto é a
   * segunda camada: se algum dia o decorador sair no meio de uma refatoração, o COMUM continua sem
   * conseguir ENUMERAR os descartados de qualquer vaga pela URL da API. `podeReabrir: false` é o que
   * a tela usa para mostrar o AVISO, porque o botão não se esconde (decisão do diretor).
   *
   * §A.6: nome, etapa, situação de origem, motivo e data da saída. Sem CPF, sem contato, sem
   * identificador direto, exatamente o recorte que a recusa do cancelamento já trafega hoje.
   */
  async previaDeReabertura(id: string, user: AuthUser): Promise<AsVagaReabrirPrevia> {
    const podeReabrir = this.podeReabrir(user);
    if (!podeReabrir) {
      /*
       * `NINGUEM_DESCARTADO` É O VALOR INERTE, escolhido entre os três: ele é o único que NÃO pede
       * aviso nenhum na tela (o `SEM_ORIGEM` pediria) e o único que combina com lista vazia sem
       * afirmar nada sobre o cancelamento. Nada foi lido do banco neste caminho, e é esse o ponto.
       */
      return { vagaId: id, candidaturas: [], origem: "NINGUEM_DESCARTADO", podeReabrir };
    }

    const regua = await this.statusVaga.regua();

    /*
     * ─ A PRÉVIA CONFERE O ESTADO DA VAGA, e ela NÃO conferia (achado da reauditoria, onda B3) ────
     *
     * A ESCRITA JÁ RECUSAVA vaga que não está no papel CANCELAMENTO, então não havia dano possível.
     * O problema era a prévia AFIRMAR: numa vaga ABERTA ela respondia `SEM_ORIGEM` (a vaga nunca foi
     * cancelada, logo não há evento de cancelamento) e devolvia TODOS os descartados dela, e a tela
     * pintava o alerta dizendo "este cancelamento é anterior ao registro de origem" sobre uma vaga
     * que NUNCA FOI CANCELADA. Uma API que serve uma frase falsa ensina a tela a mentir.
     *
     * E ela enumerava descartados por uma rota cujo nome promete outra coisa. O acesso é Master, e
     * a mesma lista já é legível por outra rota, então não é vazamento novo: é superfície que não
     * precisa existir. Uma linha resolve, e alinha a leitura com a escrita.
     */
    const [vaga] = await this.db
      .select({ status: vagas.status })
      .from(vagas)
      .where(eq(vagas.id, id))
      .limit(1);

    // SEM `for update`: isto é leitura, e a decisão que vale é a do `reabrir`, sob o lock.
    if (!vaga || !regua.ehDoPapel(vaga.status, "CANCELAMENTO")) {
      return { vagaId: id, candidaturas: [], origem: "NINGUEM_DESCARTADO", podeReabrir };
    }

    const { origem, linhas } = await this.conjuntoDoReabrir(
      this.db,
      id,
      regua.codigoDoPapel("CANCELAMENTO"),
    );

    return {
      vagaId: id,
      candidaturas: linhas.map((l) => this.paraATela(l)),
      origem,
      podeReabrir,
    };
  }

  /** A linha do conjunto virando linha de tela. §A.6: o que NÃO está aqui é a régua. */
  private paraATela(l: LinhaParaReabrir): AsCandidaturaParaReabrir {
    return {
      candidaturaId: l.candidaturaId,
      candidatoId: l.candidatoId,
      candidatoNome: l.candidatoNome,
      etapaOrigem: l.etapaOrigem,
      situacaoOrigem: l.situacaoOrigem,
      posicaoLadoOrigem: l.posicaoLadoOrigem,
      motivoSaida: l.motivoSaida,
      saidaEm: l.saidaEm ? l.saidaEm.toISOString() : null,
      anonimizado: l.anonimizado,
    };
  }

  /**
   * ─ REABRIR A VAGA CANCELADA (onda B3, peça 2): a QUARTA porta, e a ÚNICA que DESFAZ ────────────
   *
   * ┌─ O QUE ELA É: um encerramento sendo desfeito, e nada mais ─────────────────────────────────┐
   * │ `fechar` e `cancelar` LEVAM a vaga ao estado terminal; `moverStatus` anda entre os status   │
   * │ que não encerram. Esta é a primeira que VOLTA do terminal, e é por isso que ela é a única   │
   * │ do módulo que é de MASTER INTEIRO, por decisão do diretor: cancelar é do consultor, desfazer│
   * │ o cancelamento não é.                                                                       │
   * │                                                                                            │
   * │ SÓ VAGA CANCELADA ENTRA. Aplicar isto à vaga ENTREGUE apagaria a entrega e zeraria os       │
   * │ contadores de quem foi contratado de verdade; aplicá-lo à FECHADA desfaria um fechamento que│
   * │ tem régua própria. A pergunta é feita ao CATÁLOGO, pelo PAPEL, e nunca pelo literal.        │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ ELA RESSUSCITA PESSOAS, E É DAÍ QUE VEM TODO O RESTO DA RÉGUA ────────────────────────────┐
   * │ A restauração é o QUARTO escritor de `as_candidaturas.situacao` e o PRIMEIRO que vai de     │
   * │ ENCERRADA para VIVA, contornando as travas que moram no caminho travado                     │
   * │ (`mudarSituacaoOcupandoPosicao`). Por isso, ANTES de qualquer escrita e SOB O LOCK:          │
   * │   . o conjunto é recalculado (id fora dele é RECUSADO, nunca ignorado em silêncio);         │
   * │   . quem já foi ANONIMIZADO pela retenção é recusado (devolvê-lo a um processo vivo o       │
   * │     protegeria de novo, desfazendo o expurgo pela porta dos fundos, §A.6);                  │
   * │   . duas linhas mortas da MESMA pessoa no mesmo lote são recusadas (o caminho sem origem    │
   * │     pode oferecer as duas: descartada, reentrada, descartada de novo);                      │
   * │   . a CAPACIDADE por lado é conferida, porque a restauração não passa pela trava que a      │
   * │     confere. Sem isto, quem volta ALOCADO enche o cilindro acima da meta e o gate de Master │
   * │     do `fechar` fica contornável.                                                           │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ §A.6: A PROTEÇÃO DO EXPURGO SAI DE GRAÇA, E O QUE NÃO PODE É A LIMPEZA PELA METADE ───────┐
   * │ A cláusula do expurgo (`retencao-candidatos.service`) protege quem tem candidatura VIVA em  │
   * │ vaga NÃO ENCERRADA. Devolver a vaga ao papel ABERTURA (`encerra = false`) faz o reativado   │
   * │ voltar a ser protegido AUTOMATICAMENTE: nenhuma régua nova no expurgo, e nenhuma deve ser   │
   * │ escrita lá. MAS `status` e `encerradaEm: null` saem NO MESMO `.set({...})`: limpar o carimbo│
   * │ sem mover o status recria o ZUMBI PERMANENTE que a onda anterior matou, porque              │
   * │ `v.encerrada_em is null` é fail-closed e PROTEGE todo mundo vivo dentro daquela vaga, para  │
   * │ sempre.                                                                                     │
   * │                                                                                            │
   * │ E QUEM NÃO FOI ESCOLHIDO NÃO É TOCADO, nem com um carimbo de cortesia: para quem está       │
   * │ DESCARTADO, o `atualizado_em` É o relógio do expurgo, e qualquer escrita nele reinicia em   │
   * │ silêncio dois anos de retenção de dado pessoal de gente que ninguém trouxe de volta.        │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A LIMPEZA DOS CARIMBOS É O COMBINADO DO `cancelar`, e não uma escolha nova: está escrito no
   * comentário dele que a reabertura limpa, e que o fato passou a viver na trilha da vaga justamente
   * para a limpeza não levar embora a única cópia. Limpa-se tudo que descreve o encerramento, e
   * `vagas_fechadas`, `vagas_fechadas_banco` e `data_fechamento` entram na lista: deixados para trás,
   * a vaga volta viva com a contagem CONGELADA e o contador de dias lendo uma data de fechamento que
   * não existe mais.
   *
   * §A.6: nenhum dado de pessoa na trilha da vaga (motivo, observação e CONTAGEM), e nada em log.
   */
  async reabrir(id: string, dto: ReabrirVagaDto, user: AuthUser): Promise<VagaListItem> {
    /*
     * O PAPEL É CONFERIDO AQUI, ANTES DE QUALQUER LEITURA, e não só no `@Roles` da rota. O guard é a
     * primeira autoridade; esta é a que vale para todo chamador interno que não passe por ele. A
     * recusa é ESTRUTURADA porque o botão NÃO se esconde (decisão do diretor): o consultor clica e o
     * sistema DIZ que só o Master reabre, em vez de a ação simplesmente não existir na tela dele.
     */
    if (!this.podeReabrir(user)) {
      const corpo: AsVagaReabrirNegado = {
        needsConfirmation: false,
        reason: "reabrirEhDeMaster",
        message:
          "Reabrir uma vaga cancelada é ação de Master. Peça a reabertura a quem tem esse papel.",
      };
      throw new ForbiddenException(corpo);
    }

    /*
     * OS CATÁLOGOS ANTES DA TRANSAÇÃO, pela régua da casa: catálogo pequeno, sem relação com a linha
     * travada, e buscá-lo lá dentro só alongaria o tempo com a trava segurada. O STATUS DA VAGA
     * continua sendo lido SOB o `FOR UPDATE`.
     *
     * AS ETAPAS VÊM COM AS INATIVAS (`listar(true)`) porque a decisão precisa das duas metades: se a
     * etapa de origem ainda está ativa, e qual é a inicial quando ela não está.
     */
    const regua = await this.statusVaga.regua();
    const codigoAbertura = regua.codigoDoPapel("ABERTURA");
    const codigoCancelamento = regua.codigoDoPapel("CANCELAMENTO");
    const etapas = await this.etapas.listar(true);

    // A LISTA CHEGA SEM REPETIDO: o mesmo id duas vezes é erro de tela, e o segundo passaria por uma
    // candidatura já restaurada, caindo na guarda de "quem está vivo não volta" com frase errada.
    const ids = [...new Set(dto.candidaturaIds ?? [])];

    try {
      await this.db.transaction(async (tx) => {
        // ── A LINHA DA VAGA É TRAVADA ANTES DE QUALQUER DECISÃO, como nas outras três portas. Sem
        // ela, o reabrir corre com o `cancelar` e com a finalização de posição, que disputam a MESMA
        // linha, e decide sobre uma fotografia velha.
        const [vaga] = await tx
          .select({
            id: vagas.id,
            status: vagas.status,
            posicoesOficiais: vagas.posicoesOficiais,
            posicoesBanco: vagas.posicoesBanco,
          })
          .from(vagas)
          .where(eq(vagas.id, id))
          .for("update");
        if (!vaga) throw new NotFoundException("Vaga não encontrada.");

        if (!regua.ehDoPapel(vaga.status, "CANCELAMENTO")) {
          throw new ConflictException(
            "Só uma vaga CANCELADA é reaberta por aqui. Recarregue a página.",
          );
        }

        const { origem, linhas, daVaga } = await this.conjuntoDoReabrir(
          tx,
          id,
          codigoCancelamento,
        );
        const escolhidos = this.travaDaSelecao(ids, linhas, daVaga);
        this.travaDaCapacidade(escolhidos, daVaga, vaga);

        /*
         * A TRILHA ENTRA PRIMEIRO, e a ordem é a mesma do `cancelar`: é o ID DELE que cada volta
         * carimba como marcador, e é ele a única cópia do fato depois que os carimbos da linha da
         * vaga forem limpos logo abaixo.
         */
        const [evento] = await tx
          .insert(asVagaStatusEventos)
          .values({
            vagaId: id,
            de: vaga.status,
            para: codigoAbertura,
            // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
            porId: user.id,
            observacao: this.narrativaDaReabertura(dto, origem, escolhidos.length),
          })
          .returning({ id: asVagaStatusEventos.id });

        for (const escolhido of escolhidos) {
          const destino = this.etapaDeRetorno(etapas, escolhido.etapaOrigem);
          await restaurarCandidatura(
            tx,
            {
              id: escolhido.candidaturaId,
              situacaoAtual: escolhido.situacaoAtual,
              etapaDestino: destino.codigo,
              // ORIGEM NULA VOLTA EM SELEÇÃO. `ATIVO` é o estado que não afirma nada além de "está
              // em processo"; voltar como ALOCADO ocuparia uma posição que ninguém provou que ela
              // tinha e encheria o cilindro com uma entrega que talvez nunca tenha existido.
              situacao: escolhido.situacaoOrigem ?? "ATIVO",
              posicaoLadoOrigem: escolhido.posicaoLadoOrigem,
            },
            {
              motivo: this.motivoDoRetorno(origem, destino),
              porId: user.id,
              vagaStatusEventoId: evento.id,
              /*
               * O ACEITE SÓ EXISTE NO CAMINHO SEM ORIGEM, e é o registro da §A.3 regra 8: ali o
               * sistema ADMITE que não sabe se aquela saída veio do cancelamento, e o Master está
               * REESCOLHENDO a pessoa, com o mesmo peso da ciência de reentrada. No caminho com
               * origem não há guarda a atravessar: reabrir é desfazer o gesto que o próprio sistema
               * registrou. VALOR PRÓPRIO, e não o `REENTRADA`: conflatar os dois deixaria a
               * auditoria sem resposta para "quem usou o caminho arriscado".
               */
              aceite: origem === "SEM_ORIGEM" ? ACEITE_REABERTURA_SEM_ORIGEM : null,
            },
          );
        }

        await tx
          .update(vagas)
          .set({
            // O CÓDIGO VEM DO PAPEL, resolvido antes da transação, e NUNCA do corpo nem do literal
            // "ABERTA": o status é catálogo do diretor desde a B2, e o literal é o defeito que ela
            // matou. Aceitá-lo do corpo faria desta rota a porta sem régua para qualquer status.
            status: codigoAbertura,
            /*
             * `encerradaEm` SAI NO MESMO `set` DO STATUS, e as duas metades importam. Limpar o
             * carimbo sem mover o status deixaria a vaga ENCERRADA com `encerrada_em` nulo, e essa
             * combinação é fail-closed no expurgo (`v.encerrada_em is null` PROTEGE): todo mundo
             * vivo dentro dela ficaria retido para sempre. Mover o status sem limpar o carimbo
             * deixaria a vaga viva afirmando o instante em que acabou.
             */
            encerradaEm: null,
            /*
             * OS CARIMBOS DO CANCELAMENTO, TODOS. Eles descrevem o estado ATUAL da linha, e vaga
             * reaberta não está cancelada. O FATO não se perde: ele foi copiado para a observação do
             * evento no instante do cancelamento, exatamente para esta limpeza ser possível.
             */
            canceladaPorId: null,
            canceladaEm: null,
            cancelamentoMotivo: null,
            cancelamentoObservacao: null,
            cancelamentoForcadoPorId: null,
            cancelamentoForcadoEm: null,
            cancelamentoForcadoSeguravam: null,
            /*
             * OS TRÊS DO ENCERRAMENTO, que o `cancelar` também escreve. Deixados para trás, a vaga
             * volta viva com a CONTAGEM CONGELADA (o cilindro mostraria o retrato do dia do
             * cancelamento em vez da ocupação derivada de agora) e com o contador de dias lendo uma
             * data de fechamento que não existe mais.
             */
            dataFechamento: null,
            vagasFechadas: null,
            vagasFechadasBanco: null,
            atualizadoEm: new Date(),
          })
          .where(eq(vagas.id, id));
      });
    } catch (err) {
      throw this.traduzirConflitoDaReabertura(err);
    }

    return this.devolverVaga(id, "Vaga reaberta, mas não encontrada na listagem.");
  }

  /**
   * A TRAVA DA SELEÇÃO: cada id escolhido pertence ao conjunto DAQUELE cancelamento, e volta uma vez.
   *
   * ID FORA DO CONJUNTO É RECUSADO, NUNCA IGNORADO. Ignorar em silêncio é pior: o Master manda
   * reativar cinco, o sistema reativa três e responde que deu tudo certo. A diferença só aparece
   * quando alguém der falta da pessoa, meses depois.
   *
   * A OPERAÇÃO É ATÔMICA: como a recusa acontece dentro da transação e antes de qualquer escrita, ou
   * vale a lista inteira, ou nada é gravado.
   */
  private travaDaSelecao(
    ids: string[],
    linhas: LinhaParaReabrir[],
    daVaga: LinhaDeCandidatura[],
  ): LinhaParaReabrir[] {
    const porId = new Map(linhas.map((l) => [l.candidaturaId, l]));
    const escolhidos: LinhaParaReabrir[] = [];

    for (const candidaturaId of ids) {
      const linha = porId.get(candidaturaId);
      if (!linha) {
        /*
         * A FRASE SEPARA OS DOIS CASOS porque eles pedem ações diferentes. "Já está de volta" é uma
         * tela velha e resolve-se recarregando; "não saiu neste cancelamento" é uma escolha que o
         * sistema não vai fazer, e insistir não adianta.
         */
        const daLinha = daVaga.find((l) => l.candidaturaId === candidaturaId);
        const jaDeVolta =
          daLinha &&
          daVaga.some((l) => l.candidatoId === daLinha.candidatoId && candidaturaViva(l.situacao));
        throw new ConflictException(
          jaDeVolta
            ? "Uma das pessoas escolhidas já está de volta nesta vaga. Recarregue a página e escolha de novo."
            : "Há alguém na sua escolha que não saiu neste cancelamento. Recarregue a página e escolha de novo.",
        );
      }

      /*
       * ┌─ O EXPURGADO NÃO VOLTA, E ISTO NÃO É CAUTELA, É §A.6 ────────────────────────────────┐
       * │ A retenção já trocou o nome dele por "Candidato Expurgado" e apagou CPF, e-mail,      │
       * │ telefone e nascimento. Devolvê-lo a um processo VIVO o protegeria de novo pela cláusula│
       * │ do expurgo, ou seja, o apagamento seria DESFEITO pela porta dos fundos, e a tela ainda │
       * │ convidaria alguém a redigitar os dados para "consertar o fantasma". Ele APARECE na     │
       * │ prévia, marcado, porque sumir faria o Master procurar para sempre alguém que ele lembra│
       * │ que estava lá.                                                                        │
       * └───────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (linha.anonimizado) {
        throw new ConflictException(
          "Uma das pessoas escolhidas já teve os dados expurgados por prazo de retenção e não pode voltar a um processo. Cadastre a pessoa de novo, se ela ainda tiver interesse.",
        );
      }

      /*
       * DUAS LINHAS MORTAS DA MESMA PESSOA NO MESMO LOTE. O caminho SEM ORIGEM pode oferecer as duas
       * (descartada, reentrada, descartada de novo), e reativar ambas estoura `uq_as_candidaturas_viva`
       * em pleno meio da transação: ninguém é reaberto e o Master perde as outras restaurações. A
       * recusa aqui é a primeira das duas camadas; a segunda é a tradução do 23505.
       */
      if (escolhidos.some((e) => e.candidatoId === linha.candidatoId)) {
        throw new ConflictException(
          "A mesma pessoa está na sua escolha duas vezes, em processos diferentes. Escolha só um deles.",
        );
      }

      escolhidos.push(linha);
    }

    return escolhidos;
  }

  /**
   * ─ A TRAVA DE CAPACIDADE, que a restauração NÃO herda de lugar nenhum ──────────────────────────
   *
   * POR QUE ELA PRECISA EXISTIR AQUI: quem entrega posição pelo caminho normal passa por
   * `mudarSituacaoOcupandoPosicao`, onde a contagem por lado é confrontada com o teto daquele lado
   * sob a linha da vaga travada. A restauração escreve `situacao` DIRETO, então ela pula essa trava:
   * sem esta conferência, três ALOCADO voltariam para uma vaga de duas posições, o cilindro passaria
   * a mentir e o gate de Master do `fechar` ficaria contornável (a vaga "já entregou tudo").
   *
   * SÓ QUEM VOLTA OCUPANDO POSIÇÃO CONTA. Quem volta EM SELEÇÃO não ocupa nada (`consomePosicao`), e
   * cobrar teto dele travaria a reabertura de uma vaga cheia de gente em processo, que é o caso
   * normal.
   *
   * A CONTA É POR LADO, contra o teto DAQUELE lado (`tetoDoLado`), e nunca a soma dos dois contra a
   * meta oficial: é o mesmo defeito que a separação por lado já corrigiu três vezes neste módulo.
   *
   * META AUSENTE RECUSA A VOLTA OCUPADA, e é fail-closed: sem meta não há teto a respeitar, e deixar
   * passar encheria de entregas uma vaga que ninguém dimensionou. Reabrir SEM trazer ninguém, ou
   * trazendo só gente em seleção, continua funcionando.
   */
  private travaDaCapacidade(
    escolhidos: LinhaParaReabrir[],
    daVaga: LinhaDeCandidatura[],
    vaga: { posicoesOficiais: number | null; posicoesBanco: number | null },
  ): void {
    const queVoltamOcupando = escolhidos.filter(
      (e) => e.situacaoOrigem !== null && consomePosicao(e.situacaoOrigem),
    );
    if (queVoltamOcupando.length === 0) return;

    const ocupadas = ocupadasPorLado(
      daVaga
        .filter((l) => consomePosicao(l.situacao))
        .map((l) => ({ lado: l.posicaoLado, quantas: 1 })),
    );

    for (const lado of POSICAO_LADOS) {
      const voltando = queVoltamOcupando.filter(
        (e) => ladoDaCandidatura(e.posicaoLadoOrigem) === lado,
      ).length;
      if (voltando === 0) continue;

      const teto = tetoDoLado(lado, vaga.posicoesOficiais, vaga.posicoesBanco);
      if (teto === null) {
        throw new ConflictException(
          "Esta vaga ainda não tem o número de posições definido. Informe as posições da vaga antes de trazer de volta quem ocupava posição.",
        );
      }
      if (ocupadas[lado] + voltando > teto) {
        throw new ConflictException(
          lado === "BANCO"
            /*
             * A SAÍDA OFERECIDA É A ÚNICA QUE EXISTE NESTE ESTADO, e a primeira redação oferecia uma
             * IMPOSSÍVEL: ela mandava "aumentar as posições da vaga", e `editarPosicoes` RECUSA vaga
             * encerrada. Como a vaga só é reabrível enquanto CANCELADA, a meta não sobe justamente no
             * único momento em que esta recusa aparece. Mandar o consultor fazer o que o sistema
             * proíbe é pior do que não sugerir nada: ele tenta, leva outra recusa, e conclui que o
             * sistema está quebrado. Reabrir com menos gente FUNCIONA, e a meta se ajusta depois, com
             * a vaga já viva. (Achado da reauditoria do `seguranca`, onda B3.)
             */
            ? `A reserva desta vaga tem ${teto} ${teto === 1 ? "posição" : "posições"} e trazer essas pessoas de volta passaria do limite. Traga menos gente agora: com a vaga reaberta, as posições voltam a ser editáveis.`
            : `Esta vaga tem ${teto} ${teto === 1 ? "posição oficial" : "posições oficiais"} e trazer essas pessoas de volta passaria do limite. Traga menos gente agora: com a vaga reaberta, as posições voltam a ser editáveis.`,
        );
      }
    }
  }

  /**
   * PARA QUE ETAPA A PESSOA VOLTA, e o caso difícil é a etapa que saiu de circulação.
   *
   * AS ETAPAS VIRARAM CATÁLOGO DO DIRETOR (0100) e a FK NÃO impede etapa INATIVA: restaurar para uma
   * coluna que a tela não desenha tornaria a pessoa INVISÍVEL, que é pior do que uma etapa aproximada
   * e REGISTRADA. Então: volta para a etapa de origem se ela estiver ativa; estando inativa, cai na
   * ETAPA INICIAL, e a trilha diz isso com todas as letras (ver `motivoDoRetorno`).
   *
   * LANÇA quando não há etapa inicial ativa, e lançar é o certo: é a mesma recusa do
   * `EtapasFunilService.etapaInicial`, com a mesma frase, porque é o mesmo problema de configuração.
   */
  private etapaDeRetorno(etapas: AsEtapaFunil[], etapaOrigem: string): AsEtapaFunil {
    const origem = etapas.find((e) => e.codigo === etapaOrigem);
    if (origem?.ativa) return origem;

    const inicial = etapas.find((e) => e.ativa && e.inicial);
    if (!inicial) {
      throw new BadRequestException(
        "Nenhuma etapa do funil está marcada como inicial. Marque uma na tela de Etapas Do Funil antes de reabrir a vaga.",
      );
    }
    return inicial;
  }

  /**
   * A FRASE QUE FICA NA LINHA DO TEMPO DE CADA PESSOA que voltou.
   *
   * ELA DIZ O QUE O SISTEMA SABE E O QUE ELE NÃO SABE. No caminho sem origem, quem ler a ficha daqui
   * a seis meses precisa saber que aquela volta foi ESCOLHA de um Master, e não a restauração de um
   * estado registrado. §A.6: processo, nunca pessoa. §A.11: sem travessão.
   */
  private motivoDoRetorno(origem: AsVagaReabrirOrigem, destino: AsEtapaFunil): string {
    const base =
      origem === "SEM_ORIGEM"
        ? "Vaga reaberta. O cancelamento é anterior ao registro de origem, então o processo volta em seleção por escolha de um Master."
        : "Vaga reaberta. O processo volta para a situação registrada no cancelamento.";
    return `${base} Etapa: ${destino.rotulo}.`;
  }

  /**
   * A FRASE QUE FICA NA TRILHA DA VAGA quando alguém reabre, irmã da `narrativaDoCancelamento`.
   *
   * ELA CARREGA A CONTAGEM porque "reaberta trazendo 12 pessoas de volta" e "reaberta sem trazer
   * ninguém" são fatos diferentes, e quem lê a trilha depois precisa distinguir os dois sem cruzar
   * tabela nenhuma. E carrega o CAMINHO, porque o caminho sem origem é uma decisão de gente, não uma
   * restauração de dado.
   *
   * §A.6: uma contagem, um caminho e a observação de quem reabriu. Nenhum nome, nenhum id de
   * candidato, nenhum CPF. §A.11: sem travessão.
   */
  private narrativaDaReabertura(
    dto: ReabrirVagaDto,
    origem: AsVagaReabrirOrigem,
    quantos: number,
  ): string {
    const partes = ["Reaberta."];
    if (quantos === 0) {
      partes.push("Nenhum candidato foi trazido de volta.");
    } else {
      partes.push(
        quantos === 1
          ? "1 candidato trazido de volta."
          : `${quantos} candidatos trazidos de volta.`,
      );
      if (origem === "SEM_ORIGEM") {
        partes.push(
          "O cancelamento é anterior ao registro de origem: quem voltou foi escolhido por um Master e voltou em seleção.",
        );
      }
    }
    if (dto.observacao) partes.push(`Observação: ${dto.observacao}.`);
    return partes.join(" ");
  }

  /**
   * A VIOLAÇÃO DE UNIQUE virando frase de gente, e ela é a SEGUNDA camada da guarda.
   *
   * A PRIMEIRA (a pré-checagem sob o lock, em `travaDaSelecao`) é a que serve: quando o 23505 chega,
   * a transação JÁ MORREU e o Master perde as outras restaurações do lote. Esta existe para o que
   * escapar da primeira chegar como explicação, e não como erro 500.
   *
   * §A.6: a mensagem do Postgres NÃO é repassada. Ela traz o VALOR que violou o índice, e repassá-la
   * publicaria identificador de pessoa na resposta de erro. Mesmo recorte do `traduzirUnique` da
   * Central de Candidatos.
   */
  private traduzirConflitoDaReabertura(err: unknown): unknown {
    const nome = String((err as { constraint_name?: string })?.constraint_name ?? "");
    if (nome === "uq_as_candidaturas_viva") {
      return new ConflictException(
        "Uma das pessoas escolhidas já está nesta vaga. Recarregue a página e escolha de novo.",
      );
    }
    return err;
  }

  /**
   * ─ MOVER O STATUS DA VAGA À MÃO (onda B2). A TERCEIRA PORTA, E ELA NÃO ENCERRA NADA ────────────
   *
   * O QUE ELA É: o caminho para os status que o DIRETOR criou (um "Stand By", um "Aguardando
   * cliente"). Enquanto a lista de status era um enum, a vaga só andava pelos caminhos que o código
   * conhecia; com o catálogo, alguém precisa poder pôr a vaga num status que o código não conhece.
   *
   * ┌─ O QUE ELA NÃO É, E ESSA É A RÉGUA INTEIRA ────────────────────────────────────────────────┐
   * │ ELA NÃO ENCERRA VAGA. Encerrar tem DUAS portas com régua (`fechar` e `cancelar`), cada uma   │
   * │ com trava de candidato tratado, gate de Master, carimbo de contagem e data de fechamento.    │
   * │ Uma terceira porta sem nada disso seria o achado de 08/09 renascendo com outro nome.         │
   * │                                                                                             │
   * │ ELA NÃO REABRE VAGA ENCERRADA. Reabrir NÃO é mover status: é desfazer um encerramento, com   │
   * │ trava e trilha próprias, e não está nesta onda (§A.14). Deixar a ORIGEM livre aqui           │
   * │ ressuscitaria a vaga cancelada, e com ela o carimbo de contagem abandonado, o contador de    │
   * │ dias voltando a correr e a trilha de cancelamento afirmando um fato que já não vale.         │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ ELA NÃO PUBLICA VAGA, E ESSA TRAVA CUSTOU UM ACHADO ──────────────────────────────────────┐
   * │ `RASCUNHO` NÃO É ORIGEM VÁLIDA. As duas réguas desta onda, cada uma certa sozinha, abriam    │
   * │ juntas uma SEGUNDA PORTA para a publicação: o rascunho não encerra (a origem liberava) e a   │
   * │ `ABERTA` é destino manual (o caminho de volta do zumbi), então um rascunho PELA METADE saía  │
   * │ daqui publicado, sem a régua dos obrigatórios. O bloco dentro da transação conta o caso.     │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * AS DUAS PERGUNTAS SÃO DO VOCABULÁRIO COMPARTILHADO, e não reescritas aqui:
   *  - A ORIGEM passa por `podeSairManualmente`: só sai de status que NÃO encerra. Mais a trava do
   *    RASCUNHO, que é da OPERAÇÃO e não do vocabulário (ver o bloco na transação).
   *  - O DESTINO passa por `podeSerDestinoManual`: ATIVO, MOVÍVEL e que NÃO encerra. A dupla
   *    conferência ali é deliberada (`movivelManualmente` sozinho seria a única coisa entre um
   *    clique e o estado terminal), e o CHECK 3 do banco a repete numa terceira camada.
   *
   * ┌─ SEM `@Roles` NA ROTA, E A AUTORIDADE É ESTE SERVICE ──────────────────────────────────────┐
   * │ É o mesmo desenho do `fechar` e do `cancelar`: pôr uma vaga em "Stand By" é operação de      │
   * │ consultor, não configuração de sistema. O que é de SUPER_ADMIN é EDITAR A LISTA de status    │
   * │ (`VagaStatusAdminController`), e essa está gatada por papel.                                 │
   * │                                                                                             │
   * │ E O ARGUMENTO SÓ SE SUSTENTA COM AS TRAVAS ACIMA NO LUGAR: "a autoridade é o service" é a    │
   * │ frase que justificou a ausência de `@Roles` no fechamento, e ela só é verdadeira enquanto    │
   * │ `fechar` e `cancelar` forem as ÚNICAS portas para o estado terminal. Esta rota preserva isso │
   * │ recusando destino que encerra, nas três camadas.                                             │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `SELECT ... FOR UPDATE` NÃO É ZELO: sem ele, esta rota SOBRESCREVE o `CANCELADA` que o
   * `cancelar` acabou de gravar. Os dois disputam a MESMA linha, e os dois locks se enxergam: o
   * movimento que chegar no meio de um cancelamento espera, e quando ler encontrará a vaga já
   * encerrada, caindo na trava de origem. Lock sem trava de origem serializa um estrago em vez de
   * evitá-lo.
   *
   * A TRILHA VAI NA MESMA TRANSAÇÃO da mudança de status, pelo mesmo motivo já escrito na redução de
   * meta: "rastro que pode FALTAR quando a escrita deu certo não é rastro". Não existe o estado de
   * vaga movida sem o evento que diz quem a moveu.
   *
   * §A.6: a trilha guarda id de vaga, dois códigos, id de usuário INTERNO, data e a observação de
   * quem moveu. Nenhum dado de candidato.
   */
  async moverStatus(
    id: string,
    dto: MoverStatusVagaDto,
    user: AuthUser,
  ): Promise<VagaListItem> {
    /*
     * O CATÁLOGO ANTES DA TRANSAÇÃO, e o DESTINO conferido antes também: um código que não existe ou
     * que não pode receber vaga é erro de CORPO, não conflito de estado. Recusar antes de travar a
     * linha é a diferença entre um 400 imediato e um lock segurado à toa.
     */
    const regua = await this.statusVaga.regua();
    if (!regua.existe(dto.status)) {
      throw new BadRequestException("Este status não existe. Recarregue a página.");
    }
    if (!regua.podeEntrar(dto.status)) {
      throw new ConflictException(
        `A vaga não pode ser movida para "${regua.rotulo(dto.status)}": este status ou está fora de circulação, ou encerra a vaga. Para encerrar, use fechar vaga ou cancelar vaga, que é onde o sistema confere os candidatos pendentes e as posições preenchidas.`,
      );
    }

    await this.db.transaction(async (tx) => {
      // ── A LINHA DA VAGA É TRAVADA ANTES DE QUALQUER DECISÃO, como no fechamento e no cancelamento.
      const [vaga] = await tx
        .select({ id: vagas.id, status: vagas.status })
        .from(vagas)
        .where(eq(vagas.id, id))
        .for("update");
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");

      /*
       * ┌─ A TRAVA DE ORIGEM SÃO DUAS CONDIÇÕES, E A SEGUNDA NÃO É REDUNDANTE ────────────────────┐
       * │ A PRIMEIRA é `podeSairManualmente`: só sai de status que NÃO ENCERRA. Quem chega aqui    │
       * │ numa vaga já encerrada está com a tela velha (duplo clique, ou outra pessoa encerrou a   │
       * │ vaga enquanto o modal estava aberto), e deixar a origem livre ressuscitaria a vaga       │
       * │ cancelada, com o carimbo de contagem abandonado e o contador de dias voltando a correr.  │
       * │                                                                                          │
       * │ A SEGUNDA é o RASCUNHO, e ela fecha uma porta que as regras desta onda abriram JUNTAS,   │
       * │ sem que nenhuma delas esteja errada sozinha (achado do `tester`, MEDIDO):                │
       * │   . `RASCUNHO` não encerra, então a primeira condição libera a SAÍDA;                    │
       * │   . `ABERTA` é destino manual de propósito (é o caminho de volta que impede a vaga em    │
       * │     status do diretor de virar zumbi), então o destino também libera.                     │
       * │   . resultado: um RASCUNHO com `cod_cliente`, `cargo_id`, `salario` e `posicoes_oficiais`│
       * │     NULOS terminava esta chamada PUBLICADO, recebendo candidato e na fila.                │
       * │                                                                                          │
       * │ O QUE NÃO RODA AQUI É A RÉGUA DOS OBRIGATÓRIOS (`travaObrigatorios`), que vive na trilha │
       * │ de abertura junto da higiene de campo dela, inclusive a conferência de dígito do CPF do  │
       * │ substituído (§A.6). É simétrico ao buraco que a dupla conferência do destino fecha:      │
       * │ estávamos protegendo o ENCERRAMENTO e abrindo a PUBLICAÇÃO.                               │
       * │                                                                                          │
       * │ A SAÍDA É NEGAR O CAMINHO, E NÃO DUPLICAR A RÉGUA: cobrar os obrigatórios aqui criaria a │
       * │ SEGUNDA CÓPIA que este módulo passou frentes inteiras eliminando, e as duas divergiriam  │
       * │ na primeira correção feita só em uma. Rascunho publica por UMA porta, a que tem a régua.  │
       * │                                                                                          │
       * │ E A RECUSA É DO RASCUNHO INTEIRO, não só do destino `ABERTA`: liberar a saída do rascunho│
       * │ para um status do diretor deixaria o mesmo desvio em DOIS passos (rascunho vira "Stand   │
       * │ By", "Stand By" vira "Aberta"), com a régua pulada do mesmo jeito. NÃO "SIMPLIFIQUE"     │
       * │ ESTA CONDIÇÃO ACHANDO QUE ELA É COBERTA PELA PRIMEIRA: ela é a única que existe.          │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (!regua.podeSair(vaga.status)) {
        throw new ConflictException(
          "Esta vaga já foi encerrada e o status dela não muda mais por aqui. Recarregue a página.",
        );
      }
      if (regua.ehDoPapel(vaga.status, "RASCUNHO")) {
        throw new ConflictException(
          "O rascunho é publicado pela trilha de abertura, que confere os campos obrigatórios.",
        );
      }
      // O MOVIMENTO PARA ONDE A VAGA JÁ ESTÁ NÃO É MOVIMENTO: gravá-lo encheria a trilha de linhas
      // que não contam nada e faria a camada 2 do apagar ver rastro onde não houve.
      if (vaga.status === dto.status) {
        throw new ConflictException("A vaga já está neste status. Recarregue a página.");
      }

      await tx
        .update(vagas)
        .set({ status: dto.status, atualizadoEm: new Date() })
        .where(eq(vagas.id, id));

      await tx.insert(asVagaStatusEventos).values({
        vagaId: id,
        de: vaga.status,
        para: dto.status,
        // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
        porId: user.id,
        observacao: texto(dto.observacao),
      });
    });

    return this.devolverVaga(id, "Status alterado, mas a vaga não foi encontrada na listagem.");
  }

  /**
   * ─ A TRAVA DO CANCELAMENTO: QUEM AINDA ESTÁ COM O PROCESSO EM ABERTO NESTA VAGA ────────────────
   *
   * A RÉGUA VEM DO VOCABULÁRIO COMPARTILHADO (`seguraOCancelamento`), e NÃO de uma lista escrita
   * aqui: `ATIVO` e `ALOCADO` seguram; `APROVADO`, `ENVIADO_PARA_ADMISSAO`, `DESCARTADO` e
   * `DESISTIU` estão encerrados e não seguram nada. A derivação é fail-closed pela direção que
   * protege: a lista enumera os ENCERRADOS, então situação NOVA nasce SEGURANDO o cancelamento.
   *
   * NÃO É A RÉGUA DO FECHAMENTO. Ver o bloco no `cancelar`: `pendentesDeTratamento` considera o
   * `ALOCADO` tratado, e usá-la aqui deixaria cancelar por cima de gente entregue.
   *
   * ┌─ A AUTORIZAÇÃO MORA AQUI, E NUNCA EM `@Roles` NA ROTA ─────────────────────────────────────┐
   * │ TODO CONSULTOR PRECISA PODER CANCELAR UMA VAGA VAZIA. Só o FORÇAR é de Master, então um     │
   * │ `@Roles("MASTER","SUPER_ADMIN")` no handler barraria o cancelamento NORMAL do COMUM, que é  │
   * │ regressão silenciosa. A tela esconder o botão é conveniência (`podeForcar`); o servidor é a │
   * │ autoridade, e ele reconfere o papel A CADA requisição que chega com `forcar: true`.         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A ORDEM DA LISTA é a mesma da recusa do fechamento: do FIM do funil para o começo, pela ordem do
   * CATÁLOGO (`posicaoNoFunil`), porque quem está mais adiante é o mais caro de encerrar sem aviso.
   *
   * Devolve `null` quando ninguém segurava, ou o que gravar (e quem encerrar) quando houve exceção.
   */
  /**
   * A FRASE QUE FICA NA TRILHA DA VAGA quando alguém cancela, e ela é a ÚNICA cópia que sobrevive.
   *
   * POR QUE ELA PRECISA CARREGAR O MOTIVO: a REABERTURA limpa os carimbos de cancelamento da linha
   * da vaga, e limpa com razão, porque aquelas colunas descrevem o estado ATUAL e vaga reaberta não
   * está cancelada. Se o motivo vivesse só lá, a reabertura apagaria para sempre a resposta de "por
   * que esta vaga chegou a ser cancelada". Aqui ele fica.
   *
   * O NÚMERO DO FORÇADO ENTRA PORQUE ELE É O TAMANHO DA EXCEÇÃO. "Cancelada por cima de 12 pessoas
   * em processo" e "cancelada com a vaga vazia" são fatos diferentes, e quem lê a trilha seis meses
   * depois precisa distinguir os dois sem ter de cruzar tabela nenhuma.
   *
   * §A.6: motivo do catálogo, observação de quem cancelou e uma CONTAGEM. Nenhum nome, nenhum id de
   * candidato, nenhum CPF. O que identifica pessoa fica na linha do tempo dela, não na da vaga.
   */
  private narrativaDoCancelamento(
    dto: CancelarVagaDto,
    forcado: { seguravam: number } | null,
  ): string {
    const partes = [`Cancelada. Motivo: ${dto.motivo}.`];
    if (dto.observacao) partes.push(`Observação: ${dto.observacao}.`);
    if (forcado) {
      partes.push(
        forcado.seguravam === 1
          ? "Cancelamento forçado por um Master, com 1 candidato ainda em processo, que foi encerrado junto."
          : `Cancelamento forçado por um Master, com ${forcado.seguravam} candidatos ainda em processo, que foram encerrados juntos.`,
      );
    }
    return partes.join(" ");
  }

  private travaCandidatosQueSeguram(
    linhas: LinhaDeCandidatura[],
    ordemDoFunil: ReadonlyMap<string, number>,
    dto: CancelarVagaDto,
    user: AuthUser,
  ): { seguravam: number; seguravamCandidaturas: LinhaDeCandidatura[] } | null {
    const seguram = linhas.filter((l) => seguraOCancelamento(l.situacao));
    if (seguram.length === 0) return null;

    const ordenados = [...seguram].sort(
      (a, b) => posicaoNoFunil(b.etapa, ordemDoFunil) - posicaoNoFunil(a.etapa, ordemDoFunil),
    );

    // O PAPEL É RESOLVIDO NO SERVIDOR, e volta no corpo da recusa só para a tela não oferecer ao
    // COMUM um botão que vai receber 403. Quem decide continua sendo esta função.
    const podeForcar = user.papel === "MASTER" || user.papel === "SUPER_ADMIN";

    if (!dto.forcar) {
      /*
       * A RECUSA É ESTRUTURADA, e não uma frase: a tela abre o modal com a lista e oferece o
       * "cancelar assim mesmo" a quem pode, sem recontar nada e sem casar por texto de mensagem.
       *
       * `needsConfirmation: true`, e é a PRIMEIRA VEZ que esse campo vale `true` num encerramento de
       * vaga. No fechamento ele é `false` porque lá não existe "confirmar mesmo assim"; aqui existe,
       * por decisão do diretor: o consultor encerra cada processo primeiro, ou um Master cancela por
       * cima e a exceção fica registrada em nome dele.
       *
       * A `message` VIAJA JUNTO porque a mensagem de erro do sistema vem do backend, sempre: sem
       * ela, o tratamento genérico mostraria "Conflict" ao consultor.
       */
      const corpo: AsVagaCancelamentoBloqueado = {
        needsConfirmation: true,
        reason: "candidatosNaoEncerrados",
        message:
          seguram.length === 1
            ? "Esta vaga ainda tem 1 candidato com o processo em aberto. Encerre o processo dele, ou peça a um Master para cancelar assim mesmo."
            : `Esta vaga ainda tem ${seguram.length} candidatos com o processo em aberto. Encerre os processos, ou peça a um Master para cancelar assim mesmo.`,
        naoEncerrados: ordenados.map((l) => ({
          candidaturaId: l.candidaturaId,
          candidatoId: l.candidatoId,
          candidatoNome: l.candidatoNome,
          etapa: l.etapa,
          situacao: l.situacao,
        })),
        podeForcar,
      };
      throw new ConflictException(corpo);
    }

    if (!podeForcar) {
      throw new ForbiddenException(
        "Cancelar a vaga com candidato em processo é ação de Master. Encerre os processos em aberto, ou peça a um Master para cancelar assim mesmo.",
      );
    }

    return { seguravam: seguram.length, seguravamCandidaturas: ordenados };
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
