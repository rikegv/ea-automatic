import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { cargos, clientes, frenteStatusCatalogo, reguaDocumental, tiposDocumento } from "../../db/schema";

/** Dados de referência (somente leitura) usados pelas telas — visíveis a qualquer autenticado. */
@Injectable()
export class CatalogosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  listTiposDocumento() {
    return this.db.select().from(tiposDocumento).orderBy(asc(tiposDocumento.nome));
  }

  listFrenteStatus() {
    return this.db
      .select()
      .from(frenteStatusCatalogo)
      .orderBy(asc(frenteStatusCatalogo.tipo), asc(frenteStatusCatalogo.ordem));
  }

  /** Clientes ativos para o wizard (F6). `q` filtra (case-insensitive) razão/cnpj/operação/código. */
  listClientes(q?: string) {
    const termo = q?.trim();
    const filtro = termo
      ? and(
          eq(clientes.ativo, true),
          or(
            ilike(clientes.razaoSocial, `%${termo}%`),
            ilike(clientes.cnpj, `%${termo}%`),
            ilike(clientes.nomeOperacao, `%${termo}%`),
            ilike(clientes.codCliente, `%${termo}%`),
          ),
        )
      : eq(clientes.ativo, true);

    return this.db
      .select({
        codCliente: clientes.codCliente,
        cnpj: clientes.cnpj,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
        empresaGrupo: clientes.empresaGrupo,
        regiao: clientes.regiao,
        descricaoRegiao: clientes.descricaoRegiao,
        beneficiosPadrao: clientes.beneficiosPadrao,
        escalaPadrao: clientes.escalaPadrao,
        enderecoPadrao: clientes.enderecoPadrao,
      })
      .from(clientes)
      .where(filtro)
      .orderBy(asc(clientes.razaoSocial));
  }

  /** Cargos ativos para o wizard (F6). */
  listCargos() {
    return this.db
      .select({ id: cargos.id, nome: cargos.nome })
      .from(cargos)
      .where(eq(cargos.ativo, true))
      .orderBy(asc(cargos.nome));
  }

  /** Régua resolvida do par (cliente + cargo) com JOIN no tipo de documento (§A.3 regra 4 / F4). */
  listRegua(codCliente: string, cargoId: string) {
    return this.db
      .select({
        tipoDocumentoId: reguaDocumental.tipoDocumentoId,
        codigo: tiposDocumento.codigo,
        nome: tiposDocumento.nome,
        exigencia: reguaDocumental.exigencia,
      })
      .from(reguaDocumental)
      .innerJoin(tiposDocumento, eq(reguaDocumental.tipoDocumentoId, tiposDocumento.id))
      .where(
        and(eq(reguaDocumental.codCliente, codCliente), eq(reguaDocumental.cargoId, cargoId)),
      )
      .orderBy(asc(tiposDocumento.nome));
  }
}
