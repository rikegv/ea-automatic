import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AsShortlist, AsShortlistItem } from "@ea/shared-types";
import { SHORTLIST_MINIMO_SUGERIDO, shortlistCurta } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidatos,
  asCandidaturas,
  asShortlistItens,
  asShortlists,
  motivosReenvioShortlist,
  usuarios,
  vagas,
} from "../../db/schema";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import { papelDeVagaEmProcesso } from "../../domain/vaga-status-derivado";
import { motivosDeReenvioAtivos } from "../motivos-reenvio-shortlist/motivos-reenvio-shortlist.service";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import type { EnviarShortlistDto } from "./shortlists.dto";

/**
 * ─ A SHORTLIST DA VAGA: O CONJUNTO, O ENVIO E O REENVIO (Frente E, pontos 10 e 11) ──────────────
 *
 * ┌─ O QUE EXISTIA ANTES, E POR QUE ELE NÃO ERA UMA SHORTLIST ─────────────────────────────────────┐
 * │ `vagas.envio_shortlist` é UM campo `date`, DIGITADO À MÃO no formulário de abertura. Ele diz   │
 * │ "alguma coisa foi enviada em tal dia" e mais nada: não sabe QUEM foi enviado, não sabe QUANTOS │
 * │ eram, não sabe se houve REENVIO nem por quê. Era carimbo sem fato por baixo, e o diretor pediu │
 * │ o CONCEITO, não o aviso solto.                                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ACONTECEU COM O CAMPO ANTIGO, E ESTA É A DECISÃO QUE A OST MANDOU DOCUMENTAR ───────────┐
 * │ ELE FICA, e passa a ser CONSEQUÊNCIA do envio em vez de digitação. Três razões, nesta ordem:   │
 * │   1. ELE É LIDO POR CÓDIGO VALIDADO (§A.26): `VagaListItem.envioShortlist` está no contrato    │
 * │      compartilhado, a ficha da vaga o exibe e a trilha de abertura o preenche. Derrubá-lo       │
 * │      alcançaria tela em produção por uma frente que ninguém pediu para alcançar.                │
 * │   2. AS VAGAS HISTÓRICAS NUNCA TERÃO SHORTLIST. A base de A&S entra por carga, e aquela data   │
 * │      é a única resposta que essas linhas têm. Um campo derivado de uma tabela vazia apagaria    │
 * │      o passado que ele guarda.                                                                  │
 * │   3. DAQUI PARA FRENTE QUEM O ESCREVE É O ENVIO, na MESMA transação, com a data do envio mais  │
 * │      recente. A operação para de digitar; o campo continua respondendo a mesma pergunta.        │
 * │                                                                                                │
 * │ "QUEM MAIS ESCREVE ESTE DADO?" (§A.40), E A RESPOSTA É COMPLETA E PROVADA: `camposDaTrilha`    │
 * │ (usado por `VagasService.create`, `atualizar` e `liberarPendenteRevisao`) e esta rotina. E eles │
 * │ NÃO COLIDEM, por construção e não por sorte: a trilha só grava em vaga de papel RASCUNHO ou    │
 * │ REVISAO (o `atualizar` recusa qualquer outro com 409, e o `create` nasce em rascunho), e o     │
 * │ envio de shortlist SÓ É ACEITO em vaga de papel ABERTURA ou ENTREGA (`papelDeVagaEmProcesso`,  │
 * │ a guarda logo abaixo). Nenhuma vaga está nos dois conjuntos ao mesmo tempo.                     │
 * │                                                                                                │
 * │ O QUE O FRONTEND PRECISA FAZER POR CAUSA DISSO: o campo "Envio da shortlist" da trilha de      │
 * │ abertura deve virar SOMENTE LEITURA depois que a vaga é publicada, porque é a partir dali que  │
 * │ o envio manda. Está no relatório, e não foi construído aqui: tela é da camada de tela.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A SHORTLIST NASCE ENVIADA, E NÃO HÁ RASCUNHO (§A.31) ─────────────────────────────────────────┐
 * │ Compor hoje e mandar amanhã seria um SEGUNDO estado, com uma tela a mais e uma pergunta a mais │
 * │ ("esta lista já foi?"), e ninguém pediu isso. O fato que a OST nomeia é o ENVIO: um gesto, uma │
 * │ transação, um conjunto congelado. Quem errou a composição REENVIA, que é o gesto que a OST     │
 * │ pediu de verdade, com motivo e data próprios.                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: esta classe escreve ids técnicos, um número, uma data e uma frase de processo. Ela LÊ o
 * nome do candidato (a shortlist é, por definição, a lista de nomes que foi ao cliente, e uma tela
 * que a mostrasse por UUID não serviria para nada) e NÃO lê CPF, e-mail, telefone nem pretensão.
 * Não há `Logger` neste arquivo, de propósito: sem logger não há como um `debug` acrescentado com
 * pressa vazar a lista de quem foi apresentado a qual cliente.
 */
@Injectable()
export class ShortlistsService {
  /**
   * `VagaStatusService` É O CATÁLOGO DE STATUS, e ele entra por construtor porque a régua de papéis
   * é a mesma que as portas de vaga já usam. Serviço NOVO, então acrescentar a dependência aqui não
   * alcança assinatura de classe nenhuma que já esteja em produção (§A.26).
   */
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly statusVaga: VagaStatusService,
  ) {}

  /**
   * ─ ENVIAR (OU REENVIAR) A SHORTLIST AO CLIENTE ────────────────────────────────────────────────
   *
   * ┌─ A ORDEM É A REGRA INTEIRA, e é a MESMA das portas de vaga deste módulo ─────────────────────┐
   * │   1. o CATÁLOGO se lê ANTES da transação (ele não tem nada a ver com a linha travada, e      │
   * │      buscá-lo lá dentro só alongaria o tempo com a trava segurada);                           │
   * │   2. a LINHA DA VAGA se trava com `SELECT ... FOR UPDATE`;                                    │
   * │   3. SÓ DEPOIS se descobre o `numero`, se conferem as candidaturas e se grava.                │
   * │                                                                                               │
   * │ O `FOR UPDATE` NÃO É ZELO: o `numero` é `max(numero) + 1`, e dois envios simultâneos sem a    │
   * │ trava leriam o MESMO máximo e tentariam gravar o MESMO número. Com ela, o segundo espera e lê │
   * │ o número já atualizado. O `unique (vaga_id, numero)` do banco é a segunda camada, para o caso │
   * │ de alguém um dia chamar isto por fora da transação.                                            │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O AVISO DOS TRÊS É A ÚLTIMA CONFERÊNCIA ANTES DE GRAVAR, e não a primeira, de propósito: ele
   * depende do `numero` (só a PRIMEIRA lista é medida) e da quantidade JÁ CONFERIDA (uma lista com
   * quatro ids dos quais dois não são da vaga tem DOIS candidatos, não quatro, e avisar sobre
   * quatro seria avisar sobre uma lista que não existe).
   */
  async enviar(
    vagaId: string,
    dto: EnviarShortlistDto,
    porId: string,
  ): Promise<AsShortlist> {
    // PASSO 1: OS CATÁLOGOS, FORA DA TRANSAÇÃO. Nenhum deles toca a linha da vaga, e buscá-los lá
    // dentro só alongaria o tempo com a trava segurada.
    const regua = await this.statusVaga.regua();
    /*
     * O CATÁLOGO DE MOTIVOS DE REENVIO, LIDO SEMPRE, inclusive no primeiro envio, e é de propósito:
     * a recusa do motivo no primeiro envio só é possível sabendo se o id existe, e a alternativa
     * (ler condicionalmente) faria a mesma régua depender de duas ordens de execução diferentes.
     * A consulta é a MESMA do seletor da tela (`motivosDeReenvioAtivos`): duas consultas
     * divergiriam, e a tela passaria a oferecer o que a rota recusa.
     */
    const motivosAtivos = await motivosDeReenvioAtivos(this.db);

    const shortlistId = await this.db.transaction(async (tx) => {
      // PASSO 2: A LINHA DA VAGA, TRAVADA. Daqui para baixo ninguém mais mexe nela.
      const [vaga] = await tx
        .select({ id: vagas.id, status: vagas.status })
        .from(vagas)
        .where(eq(vagas.id, vagaId))
        .for("update");
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");

      /*
       * ┌─ A VAGA PRECISA ESTAR EM PROCESSO, E ESTA GUARDA FAZ DOIS TRABALHOS ────────────────────┐
       * │ O ÓBVIO: não se manda shortlist de vaga em RASCUNHO (ela nem foi publicada), nem de vaga │
       * │ FECHADA ou CANCELADA (o processo acabou), nem de vaga parada num status LIVRE que o      │
       * │ diretor criou.                                                                           │
       * │                                                                                          │
       * │ O QUE IMPORTA MAIS, E QUE SÓ APARECE OLHANDO O OUTRO ESCRITOR: é ELA que prova que o     │
       * │ envio e a TRILHA DE ABERTURA nunca escrevem `vagas.envio_shortlist` sobre a mesma vaga.  │
       * │ A trilha só alcança RASCUNHO e REVISAO; isto só alcança ABERTURA e ENTREGA. Sem a        │
       * │ guarda, os dois escritores passariam a disputar o campo, que é exatamente o que a §A.40  │
       * │ manda enumerar antes de escrever a primeira linha.                                        │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const papel = regua.linha(vaga.status).papel;
      if (!papelDeVagaEmProcesso(papel)) {
        throw new ConflictException(
          `Esta vaga está em "${regua.rotulo(vaga.status)}" e não recebe shortlist. Só vaga em processo (aberta ou entregue) tem lista para mandar ao cliente.`,
        );
      }

      /*
       * PASSO 3a: O NÚMERO DESTE ENVIO. `coalesce(max, 0) + 1`, lido sob a trava, e é ele que
       * distingue a PRIMEIRA lista do REENVIO em toda a régua abaixo.
       */
      const [{ maximo }] = await tx
        .select({ maximo: sql<number>`coalesce(max(${asShortlists.numero}), 0)::int` })
        .from(asShortlists)
        .where(eq(asShortlists.vagaId, vagaId));
      const numero = maximo + 1;

      /*
       * ─ O MOTIVO DO REENVIO, EXIGIDO A PARTIR DO SEGUNDO ─────────────────────────────────────
       *
       * O DTO NÃO PODIA COBRAR ISTO: quem é "o segundo" depende do banco, sob esta trava. E o
       * espelho da regra existe no CHECK `ck_as_shortlists_motivo_reenvio`, que cobre também quem
       * escrever por fora da aplicação. Esta camada existe para a frase sair em português, e não
       * como violação de constraint na tela.
       */
      const motivoReenvioId = numero === 1 ? null : (dto.motivoReenvioId ?? null);
      if (numero > 1 && !motivoReenvioId) {
        throw new BadRequestException(
          "Este é um reenvio de shortlist. Informe o motivo do reenvio.",
        );
      }
      /*
       * E O PRIMEIRO ENVIO RECUSA O MOTIVO EM VEZ DE IGNORÁ-LO. Silenciar o campo faria a tela
       * mostrar uma escolha salva que o banco não guardou, que é a forma mais barata de a operação
       * deixar de confiar no sistema. (O `motivoReenvioId` acima já foi anulado; esta é a recusa.)
       */
      if (numero === 1 && dto.motivoReenvioId) {
        throw new BadRequestException(
          "A primeira shortlist não tem motivo de reenvio: não há envio anterior a justificar. O motivo passa a ser pedido a partir do segundo envio.",
        );
      }
      /*
       * O MOTIVO ESTÁ NA LISTA ATIVA? A FK sozinha NÃO responde isto: ela aceita qualquer linha
       * existente, inclusive a que o diretor tirou de circulação pela tela. Mesma camada que o
       * `registrarSaida` já tem contra `motivos_descarte`, e pela mesma razão: catálogo que vive
       * apenas no combobox é texto livre com aparência de lista.
       */
      if (motivoReenvioId && !motivosAtivos.some((m) => m.id === motivoReenvioId)) {
        throw new BadRequestException(
          "Motivo de reenvio inválido. Escolha um motivo da lista.",
        );
      }

      /*
       * ─ PASSO 3b: SÓ ENTRA NA LISTA QUEM É DESTA VAGA E ESTÁ VIVO ────────────────────────────
       *
       * AS DUAS CONDIÇÕES NA MESMA CONSULTA, e as duas importam por razões diferentes:
       *   . DESTA VAGA, senão a shortlist da vaga A carregaria gente da vaga B, e a lista que o
       *     cliente recebeu deixaria de ser sobre a vaga dele;
       *   . VIVO, porque mandar ao cliente quem já foi descartado ou desistiu é apresentar alguém
       *     que saiu do processo. `SITUACOES_VIVAS` é a régua do domínio, e não uma segunda lista
       *     escrita aqui: duas listas divergem no primeiro valor novo do vocabulário.
       *
       * A RECUSA É POR CONTAGEM, E NÃO NOMINAL, e isso é §A.6: dizer QUEM foi recusado devolveria
       * nome de candidato numa mensagem de erro que a tela copia para toast e para log de cliente.
       * A tela já tem a lista que montou e sabe reconciliar recarregando.
       */
      const elegiveis = await tx
        .select({ id: asCandidaturas.id })
        .from(asCandidaturas)
        .where(
          and(
            eq(asCandidaturas.vagaId, vagaId),
            inArray(asCandidaturas.id, dto.candidaturaIds),
            inArray(asCandidaturas.situacao, SITUACOES_VIVAS),
          ),
        );

      /*
       * O `Set` DESDUPLICA O CORPO ANTES DE CONTAR, e não é zelo: um corpo com o mesmo id repetido
       * infla a contagem que o aviso dos três lê, e faria uma lista de DOIS passar como lista de
       * três sem ninguém ver. O unique do banco derrubaria o insert depois, com erro de driver.
       */
      const ids = [...new Set(elegiveis.map((e) => e.id))];
      const pedidos = new Set(dto.candidaturaIds).size;
      if (ids.length !== pedidos) {
        throw new BadRequestException(
          `${pedidos - ids.length} de ${pedidos} candidatos selecionados não estão mais nesta vaga ou já saíram do processo. Recarregue a página e monte a lista de novo.`,
        );
      }

      /*
       * ─ O AVISO DA SHORTLIST CURTA: AVISA E NÃO IMPEDE, EM **TODO** ENVIO (decisão do diretor) ─
       *
       * A RÉGUA VEM DO VOCABULÁRIO COMPARTILHADO (`shortlistCurta`), e não de um `< 3` escrito
       * aqui: a tela e a rota têm de concordar sobre QUANDO perguntar, e duas cópias divergem na
       * primeira mudança. Esta é a prova: a régua MUDOU, e mudou em um lugar só.
       *
       * ┌─ O QUE MUDOU, E POR QUE O REENVIO PASSOU A SER MEDIDO ──────────────────────────────┐
       * │ A régua antiga exigia `numero === 1`, com o argumento de que reenviar dois nomes     │
       * │ depois de uma lista de seis é o cliente pedindo mais dois. O diretor decidiu o       │
       * │ contrário, e a razão é a operação: DEPOIS DE TRANSFERÊNCIA E DESCARTE, REENVIO CURTO │
       * │ É O CASO NORMAL. Justamente a lista que encolheu porque a vaga perdeu gente é a que  │
       * │ precisa da pergunta, e era exatamente ela que a régua antiga deixava passar calada.  │
       * └──────────────────────────────────────────────────────────────────────────────────────┘
       *
       * 409 COM O NÚMERO DENTRO, e não um "tem certeza?": avisar com DOIS e avisar com UM são
       * conversas diferentes, e é o número que distingue as duas. Mesma mecânica do aviso do banco
       * com posições oficiais abertas, inclusive no formato da resposta (`needsConfirmation`).
       *
       * A FRASE USA O `numero`, E ELA PRECISA ESTAR CERTA NOS DOIS CASOS: dizer "esta primeira
       * shortlist" num reenvio é o sistema afirmando um fato falso na única tela em que o consultor
       * para para pensar. O CORPO do 409 NÃO ganhou um campo `numero`, e a ausência é escopo
       * (§A.31): a tela já recebe a frase pronta, e acrescentar campo de contrato que ninguém pediu
       * é decisão do diretor, não de quem escreve a linha.
       *
       * E A CONFIRMAÇÃO É GRAVADA (`avisoCurtaAceito`), que é a metade que o "não bloqueia" torna
       * obrigatória: guarda atravessável sem registro não é guarda, é texto (§A.3 regra 8).
       */
      const ciente = dto.cienteShortlistCurta === true;
      if (shortlistCurta(numero, ids.length) && !ciente) {
        const sujeito =
          numero === 1 ? "Esta primeira shortlist" : `Este reenvio de shortlist (envio ${numero})`;
        throw new ConflictException({
          needsConfirmation: true,
          quantidade: ids.length,
          minimoSugerido: SHORTLIST_MINIMO_SUGERIDO,
          numero,
          mensagem: `${sujeito} tem ${ids.length} candidato(s), menos do que os ${SHORTLIST_MINIMO_SUGERIDO} sugeridos. Confirme para enviar assim mesmo.`,
        });
      }

      const [criada] = await tx
        .insert(asShortlists)
        .values({
          vagaId,
          numero,
          enviadaEm: dto.enviadaEm,
          enviadaPorId: porId,
          motivoReenvioId,
          // SÓ É `true` QUANDO A GUARDA FOI DE FATO ATRAVESSADA. Gravar o flag do corpo cru marcaria
          // como "aceitou o aviso" quem mandou seis candidatos com o flag ligado por engano da tela,
          // e o log de aceite passaria a contar confirmações que nunca foram feitas.
          avisoCurtaAceito: ciente && shortlistCurta(numero, ids.length),
        })
        .returning({ id: asShortlists.id });

      /*
       * OS ITENS, NA MESMA TRANSAÇÃO E NUM `insert` SÓ. Shortlist sem itens é linha que afirma um
       * envio vazio, e ela existiria por uma janela se os dois fossem transações diferentes.
       */
      await tx
        .insert(asShortlistItens)
        .values(ids.map((candidaturaId) => ({ shortlistId: criada.id, candidaturaId })));

      /*
       * ─ O CAMPO ANTIGO VIRA CONSEQUÊNCIA DO ENVIO (a decisão documentada no cabeçalho) ───────
       *
       * A DATA DO ENVIO MAIS RECENTE, e não a do primeiro: a pergunta que a coluna responde na tela
       * é "quando a shortlist foi ao cliente", e depois de um reenvio a resposta certa é a do
       * reenvio. O histórico completo (inclusive a data do PRIMEIRO envio) não se perde: ele está
       * em `as_shortlists`, que é a fonte, e esta coluna passa a ser o atalho de leitura.
       *
       * NA MESMA TRANSAÇÃO do envio, e não depois: carimbo que pode faltar quando o fato deu certo
       * é a mesma classe de defeito que "rastro que pode faltar não é rastro".
       */
      await tx
        .update(vagas)
        .set({ envioShortlist: dto.enviadaEm, atualizadoEm: new Date() })
        .where(eq(vagas.id, vagaId));

      return criada.id;
    });

    const [enviada] = await this.listar(vagaId, shortlistId);
    if (!enviada) throw new NotFoundException("Shortlist não encontrada.");
    return enviada;
  }

  /**
   * ─ AS SHORTLISTS DA VAGA, com quem estava em cada uma ─────────────────────────────────────────
   *
   * DUAS CONSULTAS, E NÃO UMA POR LISTA: as listas primeiro, os itens de todas elas depois, num
   * `in (...)` só, agrupados em memória. É o mesmo remédio de N+1 que a leitura de benefícios por
   * vaga já usa, e aqui ele importa porque uma vaga com quatro reenvios renderia quatro consultas
   * por abertura de tela.
   *
   * ┌─ O ITEM É CONGELADO, MAS A `etapaAtual` É DE HOJE, E ISSO É ESCOLHA ────────────────────────┐
   * │ QUEM estava na lista não muda nunca (é o item). ONDE cada um está muda todo dia, e é isso   │
   * │ que a tela pergunta: "dos seis que mandei, quantos o cliente entrevistou?". Congelar a etapa │
   * │ no envio responderia "todos estavam na Triagem", que é verdade e não serve para nada.        │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: sai o NOME do candidato, porque a shortlist É a lista de nomes que foi ao cliente. NÃO
   * sai CPF, e-mail, telefone nem pretensão salarial: quem precisa da ficha abre a ficha.
   */
  async listar(vagaId: string, apenasId?: string): Promise<AsShortlist[]> {
    const filtros = [eq(asShortlists.vagaId, vagaId)];
    if (apenasId) filtros.push(eq(asShortlists.id, apenasId));

    /*
     * O JOIN DO CATÁLOGO É `leftJoin`, E NÃO `innerJoin`, mesmo com a FK `restrict` de pé: o
     * `motivo_reenvio_id` é NULO em todo PRIMEIRO envio (o CHECK exige que seja), e um `innerJoin`
     * sumiria com a primeira shortlist de toda vaga. Mesmo desenho do join do autor.
     *
     * O NOME SAI RESOLVIDO AQUI, e não por uma segunda chamada da tela: sem ele, a tela teria de
     * casar o id contra a lista do catálogo, e a lista de LEITURA só traz os ATIVOS, então um
     * reenvio antigo com motivo inativado apareceria sem motivo nenhum.
     */
    const linhas = await this.db
      .select({ s: asShortlists, autor: usuarios.nome, motivoNome: motivosReenvioShortlist.nome })
      .from(asShortlists)
      .leftJoin(usuarios, eq(usuarios.id, asShortlists.enviadaPorId))
      .leftJoin(
        motivosReenvioShortlist,
        eq(motivosReenvioShortlist.id, asShortlists.motivoReenvioId),
      )
      .where(and(...filtros))
      .orderBy(asc(asShortlists.numero));

    if (linhas.length === 0) return [];

    const itens = await this.db
      .select({
        shortlistId: asShortlistItens.shortlistId,
        candidaturaId: asShortlistItens.candidaturaId,
        candidatoId: asCandidaturas.candidatoId,
        candidatoNome: asCandidatos.nome,
        etapaAtual: asCandidaturas.etapa,
        situacaoAtual: asCandidaturas.situacao,
      })
      .from(asShortlistItens)
      .innerJoin(asCandidaturas, eq(asCandidaturas.id, asShortlistItens.candidaturaId))
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(
        inArray(
          asShortlistItens.shortlistId,
          linhas.map((l) => l.s.id),
        ),
      )
      .orderBy(asc(asCandidatos.nome));

    const porShortlist = new Map<string, AsShortlistItem[]>();
    for (const i of itens) {
      const lista = porShortlist.get(i.shortlistId) ?? [];
      lista.push({
        candidaturaId: i.candidaturaId,
        candidatoId: i.candidatoId,
        candidatoNome: i.candidatoNome,
        etapaAtual: i.etapaAtual,
        situacaoAtual: i.situacaoAtual,
      });
      porShortlist.set(i.shortlistId, lista);
    }

    return linhas.map((l) => ({
      id: l.s.id,
      vagaId: l.s.vagaId,
      numero: l.s.numero,
      enviadaEm: l.s.enviadaEm,
      enviadaPorNome: l.autor,
      motivoReenvioId: l.s.motivoReenvioId,
      motivoReenvioNome: l.motivoNome,
      avisoCurtaAceito: l.s.avisoCurtaAceito,
      itens: porShortlist.get(l.s.id) ?? [],
    }));
  }
}
