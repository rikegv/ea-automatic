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
  AsCidade,
  AsCandidaturaParaReabrir,
  AsEtapaFunil,
  AsOcupacaoVaga,
  AsVagaFechamentoBloqueado,
  CandidaturaEtapa,
  CandidaturaSituacao,
  AsVagaReabrirNegado,
  AsVagaReabrirOrigem,
  AsVagaReabrirPrevia,
  FecharVagaRecusa,
  PapelAs,
  PosicaoLado,
  VagaContextoAs,
  VagaDetalhe,
  VagaListItem,
  VagaMetaReducao,
  VagaStatus,
} from "@ea/shared-types";
import { VAGA_STATUS_PAPEIS_LIBERADAS } from "@ea/shared-types";
import {
  CANDIDATURA_SITUACOES,
  type AsVagaCancelamentoPrevia,
  type PropostaDeClienteDaVaga,
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
  textoPendencia,
} from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidatos,
  asCandidaturaEtapas,
  asCandidaturas,
  asCidades,
  asComerciais,
  asLinhasServico,
  asSegmentos,
  beneficiosCatalogo,
  cargos,
  clientes,
  escalasCatalogo,
  motivosContratacao,
  usuarios,
  asVagaStatusEventos,
  vagaBeneficio,
  vagaClienteCorrecoes,
  vagaConsultorTransferencias,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import { normalizarCodigoDeVaga } from "../../domain/as-depara-cliente-vaga";
import { vagaDaPlanilhaSai } from "../../domain/as-planilha-status-vaga";
import {
  camposComProcedenciaDaPlanilha,
  procedenciaALimpar,
} from "../../domain/as-planilha-prepreenchimento";
import { FONTE_DO_DEPARA_DE_CLIENTE } from "../depara-cliente/depara-cliente.fonte";
import { derivarStatusDaVaga } from "./derivar-status-da-vaga";
/*
 * A PROCEDÊNCIA DO CLIENTE NA LIBERAÇÃO (item 8 do de/para de cliente, 01/10/2026).
 *
 * MÓDULO SEPARADO DE PROPÓSITO, e não por tamanho: a proposta de cliente vinda da planilha tem LISTA
 * BRANCA DE LEITORES, conferida por varredura de fonte, e este arquivo fica FORA dela porque é ele
 * que escreve `cod_cliente`. O que atravessa esta fronteira é um CÓDIGO de procedência; o cliente
 * proposto não chega aqui, e por isso não há como confundi-lo com o cliente escolhido.
 */
import {
  fraseDaProcedenciaDoCliente,
  procedenciaDoClienteNaLiberacao,
  propostasDeClienteDasVagas,
} from "./vagas-revisao-proposta";
import {
  ACEITE_REABERTURA_SEM_ORIGEM,
  SITUACOES_VIVAS,
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
  codigoColideComVagaManual,
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
  CorrigirLiberacaoRevisaoDto,
  LiberarVagaRevisaoDto,
  TransferirConsultorDaVagaDto,
} from "./vagas.dto";
import { idiomasGravados, type VagaIdiomaGravado } from "../../domain/vaga-idioma";
import {
  MENSAGEM_NUMERO_PANDAPE_DUPLICADO,
  ehNumeroPandapeDuplicado,
} from "../../domain/vaga-numero-pandape-unico";
import type { VagaItemOndaE } from "./vaga-item-onda-e";

/**
 * ─ O ITEM DA ABA RECUSADAS (F4), PONTE LOCAL ATÉ O SHARED-TYPES GANHAR OS CAMPOS ───────────────
 *
 * MESMA FORMA da fila de revisão (`VagaItemOndaE`), MAIS quem recusou e quando. É o contrato que o
 * front consome. Mora aqui, e não em `packages/shared-types`, pela MESMA razão do `vaga-item-onda-e`:
 * aquele arquivo é do COORDENADOR nesta frente (§A.39, arquivo compartilhado com dono único). Quando
 * os dois campos entrarem em `VagaListItem`/um tipo próprio, este alias some.
 */
export type VagaItemRecusada = VagaItemOndaE & {
  recusadaEm: string | null;
  recusadaPorNome: string | null;
};
import {
  pendenciasDaVaga,
  type VagaCamposObrigatoriosComLinha,
} from "../../domain/vaga-obrigatorios";
import { linhaDeServicoEscolhida } from "../linhas-servico/linhas-servico.service";
import { segmentoEscolhido } from "../segmentos/segmentos.service";
import { comercialEscolhido } from "../comerciais/comerciais.service";
import { resolverHerdado } from "../../domain/valor-herdado";
import { restaurarCandidatura } from "../candidatos/restaurar-candidatura";
/*
 * A RÉGUA DOS PAPÉIS EM QUE A VAGA ESTÁ EM PROCESSO (Frente B). Ela responde a trava de ORIGEM do
 * `fechar` e do `cancelar`, que antes perguntavam `ehDoPapel(status, "ABERTURA")` e passaram a
 * precisar aceitar a ENTREGA também, porque ela deixou de encerrar. A lista é UMA só, e a mesma que
 * a derivação alcança: ver o porquê no domínio.
 */
import { papelDeVagaEmProcesso } from "../../domain/vaga-status-derivado";
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
  /**
   * ─ A CENTRAL DE VAGAS: SÓ VAGA JÁ LIBERADA (decisão do diretor, 05/10/2026) ───────────────────
   *
   * A Central mostra só o que já foi liberado (aberta, entregue, fechada, cancelada), no mesmo padrão
   * da esteira, que só mostra quem já entrou no fluxo. A `PENDENTE_REVISAO` (504 vagas espelhadas do
   * Pandapé) e a `RASCUNHO` saem COMPLETAMENTE daqui e seguem vivendo só no Liberar Vaga, que lê
   * `pendentesRevisao`/`liberadasDaRevisao` do `list()` CRU. Por isso o filtro mora AQUI e não no
   * `list()`: `list()` é compartilhado (a fila de revisão e o lookup por id precisam da vaga em
   * REVISAO), e filtrá-lo sumiria a vaga do Liberar Vaga também.
   *
   * O recorte é por PAPEL, não por status literal nem pelo evento de liberação: a vaga aberta à mão
   * (trilha "nova", que nasce ABERTA sem nunca ter passado por REVISAO) é liberada e tem de aparecer,
   * e o evento REVISAO->ABERTURA não a alcançaria. `VAGA_STATUS_PAPEIS_LIBERADAS` é a fonte única que
   * o frontend (cards e filtro de status) também lê.
   */
  async listCentral(): Promise<VagaItemOndaE[]> {
    const regua = await this.statusVaga.regua();
    return (await this.list()).filter((v) =>
      VAGA_STATUS_PAPEIS_LIBERADAS.some((papel) => regua.ehDoPapel(v.status, papel)),
    );
  }

  async list(): Promise<VagaItemOndaE[]> {
    const consultor = alias(usuarios, "consultor");
    const recruiter = alias(usuarios, "recruiter");
    const autor = alias(usuarios, "autor");
    // O QUARTO ALIAS DE `usuarios`: quem FORÇOU o fechamento. Ele é nulável duas vezes (a vaga
    // normal não tem forçamento, e o autor do forçamento vira nulo se o usuário for apagado), então
    // o join é LEFT como os outros três.
    const forcadoPor = alias(usuarios, "forcado_por");
    /*
     * ─ QUATRO ALIAS PARA DOIS CATÁLOGOS, E O NÚMERO É A PRÓPRIA HERANÇA (Onda E) ───────────────
     *
     * Cada catálogo é lido DUAS vezes na mesma consulta: uma pela VAGA (a sobreposição) e outra
     * pelo CLIENTE (o que ela herda). Não é desperdício, é a única forma de o `coalesce` ter os
     * DOIS rótulos na mão: o da vaga e o do cliente são linhas DIFERENTES da mesma tabela, e um
     * join só devolveria um deles. Sem o segundo, a vaga que herda chegaria com o id resolvido e
     * o rótulo vazio, e a tela escreveria "não informado" para um cliente que TEM segmento.
     */
    const segmentoDaVaga = alias(asSegmentos, "segmento_vaga");
    const segmentoDoCliente = alias(asSegmentos, "segmento_cliente");
    const comercialDaVaga = alias(asComerciais, "comercial_vaga");
    const comercialDoCliente = alias(asComerciais, "comercial_cliente");

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
        // OS DOIS CATÁLOGOS DA ONDA C, NO MESMO `SELECT`, e não em consultas à parte: a listagem não
        // pagina, então resolver o rótulo da linha e o nome da cidade linha a linha viraria centenas
        // de idas ao banco na tela mais pesada do módulo. É a mesma decisão já tomada para a ocupação
        // derivada e para o rastro de redução de meta, nesta mesma consulta.
        //
        // `leftJoin` NOS DOIS: a esmagadora maioria das vagas de hoje não tem nem linha nem cidade
        // (o campo nasceu agora), e um `innerJoin` as sumiria da listagem inteira.
        linhaServicoRotulo: asLinhasServico.rotulo,
        cidadeNome: asCidades.nome,
        cidadeUf: asCidades.uf,
        /*
         * ─ O SEGMENTO E O COMERCIAL (Onda E), RESOLVIDOS NO MESMO `SELECT` ────────────────────
         *
         * MESMA DECISÃO DA ONDA C, e ela vale com mais força aqui: a listagem NÃO PAGINA, então
         * resolver a herança linha a linha (ler a vaga, depois o cliente dela, depois o catálogo)
         * viraria TRÊS idas ao banco por vaga na tela mais pesada do módulo.
         *
         * O ID DO CLIENTE VEM JUNTO, e ele é a metade que se esquece: sem `clientes.segmentoId` no
         * payload da consulta, o `coalesce` não teria o que coalescer e toda vaga que HERDA (a
         * maioria esmagadora) chegaria vazia.
         *
         * `leftJoin` NOS QUATRO: vaga sem cliente existe (rascunho, e a importada que não casou), e
         * cliente sem segmento é o estado de partida dos 249. Um `innerJoin` sumiria com elas da
         * listagem inteira, em silêncio, que é o pior desfecho possível para uma tela de fila.
         */
        segmentoDaVagaRotulo: segmentoDaVaga.rotulo,
        segmentoDoClienteId: clientes.segmentoId,
        segmentoDoClienteRotulo: segmentoDoCliente.rotulo,
        comercialDaVagaRotulo: comercialDaVaga.rotulo,
        comercialDoClienteId: clientes.comercialId,
        comercialDoClienteRotulo: comercialDoCliente.rotulo,
      })
      .from(vagas)
      .leftJoin(asLinhasServico, eq(asLinhasServico.id, vagas.linhaServicoId))
      .leftJoin(asCidades, eq(asCidades.id, vagas.cidadeId))
      .leftJoin(cargos, eq(cargos.id, vagas.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, vagas.codCliente))
      // OS QUATRO DA ONDA E. Os do CLIENTE dependem do join de `clientes` logo acima, e é por isso
      // que vêm depois dele: é ele que traz `clientes.segmento_id` e `clientes.comercial_id`.
      .leftJoin(segmentoDaVaga, eq(segmentoDaVaga.id, vagas.segmentoId))
      .leftJoin(segmentoDoCliente, eq(segmentoDoCliente.id, clientes.segmentoId))
      .leftJoin(comercialDaVaga, eq(comercialDaVaga.id, vagas.comercialId))
      .leftJoin(comercialDoCliente, eq(comercialDoCliente.id, clientes.comercialId))
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
      // A LINHA DE SERVIÇO (Onda C). O rótulo vem do join e vale inclusive para a linha INATIVADA:
      // a vaga antiga continua dizendo de que linha ela era, em vez de mostrar o código cru.
      linhaServicoId: v.linhaServicoId,
      linhaServicoRotulo: l.linhaServicoRotulo ?? null,
      // A CIDADE (Onda C), AO LADO da UF, que não saiu: `regiaoEstado` continua logo abaixo.
      cidadeId: v.cidadeId,
      cidadeNome: l.cidadeNome ?? null,
      cidadeUf: l.cidadeUf ?? null,
      /*
       * ─ O SEGMENTO E O COMERCIAL (Onda E): A SOBREPOSIÇÃO CRUA **E** O VALOR RESOLVIDO ────────
       *
       * OS DOIS PARES SÃO COISAS DIFERENTES, e por isso os dois viajam:
       *   . `segmentoSobrepostoId` / `comercialSobrepostoId` são a SOBREPOSIÇÃO, crua. É o que o
       *     FORMULÁRIO pré-seleciona, e é por isso que ele NÃO pode ler o resolvido: marcado com o
       *     valor herdado, salvar sem tocar no campo viraria a herança numa sobreposição congelada.
       *   . `segmento` / `comercial` são o valor EFETIVO, com a ORIGEM junto. É o que a TELA
       *     mostra, o que o FILTRO casa e o que a ficha exibe.
       *
       * ┌─ O NOME `segmentoSobrepostoId` É A DEFESA, E ELE NÃO É ENFEITE (achado do `tester`) ────┐
       * │ Chamar a coluna crua de `segmentoId` no item seria pôr, ao lado do valor resolvido, um   │
       * │ campo com o nome MAIS ÓBVIO e o conteúdo ERRADO: ele vale NULO exatamente na vaga que    │
       * │ herda, que é a maioria esmagadora. Quem escrever um filtro pegaria `item.segmentoId` sem │
       * │ pensar, a lista viria curta, e NADA daria erro: haveria resposta a menos. O nome diz o    │
       * │ que o campo é, e quem quiser a sobreposição pede pela sobreposição.                       │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * O FILTRO CASA POR `item.segmento.id`, NUNCA pela coluna crua. Como a resolução acontece UMA
       * vez, aqui, qualquer filtro montado sobre o valor resolvido já nasce ciente da herança, venha
       * ele da tela ou de uma consulta futura.
       */
      segmentoSobrepostoId: v.segmentoId,
      comercialSobrepostoId: v.comercialId,
      segmento: resolverHerdado(
        v.segmentoId,
        l.segmentoDaVagaRotulo,
        l.segmentoDoClienteId,
        l.segmentoDoClienteRotulo,
      ),
      comercial: resolverHerdado(
        v.comercialId,
        l.comercialDaVagaRotulo,
        l.comercialDoClienteId,
        l.comercialDoClienteRotulo,
      ),
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
      // O REALINHAMENTO (0138) ao lado do alinhamento, e nunca no lugar dele: são as duas pontas da
      // comparação que a ficha faz ("o perfil foi combinado em X e realinhado em Y").
      dataRealinhamento: v.dataRealinhamento,
      /*
       * OS CARIMBOS DA REABERTURA (0138). `dataLimiteAnterior` viaja JUNTO do `dataLimite` porque é
       * ele que transforma "esta vaga está com um prazo novo" em "este prazo foi RENEGOCIADO, de X
       * para Y". Sem a cópia, a vaga reaberta e a vaga que sempre teve aquele prazo ficam iguais.
       */
      dataReabertura: v.dataReabertura,
      dataLimiteAnterior: v.dataLimiteAnterior,
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
      // ─ O `substituidoCpf` NÃO DESCE MAIS NA LISTA (correção de LGPD ativo, 22/09/2026) ─────────
      // Ele descia CRU para TODA vaga, a cada carga, para todo consultor com o menu, e NENHUMA coluna
      // o mostrava: só alimentava a ficha de edição/clone/liberação. Isso é o oposto da minimização
      // (§A.6). O tipo compartilhado (`VagaListItem`) já perdeu o campo; o CPF agora desce de UMA vaga
      // por vez, pela rota de detalhe (`detalhe(id)` abaixo, servida por `GET /as/vagas/:id`), quando
      // o consultor abre AQUELA vaga. O `substituidoNome` FICA: é coluna visível, e nome não é a chave
      // nacional que o CPF é. A retenção do CPF (decisão do diretor, 22/08) não mudou, só QUANDO desce.
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
      // A COLUNA LEGADA, devolvida como sempre foi (`string[]`), para quem ainda a lê não passar a
      // ler `undefined`. Ela está congelada: nenhuma gravação nova a alimenta.
      idiomas: v.idiomas ?? [],
      /*
       * O PAR IDIOMA+NÍVEL. SANEADO NA LEITURA (`idiomasGravados`) porque `jsonb` é coluna SEM
       * esquema: o DTO defende a porta HTTP, e o que chegar por outro caminho (um `UPDATE` manual,
       * uma carga futura) não pode virar `undefined` no meio da tela. Nível ilegível vira `null`, e
       * o idioma continua aparecendo: a exigência é verdadeira mesmo sem o nível.
       */
      idiomasExigidos: idiomasGravados(v.idiomasExigidos),
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
      /*
       * ─ QUAIS CAMPOS DAQUELA VAGA VIERAM DA PLANILHA, para a tela poder MARCAR ──────────────────
       *
       * SEM CONSULTA NENHUMA, e é por isso que a derivação mora AQUI e não num enriquecedor por
       * lote como o da proposta de cliente: as cinco colunas `*_origem` são colunas de `vagas`, e
       * esta consulta já traz a linha INTEIRA (`v: vagas`). Um leitor separado faria uma segunda
       * ida ao banco (ou, pior, uma por linha) para reler colunas que já estão na mão, numa fila
       * com centenas de linhas. A proposta de cliente é separada por outra razão, que não vale
       * aqui: ela tem LISTA BRANCA DE LEITORES porque carrega razão social; procedência é NOME DE
       * CAMPO de vocabulário fechado.
       *
       * A TRADUÇÃO "coluna de origem -> nome de campo do contrato" É PURA e vive no domínio
       * (`camposComProcedenciaDaPlanilha`), a MESMA função que o retrato da ponte do funil usa:
       * duas traduções divergiriam no dia em que o CHECK ganhasse o segundo valor de procedência, e
       * a tela passaria a marcar um conjunto diferente do que a trilha registrou.
       *
       * VAZIO, NUNCA NULO NEM OMITIDO: sem o `[]`, a tela não distingue "nada veio da planilha" de
       * "não sei" (mesma razão do retrato da ponte). A função já devolve `[]`, inclusive para a vaga
       * digitada à mão, cujas cinco colunas nascem nulas.
       *
       * §A.6: sai NOME DE CAMPO, de lista fechada. O texto da célula da planilha não atravessa.
       */
      camposVindosDaPlanilha: camposComProcedenciaDaPlanilha(v),
    }));
  }

  /**
   * UMA VAGA, COM O `substituidoCpf` QUE A LISTA NÃO CARREGA MAIS (correção de LGPD ativo, 22/09).
   *
   * A ficha de edição, o clone e a liberação precisam do CPF do substituído para preencher o campo e
   * mandar para a folha. Ele SAIU da lista (`list`, acima) porque descer o CPF de TODA vaga para TODO
   * consultor a cada carga é o oposto da minimização (§A.6). Aqui ele desce de UMA vaga só, quando o
   * consultor a abre.
   *
   * ┌─ REUSA `list()` INTEIRO, DE PROPÓSITO, e não uma segunda consulta com a mesma montagem ─────┐
   * │ O item da lista já resolve cargo, cliente, autor, os dois lados, a ocupação derivada, o     │
   * │ rastro de meta e a herança de segmento/comercial, em 170 linhas de mapeamento. Uma consulta │
   * │ de detalhe PRÓPRIA seria uma SEGUNDA cópia dessa montagem, e duas cópias divergem no primeiro│
   * │ ajuste, entregando à ficha um item diferente do que a lista mostra. O detalhe é, LITERALMENTE│
   * │ , "o item da lista MAIS o CPF": pega o item já pronto e ACRESCENTA o único campo que faltava.│
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * MESMA RÉGUA DE RECORTE DA LISTA: só devolve a vaga que a lista devolveria (procura o `id` no
   * conjunto de `list()`). Não há caminho para ler uma vaga que a lista esconde, então o detalhe não
   * abre acesso nenhum além do que o menu `as-vagas` já concede.
   *
   * §A.6: o CPF sai em DÍGITOS (a tela mascara na exibição), e NUNCA é logado: este método não tem
   * `Logger`, e o retorno não passa por nenhum. Nada de exportação.
   */
  async detalhe(id: string): Promise<VagaDetalhe> {
    const item = (await this.list()).find((v) => v.id === id);
    if (!item) throw new NotFoundException("Vaga não encontrada");

    // O ÚNICO CAMPO QUE A LISTA DEIXOU DE TRAZER, lido de UMA linha só. `id` já foi validado como UUID
    // no controller (`ParseUUIDPipe`) e o item acima confirma que a vaga existe e é visível.
    const [linha] = await this.db
      .select({ substituidoCpf: vagas.substituidoCpf })
      .from(vagas)
      .where(eq(vagas.id, id));

    /*
     * A PROPOSTA ENTRA PELO DETALHE porque a TRILHA DA VAGA abre por ele: sem isto, a tela que
     * preenche a vaga incompleta do Pandapé não teria a resposta pronta, que é justamente o ganho
     * que o diretor pediu ("o time confere e corrige, não monta do zero").
     */
    const [comProposta] = await this.comPropostaDeCliente([item]);
    return { ...(comProposta ?? item), substituidoCpf: linha?.substituidoCpf ?? null };
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
      /**
       * O CNPJ, QUE É O MATERIAL DO DESEMPATE (Onda D). Vem do cadastro de cliente (`clientes.cnpj`)
       * e não é rótulo: quem desenha a segunda linha da opção é a TELA, que só tem como desempatar
       * dois nomes iguais se o dado chegar até ela. Sem ele, a única saída do frontend seria remontar
       * o rótulo com o código, que é justamente o que esta onda tirou.
       *
       * §A.6: CNPJ é documento de PESSOA JURÍDICA, não dado pessoal. É o mesmo campo que a tela de
       * Clientes já mostra, e ele entra SOZINHO: nem razão social, nem endereço, nem nada além.
       */
      cnpj: string | null;
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
    /**
     * ─ OS COMERCIAIS (Onda E), E É **AQUI** QUE ELES SÃO SERVIDOS, NÃO EM ROTA PRÓPRIA ─────────
     *
     * ┌─ A LISTA É DE NOMES DE PESSOA, E POR ISSO NÃO EXISTE UM `GET /as/comerciais` ABERTO ─────┐
     * │ Os catálogos irmãos (etapas, status, motivos, linhas de serviço, e o próprio SEGMENTO)   │
     * │ têm uma controller de leitura aberta a qualquer sessão autenticada, porque a lista deles │
     * │ é inócua. A dos comerciais é a folha do time comercial: aberta, ela sairia inteira num   │
     * │ `curl` de qualquer COMUM da Admissão, que não tem nada com A&S.                           │
     * │                                                                                          │
     * │ ESTA SUPERFÍCIE JÁ É GATADA e já devolve exatamente este tipo de par: `consultores`, logo │
     * │ acima, é `{ id, nome }` de USUÁRIO, e vive atrás de `VagasController.*`, reivindicado     │
     * │ pelo menu `as-vagas`. Servir os comerciais daqui é zero rota nova e zero superfície nova. │
     * │ Mesma régua de `GerencialController.nomes` e `AltoVolumeController.pessoasDaLoja`.        │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * O SEGMENTO NÃO VEM JUNTO, e a assimetria é a própria regra: ele tem rota aberta
     * (`GET /as/segmentos`) porque não é dado pessoal. Duplicá-lo aqui criaria uma segunda fonte
     * para a mesma lista, e duas fontes divergem no primeiro ajuste.
     *
     * ┌─ A LISTA INCLUI OS **INATIVOS**, E O FLAG `ativo` VAI JUNTO PARA A TELA SEPARAR OS DOIS ──┐
     * │ ESTA É A ÚNICA FONTE DE COMERCIAL PARA QUEM NÃO É SUPER_ADMIN (o gerenciador é o único     │
     * │ outro lugar, e ele é fechado). Devolvendo só os ativos, a vaga de quem SAIU DA EMPRESA     │
     * │ ficaria INVISÍVEL ao filtro, para sempre, e essa é justamente a pergunta que mais se faz   │
     * │ quando alguém sai: "o que ficou na mão dele?". §A.37, e é a mesma régua que o filtro de    │
     * │ Status da Central já segue ("se houver vaga parada nele, é por ele que se procura").       │
     * │                                                                                            │
     * │ O FLAG É O QUE IMPEDE O EFEITO COLATERAL: o FILTRO quer todo mundo, o SELETOR da trilha    │
     * │ quer só os ativos (não se oferece quem saiu para uma vaga nova). Uma lista só, com o       │
     * │ estado ao lado, atende os dois sem uma segunda rota; sem o flag, a tela teria de escolher  │
     * │ qual dos dois quebrar.                                                                      │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * §A.6: id, NOME e um booleano. A lista não sai em log, e nenhuma contagem por pessoa viaja
     * junto: quantas vagas cada comercial tem é volume de operação, e não foi pedido.
     */
    comerciais: { id: number; rotulo: string; ativo: boolean }[];
  }> {
    const [
      listaCargos,
      listaClientes,
      listaBeneficios,
      listaMotivos,
      ultimoSolicitante,
      listaEscalas,
      listaConsultores,
      listaComerciais,
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
          // O DESEMPATE DO RÓTULO (Onda D). Lido aqui e devolvido cru; quem o desenha é a tela.
          cnpj: clientes.cnpj,
          enderecoPadrao: clientes.enderecoPadrao,
          escalaPadrao: clientes.escalaPadrao,
        })
        .from(clientes)
        .where(eq(clientes.ativo, true))
        // ─ A ORDEM É A DO QUE SE LÊ, e não a do que se lia ANTES (Onda D) ─────────────────────
        // Ordenar por `razaoSocial` fazia sentido enquanto o rótulo começava pelo CÓDIGO e a razão
        // era o texto: a lista saía previsível. Com o rótulo virando `nomeOperacao`, ordenar pela
        // razão social entrega 232 opções numa ordem que, para o olho, é ALEATÓRIA ("BMB" antes de
        // "AGV" porque a razão social de uma começa com A e a da outra com B). A busca resolve
        // quem sabe o que procura; quem rola a lista para achar fica sem nada.
        //
        // O `coalesce` repete EXATAMENTE a régua do rótulo (`nomeOperacao?.trim() || razaoSocial`,
        // logo abaixo): ordenar por um texto e mostrar outro é o defeito que esta linha conserta,
        // e reintroduzi-lo pela porta do fallback seria o mesmo erro com outra roupa.
        .orderBy(asc(sql`coalesce(nullif(btrim(${clientes.nomeOperacao}), ''), ${clientes.razaoSocial})`)),
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
      // OS COMERCIAIS (Onda E), ATIVOS **E** INATIVOS, na ORDEM DO CATÁLOGO e não em ordem
      // alfabética: a `ordem` é do diretor, e é ela que o gerenciador reescreve. SEM filtro por
      // `ativo` de propósito (ver o contrato acima): o filtro da Central precisa de quem saiu, e o
      // flag viaja junto para o seletor da trilha continuar oferecendo só quem está. Ler a tabela
      // direto, em vez de injetar o `ComerciaisService`, é a mesma decisão de `resolverLinhaServico`:
      // mudar a assinatura do construtor alcançaria as specs que instanciam este serviço (§A.26).
      this.db
        .select({ id: asComerciais.id, rotulo: asComerciais.rotulo, ativo: asComerciais.ativo })
        .from(asComerciais)
        .orderBy(asc(asComerciais.ordem), asc(asComerciais.id)),
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
          /*
           * ─ O RÓTULO PERDEU O CÓDIGO, E GANHOU O CNPJ AO LADO (Onda D, decisão do diretor 12/09) ─
           *
           * POR QUE O CÓDIGO SAIU: a A&S não conhece o `cod_cliente`. Ele é chave de sistema, herdada
           * do de/para da folha, e lê-lo antes do nome obrigava o consultor a decorar número para
           * achar cliente. O nome é como o time chama o cliente, e é por ele que se procura.
           *
           * POR QUE O CNPJ ENTROU, e a razão é MEDIDA, não estética: dos 232 clientes ATIVOS (esta
           * consulta filtra `ativo = true`), 138 estão em 27 nomes de operação REPETIDOS, e o maior
           * grupo tem 52 rótulos IDÊNTICOS. Tirar o código sem pôr nada no lugar entregaria 52 opções
           * indistinguíveis num campo que esta MESMA onda acabou de tornar OBRIGATÓRIO: o consultor
           * passa a ser obrigado a escolher numa lista que não lhe diz o que escolher, e cliente
           * errado na vaga vira cliente errado na admissão, que é a chave da régua documental e da
           * folha. Em 7 desses grupos (16 clientes, os pares `X` contra `X-TEMP.`) o CNPJ também
           * repete, e ali só o `codCliente` separa: por isso ele CONTINUA no payload, como `value` do
           * seletor e como último desempate.
           *
           * O RÓTULO FICA LIMPO DE PROPÓSITO. Concatenar o CNPJ aqui seria trocar um prefixo técnico
           * por outro, e em 94 clientes de nome único ele só faria ruído. O dado vai ao lado, no
           * campo `cnpj`, e QUEM DECIDE O DESENHO É A TELA: nome puro quando o nome basta, desempate
           * discreto só onde ele não basta.
           *
           * BRANCO É AUSÊNCIA, E NÃO UM RÓTULO (achado do `tester`, aprovado em 12/09). O `??`
           * sozinho só pega `null`, então um `nome_operacao` com espaços produziria uma opção SEM
           * TEXTO: invisível numa lista que esta MESMA onda tornou obrigatória, e impossível de
           * escolher. A régua é a que `vagaPendencias` já aplica em todo lugar (`trim()` vazio é
           * vazio), e é DEFESA, não conserto: medido hoje, dos 232 clientes ativos 11 têm o nome de
           * operação NULO (o `?.` já os leva à razão social) e NENHUM o tem em branco. Custa uma
           * expressão, e o dia em que custar mais é o dia em que já haveria opção muda na tela.
           */
          rotulo: c.nomeOperacao?.trim() || c.razaoSocial,
          cnpj: c.cnpj,
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
      comerciais: listaComerciais,
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
   *
   * ┌─ A PROCEDÊNCIA NÃO ENTRA AQUI, E A AUSÊNCIA FOI CONFERIDA (0146 + 0147) ───────────────────┐
   * │ As cinco colunas `*_origem` nascem NULAS neste INSERT, e isso já é a resposta certa: vaga   │
   * │ aberta por uma pessoa não tem valor vindo da planilha, então não há carimbo a limpar nem a  │
   * │ escrever. Nenhuma linha de código é preciso: `CreateVagaDto` não tem os cinco campos,       │
   * │ `camposDaTrilha` não os emite (há teste de fonte para isso) e o INSERT grava só as chaves   │
   * │ que recebe.                                                                                 │
   * │                                                                                             │
   * │ O DIA EM QUE ALGUÉM OS ACRESCENTAR AO DTO, a porta certa continua sendo esta, e a trava     │
   * │ continua sendo a mesma: procedência é DERIVADA da gravação, nunca campo de formulário.      │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async create(dto: CreateVagaDto, abertoPorId: string): Promise<VagaListItem> {
    // O CATÁLOGO ANTES DE TUDO: é ele que diz qual código é o da ABERTURA e se o pedido da tela pode
    // ser gravado pela trilha. Nenhum literal de status sai deste arquivo.
    const regua = await this.statusVaga.regua();
    const status = this.travaStatusDaTrilha(regua, dto.status, "ABERTURA");
    // OS DOIS CATÁLOGOS DA ONDA C, resolvidos ANTES de montar os campos: a linha de serviço tem de
    // existir e estar ATIVA, e a cidade tem de existir na base do IBGE. Ausentes, nenhum dos dois
    // toca o banco, e a régua dos obrigatórios é quem decide se a ausência impede publicar.
    const cidade = await this.resolverCidade(dto.cidadeId);
    const linhaServicoId = await this.resolverLinhaServico(dto.linhaServicoId);
    const herdaveis = await this.resolverHerdaveis(dto);
    const campos = this.camposDaTrilha(regua, dto, status, cidade, linhaServicoId, herdaveis);
    this.travaObrigatorios(regua, campos, status);

    // A IDENTIDADE VAI JUNTO: no create a vaga é inserida com o `id_vacancy_pandape` do corpo, então
    // é ele que diz se a vaga é manual (nulo) ou veio do Pandapé.
    await this.travaDuplicidadeDeCodigo(campos.codigo, null, campos.idVacancyPandape);
    // O NÚMERO DO PANDAPÉ É ÚNICO NO BANCO DESDE A 0150, e esta é a PRIMEIRA das duas camadas: ela
    // responde a frase antes de o insert sair, então a vaga nem é tentada. A segunda é a tradução do
    // 23505, logo abaixo, para a corrida que escapa desta.
    await this.travaNumeroPandapeUnico(campos.idVacancyPandape, null);
    const beneficios = await this.validaBeneficios(dto.beneficios ?? []);

    // OS DOIS LADOS DA VAGA, pela régua do domínio. Quem não tem papel de A&S não abre vaga, nem em
    // rascunho: sem isso a vaga nasceria sem lado nenhum e ninguém saberia de quem ela é. Isto NÃO é
    // campo do formulário, é autoria, e por isso a régua do rascunho não o alcança.
    const lados = await this.ladosDeQuemAbre(abertoPorId, dto.contraparteId);

    // TRANSAÇÃO porque são duas escritas: a vaga e os benefícios dela. Sem ela, uma falha no segundo
    // insert deixaria a vaga gravada sem os benefícios que o consultor marcou, em silêncio.
    //
    // O `catch` TRADUZ A COLISÃO DO NÚMERO DO PANDAPÉ, e ele é a SEGUNDA camada: quando o 23505
    // chega, a pré-checagem acima já leu o banco e não viu a linha, então quem gravou foi uma
    // requisição simultânea. O desfecho é o MESMO das duas camadas (409 com a mesma frase), e é por
    // isso que elas não divergem: a de cima existe só para não desperdiçar o insert.
    const id = await this.db
      .transaction(async (tx) => {
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
              beneficios.map((b) => ({
                vagaId: row.id,
                beneficioId: b.beneficioId,
                valor: b.valor,
              })),
            );
        }
        return row.id;
      })
      .catch((err: unknown) => {
        throw this.traduzirColisaoDoNumeroPandape(err);
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
    /*
     * ┌─ DOIS PAPÉIS ENTRAM AQUI, E O SEGUNDO NÃO MOVE A VAGA ─────────────────────────────────────┐
     * │ RASCUNHO, como sempre, e agora REVISAO, que é a FILA da vaga espelhada do Pandapé. Até     │
     * │ aqui a vaga em REVISAO não era editável por ROTA NENHUMA: os campos só podiam viajar no    │
     * │ corpo da liberação, e quem começasse a completar os onze obrigatórios (mais salário,       │
     * │ benefícios e escala) e parasse no meio perdia tudo no Cancelar. Ninguém termina esse       │
     * │ formulário em uma sentada.                                                                  │
     * │                                                                                             │
     * │ O QUE ELA GANHA É O PODER DE ESCREVER CAMPO, NUNCA O DE TROCAR DE PAPEL, e as três guardas │
     * │ auditadas continuam de pé: a fila é o próprio ESTADO, a LIBERAÇÃO é a única porta para o   │
     * │ papel ABERTURA (`moverStatus` recusa a saída da fila, `exigeReguaDeAbertura`), e nenhum     │
     * │ lote nasce.                                                                                 │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const ehRevisao = regua.ehDoPapel(atual.status, "REVISAO");
    // A pergunta é pelo PAPEL: o código continua sendo `RASCUNHO`, mas quem o afirma passa a ser o
    // catálogo. Comparar com o literal voltaria a errar no dia em que a linha fosse recadastrada
    // com outro código.
    if (!regua.ehDoPapel(atual.status, "RASCUNHO") && !ehRevisao) {
      throw new ConflictException(
        "Esta vaga já foi publicada e não volta para a trilha de abertura. Recarregue a página.",
      );
    }

    /*
     * ┌─ NA REVISÃO, O STATUS GRAVADO É O ATUAL, E `dto.status` É IGNORADO. ISTO É TRAVA ──────────┐
     * │ Não é conveniência de implementação: `travaStatusDaTrilha(regua, dto.status, "RASCUNHO")`  │
     * │ cairia no PADRÃO RASCUNHO quando o corpo não manda status, e a vaga SAIRIA DA FILA em      │
     * │ silêncio, por uma rota de edição, sem trilha, sem a régua dos obrigatórios e sem o cliente │
     * │ conferido. Pior ainda com status no corpo: o papel REVISAO tem `daTrilha` DESLIGADO        │
     * │ (`vaga-status.service`, e o comentário de lá diz exatamente isto), então a trava do        │
     * │ catálogo não protege esta porta, ela só protegeria a de saída.                              │
     * │                                                                                             │
     * │ Quem muda o status da vaga em REVISAO é a LIBERAÇÃO, e mais nada.                           │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const status = ehRevisao
      ? atual.status
      : this.travaStatusDaTrilha(regua, dto.status, "RASCUNHO");
    const cidade = await this.resolverCidade(dto.cidadeId);
    const linhaServicoId = await this.resolverLinhaServico(dto.linhaServicoId);
    const herdaveis = await this.resolverHerdaveis(dto);
    const campos = {
      ...this.camposDaTrilha(regua, dto, status, cidade, linhaServicoId, herdaveis),
      posicoesOficiais: this.metaOficialDaTrilha(dto, atual),
    };
    /*
     * A RÉGUA DOS OBRIGATÓRIOS NÃO RODA NA REVISÃO, e o motivo é o mesmo do rascunho: nada está
     * sendo PUBLICADO aqui. Quem cobra os onze campos é a LIBERAÇÃO, que é a porta de saída da
     * fila. A chamada continua sendo feita (e não removida) para o RASCUNHO se comportar
     * exatamente como antes, inclusive publicando por esta rota.
     */
    if (!ehRevisao) this.travaObrigatorios(regua, campos, status);

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
          // OS CARIMBOS DE INTEGRAÇÃO (`idVacancyPandape`, `envioShortlist`) NÃO ENTRAM: o formulário
          // nunca os manda, então o `camposDaTrilha` os emitiria como null e o UPDATE zeraria a
          // coluna. No ramo REVISAO isso apagava o `id_vacancy_pandape` e a varredura do Pandapé
          // criava uma vaga DUPLICATA. No RASCUNHO é no-op (a coluna já é nula). Omitir preserva.
          ...this.semCarimbosDeIntegracao(campos),
          /*
           * A GRAVAÇÃO HUMANA LIMPA A PROCEDÊNCIA DO CAMPO QUE ELA MUDOU (0146 + 0147).
           *
           * DEPOIS do montador, e nunca dentro dele: `camposDaTrilha` emitiria a procedência como
           * campo de formulário, e campo de formulário ausente é campo LIMPO, então um salvamento
           * parcial apagaria as cinco em silêncio. Aqui entram SÓ as chaves dos campos que
           * MUDARAM; as outras ficam de fora do `.set()` e a coluna segue intocada.
           *
           * O PORQUÊ DE "MUDOU" E NÃO "GRAVOU" está escrito em `procedenciaALimpar`: esta tela
           * manda o formulário COMPLETO, então limpar por gravação zeraria as cinco no primeiro
           * Salvar de qualquer campo.
           */
          ...procedenciaALimpar(atual, campos),
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
   * ┌─ OS CARIMBOS DE INTEGRAÇÃO QUE A TRILHA NÃO ESCREVE, E QUE A LIBERAÇÃO NÃO PODE ZERAR ──────┐
   * │ `idVacancyPandape` e `envioShortlist` NÃO são campos de formulário de vaga: NENHUMA tela os │
   * │ manda na abertura. Quem grava o primeiro é só o INSERT da varredura do Pandapé (e o Digai); │
   * │ quem grava o segundo é só o fluxo de shortlist. Os dois estão em                             │
   * │ `AS_VAGA_CAMPOS_NUNCA_EDITAVEIS` por exatamente isso.                                        │
   * │                                                                                             │
   * │ O PROBLEMA: `camposDaTrilha` os EMITE a partir do corpo (`texto()`/`data()` de um campo     │
   * │ ausente devolve `null`), então espalhar esse objeto num `.set()` de UPDATE ZERA as colunas. │
   * │ Omitir a chave no `.set()` do Drizzle deixa a coluna INTOCADA, que é o mesmo que preservá-la.│
   * │                                                                                             │
   * │ A CAUSA DA DUPLICAÇÃO DE VAGAS É ESTA: sem `id_vacancy_pandape`, a varredura do Pandapé não │
   * │ reconhece a vaga existente e cria uma DUPLICATA no ciclo seguinte.                           │
   * │                                                                                             │
   * │ `codigo` e `status` TAMBÉM estão naquela lista, mas são escritos DE PROPÓSITO na liberação  │
   * │ (o código vem do formulário de completude, o status vira o papel ABERTURA), e `contraparteId`│
   * │ nem é emitido por `camposDaTrilha`. Por isso só estes DOIS são removidos aqui.               │
   * │                                                                                             │
   * │ O CAMINHO SEGURO JÁ EXISTE: `VagasEdicaoService` mescla o valor atual da linha e guarda via │
   * │ `nuncaEditaveisAlterados`. Esta função é a mesma garantia para as DUAS portas que espalham  │
   * │ `camposDaTrilha` direto num UPDATE: `atualizar` (ramo REVISAO) e `liberarPendenteRevisao`.   │
   * └──────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private semCarimbosDeIntegracao<T extends Record<string, unknown>>(
    campos: T | null,
  ): Partial<T> {
    if (!campos) return {};
    const { idVacancyPandape: _idVacancyPandape, envioShortlist: _envioShortlist, ...resto } = campos;
    // O `resto` é `Omit<T, ...>`, e o TS estrito do `nest build` (não o `tsc --noEmit`) não o aceita
    // como `Partial<T>` para um T genérico: a remoção das duas chaves não prova a atribuição sozinha.
    // O cast é seguro porque Omit de T sempre satisfaz Partial de T; só o compilador não deduz.
    return resto as Partial<T>;
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
  public camposDaTrilha(
    regua: ReguaDeStatusDaVaga,
    dto: CreateVagaDto,
    status: VagaStatus,
    /**
     * A CIDADE JÁ RESOLVIDA (Onda C), ou `null`. Ela chega PRONTA de propósito, e não é buscada aqui:
     * esta função é SÍNCRONA, e é isso que faz `vagas.trilha-nao-encerra.spec.ts` conseguir provar,
     * com o `db` NULO, que a recusa de status terminal acontece ANTES de qualquer ida ao banco.
     * Transformá-la em `async` para buscar a cidade quebraria essa prova sem nenhum ganho.
     */
    cidade: AsCidade | null,
    /** A linha de serviço já conferida contra o catálogo, ou `null` (rascunho sem escolha). */
    linhaServicoId: number | null,
    /**
     * A SOBREPOSIÇÃO DE SEGMENTO E COMERCIAL (Onda E), já conferida contra os dois catálogos.
     *
     * CHEGAM PRONTOS, como a cidade e pelo mesmo motivo: esta função é SÍNCRONA, e é isso que faz
     * `vagas.trilha-nao-encerra.spec.ts` conseguir provar, com o `db` NULO, que a recusa de status
     * terminal acontece ANTES de qualquer ida ao banco.
     *
     * ┌─ O VALOR PADRÃO EXISTE POR ALCANCE (§A.26), E O NEUTRO É "HERDA" ────────────────────────┐
     * │ Esta função é PRIVADA mas é chamada por specs JÁ VALIDADAS que a alcançam pelo nome e     │
     * │ passam TRÊS argumentos (`vagas.motivo-temporario.spec.ts`, `vagas.idioma-com-nivel.spec.ts`│
     * │ ), porque ela é o mapeamento PURO do corpo para as colunas e é assim que se testa isso    │
     * │ sem banco. Um parâmetro obrigatório a mais quebraria as duas por um motivo que não tem    │
     * │ nada a ver com o que elas afirmam.                                                         │
     * │                                                                                            │
     * │ O PADRÃO É SEGURO PORQUE O NEUTRO AQUI É NULO, E NULO É HERDAR: a ausência produz a vaga  │
     * │ que segue o cliente, que é o estado da esmagadora maioria. AS DUAS PORTAS DE ESCRITA REAIS│
     * │ (`create` e `atualizar`) PASSAM O VALOR EXPLICITAMENTE, sempre, e são as únicas.           │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    herdaveis: { segmentoId: number | null; comercialId: number | null } = {
      segmentoId: null,
      comercialId: null,
    },
  ) {
    // "ISTO É O RASCUNHO?" PERGUNTADO AO PAPEL, e não ao literal. O código continua sendo
    // `RASCUNHO`; o que muda é que a resposta deixa de depender de o literal e o catálogo
    // concordarem por coincidência. É a mesma pergunta que a régua dos obrigatórios faz logo abaixo.
    const ehRascunho = regua.ehDoPapel(status, "RASCUNHO");
    // A DATA LIMITE não depende mais da sazonalidade (correção de 21/08): vale em qualquer vaga e
    // segue opcional. A data de ABERTURA é obrigatória para PUBLICAR, e quem cobra é a régua.
    /*
     * ─ A UF DEIXOU DE SER DIGITADA E PASSOU A SER DERIVADA DA CIDADE (Onda C) ───────────────────
     *
     * `vagas.regiao_estado` CONTINUA SENDO GRAVADA, e por isso nada que já a lê (listagem, filtro,
     * exportação) muda de comportamento. O que muda é a FONTE: escolhida a cidade, a UF é a dela, e
     * o que vier no corpo é ignorado. Duas fontes para a mesma pergunta é como a vaga acabaria com
     * cidade de um estado e UF de outro, e ninguém descobriria até a tela mostrar as duas juntas.
     *
     * A RÉGUA DAS REGIÕES NÃO AFROUXOU: ela passa a ser conferida contra a UF DERIVADA, então região
     * de outro estado segue recusada com a mesma frase. Sem cidade, tudo se comporta como antes.
     */
    /*
     * OS IDIOMAS PEDIDOS, POR QUALQUER UM DOS DOIS NOMES DO CORPO. `idiomasExigidos` é o nome da
     * coluna e tem precedência; `idiomas` é o apelido de transição (ver o DTO). Resolvido UMA vez
     * aqui para as três linhas abaixo (a coluna nova, o escape e a contagem) lerem a MESMA lista, em
     * vez de cada uma repetir a escolha e uma delas esquecer o apelido.
     */
    const idiomas = dto.idiomasExigidos ?? dto.idiomas ?? [];
    const regiao = this.validaRegioes(
      cidade?.uf ?? dto.regiaoEstado,
      dto.regioes,
      dto.regioesOutras,
    );
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
      // A LINHA DE SERVIÇO (Onda C). Já conferida contra o catálogo por quem chamou; aqui ela só é
      // gravada. OBRIGATÓRIA para publicar, e quem cobra é a régua, não esta linha.
      linhaServicoId,
      // A CIDADE (Onda C), pelo código do IBGE. A UF sai dela, logo acima.
      cidadeId: cidade?.id ?? null,
      /*
       * A SOBREPOSIÇÃO DE SEGMENTO E COMERCIAL (Onda E). NULO AQUI NÃO É "SEM VALOR": é HERDAR DO
       * CLIENTE, e é o estado normal da esmagadora maioria das vagas. Quem quis o do cliente não
       * preenche, e a leitura resolve por `coalesce(vaga.x, cliente.x)`.
       *
       * NÃO EXISTE "COPIAR DO CLIENTE AO NASCER" aqui, e a ausência é a decisão do diretor (12/09):
       * a herança é VIVA, então carimbar o valor do cliente na criação congelaria justamente o que
       * ele quis que acompanhasse.
       */
      segmentoId: herdaveis.segmentoId,
      comercialId: herdaveis.comercialId,
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
      /*
       * O REALINHAMENTO (0138) ENTRA AQUI, no MESMO montador da irmã acima, e é essa a razão de ele
       * ser um campo de formulário e não um carimbo: `camposDaTrilha` serve `create` E `atualizar`,
       * então a data que o time digita na abertura e a que ele digita na edição passam pelo mesmo
       * lugar. Uma segunda escrita em outro método divergiria desta na primeira correção.
       */
      dataRealinhamento: data(dto.dataRealinhamento),
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
      /*
       * ─ O IDIOMA PASSOU A CARREGAR O NÍVEL, NUMA COLUNA NOVA (Onda C) ───────────────────────────
       *
       * `idiomas` (A COLUNA VELHA) NÃO APARECE AQUI, E A AUSÊNCIA É O DESENHO: ela está congelada,
       * guardando o que as vagas anteriores pediam, e ninguém a escreve mais. Escrevê-la junto
       * criaria duas listas de idioma na mesma vaga, com a chance permanente de discordarem.
       *
       * O NÍVEL JÁ CHEGA VALIDADO do DTO, onde ele é obrigatório por idioma marcado. A normalização
       * aqui é MÍNIMA E EXPLÍCITA (`{idioma, nivel}`), e não o objeto do corpo inteiro: `jsonb` é
       * coluna SEM ESQUEMA, e um campo a mais que alguém mande no corpo entraria em silêncio.
       */
      idiomasExigidos: idiomas.length
        ? idiomas.map((i) => ({ idioma: i.idioma, nivel: i.nivel }) satisfies VagaIdiomaGravado)
        : null,
      /*
       * ┌─ O ESCAPE, E A LINHA QUE A AUDITORIA PEGOU ANTES DE ELA CHEGAR NA OPERAÇÃO ────────────┐
       * │ Isto era `dto.idiomas?.includes(OPCAO_OUTROS)`. Com a lista virando lista de OBJETOS,   │
       * │ `includes` de uma string passa a ser SEMPRE falso, e o ramo `: null` zerava o texto de  │
       * │ "outros idiomas" na PRIMEIRA gravação, sem erro, sem log e sem ninguém perceber: o dado │
       * │ que o consultor digitou sumiria do banco ao salvar o rascunho de novo.                   │
       * │                                                                                          │
       * │ A COMPARAÇÃO AGORA É PELO CAMPO (`i.idioma === OPCAO_OUTROS`), e há teste afirmando que │
       * │ o texto SOBREVIVE a uma segunda gravação, que é o cenário exato do defeito.              │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * A REGRA EM SI NÃO MUDOU: o escape só sobrevive com "Outros" marcado, senão a vaga guardaria
       * um idioma que a tela não mostra mais.
       */
      idiomasOutros: idiomas.some((i) => i.idioma === OPCAO_OUTROS)
        ? texto(dto.idiomasOutros)
        : null,
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
   * A MESMA RÉGUA QUE A TELA USA (`vagaPendencias`, no shared-types, mais a entrada da LINHA DE
   * SERVIÇO da Onda C, em `domain/vaga-obrigatorios`). Duas cópias da régua acabariam
   * em "a tela deixou publicar e o servidor recusou", que é o pior dos dois mundos: o trabalho já
   * feito e a mensagem chegando do lado errado.
   *
   * A MENSAGEM LISTA TUDO DE UMA VEZ, com o passo e o nome do campo, porque quem preenche 38 campos
   * não pode descobrir as pendências uma por uma. A tela já barra antes de chegar aqui; esta trava é
   * para o corpo montado fora dela, e é a autoridade.
   */
  public travaObrigatorios(
    regua: ReguaDeStatusDaVaga,
    campos: VagaCamposObrigatoriosComLinha,
    status: VagaStatus,
  ): void {
    // O RASCUNHO NÃO COBRA OBRIGATÓRIO, e quem diz que este é o rascunho é o PAPEL. Um status novo
    // que o diretor crie e marque `daTrilha` NÃO herda a folga: ele não tem papel de RASCUNHO, então
    // publicar nele cobra a régua inteira, que é a direção segura.
    if (regua.ehDoPapel(status, "RASCUNHO")) return;
    const pendencias = pendenciasDaVaga(campos);
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
  public reducaoDeMeta(
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
  public mensagemDeExcesso(excesso: ExcessoDePosicoes): string {
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
    // `codigoDoPapel("ENTREGA")` SAIU DAQUI na Frente B: fechar não grava mais a ENTREGA, porque ela
    // deixou de ser desfecho e virou estado VIVO. Ver o bloco na gravação do status, abaixo.
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
       * A TRAVA DE ORIGEM, PELO PAPEL: só a vaga EM PROCESSO fecha. O código continua sendo
       * `ABERTA`, e é justamente por isso que perguntar pelo papel importa: o literal concorda com o
       * catálogo por coincidência, e a coincidência acaba no dia em que a linha for recadastrada.
       *
       * ┌─ ELA PASSOU A ACEITAR A ENTREGA, E SEM ISSO A FRENTE B TRAVARIA O CAMINHO NORMAL ──────┐
       * │ Até aqui a pergunta era `ehDoPapel(status, "ABERTURA")`, e bastava porque `ENTREGUE`    │
       * │ era TERMINAL. Com a entrega viva (o candidato está com o cliente), o caminho NORMAL do  │
       * │ processo é exatamente este: a vaga fica ENTREGUE, o candidato é contratado, e a vaga    │
       * │ FECHA. Com o literal antigo, ela não fecharia por porta nenhuma e o consultor teria de  │
       * │ movê-la à mão de volta para Aberta antes, o que ainda GRUDARIA o status (§ o carimbo    │
       * │ manual) e desligaria a derivação daquela vaga para sempre.                               │
       * │                                                                                         │
       * │ NENHUMA TRAVA FOI AFROUXADA: o candidato tratado (trava 5) e a posição entregue         │
       * │ (trava 6) continuam sendo conferidos logo abaixo, iguais, sobre a mesma lista lida sob  │
       * │ o lock. O que mudou foi DE ONDE se pode fechar, não SOB QUE CONDIÇÕES.                   │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * SEGUE SENDO A TRAVA QUE RECUSA A CORRIDA, e não só a ordena: o `FOR UPDATE` serializa duas
       * requisições, e quem chega em segundo lugar encontra a vaga já encerrada e para AQUI.
       */
      if (!papelDeVagaEmProcesso(regua.linha(vaga.status).papel)) {
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
           * vaga encerrada" como processo encerrado, e conta o prazo de retenção (6 MESES desde 29/09/2026,
           * era 2 anos) A PARTIR DAQUI para
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
           * ─ FECHAR SEMPRE GRAVA `FECHAMENTO`, E ISTO MUDOU NA FRENTE B (decisão do diretor) ────
           *
           * ┌─ O QUE ERA, E POR QUE DEIXOU DE PODER SER ────────────────────────────────────────┐
           * │ ERA `ocupacao.finalizadas > 0 ? ENTREGUE : FECHADA`: a vaga que entregou alguém     │
           * │ saía ENTREGUE, e ENTREGUE era um DESFECHO (`encerra = true`).                       │
           * │                                                                                     │
           * │ NO CONCEITO NOVO `ENTREGUE` É UM ESTADO VIVO ("entregue ao cliente, ainda NÃO       │
           * │ finalizada", §A.3 da Frente B), com `encerra = false` e `recebe_candidato = true`.  │
           * │ Continuar gravando-a aqui deixaria a vaga FECHADA VIVA: ela voltaria a receber       │
           * │ posição (a trava 2 do caminho travado pergunta `recebeCandidato`), voltaria a ser    │
           * │ destino do "mover status", e a derivação do funil poderia arrastá-la de volta para   │
           * │ ABERTA. O gate de Master do fechamento viraria contornável, que é exatamente o furo  │
           * │ que a auditoria de 09/09 fechou.                                                     │
           * │                                                                                     │
           * │ A INFORMAÇÃO "ESTA VAGA ENTREGOU" NÃO SE PERDE, e é por isso que a troca é segura:   │
           * │ ela já era gravada no MESMO `update`, nas duas linhas logo acima                     │
           * │ (`vagas_fechadas` e `vagas_fechadas_banco`), que são o CARIMBO da mesma derivada que │
           * │ decidia o status. "Saiu ENTREGUE" e "tem carimbo de entrega maior que zero" sempre   │
           * │ foram o MESMO conjunto, escrito duas vezes; o que sai é a cópia, não o dado.          │
           * │                                                                                     │
           * │ E O EXPURGO POR RETENÇÃO ACOMPANHOU (§A.6): a cláusula que POUPAVA quem estava em    │
           * │ vaga de papel ENTREGA passou a ler o carimbo de entrega, pela equivalência acima.    │
           * │ Ver `retencao-candidatos.service.ts`, que explica a prova.                            │
           * └─────────────────────────────────────────────────────────────────────────────────────┘
           *
           * O CÓDIGO VEM DO PAPEL, E NUNCA DO LITERAL (onda B2). A FK pega o código INEXISTENTE; ela
           * não pega o código existente e ERRADO, e é aí que mora o dano: gravar aqui o código do
           * CANCELAMENTO seria FK válida, desfecho falso e permanente, carimbado junto de
           * `vagas_fechadas` e `data_fechamento`.
           */
          status: codigoFechamento,
          /*
           * O CARIMBO MANUAL É LIMPO PELA PORTA COM RÉGUA (Frente B, ponto 2). A invariante é
           * "preenchido <=> o status VIGENTE veio de um gesto manual", e depois daqui o status
           * vigente veio do fechamento. Deixá-lo para trás faria a vaga reaberta no futuro nascer
           * com a derivação desligada por causa de um movimento manual de meses antes.
           */
          statusManualEm: null,
          statusManualPorId: null,
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
   * ┌─ AS DUAS TRAVAS QUE RESTARAM (a terceira foi REVOGADA na Frente B) ────────────────────────┐
   * │ 1. STATUS DE ORIGEM: só a vaga EM PROCESSO cancela (papel ABERTURA **ou** ENTREGA, desde a  │
   * │    Frente B, em que a entrega deixou de encerrar). É ela que impede cancelar uma vaga já    │
   * │    ENCERRADA (o que APAGARIA o desfecho da leitura, porque `CANCELADA` vence tudo), que     │
   * │    torna o duplo clique inofensivo e que faz a corrida entre duas requisições ser RECUSADA, │
   * │    e não só ordenada: o `FOR UPDATE` serializa as duas, mas quem chega em segundo lugar só  │
   * │    para por causa desta pergunta.                                                            │
   * │ 2. MOTIVO DO CATÁLOGO: o nome tem de existir e estar ATIVO. Sem isto, o campo seria texto   │
   * │    livre com aparência de catálogo, e a auditoria leria depois o que alguém tiver digitado.  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A TRAVA 3 FOI REVOGADA PELO DIRETOR, E O REGISTRO FICA PORQUE ELA EXPLICA UM RISCO ───────┐
   * │ O QUE ERA: candidato `ATIVO` ou `ALOCADO` BARRAVA o cancelamento (`seguraOCancelamento`), e │
   * │ só um MASTER passava com `forcar: true`, o que DESCARTAVA todos eles.                       │
   * │                                                                                             │
   * │ O QUE É: cancelar com candidato dentro é PERMITIDO, e ninguém é descartado. Quem está vivo  │
   * │ vai para o STAND BY e CONTINUA VIVO (`moverVivosParaODestino`), para poder ser transferido  │
   * │ ou realocado depois.                                                                         │
   * │                                                                                             │
   * │ O QUE NÃO SE PODE CONCLUIR DISSO: que `SITUACOES_TRATADAS` e `seguraOCancelamento` viraram  │
   * │ a mesma coisa. Elas continuam sendo réguas DIFERENTES para perguntas diferentes, e a do     │
   * │ FECHAMENTO (trava 5, que considera o `ALOCADO` tratado) NÃO foi tocada. Unificá-las "para   │
   * │ ficar coerente" quebraria a outra frente por alcance.                                        │
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
    /*
     * PARA ONDE VAI QUEM ESTAVA NA VAGA (Frente B, ponto 3). Lido ANTES da transação, pela régua da
     * casa, e NULO É RESPOSTA VÁLIDA: sem destino configurado ninguém é movido e ninguém é
     * descartado, as candidaturas ficam vivas onde estão. Ver `etapaDoCancelamento`.
     */
    const destinoDoCancelamento = await this.etapas.etapaDoCancelamento();
    // O CATÁLOGO DE STATUS, ANTES DA TRANSAÇÃO, como no fechamento: aqui ele responde as duas
    // perguntas do cancelamento, "de onde pode cancelar" (vaga EM PROCESSO) e "o que gravar" (papel
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
      if (!papelDeVagaEmProcesso(regua.linha(vaga.status).papel)) {
        throw new ConflictException("Esta vaga já foi encerrada. Recarregue a página.");
      }

      const linhas = await this.candidaturasDaVaga(tx, id);

      /*
       * ┌─ A TRAVA 3 DEIXOU DE EXISTIR (decisão do diretor, Frente B, ponto 3) ───────────────────┐
       * │ O QUE ERA: `travaCandidatosQueSeguram` BARRAVA o cancelamento quando alguém estava       │
       * │ `ATIVO` ou `ALOCADO`, e só um MASTER passava por cima com `forcar: true`. Forçar         │
       * │ DESCARTAVA todo mundo que segurava.                                                      │
       * │                                                                                          │
       * │ O QUE PASSA A SER: cancelar com candidato dentro é PERMITIDO, para qualquer consultor, e │
       * │ NINGUÉM É DESCARTADO. Quem estava VIVO vai para o STAND BY e CONTINUA VIVO, ligado à     │
       * │ vaga cancelada, para a pessoa não sumir e poder ser transferida ou realocada depois.     │
       * │                                                                                          │
       * │ ISSO NÃO APAGA NENHUMA GARANTIA, E É O PONTO QUE PRECISA FICAR ESCRITO:                  │
       * │   . a §A.6 continua satisfeita porque a proteção do expurgo NÃO depende da candidatura   │
       * │     estar encerrada: a cláusula de retenção lê a VAGA (`s.encerra` + `v.encerrada_em`),  │
       * │     e a vaga cancelada é encerrada com carimbo de servidor. O prazo de retenção começa a │
       * │     correr no instante do cancelamento, exatamente como corria para quem era descartado. │
       * │     Era ESSA a razão pela qual o forçado encerrava as candidaturas, e ela já não vale.   │
       * │   . a trava do DESVÍNCULO DE ALOCADO (`desvinculoEhDeMaster`, em `candidatos.service`)   │
       * │     continua intacta. O que ela protegia era este cancelamento; agora ele não tem gate   │
       * │     a contornar, e desfazer a entrega de alguém segue sendo ação de Master.              │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * A ETAPA DA VAGA É MEDIDA ANTES DE MOVER NINGUÉM (Frente B, ponto 4), e a ordem é
       * obrigatória: o Stand By é a última etapa da fila, então medir depois responderia "Stand By"
       * em todo cancelamento, para sempre, que é a resposta mais inútil possível.
       */
      const etapaDaVaga = this.etapaMaisAvancadaViva(linhas, ordemDoFunil);
      const movidos = await this.moverVivosParaODestino(tx, linhas, destinoDoCancelamento, user.id);

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
      await tx.insert(asVagaStatusEventos).values({
        vagaId: id,
        de: vaga.status,
        para: codigoCancelamento,
        // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
        porId: user.id,
        observacao: this.narrativaDoCancelamento(dto, movidos, etapaDaVaga),
      });

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
           * ─ O CARIMBO DA ETAPA (Frente B, ponto 4): ATÉ ONDE ESTE PROCESSO CHEGOU ─────────────
           *
           * A definição está no schema da coluna, e ela precisa estar escrita porque VIRA
           * RELATÓRIO: é a etapa MAIS AVANÇADA entre as candidaturas VIVAS no instante do
           * cancelamento, ou NULO quando não havia ninguém vivo.
           *
           * MEDIDA ANTES DE QUALQUER MOVIMENTO, lá em cima, e a ordem é obrigatória: quem move
           * todo mundo para o Stand By primeiro carimba "Stand By" em TODO cancelamento, porque
           * ele é a última etapa da fila.
           *
           * OS TRÊS CARIMBOS DO FORÇADO SAÍRAM DE CENA, e não foram apagados da tabela: o
           * cancelamento não tem mais exceção a registrar (ele não é barrado por candidato
           * nenhum), então não há o que gravar. As colunas continuam existindo e continuam
           * legíveis para os cancelamentos forçados que JÁ aconteceram, pela mesma razão de
           * `cancelamento_motivo` guardar o nome e não o id: o passado não se reescreve.
           */
          cancelamentoEtapa: etapaDaVaga,
          /*
           * O CARIMBO MANUAL É LIMPO PELA PORTA COM RÉGUA (Frente B, ponto 2), como no fechamento:
           * a invariante é "preenchido <=> o status VIGENTE veio de um gesto manual", e depois
           * daqui o status vigente veio do cancelamento. Sem esta limpeza, a vaga REABERTA no
           * futuro nasceria com a derivação desligada por causa de um movimento de meses antes.
           */
          statusManualEm: null,
          statusManualPorId: null,
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
   * │ INFORMA, NÃO TRAVA. Nada aqui recusa nada, e desde a Frente B NADA MAIS RECUSA: a trava do  │
   * │ `cancelar` que olhava o lado oposto desta régua foi revogada pelo diretor, e quem estava    │
   * │ vivo passou a ser MOVIDO para o Stand By em vez de barrar o cancelamento.                    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A RÉGUA CONTINUA SENDO `candidaturaEncerradaParaCancelamento`, a mesma função de que
   * `seguraOCancelamento` é a negação, e ELA NÃO MUDOU com a revogação da trava: a pergunta deste
   * aviso ("quantos já estão encerrados?") é de LEITURA, e continua valendo. NENHUMA LISTA NOVA DE
   * SITUAÇÃO é escrita, aqui nem em lugar nenhum: duas listas iguais concordam por coincidência e
   * param de concordar na primeira situação nova.
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
   * │ silêncio o prazo inteiro de retenção de dado pessoal de gente que ninguém trouxe de volta.  │
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
    /*
     * OS DOIS CATÁLOGOS DA REABERTURA DA VAGA ENTREGUE (0138), lidos AQUI pela MESMA régua das
     * linhas acima: catálogo ANTES da transação, para não alongar o tempo com a trava segurada.
     *
     * `etapasDeEntrega` responde QUEM está com o cliente, e é a MESMA fonte que a derivação de
     * status usa. `destinoDaReabertura` é para onde essa gente volta (a Triagem, na semente).
     */
    const etapasDeEntrega = await this.etapas.codigosDeEntregaAoCliente();
    const destinoDaReabertura = await this.etapas.etapaDaReabertura();

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
            /*
             * O PRAZO VIGENTE É LIDO SOB O LOCK (0138), e não fora dele: é dele que sai a cópia
             * `data_limite_anterior`. Lido antes da trava, a cópia poderia ser de um prazo que outra
             * edição já substituiu, e o relatório diria que renegociou de um valor que nunca vigorou.
             */
            dataLimite: vagas.dataLimite,
          })
          .from(vagas)
          .where(eq(vagas.id, id))
          .for("update");
        if (!vaga) throw new NotFoundException("Vaga não encontrada.");

        /*
         * ─ DE ONDE A VAGA REABRE: DOIS PAPÉIS, E DOIS CAMINHOS QUE NÃO SE MISTURAM (0138) ────────
         *
         * ┌─ POR QUE A ENTREGA NÃO PODE PASSAR PELO CAMINHO DO CANCELAMENTO ────────────────────┐
         * │ O caminho de baixo DESFAZ UM CANCELAMENTO: ele procura o conjunto de quem AQUELE      │
         * │ cancelamento descartou, restaura essas pessoas e LIMPA `vagas_fechadas`,              │
         * │ `vagas_fechadas_banco` e `data_fechamento`. Aplicado a uma vaga ENTREGUE, isso        │
         * │ ressuscitaria gente que a seleção recusou por mérito e APAGARIA o carimbo de quem foi │
         * │ entregue de verdade. A vaga entregue não tem cancelamento a desfazer: ela tem gente   │
         * │ COM O CLIENTE, viva, que precisa voltar para a triagem.                               │
         * └─────────────────────────────────────────────────────────────────────────────────────┘
         *
         * FECHADA CONTINUA SEM PORTA DE VOLTA, e a ausência é decisão do diretor (fica como frente
         * futura): reabrir um FECHAMENTO tem régua própria (a meta fechada, a data prevista de
         * início, o relógio da retenção) e não é um papel a mais nesta lista.
         */
        const ehReaberturaDeEntrega = regua.ehDoPapel(vaga.status, "ENTREGA");
        if (!ehReaberturaDeEntrega && !regua.ehDoPapel(vaga.status, "CANCELAMENTO")) {
          throw new ConflictException(
            "Só uma vaga CANCELADA ou ENTREGUE é reaberta por aqui. Recarregue a página.",
          );
        }

        /*
         * ─ O PRAZO NOVO, E POR QUE ELE É EXIGIDO NA ENTREGA E OPCIONAL NO CANCELAMENTO ──────────
         *
         * A SLA é uma contagem REGRESSIVA até a Previsão De Entrega, então NÃO EXISTE "zerar": o que
         * existe é um PRAZO NOVO (decisão do diretor). Reabrir a vaga entregue SEM prazo novo a
         * devolveria correndo contra o prazo ANTIGO, que quase sempre já passou, e ela nasceria
         * "Prazo Vencido" sem ninguém ter atrasado nada. É o defeito que esta frente corrige, e
         * aceitar o corpo sem prazo seria construí-lo de novo.
         *
         * NO CANCELAMENTO ELE SEGUE OPCIONAL, e isso é REQUISITO: a reabertura de vaga cancelada
         * está em produção e não pode passar a exigir campo que a tela dela não manda. Vindo, é
         * aplicado do mesmo jeito.
         */
        const prazoNovo = data(dto.dataLimite);
        if (ehReaberturaDeEntrega && !prazoNovo) {
          throw new BadRequestException(
            "Informe a previsão de entrega nova para reabrir esta vaga. O prazo não volta a contar sozinho: a contagem é até a data prometida, então reabrir pede uma data nova, e a anterior fica registrada.",
          );
        }

        /*
         * OS CARIMBOS DA REABERTURA, COMUNS AOS DOIS CAMINHOS. Eles saem no MESMO `.set` do resto,
         * mais abaixo, e o prazo anterior só é copiado quando há prazo novo para substituí-lo:
         * gravar a cópia sem a substituição afirmaria uma renegociação que não houve.
         *
         * ┌─ A REABERTURA É A SÉTIMA PORTA, E ELA LIMPA `dataLimiteOrigem` (achado do `seguranca`) ─┐
         * │ O pré-preenchimento marca `data_limite_origem = 'PLANILHA'` quando a data veio da       │
         * │ planilha, e a regra é que TODA gravação humana daquele valor limpa a marca. As outras   │
         * │ três portas chamam `procedenciaALimpar`; esta ficou de fora, e o caminho não é          │
         * │ hipotético: reabrir a partir da ENTREGA **exige** prazo novo (o lançamento logo acima),  │
         * │ então aqui a troca da data é OBRIGATÓRIA. Sem esta linha o carimbo passaria a dizer      │
         * │ "veio da planilha" sobre um prazo que um Master acabou de renegociar, e a tela mostraria │
         * │ "Da Planilha, A Conferir" num valor conferido. Pior: esse nome de campo entra no RETRATO │
         * │ PERMANENTE da ponte (`as_candidatura_etapas.procedencia_planilha`), que é imutável, e aí │
         * │ a contagem do dia ruim conta a vaga JÁ CORRIGIDA dentro do estrago.                      │
         * │                                                                                          │
         * │ NÃO se usa `procedenciaALimpar` aqui, de propósito: ela recebe a saída de                │
         * │ `camposDaTrilha`, e este objeto não é ela nem carrega os outros quatro campos. A limpeza  │
         * │ mora DENTRO do mesmo ternário do prazo, então ela acontece exatamente quando a data muda, │
         * │ e cobre os DOIS `.set` que espalham este objeto de uma vez.                               │
         * └──────────────────────────────────────────────────────────────────────────────────────────┘
         */
        const carimbosDaReabertura = {
          dataReabertura: hojeEmSaoPaulo(),
          reaberturaPorId: user.id,
          ...(prazoNovo
            ? { dataLimiteAnterior: vaga.dataLimite, dataLimite: prazoNovo, dataLimiteOrigem: null }
            : {}),
        };

        if (ehReaberturaDeEntrega) {
          await this.reabrirDaEntrega(tx, {
            vagaId: id,
            statusDeOrigem: vaga.status,
            codigoAbertura,
            destino: destinoDaReabertura,
            etapasDeEntrega,
            carimbos: carimbosDaReabertura,
            prazoAnterior: vaga.dataLimite,
            prazoNovo: prazoNovo as string,
            regua,
            dto,
            user,
          });
          return;
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
             * O CARIMBO MANUAL É LIMPO PELA REABERTURA (Frente B, ponto 2), e aqui ele IMPORTA de
             * verdade: `fechar` e `cancelar` já o limpam ao encerrar, mas uma vaga que tivesse sido
             * movida à mão e encerrada por um caminho futuro voltaria à vida com a derivação
             * desligada, em silêncio. A vaga reaberta volta para Aberta pela porta, então o status
             * vigente NÃO é o que alguém pôs à mão, e o carimbo não pode afirmar que é.
             */
            statusManualEm: null,
            statusManualPorId: null,
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
            // A ETAPA DO CANCELAMENTO (Frente B, ponto 4) entra na MESMA limpeza, e pela MESMA
            // razão das linhas acima: ela descreve o estado ATUAL, e vaga reaberta não está
            // cancelada. O fato não se perde, porque a etapa viaja na narrativa do evento.
            cancelamentoEtapa: null,
            /*
             * OS TRÊS DO ENCERRAMENTO, que o `cancelar` também escreve. Deixados para trás, a vaga
             * volta viva com a CONTAGEM CONGELADA (o cilindro mostraria o retrato do dia do
             * cancelamento em vez da ocupação derivada de agora) e com o contador de dias lendo uma
             * data de fechamento que não existe mais.
             */
            dataFechamento: null,
            vagasFechadas: null,
            vagasFechadasBanco: null,
            /*
             * OS CARIMBOS DA REABERTURA (0138) SAEM NO MESMO `.set`, e é o argumento escrito no bloco
             * acima: carimbo que viaja em outro `update` é carimbo que pode não acontecer.
             */
            ...carimbosDaReabertura,
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
   * ─ A REABERTURA DA VAGA ENTREGUE: O CLIENTE REPROVOU, E O PROCESSO VOLTA PARA A TRIAGEM (0138) ─
   *
   * ┌─ O PEDIDO DO DIRETOR, E O FUNDAMENTO DELE ─────────────────────────────────────────────────┐
   * │ "A vaga estava ENTREGUE, o cliente voltou dizendo que reprovou. O processo REABRE, e a SLA  │
   * │ volta a ser contabilizada a partir da reabertura." E: "a vaga volta para ABERTA com os       │
   * │ candidatos em TRIAGEM, porque se o cliente reprovou o time precisa fazer NOVA TRIAGEM."      │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ QUEM DEVOLVE A VAGA PARA ABERTA É A DERIVAÇÃO, E NÃO ESTA ROTINA ─────────────────────────┐
   * │ NENHUMA LINHA AQUI ESCREVE `status`, e isso é desenho, não esquecimento. O status da vaga    │
   * │ DERIVA de onde os candidatos estão desde a 0130: a vaga é ENTREGUE enquanto existir alguém   │
   * │ VIVO numa etapa marcada `entrega_ao_cliente`, e volta a ser ABERTA quando não existir mais.  │
   * │ Tirar todo mundo da etapa de entrega JÁ é o gesto que devolve a vaga para Aberta.            │
   * │                                                                                             │
   * │ Escrever `status` à mão aqui seria uma SEGUNDA fonte da mesma resposta, e as duas divergiriam │
   * │ no primeiro caso que a derivação tratasse diferente (alguém que sobrou numa etapa de entrega, │
   * │ uma etapa de entrega nova que o diretor marcar amanhã). A derivação, ao contrário, grava o    │
   * │ evento de trilha dizendo que a vaga andou sozinha, que é o registro honesto do que houve.     │
   * │                                                                                             │
   * │ A ORDEM É A REGRA INTEIRA: primeiro as candidaturas se movem, DEPOIS a linha da vaga é        │
   * │ atualizada (é ela que LIMPA o `status_manual_em`, sem o qual a derivação não encosta na vaga),│
   * │ e só então a derivação roda. Invertido, a derivação leria o carimbo manual e voltaria em       │
   * │ silêncio, deixando a vaga ENTREGUE com prazo novo, afirmando uma reabertura que não houve.    │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O QUE ESTA ROTINA NÃO FAZ, E CADA AUSÊNCIA É DELIBERADA ──────────────────────────────────┐
   * │ . NÃO restaura ninguém: na vaga entregue nada foi descartado, as pessoas estão VIVAS com o   │
   * │   cliente. Chamar o conjunto do cancelamento aqui ressuscitaria quem a seleção recusou por    │
   * │   mérito, num processo que nunca foi cancelado.                                              │
   * │ . NÃO limpa `vagas_fechadas`, `vagas_fechadas_banco` nem `data_fechamento`: são o carimbo de  │
   * │   quem foi entregue de verdade, e apagá-los é o dano que o contrato do reabrir nomeia.        │
   * │ . NÃO muda a SITUAÇÃO de ninguém, só a ETAPA. Quem estava ALOCADO continua ALOCADO e a        │
   * │   ocupação da vaga não se mexe: o cliente reprovar é o LUGAR da pessoa mudando, não o estado  │
   * │   do processo dela. É a mesma garantia central do cancelamento com Stand By.                  │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: a leitura do conjunto pede `id`, `etapa` e `situacao`, e nada mais. Nenhum nome, nenhum
   * CPF, nenhum contato chega a esta rotina, e a trilha guarda uma CONTAGEM. §A.11: sem travessão.
   */
  /**
   * ┌─ UM ACOPLAMENTO DE LGPD QUE ESTE MÉTODO NÃO TEM HOJE, E QUE NASCE NO DIA DE UMA DECISÃO ────┐
   * │ Achado do `tester` em 30/09/2026, registrado aqui porque some de qualquer outro lugar.       │
   * │                                                                                             │
   * │ Este caminho **não limpa `encerrada_em`**, e hoje isso está CERTO: a ENTREGA nasce com       │
   * │ `encerra: false`, então a vaga entregue nunca teve aquele carimbo preenchido, e limpar seria │
   * │ mexer no que não existe.                                                                    │
   * │                                                                                             │
   * │ O QUE MUDA NO DIA EM QUE ALGUÉM PROMOVER A ENTREGA A `encerra: true`: o relógio do expurgo   │
   * │ usa `encerrada_em` para DUAS coisas opostas, proteger (`... or v.encerrada_em is null`) e    │
   * │ CONTAR o prazo de quem está vivo. A vaga reaberta voltaria para ABERTA **com o carimbo antigo │
   * │ preenchido**: todo mundo vivo dentro dela perderia a proteção e passaria a ter o prazo        │
   * │ contado desde a entrega ANTIGA, possivelmente já vencido na varredura seguinte. É irreversível│
   * │ (anonimização não volta) e silencioso.                                                       │
   * │                                                                                             │
   * │ A correção é UMA LINHA, `encerradaEm: null` nos carimbos deste caminho, inócua hoje e rede   │
   * │ amanhã. **NÃO foi aplicada de propósito** (§A.31: a OST não pediu, e escrever teste para ela │
   * │ seria inventar requisito). Fica proposta ao diretor, e este bloco existe para que quem for   │
   * │ mexer no `encerra` da ENTREGA encontre a consequência aqui, e não em produção.               │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async reabrirDaEntrega(
    tx: DbTransaction,
    ctx: {
      vagaId: string;
      statusDeOrigem: string;
      codigoAbertura: string;
      destino: AsEtapaFunil | null;
      etapasDeEntrega: ReadonlySet<string>;
      carimbos: Record<string, unknown>;
      prazoAnterior: string | null;
      prazoNovo: string;
      regua: ReguaDeStatusDaVaga;
      dto: ReabrirVagaDto;
      user: AuthUser;
    },
  ): Promise<void> {
    /*
     * SEM ETAPA DE DESTINO, A REABERTURA RECUSA, e a assimetria com o cancelamento é deliberada (o
     * `EtapasFunilService.etapaDaReabertura` explica): lá, mover é um agrupamento cortês e o gesto
     * principal acontece de todo jeito; AQUI mover é a operação inteira, porque é sair da etapa de
     * entrega que devolve a vaga para Aberta. Sem destino, o que sobraria é uma vaga ENTREGUE com
     * carimbo de reabertura e prazo novo: o pior dos mundos, porque nada falha.
     */
    if (!ctx.destino) {
      throw new BadRequestException(
        "Nenhuma etapa do funil está marcada como destino da reabertura. Marque uma na tela de Etapas Do Funil antes de reabrir esta vaga.",
      );
    }

    /*
     * ─ QUEM ESTÁ COM O CLIENTE, LIDO SOB O LOCK DA VAGA ──────────────────────────────────────
     *
     * O CONJUNTO É DERIVADO DO ESTADO, e não escolhido no corpo: é PERGUNTA DE PRESENÇA, a mesma que
     * a derivação faz. `SITUACOES_VIVAS` porque quem foi descartado ou desistiu saiu do processo, e
     * contá-lo faria a rotina tentar mover uma linha morta.
     *
     * CONJUNTO VAZIO NÃO É ERRO, e não recusa: a vaga pode estar ENTREGUE por movimento manual, com
     * ninguém em etapa de entrega. Aí ninguém se move, a limpeza do carimbo manual acontece, e a
     * derivação devolve a vaga para Aberta pela mesma régua. É autocorreção, não exceção.
     *
     * `inArray` COM LISTA VAZIA NÃO É EXECUTADO: catálogo sem etapa de entrega marcada não produz
     * SQL inválido, produz conjunto vazio, que é o lado fail-closed.
     */
    const codigosDeEntrega = [...ctx.etapasDeEntrega];
    const comOCliente =
      codigosDeEntrega.length === 0
        ? []
        : await tx
            .select({
              candidaturaId: asCandidaturas.id,
              etapa: asCandidaturas.etapa,
            })
            .from(asCandidaturas)
            .where(
              and(
                eq(asCandidaturas.vagaId, ctx.vagaId),
                inArray(asCandidaturas.etapa, codigosDeEntrega),
                inArray(asCandidaturas.situacao, SITUACOES_VIVAS),
              ),
            );

    /*
     * ─ A LISTA DO CORPO É CONFERIDA, E TEM DE SER O CONJUNTO INTEIRO ──────────────────────────
     *
     * ┌─ POR QUE NÃO SE ESCOLHE UM SUBCONJUNTO AQUI ─────────────────────────────────────────┐
     * │ Deixar uma pessoa na etapa de entrega mantém a vaga ENTREGUE pela derivação: a         │
     * │ reabertura gravaria carimbo, prazo novo e trilha, e a vaga continuaria entregue. O      │
     * │ sistema afirmaria uma reabertura que não aconteceu, o que é pior do que recusar.        │
     * └───────────────────────────────────────────────────────────────────────────────────────┘
     *
     * O CORPO SEM LISTA É O CAMINHO NORMAL (todos voltam). VINDO uma lista, ela é CONFERIDA e uma
     * lista parcial é RECUSADA, nunca completada em silêncio: a tela que mandou três de cinco
     * pensava estar escolhendo, e cumprir outra coisa sem dizer é o defeito que a régua do
     * `travaDaSelecao` já recusa no outro caminho.
     */
    const escolhidos = [...new Set(ctx.dto.candidaturaIds ?? [])];
    if (escolhidos.length > 0) {
      const doConjunto = new Set(comOCliente.map((l) => l.candidaturaId));
      const igual =
        escolhidos.length === doConjunto.size && escolhidos.every((id) => doConjunto.has(id));
      if (!igual) {
        throw new ConflictException(
          `A reabertura devolve para ${ctx.destino.rotulo} TODOS os candidatos que estão com o cliente, e não uma parte: são ${doConjunto.size}. Recarregue a página.`,
        );
      }
    }

    /*
     * A TRILHA ENTRA PRIMEIRO, como no caminho do cancelamento, e é ELA que guarda a renegociação do
     * prazo: a linha da vaga passa a ter só o prazo VIGENTE e o imediatamente anterior, então a
     * segunda reabertura sobrescreve o `data_limite_anterior` da primeira. A sequência inteira das
     * renegociações vive aqui, e é por isso que a narrativa carrega os dois valores.
     *
     * `para` É O CÓDIGO DO PAPEL ABERTURA, resolvido no servidor: é para onde a vaga vai, e é o que a
     * derivação vai gravar em seguida. O evento registra a DECISÃO (quem reabriu, com que prazo); o
     * evento da derivação, logo depois, registra o MOVIMENTO do status. São dois fatos, não um
     * repetido, e é o segundo que prova que ninguém forçou o status à mão.
     */
    const [evento] = await tx
      .insert(asVagaStatusEventos)
      .values({
        vagaId: ctx.vagaId,
        de: ctx.statusDeOrigem,
        para: ctx.codigoAbertura,
        // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
        porId: ctx.user.id,
        observacao: this.narrativaDaReaberturaDaEntrega(
          ctx.dto,
          comOCliente.length,
          ctx.destino,
          ctx.prazoAnterior,
          ctx.prazoNovo,
        ),
      })
      .returning({ id: asVagaStatusEventos.id });

    for (const linha of comOCliente) {
      /*
       * A ETAPA MUDA, A SITUAÇÃO NÃO. Ver o bloco do cabeçalho: quem estava ALOCADO continua
       * ALOCADO, e a ocupação da vaga não se mexe.
       */
      await tx
        .update(asCandidaturas)
        .set({ etapa: ctx.destino.codigo, atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, linha.candidaturaId));

      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId: linha.candidaturaId,
        etapaDe: linha.etapa,
        etapaPara: ctx.destino.codigo,
        /*
         * MOVIMENTO, E NÃO DESFECHO: `situacao` nula é o que diz, na linha do tempo, que a pessoa
         * andou no funil e NÃO saiu do processo. Preenchê-la carimbaria um desfecho que não houve.
         */
        situacao: null,
        motivo: `Vaga reaberta: o cliente reprovou a entrega, e o processo volta para ${ctx.destino.rotulo}.`,
        // O MARCADOR ESTRUTURAL, como no cancelamento: é por ele que se sabe QUAIS voltas pertencem
        // a ESTA reabertura, sem casar por texto de motivo, que é editável e frágil.
        vagaStatusEventoId: evento.id,
        porId: ctx.user.id,
      });
    }

    await tx
      .update(vagas)
      .set({
        /*
         * `status` NÃO ESTÁ AQUI, DE PROPÓSITO: ver o bloco do cabeçalho. Quem o escreve é a
         * derivação, logo abaixo, e é ela a única fonte da resposta "esta vaga está entregue?".
         *
         * O CARIMBO MANUAL É LIMPO, e sem ele nada do resto funciona: a derivação NÃO encosta em
         * vaga com `status_manual_em` preenchido, então uma vaga que alguém tivesse movido à mão para
         * ENTREGUE ficaria entregue para sempre, com prazo novo e carimbo de reabertura. Depois desta
         * porta o status vigente já não é o que alguém pôs à mão: é o que o funil diz.
         */
        statusManualEm: null,
        statusManualPorId: null,
        ...ctx.carimbos,
        atualizadoEm: new Date(),
      })
      .where(eq(vagas.id, ctx.vagaId));

    /*
     * E AGORA A DERIVAÇÃO DEVOLVE A VAGA PARA ABERTA, sozinha, porque não sobrou ninguém em etapa de
     * entrega. Ela grava o status E o evento de trilha da mudança, com a frase de que a vaga andou
     * por causa do movimento dos candidatos.
     *
     * ELA NÃO LANÇA POR "NÃO HÁ O QUE FAZER", e isso é a rede de segurança certa: se um caminho
     * futuro deixar alguém numa etapa de entrega, a vaga permanece ENTREGUE e a trilha da reabertura
     * continua gravada, em vez de o sistema mentir sobre o estado dela.
     */
    await derivarStatusDaVaga(tx, ctx.vagaId, ctx.regua, ctx.etapasDeEntrega, ctx.user.id);
  }

  /**
   * A FRASE QUE FICA NA TRILHA DA VAGA quando a entrega é reaberta, irmã da `narrativaDaReabertura`.
   *
   * ELA CARREGA OS DOIS PRAZOS porque é a ÚNICA cópia da sequência: a linha da vaga guarda o prazo
   * vigente e o imediatamente anterior, então a segunda reabertura sobrescreve o que a primeira
   * anotou. Quem quiser saber "de quanto para quanto, e quantas vezes" lê a trilha.
   *
   * §A.6: uma contagem, duas datas de processo, o nome da etapa e a observação de quem reabriu.
   * Nenhum nome, nenhum id de candidato, nenhum CPF. §A.11: sem travessão.
   */
  private narrativaDaReaberturaDaEntrega(
    dto: ReabrirVagaDto,
    quantos: number,
    destino: AsEtapaFunil,
    prazoAnterior: string | null,
    prazoNovo: string,
  ): string {
    const partes = ["Reaberta a partir da entrega: o cliente reprovou."];
    partes.push(
      quantos === 0
        ? `Nenhum candidato estava com o cliente, então ninguém foi movido para ${destino.rotulo}.`
        : quantos === 1
          ? `1 candidato voltou para ${destino.rotulo}.`
          : `${quantos} candidatos voltaram para ${destino.rotulo}.`,
    );
    partes.push(
      prazoAnterior
        ? `Previsão de entrega renegociada de ${prazoAnterior} para ${prazoNovo}.`
        : `Previsão de entrega definida em ${prazoNovo}. A vaga não tinha previsão registrada antes.`,
    );
    if (dto.observacao) partes.push(`Observação: ${dto.observacao}.`);
    return partes.join(" ");
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
      /*
       * ┌─ A SEGUNDA CONDIÇÃO CRESCEU, E ELA PERGUNTA À RÉGUA, NÃO A UM PAPEL ────────────────────┐
       * │ Ela cobria só o RASCUNHO, e a fila de revisão nasceu FORA dela: `PENDENTE_REVISAO` não   │
       * │ encerra (a primeira condição libera a saída) e `ABERTA` é destino manual de propósito (o │
       * │ destino também libera), então a vaga espelhada SEM CLIENTE terminava esta chamada        │
       * │ publicada, por uma rota HTTP, e a trava do `liberarPendenteRevisao` continuava lá,       │
       * │ verdadeira e inútil, porque a mesma tela oferecia o outro caminho.                        │
       * │                                                                                          │
       * │ A PERGUNTA MUDOU DE CASA DE PROPÓSITO (`exigeReguaDeAbertura`), e o porquê da lista de   │
       * │ papéis viver lá está escrito lá: o quarto status que precisar desta recusa se acrescenta │
       * │ em UM lugar, com a explicação na frente, em vez de virar um terceiro `ehDoPapel` perdido │
       * │ no meio de uma transação. NÃO "SIMPLIFIQUE" ESTA CONDIÇÃO achando que a primeira a cobre:│
       * │ ela é a única que existe, nos dois casos.                                                 │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (regua.exigeReguaDeAbertura(vaga.status)) {
        throw new ConflictException(
          regua.ehDoPapel(vaga.status, "REVISAO")
            ? "Esta vaga veio do Pandapé e está pendente de revisão. Ela sai da fila pela liberação, que confere o cliente vinculado."
            : "O rascunho é publicado pela trilha de abertura, que confere os campos obrigatórios.",
        );
      }
      // O MOVIMENTO PARA ONDE A VAGA JÁ ESTÁ NÃO É MOVIMENTO: gravá-lo encheria a trilha de linhas
      // que não contam nada e faria a camada 2 do apagar ver rastro onde não houve.
      if (vaga.status === dto.status) {
        throw new ConflictException("A vaga já está neste status. Recarregue a página.");
      }

      await tx
        .update(vagas)
        .set({
          status: dto.status,
          /*
           * ─ O CARIMBO QUE FAZ O MANUAL GRUDAR (Frente B, ponto 2) ──────────────────────────────
           *
           * ESTA É A ÚNICA ESCRITA DE `status_manual_em` NO SISTEMA, e é ela que a derivação lê
           * para não desfazer o que o time decidiu. O padrão é o do `farol_global` (§A.3: o
           * automático deriva, o manual é pegajoso), com a diferença de forma explicada no schema:
           * aqui `ABERTA` e `ENTREGUE` são alcançáveis pelos DOIS caminhos, então o que gruda é o
           * carimbo e não o valor.
           *
           * ELE NÃO EXPIRA, e é decisão: o time move a vaga à mão porque sabe de algo que o funil
           * não conta (o cliente pediu para segurar, a posição mudou de escopo). Uma derivação que
           * desfizesse isso na primeira movimentação de candidato transformaria a decisão do
           * consultor em ruído. Quem devolve a vaga ao automático são as portas com régua própria,
           * que LIMPAM o carimbo ao gravar status (fechar, cancelar, reabrir, liberar, publicar).
           *
           * QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
           */
          statusManualEm: new Date(),
          statusManualPorId: user.id,
          atualizadoEm: new Date(),
        })
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

  // ── A FILA DE REVISÃO DA VAGA ESPELHADA ──────────────────────────────────────────────────────

  /**
   * A FILA: as vagas que a varredura do Pandapé espelhou e que ninguém do EA ainda revisou.
   *
   * ELA REUSA A `list()`, E ISSO NÃO É PREGUIÇA: a fila é a MESMA tabela da Central de Vagas, com as
   * mesmas colunas resolvidas (cliente, cargo, autor, ocupação) e a mesma máscara (§A.12). Uma
   * segunda consulta divergiria da primeira no primeiro ajuste, e a que divergisse seria a da fila,
   * mostrando um conjunto que a tela principal não mostra.
   *
   * O RECORTE É O PAPEL, resolvido no catálogo: o código é editável pelo diretor, o papel não.
   */
  async pendentesDeRevisao(): Promise<VagaItemOndaE[]> {
    const regua = await this.statusVaga.regua();
    const codigo = regua.codigoDoPapel("REVISAO");
    const emRevisao = (await this.list()).filter((v) => v.status === codigo);
    const visiveis = await this.filtrarFilaDeRevisao(emRevisao);
    return this.comPropostaDeCliente(visiveis);
  }

  /**
   * ─ O FILTRO DA FILA DE REVISÃO (F3/F4, OPÇÃO A em 07/10/2026): PLANILHA E RECUSA ───────────────
   *
   * A fila mostra só o que é trabalho VIVO de revisão. Duas subtrações, as duas ZERO DELEÇÃO (as
   * vagas continuam no banco, só somem da tela):
   *   1. F4, RECUSADA: a vaga com `recusada_em` não nula está na aba RECUSADAS, não na fila.
   *   2. F3, PLANILHA: a vaga do Pandapé APARECE por padrão, e só sai quando a planilha a traz como
   *      FECHADO ou CANCELADO (`vagaDaPlanilhaSai`, a MESMA régua do gate de entrada da varredura).
   *      Código ausente da planilha, status nulo ou status desconhecido: APARECE. O fundamento do
   *      diretor é não PERDER VAGA DE VISTA porque o time ainda não lançou o código na planilha.
   *      Vaga MANUAL (sem `idVacancyPandape`) não é do Pandapé: a planilha não se aplica a ela.
   *
   * ┌─ O FILTRO DE PLANILHA SÓ VALE QUANDO O ESPELHO ESTÁ POPULADO ────────────────────────────────┐
   * │ Sem planilha configurada o espelho não tem status nenhum, e nesse estado nem há o que excluir. │
   * │ O sinal de "planilha ativa" é haver QUALQUER linha com `status_planilha` não nulo, no mesmo    │
   * │ espírito do gate (que só é injetado com a planilha configurada). Inativo, a F3 não filtra, o   │
   * │ que é fail-open e segue coerente com a Opção A.                                                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async filtrarFilaDeRevisao(itens: VagaItemOndaE[]): Promise<VagaItemOndaE[]> {
    if (itens.length === 0) return itens;
    const recusadas = await this.vagasRecusadas(itens.map((i) => i.id));
    const semRecusa = itens.filter((v) => !recusadas.has(v.id));
    const planilha = await this.statusDaPlanilhaDasVagas(semRecusa);
    if (!planilha.ativa) return semRecusa;
    return semRecusa.filter((v) => {
      // Vaga MANUAL (sem id do Pandapé) não é do espelho: a régua da planilha não se aplica a ela.
      if (v.idVacancyPandape === null) return true;
      const chaveId = normalizarCodigoDeVaga(v.idVacancyPandape);
      const chaveRef = normalizarCodigoDeVaga(v.codigo);
      /*
       * ┌─ A CHAVE FORTE DECIDE QUANDO ESTÁ PRESENTE, E "PRESENTE DIZENDO NADA" É PRESENÇA ─────────┐
       * │ ISTO ERA UM `??` EM CADEIA, e o `??` não distingue "a chave não existe no espelho" de "a   │
       * │ chave existe com status NULO". `porCodigo` é `Map<string, string | null>`, então a chave    │
       * │ forte presente com nulo devolvia `null`, e `null ?? X` CAÍA PARA A CHAVE FRACA. Com o id    │
       * │ do Pandapé no espelho sem status e o `codigo` no espelho como FECHADO, a fila ESCONDIA a    │
       * │ vaga, enquanto o gate de escrita (que usa `find` sobre as linhas) a DEIXAVA ENTRAR: os dois │
       * │ consumidores discordavam, e a varredura espelhava de 30 em 30 minutos uma vaga que a tela   │
       * │ nunca mostrava. É exatamente o "perder vaga de vista" que a Opção A existe para eliminar.   │
       * │                                                                                             │
       * │ Pela régua do requisito, status NULO APARECE. Agora a presença é testada com `has`, e só    │
       * │ quando a chave forte está AUSENTE a fraca responde, espelhando a precedência do gate.       │
       * │ Achado pelo `tester` independente (§A.38); impacto medido em produção na publicação: 0      │
       * │ vaga, porque só 2 linhas do espelho estão sem status. Consertado antes de a planilha        │
       * │ ganhar mais linhas sem status, não depois.                                                  │
       * └─────────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const status =
        chaveId !== null && planilha.porCodigo.has(chaveId)
          ? (planilha.porCodigo.get(chaveId) ?? null)
          : chaveRef !== null && planilha.porCodigo.has(chaveRef)
            ? (planilha.porCodigo.get(chaveRef) ?? null)
            : null;
      // OPÇÃO A: aparece por padrão, sai só quando a planilha diz FECHADO ou CANCELADO.
      return !vagaDaPlanilhaSai(status);
    });
  }

  /**
   * As vagas RECUSADAS dentre um conjunto. Raw `sql` de propósito: o fake de teste da fila responde
   * `execute` com vazio, então a fila não é filtrada por recusa num mundo sem recusa; em produção, lê
   * `vagas.recusada_em`. §A.6: devolve só ids.
   */
  private async vagasRecusadas(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const lista = sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const linhas = (await this.db.execute(sql`
      select id from vagas where recusada_em is not null and id in (${lista})
    `)) as unknown as { id: string }[];
    return new Set(linhas.map((l) => l.id));
  }

  /**
   * O STATUS DA PLANILHA (espelho) para um conjunto de vagas, mais o sinal de PLANILHA ATIVA.
   *
   * `ativa` é "há qualquer de/para com `status_planilha` não nulo", o sinal de que o F2 populou o
   * espelho. `porCodigo` casa `codigo_externo` com o `idVacancyPandape`/`codigo` da vaga. Raw `sql`:
   * no fake, `execute` devolve vazio, logo `ativa = false` e a F3 não filtra. §A.6: só status, token
   * canônico, nunca nome nem CPF.
   */
  private async statusDaPlanilhaDasVagas(
    itens: VagaItemOndaE[],
  ): Promise<{ ativa: boolean; porCodigo: Map<string, string | null> }> {
    const ativaLinhas = (await this.db.execute(sql`
      select exists(
        select 1 from as_depara_cliente_vaga
         where fonte = ${FONTE_DO_DEPARA_DE_CLIENTE} and status_planilha is not null
      ) as ativa
    `)) as unknown as { ativa: boolean }[];
    const ativa = ativaLinhas[0]?.ativa === true;
    const porCodigo = new Map<string, string | null>();
    if (!ativa) return { ativa, porCodigo };
    const chaves = new Set<string>();
    for (const v of itens) {
      const chaveId = normalizarCodigoDeVaga(v.idVacancyPandape);
      const chaveRef = normalizarCodigoDeVaga(v.codigo);
      if (chaveId !== null) chaves.add(chaveId);
      if (chaveRef !== null) chaves.add(chaveRef);
    }
    if (chaves.size === 0) return { ativa, porCodigo };
    const lista = sql.join(
      [...chaves].map((c) => sql`${c}`),
      sql`, `,
    );
    const linhas = (await this.db.execute(sql`
      select codigo_externo, status_planilha
        from as_depara_cliente_vaga
       where fonte = ${FONTE_DO_DEPARA_DE_CLIENTE} and codigo_externo in (${lista})
    `)) as unknown as { codigo_externo: string; status_planilha: string | null }[];
    for (const l of linhas) porCodigo.set(l.codigo_externo, l.status_planilha);
    return { ativa, porCodigo };
  }

  /**
   * ─ A ABA RECUSADAS (F4): as vagas que o consultor tirou da fila, com quem recusou e quando ───────
   *
   * MESMA FORMA DE ITEM da fila de revisão, MAIS `recusadaEm`/`recusadaPorNome` (contrato do front).
   * NÃO aplica o filtro de planilha: a recusa é a autoridade, e esconder por planilha prenderia uma
   * vaga recusada que depois saiu da planilha (ninguém poderia devolvê-la). Mostra TODA vaga com
   * `recusada_em` não nula, para que o botão "devolver" alcance qualquer uma delas.
   */
  async recusadas(): Promise<VagaItemRecusada[]> {
    const itens = await this.list();
    const info = await this.infoDeRecusa(itens.map((i) => i.id));
    const recusadas = itens.filter((v) => info.has(v.id));
    const comProposta = await this.comPropostaDeCliente(recusadas);
    return comProposta.map((v) => {
      const r = info.get(v.id);
      return { ...v, recusadaEm: r?.recusadaEm ?? null, recusadaPorNome: r?.recusadaPorNome ?? null };
    });
  }

  /** Quem recusou + quando, por lote de id. Raw `sql`: no fake, `execute` devolve vazio. §A.6: id, nome do autor, data. */
  private async infoDeRecusa(
    ids: string[],
  ): Promise<Map<string, { recusadaEm: string; recusadaPorNome: string | null }>> {
    const mapa = new Map<string, { recusadaEm: string; recusadaPorNome: string | null }>();
    if (ids.length === 0) return mapa;
    const lista = sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const linhas = (await this.db.execute(sql`
      select v.id, v.recusada_em, u.nome as recusada_por_nome
        from vagas v
        left join usuarios u on u.id = v.recusada_por_id
       where v.recusada_em is not null and v.id in (${lista})
    `)) as unknown as { id: string; recusada_em: Date | string; recusada_por_nome: string | null }[];
    for (const l of linhas) {
      mapa.set(l.id, {
        recusadaEm: new Date(l.recusada_em).toISOString(),
        recusadaPorNome: l.recusada_por_nome,
      });
    }
    return mapa;
  }

  /**
   * ─ RECUSAR A LIBERAÇÃO DA VAGA (F4), ESPELHANDO A RECUSA DA ADMISSÃO ───────────────────────────
   *
   * SÓ A PARTIR DO PAPEL REVISAO, e só o que ainda não foi recusado. A autoria vem da SESSÃO, NUNCA
   * do corpo (é trilha). A marca `recusada_em` tira a vaga da fila (F3) e a põe na aba RECUSADAS, sem
   * mudar o status nem apagar nada. A trilha RECUSOU vai na MESMA transação (§A.3 regra 8).
   *
   * SEM `@Roles` na rota (decisão do diretor, paridade com `liberar-revisao`): a trava é o menu
   * `as-vagas`. A leitura do estado é sob a linha, no molde do `moverStatus`: decidir sobre o instante
   * travado, não sobre a fotografia da tela.
   */
  async recusarLiberacao(id: string, user: AuthUser): Promise<void> {
    const regua = await this.statusVaga.regua();
    await this.db.transaction(async (tx) => {
      const linhas = (await tx.execute(sql`
        select status, recusada_em from vagas where id = ${id}::uuid for update
      `)) as unknown as { status: string; recusada_em: Date | string | null }[];
      const vaga = linhas[0];
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");
      if (vaga.recusada_em !== null) {
        throw new ConflictException("Esta vaga já está recusada.");
      }
      if (!regua.ehDoPapel(vaga.status, "REVISAO")) {
        throw new ConflictException("Só é possível recusar uma vaga pendente de revisão.");
      }
      await tx.execute(sql`
        update vagas
           set recusada_em = now(), recusada_por_id = ${user.id}::uuid, atualizado_em = now()
         where id = ${id}::uuid
      `);
      await tx.execute(sql`
        insert into vaga_recusa_eventos (vaga_id, acao, por_id)
        values (${id}::uuid, 'RECUSOU', ${user.id}::uuid)
      `);
    });
  }

  /**
   * ─ DEVOLVER A VAGA PARA A FILA DE REVISÃO (F4): o inverso de recusar ───────────────────────────
   *
   * Limpa a marca (`recusada_em = null`), devolve a vaga para a fila e registra DEVOLVEU na trilha.
   * Só a partir de recusada. A marca é a ÚNICA porta de volta (a varredura NÃO tira a vaga da recusa).
   */
  async devolverRevisao(id: string, user: AuthUser): Promise<void> {
    await this.db.transaction(async (tx) => {
      const linhas = (await tx.execute(sql`
        select recusada_em from vagas where id = ${id}::uuid for update
      `)) as unknown as { recusada_em: Date | string | null }[];
      const vaga = linhas[0];
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");
      if (vaga.recusada_em === null) throw new ConflictException("Esta vaga não está recusada.");
      await tx.execute(sql`
        update vagas
           set recusada_em = null, recusada_por_id = null, atualizado_em = now()
         where id = ${id}::uuid
      `);
      await tx.execute(sql`
        insert into vaga_recusa_eventos (vaga_id, acao, por_id)
        values (${id}::uuid, 'DEVOLVEU', ${user.id}::uuid)
      `);
    });
  }

  /**
   * ─ A PROPOSTA DE CLIENTE DA PLANILHA, ANEXADA AOS ITENS DA FILA DE REVISÃO ───────────────────
   *
   * ┌─ POR QUE ELA VEM DE OUTRO MÓDULO, E NÃO DA `list()` ──────────────────────────────────────┐
   * │ A proposta tem LISTA BRANCA DE LEITORES, conferida por varredura de fonte, e ESTE arquivo  │
   * │ fica FORA dela: é ele que escreve e devolve `cod_cliente`, e a regra inteira da frente é    │
   * │ que o valor da planilha não tem caminho até lá. Lê-la dentro da `list()` faria a proposta   │
   * │ nascer na MESMA consulta que o cliente de verdade, que é a um `??` de distância do furo.    │
   * │                                                                                            │
   * │ Quem lê é `as/vagas/vagas-revisao-proposta.ts`, por LOTE de id, e o que volta já vem com    │
   * │ `conferida: false` no tipo: a tela TEM de marcar que ninguém conferiu aquilo (condição C1). │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * SÓ NAS DUAS LISTAS DA REVISÃO E NO DETALHE, e não na `list()` inteira: a Central de Vagas mostra
   * vaga já liberada, onde a proposta não tem o que dizer, e uma consulta a mais por linha ali seria
   * paga por toda tela que lista vaga.
   */
  private async comPropostaDeCliente<
    T extends { id: string; propostaDeCliente?: PropostaDeClienteDaVaga | null },
  >(itens: T[]): Promise<T[]> {
    if (itens.length === 0) return itens;
    const propostas = await propostasDeClienteDasVagas(
      this.db,
      itens.map((i) => i.id),
    );
    return itens.map((i) => ({ ...i, propostaDeCliente: propostas[i.id] ?? null }));
  }

  /**
   * A CONTAGEM LEVE da fila, para o badge do menu e o polling da tela.
   *
   * ELA NÃO PASSA PELA `list()` de propósito: a listagem resolve uma dúzia de junções para desenhar
   * linha, e quem só precisa do NÚMERO chamaria isso a cada minuto, por usuário. Aqui é um `count`
   * sobre a coluna indexada, e nenhum dado de vaga sai daqui (§A.6: devolve número, nunca linha).
   */
  async contarPendentesDeRevisao(): Promise<{ count: number }> {
    /*
     * ─ O BADGE CONTA O MESMO QUE A FILA MOSTRA (§A.27) ──────────────────────────────────────────
     *
     * Antes era um `count` cru sobre `status = REVISAO`. Com a F3 (planilha) e a F4 (recusa) tirando
     * vagas da FILA, um count cru diria "10 pendentes" enquanto a fila mostra 3: a divergência exata
     * entre contador e lista que a §A.27 existe para impedir. Então o badge passa pelo MESMO filtro
     * (`filtrarFilaDeRevisao`), sem a proposta de cliente (que o número não usa). O custo é carregar a
     * lista no poll; a consistência com o que o diretor abre vale mais do que o count indexado.
     */
    const regua = await this.statusVaga.regua();
    const codigo = regua.codigoDoPapel("REVISAO");
    const emRevisao = (await this.list()).filter((v) => v.status === codigo);
    const visiveis = await this.filtrarFilaDeRevisao(emRevisao);
    return { count: visiveis.length };
  }

  /**
   * ─ LIBERAR A VAGA PENDENTE DE REVISÃO: UMA VAGA POR VEZ, E SÓ COM CLIENTE ─────────────────────
   *
   * ┌─ SEM LOTE, E A AUSÊNCIA É A DECISÃO ────────────────────────────────────────────────────────┐
   * │ O lote foi VETADO: um cliente errado aplicado a centenas de vagas atribui centenas de pessoas │
   * │ ao controlador errado, e desfazer não desfaz o que já foi visto. Não existe rota de lote, e   │
   * │ não é para existir.                                                                           │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ SEM `@Roles`, E A AUSÊNCIA TAMBÉM É DECISÃO ───────────────────────────────────────────────┐
   * │ Revisar a vaga que chegou, vincular o cliente que falta e liberar é trabalho de consultor,   │
   * │ como a Liberação Admissional. O que é de Master é DESFAZER (`reverterLiberacaoDaRevisao`).    │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A TRAVA DO CLIENTE É DO SERVIDOR, SOB A LINHA TRAVADA ─────────────────────────────────────┐
   * │ Guarda só de tela é contornada por qualquer chamada direta à rota, e a vaga sairia da fila   │
   * │ sem o dado que a pôs lá: depois disso ninguém mais sabe que faltava. O `cod_cliente` é lido  │
   * │ DENTRO da transação, sob o `SELECT ... FOR UPDATE`, no molde do `moverStatus`, e não da       │
   * │ fotografia que a tela viu: entre o clique e a gravação alguém pode ter desvinculado.          │
   * │ E A RECUSA ACONTECE ANTES DE ESCREVER: recusa que já gravou não é recusa.                     │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O DESTINO É O CÓDIGO DO PAPEL ABERTURA, perguntado ao catálogo. Um literal acertaria por
   * coincidência, e a coincidência acaba na primeira renomeação, virando FK RESTRICT na operação.
   *
   * A TRILHA VAI NA MESMA TRANSAÇÃO (regra 8 da §A.3): quem liberou, quando, e COM QUAL CLIENTE. O
   * cliente entra na observação porque ele é a decisão que esta porta registra, e porque a vaga pode
   * ser revinculada depois: sem ele no rastro, "por que esta vaga foi liberada" fica sem resposta.
   * §A.6: código de cliente, id de usuário interno e dois códigos de status. Nada de candidato.
   */
  async liberarPendenteRevisao(
    id: string,
    user: AuthUser,
    /*
     * ┌─ O CORPO VEM DEPOIS DO USUÁRIO, E A ORDEM NÃO É DESCUIDO ──────────────────────────────┐
     * │ Ele é OPCIONAL: quem já vinculou o cliente em outra tela chama sem corpo nenhum, e a    │
     * │ liberação lê o vínculo do banco. A tela manda o cliente JUNTO, porque vincular e liberar│
     * │ é um gesto só para quem opera, e duas chamadas deixariam a vaga com cliente e ainda na  │
     * │ fila quando a segunda falhasse, com a retentativa tendo de adivinhar onde parou.         │
     * │ Com o parâmetro no fim, a chamada de dois argumentos continua válida, e ela é a forma    │
     * │ que o contrato de teste desta frente exercita.                                           │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    dto?: LiberarVagaRevisaoDto,
  ): Promise<VagaListItem> {
    const regua = await this.statusVaga.regua();
    const codigoAbertura = regua.codigoDoPapel("ABERTURA");
    const clienteDoCorpo = (dto?.codCliente ?? "").trim();
    if (clienteDoCorpo !== "") await this.exigirClienteExistente(clienteDoCorpo);

    /*
     * ┌─ O CORPO INTEIRO, OU SÓ O CLIENTE: OS DOIS CAMINHOS CONTINUAM VÁLIDOS ────────────────────┐
     * │ A tela nova manda o FORMULÁRIO COMPLETO, porque é nela que a vaga incompleta do Pandapé é │
     * │ preenchida. A chamada antiga (sem corpo, ou só com o cliente) continua existindo e é o    │
     * │ contrato que os testes já validados exercitam: quem já vinculou o cliente em outra tela   │
     * │ libera sem mandar campo nenhum.                                                            │
     * │                                                                                            │
     * │ A DISTINÇÃO É EXPLÍCITA, e não deduzida campo a campo, porque a regra da casa na trilha é │
     * │ "O CORPO É COMPLETO": campo ausente é campo LIMPO, e é assim que o idioma, o escape de    │
     * │ "Outros" e o detalhe do híbrido somem quando a pessoa desmarca a opção. Aplicar essa regra│
     * │ a um corpo que só traz o cliente APAGARIA a vaga inteira na saída da fila. Então: corpo   │
     * │ com campo de vaga = formulário completo, que sobrescreve; corpo só com cliente = o gesto  │
     * │ antigo, que não toca campo nenhum.                                                         │
     * │                                                                                            │
     * │ OS ONZE OBRIGATÓRIOS SÃO COBRADOS NOS DOIS CAMINHOS, e é esse o pedido: sem informação    │
     * │ obrigatória a vaga NÃO sai da fila, venha ela do corpo ou já esteja gravada.               │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const corpoCompleto = dto !== undefined && this.corpoTrazCamposDaVaga(dto);
    /*
     * AS LEITURAS DE CATÁLOGO FICAM FORA DA TRANSAÇÃO, como a conferência do cliente e pelo mesmo
     * motivo: elas respondem sobre cadastros que não mudam no intervalo, e nenhuma delas escreve.
     * O que acontece DENTRO, sob a linha travada, é a decisão e a escrita.
     */
    const cidade = corpoCompleto ? await this.resolverCidade(dto!.cidadeId) : null;
    const linhaServicoId = corpoCompleto ? await this.resolverLinhaServico(dto!.linhaServicoId) : null;
    const herdaveis = corpoCompleto
      ? await this.resolverHerdaveis(dto!)
      : { segmentoId: null, comercialId: null };
    /*
     * O MAPEAMENTO É O MESMO DA TRILHA (`camposDaTrilha`), e não uma segunda cópia: é ele que
     * guarda a higiene de campo inteira (escape do "Outros", tempo de contrato só no vínculo com
     * prazo, motivo e CPF do substituído só no temporário, região conferida contra a UF). Uma
     * segunda cópia aqui limparia coisas diferentes das que a abertura limpa, e a divergência só
     * apareceria no banco.
     */
    const camposDoCorpo = corpoCompleto
      ? this.camposDaTrilha(regua, dto!, codigoAbertura, cidade, linhaServicoId, herdaveis)
      : null;
    // O CÓDIGO DA VAGA É ÚNICO NO SISTEMA: sem esta conferência, o código digitado na liberação
    // bateria no índice unique e viraria 500 genérico no meio da transação.
    if (camposDoCorpo) await this.travaDuplicidadeDeCodigo(camposDoCorpo.codigo, id);
    const beneficios = corpoCompleto ? await this.validaBeneficios(dto!.beneficios ?? []) : [];

    await this.db.transaction(async (tx) => {
      const [vaga] = await tx
        .select({
          id: vagas.id,
          status: vagas.status,
          codCliente: vagas.codCliente,
          /*
           * OS CAMPOS DA RÉGUA SÃO LIDOS SOB A LINHA TRAVADA, e não da fotografia que a tela viu:
           * é com eles que o corpo é MESCLADO antes de a régua perguntar o que falta. Sem isto, a
           * liberação sem corpo não teria contra o que cobrar os onze, e a que vem com corpo não
           * saberia que a meta e o cliente já existiam.
           */
          codigo: vagas.codigo,
          nomeDivulgacao: vagas.nomeDivulgacao,
          cargoId: vagas.cargoId,
          posicoesOficiais: vagas.posicoesOficiais,
          posicoesBanco: vagas.posicoesBanco,
          natureza: vagas.natureza,
          sazonalidade: vagas.sazonalidade,
          linhaServicoId: vagas.linhaServicoId,
          dataAbertura: vagas.dataAbertura,
          dataLimite: vagas.dataLimite,
        })
        .from(vagas)
        .where(eq(vagas.id, id))
        .for("update");
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");

      /*
       * SÓ SAI DAQUI QUEM ESTÁ NA FILA. Sem esta conferência, a liberação vira uma SEGUNDA porta
       * para o papel ABERTURA, sem a régua de obrigatórios da trilha, que é exatamente o buraco que
       * a guarda do `moverStatus` teve de fechar.
       */
      if (!regua.ehDoPapel(vaga.status, "REVISAO")) {
        throw new ConflictException(
          "Esta vaga não está pendente de revisão. Recarregue a página.",
        );
      }
      /*
       * A TRAVA É SOBRE O CLIENTE FINAL, e ela continua sendo do servidor: o corpo pode TRAZER o
       * vínculo que falta, mas não pode dispensá-lo. Vazio nos dois lados é recusa, e a recusa
       * acontece ANTES de qualquer escrita, porque recusa que já gravou não é recusa.
       */
      const clienteFinal = clienteDoCorpo !== "" ? clienteDoCorpo : (vaga.codCliente ?? "").trim();
      if (clienteFinal === "") {
        throw new ConflictException(
          "Vincule o cliente desta vaga antes de liberar. A vaga veio do Pandapé sem cliente, e é isso que a revisão existe para resolver.",
        );
      }

      /*
       * ┌─ A MESCLA, E ELA ACONTECE ANTES DE QUALQUER ESCRITA ─────────────────────────────────────┐
       * │ O que vai ser GRAVADO é o que a régua confere, e não uma composição parecida: conferir a │
       * │ mescla e gravar outra coisa deixaria passar exatamente o campo que o corpo não mandou e  │
       * │ o `camposDaTrilha` limparia. Duas coisas vêm da LINHA TRAVADA, não do corpo:             │
       * │   . o CLIENTE, que é a decisão que esta porta sempre registrou (e pode já estar na vaga);│
       * │   . a META OFICIAL, pela MESMA exceção da trilha (`metaOficialDaTrilha`): corpo sem o    │
       * │     campo PRESERVA o número, porque apagá-lo deixa o fechamento sem gate nenhum e o      │
       * │     rastro não sabe escrever "virou nulo".                                                │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const campos = camposDoCorpo
        ? {
            ...camposDoCorpo,
            codCliente: clienteFinal,
            posicoesOficiais: this.metaOficialDaTrilha(dto!, vaga),
          }
        : null;
      /*
       * ─ OS ONZE OBRIGATÓRIOS, COM O STATUS DE DESTINO ────────────────────────────────────────
       *
       * O STATUS QUE A RÉGUA VÊ É O DA ABERTURA, nunca o atual: com o código da FILA ela cairia no
       * ramo do rascunho e não cobraria NADA, que é precisamente o buraco desta porta. A mensagem
       * sai igual à da publicação, com a LISTA INTEIRA de uma vez, porque quem preenche quarenta
       * campos não descobre as pendências uma por uma.
       */
      this.travaObrigatorios(
        regua,
        campos ?? { ...vaga, codCliente: clienteFinal, status: codigoAbertura },
        codigoAbertura,
      );

      /*
       * ┌─ A META NÃO DESCE ABAIXO DO ENTREGUE, TAMBÉM POR AQUI, E COM O MESMO RASTRO ────────────┐
       * │ Esta porta passa a ser o TERCEIRO escritor de `posicoes_oficiais` (os outros dois são a │
       * │ trilha e a rota das posições, as duas com trava e rastro desde a auditoria de 09/09).   │
       * │ A vaga na FILA RECEBE CANDIDATO (`PENDENTE_REVISAO` tem `recebeCandidato: true`, e é    │
       * │ obrigatório que tenha: é nela que a varredura pendura quem se inscreveu), então liberar │
       * │ com um número menor baixaria a meta sem uma linha em lugar nenhum, e o fechamento       │
       * │ passaria pela porta normal, sem Master. As duas peças são as que já existem, aplicadas  │
       * │ na porta que ficou de fora, e as duas decidem ANTES da escrita.                          │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const reducao = campos ? this.reducaoDeMeta(vaga, campos) : null;
      if (campos) {
        const ocupacao =
          (await this.ocupacaoPorVaga([{ id, posicoesOficiais: vaga.posicoesOficiais }])).get(id) ??
          this.ocupacaoVazia(id, vaga.posicoesOficiais);
        const excesso = excessoDePosicoes(
          {
            vagasFechadas: ocupacao.finalizadasOficial,
            vagasFechadasBanco: ocupacao.finalizadasBanco,
          },
          { posicoesOficiais: campos.posicoesOficiais, posicoesBanco: campos.posicoesBanco },
        );
        if (excesso) throw new BadRequestException(this.mensagemDeExcesso(excesso));
      }

      await tx
        .update(vagas)
        .set({
          // O FORMULÁRIO INTEIRO E A SAÍDA DA FILA NA MESMA ESCRITA: ou a vaga sai COMPLETA, ou ela
          // não sai. Duas chamadas deixariam a vaga preenchida e ainda na fila quando a segunda
          // falhasse, com a retentativa tendo de adivinhar onde parou.
          //
          // OS CARIMBOS DE INTEGRAÇÃO (`idVacancyPandape`, `envioShortlist`) SÃO OMITIDOS: o
          // formulário de completude não os traz, então o `camposDaTrilha` os emitiria como null e
          // o UPDATE apagaria o `id_vacancy_pandape`. Sem ele, a varredura do Pandapé não reconhece
          // a vaga e cria uma DUPLICATA no ciclo seguinte. Omitir a chave deixa a coluna intocada.
          ...this.semCarimbosDeIntegracao(campos),
          /*
           * A LIBERAÇÃO TAMBÉM É GRAVAÇÃO HUMANA, e é nela que o pré-preenchimento é conferido:
           * o campo que a pessoa TROCOU no formulário de completude perde a procedência, campo a
           * campo, pela mesma régua de `atualizar` (ver `procedenciaALimpar`).
           *
           * SEM CORPO, NADA SE LIMPA: `campos` é nulo na liberação que só vincula o cliente, e a
           * função devolve objeto vazio. Liberar não é editar, e quem não mandou campo não mudou
           * campo nenhum.
           *
           * OS CINCO VALORES VÊM DA LINHA TRAVADA (`vaga` já os seleciona), então a comparação é
           * contra o que está gravado NESTE instante, e não contra a fotografia que a tela viu.
           */
          ...procedenciaALimpar(vaga, campos),
          status: codigoAbertura,
          /*
           * O CARIMBO MANUAL NASCE LIMPO AQUI (Frente B, ponto 2). A vaga espelhada nunca foi
           * movida à mão, mas a liberação é uma PORTA COM RÉGUA que grava status, e a invariante é
           * "preenchido <=> o status vigente veio de um gesto manual". Escrever o `null` em toda
           * porta, e não só nas que poderiam ter o carimbo, é o que impede a invariante de depender
           * de alguém lembrar qual caminho pode ou não ter passado pelo `moverStatus` antes.
           */
          statusManualEm: null,
          statusManualPorId: null,
          atualizadoEm: new Date(),
          // O VÍNCULO É GRAVADO NA MESMA TRANSAÇÃO da saída da fila: ou a vaga sai COM cliente, ou
          // ela não sai. Não existe o estado intermediário em que uma das duas metades venceu.
          ...(clienteDoCorpo !== "" ? { codCliente: clienteDoCorpo } : {}),
        })
        .where(eq(vagas.id, id));

      // O RASTRO DA REDUÇÃO VAI NA MESMA TRANSAÇÃO DA ESCRITA: rastro que pode FALTAR quando a
      // escrita deu certo não é rastro, seria a meta menor sem ninguém para responder por ela.
      if (reducao) {
        await tx.insert(vagaMetaReducoes).values({
          vagaId: id,
          deOficiais: reducao.deOficiais,
          paraOficiais: reducao.paraOficiais,
          deBanco: reducao.deBanco,
          paraBanco: reducao.paraBanco,
          porId: user.id,
        });
      }

      /*
       * OS BENEFÍCIOS SÃO SUBSTITUÍDOS, como na trilha: o formulário manda a lista COMPLETA do que
       * está marcado. SÓ NO CAMINHO DO CORPO COMPLETO: no gesto antigo (sem corpo) não há lista
       * nenhuma, e apagar seria tirar da vaga o que ninguém pediu para tirar.
       */
      if (corpoCompleto) {
        await tx.delete(vagaBeneficio).where(eq(vagaBeneficio.vagaId, id));
        if (beneficios.length > 0) {
          await tx
            .insert(vagaBeneficio)
            .values(
              beneficios.map((b) => ({ vagaId: id, beneficioId: b.beneficioId, valor: b.valor })),
            );
        }
      }

      /*
       * ┌─ A TRILHA REGISTRA SE O CLIENTE FOI ESCOLHIDO OU ACEITO DA PLANILHA (item 8) ───────────┐
       * │ A planilha viva do time PROPÕE o cliente de 312 das 470 vagas abertas (medido), e a      │
       * │ proposta é inerte: quem grava `cod_cliente` continua sendo esta porta, com autor e data. │
       * │ No dia em que uma linha da planilha estiver errada, a única pergunta que importa é       │
       * │ "esse cliente foi ESCOLHIDO ou foi ACEITO?", porque é ela que diz QUANTAS vagas          │
       * │ herdaram o mesmo erro. Sem o código aqui, a investigação começa do zero.                  │
       * │                                                                                          │
       * │ QUEM RESPONDE É `as/vagas/vagas-revisao-proposta.ts`, E NÃO ESTE ARQUIVO, de propósito:  │
       * │ a proposta tem lista branca de leitores conferida por varredura de fonte, e a            │
       * │ `VagasService` fica FORA dela porque é ela que escreve `cod_cliente`. O que volta para cá │
       * │ é um CÓDIGO de procedência, nunca o cliente proposto: não há como usar o que não chega.   │
       * │                                                                                          │
       * │ DENTRO DA TRANSAÇÃO, sob a linha já travada, e NUNCA LANÇA: o rastro não pode falhar a   │
       * │ liberação, e sem resposta a procedência é `ESCOLHIDO`, que é a verdade conservadora.      │
       * │ §A.6: dois códigos e um id de usuário interno. Nenhum nome de empresa, nenhum candidato.  │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const procedencia = await procedenciaDoClienteNaLiberacao(tx, id, clienteFinal);
      await tx.insert(asVagaStatusEventos).values({
        vagaId: id,
        de: vaga.status,
        para: codigoAbertura,
        // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
        porId: user.id,
        observacao: fraseDaProcedenciaDoCliente(clienteFinal, procedencia),
      });
    });

    return this.devolverVaga(id, "Vaga liberada, mas não foi encontrada na listagem.");
  }

  /**
   * ─ O CORPO DA LIBERAÇÃO TRAZ O FORMULÁRIO, OU SÓ O CLIENTE? ───────────────────────────────────
   *
   * A PERGUNTA EXISTE PORQUE A REGRA DA TRILHA É "O CORPO É COMPLETO": campo ausente é campo
   * LIMPO. Aplicada a um corpo que só traz o cliente (o gesto antigo, que continua valendo), essa
   * regra APAGARIA a vaga inteira na saída da fila, e o dano seria silencioso: a vaga sairia
   * publicada e vazia.
   *
   * O TESTE É POR CAMPO PRESENTE, e não por campo preenchido: mandar `codigo: ""` é dizer "limpe o
   * código", e isso é o formulário falando. `codCliente` NÃO conta, porque ele é o corpo antigo; e
   * `status` também não, porque ele é herdado do `CreateVagaDto`, é IGNORADO por esta rota (o
   * destino é sempre o papel ABERTURA) e sozinho não faz de um corpo um formulário.
   */
  private corpoTrazCamposDaVaga(dto: LiberarVagaRevisaoDto): boolean {
    return Object.entries(dto as Record<string, unknown>).some(
      ([chave, valor]) =>
        chave !== "codCliente" && chave !== "status" && valor !== undefined,
    );
  }

  /**
   * O CLIENTE DO CORPO É CONFERIDO CONTRA O CATÁLOGO ANTES DE QUALQUER ESCRITA.
   *
   * SEM ISTO, um código inexistente chegaria à FK RESTRICT e viraria 500 genérico no meio de uma
   * transação, sem dizer a quem opera o que fazer. A conferência é leitura, então mora FORA da
   * transação, como o catálogo de status: ela responde sobre um cadastro que não muda no intervalo.
   */
  public async exigirClienteExistente(codCliente: string): Promise<void> {
    const [achado] = await this.db
      .select({ cod: clientes.codCliente })
      .from(clientes)
      .where(eq(clientes.codCliente, codCliente))
      .limit(1);
    if (!achado) {
      throw new BadRequestException(
        "Este cliente não está no cadastro. Recarregue a página e escolha um cliente da lista.",
      );
    }
  }

  /**
   * AS VAGAS QUE JÁ SAÍRAM DA FILA PELA LIBERAÇÃO, que é o conjunto da correção do Master.
   *
   * ELAS NÃO ESTÃO MAIS PENDENTES (a fila é o próprio estado), então precisam de leitura própria:
   * sem ela, corrigir uma liberação errada exigiria caçar a vaga no meio da Central de Vagas
   * inteira. O recorte é a TRILHA, e não um flag novo na vaga: quem saiu da fila por aqui deixou o
   * evento `REVISAO -> ABERTURA` gravado, e é esse evento que responde "esta vaga foi liberada".
   */
  async liberadasDaRevisao(): Promise<VagaItemOndaE[]> {
    const regua = await this.statusVaga.regua();
    const codigoRevisao = regua.codigoDoPapel("REVISAO");
    const codigoAbertura = regua.codigoDoPapel("ABERTURA");
    const eventos = await this.db
      .selectDistinct({ vagaId: asVagaStatusEventos.vagaId })
      .from(asVagaStatusEventos)
      .where(
        and(
          eq(asVagaStatusEventos.de, codigoRevisao),
          eq(asVagaStatusEventos.para, codigoAbertura),
        ),
      );
    if (eventos.length === 0) return [];
    const liberadas = new Set(eventos.map((e) => e.vagaId));
    return this.comPropostaDeCliente((await this.list()).filter((v) => liberadas.has(v.id)));
  }

  /**
   * ─ CORRIGIR A LIBERAÇÃO (Master): A REDE DE SEGURANÇA DA LIBERAÇÃO ERRADA ─────────────────────
   *
   * UMA PORTA PARA OS DOIS GESTOS, e eles andam juntos na vida real: quem descobre que liberou com
   * o cliente errado quer TROCAR O CLIENTE, e às vezes quer a vaga DE VOLTA NA FILA para alguém
   * conferir o resto. Duas rotas obrigariam a tela a chamar as duas em sequência no caso mais
   * comum, com a vaga passando por um estado em que ela afirma um cliente que ninguém mais defende.
   *
   * O `devolverParaFila` É EXPLÍCITO, e não deduzido da troca de cliente: corrigir o cliente de uma
   * vaga que já está rodando não deve, sozinho, tirar a vaga da operação e devolvê-la para uma fila
   * de revisão. Quem decide isso é quem corrige, e a decisão fica gravada na trilha.
   *
   * ┌─ `@Roles("MASTER", "SUPER_ADMIN")` NA ROTA, E O SUPER_ADMIN É ESCRITO ──────────────────────┐
   * │ O `RolesGuard` faz `required.includes(papel)` e LANÇA antes de tratar o SUPER_ADMIN, então   │
   * │ `@Roles("MASTER")` sozinho barraria o próprio diretor. É o molde do `reabrir`.                │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ SÓ DESFAZ O QUE ESTA PORTA FEZ ───────────────────────────────────────────────────────────┐
   * │ A vaga precisa estar no papel ABERTURA E ter, na trilha, uma liberação da revisão. Sem essa  │
   * │ conferência, esta rota viraria uma porta para EMPURRAR qualquer vaga aberta para dentro da   │
   * │ fila do espelho, e o que a fila afirma (veio do ATS, falta vincular cliente) deixaria de ser │
   * │ verdade. Vaga já encerrada não entra: desfazer encerramento é `reabrir`, que tem régua.       │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async corrigirLiberacaoDaRevisao(
    id: string,
    dto: CorrigirLiberacaoRevisaoDto,
    user: AuthUser,
  ): Promise<VagaListItem> {
    const regua = await this.statusVaga.regua();
    const codigoRevisao = regua.codigoDoPapel("REVISAO");
    const codigoAbertura = regua.codigoDoPapel("ABERTURA");
    const clienteCorrigido = (dto.codCliente ?? "").trim();
    if (clienteCorrigido !== "") await this.exigirClienteExistente(clienteCorrigido);

    await this.db.transaction(async (tx) => {
      const [vaga] = await tx
        .select({ id: vagas.id, status: vagas.status, codCliente: vagas.codCliente })
        .from(vagas)
        .where(eq(vagas.id, id))
        .for("update");
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");
      if (!regua.ehDoPapel(vaga.status, "ABERTURA")) {
        throw new ConflictException(
          "Só é possível desfazer a liberação de uma vaga aberta. Recarregue a página.",
        );
      }

      const [liberacao] = await tx
        .select({ id: asVagaStatusEventos.id })
        .from(asVagaStatusEventos)
        .where(
          and(
            eq(asVagaStatusEventos.vagaId, id),
            eq(asVagaStatusEventos.de, codigoRevisao),
            eq(asVagaStatusEventos.para, codigoAbertura),
          ),
        )
        .limit(1);
      if (!liberacao) {
        throw new ConflictException(
          "Esta vaga não foi liberada da fila de revisão, então não há liberação a desfazer.",
        );
      }

      /*
       * O CLIENTE SÓ É REESCRITO QUANDO O CORPO O TRAZ, e o status só volta quando pedirem. Uma
       * correção que não mudasse nada nos dois campos seria uma linha de trilha sobre um movimento
       * que não houve, então ela é recusada antes de gravar.
       */
      const trocaCliente = clienteCorrigido !== "" && clienteCorrigido !== (vaga.codCliente ?? "");
      if (!trocaCliente && !dto.devolverParaFila) {
        throw new ConflictException(
          "Nada a corrigir: escolha outro cliente ou devolva a vaga para a fila de revisão.",
        );
      }

      await tx
        .update(vagas)
        .set({
          atualizadoEm: new Date(),
          /*
           * O CARIMBO MANUAL SÓ É LIMPO NO RAMO QUE GRAVA STATUS (Frente B, ponto 2), e a condição
           * é a mesma do `status` por construção: a correção que NÃO devolve a vaga para a fila não
           * toca o status, então ela não tem por que desfazer um movimento manual que continua
           * valendo. Limpar sempre religaria a derivação numa vaga que o time tinha parado à mão,
           * por causa de uma correção de cliente que não tem nada a ver com isso.
           */
          ...(dto.devolverParaFila
            ? { status: codigoRevisao, statusManualEm: null, statusManualPorId: null }
            : {}),
          ...(trocaCliente ? { codCliente: clienteCorrigido } : {}),
        })
        .where(eq(vagas.id, id));

      /*
       * ┌─ A TROCA DE CLIENTE DEIXA RASTRO SEMPRE, E NÃO SÓ QUANDO A VAGA VOLTA PARA A FILA ────────┐
       * │ ACHADO V1 DO `seguranca`, e ele era bloqueante: o `update` acima grava o cliente novo em  │
       * │ toda correção, e a escrita da trilha estava INTEIRA dentro do `if (devolverParaFila)`.    │
       * │ Quem corrigia SÓ o cliente não deixava autor, data nem valor anterior, e a trilha não     │
       * │ ficava silenciosa: ficava ERRADA, porque a liberação já gravou "Liberada da revisão com o │
       * │ cliente A" e essa continuava sendo a única afirmação consultável depois de a vaga passar  │
       * │ a ser do cliente B. Trocar o cliente redefine sob qual controlador ficam as candidaturas  │
       * │ penduradas na vaga (§A.6), então o par (quem, quando, de quem para quem) é obrigatório.    │
       * │                                                                                          │
       * │ `atualizado_em` NÃO ERA RESPOSTA, e era o que estava escrito aqui: ele diz quando a linha │
       * │ foi tocada, nunca QUEM tocou nem qual era o valor antes, e a próxima escrita o sobrescreve.│
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (trocaCliente) {
        await tx.insert(vagaClienteCorrecoes).values({
          vagaId: id,
          deCodCliente: vaga.codCliente,
          paraCodCliente: clienteCorrigido,
          // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
          porId: user.id,
        });
      }

      /*
       * A TRILHA DE STATUS SÓ GANHA EVENTO QUANDO O STATUS ANDA. A correção que só troca o cliente
       * não é movimento de status, e gravá-la como "ABERTA para ABERTA" encheria a linha do tempo de
       * passos que não aconteceram. Não é só desenho: o apagar do catálogo
       * (`vaga-status.service.remover`) conta eventos com `de = codigo or para = codigo` para
       * escolher entre APAGAR e INATIVAR, e uma vaga entra em status sem gerar evento (a trilha de
       * abertura grava o status direto), então a correção de CADASTRO viraria "há vagas que já
       * passaram por ele" sem passagem nenhuma. Por isso a troca de cliente tem tabela própria
       * (`vaga_cliente_correcoes`, 0118), no molde de `vaga_meta_reducoes`, e não uma linha aqui.
       */
      if (dto.devolverParaFila) {
        await tx.insert(asVagaStatusEventos).values({
          vagaId: id,
          de: vaga.status,
          para: codigoRevisao,
          porId: user.id,
          observacao: this.narrativaDaCorrecao(
            vaga.codCliente,
            trocaCliente ? clienteCorrigido : null,
          ),
        });
      }
    });

    return this.devolverVaga(id, "Correção aplicada, mas a vaga não foi encontrada na listagem.");
  }

  /**
   * ─ OS CONSULTORES QUE PODEM RECEBER UMA VAGA (item 5 da OST de 30/09/2026) ────────────────────
   *
   * ELA EXISTE PORQUE `contextoAs` NÃO RESPONDE ESTA PERGUNTA, e a diferença é do desenho dos dois
   * lados: aquela devolve a CONTRAPARTE de quem chama (o RECRUITER vê consultores, o CONSULTOR vê
   * recruiters), porque ali a pergunta é "quem é o meu par nesta vaga". Aqui a pergunta é "quem pode
   * ficar responsável por esta vaga", e a resposta é a mesma lista para qualquer um que pergunte. Um
   * CONSULTOR chamando `contextoAs` receberia RECRUITERS, e o seletor da transferência ofereceria
   * justamente quem não pode receber.
   *
   * A MESMA RÉGUA DO DESTINO, EM UM LUGAR SÓ (`consultorDeDestino`): ATIVO e com papel de A&S de
   * CONSULTOR. Se a lista e a trava divergissem, a tela ofereceria alguém que a rota recusa, o que é
   * pior do que não oferecer.
   *
   * §A.6: id e nome de usuário INTERNO, e mais nada. É a mesma projeção que `contextoAs` já devolve.
   */
  async consultoresParaTransferencia(): Promise<{ id: string; nome: string }[]> {
    return this.db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(and(eq(usuarios.ativo, true), eq(usuarios.papelAs, "CONSULTOR")))
      .orderBy(asc(usuarios.nome));
  }

  /**
   * ─ TRANSFERIR A VAGA DE UM CONSULTOR PARA OUTRO (item 5 da OST de 30/09/2026) ─────────────────
   *
   * ESCREVE UMA COLUNA, `consultor_id`, E MAIS NENHUMA. Não toca status, meta, contador, data nem o
   * outro lado da vaga (`recruiter_id`): quem sai é o responsável, e o processo continua exatamente
   * onde estava. É a contrapartida da `editarPosicoes`, que também é um caminho estreito de propósito.
   *
   * ┌─ NÍVEL CONSULTOR, SEM `@Roles`, E "SEM `@Roles`" NÃO É "SEM GUARDA" (decisão do diretor) ──┐
   * │ A rota nasce sem `@Roles`, no mesmo padrão já declarado na `VagasController` para revisar,   │
   * │ baixar meta, stand by, fechar e cancelar. Quem restringe é o MENU: a controller inteira é    │
   * │ reivindicada por `VagasController.*` no menu `as-vagas`, e o `MenuGuard` é quem barra quem    │
   * │ não tem o menu, inclusive por `curl`. Um `@Roles("MASTER")` aqui seria porta trancada para   │
   * │ quem tem o menu, que é o defeito que a casa já pagou.                                       │
   * │                                                                                            │
   * │ O MÉTODO NOVO ENTRA NA REIVINDICAÇÃO SEM NENHUM PASSO A MAIS porque a reivindicação é        │
   * │ CURINGA (`VagasController.*`), e não uma lista de métodos. Isso importa dizer: o `MenuGuard` │
   * │ é FAIL-OPEN para operação que ninguém reivindicou, então um método novo numa controller      │
   * │ reivindicada por método nomeado nasceria ABERTO a qualquer autenticado.                     │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ VAGA EM ESTADO TERMINAL PODE SER TRANSFERIDA, e a decisão é minha, reportada ao coordenador ┐
   * │ A OST não decidiu, e as duas saídas eram defensáveis. ELA PODE, por três razões:             │
   * │  1. TRANSFERIR NÃO É MOVIMENTO DE PROCESSO, é ATRIBUIÇÃO. Nada do processo muda: nenhuma     │
   * │     candidatura se move, nenhum contador se altera, nenhuma data se recarimba. É a resposta  │
   * │     à pergunta "de quem é esta vaga", e essa pergunta continua sendo feita depois do         │
   * │     fechamento (carteira, indicador por consultor, quem responde pelo histórico).            │
   * │  2. RECUSAR CRIARIA CARTEIRA ÓRFÃ PERMANENTE. O caso que origina a operação é a pessoa que   │
   * │     saiu da empresa, e as vagas dela que mais duram são justamente as ENCERRADAS. Travar     │
   * │     aqui deixaria o histórico inteiro preso a um usuário que ninguém mais usa, sem caminho   │
   * │     de conserto na tela.                                                                    │
   * │  3. O ARGUMENTO QUE TRAVA A `editarPosicoes` NÃO SE APLICA. Lá a recusa protege um número    │
   * │     que já foi CONFRONTADO no fechamento (mexer nele reescreveria a história do processo:    │
   * │     "3 de 3" viraria "3 de 1"). Aqui não há número congelado nenhum: `consultor_id` não      │
   * │     entra em contagem, em KPI nem em derivação de status (medido, §A.27: o único leitor no    │
   * │     backend é o `leftJoin` da listagem, que projeta o id e o nome para a coluna e o filtro). │
   * │                                                                                            │
   * │ O QUE ISSO NÃO AUTORIZA: mudar qualquer outra coisa na vaga encerrada. Esta rota escreve uma │
   * │ coluna, e a vizinha (`editarPosicoes`) continua recusando as encerradas, como sempre.        │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A TRAVA DO DESTINO É DE ESTADO, NUNCA DE PAPEL DE RBAC ───────────────────────────────────┐
   * │ Três recusas, e as três são sobre a LINHA do usuário de destino, lidas do banco na hora:     │
   * │ existe, está ATIVO, e tem papel de A&S de CONSULTOR. A última é o "faz sentido como          │
   * │ consultor" da OST, e ela é a mesma régua que a abertura já aplica (`ladosDeQuemAbre` recusa  │
   * │ quem não tem papel de A&S): sem ela, a vaga poderia acabar sob um usuário da Admissão, que   │
   * │ nem enxerga o módulo, e ela sumiria da carteira de todo mundo sem sumir da tela de ninguém.  │
   * │                                                                                            │
   * │ A TRANSFERÊNCIA PARA QUEM JÁ É O CONSULTOR É RECUSADA, e não é preciosismo: o CHECK do banco │
   * │ (`ck_vaga_consultor_transferencias_houve_troca`) recusaria a linha do rastro de qualquer      │
   * │ jeito, e o resultado sem esta guarda seria um erro cru de restrição na tela em vez da frase. │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A LINHA DA VAGA É TRAVADA (`for update`) e o rastro é gravado na MESMA transação. Sem a trava,
   * duas transferências simultâneas gravariam dois rastros com o MESMO `de_consultor_id`, e a linha
   * do tempo diria que a vaga saiu duas vezes da mesma pessoa, o que nunca aconteceu.
   */
  async transferirConsultor(
    id: string,
    dto: TransferirConsultorDaVagaDto,
    autorId: string,
  ): Promise<VagaListItem> {
    /*
     * O DESTINO É CONFERIDO ANTES DA TRANSAÇÃO, e isso é deliberado: ele é uma linha de `usuarios`,
     * que esta operação não disputa com ninguém (ninguém fica inativo entre duas instruções por
     * causa desta rota). O que precisa de trava é a linha da VAGA, e ela é travada lá dentro.
     */
    const destino = await this.consultorDeDestino(dto.paraConsultorId);

    await this.db.transaction(async (tx) => {
      const [vaga] = await tx
        .select({ id: vagas.id, consultorId: vagas.consultorId })
        .from(vagas)
        .where(eq(vagas.id, id))
        .for("update");
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");

      if (vaga.consultorId === destino.id) {
        throw new ConflictException(
          "Esta vaga já é deste consultor. Escolha outra pessoa para transferir.",
        );
      }

      await tx
        .update(vagas)
        .set({ consultorId: destino.id, atualizadoEm: new Date() })
        .where(eq(vagas.id, id));

      /*
       * O RASTRO É OBRIGATÓRIO E VAI NA MESMA TRANSAÇÃO. `vagas.consultor_id` é UMA coluna, e a
       * escrita acima apaga o valor anterior: sem esta linha, "quem tirou esta vaga de mim, e
       * quando" não teria resposta em lugar nenhum. `atualizado_em` não responde (diz quando a
       * linha foi tocada, nunca quem a tocou nem qual era o valor antes).
       *
       * TABELA PRÓPRIA, e não `as_vaga_status_eventos`: aquela é a linha do tempo do MOVIMENTO DE
       * STATUS, e transferir não move status (ver o bloco da tabela, em `db/schema/tables.ts`).
       */
      await tx.insert(vagaConsultorTransferencias).values({
        vagaId: id,
        deConsultorId: vaga.consultorId,
        paraConsultorId: destino.id,
        // QUEM vem da SESSÃO, nunca do corpo: autoria é trilha, não campo de formulário.
        porId: autorId,
      });
    });

    return this.devolverVaga(id, "Vaga transferida, mas não encontrada na listagem.");
  }

  /**
   * A RÉGUA DO CONSULTOR DE DESTINO, EM UM LUGAR SÓ: a mesma que a listagem do seletor usa.
   *
   * O PAPEL É LIDO DO BANCO na hora, e não de um token nem de uma lista carregada na tela, pelo
   * mesmo motivo do `ladosDeQuemAbre`: quem deixou de ser consultor hoje de manhã não recebe vaga
   * na transferência da tarde.
   *
   * §A.6: a frase de recusa fala de PAPEL e de ESTADO, e o nome que ela devolve é de usuário interno.
   * Nenhum dado de candidato passa por aqui.
   */
  public async consultorDeDestino(paraId: string): Promise<{ id: string; nome: string }> {
    const pessoa = await this.db.query.usuarios.findFirst({ where: eq(usuarios.id, paraId) });
    if (!pessoa) throw new NotFoundException("Consultor de destino não encontrado.");
    if (!pessoa.ativo) {
      throw new ConflictException(
        "Este usuário está inativo e não recebe vaga. Escolha um consultor ativo.",
      );
    }
    if (pessoa.papelAs !== "CONSULTOR") {
      throw new ConflictException(
        "Este usuário não tem papel de Consultor em A&S, então não pode ficar responsável pela vaga. Defina o papel no cadastro de usuários ou escolha outra pessoa.",
      );
    }
    return { id: pessoa.id, nome: pessoa.nome };
  }

  /**
   * A FRASE QUE FICA NA TRILHA DE STATUS DA CORREÇÃO, e ela guarda a TROCA, não só o estado final:
   * "o cliente era X e passou a ser Y" é a informação que explica a reversão seis meses depois.
   *
   * ELA SÓ SERVE AO RAMO DA DEVOLUÇÃO, e a primeira linha dela afirma isso em palavras. É por isso
   * que ela NÃO é a resposta do achado V1: usá-la na correção que não devolve a vaga faria a frase
   * mentir ("a vaga voltou para a fila") sobre uma vaga que não voltou. O rastro da troca de cliente
   * é o par de colunas de `vaga_cliente_correcoes` (0118), que não depende de frase nenhuma e vale
   * para os dois casos.
   *
   * §A.6: só código de cliente. Nenhum dado de candidato, nenhum texto livre de fora.
   */
  private narrativaDaCorrecao(clienteAntes: string | null, clienteDepois: string | null): string {
    const partes = ["Liberação corrigida: a vaga voltou para a fila de revisão."];
    if (clienteDepois !== null) {
      partes.push(`Cliente: de ${clienteAntes ?? "não informado"} para ${clienteDepois}.`);
    }
    return partes.join(" ");
  }

  /**
   * A FRASE QUE FICA NA TRILHA DA VAGA quando alguém cancela, e ela é a ÚNICA cópia que sobrevive.
   *
   * POR QUE ELA PRECISA CARREGAR O MOTIVO E A ETAPA: a REABERTURA limpa os carimbos de cancelamento
   * da linha da vaga, e limpa com razão, porque aquelas colunas descrevem o estado ATUAL e vaga
   * reaberta não está cancelada. Se o motivo e a etapa vivessem só lá, a reabertura apagaria para
   * sempre as respostas de "por que esta vaga foi cancelada" e "até onde ela tinha chegado".
   *
   * O NÚMERO MUDOU DE SENTIDO JUNTO COM A REGRA (Frente B, ponto 3), e isto é o que mais importa
   * registrar: antes ele contava quantos processos o Master ATROPELOU, porque forçar o cancelamento
   * os DESCARTAVA. Agora ele conta quantos SEGUEM VIVOS em Stand By, que é a informação que alguém
   * vai procurar seis meses depois ("sobrou gente desta vaga para realocar?"). A frase foi reescrita
   * inteira em vez de reaproveitada: o texto antigo ("foram encerrados juntos") afirmaria sobre os
   * cancelamentos novos exatamente o contrário do que aconteceu.
   *
   * §A.6: motivo do catálogo, observação de quem cancelou, um código de etapa e uma CONTAGEM.
   * Nenhum nome, nenhum id de candidato, nenhum CPF. O que identifica pessoa fica na linha do tempo
   * dela, não na da vaga.
   */
  private narrativaDoCancelamento(
    dto: CancelarVagaDto,
    movidos: number,
    etapaDaVaga: string | null,
  ): string {
    const partes = [`Cancelada. Motivo: ${dto.motivo}.`];
    if (dto.observacao) partes.push(`Observação: ${dto.observacao}.`);
    if (etapaDaVaga) partes.push(`Etapa da vaga no cancelamento: ${etapaDaVaga}.`);
    if (movidos > 0) {
      partes.push(
        movidos === 1
          ? "1 candidatura seguia em processo e foi movida para Stand By, viva."
          : `${movidos} candidaturas seguiam em processo e foram movidas para Stand By, vivas.`,
      );
    }
    return partes.join(" ");
  }

  /**
   * ─ QUEM ESTAVA NA VAGA VAI PARA O STAND BY, VIVO (Frente B, ponto 3) ──────────────────────────
   *
   * ┌─ ISTO SUBSTITUI A TRAVA 3 E O FORÇADO, E A DIFERENÇA É DE NATUREZA ────────────────────────┐
   * │ O QUE HAVIA: `travaCandidatosQueSeguram` BARRAVA o cancelamento quando alguém estava        │
   * │ `ATIVO` ou `ALOCADO`; só um MASTER passava com `forcar: true`, e forçar DESCARTAVA todos     │
   * │ eles (`gravarSaidaDaCandidatura` com situação `DESCARTADO`).                                 │
   * │                                                                                             │
   * │ O QUE HÁ: o cancelamento não é barrado por ninguém, e ninguém é descartado. Quem está VIVO  │
   * │ é MOVIDO DE ETAPA e continua VIVO, na vaga cancelada, encontrável e transferível.            │
   * │                                                                                             │
   * │ ETAPA, E NUNCA SITUAÇÃO, e é a confusão que apagaria gente: "virar stand by" NÃO é um        │
   * │ desfecho novo, é mudar de LUGAR no funil. A situação de cada um fica exatamente como estava │
   * │ (`ATIVO` continua `ATIVO`, `ALOCADO` continua `ALOCADO`), e por isso a OCUPAÇÃO derivada da │
   * │ vaga não se mexe: os dois carimbos de contagem seguem contando quem a vaga entregou de fato.│
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * QUEM SE MOVE É QUEM ESTÁ VIVO (`candidaturaViva`, a régua única do vocabulário compartilhado),
   * e não "quem segurava": quem foi descartado ou desistiu já tinha saído do processo por decisão
   * de alguém, e arrastá-lo para o Stand By reescreveria a etapa em que ele saiu, que é o dado que
   * a frase "descartado na Triagem" precisa para existir.
   *
   * QUEM JÁ ESTÁ NO DESTINO NÃO SE MOVE: gravar o movimento de uma etapa para ela mesma encheria a
   * trilha de linhas que não contam nada, exatamente como o `moverStatus` recusa fazer.
   *
   * O HISTÓRICO É PRESERVADO em `as_candidatura_etapas`, com `etapaDe` e `etapaPara`: a linha do
   * tempo da pessoa continua dizendo de onde ela veio, e é isso que permite realocá-la com contexto
   * meses depois.
   *
   * §A.6: o motivo gravado é o do CATÁLOGO de cancelamento, já conferido pelo `cancelar`. Nenhum
   * nome, nenhum CPF, nenhum log.
   *
   * Devolve QUANTOS foram movidos, para a narrativa da trilha dizer o tamanho do que aconteceu.
   */
  private async moverVivosParaODestino(
    tx: DbTransaction,
    linhas: LinhaDeCandidatura[],
    destino: { codigo: string; rotulo: string } | null,
    porId: string,
  ): Promise<number> {
    // SEM DESTINO CONFIGURADO, NINGUÉM SE MOVE E NINGUÉM SE PERDE. A escolha e o porquê estão em
    // `EtapasFunilService.etapaDoCancelamento`: bloquear o cancelamento por causa de catálogo
    // desfaria a decisão do diretor, e a narrativa da trilha diz que o agrupamento não aconteceu.
    if (!destino) return 0;

    const vivos = linhas.filter((l) => candidaturaViva(l.situacao) && l.etapa !== destino.codigo);
    for (const linha of vivos) {
      await tx
        .update(asCandidaturas)
        // A SITUAÇÃO NÃO ENTRA NESTE `set`, e é a garantia central da operação: quem estava
        // ALOCADO continua ALOCADO, e a ocupação da vaga não se mexe.
        .set({ etapa: destino.codigo, atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, linha.candidaturaId));

      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId: linha.candidaturaId,
        etapaDe: linha.etapa,
        etapaPara: destino.codigo,
        // MOVIMENTO, E NÃO DESFECHO: `situacao` nula é o que diz, na linha do tempo, que a pessoa
        // andou no funil e NÃO saiu do processo. Preenchê-la aqui carimbaria um desfecho que não
        // houve, e é justamente o que o cancelamento deixou de fazer.
        situacao: null,
        motivo: `Vaga cancelada: a candidatura foi movida para ${destino.rotulo} e segue ativa.`,
        porId,
      });
    }
    return vivos.length;
  }

  /**
   * ─ A ETAPA DA VAGA NO INSTANTE DO CANCELAMENTO (Frente B, ponto 4) ────────────────────────────
   *
   * "A ETAPA DA VAGA" NÃO EXISTE COMO DADO: a etapa é da CANDIDATURA, e uma vaga tem várias ao
   * mesmo tempo, em etapas diferentes. A escolha é a MAIS AVANÇADA (maior `ordem` no catálogo)
   * entre as candidaturas VIVAS, e o porquê está no schema da coluna: a pergunta do relatório é
   * "até onde este processo chegou antes de morrer", e quem responde isso é quem foi mais longe.
   *
   * A ORDEM VEM DO CATÁLOGO (`posicaoNoFunil`, do domínio), e ela inclui as INATIVAS de propósito,
   * pela mesma razão das travas: quem ficou parado numa etapa que saiu de circulação precisa de uma
   * posição na fila, não de um buraco.
   *
   * NULO QUANDO NÃO HÁ NINGUÉM VIVO, e nulo aqui quer dizer uma coisa só: a vaga foi cancelada
   * vazia. Devolver a etapa inicial nesse caso afirmaria um fato que não aconteceu.
   */
  private etapaMaisAvancadaViva(
    linhas: LinhaDeCandidatura[],
    ordemDoFunil: ReadonlyMap<string, number>,
  ): string | null {
    const vivos = linhas.filter((l) => candidaturaViva(l.situacao));
    if (vivos.length === 0) return null;
    return vivos.reduce((maior, l) =>
      posicaoNoFunil(l.etapa, ordemDoFunil) > posicaoNoFunil(maior.etapa, ordemDoFunil) ? l : maior,
    ).etapa;
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
   *
   * ┌─ O CÓDIGO NÃO É A CHAVE DA VAGA-PANDAPÉ, O `id_vacancy_pandape` É (correção do diretor, 06/10) ┐
   * │ `vagas.codigo` recebe o `reference` do Pandapé, que é atributo de ORIGEM e repetível: medido, │
   * │ 7 references espalhados por 42 vagas distintas, cada uma com `id_vacancy_pandape` próprio. A   │
   * │ decisão (a régua pura `codigoColideComVagaManual`) é: a colisão só existe entre duas vagas     │
   * │ MANUAIS (ambas sem `id_vacancy_pandape`); duas vagas-Pandapé distintas, ou manual contra       │
   * │ Pandapé, não colidem, porque a identidade da vaga-Pandapé é o id, não o reference.             │
   * │                                                                                                │
   * │ A IDENTIDADE DA PRÓPRIA VAGA vem da LINHA GRAVADA quando há `ignorarVagaId` (edição/liberação  │
   * │ PRESERVAM o `id_vacancy_pandape`, não o reescrevem), e do CORPO no create, que insere o campo. │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async travaDuplicidadeDeCodigo(
    codigo: string | null,
    ignorarVagaId: string | null,
    idVacancyPandapeDoCorpo: string | null = null,
  ): Promise<void> {
    // SEM CÓDIGO NÃO HÁ DUPLICIDADE. O rascunho pode ainda não ter número, e cobrar unicidade de uma
    // ausência barraria todos os rascunhos sem código a partir do segundo.
    if (!codigo) return;

    // A IDENTIDADE DA VAGA SENDO GRAVADA. Na edição e na liberação o `id_vacancy_pandape` é lido da
    // linha travada (as duas rotas omitem o carimbo no UPDATE, então o valor gravado é o que já está
    // lá); no create, é o que o corpo insere. Sem este dado a régua não sabe se a vaga é manual.
    let idVacancyPandapeAtual = idVacancyPandapeDoCorpo;
    if (ignorarVagaId) {
      const propria = await this.db
        .select({ idVacancyPandape: vagas.idVacancyPandape })
        .from(vagas)
        .where(eq(vagas.id, ignorarVagaId));
      idVacancyPandapeAtual = propria[0]?.idVacancyPandape ?? null;
    }

    const existentes = await this.db
      .select({ codigo: vagas.codigo, idVacancyPandape: vagas.idVacancyPandape })
      .from(vagas)
      .where(
        // A PRÓPRIA VAGA FICA DE FORA quando o rascunho é salvo de novo: sem isto, o segundo
        // "Salvar Rascunho" acusaria o código do próprio rascunho como duplicado dele mesmo.
        ignorarVagaId
          ? and(eq(vagas.codigo, codigo), ne(vagas.id, ignorarVagaId))
          : eq(vagas.codigo, codigo),
      );

    if (
      !codigoColideComVagaManual(
        codigo,
        existentes.map((e) => ({ codigo: e.codigo ?? "", idVacancyPandape: e.idVacancyPandape })),
        idVacancyPandapeAtual,
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
   * ─ O NÚMERO DO PANDAPÉ É ÚNICO, E A COLISÃO VIRA FRASE ANTES DE VIRAR ERRO (0150) ──────────────
   *
   * ┌─ POR QUE ESTA TRAVA É DIFERENTE DA DO CÓDIGO, QUE ESTÁ LOGO ACIMA ──────────────────────────┐
   * │ `vagas.codigo` é REPETÍVEL de propósito (recebe o `reference` do ATS, que repete: 7 valores  │
   * │ em 42 vagas) e por isso a trava dele é uma RÉGUA, que só acusa colisão entre duas vagas       │
   * │ MANUAIS. O `id_vacancy_pandape` é o oposto: é a IDENTIDADE da vaga-Pandapé, e duas vagas com  │
   * │ o mesmo número não podem existir, ponto. A régua aqui é trivial, e é o BANCO que a garante;   │
   * │ esta função existe para a violação chegar como explicação em vez de erro 500.                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NÚMERO AUSENTE NÃO COLIDE: a vaga MANUAL nasce sem número nenhum, e é o estado da maioria das
   * que uma pessoa cadastra. O índice é PARCIAL exatamente por isso, e cobrar unicidade de uma
   * ausência barraria toda vaga manual a partir da segunda.
   */
  private async travaNumeroPandapeUnico(
    idVacancyPandape: string | null,
    ignorarVagaId: string | null,
  ): Promise<void> {
    const numero = (idVacancyPandape ?? "").trim();
    if (numero === "") return;

    const existentes = await this.db
      .select({ id: vagas.id })
      .from(vagas)
      .where(
        // A PRÓPRIA VAGA FICA DE FORA quando a linha já gravada é a que tem aquele número: sem isto,
        // salvar de novo a mesma vaga acusaria o número dela como duplicado dela mesma.
        ignorarVagaId
          ? and(eq(vagas.idVacancyPandape, numero), ne(vagas.id, ignorarVagaId))
          : eq(vagas.idVacancyPandape, numero),
      )
      .limit(1);

    if (existentes.length === 0) return;
    throw new ConflictException(MENSAGEM_NUMERO_PANDAPE_DUPLICADO);
  }

  /**
   * A VIOLAÇÃO DO UNIQUE DO NÚMERO DO PANDAPÉ virando `409` com frase de gente.
   *
   * RECONHECIDA POR CÓDIGO (`23505`) E NOME DE ÍNDICE, nunca por texto da mensagem: a regra mora em
   * `domain/vaga-numero-pandape-unico`, com a prosa do porquê. §A.6: a mensagem do Postgres NÃO é
   * repassada, ela traz o valor que violou o índice.
   *
   * O QUE NÃO É DELA PASSA INTACTO. Traduzir erro que não se reconheceu é o jeito de uma falha de
   * banco virar "conflito" na tela e o diagnóstico começar do zero.
   */
  private traduzirColisaoDoNumeroPandape(err: unknown): unknown {
    if (ehNumeroPandapeDuplicado(err)) {
      return new ConflictException(MENSAGEM_NUMERO_PANDAPE_DUPLICADO);
    }
    return err;
  }

  /**
   * ─ A LINHA DE SERVIÇO ESCOLHIDA, CONFERIDA CONTRA O CATÁLOGO VIVO (Onda C) ────────────────────
   *
   * ┌─ POR QUE A CONSULTA É FEITA AQUI, E NÃO PELO `LinhasServicoService` INJETADO ──────────────┐
   * │ Injetá-lo mudaria a ASSINATURA do construtor deste serviço, e treze specs o instanciam à   │
   * │ mão, um deles com `db` NULO para provar que a recusa de status terminal acontece antes de  │
   * │ qualquer ida ao banco. Uma dependência a mais no construtor tornaria todos eles vermelhos  │
   * │ por uma razão que não tem nada a ver com o que eles medem.                                  │
   * │                                                                                            │
   * │ A RÉGUA NÃO FOI DUPLICADA, e é isso que torna a escolha segura: quem decide é               │
   * │ `linhaDeServicoEscolhida`, a MESMA função pura que o catálogo usa. O que muda é só de onde  │
   * │ vêm as linhas, e uma consulta indexada a uma tabela de cinco linhas, na gravação de uma     │
   * │ vaga, não é custo.                                                                          │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * AUSENTE NÃO TOCA O BANCO: rascunho sem linha escolhida é estado normal, e quem cobra a presença
   * é a régua dos obrigatórios, na publicação.
   */
  public async resolverLinhaServico(id: number | null | undefined): Promise<number | null> {
    if (id === null || id === undefined) return null;
    const linhas = await this.db
      .select({
        id: asLinhasServico.id,
        codigo: asLinhasServico.codigo,
        rotulo: asLinhasServico.rotulo,
        ordem: asLinhasServico.ordem,
        ativo: asLinhasServico.ativo,
      })
      .from(asLinhasServico);
    return linhaDeServicoEscolhida(linhas, id)?.id ?? null;
  }

  /**
   * ─ A SOBREPOSIÇÃO DE SEGMENTO E COMERCIAL, CONFERIDA CONTRA OS DOIS CATÁLOGOS (Onda E) ───────
   *
   * ┌─ A RÉGUA NÃO É DUPLICADA: as funções PURAS `segmentoEscolhido` e `comercialEscolhido` são as │
   * │ MESMAS que os catálogos usam. O que muda é só de onde vêm as listas, e duas consultas        │
   * │ indexadas a tabelas curtas, na gravação de UMA vaga, não são custo. Injetar os dois services │
   * │ mudaria a assinatura do construtor, que TREZE specs instanciam (§A.26), sem nenhum ganho:    │
   * │ é a mesma decisão, com a mesma justificativa, de `resolverLinhaServico` logo acima.          │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ AUSENTE NÃO TOCA O BANCO, MAS INVÁLIDO **LANÇA**, E A DIFERENÇA É A ONDA INTEIRA ──────────┐
   * │ Repare no que NÃO está escrito aqui: nenhum `?? null` depois da conferência. Em `linha de   │
   * │ serviço`, nulo quer dizer "em branco", e coagir um id ruim para nulo só perderia o valor.    │
   * │ AQUI NULO QUER DIZER **HERDAR DO CLIENTE**: coagir transformaria um erro de escolha em       │
   * │ HERANÇA SILENCIOSA, e o consultor que escolheu "Saúde" veria a tela voltar mostrando o       │
   * │ segmento do cliente, concluiria que não salvou, e tentaria de novo para sempre. As           │
   * │ sobrecargas das duas funções puras garantem isso no TIPO: com `id: number`, elas não têm     │
   * │ `null` no retorno, então não existe o que coagir.                                            │
   * │                                                                                              │
   * │ `undefined` NO CORPO É "NÃO MEXER/NÃO ESCOLHEU" e continua virando nulo, que é HERDAR. Esse  │
   * │ é o único caminho legítimo para o nulo, e ele não passa por conferência nenhuma.             │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  public async resolverHerdaveis(dto: CreateVagaDto): Promise<{
    segmentoId: number | null;
    comercialId: number | null;
  }> {
    const segmentoId = await this.resolverSegmento(dto.segmentoId);
    const comercialId = await this.resolverComercial(dto.comercialId);
    return { segmentoId, comercialId };
  }

  /** O segmento sobreposto, ou `null` quando a vaga não sobrepõe (e portanto HERDA do cliente). */
  private async resolverSegmento(id: number | null | undefined): Promise<number | null> {
    if (id === null || id === undefined) return null;
    const segmentos = await this.db
      .select({
        id: asSegmentos.id,
        codigo: asSegmentos.codigo,
        rotulo: asSegmentos.rotulo,
        ordem: asSegmentos.ordem,
        ativo: asSegmentos.ativo,
      })
      .from(asSegmentos);
    return segmentoEscolhido(segmentos, id).id;
  }

  /**
   * O comercial sobreposto, ou `null` quando a vaga não sobrepõe (e portanto HERDA do cliente).
   *
   * §A.6: a lista de NOMES é lida aqui só para conferir a escolha, vive no escopo desta função e
   * não sai em resposta nenhuma. Nada dela vai para log.
   */
  private async resolverComercial(id: number | null | undefined): Promise<number | null> {
    if (id === null || id === undefined) return null;
    const comerciais = await this.db
      .select({
        id: asComerciais.id,
        rotulo: asComerciais.rotulo,
        ordem: asComerciais.ordem,
        ativo: asComerciais.ativo,
      })
      .from(asComerciais);
    return comercialEscolhido(comerciais, id).id;
  }

  /**
   * ─ A CIDADE ESCOLHIDA, CONFERIDA CONTRA A BASE DO IBGE (Onda C) ──────────────────────────────
   *
   * DEVOLVE A CIDADE INTEIRA porque quem chama precisa da UF: é ela que passa a alimentar
   * `vagas.regiao_estado`, que deixou de ser digitada. Mesma razão da função acima para a consulta
   * morar aqui em vez de num serviço injetado.
   *
   * AUSENTE NÃO TOCA O BANCO, pelo mesmo motivo: a vaga sem cidade é rascunho, não erro.
   */
  public async resolverCidade(id: number | null | undefined): Promise<AsCidade | null> {
    if (id === null || id === undefined) return null;
    const [cidade] = await this.db
      .select({ id: asCidades.id, nome: asCidades.nome, uf: asCidades.uf })
      .from(asCidades)
      .where(eq(asCidades.id, id))
      .limit(1);
    if (!cidade) {
      throw new BadRequestException("Esta cidade não existe na base do IBGE. Recarregue a página.");
    }
    return cidade;
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
  public async validaBeneficios(
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

/**
 * O DIA DE HOJE, em `yyyy-mm-dd`, no fuso de São Paulo. É o que uma coluna `date` recebe.
 *
 * FUSO EXPLÍCITO, E NÃO O DO PROCESSO, e aqui isso tem consequência de dado e não de texto: o
 * backend roda em UTC, então uma reabertura feita às 21h30 de 30/09 seria carimbada 01/10. A data da
 * reabertura entra em relatório e é comparada com a previsão de entrega, então um dia de erro vira
 * uma renegociação datada do dia errado.
 *
 * `en-CA` PORQUE ELE FORMATA EM `yyyy-mm-dd`, que é exatamente o que o `date` do Postgres espera;
 * `toISOString()` daria a data em UTC, que é justamente o que esta função existe para evitar.
 */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
