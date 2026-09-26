import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { AsMotivoReenvioShortlist } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { motivosReenvioShortlist } from "../../db/schema";
import type {
  AtualizarMotivoReenvioShortlistDto,
  CriarMotivoReenvioShortlistDto,
} from "./motivos-reenvio-shortlist.dto";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE REENVIO DE SHORTLIST (decisão 6 do diretor) ─────────────────────────
 *
 * MOLDE `motivos-descarte` (Frente A, ponto 7), LINHA A LINHA, e a cópia é o pedido: soft-delete por
 * `ativo` (NUNCA exclusão física, NUNCA cascata), 409 anti-colisão de nome com FRASE, inativar e
 * reativar. Motivo não tem ordem, não tem cor e não tem "inicial", então o molde ordenável das
 * etapas do funil custaria um service inteiro por uma lista de nomes.
 *
 * ┌─ O QUE FICA GRAVADO NA SHORTLIST É A **FK**, E NÃO O NOME. A divergência é deliberada ──────┐
 * │ `motivos_descarte` grava o NOME na candidatura, porque o descarte é desfecho de PESSOA e a  │
 * │ pergunta da trilha é "foi este o motivo naquele dia". O reenvio é fato de PROCESSO da vaga, │
 * │ lido em agregado ("quantos reenvios por mudança de perfil?"), e agregado sobre nome digitado│
 * │ é `like` sobre prosa. Por isso aqui há FK, e ela é `restrict`.                               │
 * │                                                                                             │
 * │ CONSEQUÊNCIA QUE MUDA O QUE `atualizar` SIGNIFICA: renomear REESCREVE a leitura histórica.  │
 * │ É a ferramenta de corrigir grafia; trocar o SIGNIFICADO continua sendo inativar um e criar  │
 * │ outro. E INATIVAR não trava shortlist nenhuma: a linha antiga segue apontando para ela.     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `motivosDeReenvioAtivos` É A PORTA QUE O ENVIO DE SHORTLIST USA. Sem ela, o `motivoReenvioId` do
 * corpo continuaria sendo um uuid qualquer com aparência de catálogo: a tela ofereceria a lista, e
 * qualquer chamada direta à rota gravaria o id que quisesse. É o defeito que o descarte já fechou
 * com `motivosDeDescarteAtivos`, e a FK sozinha não o fecha (ela aceita motivo INATIVO).
 *
 * §A.6: nome de motivo e um flag. Nenhum dado pessoal em nenhuma das rotas.
 */
/**
 * OS MOTIVOS ATIVOS, EM UMA CONSULTA SÓ, compartilhada entre o catálogo e o ENVIO da shortlist.
 *
 * FUNÇÃO DE MÓDULO, e não um método injetado no `ShortlistsService`, pela mesma razão medida que
 * levou `motivosDeDescarteAtivos` a ser função: acrescentar uma dependência de construtor por causa
 * de uma LEITURA mudaria a assinatura que specs já validadas usam (§A.26), e não compraria nada.
 *
 * A LISTA INTEIRA, E A CONFERÊNCIA EM MEMÓRIA, e não um `select ... where id = ?`: o catálogo tem
 * poucas linhas, a leitura acontece ANTES da transação do envio, e a MESMA consulta serve o seletor
 * da tela e a validação do servidor. Duas consultas diferentes divergiriam, e a tela passaria a
 * oferecer o que a rota recusa.
 */
export function motivosDeReenvioAtivos(db: Database): Promise<AsMotivoReenvioShortlist[]> {
  return db
    .select({
      id: motivosReenvioShortlist.id,
      nome: motivosReenvioShortlist.nome,
      ativo: motivosReenvioShortlist.ativo,
    })
    .from(motivosReenvioShortlist)
    .where(eq(motivosReenvioShortlist.ativo, true))
    .orderBy(asc(motivosReenvioShortlist.nome));
}

@Injectable()
export class MotivosReenvioShortlistService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tudo, ativos e inativos, para a tela de administração poder reativar o que foi desligado. */
  list(): Promise<AsMotivoReenvioShortlist[]> {
    return this.db
      .select({
        id: motivosReenvioShortlist.id,
        nome: motivosReenvioShortlist.nome,
        ativo: motivosReenvioShortlist.ativo,
      })
      .from(motivosReenvioShortlist)
      .orderBy(asc(motivosReenvioShortlist.nome));
  }

  /**
   * SÓ OS ATIVOS: é o que enche o seletor do reenvio, e o inativo saiu de circulação.
   *
   * É A MESMA CONSULTA que o envio de shortlist usa para RECUSAR motivo fora de circulação, e a
   * coincidência é o desenho: a lista que a tela oferece e a lista que o servidor aceita não podem
   * ser duas.
   */
  listarAtivos(): Promise<AsMotivoReenvioShortlist[]> {
    return motivosDeReenvioAtivos(this.db);
  }

  async criar(dto: CriarMotivoReenvioShortlistDto): Promise<AsMotivoReenvioShortlist> {
    // O unique do banco é a garantia; este 409 é a FRASE. Sem ele, o cadastro repetido volta como
    // 500 cru do driver, e quem está cadastrando não fica sabendo o que aconteceu.
    const existente = await this.porNome(dto.nome);
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Já existe um motivo de reenvio com esse nome."
          : "Já existe um motivo de reenvio com esse nome, hoje inativo. Reative-o em vez de criar outro.",
      );
    }
    const [row] = await this.db
      .insert(motivosReenvioShortlist)
      .values({ nome: dto.nome })
      .returning({
        id: motivosReenvioShortlist.id,
        nome: motivosReenvioShortlist.nome,
        ativo: motivosReenvioShortlist.ativo,
      });
    return row;
  }

  async atualizar(
    id: string,
    dto: AtualizarMotivoReenvioShortlistDto,
  ): Promise<AsMotivoReenvioShortlist> {
    if (dto.nome !== undefined) {
      const existente = await this.porNome(dto.nome);
      if (existente && existente.id !== id) {
        throw new ConflictException("Já existe um motivo de reenvio com esse nome.");
      }
    }
    const [row] = await this.db
      .update(motivosReenvioShortlist)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(motivosReenvioShortlist.id, id))
      .returning({
        id: motivosReenvioShortlist.id,
        nome: motivosReenvioShortlist.nome,
        ativo: motivosReenvioShortlist.ativo,
      });
    if (!row) throw new NotFoundException("Motivo de reenvio não encontrado.");
    return row;
  }

  /**
   * INATIVA (`ativo=false`). NUNCA exclusão física, NUNCA cascata: as shortlists reenviadas por este
   * motivo continuam apontando para a linha, e a FK é `restrict` justamente para que apagar não seja
   * uma opção. O motivo só sai das opções. Reversível.
   */
  inativar(id: string): Promise<AsMotivoReenvioShortlist> {
    return this.atualizar(id, { ativo: false });
  }

  /** Reativa (volta às opções selecionáveis), com o mesmo nome e sem tocar em shortlist nenhuma. */
  reativar(id: string): Promise<AsMotivoReenvioShortlist> {
    return this.atualizar(id, { ativo: true });
  }

  private async porNome(nome: string) {
    const [row] = await this.db
      .select({
        id: motivosReenvioShortlist.id,
        nome: motivosReenvioShortlist.nome,
        ativo: motivosReenvioShortlist.ativo,
      })
      .from(motivosReenvioShortlist)
      .where(eq(motivosReenvioShortlist.nome, nome))
      .limit(1);
    return row;
  }
}
