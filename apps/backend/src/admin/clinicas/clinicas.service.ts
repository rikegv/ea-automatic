import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { clinicasCatalogo } from "../../db/schema";
import type { CreateClinicaDto, UpdateClinicaDto } from "./clinicas.dto";

/**
 * Catálogo de CLÍNICAS (OST Onda 2, item 4).
 *
 * MESMO PADRÃO dos demais cadastros (escalas, cargos, motivos de declínio): INATIVAR É EXCLUSÃO
 * LÓGICA (`ativo=false`), nunca física e nunca em cascata. A clínica já escolhida num agendamento
 * continua valendo e o histórico permanece legível; o que muda é que ela sai das opções
 * selecionáveis daqui para frente. Reversível pela reativação.
 *
 * POR QUE ELE EXISTE: o nome da clínica era TEXTO LIVRE no agendamento, então a mesma clínica
 * aparecia escrita de várias formas e não havia lista para escolher. Agora o agendamento seleciona
 * daqui, e a migração levou cada nome já digitado para uma linha deste catálogo.
 *
 * §A.6: catálogo sem PII (nome de clínica é dado de fornecedor, não de pessoa).
 */
@Injectable()
export class ClinicasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Lista TUDO (ativas e inativas): a tela de administração filtra; a operação usa `/catalogos`. */
  list() {
    return this.db.select().from(clinicasCatalogo).orderBy(asc(clinicasCatalogo.nome));
  }

  async create(dto: CreateClinicaDto) {
    const nome = dto.nome.trim();
    const existente = await this.db.query.clinicasCatalogo.findFirst({
      where: eq(clinicasCatalogo.nome, nome),
    });
    // Colidir com uma escala INATIVA não é erro de digitação, é tentativa de recriar algo que já
    // existe: o certo é reativar, e a mensagem diz isso em vez de deixar a pessoa adivinhando.
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Já existe uma clínica com esse nome."
          : "Já existe uma clínica inativa com esse nome. Reative em vez de criar outra.",
      );
    }
    const endereco = dto.endereco?.trim();
    const [row] = await this.db
      .insert(clinicasCatalogo)
      .values({ nome, fornecedor: dto.fornecedor.trim(), endereco: endereco || null })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateClinicaDto) {
    const nome = dto.nome?.trim();
    if (nome !== undefined) {
      const existente = await this.db.query.clinicasCatalogo.findFirst({
        where: eq(clinicasCatalogo.nome, nome),
      });
      // Antecipa o unique de `nome` com 409 claro, em vez de deixar vazar um 500 do banco.
      if (existente && existente.id !== id) {
        throw new ConflictException("Já existe uma clínica com esse nome.");
      }
    }
    const [row] = await this.db
      .update(clinicasCatalogo)
      .set({
        ...(nome !== undefined ? { nome } : {}),
        ...(dto.fornecedor !== undefined ? { fornecedor: dto.fornecedor.trim() } : {}),
        // String vazia LIMPA o endereço (vira null); ausente não toca no campo.
        ...(dto.endereco !== undefined ? { endereco: dto.endereco.trim() || null } : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      })
      .where(eq(clinicasCatalogo.id, id))
      .returning();
    if (!row) throw new NotFoundException("Clínica não encontrada");
    return row;
  }

  /** INATIVA (exclusão lógica). Preserva o vínculo das admissões que já usam a escala. */
  async inativar(id: string) {
    const [row] = await this.db
      .update(clinicasCatalogo)
      .set({ ativo: false })
      .where(eq(clinicasCatalogo.id, id))
      .returning({ id: clinicasCatalogo.id });
    if (!row) throw new NotFoundException("Clínica não encontrada");
    return { ok: true, ativo: false };
  }

  /** Reativa a escala (volta às opções selecionáveis da Liberação e do wizard). */
  async reativar(id: string) {
    const [row] = await this.db
      .update(clinicasCatalogo)
      .set({ ativo: true })
      .where(eq(clinicasCatalogo.id, id))
      .returning({ id: clinicasCatalogo.id });
    if (!row) throw new NotFoundException("Clínica não encontrada");
    return { ok: true, ativo: true };
  }
}
