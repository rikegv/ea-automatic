import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import type { AsLinhaDeServico } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { asLinhasServico, vagas } from "../../db/schema";
// A NORMALIZAÇÃO É REUSADA, NÃO REESCRITA: duas normalizações divergem no primeiro acento, e o
// código é o valor que fica gravado para sempre. A mesma função já serve o catálogo do iFractal e o
// das etapas do funil.
import { codigoDoRotulo } from "../../ifractal/ifractal-status.service";

/**
 * ─ A RÉGUA DA ESCOLHA, PURA, E ELA MORA FORA DA CLASSE DE PROPÓSITO ────────────────────────────
 *
 * DOIS LUGARES PRECISAM DESTA MESMA PERGUNTA: este serviço (a porta do catálogo) e o `VagasService`
 * (que grava a escolha na vaga e lê a tabela direto, sem depender desta classe). Escrever a régua
 * duas vezes é o começo de "um lado aceita a linha inativa e o outro não", então ela é UMA função,
 * pura, sobre a lista já lida.
 *
 * `null` PASSA, e isso é o RASCUNHO: a vaga salva pela metade pode ainda não ter linha escolhida.
 * Quem cobra a PRESENÇA é a régua dos obrigatórios, na publicação, e não esta função.
 *
 * A INATIVA É RECUSADA: ela resolve o rótulo de vaga antiga e não recebe vaga nova.
 */
export function linhaDeServicoEscolhida(
  linhas: readonly AsLinhaDeServico[],
  id: number | null | undefined,
): AsLinhaDeServico | null {
  if (id === null || id === undefined) return null;
  const linha = linhas.find((l) => l.id === id);
  if (!linha) {
    throw new BadRequestException("Esta linha de serviço não existe. Recarregue a página.");
  }
  if (!linha.ativo) {
    throw new BadRequestException(
      `A linha de serviço "${linha.rotulo}" foi desativada e não recebe vagas novas. Escolha outra.`,
    );
  }
  return linha;
}

/**
 * ─ O CATÁLOGO DAS LINHAS DE SERVIÇO (A&S). A LISTA É DO DIRETOR ─────────────────────────────────
 *
 * ESTE SERVIÇO É A ÚNICA PORTA DE ESCRITA do catálogo, e é isso que torna o cache abaixo correto.
 *
 * ┌─ ELE NÃO É O "PROJETO" DO ALTO VOLUME, e a colisão de nome é real ────────────────────────────┐
 * │ `projetos_alto_volume` guarda EVENTOS ("BIENAL DOS LIVROS", "BF"), campanhas com data dentro  │
 * │ da operação de alto volume. Este guarda a LINHA DE SERVIÇO da vaga (Pontuais & Estratégicas,  │
 * │ RPO & BPO, Alto Volume, SouFast, OneShot), que é outro eixo: uma vaga da linha "Alto Volume"  │
 * │ pode ou não pertencer a um evento de alto volume. Nada aqui encosta naquela tabela.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELE GARANTE, e por que cada garantia mora aqui e não na tela ──────────────────────────┐
 * │ 1. O CÓDIGO É IMUTÁVEL. Derivado do rótulo na criação, nunca reescrito.                       │
 * │ 2. NUNCA SE FICA SEM LINHA ATIVA. A linha de serviço é OBRIGATÓRIA na abertura, então um      │
 * │    catálogo sem nenhuma ativa trancaria a publicação de toda vaga nova.                        │
 * │ 3. APAGAR SÓ VALE PARA QUEM NUNCA FOI USADA. A FK RESTRICT recusaria de qualquer forma; aqui  │
 * │    a recusa vem com a frase que diz o que fazer no lugar.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: código, rótulo, ordem e um booleano. Nenhum dado pessoal passa por este arquivo; a contagem
 * que ele faz sobre vagas devolve NÚMERO, nunca id e nunca candidato.
 */
@Injectable()
export class LinhasServicoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * ─ O CACHE, e por que ele é seguro AQUI ───────────────────────────────────────────────────────
   *
   * O CATÁLOGO TEM CINCO LINHAS E MUDA UMA VEZ POR SEMESTRE, e é lido na abertura de toda vaga e em
   * toda listagem da Central de Vagas (para resolver o rótulo). A INVALIDAÇÃO É CONFIÁVEL PORQUE A
   * PORTA DE ESCRITA É UMA SÓ: toda mutação passa por um método desta classe e chama `invalidar()`.
   * O TTL curto é rede de segurança para o caminho que a aplicação não vê (um `UPDATE` por SQL cru,
   * uma segunda instância do processo), não a régua principal.
   *
   * É a mesma decisão, com a mesma justificativa, do `EtapasFunilService`.
   */
  private cache: { em: number; linhas: AsLinhaDeServico[] } | null = null;
  private static readonly TTL_MS = 60_000;

  private invalidar(): void {
    this.cache = null;
  }

  /** TODAS as linhas, ativas e inativas, na ordem do catálogo. É a base de tudo que se lê daqui. */
  private async todas(): Promise<AsLinhaDeServico[]> {
    const agora = Date.now();
    if (this.cache && agora - this.cache.em < LinhasServicoService.TTL_MS) return this.cache.linhas;

    const linhas = await this.db
      .select({
        id: asLinhasServico.id,
        codigo: asLinhasServico.codigo,
        rotulo: asLinhasServico.rotulo,
        ordem: asLinhasServico.ordem,
        ativo: asLinhasServico.ativo,
      })
      .from(asLinhasServico)
      // O DESEMPATE POR `id` NÃO É DETALHE: sem ele, duas linhas com a mesma `ordem` trocam de lugar
      // a cada consulta, e o seletor da abertura muda de ordem a cada F5.
      .orderBy(asc(asLinhasServico.ordem), asc(asLinhasServico.id));

    this.cache = { em: agora, linhas };
    return linhas;
  }

  /**
   * A LISTA que a leitura devolve. ATIVAS por padrão; `incluirInativas` existe para o HISTÓRICO: a
   * vaga do ano passado precisa do rótulo da linha que saiu de circulação, senão a ficha dela passa
   * a mostrar o código cru (ou, pior, um vazio).
   */
  async listar(incluirInativas = false): Promise<AsLinhaDeServico[]> {
    const todas = await this.todas();
    return incluirInativas ? todas : todas.filter((l) => l.ativo);
  }

  /** `id -> rótulo`, incluindo as INATIVAS, para a listagem resolver o nome sem um join por linha. */
  async rotuloPorId(): Promise<ReadonlyMap<number, string>> {
    return new Map((await this.todas()).map((l) => [l.id, l.rotulo]));
  }

  /**
   * A VALIDAÇÃO DA ESCOLHA, no mesmo desenho do `exigirEtapaAtiva`.
   *
   * ELA NÃO PODE SER UM `@IsIn` DO DTO: a lista deixou de ser estática no dia em que virou catálogo,
   * e um `@IsIn` sobre a lista de ontem recusaria a linha que o diretor criou hoje.
   *
   * RECUSA A INATIVA TAMBÉM: ela resolve rótulo de vaga antiga e não recebe vaga nova.
   *
   * `null` PASSA, e isso é o rascunho: a vaga salva pela metade pode ainda não ter a linha escolhida.
   * Quem cobra a PRESENÇA é a régua dos obrigatórios, na publicação, e não esta função.
   */
  async exigirLinhaAtiva(id: number | null | undefined): Promise<number | null> {
    return linhaDeServicoEscolhida(await this.listar(true), id)?.id ?? null;
  }

  // ── ESCRITA ───────────────────────────────────────────────────────────────

  /**
   * CRIAR, e o caso que faria isto virar 500 se ninguém pensasse nele: RECRIAR UMA LINHA INATIVADA.
   *
   * O CÓDIGO É DERIVADO DO RÓTULO, então digitar "SouFast" de novo produz `SOUFAST`, que continua
   * existindo na tabela (inativado, segurando o rótulo das vagas antigas). Um `INSERT` direto
   * estouraria o unique e a tela mostraria erro de banco.
   *
   * A RECUSA DIZ O QUE FAZER ("Reative-a"), e NÃO reativa sozinha: reativar traz de volta à
   * circulação uma linha que alguém tirou de propósito, e essa é decisão de quem opera, não efeito
   * colateral de ter digitado um nome parecido.
   */
  async criar(dto: { rotulo: string }): Promise<AsLinhaDeServico> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome da linha de serviço.");

    const codigo = codigoDoRotulo(rotulo);
    if (!codigo) throw new BadRequestException("O nome precisa ter ao menos uma letra ou número.");

    const existente = (await this.listar(true)).find((l) => l.codigo === codigo);
    if (existente?.ativo) throw new BadRequestException("Já existe uma linha de serviço com esse nome.");
    if (existente) {
      throw new BadRequestException(
        `Existe uma linha de serviço inativa com este nome ("${existente.rotulo}"). Reative-a em vez de criar outra, para as vagas que apontam para ela continuarem apontando para a mesma linha.`,
      );
    }

    // NASCE NO FIM DA LISTA. Quem quiser no meio reordena depois, e reordenar é uma operação só,
    // atômica, em vez de um "inserir na posição N" que reescreveria a fila inteira na criação.
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${asLinhasServico.ordem}), 0)::int` })
      .from(asLinhasServico);

    try {
      const [criada] = await this.db
        .insert(asLinhasServico)
        .values({ codigo, rotulo, ordem: max + 1, ativo: true })
        .returning({
          id: asLinhasServico.id,
          codigo: asLinhasServico.codigo,
          rotulo: asLinhasServico.rotulo,
          ordem: asLinhasServico.ordem,
          ativo: asLinhasServico.ativo,
        });
      this.invalidar();
      return criada;
    } catch {
      // A CORRIDA: dois cliques ao mesmo tempo passam os dois pela consulta acima. O unique do banco
      // é quem decide, e a frase que chega na tela é a mesma da checagem otimista.
      this.invalidar();
      throw new BadRequestException("Já existe uma linha de serviço com esse nome.");
    }
  }

  /**
   * RENOMEAR. O CÓDIGO NÃO MUDA, e é isso que faz toda vaga que já aponta para esta linha passar a
   * exibir o nome corrigido: é a MESMA linha, com o nome certo.
   */
  async renomear(id: number, dto: { rotulo: string }): Promise<AsLinhaDeServico> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome da linha de serviço.");

    const atual = await this.exigir(id);
    const [atualizada] = await this.db
      .update(asLinhasServico)
      .set({ rotulo, atualizadoEm: new Date() })
      .where(eq(asLinhasServico.id, atual.id))
      .returning({
        id: asLinhasServico.id,
        codigo: asLinhasServico.codigo,
        rotulo: asLinhasServico.rotulo,
        ordem: asLinhasServico.ordem,
        ativo: asLinhasServico.ativo,
      });
    this.invalidar();
    return atualizada;
  }

  /**
   * A ORDEM DO SELETOR. Recebe a lista COMPLETA de ids na ordem nova e reescreve `1..N`.
   *
   * NÃO É "SOBE/DESCE" COM TROCA DE PARES de propósito: dois cliques rápidos produzem ordem
   * duplicada, e a colisão só aparece na tela do outro. A autoridade é a reescrita completa, numa
   * transação, e é por isso que a lista precisa vir INTEIRA.
   */
  async reordenar(ids: number[]): Promise<AsLinhaDeServico[]> {
    const todas = await this.todas();
    const conhecidos = new Set(todas.map((l) => l.id));
    const desconhecido = ids.find((id) => !conhecidos.has(id));
    if (desconhecido !== undefined) {
      throw new BadRequestException("A lista enviada tem uma linha de serviço que não existe. Recarregue a página.");
    }
    // A LISTA TEM DE VIR INTEIRA: faltando uma, ela ficaria com a ordem antiga no meio da nova, e o
    // seletor passaria a mostrar duas linhas na mesma posição.
    if (ids.length !== todas.length) {
      throw new BadRequestException(
        "A reordenação precisa da lista completa de linhas de serviço. Recarregue a página e tente de novo.",
      );
    }

    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(asLinhasServico)
          .set({ ordem: i + 1, atualizadoEm: new Date() })
          .where(eq(asLinhasServico.id, id));
      }
    });
    this.invalidar();
    return this.listar(true);
  }

  /**
   * TIRA A LINHA DE CIRCULAÇÃO, sem apagar nada. É a contraparte do `reativar`.
   *
   * A TRAVA: NÃO PODE SOBRAR ZERO ATIVA. A linha de serviço é OBRIGATÓRIA na abertura, então um
   * catálogo vazio trancaria a publicação de toda vaga nova, e o time descobriria isso no meio de
   * uma abertura, não aqui.
   */
  async inativar(id: number): Promise<AsLinhaDeServico> {
    const atual = await this.exigir(id);
    if (!atual.ativo) return atual;

    const ativas = (await this.listar()).length;
    if (ativas <= 1) {
      throw new BadRequestException(
        "Esta é a última linha de serviço ativa. Toda vaga precisa de uma para ser publicada, então crie ou reative outra antes de desativar esta.",
      );
    }

    const [atualizada] = await this.db
      .update(asLinhasServico)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(asLinhasServico.id, atual.id))
      .returning({
        id: asLinhasServico.id,
        codigo: asLinhasServico.codigo,
        rotulo: asLinhasServico.rotulo,
        ordem: asLinhasServico.ordem,
        ativo: asLinhasServico.ativo,
      });
    this.invalidar();
    return atualizada;
  }

  /** Volta uma linha inativada à circulação, com o mesmo código e as mesmas vagas apontando. */
  async reativar(id: number): Promise<AsLinhaDeServico> {
    const atual = await this.exigir(id);
    if (atual.ativo) return atual;

    const [atualizada] = await this.db
      .update(asLinhasServico)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(asLinhasServico.id, atual.id))
      .returning({
        id: asLinhasServico.id,
        codigo: asLinhasServico.codigo,
        rotulo: asLinhasServico.rotulo,
        ordem: asLinhasServico.ordem,
        ativo: asLinhasServico.ativo,
      });
    this.invalidar();
    return atualizada;
  }

  /**
   * APAGAR DE VERDADE, e só para quem NUNCA FOI USADA.
   *
   * DUAS CAMADAS, na ordem em que doem menos. A primeira é a CONTAGEM DE VAGAS, que dá a frase boa
   * (com o número, sem dizer QUAIS vagas: §A.6) e o caminho alternativo, que é inativar. A segunda é
   * a FK RESTRICT do banco, que vale mesmo quando ninguém passa pela aplicação.
   *
   * NÃO EXISTE "APAGAR ASSIM MESMO". Apagar uma linha usada apagaria a resposta de "de que linha era
   * aquela vaga", que é justamente o dado que o diretor vai usar para medir a operação por linha.
   */
  async remover(id: number): Promise<{ removida: true }> {
    const atual = await this.exigir(id);

    const [{ usos }] = await this.db
      .select({ usos: sql<number>`count(*)::int` })
      .from(vagas)
      .where(eq(vagas.linhaServicoId, atual.id));

    if (usos > 0) {
      throw new BadRequestException(
        `A linha de serviço "${atual.rotulo}" já está em ${usos} ${usos === 1 ? "vaga" : "vagas"} e não pode ser apagada, senão essas vagas perderiam o registro de qual linha eram. Desative-a: ela some do seletor da abertura e continua respondendo pelas vagas antigas.`,
      );
    }

    const ativas = (await this.listar()).length;
    if (atual.ativo && ativas <= 1) {
      throw new BadRequestException(
        "Esta é a última linha de serviço ativa. Toda vaga precisa de uma para ser publicada, então crie outra antes de apagar esta.",
      );
    }

    await this.db.delete(asLinhasServico).where(eq(asLinhasServico.id, atual.id));
    this.invalidar();
    return { removida: true };
  }

  /** A linha, ou o 404 com a frase certa. Lê do cache, que é a mesma fonte de todo o resto daqui. */
  private async exigir(id: number): Promise<AsLinhaDeServico> {
    const linha = (await this.todas()).find((l) => l.id === id);
    if (!linha) throw new NotFoundException("Linha de serviço não encontrada.");
    return linha;
  }

}
