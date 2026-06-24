import { Inject, Injectable } from "@nestjs/common";
import { asc } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { frenteStatusCatalogo, tiposDocumento } from "../../db/schema";

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
}
