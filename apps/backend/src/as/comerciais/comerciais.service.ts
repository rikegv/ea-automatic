import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import type { AsComercial } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { asComerciais, clientes, vagas } from "../../db/schema";

/**
 * ─ O TIPO QUE ESTE CATÁLOGO GRAVA. HOJE É O PRÓPRIO `AsComercial`, E ISSO É NOTÍCIA BOA ────────
 *
 * ┌─ ESTE ALIAS FOI UMA PONTE, E A PONTE JÁ FOI ATRAVESSADA (13/09) ───────────────────────────────┐
 * │ Ele nasceu como `Omit<AsComercial, "codigo">` porque o contrato ainda declarava `codigo` e a    │
 * │ tabela nunca teve a coluna. O arquivo do contrato tem dono único (§A.39), então a diferença     │
 * │ ficou declarada aqui até o dono agir. **O dono agiu:** `AsComercial` não tem mais `codigo`, e o │
 * │ `Omit` virou no-op.                                                                             │
 * │                                                                                                 │
 * │ O alias fica como NOME, não como subtração, porque ele diz o que o serviço grava e é lido em    │
 * │ vários pontos daqui. Quem o remover troca por `AsComercial` e nada muda.                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A AUSÊNCIA DO `codigo` É A DECISÃO DE LGPD DESTA ONDA: um código derivado do nome
 * ("ANA_PAULA_RODRIGUES") seria imutável para sempre, num campo que nenhuma tela corrige, e nome de
 * pessoa muda (casamento, retificação civil, nome social).
 */
export type AsComercialGravado = AsComercial;

/**
 * ─ A RÉGUA DA ESCOLHA, PURA, E ELA MORA FORA DA CLASSE DE PROPÓSITO ────────────────────────────
 *
 * TRÊS LUGARES PRECISAM DESTA MESMA PERGUNTA: este serviço (a porta do catálogo), o
 * `ClientesService` (o comercial do cliente) e o `VagasService` (a sobreposição da vaga). Escrever a
 * régua três vezes é o começo de "um lado aceita o comercial inativo e o outro não", então ela é UMA
 * função, pura, sobre a lista já lida.
 *
 * ┌─ AS DUAS SOBRECARGAS SÃO A REGRA, NÃO ACADEMICISMO ───────────────────────────────────────────┐
 * │ Com `id: number`, o retorno é `AsComercial` e NUNCA `null`: id inválido ou inativo LANÇA. É    │
 * │ isso que impede o chamador de escrever `?.id ?? null` e transformar um erro de escolha em      │
 * │ HERANÇA SILENCIOSA, porque nulo, nesta onda, significa "HERDA DO CLIENTE" e não "em branco".   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: NENHUMA frase deste arquivo cita nome de pessoa, nem o da pessoa escolhida. Mensagem de erro
 * vai para log de exceção, e nome em log é o que a §A.6 proíbe; as recusas que falam de terceiros (a
 * de inativar) usam CONTAGEM. É a diferença mais visível para os catálogos irmãos, que citam o
 * rótulo à vontade porque "SouFast" não é dado de ninguém.
 */
export function comercialEscolhido(comerciais: readonly AsComercialGravado[], id: number): AsComercialGravado;
export function comercialEscolhido(
  comerciais: readonly AsComercialGravado[],
  id: number | null | undefined,
): AsComercialGravado | null;
export function comercialEscolhido(
  comerciais: readonly AsComercialGravado[],
  id: number | null | undefined,
): AsComercialGravado | null {
  if (id === null || id === undefined) return null;
  const comercial = comerciais.find((c) => c.id === id);
  if (!comercial) {
    throw new BadRequestException("Este comercial não existe. Recarregue a página.");
  }
  if (!comercial.ativo) {
    // A FRASE NÃO CITA O NOME, e a diferença para o catálogo irmão é deliberada: mensagem de erro
    // vai para log de exceção, e nome de pessoa em log é o que a §A.6 proíbe. Quem lê esta frase
    // acabou de escolher a pessoa no seletor, então o nome não acrescenta nada que ele não veja.
    throw new BadRequestException(
      "O comercial escolhido foi desativado e não recebe cadastros novos. Escolha outro.",
    );
  }
  return comercial;
}

/**
 * ─ O CATÁLOGO DOS COMERCIAIS (as PESSOAS do comercial). A LISTA É DO DIRETOR ───────────────────
 *
 * ESTE SERVIÇO É A ÚNICA PORTA DE ESCRITA do catálogo, e é isso que torna o cache abaixo correto.
 *
 * ┌─ É A PRIMEIRA TABELA DESTA ONDA COM DADO PESSOAL, E O DESENHO INTEIRO MUDA POR CAUSA DISSO ──┐
 * │ 1. NÃO HÁ `codigo`. Nos irmãos ele é derivado do rótulo e IMUTÁVEL; aqui gravaria o nome da   │
 * │    pessoa, em maiúsculas, numa coluna que nenhuma tela corrige. Nome MUDA e a LGPD dá direito │
 * │    à correção, então a identidade é o `id` serial, sem semântica.                             │
 * │ 2. NÃO HÁ UNIQUE POR NOME. Duas "Ana Silva" existem, e a recusa da segunda revelaria o nome   │
 * │    de uma ex-funcionária inativada a quem só tentou cadastrar alguém.                          │
 * │ 3. NÃO EXISTE CONTROLLER DE LEITURA ABERTA. Os catálogos irmãos deixam o `GET` aberto a        │
 * │    qualquer sessão porque a lista deles é inócua; esta é a folha do time comercial, e aberta   │
 * │    ela sairia inteira num `curl` de qualquer COMUM da Admissão. Quem precisa da lista a recebe │
 * │    por superfície JÁ GATADA: `VagasService.opcoes()` (menu `as-vagas`) e a rota de opções do   │
 * │    cadastro de cliente. Mesma régua de `GerencialController.nomes` e                            │
 * │    `AltoVolumeController.pessoasDaLoja`.                                                        │
 * │ 4. NENHUMA FRASE SOBRE TERCEIROS CITA NOME. As recusas de inativar devolvem CONTAGEM, porque  │
 * │    mensagem de erro vai para log de exceção, e nome de pessoa em log é o que a §A.6 proíbe.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE TAMBÉM NÃO FOI COPIADO DO MOLDE: a trava de "última ativa" (`LinhasServicoService`). Ela
 * existe lá porque a linha de serviço é OBRIGATÓRIA para publicar vaga; comercial não é obrigatório
 * em lugar nenhum, e copiá-la impediria o diretor de esvaziar um catálogo opcional. E não existe
 * APAGAR: a OST pediu criar, renomear, reordenar, inativar e reativar (§A.14), e a exclusão lógica
 * é a resposta certa para "esta pessoa saiu", porque preserva de quem era o cliente.
 */
@Injectable()
export class ComerciaisService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * ─ O CACHE, e por que ele é seguro AQUI ───────────────────────────────────────────────────────
   *
   * O CATÁLOGO É CURTO E MUDA RARAMENTE, e é lido na listagem da Central de Vagas (para resolver o
   * rótulo de toda vaga) e nos seletores. A INVALIDAÇÃO É CONFIÁVEL PORQUE A PORTA DE ESCRITA É UMA
   * SÓ: toda mutação desta classe chama `invalidar()`, sem exceção, e é isso que impede o catálogo
   * de servir NOME ERRADO por até um minuto depois de um renomear. O TTL curto é rede de segurança
   * para o caminho que a aplicação não vê (um `UPDATE` por SQL cru, uma segunda instância).
   */
  private cache: { em: number; comerciais: AsComercialGravado[] } | null = null;
  private static readonly TTL_MS = 60_000;

  private invalidar(): void {
    this.cache = null;
  }

  /** TODOS, ativos e inativos, na ordem do catálogo. É a base de tudo que se lê daqui. */
  private async todos(): Promise<AsComercialGravado[]> {
    const agora = Date.now();
    if (this.cache && agora - this.cache.em < ComerciaisService.TTL_MS) return this.cache.comerciais;

    const comerciais = await this.db
      .select({
        id: asComerciais.id,
        rotulo: asComerciais.rotulo,
        ordem: asComerciais.ordem,
        ativo: asComerciais.ativo,
      })
      .from(asComerciais)
      // O DESEMPATE POR `id` NÃO É DETALHE: sem ele, dois comerciais com a mesma `ordem` trocam de
      // lugar a cada consulta, e o seletor muda de ordem a cada F5.
      .orderBy(asc(asComerciais.ordem), asc(asComerciais.id));

    this.cache = { em: agora, comerciais };
    return comerciais;
  }

  /**
   * A LISTA que a leitura devolve. ATIVOS por padrão; `incluirInativos` existe para o HISTÓRICO: o
   * cliente atendido por quem já saiu da empresa precisa continuar dizendo de quem era, senão a
   * ficha passa a mostrar vazio no lugar do responsável.
   */
  async listar(incluirInativos = false): Promise<AsComercialGravado[]> {
    const todos = await this.todos();
    return incluirInativos ? todos : todos.filter((c) => c.ativo);
  }

  /**
   * A VALIDAÇÃO DA ESCOLHA. `null` SÓ PODE SIGNIFICAR "O USUÁRIO NÃO ESCOLHEU", nunca "o que ele
   * escolheu não vale": nesta onda nulo quer dizer HERDAR DO CLIENTE, então coagir um id inválido
   * para nulo viraria herança silenciosa, e quem escolheu veria a tela mostrar outra pessoa. A
   * sobrecarga de `comercialEscolhido` deixa isso no TIPO, não só no comentário.
   */
  async exigirComercialAtivo(id: number | null | undefined): Promise<number | null> {
    if (id === null || id === undefined) return null;
    return comercialEscolhido(await this.listar(true), id).id;
  }

  // ── ESCRITA ───────────────────────────────────────────────────────────────

  /**
   * CRIAR. NÃO HÁ CHECAGEM DE NOME REPETIDO, e a ausência é a regra (ver o cabeçalho): homônimo é
   * caso real, e a recusa teria de dizer com quem colidiu, revelando o nome de quem já saiu.
   *
   * NASCE NO FIM DA LISTA. Quem quiser no meio reordena depois, e reordenar é uma operação só,
   * atômica, em vez de um "inserir na posição N" que reescreveria a fila inteira na criação.
   */
  async criar(dto: { rotulo: string }): Promise<AsComercialGravado> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome do comercial.");

    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${asComerciais.ordem}), 0)::int` })
      .from(asComerciais);

    const [criado] = await this.db
      .insert(asComerciais)
      .values({ rotulo, ordem: max + 1, ativo: true })
      .returning({
        id: asComerciais.id,
        rotulo: asComerciais.rotulo,
        ordem: asComerciais.ordem,
        ativo: asComerciais.ativo,
      });
    this.invalidar();
    return criado;
  }

  /**
   * RENOMEAR, e aqui ele faz MAIS do que nos catálogos irmãos: sem `codigo` imutável ao lado, o
   * renomear corrige a pessoa INTEIRA. É o que dá conta de casamento, retificação e nome social sem
   * deixar o nome antigo vivo em nenhum canto, e é o direito de correção da LGPD atendido por
   * desenho. O `id` não muda, então os clientes e as vagas dela continuam sendo dela.
   */
  async renomear(id: number, dto: { rotulo: string }): Promise<AsComercialGravado> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome do comercial.");

    const atual = await this.exigir(id);
    const [atualizado] = await this.db
      .update(asComerciais)
      .set({ rotulo, atualizadoEm: new Date() })
      .where(eq(asComerciais.id, atual.id))
      .returning({
        id: asComerciais.id,
        rotulo: asComerciais.rotulo,
        ordem: asComerciais.ordem,
        ativo: asComerciais.ativo,
      });
    this.invalidar();
    return atualizado;
  }

  /**
   * A ORDEM DO SELETOR. Recebe a lista COMPLETA de ids na ordem nova e reescreve `1..N`.
   *
   * NÃO É "SOBE/DESCE" COM TROCA DE PARES de propósito: dois cliques rápidos produzem ordem
   * duplicada, e a colisão só aparece na tela do outro. A autoridade é a reescrita completa, numa
   * transação, e é por isso que a lista precisa vir INTEIRA.
   */
  async reordenar(ids: number[]): Promise<AsComercialGravado[]> {
    const todos = await this.todos();
    const conhecidos = new Set(todos.map((c) => c.id));

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("A ordem enviada tem comerciais repetidos. Recarregue a página.");
    }
    const desconhecido = ids.find((id) => !conhecidos.has(id));
    if (desconhecido !== undefined) {
      throw new BadRequestException("A lista enviada tem um comercial que não existe. Recarregue a página.");
    }
    // A LISTA TEM DE VIR INTEIRA: faltando um, ele ficaria com a ordem antiga no meio da nova, e o
    // seletor passaria a mostrar dois comerciais na mesma posição.
    if (ids.length !== todos.length) {
      throw new BadRequestException(
        "A reordenação precisa da lista completa de comerciais. Recarregue a página e tente de novo.",
      );
    }

    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(asComerciais)
          .set({ ordem: i + 1, atualizadoEm: new Date() })
          .where(eq(asComerciais.id, id));
      }
    });
    this.invalidar();
    return this.listar(true);
  }

  /**
   * ─ TIRA O COMERCIAL DE CIRCULAÇÃO (quem saiu da empresa), e RECUSA quem ainda tem carteira ────
   *
   * A RÉGUA DA ETAPA FANTASMA, HERDADA DO PRECEDENTE DE 10/09 (`EtapasFunilService`, e ela custou
   * uma frente para ser aprendida): inativar um item de catálogo que registro VIVO ainda usa não
   * apaga nada e não falha nada, e é por isso que dói. O cliente continuaria apontando para alguém
   * que sumiu do seletor e da tela de edição: não para de existir, para de ser ALCANÇÁVEL.
   *
   * AQUI ELA TEM UM SEGUNDO SENTIDO, operacional: comercial com carteira viva que sai da empresa
   * deixa clientes SEM DONO, e a recusa força a passagem da carteira antes da saída, que é
   * exatamente o que o diretor precisa que aconteça.
   *
   * NINGUÉM É MOVIDO AUTOMATICAMENTE: "inativar joga a carteira dele em fulano" é irreversível e
   * silencioso, e escreve uma decisão de negócio que ninguém tomou.
   */
  async inativar(id: number): Promise<AsComercialGravado> {
    const atual = await this.exigir(id);
    if (!atual.ativo) return atual;

    await this.exigirComercialSemCarteira(atual.id, "inativar");

    const [atualizado] = await this.db
      .update(asComerciais)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(asComerciais.id, atual.id))
      .returning({
        id: asComerciais.id,
        rotulo: asComerciais.rotulo,
        ordem: asComerciais.ordem,
        ativo: asComerciais.ativo,
      });
    this.invalidar();
    return atualizado;
  }

  /** Volta um comercial inativado à circulação, com o mesmo id e os mesmos cadastros apontando. */
  async reativar(id: number): Promise<AsComercialGravado> {
    const atual = await this.exigir(id);
    if (atual.ativo) return atual;

    const [atualizado] = await this.db
      .update(asComerciais)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(asComerciais.id, atual.id))
      .returning({
        id: asComerciais.id,
        rotulo: asComerciais.rotulo,
        ordem: asComerciais.ordem,
        ativo: asComerciais.ativo,
      });
    this.invalidar();
    return atualizado;
  }

  /**
   * ─ APAGAR DE VERDADE, E SÓ PARA QUEM NUNCA FOI USADO ──────────────────────────────────────────
   *
   * ELE NÃO É O CAMINHO DE "FULANO SAIU DA EMPRESA": esse é o `inativar`, que preserva de quem era
   * cada cliente. ESTE é para o nome digitado errado há dois minutos, e é também a resposta de LGPD
   * certa para ele: a linha cadastrada por engano some de verdade, em vez de ficar para sempre
   * inativada num catálogo, que é retenção sem finalidade.
   *
   * ┌─ A CONTAGEM OLHA AS **DUAS** TABELAS, e o molde só olhava uma (veto da auditoria) ──────────┐
   * │ `LinhasServicoService.remover` conta usos só em `vagas`. O comercial vive em `clientes` E em │
   * │ `vagas`: copiado como estava, apagar quem tem 40 clientes e nenhuma vaga passaria pela trava │
   * │ da aplicação e morreria na FK crua, com um 500 de constraint no lugar da frase.               │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async remover(id: number): Promise<{ removido: true }> {
    const atual = await this.exigir(id);
    await this.exigirComercialSemCarteira(atual.id, "apagar");
    await this.db.delete(asComerciais).where(eq(asComerciais.id, atual.id));
    this.invalidar();
    return { removido: true };
  }

  /**
   * ─ QUEM AINDA APONTA PARA ESTE COMERCIAL, e a contagem tem DUAS pernas por um motivo ──────────
   *
   * ┌─ AS VAGAS CONTADAS SÃO SÓ AS QUE **SOBREPÕEM**, e isso NÃO é o defeito da herança ──────────┐
   * │ `vagas.comercial_id` NULO significa HERDAR do cliente, então a vaga que herda NÃO tem        │
   * │ ponteiro próprio: o ponteiro dela é o do cliente, já contado na primeira perna. Contá-la de  │
   * │ novo INFLARIA o número (um cliente com 40 vagas viraria "1 cliente e 40 vagas") e pediria 40 │
   * │ ações que não existem: passar a carteira DO CLIENTE conserta as 40 de uma vez, porque a      │
   * │ herança é VIVA.                                                                              │
   * │                                                                                              │
   * │ ESTA É A ÚNICA LEITURA LEGÍTIMA DE `vagas.comercial_id` SOZINHO em todo o código: "quais     │
   * │ vagas SOBREPÕEM este comercial". Toda pergunta sobre o comercial EFETIVO da vaga se responde │
   * │ pela expressão resolvida (`coalesce(vaga.x, cliente.x)`), e quem a lê sem o `coalesce` perde │
   * │ a maioria esmagadora das vagas.                                                              │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6, E AQUI A REGRA É MAIS DURA QUE NOS IRMÃOS: a frase devolve NÚMERO e mais nada. Nunca o
   * nome do comercial, nunca `cod_cliente`, nunca razão social, nunca id de vaga. Mensagem de erro
   * vai para log de exceção, e nome de pessoa em log é exatamente o que a §A.6 proíbe.
   */
  private async exigirComercialSemCarteira(
    id: number,
    verbo: "inativar" | "apagar" = "inativar",
  ): Promise<void> {
    const [{ emClientes }] = await this.db
      .select({ emClientes: sql<number>`count(*)::int` })
      .from(clientes)
      .where(eq(clientes.comercialId, id));
    const [{ emVagas }] = await this.db
      .select({ emVagas: sql<number>`count(*)::int` })
      .from(vagas)
      .where(eq(vagas.comercialId, id));

    if (emClientes === 0 && emVagas === 0) return;

    const partes: string[] = [];
    if (emClientes > 0) partes.push(`${emClientes} ${emClientes === 1 ? "cliente" : "clientes"}`);
    if (emVagas > 0) partes.push(`${emVagas} ${emVagas === 1 ? "vaga" : "vagas"}`);

    const sobreposicao =
      emVagas > 0
        ? " As vagas contadas são só as que escolheram este comercial por conta própria; as demais seguem o cliente e se ajustam sozinhas quando ele mudar."
        : "";

    throw new BadRequestException(
      `Este comercial ainda responde por ${partes.join(" e ")}. Passe a carteira para outra pessoa antes de ${verbo}, senão esses cadastros ficariam apontando para alguém fora de circulação.${sobreposicao}`,
    );
  }

  /**
   * O comercial, ou o 404 com a frase certa. Lê do cache, que é a mesma fonte de todo o resto daqui.
   *
   * §A.6: a frase NÃO cita o nome, e nem poderia: quem pede um id que não existe não deve descobrir
   * nada sobre quem existe.
   */
  private async exigir(id: number): Promise<AsComercialGravado> {
    const comercial = (await this.todos()).find((c) => c.id === id);
    if (!comercial) throw new NotFoundException("Comercial não encontrado.");
    return comercial;
  }
}
