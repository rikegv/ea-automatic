import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { AsEtapaFunil, EtapaTom } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { asCandidaturaEtapas, asCandidaturas, asEtapasFunil } from "../../db/schema";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
// A NORMALIZAÇÃO É REUSADA, NÃO REESCRITA: duas normalizações divergem no primeiro acento, e o
// código é o valor que fica gravado no histórico para sempre. A função já está em produção no
// catálogo do iFractal e faz exatamente o que este catálogo precisa.
import { codigoDoRotulo } from "../../ifractal/ifractal-status.service";

/**
 * ─ O CATÁLOGO DAS ETAPAS DO FUNIL (A&S). A LISTA É DO DIRETOR ───────────────────────────────────
 *
 * ESTE SERVIÇO É A ÚNICA PORTA DE ESCRITA do catálogo, e é isso que torna o cache abaixo correto.
 *
 * ┌─ O QUE ELE GARANTE, e por que cada garantia mora aqui e não na tela ───────────────────────────┐
 * │ 1. O CÓDIGO É IMUTÁVEL. Derivado do rótulo na criação, nunca reescrito. É ele que está gravado │
 * │    em `as_candidaturas.etapa` e em cada evento de `as_candidatura_etapas`.                     │
 * │ 2. EXISTE SEMPRE UMA ETAPA INICIAL, e só uma. O banco garante a unicidade (índice parcial      │
 * │    `as_etapas_funil_inicial_unica`); as guardas daqui garantem que ela não seja removida nem   │
 * │    inativada sem outra ocupar o lugar.                                                         │
 * │ 3. NUNCA SE FICA SEM ETAPA ATIVA. Funil sem etapa não é funil, e a tela de mover ficaria vazia.│
 * │ 4. APAGAR TEM TRÊS CAMADAS (ver `remover`), e a do meio é a que preserva o histórico.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: código, rótulo, ordem, cor e dois booleanos. Nenhum dado pessoal passa por este arquivo; as
 * contagens que ele faz sobre candidaturas devolvem NÚMERO, nunca nome, nunca CPF, nunca id.
 */
@Injectable()
export class EtapasFunilService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * ─ O CACHE, e por que ele é seguro AQUI e não seria em outro lugar ────────────────────────────
   *
   * O CATÁLOGO TEM CINCO A DEZ LINHAS E MUDA UMA VEZ POR MÊS, e é lido em TODA mudança de etapa,
   * em todo lote e em toda listagem. Sem cache, cada validação vira uma consulta ao banco para um
   * dado que não mudou.
   *
   * A INVALIDAÇÃO É CONFIÁVEL PORQUE A PORTA DE ESCRITA É UMA SÓ: toda mutação passa por um método
   * desta classe, e todo método de mutação chama `invalidar()`. O TTL curto é rede de segurança
   * para o caminho que a aplicação não vê (um `UPDATE` por SQL cru, uma segunda instância do
   * processo), e não a régua principal.
   *
   * O ERRO DO CACHE CAI PARA O LADO INÓCUO: no pior caso ele aceita, por até um minuto, uma etapa
   * que acabou de ser inativada. O contrário (recusar etapa que existe) é o que dói, e é por isso
   * que a invalidação na escrita é imediata em vez de depender do relógio.
   */
  private cache: { em: number; linhas: AsEtapaFunil[] } | null = null;
  private static readonly TTL_MS = 60_000;

  private invalidar(): void {
    this.cache = null;
  }

  /** TODAS as linhas, ativas e inativas, na ordem do funil. É a base de tudo que se lê daqui. */
  private async todas(): Promise<AsEtapaFunil[]> {
    const agora = Date.now();
    if (this.cache && agora - this.cache.em < EtapasFunilService.TTL_MS) return this.cache.linhas;

    const linhas = await this.db
      .select({
        id: asEtapasFunil.id,
        codigo: asEtapasFunil.codigo,
        rotulo: asEtapasFunil.rotulo,
        ordem: asEtapasFunil.ordem,
        tom: asEtapasFunil.tom,
        inicial: asEtapasFunil.inicial,
        ativa: asEtapasFunil.ativa,
      })
      .from(asEtapasFunil)
      // O DESEMPATE POR `id` NÃO É DETALHE: sem ele, duas etapas com a mesma `ordem` trocam de lugar
      // a cada consulta, e a tela passa a mostrar o funil numa ordem diferente a cada F5.
      .orderBy(asc(asEtapasFunil.ordem), asc(asEtapasFunil.id));

    const mapeadas: AsEtapaFunil[] = linhas.map((l) => ({ ...l, tom: l.tom as EtapaTom }));
    this.cache = { em: agora, linhas: mapeadas };
    return mapeadas;
  }

  /**
   * A LISTA que a leitura devolve. ATIVAS por padrão; `incluirInativas` existe para o HISTÓRICO
   * conseguir resolver o rótulo de uma etapa que saiu de circulação, sem a linha do tempo passar a
   * mostrar o código cru para quem passou por ela.
   */
  async listar(incluirInativas = false): Promise<AsEtapaFunil[]> {
    const todas = await this.todas();
    return incluirInativas ? todas : todas.filter((e) => e.ativa);
  }

  /** Só os CÓDIGOS ativos, na ordem do funil: é o que o domínio recebe como parâmetro. */
  async codigosAtivos(): Promise<string[]> {
    return (await this.listar()).map((e) => e.codigo);
  }

  /**
   * `codigo -> ordem`, para quem precisa ORDENAR por funil. Inclui as INATIVAS de propósito: a lista
   * de candidatos pendentes do fechamento pode conter alguém parado numa etapa inativada, e ele
   * precisa de uma posição, não de um buraco.
   */
  async ordemPorCodigo(): Promise<ReadonlyMap<string, number>> {
    return new Map((await this.todas()).map((e) => [e.codigo, e.ordem]));
  }

  /**
   * ONDE A CANDIDATURA NASCE. Fonte ÚNICA desde que o `DEFAULT 'CAPTACAO'` saiu da coluna.
   *
   * LANÇA se não houver nenhuma, e lançar é o certo: candidatura sem etapa é linha órfã que a FK
   * recusaria de qualquer forma, e o erro aqui diz o que fazer em vez de vazar violação de
   * constraint para a tela.
   */
  async etapaInicial(): Promise<AsEtapaFunil> {
    const inicial = (await this.listar()).find((e) => e.inicial);
    if (!inicial) {
      throw new BadRequestException(
        "Nenhuma etapa do funil está marcada como inicial. Marque uma na tela de Etapas Do Funil antes de cadastrar candidatos.",
      );
    }
    return inicial;
  }

  /**
   * A VALIDAÇÃO QUE SUBSTITUIU O `@IsIn` DOS DTOs.
   *
   * ELA SAIU DO DECORATOR porque o `class-validator` não faz consulta assíncrona bem, e porque a
   * lista deixou de ser estática: um `@IsIn` sobre a lista de ontem recusaria a etapa que o diretor
   * criou hoje, que é o defeito exato que esta frente existe para eliminar.
   *
   * RECUSA A INATIVA TAMBÉM: ela resolve rótulo de histórico e não recebe gente nova.
   */
  async exigirEtapaAtiva(codigo: string): Promise<AsEtapaFunil> {
    const etapa = (await this.listar(true)).find((e) => e.codigo === codigo);
    if (!etapa) {
      throw new BadRequestException("Esta etapa não existe no funil. Recarregue a página.");
    }
    if (!etapa.ativa) {
      throw new BadRequestException(
        `A etapa "${etapa.rotulo}" foi desativada e não recebe mais candidatos. Escolha outra.`,
      );
    }
    return etapa;
  }

  // ── ESCRITA ───────────────────────────────────────────────────────────────

  /**
   * CRIAR, e o caso que faria isto virar 500 se ninguém pensasse nele: RECRIAR UMA ETAPA INATIVADA.
   *
   * O CÓDIGO É DERIVADO DO RÓTULO, então digitar "Triagem" de novo produz `TRIAGEM`, que continua
   * existindo na tabela (inativado, segurando o rótulo do histórico de quem passou por lá). Um
   * `INSERT` direto estouraria o unique e a tela mostraria erro de banco.
   *
   * A BUSCA AQUI INCLUI AS INATIVAS de propósito, e a recusa DIZ O QUE FAZER ("Reative-a"). NÃO
   * reativa sozinha: reativar traz junto o histórico inteiro daquela etapa, e essa é uma decisão de
   * quem opera, não um efeito colateral de ter digitado um nome parecido.
   *
   * VALE TAMBÉM PARA A COLISÃO POR TRUNCAMENTO: `codigoDoRotulo` corta em 40 caracteres, então dois
   * rótulos longos e parecidos podem gerar o MESMO código. O caminho é o mesmo, e a frase também.
   */
  async criar(dto: { rotulo: string }): Promise<AsEtapaFunil> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome da etapa.");

    const codigo = codigoDoRotulo(rotulo);
    if (!codigo) throw new BadRequestException("O nome precisa ter ao menos uma letra ou número.");

    const existente = (await this.listar(true)).find((e) => e.codigo === codigo);
    if (existente?.ativa) throw new BadRequestException("Já existe uma etapa com esse nome.");
    if (existente) {
      throw new BadRequestException(
        `Existe uma etapa inativa com este nome ("${existente.rotulo}"). Reative-a em vez de criar outra, para o histórico de quem passou por ela continuar apontando para a mesma etapa.`,
      );
    }

    // NASCE NO FIM DO FUNIL, como o catálogo do iFractal: quem quiser no meio reordena depois, e
    // reordenar é uma operação só, atômica, em vez de um "inserir na posição N" que reescreveria a
    // fila inteira no ato da criação.
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${asEtapasFunil.ordem}), 0)::int` })
      .from(asEtapasFunil);

    try {
      const [criada] = await this.db
        .insert(asEtapasFunil)
        .values({ codigo, rotulo, ordem: max + 1, tom: "nt", inicial: false, ativa: true })
        .returning();
      this.invalidar();
      return { ...criada, tom: criada.tom as EtapaTom };
    } catch {
      // A CORRIDA: dois cliques ao mesmo tempo passam os dois pela consulta acima. O unique do banco
      // é quem decide, e a frase que chega na tela é a mesma da checagem otimista.
      this.invalidar();
      throw new BadRequestException("Já existe uma etapa com esse nome.");
    }
  }

  /**
   * RENOMEAR. O CÓDIGO NÃO MUDA, e é isso que faz o histórico inteiro daquela etapa passar a exibir
   * o nome novo: é a MESMA etapa, com o nome corrigido, e não uma segunda.
   */
  async renomear(id: number, dto: { rotulo: string }): Promise<AsEtapaFunil> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome da etapa.");

    const [upd] = await this.db
      .update(asEtapasFunil)
      .set({ rotulo, atualizadoEm: new Date() })
      .where(eq(asEtapasFunil.id, id))
      .returning();
    if (!upd) throw new NotFoundException("Etapa não encontrada.");
    this.invalidar();
    return { ...upd, tom: upd.tom as EtapaTom };
  }

  /** A COR. A paleta é fechada e quem a valida é o DTO; o CHECK do banco é a última instância. */
  async definirTom(id: number, dto: { tom: EtapaTom }): Promise<AsEtapaFunil> {
    const [upd] = await this.db
      .update(asEtapasFunil)
      .set({ tom: dto.tom, atualizadoEm: new Date() })
      .where(eq(asEtapasFunil.id, id))
      .returning();
    if (!upd) throw new NotFoundException("Etapa não encontrada.");
    this.invalidar();
    return { ...upd, tom: upd.tom as EtapaTom };
  }

  /**
   * MARCAR QUAL ETAPA É A INICIAL. EXCLUSIVO, e na ordem certa: desmarca todas as outras ANTES de
   * marcar esta.
   *
   * A ORDEM É OBRIGATÓRIA e não é zelo: o índice parcial único do banco não é postergável, então
   * marcar a nova com a antiga ainda marcada estouraria a constraint no meio da transação. Desmarcar
   * primeiro deixa o instante intermediário SEM inicial, que o índice permite, e a transação fecha
   * com exatamente uma.
   */
  async definirInicial(id: number): Promise<AsEtapaFunil> {
    const alvo = (await this.listar(true)).find((e) => e.id === id);
    if (!alvo) throw new NotFoundException("Etapa não encontrada.");
    if (!alvo.ativa) {
      throw new BadRequestException(
        "Esta etapa está inativa. Reative-a antes de torná-la a etapa inicial do funil.",
      );
    }

    const atualizada = await this.db.transaction(async (tx) => {
      await tx
        .update(asEtapasFunil)
        .set({ inicial: false, atualizadoEm: new Date() })
        .where(and(eq(asEtapasFunil.inicial, true), ne(asEtapasFunil.id, id)));
      const [upd] = await tx
        .update(asEtapasFunil)
        .set({ inicial: true, atualizadoEm: new Date() })
        .where(eq(asEtapasFunil.id, id))
        .returning();
      return upd;
    });
    this.invalidar();
    return { ...atualizada, tom: atualizada.tom as EtapaTom };
  }

  /**
   * REORDENAR: recebe a LISTA COMPLETA de ids na ordem nova e reescreve `ordem = 1..N`.
   *
   * EXIGE A LISTA INTEIRA, e recusa a parcial. Reescrever só um pedaço deixaria as demais com a
   * numeração antiga, e a fila resultante dependeria do desempate por `id` em vez da decisão de quem
   * arrastou. A recusa é explícita para o erro aparecer na tela em vez de virar ordem errada.
   */
  async reordenar(ids: number[]): Promise<AsEtapaFunil[]> {
    const todas = await this.todas();
    const conhecidos = new Set(todas.map((e) => e.id));

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("A ordem enviada tem etapas repetidas. Recarregue a página.");
    }
    if (ids.length !== todas.length || ids.some((id) => !conhecidos.has(id))) {
      throw new BadRequestException(
        "A ordem enviada não corresponde às etapas cadastradas. Recarregue a página e tente de novo.",
      );
    }

    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(asEtapasFunil)
          .set({ ordem: i + 1, atualizadoEm: new Date() })
          .where(eq(asEtapasFunil.id, id));
      }
    });
    this.invalidar();
    return this.listar(true);
  }

  /** REATIVAR uma etapa inativada. Preserva o código, então o histórico dela segue apontando certo. */
  async reativar(id: number): Promise<AsEtapaFunil> {
    const [upd] = await this.db
      .update(asEtapasFunil)
      .set({ ativa: true, atualizadoEm: new Date() })
      .where(eq(asEtapasFunil.id, id))
      .returning();
    if (!upd) throw new NotFoundException("Etapa não encontrada.");
    this.invalidar();
    return { ...upd, tom: upd.tom as EtapaTom };
  }

  /**
   * ─ A CAMADA 1, EM UM PONTO SÓ: NÃO SE TIRA DE CIRCULAÇÃO UMA ETAPA COM GENTE VIVA DENTRO ────────
   *
   * ┌─ O QUE MUDOU, e quando (decisão do diretor, 10/09/2026) ───────────────────────────────────────┐
   * │ ATÉ AQUI, `inativar` PERMITIA a etapa cheia, e a permissão era deliberada e documentada: quem  │
   * │ chamasse a rota "já tinha decidido". O efeito, medido e não suposto, é a ETAPA FANTASMA: as     │
   * │ candidaturas vivas continuam apontando para um código que sumiu do seletor, do filtro e da tela │
   * │ de mover. Elas não param de existir, param de ser alcançáveis, e é pior do que apagar porque    │
   * │ nada falha. O diretor decidiu IGUALAR AO `remover`: a etapa cheia é recusada nos DOIS verbos.   │
   * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A RÉGUA É `SITUACOES_VIVAS`, NUNCA `situacao = 'ATIVO'`, e a diferença é medível: `ALOCADO`,
   * `APROVADO` e `ENVIADO_PARA_ADMISSAO` CONTINUAM NO FUNIL e continuam ocupando etapa. A lista vem
   * do domínio, derivada de `ehSaidaSemExito`, e não é redigitada aqui: uma cópia divergiria no dia
   * em que o vocabulário ganhasse uma situação nova, e a recusa passaria a deixar gente para trás.
   *
   * O NÚMERO ESTÁ NA FRASE porque ele diz o TAMANHO DO TRABALHO: mover 3 é agora, mover 40 é outra
   * conversa. O VERBO entra por parâmetro para a frase dizer o que a pessoa tentou fazer.
   *
   * NÃO SE MOVE NINGUÉM AUTOMATICAMENTE, aqui como no `remover`: "inativar a Triagem manda todo
   * mundo para X" é irreversível, silencioso, e escreve no histórico de gente um movimento que
   * ninguém decidiu. O mover em lote já existe na Central de Candidatos.
   *
   * ┌─ ESTE É O PONTO ÚNICO PREVISTO PARA AS DUAS CHAMADAS, e hoje só UMA delas chega aqui ──────────┐
   * │ O `remover` continua com o gêmeo INLINE na camada 1 dele, e isso é PROVISÓRIO POR PROCESSO,    │
   * │ não por desenho: ele é código auditado e aprovado, e trocar o bloco dele por esta chamada       │
   * │ depende de aval do diretor. Enquanto as duas versões coexistirem, quem impede a divergência é   │
   * │ o teste que compara as DUAS frases no MESMO catálogo                                            │
   * │ (`etapas-funil.inativacao.spec.ts`, "a régua é a MESMA nos dois verbos"): mexer em uma e não na │
   * │ outra fica vermelho antes de chegar em produção.                                                │
   * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: devolve NÚMERO. Nunca nome, nunca CPF, nunca id de candidatura.
   */
  private async exigirEtapaSemCandidaturaViva(
    codigo: string,
    verbo: "inativar" | "remover",
  ): Promise<void> {
    const [{ vivas }] = await this.db
      .select({ vivas: sql<number>`count(*)::int` })
      .from(asCandidaturas)
      .where(
        and(eq(asCandidaturas.etapa, codigo), inArray(asCandidaturas.situacao, [...SITUACOES_VIVAS])),
      );
    if (vivas > 0) {
      throw new BadRequestException(
        `${vivas} ${vivas === 1 ? "candidatura está" : "candidaturas estão"} nesta etapa. Mova ${vivas === 1 ? "essa pessoa" : "essas pessoas"} para outra etapa antes de ${verbo}.`,
      );
    }
  }

  /**
   * ─ INATIVAR: A CONTRAPARTE EXPLÍCITA DO `reativar` ──────────────────────────────────────────────
   *
   * ┌─ POR QUE ELA EXISTE, tendo o `remover` já inativado em um dos casos ───────────────────────────┐
   * │ A TELA MOSTRA A COLUNA STATUS COM "Ativa" E NÃO OFERECIA COMO SAIR DESSE ESTADO (apontado pelo │
   * │ diretor). Inativar era um EFEITO COLATERAL do apagar: quem quisesse tirar uma etapa de          │
   * │ circulação tinha de clicar em REMOVER e torcer para haver histórico, porque é o histórico que   │
   * │ desvia o `remover` da camada 3 para a 2. Sem histórico, o mesmo clique APAGA a linha. Pedir     │
   * │ para apagar quando se quer inativar é pedir para acertar por sorte.                             │
   * │                                                                                                 │
   * │ O QUE ELA NÃO TEM é a ESCOLHA ENTRE APAGAR E PRESERVAR (as camadas 2 e 3 do `remover`): quem    │
   * │ chama esta rota já decidiu que a linha FICA, então não há histórico a contar para decidir o      │
   * │ destino da linha. A camada 1 é outra coisa, e essa vale aqui também (abaixo).                   │
   * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * AS TRÊS RECUSAS, NESTA ORDEM, e são as MESMAS do `remover` (a terceira desde 10/09/2026, por
   * decisão do diretor):
   *  1. NÃO É A ETAPA INICIAL: sem ela, a próxima candidatura nasceria sem lugar;
   *  2. NÃO É A ÚLTIMA ATIVA: funil sem etapa ativa não é funil, e a tela de mover abriria vazia;
   *  3. NÃO TEM CANDIDATURA VIVA DENTRO (`exigirEtapaSemCandidaturaViva`), com o NÚMERO na frase.
   *
   * AS DUAS PRIMEIRAS VÊM ANTES DA TERCEIRA DE PROPÓSITO: elas são sobre o ESTADO EM QUE O CATÁLOGO
   * FICA, custam ZERO consulta (o catálogo já está em memória) e valem mesmo com a etapa vazia. Só
   * quem passa por elas paga a contagem no banco.
   *
   * A IDEMPOTÊNCIA CONTINUA VALENDO PARA A ETAPA VAZIA: inativar o que já está inativo devolve a
   * linha como está, sem erro. O clique repetido (ou a segunda aba aberta) pede um estado que já é
   * verdade, e recusar isso seria transformar concordância em chamado. A trava da última ativa é
   * escrita sobre `alvo.ativa` por causa exatamente disso: a etapa já inativa não é a última ativa
   * de coisa nenhuma.
   *
   * A CONTAGEM, essa, NÃO OLHA `alvo.ativa`, e é o mesmo que o `remover` faz: a etapa JÁ INATIVA com
   * gente viva dentro é a etapa fantasma em si, e ela é recusada nos dois verbos, com a frase que diz
   * o caminho (mover as pessoas). Escrever a exceção aqui seria criar uma porta em que o estado mais
   * quebrado é o único que passa sem reclamar.
   *
   * O CÓDIGO NÃO MUDA e a linha não sai da tabela, então o histórico de quem passou por aqui segue
   * resolvendo o rótulo (é o que `listar(true)` serve). A volta é o `reativar`, com o mesmo código.
   */
  async inativar(id: number): Promise<AsEtapaFunil> {
    const todas = await this.todas();
    const alvo = todas.find((e) => e.id === id);
    if (!alvo) throw new NotFoundException("Etapa não encontrada.");

    if (alvo.inicial) {
      throw new BadRequestException(
        "Esta é a etapa em que toda candidatura nasce. Marque outra como inicial antes de inativar esta.",
      );
    }
    if (alvo.ativa && todas.filter((e) => e.ativa).length <= 1) {
      throw new BadRequestException(
        "Esta é a última etapa ativa do funil. Crie outra antes de inativar esta.",
      );
    }

    // A CAMADA 1 DO `remover`, aqui também (decisão do diretor, 10/09/2026): etapa com candidatura
    // VIVA dentro é recusada, com o número na frase. Sem isso, inativar produzia etapa fantasma.
    await this.exigirEtapaSemCandidaturaViva(alvo.codigo, "inativar");

    const [upd] = await this.db
      .update(asEtapasFunil)
      .set({ ativa: false, atualizadoEm: new Date() })
      .where(eq(asEtapasFunil.id, id))
      .returning();
    // A LINHA PODE TER SUMIDO entre a leitura (servida de cache) e a escrita. O cache invalida junto
    // para a próxima leitura não insistir no mundo antigo.
    if (!upd) {
      this.invalidar();
      throw new NotFoundException("Etapa não encontrada.");
    }
    this.invalidar();
    return { ...upd, tom: upd.tom as EtapaTom };
  }

  /**
   * ─ APAGAR UMA ETAPA: TRÊS CAMADAS, NESTA ORDEM (decisão do diretor) ─────────────────────────────
   *
   * ┌─ 1. TEM CANDIDATURA VIVA NA ETAPA: RECUSA, COM O NÚMERO NA FRASE ─────────────────────────────┐
   * │ "3 candidaturas estão nesta etapa. Mova essas pessoas para outra antes de remover." O número  │
   * │ está lá porque ele diz o TAMANHO DO TRABALHO: mover 3 é agora, mover 40 é outra conversa.     │
   * │                                                                                                │
   * │ A RÉGUA É `candidaturaViva`, NUNCA `situacao = 'ATIVO'`, e a diferença é medível: `ALOCADO`,   │
   * │ `APROVADO` e `ENVIADO_PARA_ADMISSAO` CONTINUAM NO FUNIL e continuam ocupando etapa. Contar só  │
   * │ `ATIVO` deixaria, só na homologação de hoje, linhas vivas apontando para uma etapa inativada:  │
   * │ etapa fantasma, que some do seletor e continua enchendo card.                                  │
   * │                                                                                                │
   * │ NÃO SE MOVE NINGUÉM AUTOMATICAMENTE. "Apagar a Triagem manda todo mundo para X" é irreversível,│
   * │ silencioso, e escreve no histórico de gente um movimento que ninguém decidiu. O mover em lote  │
   * │ já existe na Central de Candidatos e a decisão fica com quem opera.                            │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ 2. NINGUÉM VIVO, MAS HÁ HISTÓRICO: NÃO APAGA, INATIVA ───────────────────────────────────────┐
   * │ A etapa some dos seletores, dos filtros e da tela de mover, e CONTINUA resolvendo o rótulo do  │
   * │ histórico de quem passou por ela. Pela FK RESTRICT, nem por SQL cru alguém apaga.              │
   * │                                                                                                │
   * │ §A.6, E ISTO PRECISA CHEGAR NA TELA: o expurgo por retenção ANONIMIZA a pessoa e PRESERVA a    │
   * │ candidatura e o histórico para sempre. Não existe dia futuro em que essas linhas sumam e       │
   * │ liberem o `DELETE`. Etapa por onde alguém passou é INATIVÁVEL, nunca apagável, e a frase de    │
   * │ retorno diz isso para não virar chamado de "o botão apagar não funciona".                      │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ 3. ZERO VIVO E ZERO HISTÓRICO: APAGA DE VERDADE ─────────────────────────────────────────────┐
   * │ É o caso do primeiro dia: criou "Trigem" com erro de digitação e quer sumir com ela.           │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * MAIS DUAS TRAVAS, antes de qualquer camada: não se tira a etapa INICIAL (a próxima candidatura
   * nasceria sem lugar) nem a ÚLTIMA ATIVA (funil sem etapa não é funil, e a tela de mover ficaria
   * vazia).
   */
  async remover(id: number): Promise<{ removida: boolean; inativada: boolean; mensagem: string }> {
    const todas = await this.todas();
    const alvo = todas.find((e) => e.id === id);
    if (!alvo) throw new NotFoundException("Etapa não encontrada.");

    if (alvo.inicial) {
      throw new BadRequestException(
        "Esta é a etapa em que toda candidatura nasce. Marque outra como inicial antes de remover esta.",
      );
    }
    if (alvo.ativa && todas.filter((e) => e.ativa).length <= 1) {
      throw new BadRequestException(
        "Esta é a última etapa ativa do funil. Crie outra antes de remover esta.",
      );
    }

    // CAMADA 1: quem está VIVO na etapa. A lista de situações vem do domínio, derivada de
    // `ehSaidaSemExito`, e não digitada aqui: uma cópia divergiria no dia em que o vocabulário
    // ganhasse uma situação nova, e a recusa passaria a deixar gente para trás.
    //
    // ESTE BLOCO É O GÊMEO DE `exigirEtapaSemCandidaturaViva(alvo.codigo, "remover")`, que hoje
    // atende o `inativar` e produz EXATAMENTE esta frase. Ele NÃO foi trocado pela chamada porque
    // este método é código auditado e aprovado, e a troca depende de aval do diretor. Enquanto as
    // duas versões coexistirem, quem segura a divergência é o teste que compara as duas frases no
    // mesmo catálogo (`etapas-funil.inativacao.spec.ts`).
    const [{ vivas }] = await this.db
      .select({ vivas: sql<number>`count(*)::int` })
      .from(asCandidaturas)
      .where(
        and(
          eq(asCandidaturas.etapa, alvo.codigo),
          inArray(asCandidaturas.situacao, [...SITUACOES_VIVAS]),
        ),
      );
    if (vivas > 0) {
      throw new BadRequestException(
        `${vivas} ${vivas === 1 ? "candidatura está" : "candidaturas estão"} nesta etapa. Mova ${vivas === 1 ? "essa pessoa" : "essas pessoas"} para outra etapa antes de remover.`,
      );
    }

    // CAMADA 2 x 3: sobrou rastro? Conta as candidaturas ENCERRADAS que ainda apontam para a etapa
    // e os eventos do histórico, dos dois lados (`etapa_de` e `etapa_para`).
    const [{ encerradas }] = await this.db
      .select({ encerradas: sql<number>`count(*)::int` })
      .from(asCandidaturas)
      .where(eq(asCandidaturas.etapa, alvo.codigo));
    const [{ eventos }] = await this.db
      .select({ eventos: sql<number>`count(*)::int` })
      .from(asCandidaturaEtapas)
      .where(
        sql`${asCandidaturaEtapas.etapaPara} = ${alvo.codigo} or ${asCandidaturaEtapas.etapaDe} = ${alvo.codigo}`,
      );

    if (encerradas + eventos > 0) {
      if (!alvo.ativa) {
        return {
          removida: false,
          inativada: true,
          mensagem: "Esta etapa já estava inativa.",
        };
      }
      await this.db
        .update(asEtapasFunil)
        .set({ ativa: false, atualizadoEm: new Date() })
        .where(eq(asEtapasFunil.id, id));
      this.invalidar();
      return {
        removida: false,
        inativada: true,
        mensagem:
          "Esta etapa foi desativada em vez de apagada, porque há candidatos que já passaram por ela. Ela sai dos seletores e dos filtros e continua identificando o histórico de quem passou.",
      };
    }

    await this.db.delete(asEtapasFunil).where(eq(asEtapasFunil.id, id));
    this.invalidar();
    return { removida: true, inativada: false, mensagem: "Etapa removida." };
  }
}
