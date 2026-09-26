import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { AsMotivoDescarte } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { motivosDescarte } from "../../db/schema";
import type {
  AtualizarMotivoDescarteDto,
  CriarMotivoDescarteDto,
} from "./motivos-descarte.dto";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE DESCARTE DO CANDIDATO (Central de Vagas, Frente A, ponto 7) ─────────
 *
 * MOLDE `motivos-cancelamento`, LINHA A LINHA, e a cópia é o pedido: soft-delete por `ativo` (NUNCA
 * exclusão física, NUNCA cascata), 409 anti-colisão de nome com FRASE, inativar e reativar. Motivo
 * não tem ordem, não tem cor e não tem "inicial", então o molde ordenável das etapas do funil
 * custaria um service inteiro por uma lista de nomes.
 *
 * ┌─ O QUE FICA GRAVADO NA CANDIDATURA É O NOME, E ISSO MUDA O DESENHO INTEIRO ────────────────┐
 * │ `as_candidaturas.motivo_descarte` guarda TEXTO, e continua guardando. Por isso inativar     │
 * │ aqui NÃO trava candidatura nenhuma e não existe `restrict`: a pessoa descartada em janeiro  │
 * │ continua dizendo por que saiu mesmo com o motivo fora de circulação em março.               │
 * │                                                                                             │
 * │ E É POR ISSO QUE RENOMEAR NÃO REESCREVE HISTÓRICO: renomear muda só as saídas DAQUI PARA A  │
 * │ FRENTE. É a ferramenta de corrigir grafia, não a de trocar o significado de um motivo já    │
 * │ usado: para trocar o significado, inativa-se um e cria-se outro.                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `motivosDeDescarteAtivos` É A PORTA QUE O DESCARTE USA. Sem ela, o `motivo` do corpo continuaria
 * texto livre com aparência de catálogo: a tela ofereceria a lista, e qualquer chamada direta à rota
 * gravaria o que quisesse no campo que a auditoria vai ler depois. É exatamente o defeito que o
 * cancelamento da vaga já fechou com `motivosDeCancelamentoAtivos`.
 *
 * §A.6: nome de motivo e um flag. Nenhum dado pessoal em nenhuma das rotas.
 */
/**
 * OS MOTIVOS ATIVOS, EM UMA CONSULTA SÓ, compartilhada entre o catálogo e o DESCARTE do candidato.
 *
 * FUNÇÃO DE MÓDULO, e não um método injetado no `CandidatosService`, pela mesma razão medida que
 * levou `motivosDeCancelamentoAtivos` a ser função: o `CandidatosService` tem CINCO argumentos de
 * construtor e é instanciado por dezenas de specs. Acrescentar um sexto por causa de uma LEITURA
 * mudaria a assinatura que código já validado usa (§A.26), e não compraria nada.
 *
 * A LISTA INTEIRA, E A CONFERÊNCIA EM MEMÓRIA, e não um `select ... where nome = ?`: o catálogo tem
 * poucas linhas, a leitura acontece ANTES de qualquer transação do desfecho, e a MESMA consulta
 * serve o seletor da tela e a validação do servidor. Duas consultas diferentes divergiriam, e a tela
 * passaria a oferecer o que a rota recusa.
 */
export function motivosDeDescarteAtivos(db: Database): Promise<AsMotivoDescarte[]> {
  return db
    .select({
      id: motivosDescarte.id,
      nome: motivosDescarte.nome,
      ativo: motivosDescarte.ativo,
      pedePretensao: motivosDescarte.pedePretensao,
    })
    .from(motivosDescarte)
    .where(eq(motivosDescarte.ativo, true))
    .orderBy(asc(motivosDescarte.nome));
}

@Injectable()
export class MotivosDescarteService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tudo, ativos e inativos, para a tela de administração poder reativar o que foi desligado. */
  list(): Promise<AsMotivoDescarte[]> {
    return this.db
      .select({
        id: motivosDescarte.id,
        nome: motivosDescarte.nome,
        ativo: motivosDescarte.ativo,
        pedePretensao: motivosDescarte.pedePretensao,
      })
      .from(motivosDescarte)
      .orderBy(asc(motivosDescarte.nome));
  }

  /**
   * SÓ OS ATIVOS: é o que enche o seletor do desfecho, e o inativo saiu de circulação.
   *
   * É A MESMA CONSULTA que o `registrarSaida` usa para RECUSAR motivo fora de circulação, e a
   * coincidência é o desenho: a lista que a tela oferece e a lista que o servidor aceita não podem
   * ser duas.
   */
  listarAtivos(): Promise<AsMotivoDescarte[]> {
    return motivosDeDescarteAtivos(this.db);
  }

  async criar(dto: CriarMotivoDescarteDto): Promise<AsMotivoDescarte> {
    // O unique do banco é a garantia; este 409 é a FRASE. Sem ele, o cadastro repetido volta como
    // 500 cru do driver, e quem está cadastrando não fica sabendo o que aconteceu.
    const existente = await this.porNome(dto.nome);
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Já existe um motivo de descarte com esse nome."
          : "Já existe um motivo de descarte com esse nome, hoje inativo. Reative-o em vez de criar outro.",
      );
    }
    const [row] = await this.db
      .insert(motivosDescarte)
      // `?? false` EXPLÍCITO, e não `dto.pedePretensao` solto: `undefined` no `values` do drizzle
      // cai no default da coluna (que também é `false`), mas depender disso deixaria o fail-closed
      // desta marca escrito em um lugar só, e no lugar errado. Ver o bloco da coluna no schema.
      .values({ nome: dto.nome, pedePretensao: dto.pedePretensao ?? false })
      .returning({
        id: motivosDescarte.id,
        nome: motivosDescarte.nome,
        ativo: motivosDescarte.ativo,
        pedePretensao: motivosDescarte.pedePretensao,
      });
    return row;
  }

  async atualizar(id: string, dto: AtualizarMotivoDescarteDto): Promise<AsMotivoDescarte> {
    if (dto.nome !== undefined) {
      const existente = await this.porNome(dto.nome);
      if (existente && existente.id !== id) {
        throw new ConflictException("Já existe um motivo de descarte com esse nome.");
      }
    }
    const [row] = await this.db
      .update(motivosDescarte)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(motivosDescarte.id, id))
      .returning({
        id: motivosDescarte.id,
        nome: motivosDescarte.nome,
        ativo: motivosDescarte.ativo,
        pedePretensao: motivosDescarte.pedePretensao,
      });
    if (!row) throw new NotFoundException("Motivo de descarte não encontrado.");
    return row;
  }

  /**
   * INATIVA (`ativo=false`). NUNCA exclusão física, NUNCA cascata: as candidaturas encerradas por
   * este motivo guardam o NOME e não são tocadas. O motivo só sai das opções. Reversível.
   */
  inativar(id: string): Promise<AsMotivoDescarte> {
    return this.atualizar(id, { ativo: false });
  }

  /** Reativa (volta às opções selecionáveis), com o mesmo nome e sem tocar em candidatura nenhuma. */
  reativar(id: string): Promise<AsMotivoDescarte> {
    return this.atualizar(id, { ativo: true });
  }

  private async porNome(nome: string) {
    const [row] = await this.db
      .select({
        id: motivosDescarte.id,
        nome: motivosDescarte.nome,
        ativo: motivosDescarte.ativo,
        pedePretensao: motivosDescarte.pedePretensao,
      })
      .from(motivosDescarte)
      .where(eq(motivosDescarte.nome, nome))
      .limit(1);
    return row;
  }
}
