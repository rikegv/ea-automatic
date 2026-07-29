import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { beneficiosCatalogo } from "../../db/schema";
import type { CreateBeneficioDto, UpdateBeneficioDto } from "./beneficios.dto";

/**
 * Catálogo de BENEFÍCIOS (OST cadastro de benefícios por tela).
 *
 * MESMO PADRÃO dos demais cadastros (escalas, cargos, motivos de declínio, clientes), e isso é
 * decisão, não coincidência: INATIVAR É EXCLUSÃO LÓGICA (`ativo=false`), nunca exclusão física e
 * nunca cascata. O benefício já alocado numa admissão continua valendo e o histórico permanece
 * legível; o que muda é que ele sai das opções selecionáveis daqui pra frente. A FK de
 * `admissao_beneficio` é `RESTRICT` justamente para que nenhuma alocação evapore em silêncio.
 *
 * A tabela `beneficios_catalogo` já existia e já alimentava o pacote de benefícios do wizard, da
 * Liberação e do modal do Gerenciador por `/catalogos/beneficios` (que devolve só os ATIVOS). O que
 * faltava era a tela de manutenção: benefício só nascia pelo caminho lateral de `addCatalogo`.
 *
 * O QUE ESTA OST ACRESCENTA ao padrão: o campo `exigeValor`. A regra "quem precisa de valor" vivia
 * na constante `BENEFICIOS_COM_VALOR` (shared-types) e casava por TEXTO DO NOME, com dois defeitos
 * reais: benefício novo nascia sem exigir valor e não havia como mudar isso sem deploy, e RENOMEAR
 * um benefício alterava a exigência sem erro nenhum. Agora a COLUNA é a fonte da verdade.
 *
 * §A.6: catálogo sem PII (nome de benefício é dado de operação, não de pessoa).
 */
@Injectable()
export class BeneficiosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Lista TUDO (ativos e inativos): a tela de administração filtra; a operação usa `/catalogos`. */
  list() {
    return this.db.select().from(beneficiosCatalogo).orderBy(asc(beneficiosCatalogo.nome));
  }

  async create(dto: CreateBeneficioDto) {
    const nome = dto.nome.trim();
    const existente = await this.db.query.beneficiosCatalogo.findFirst({
      where: eq(beneficiosCatalogo.nome, nome),
    });
    // Colidir com um benefício INATIVO não é erro de digitação, é tentativa de recriar algo que já
    // existe: o certo é reativar, e a mensagem diz isso em vez de deixar a pessoa adivinhando.
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Já existe um benefício com esse nome."
          : "Já existe um benefício inativo com esse nome. Reative em vez de criar outro.",
      );
    }
    const [row] = await this.db
      .insert(beneficiosCatalogo)
      .values({ nome, exigeValor: dto.exigeValor ?? false })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateBeneficioDto) {
    const nome = dto.nome?.trim();
    if (nome !== undefined) {
      const existente = await this.db.query.beneficiosCatalogo.findFirst({
        where: eq(beneficiosCatalogo.nome, nome),
      });
      // Antecipa o unique de `nome` com 409 claro, em vez de deixar vazar um 500 do banco.
      if (existente && existente.id !== id) {
        throw new ConflictException("Já existe um benefício com esse nome.");
      }
    }
    const [row] = await this.db
      .update(beneficiosCatalogo)
      .set({
        ...(nome !== undefined ? { nome } : {}),
        ...(dto.exigeValor !== undefined ? { exigeValor: dto.exigeValor } : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      })
      .where(eq(beneficiosCatalogo.id, id))
      .returning();
    if (!row) throw new NotFoundException("Benefício não encontrado");
    return row;
  }

  /** INATIVA (exclusão lógica). Preserva a alocação das admissões que já usam o benefício. */
  async inativar(id: string) {
    const [row] = await this.db
      .update(beneficiosCatalogo)
      .set({ ativo: false })
      .where(eq(beneficiosCatalogo.id, id))
      .returning({ id: beneficiosCatalogo.id });
    if (!row) throw new NotFoundException("Benefício não encontrado");
    return { ok: true, ativo: false };
  }

  /** Reativa o benefício (volta às opções selecionáveis da Liberação, do wizard e do Gerenciador). */
  async reativar(id: string) {
    const [row] = await this.db
      .update(beneficiosCatalogo)
      .set({ ativo: true })
      .where(eq(beneficiosCatalogo.id, id))
      .returning({ id: beneficiosCatalogo.id });
    if (!row) throw new NotFoundException("Benefício não encontrado");
    return { ok: true, ativo: true };
  }
}
