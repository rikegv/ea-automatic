import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import type { AsSegmento } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { asSegmentos, clientes, vagas } from "../../db/schema";
// A NORMALIZAÇÃO É REUSADA, NÃO REESCRITA: duas normalizações divergem no primeiro acento, e o
// código é o valor que fica gravado para sempre. A mesma função já serve o catálogo do iFractal, o
// das etapas do funil e o das linhas de serviço.
import { codigoDoRotulo } from "../../ifractal/ifractal-status.service";

/**
 * ─ A RÉGUA DA ESCOLHA, PURA, E ELA MORA FORA DA CLASSE DE PROPÓSITO ────────────────────────────
 *
 * DOIS LUGARES PRECISAM DESTA MESMA PERGUNTA: este serviço (a porta do catálogo) e quem GRAVA a
 * escolha, que são DOIS e não um: o `ClientesService` (o segmento do cliente) e o `VagasService`
 * (a sobreposição da vaga). Escrever a régua três vezes é o começo de "um lado aceita o segmento
 * inativo e o outro não", então ela é UMA função, pura, sobre a lista já lida.
 *
 * `null` PASSA, e é o caso MAJORITÁRIO aqui, não a exceção: cliente sem segmento é o estado de
 * partida dos 249, e vaga com segmento nulo é a que HERDA do cliente. Nenhuma régua de obrigatórios
 * cobra a presença destes campos, nem no cliente nem na publicação da vaga.
 *
 * O INATIVO É RECUSADO NA ESCRITA: ele resolve o rótulo do cadastro antigo e não recebe cadastro
 * novo. É a metade da exclusão lógica que o `ativo` sozinho não garante.
 */
export function segmentoEscolhido(segmentos: readonly AsSegmento[], id: number): AsSegmento;
export function segmentoEscolhido(
  segmentos: readonly AsSegmento[],
  id: number | null | undefined,
): AsSegmento | null;
export function segmentoEscolhido(
  segmentos: readonly AsSegmento[],
  id: number | null | undefined,
): AsSegmento | null {
  if (id === null || id === undefined) return null;
  const segmento = segmentos.find((s) => s.id === id);
  if (!segmento) {
    throw new BadRequestException("Este segmento não existe. Recarregue a página.");
  }
  if (!segmento.ativo) {
    throw new BadRequestException(
      `O segmento "${segmento.rotulo}" foi desativado e não recebe cadastros novos. Escolha outro.`,
    );
  }
  return segmento;
}

/**
 * ─ O CATÁLOGO DE SEGMENTOS (o RAMO do cliente). A LISTA É DO DIRETOR ───────────────────────────
 *
 * ESTE SERVIÇO É A ÚNICA PORTA DE ESCRITA do catálogo, e é isso que torna o cache abaixo correto.
 *
 * ┌─ ELE NÃO É A "SEGMENTAÇÃO DE ÁREA" DO RBAC, e esta é a colisão mais cara do repositório ──────┐
 * │ `docs/ARQUITETURA-SEGMENTACAO-AREA.md` descreve um mecanismo de PERMISSÃO (o teto do MASTER   │
 * │ sobre a área dele). Isto aqui é o RAMO DE NEGÓCIO do cliente: Varejo, Saúde, Indústria. Não   │
 * │ se tocam. Nada neste arquivo lê `Area`, menu ou papel.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELE GARANTE, e por que cada garantia mora aqui e não na tela ──────────────────────────┐
 * │ 1. O CÓDIGO É IMUTÁVEL. Derivado do rótulo na criação, nunca reescrito.                       │
 * │ 2. NÃO SE INATIVA SEGMENTO EM USO. É a régua da ETAPA FANTASMA (precedente de 10/09), e o     │
 * │    porquê está inteiro em `exigirSegmentoSemUso`.                                             │
 * │ 3. NÃO EXISTE APAGAR. A OST pediu criar, renomear, reordenar, inativar e reativar, e mais     │
 * │    nada (§A.14). Quem tentar pelo banco esbarra na FK RESTRICT das quatro colunas.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE NÃO FOI COPIADO DO MOLDE, e a diferença é de REGRA, não de descuido: `LinhasServicoService`
 * recusa inativar a ÚLTIMA ATIVA, porque a linha de serviço é OBRIGATÓRIA para publicar vaga e um
 * catálogo vazio trancaria a abertura inteira. SEGMENTO NÃO É OBRIGATÓRIO em lugar nenhum: nem no
 * cliente, nem na vaga, nem na publicação. Catálogo de segmentos vazio é estado válido (é como ele
 * NASCE, aliás), então copiar aquela trava criaria uma proibição que nada justifica.
 *
 * §A.6: código, rótulo, ordem e um booleano. Nenhum dado pessoal passa por este arquivo, e as
 * contagens que ele faz sobre clientes e vagas devolvem NÚMERO, nunca `cod_cliente` e nunca id.
 */
@Injectable()
export class SegmentosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * ─ O CACHE, e por que ele é seguro AQUI ───────────────────────────────────────────────────────
   *
   * O CATÁLOGO É CURTO E MUDA RARAMENTE, e é lido na listagem da Central de Vagas (para resolver o
   * rótulo de toda vaga), na tela de clientes e nos dois seletores. A INVALIDAÇÃO É CONFIÁVEL
   * PORQUE A PORTA DE ESCRITA É UMA SÓ: toda mutação passa por um método desta classe e chama
   * `invalidar()`. O TTL curto é rede de segurança para o caminho que a aplicação não vê (um
   * `UPDATE` por SQL cru, uma segunda instância do processo), não a régua principal.
   *
   * É a mesma decisão, com a mesma justificativa, do `LinhasServicoService` e do `EtapasFunilService`.
   */
  private cache: { em: number; segmentos: AsSegmento[] } | null = null;
  private static readonly TTL_MS = 60_000;

  private invalidar(): void {
    this.cache = null;
  }

  /** TODOS os segmentos, ativos e inativos, na ordem do catálogo. É a base de tudo que se lê daqui. */
  private async todos(): Promise<AsSegmento[]> {
    const agora = Date.now();
    if (this.cache && agora - this.cache.em < SegmentosService.TTL_MS) return this.cache.segmentos;

    const segmentos = await this.db
      .select({
        id: asSegmentos.id,
        codigo: asSegmentos.codigo,
        rotulo: asSegmentos.rotulo,
        ordem: asSegmentos.ordem,
        ativo: asSegmentos.ativo,
      })
      .from(asSegmentos)
      // O DESEMPATE POR `id` NÃO É DETALHE: sem ele, dois segmentos com a mesma `ordem` trocam de
      // lugar a cada consulta, e o seletor muda de ordem a cada F5.
      .orderBy(asc(asSegmentos.ordem), asc(asSegmentos.id));

    this.cache = { em: agora, segmentos };
    return segmentos;
  }

  /**
   * A LISTA que a leitura devolve. ATIVOS por padrão; `incluirInativos` existe para o HISTÓRICO: o
   * cliente cadastrado no segmento que saiu de circulação precisa do rótulo dele, senão a tela passa
   * a mostrar o código cru (ou, pior, um vazio).
   */
  async listar(incluirInativos = false): Promise<AsSegmento[]> {
    const todos = await this.todos();
    return incluirInativos ? todos : todos.filter((s) => s.ativo);
  }

  /**
   * A VALIDAÇÃO DA ESCOLHA, no mesmo desenho do `exigirLinhaAtiva`.
   *
   * ELA NÃO PODE SER UM `@IsIn` DO DTO: a lista é catálogo do diretor, e um `@IsIn` sobre a lista de
   * ontem recusaria o segmento que ele criou hoje.
   *
   * ┌─ `null` SÓ PODE SIGNIFICAR "O USUÁRIO NÃO ESCOLHEU", E NUNCA "O QUE ELE ESCOLHEU NÃO VALE" ─┐
   * │ Repare no que NÃO está escrito aqui: o molde (`resolverLinhaServico`) termina em             │
   * │ `?.id ?? null`, e aquele `?? null` é inofensivo lá porque nulo, na linha de serviço, quer     │
   * │ dizer "em branco". AQUI NULO QUER DIZER **HERDAR DO CLIENTE**, então coagir um id inválido    │
   * │ ou inativo para nulo transformaria o erro em HERANÇA SILENCIOSA: o consultor escolhe "Saúde", │
   * │ salva, e a tela volta mostrando o segmento do cliente. Ele conclui que não salvou e tenta de  │
   * │ novo, para sempre. É a etapa fantasma entrando pela outra porta.                              │
   * │                                                                                               │
   * │ A SOBRECARGA ACIMA DEIXA ISSO NO TIPO, e não só no comentário: com `id: number`, o retorno é  │
   * │ `AsSegmento`, nunca `AsSegmento | null`, então não há o que coagir. Id inválido ou inativo    │
   * │ LANÇA, dentro de `segmentoEscolhido`.                                                          │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async exigirSegmentoAtivo(id: number | null | undefined): Promise<number | null> {
    if (id === null || id === undefined) return null;
    return segmentoEscolhido(await this.listar(true), id).id;
  }

  // ── ESCRITA ───────────────────────────────────────────────────────────────

  /**
   * CRIAR, e os DOIS casos que fariam isto virar 500 se ninguém pensasse neles.
   *
   * 1. RECRIAR UM SEGMENTO INATIVADO. O código é derivado do rótulo, então digitar "Varejo" de novo
   *    produz `VAREJO`, que continua na tabela (inativado, segurando o rótulo dos cadastros
   *    antigos). Um `INSERT` direto estouraria o unique e a tela mostraria erro de banco. A recusa
   *    diz o que fazer ("Reative-o") e NÃO reativa sozinha: reativar traz de volta à circulação algo
   *    que alguém tirou de propósito, e isso é decisão de quem opera, não efeito colateral de ter
   *    digitado um nome parecido.
   *
   * 2. DOIS NOMES DIFERENTES QUE GERAM O MESMO CÓDIGO. A normalização tira acento, sobe para
   *    maiúsculas e CORTA EM 40 CARACTERES, então "Saúde" e "Saude" são o mesmo código, e dois nomes
   *    longos que só divergem depois do 40º caractere também. O molde respondia a esse caso com "já
   *    existe com esse nome", que é FALSO e manda a pessoa procurar um nome que ela não vai achar.
   *    Aqui a frase diz QUAL cadastro colidiu, e é ela que torna o problema resolvível.
   */
  async criar(dto: { rotulo: string }): Promise<AsSegmento> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome do segmento.");

    const codigo = codigoDoRotulo(rotulo);
    if (!codigo) throw new BadRequestException("O nome precisa ter ao menos uma letra ou número.");

    const existente = (await this.listar(true)).find((s) => s.codigo === codigo);
    if (existente) throw this.recusaDeCodigoRepetido(existente, rotulo);

    // NASCE NO FIM DA LISTA. Quem quiser no meio reordena depois, e reordenar é uma operação só,
    // atômica, em vez de um "inserir na posição N" que reescreveria a fila inteira na criação.
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${asSegmentos.ordem}), 0)::int` })
      .from(asSegmentos);

    try {
      const [criado] = await this.db
        .insert(asSegmentos)
        .values({ codigo, rotulo, ordem: max + 1, ativo: true })
        .returning({
          id: asSegmentos.id,
          codigo: asSegmentos.codigo,
          rotulo: asSegmentos.rotulo,
          ordem: asSegmentos.ordem,
          ativo: asSegmentos.ativo,
        });
      this.invalidar();
      return criado;
    } catch {
      // A CORRIDA: dois cliques ao mesmo tempo passam os dois pela consulta acima. O unique do banco
      // é quem decide, e a frase que chega na tela é a mesma da checagem otimista.
      this.invalidar();
      throw new BadRequestException("Já existe um segmento com esse nome.");
    }
  }

  /**
   * RENOMEAR. O CÓDIGO NÃO MUDA, e é isso que faz todo cliente e toda vaga que já apontam para este
   * segmento passarem a exibir o nome corrigido: é o MESMO segmento, com o nome certo.
   */
  async renomear(id: number, dto: { rotulo: string }): Promise<AsSegmento> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome do segmento.");

    const atual = await this.exigir(id);
    const [atualizado] = await this.db
      .update(asSegmentos)
      .set({ rotulo, atualizadoEm: new Date() })
      .where(eq(asSegmentos.id, atual.id))
      .returning({
        id: asSegmentos.id,
        codigo: asSegmentos.codigo,
        rotulo: asSegmentos.rotulo,
        ordem: asSegmentos.ordem,
        ativo: asSegmentos.ativo,
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
  async reordenar(ids: number[]): Promise<AsSegmento[]> {
    const todos = await this.todos();
    const conhecidos = new Set(todos.map((s) => s.id));

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("A ordem enviada tem segmentos repetidos. Recarregue a página.");
    }
    const desconhecido = ids.find((id) => !conhecidos.has(id));
    if (desconhecido !== undefined) {
      throw new BadRequestException("A lista enviada tem um segmento que não existe. Recarregue a página.");
    }
    // A LISTA TEM DE VIR INTEIRA: faltando um, ele ficaria com a ordem antiga no meio da nova, e o
    // seletor passaria a mostrar dois segmentos na mesma posição.
    if (ids.length !== todos.length) {
      throw new BadRequestException(
        "A reordenação precisa da lista completa de segmentos. Recarregue a página e tente de novo.",
      );
    }

    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(asSegmentos)
          .set({ ordem: i + 1, atualizadoEm: new Date() })
          .where(eq(asSegmentos.id, id));
      }
    });
    this.invalidar();
    return this.listar(true);
  }

  /**
   * ─ TIRA O SEGMENTO DE CIRCULAÇÃO, e RECUSA quando alguém ainda aponta para ele ────────────────
   *
   * A RÉGUA DA ETAPA FANTASMA, HERDADA DO PRECEDENTE DE 10/09 (`EtapasFunilService`, e ela custou
   * uma frente para ser aprendida): inativar um item de catálogo que registro VIVO ainda usa não
   * apaga nada e não falha nada, e é justamente por isso que dói. O cliente continua apontando para
   * um segmento que sumiu do seletor, do filtro e da tela de edição: ele não para de existir, para
   * de ser ALCANÇÁVEL, e ninguém descobre porque nada quebra.
   *
   * NINGUÉM É MOVIDO AUTOMATICAMENTE. "Inativar Varejo joga todo mundo em Outros" é irreversível,
   * silencioso e escreve no cadastro de terceiros uma decisão que ninguém tomou.
   */
  async inativar(id: number): Promise<AsSegmento> {
    const atual = await this.exigir(id);
    if (!atual.ativo) return atual;

    await this.exigirSegmentoSemUso(atual.id, "inativar");

    const [atualizado] = await this.db
      .update(asSegmentos)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(asSegmentos.id, atual.id))
      .returning({
        id: asSegmentos.id,
        codigo: asSegmentos.codigo,
        rotulo: asSegmentos.rotulo,
        ordem: asSegmentos.ordem,
        ativo: asSegmentos.ativo,
      });
    this.invalidar();
    return atualizado;
  }

  /** Volta um segmento inativado à circulação, com o mesmo código e os mesmos cadastros apontando. */
  async reativar(id: number): Promise<AsSegmento> {
    const atual = await this.exigir(id);
    if (atual.ativo) return atual;

    const [atualizado] = await this.db
      .update(asSegmentos)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(asSegmentos.id, atual.id))
      .returning({
        id: asSegmentos.id,
        codigo: asSegmentos.codigo,
        rotulo: asSegmentos.rotulo,
        ordem: asSegmentos.ordem,
        ativo: asSegmentos.ativo,
      });
    this.invalidar();
    return atualizado;
  }

  /**
   * ─ APAGAR DE VERDADE, E SÓ PARA QUEM NUNCA FOI USADO ──────────────────────────────────────────
   *
   * ┌─ A CONTAGEM OLHA AS **DUAS** TABELAS, e o molde só olhava uma (veto da auditoria) ──────────┐
   * │ `LinhasServicoService.remover` conta usos só em `vagas`, porque a linha de serviço só vive   │
   * │ na vaga. O SEGMENTO vive em `clientes` **E** em `vagas`. Copiado como estava, apagar um      │
   * │ segmento usado por 40 clientes e por nenhuma vaga PASSARIA pela trava da aplicação e morreria│
   * │ na FK crua: o usuário receberia um 500 de constraint, sem frase, sem número e sem o caminho  │
   * │ alternativo, num erro que parece defeito do sistema.                                          │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * DUAS CAMADAS, na ordem em que doem menos: primeiro a CONTAGEM, que dá a frase boa (com o
   * número, sem dizer QUAIS: §A.6) e o caminho alternativo, que é inativar; depois a FK RESTRICT do
   * banco, que vale mesmo para quem não passa pela aplicação.
   *
   * NÃO EXISTE "APAGAR ASSIM MESMO". Apagar um segmento em uso apagaria a resposta de "de que ramo
   * era aquele cliente", que é justamente o dado que o diretor vai usar para medir a carteira.
   */
  async remover(id: number): Promise<{ removido: true }> {
    const atual = await this.exigir(id);
    await this.exigirSegmentoSemUso(atual.id, "apagar");
    await this.db.delete(asSegmentos).where(eq(asSegmentos.id, atual.id));
    this.invalidar();
    return { removido: true };
  }

  /**
   * ─ QUEM AINDA APONTA PARA ESTE SEGMENTO, e a contagem tem DUAS pernas por um motivo ───────────
   *
   * ┌─ AS VAGAS CONTADAS SÃO SÓ AS QUE **SOBREPÕEM**, e isso NÃO é o defeito da herança ──────────┐
   * │ `vagas.segmento_id` NULO significa HERDAR do cliente, então a vaga que herda NÃO tem         │
   * │ ponteiro próprio: o ponteiro dela é o do cliente, que já está contado na primeira perna.     │
   * │ Contá-la de novo aqui INFLARIA o número (um cliente com 40 vagas viraria "1 cliente e 40     │
   * │ vagas") e pediria 40 ações que não existem: trocar o segmento DO CLIENTE conserta as 40 de   │
   * │ uma vez, porque a herança é VIVA.                                                            │
   * │                                                                                              │
   * │ ESTA É A ÚNICA LEITURA LEGÍTIMA DE `vagas.segmento_id` SOZINHO em todo o código: "quais      │
   * │ vagas SOBREPÕEM este segmento". Toda pergunta sobre o segmento EFETIVO da vaga se responde   │
   * │ pela expressão resolvida (`coalesce(vaga.x, cliente.x)`), nunca por esta coluna crua, e      │
   * │ quem a lê sem o `coalesce` perde a maioria esmagadora das vagas.                             │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A FRASE DIZ QUANTOS E ONDE porque é isso que transforma a recusa em trabalho executável: sem o
   * "onde", a pessoa não sabe em qual das duas telas procurar.
   *
   * §A.6: devolve NÚMERO. Nunca `cod_cliente`, nunca razão social, nunca id de vaga.
   */
  private async exigirSegmentoSemUso(id: number, verbo: "inativar" | "apagar" = "inativar"): Promise<void> {
    const [{ emClientes }] = await this.db
      .select({ emClientes: sql<number>`count(*)::int` })
      .from(clientes)
      .where(eq(clientes.segmentoId, id));
    const [{ emVagas }] = await this.db
      .select({ emVagas: sql<number>`count(*)::int` })
      .from(vagas)
      .where(eq(vagas.segmentoId, id));

    if (emClientes === 0 && emVagas === 0) return;

    const partes: string[] = [];
    if (emClientes > 0) partes.push(`${emClientes} ${emClientes === 1 ? "cliente" : "clientes"}`);
    if (emVagas > 0) partes.push(`${emVagas} ${emVagas === 1 ? "vaga" : "vagas"}`);

    const sobreposicao =
      emVagas > 0
        ? " As vagas contadas são só as que escolheram este segmento por conta própria; as demais seguem o cliente e se ajustam sozinhas quando ele mudar."
        : "";

    throw new BadRequestException(
      `Este segmento ainda está em uso por ${partes.join(" e ")}. Troque o segmento nesses cadastros antes de ${verbo}, senão eles ficariam apontando para um segmento fora de circulação.${sobreposicao}`,
    );
  }

  /**
   * A RECUSA DO CÓDIGO REPETIDO, e ela distingue os dois casos porque a AÇÃO é diferente em cada um:
   * no primeiro a pessoa REATIVA o que já existe, no segundo ela AJUSTA o nome que está digitando.
   */
  private recusaDeCodigoRepetido(existente: AsSegmento, digitado: string): BadRequestException {
    if (existente.rotulo.toLowerCase() === digitado.toLowerCase()) {
      return existente.ativo
        ? new BadRequestException("Já existe um segmento com esse nome.")
        : new BadRequestException(
            `Existe um segmento inativo com este nome ("${existente.rotulo}"). Reative-o em vez de criar outro, para os cadastros que apontam para ele continuarem apontando para o mesmo segmento.`,
          );
    }
    return new BadRequestException(
      `O segmento "${existente.rotulo}" já ocupa o código interno que este nome geraria. Diferencie o nome: o código ignora acentos e maiúsculas.`,
    );
  }

  /** O segmento, ou o 404 com a frase certa. Lê do cache, que é a mesma fonte de todo o resto daqui. */
  private async exigir(id: number): Promise<AsSegmento> {
    const segmento = (await this.todos()).find((s) => s.id === id);
    if (!segmento) throw new NotFoundException("Segmento não encontrado.");
    return segmento;
  }
}
