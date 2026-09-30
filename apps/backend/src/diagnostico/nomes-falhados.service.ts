import { Injectable, Logger } from "@nestjs/common";
import { PandapeApiService } from "../pandape/pandape-api.service";
import { PandapeNomeCacheService } from "../pandape/pandape-nome-cache.service";
import { nomeDoPrecollaborator } from "./nome-do-precolaborador";

/**
 * ─ O NOME DE QUEM NÃO VIROU ADMISSÃO, PARA A FILA PODER SER PESQUISADA (OST 30/09/2026) ─────────
 *
 * O PROBLEMA: o drawer da "Fila (BullMQ)" lista os jobs falhados, quase todos candidatos do Pandapé
 * que não viraram admissão por CPF ausente, e a linha mostra "Candidato do Pandapé <id>". O nome só
 * aparecia num clique POR LINHA (`/filas/:fila/:jobId/alvo`), então achar alguém era olhar um por um.
 * O diretor pediu busca por NOME; buscar exige que a lista TENHA o nome antes de a pessoa digitar.
 *
 * O QUE ESTE SERVIÇO FAZ: resolve, de uma vez, o nome dos jobs falhados que a tela está mostrando.
 * Lê o CACHE EM MEMÓRIA primeiro (`PandapeNomeCacheService`, o mesmo que o worker preenche) e vai à
 * API do Pandapé SÓ para o que não estiver lá, gravando no mesmo cache o que resolver. É isso que faz
 * a segunda abertura do modal, dentro do TTL de 10 minutos, custar ZERO de cota.
 *
 * ┌─ §A.6, E AQUI NÃO HÁ MARGEM ──────────────────────────────────────────────────────────────────┐
 * │ Sai daqui NOME e JOBID, nada mais. NUNCA CPF: a consulta de Match, que é a fonte do número no    │
 * │ Pandapé, NÃO é chamada neste caminho, e o leitor de estado de CPF não é importado aqui. Nunca o   │
 * │ pré-colaborador inteiro, nunca a vaga, nunca a etapa, nunca a URL de documento.                   │
 * │ ZERO log com nome: o logger abaixo recebe apenas CONTAGEM, no mesmo espírito do ponto 4 da       │
 * │ régua do cache. ZERO banco: o nome não é persistido em lugar nenhum, por construção.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.5, O FREIO DE COTA, QUE É REQUISITO DE SEGURANÇA E NÃO DE PERFORMANCE ─────────────────────┐
 * │ O teto de 1.000 req/5min do Pandapé é COMPARTILHADO com o webhook que alimenta a FOLHA. Os dois │
 * │ limiters que existem hoje são de FILA, contados em JOBS (`pandape-sync` 500/5min +               │
 * │ `pandape-varredura` 250/5min), e este caminho é HTTP: nasce FORA dos dois. Sem freio próprio, uma │
 * │ abertura de modal com cache frio dispara uma requisição por linha, e a lista não é limitada pelo  │
 * │ bom senso: o `removeOnFail: 5000` retém até 5.000 falhados, então "teto grande" sem número        │
 * │ absoluto seria até 5.000 requisições por abertura.                                               │
 * │                                                                                                 │
 * │ O freio tem DUAS partes, porque elas resolvem coisas diferentes:                                │
 * │  · ORÇAMENTO de 150 REQUISIÇÕES por janela de 5 minutos, global ao processo, que RECUSA o         │
 * │    excedente em vez de enfileirar. 150 cobre os 132 falhados medidos na produção em 30/09/2026    │
 * │    em UMA abertura, então a primeira já vem completa.                                            │
 * │  · CONCORRÊNCIA de 4, que é o teto de RAJADA. Orçamento sozinho não impede 132 requisições        │
 * │    simultâneas no mesmo instante, e é a rajada, não o total, que atrasa o webhook da folha (e     │
 * │    ainda viraria 429 sem retentativa, porque este caminho não tem backoff).                      │
 * │                                                                                                 │
 * │ POR QUE 150 FECHA, com número e não com opinião: a varredura não sai em rajada (rolante, um job   │
 * │ por página, ~26 min por ciclo), então consome ~127 req/5min medidos, com teto estrutural de ~265; │
 * │ o `pandape-sync` mede 33 req/5min. Pior caso com tudo ligado: 265 + 33 + 150 = 448/5min, 45% do   │
 * │ teto, sobrando 55% para o webhook do G.Infor. Com a varredura desligada, como está hoje, é        │
 * │ trivialmente seguro. A reserva é PRÓPRIA: não compra folga do limiter do worker, que conta JOBS.  │
 * │                                                                                                 │
 * │ Estourado o orçamento, o serviço PARA de consultar e devolve o que já tem, mais o `restantes`.    │
 * │ Não lança: nome que falta é linha sem nome na tela, e isso é degradação honesta. Gastar a cota da │
 * │ folha para deixar uma busca de admin mais completa seria a troca errada.                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NUNCA DERRUBA O LOTE: o frontend chama isto DEPOIS de já ter a lista de jobs na tela, então falha
 * na API do Pandapé (de um id ou de todos) devolve os que resolveram, nunca um erro do lote inteiro.
 */
@Injectable()
export class NomesFalhadosService {
  private readonly logger = new Logger("NomesFalhados");

  /**
   * REQUISIÇÕES ao Pandapé permitidas NESTE caminho por janela, global ao processo. Conta REQUISIÇÃO
   * (uma por `fetch` efetivamente feito), não job nem abertura de modal. Ver o bloco §A.5 acima.
   *
   * NÃO LÊ NENHUMA ENV e NÃO CONSULTA o estado da varredura, de propósito: freio que depende de outra
   * frente estar desligada é o freio que ninguém revê no dia em que ela é ligada. É reserva PRÓPRIA,
   * não folga emprestada do limiter do worker (que é contado em JOBS, unidade diferente).
   */
  static readonly ORCAMENTO_REQUISICOES = 150;
  /** Janela do orçamento, igual à dos limiters das filas (5 minutos). */
  static readonly JANELA_MS = 300_000;
  /** Teto de chamadas SIMULTÂNEAS. Segura a rajada, que é o que atrasaria o webhook da folha. */
  static readonly CONCORRENCIA = 4;

  /** Janela fixa em memória: quantas chamadas já saíram e quando a janela corrente começou. */
  private gastas = 0;
  private janelaAbertaEm = 0;

  constructor(
    private readonly pandapeApi: PandapeApiService,
    private readonly nomes: PandapeNomeCacheService,
  ) {}

  /**
   * O nome dos jobs falhados que a tela está mostrando, em UM lote. Só resolve o que tem
   * `idPrecollaborator` (o resto da fila é ciclo automático ou admissão, que não têm nome no Pandapé).
   * Job cujo nome não resolveu NÃO vem na lista: sem placeholder e sem marcador de erro por item.
   *
   * O `restantes` é quantos jobs ficaram sem nome porque o BUCKET RECUSOU a requisição, e só isso:
   * é o número que deixa a tela dizer "faltou resolver" em vez de mentir que a pessoa não está ali.
   * Nome que não existe no Pandapé, ou que a API não devolveu, não entra nessa conta.
   */
  async resolver(
    alvos: { jobId: string; idPrecollaborator: string }[],
  ): Promise<{ nomes: { jobId: string; nome: string }[]; restantes: number }> {

    const nomes: { jobId: string; nome: string }[] = [];
    const pendentes: { jobId: string; idPrecollaborator: string }[] = [];

    // 1) O CACHE PRIMEIRO. É o que faz a reabertura do modal não custar cota nenhuma.
    for (const a of alvos) {
      const doCache = this.nomes.ler(a.idPrecollaborator);
      if (doCache) nomes.push({ jobId: a.jobId, nome: doCache });
      else pendentes.push(a);
    }

    // 2) A API SÓ PARA O QUE FALTOU, sob o orçamento e a concorrência.
    //
    // A FILA DE TRABALHO É DEDUPLICADA AQUI, ANTES de começar, e não dentro do laço. O mesmo
    // `idPrecollaborator` aparece em mais de um job falhado na vida real (o `sync-candidate` e o
    // `pull-docs` do mesmo candidato), e conferir "já resolvi este?" DENTRO do laço não serve com
    // concorrência: os quatro trabalhadores puxam ids diferentes no mesmo instante e a conferência
    // roda antes de qualquer `await` ter voltado, então o id repetido era consultado DUAS vezes e
    // pagava cota duas vezes. O teste que segura isto conta as chamadas, não o resultado.
    const resolvidosAgora = new Map<string, string>();
    /** Ids que o bucket RECUSOU. Recusa é diferente de "não tem nome", e a tela precisa da diferença. */
    const recusados = new Set<string>();
    const fila = [...new Set(pendentes.map((a) => a.idPrecollaborator))];
    const trabalhar = async () => {
      for (;;) {
        const id = fila.shift();
        if (!id) return;
        if (!this.consumirOrcamento()) {
          // RECUSA, não espera: enfileirar o excedente é justamente o que gastaria a cota da folha
          // alguns segundos depois. O que sobrou volta como `restantes`, e a tela oferece pedir o resto.
          recusados.add(id);
          for (let resto = fila.shift(); resto; resto = fila.shift()) recusados.add(resto);
          return;
        }
        // Nunca lança: `getPrecollaborator` já devolve undefined em erro/timeout/inerte, e o catch
        // fecha o caso improvável de exceção, para um id ruim não derrubar o lote.
        const pc = await this.pandapeApi.getPrecollaborator(id).catch(() => undefined);
        // UM helper só para montar o nome (o mesmo que a rota `/alvo` usa): ele recebe CAMPO, nunca o
        // pré-colaborador inteiro, então o `cpf?: string` que o tipo declara não está no alcance.
        const nome = nomeDoPrecollaborator(pc);
        if (!nome) continue;
        // Grava no MESMO cache do worker (instância única, `PandapeEntradaModule`): a grade de
        // entradas e o próximo lote passam a ler daqui, sem nova chamada.
        this.nomes.guardar(id, nome);
        resolvidosAgora.set(id, nome);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(NomesFalhadosService.CONCORRENCIA, fila.length) }, trabalhar),
    );

    for (const a of pendentes) {
      const nome = resolvidosAgora.get(a.idPrecollaborator) ?? this.nomes.ler(a.idPrecollaborator);
      if (nome) nomes.push({ jobId: a.jobId, nome });
    }

    const restantes = pendentes.filter((a) => recusados.has(a.idPrecollaborator)).length;

    // §A.6: CONTAGEM, nunca nome nem id.
    this.logger.log(
      `Nomes da fila resolvidos: ${nomes.length} de ${alvos.length} alvo(s), ${resolvidosAgora.size} requisicao(oes) ao Pandapé`,
    );
    if (restantes > 0) {
      this.logger.warn(
        `Orçamento de cota do Pandapé esgotado neste caminho (${NomesFalhadosService.ORCAMENTO_REQUISICOES} req/5min): ${restantes} nome(s) ficaram sem resolver.`,
      );
    }
    return { nomes, restantes };
  }

  /** Janela FIXA de 5 minutos. Devolve false quando o orçamento da janela corrente acabou. */
  private consumirOrcamento(): boolean {
    const agora = Date.now();
    if (agora - this.janelaAbertaEm >= NomesFalhadosService.JANELA_MS) {
      this.janelaAbertaEm = agora;
      this.gastas = 0;
    }
    if (this.gastas >= NomesFalhadosService.ORCAMENTO_REQUISICOES) return false;
    this.gastas += 1;
    return true;
  }
}
