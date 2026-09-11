import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { AsMotivoCancelamentoVaga } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { motivosCancelamentoVaga } from "../../db/schema";
import type {
  AtualizarMotivoCancelamentoVagaDto,
  CriarMotivoCancelamentoVagaDto,
} from "./motivos-cancelamento.dto";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE CANCELAMENTO DE VAGA (A&S, onda B1) ────────────────────────────────
 *
 * MOLDE `motivos_declinio`, e não o das etapas do funil: soft-delete por `ativo` (NUNCA exclusão
 * física, NUNCA cascata), 409 anti-colisão de nome, inativar e reativar. Motivo não tem ordem, não
 * tem cor e não tem "inicial", então o molde ordenável custaria um service inteiro por uma lista de
 * nomes.
 *
 * ┌─ O QUE FICA GRAVADO NA VAGA É O NOME, E ISSO MUDA O DESENHO INTEIRO ───────────────────────┐
 * │ A vaga guarda `cancelamento_motivo` como TEXTO, exatamente como já faz com o motivo de      │
 * │ contratação. Por isso inativar aqui NÃO trava vaga nenhuma e não existe `restrict`: a vaga  │
 * │ cancelada em janeiro continua dizendo por que foi cancelada mesmo com o motivo fora de      │
 * │ circulação em março.                                                                        │
 * │                                                                                             │
 * │ E É POR ISSO QUE RENOMEAR NÃO REESCREVE HISTÓRICO, ao contrário das etapas do funil: lá o   │
 * │ código é imutável e o rótulo é resolvido na leitura, então renomear muda o passado inteiro. │
 * │ Aqui, renomear muda só as vagas canceladas DAQUI PARA A FRENTE. É a ferramenta de corrigir  │
 * │ grafia, não a de trocar o significado de um motivo já usado: para trocar o significado,     │
 * │ inativa-se um e cria-se outro.                                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `existeAtivo` É A PORTA QUE O CANCELAMENTO DA VAGA USA. Sem ela, o `motivo` do corpo seria texto
 * livre com aparência de catálogo: a tela ofereceria a lista, e qualquer chamada direta à rota
 * gravaria o que quisesse no campo que a auditoria vai ler depois.
 *
 * §A.6: nome de motivo e um flag. Nenhum dado pessoal em nenhuma das rotas.
 */
/**
 * OS MOTIVOS ATIVOS, EM UMA CONSULTA SÓ, compartilhada entre o catálogo e o CANCELAMENTO DA VAGA.
 *
 * FUNÇÃO DE MÓDULO, e não um método injetado no `VagasService`: o cancelamento precisa da lista para
 * recusar motivo fora de circulação, e injetar o service inteiro por causa de uma leitura mudaria a
 * assinatura de um construtor que código já validado usa (§A.26).
 *
 * A LISTA INTEIRA, E A CONFERÊNCIA EM MEMÓRIA, e não um `select ... where nome = ?`: o catálogo tem
 * dezenas de linhas, a leitura acontece ANTES de abrir a transação do cancelamento (pelo argumento
 * do `fechar`: catálogo pequeno não tem por que ser buscado com a linha da vaga travada), e a mesma
 * consulta serve o seletor da tela e a validação.
 */
export function motivosDeCancelamentoAtivos(db: Database): Promise<AsMotivoCancelamentoVaga[]> {
  return db
    .select({
      id: motivosCancelamentoVaga.id,
      nome: motivosCancelamentoVaga.nome,
      ativo: motivosCancelamentoVaga.ativo,
    })
    .from(motivosCancelamentoVaga)
    .where(eq(motivosCancelamentoVaga.ativo, true))
    .orderBy(asc(motivosCancelamentoVaga.nome));
}

@Injectable()
export class MotivosCancelamentoVagaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tudo, ativos e inativos, para a tela de administração poder reativar o que foi desligado. */
  list(): Promise<AsMotivoCancelamentoVaga[]> {
    return this.db
      .select({
        id: motivosCancelamentoVaga.id,
        nome: motivosCancelamentoVaga.nome,
        ativo: motivosCancelamentoVaga.ativo,
      })
      .from(motivosCancelamentoVaga)
      .orderBy(asc(motivosCancelamentoVaga.nome));
  }

  /**
   * SÓ OS ATIVOS: é o que enche o seletor do modal de cancelamento, e o inativo saiu de circulação.
   *
   * É A MESMA CONSULTA que o cancelamento da vaga usa para RECUSAR motivo fora de circulação, e a
   * coincidência é o desenho: a lista que a tela oferece e a lista que o servidor aceita não podem
   * ser duas, ou a tela oferece o que a rota recusa.
   */
  listarAtivos(): Promise<AsMotivoCancelamentoVaga[]> {
    return motivosDeCancelamentoAtivos(this.db);
  }

  async criar(dto: CriarMotivoCancelamentoVagaDto): Promise<AsMotivoCancelamentoVaga> {
    // O unique do banco é a garantia; este 409 é a FRASE. Sem ele, o cadastro repetido volta como
    // 500 cru do driver, e quem está cadastrando não fica sabendo o que aconteceu.
    const existente = await this.porNome(dto.nome);
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Já existe um motivo de cancelamento com esse nome."
          : "Já existe um motivo de cancelamento com esse nome, hoje inativo. Reative-o em vez de criar outro.",
      );
    }
    const [row] = await this.db
      .insert(motivosCancelamentoVaga)
      .values({ nome: dto.nome })
      .returning({
        id: motivosCancelamentoVaga.id,
        nome: motivosCancelamentoVaga.nome,
        ativo: motivosCancelamentoVaga.ativo,
      });
    return row;
  }

  async atualizar(
    id: string,
    dto: AtualizarMotivoCancelamentoVagaDto,
  ): Promise<AsMotivoCancelamentoVaga> {
    if (dto.nome !== undefined) {
      const existente = await this.porNome(dto.nome);
      if (existente && existente.id !== id) {
        throw new ConflictException("Já existe um motivo de cancelamento com esse nome.");
      }
    }
    const [row] = await this.db
      .update(motivosCancelamentoVaga)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(motivosCancelamentoVaga.id, id))
      .returning({
        id: motivosCancelamentoVaga.id,
        nome: motivosCancelamentoVaga.nome,
        ativo: motivosCancelamentoVaga.ativo,
      });
    if (!row) throw new NotFoundException("Motivo de cancelamento não encontrado.");
    return row;
  }

  /**
   * INATIVA (`ativo=false`). NUNCA exclusão física, NUNCA cascata: as vagas canceladas por este
   * motivo guardam o NOME e não são tocadas. O motivo só sai das opções selecionáveis. Reversível.
   */
  inativar(id: string): Promise<AsMotivoCancelamentoVaga> {
    return this.atualizar(id, { ativo: false });
  }

  /** Reativa (volta às opções selecionáveis), com o mesmo nome e sem tocar em vaga nenhuma. */
  reativar(id: string): Promise<AsMotivoCancelamentoVaga> {
    return this.atualizar(id, { ativo: true });
  }

  private async porNome(nome: string) {
    const [row] = await this.db
      .select({
        id: motivosCancelamentoVaga.id,
        nome: motivosCancelamentoVaga.nome,
        ativo: motivosCancelamentoVaga.ativo,
      })
      .from(motivosCancelamentoVaga)
      .where(eq(motivosCancelamentoVaga.nome, nome))
      .limit(1);
    return row;
  }
}
