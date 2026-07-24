import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { escalasCatalogo } from "../../db/schema";
import type { CreateEscalaDto, UpdateEscalaDto } from "./escalas.dto";

/**
 * Catálogo de ESCALAS (OST produção, Bloco 4).
 *
 * MESMO PADRÃO dos demais cadastros (cargos, motivos de declínio, clientes), e isso é decisão, não
 * coincidência: INATIVAR É EXCLUSÃO LÓGICA (`ativo=false`), nunca exclusão física e nunca cascata.
 * A escala já escolhida numa admissão continua valendo e o histórico permanece legível; o que muda é
 * que ela sai das opções selecionáveis daqui pra frente. Reversível pela reativação.
 *
 * A tabela `escalas_catalogo` já existia e já alimentava o campo "Escala" da Liberação por
 * `/catalogos/escalas` (que devolve só as ATIVAS). O que faltava era a tela de manutenção: as escalas
 * só nasciam pelo caminho lateral de `addCatalogo`. Este service é o dono do ciclo de vida.
 *
 * §A.6: catálogo sem PII (nome de escala é dado de operação, não de pessoa).
 */
@Injectable()
export class EscalasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Lista TUDO (ativas e inativas): a tela de administração filtra; a operação usa `/catalogos`. */
  list() {
    return this.db.select().from(escalasCatalogo).orderBy(asc(escalasCatalogo.nome));
  }

  async create(dto: CreateEscalaDto) {
    const nome = dto.nome.trim();
    const existente = await this.db.query.escalasCatalogo.findFirst({
      where: eq(escalasCatalogo.nome, nome),
    });
    // Colidir com uma escala INATIVA não é erro de digitação, é tentativa de recriar algo que já
    // existe: o certo é reativar, e a mensagem diz isso em vez de deixar a pessoa adivinhando.
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Já existe uma escala com esse nome."
          : "Já existe uma escala inativa com esse nome. Reative em vez de criar outra.",
      );
    }
    const [row] = await this.db.insert(escalasCatalogo).values({ nome }).returning();
    return row;
  }

  async update(id: string, dto: UpdateEscalaDto) {
    const nome = dto.nome?.trim();
    if (nome !== undefined) {
      const existente = await this.db.query.escalasCatalogo.findFirst({
        where: eq(escalasCatalogo.nome, nome),
      });
      // Antecipa o unique de `nome` com 409 claro, em vez de deixar vazar um 500 do banco.
      if (existente && existente.id !== id) {
        throw new ConflictException("Já existe uma escala com esse nome.");
      }
    }
    const [row] = await this.db
      .update(escalasCatalogo)
      .set({ ...(nome !== undefined ? { nome } : {}), ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}) })
      .where(eq(escalasCatalogo.id, id))
      .returning();
    if (!row) throw new NotFoundException("Escala não encontrada");
    return row;
  }

  /** INATIVA (exclusão lógica). Preserva o vínculo das admissões que já usam a escala. */
  async inativar(id: string) {
    const [row] = await this.db
      .update(escalasCatalogo)
      .set({ ativo: false })
      .where(eq(escalasCatalogo.id, id))
      .returning({ id: escalasCatalogo.id });
    if (!row) throw new NotFoundException("Escala não encontrada");
    return { ok: true, ativo: false };
  }

  /** Reativa a escala (volta às opções selecionáveis da Liberação e do wizard). */
  async reativar(id: string) {
    const [row] = await this.db
      .update(escalasCatalogo)
      .set({ ativo: true })
      .where(eq(escalasCatalogo.id, id))
      .returning({ id: escalasCatalogo.id });
    if (!row) throw new NotFoundException("Escala não encontrada");
    return { ok: true, ativo: true };
  }
}
