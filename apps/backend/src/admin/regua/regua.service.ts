import { Inject, Injectable } from "@nestjs/common";
import { CODIGOS_REGUA_PADRAO } from "@ea/shared-types";
import { and, eq, inArray, isNotNull, notExists, sql as drizzleSql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { admissoes, cargos, clientes, reguaDocumental, tiposDocumento } from "../../db/schema";
import type { UpsertReguaDto } from "./regua.dto";

@Injectable()
export class ReguaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Régua atual de um par (cliente + cargo) — coração da auditoria/checklist (§A.3). */
  list(codCliente: string, cargoId: string) {
    return this.db
      .select()
      .from(reguaDocumental)
      .where(and(eq(reguaDocumental.codCliente, codCliente), eq(reguaDocumental.cargoId, cargoId)));
  }

  /** Upsert por (cod_cliente + cargo + tipo_documento) — define a exigência de cada documento. */
  async upsert(dto: UpsertReguaDto) {
    for (const item of dto.itens) {
      await this.db
        .insert(reguaDocumental)
        .values({
          codCliente: dto.codCliente,
          cargoId: dto.cargoId,
          tipoDocumentoId: item.tipoDocumentoId,
          exigencia: item.exigencia,
        })
        .onConflictDoUpdate({
          target: [
            reguaDocumental.codCliente,
            reguaDocumental.cargoId,
            reguaDocumental.tipoDocumentoId,
          ],
          set: { exigencia: item.exigencia, atualizadoEm: new Date() },
        });
    }
    return this.list(dto.codCliente, dto.cargoId);
  }

  async remove(codCliente: string, cargoId: string, tipoDocumentoId: string) {
    await this.db
      .delete(reguaDocumental)
      .where(
        and(
          eq(reguaDocumental.codCliente, codCliente),
          eq(reguaDocumental.cargoId, cargoId),
          eq(reguaDocumental.tipoDocumentoId, tipoDocumentoId),
        ),
      );
    return { ok: true };
  }

  /**
   * Inativa a régua de um cliente (§A.12, CRUD do painel "Com régua"): remove TODAS as linhas de
   * régua do cliente, devolvendo-o à lista "sem régua". Ação da administração (Master/Super Admin).
   */
  async removeCliente(codCliente: string) {
    await this.db.delete(reguaDocumental).where(eq(reguaDocumental.codCliente, codCliente));
    return { ok: true };
  }

  /**
   * PARES PENDENTES DE RÉGUA: pares (cliente + cargo) que já são usados por alguma admissão e não têm
   * NENHUMA linha de régua. É o alvo da aplicação em massa do padrão, e é deliberadamente restrito:
   * NÃO se cria régua para todo cargo do catálogo (cliente × cargo daria dezenas de milhares de
   * combinações inventadas). Só par real, que existe porque houve admissão.
   *
   * Alimenta a tela de confirmação (o consultor vê exatamente o que será aplicado) e é recalculado no
   * apply, que não confia em lista vinda do cliente.
   */
  async paresPendentesPadrao(): Promise<
    { codCliente: string; cliente: string; cargoId: string; cargo: string; admissoes: number }[]
  > {
    const rows = await this.db
      .select({
        codCliente: admissoes.codCliente,
        cliente: drizzleSql<string>`coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial})`,
        cargoId: admissoes.cargoId,
        cargo: cargos.nome,
        admissoes: drizzleSql<number>`count(*)::int`,
      })
      .from(admissoes)
      .innerJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .innerJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(
        and(
          isNotNull(admissoes.codCliente),
          isNotNull(admissoes.cargoId),
          notExists(
            this.db
              .select({ um: drizzleSql`1` })
              .from(reguaDocumental)
              .where(
                and(
                  eq(reguaDocumental.codCliente, admissoes.codCliente),
                  eq(reguaDocumental.cargoId, admissoes.cargoId),
                ),
              ),
          ),
        ),
      )
      .groupBy(admissoes.codCliente, clientes.nomeOperacao, clientes.razaoSocial, admissoes.cargoId, cargos.nome)
      .orderBy(cargos.nome);

    return rows as {
      codCliente: string;
      cliente: string;
      cargoId: string;
      cargo: string;
      admissoes: number;
    }[];
  }

  /**
   * APLICA os documentos padrão (fonte única `CODIGOS_REGUA_PADRAO`) nos pares pendentes.
   *
   * Semântica (decisão do diretor): **só adiciona onde não há nada cadastrado**. O alvo já exclui todo
   * par que tenha qualquer régua, e o insert ainda vai `onConflictDoNothing`, então:
   *  - régua editada à mão (ex.: o par com 30 documentos) fica INTOCADA;
   *  - nada é sobrescrito e NADA é apagado (o seed antigo apagava tudo e fazia cross join, este não);
   *  - rodar duas vezes não duplica nem muda o que a primeira aplicou.
   */
  async aplicarPadraoNosPendentes(): Promise<{
    paresAplicados: { codCliente: string; cliente: string; cargo: string }[];
    linhasInseridas: number;
    documentosPorPar: number;
  }> {
    const tipos = await this.db
      .select({ id: tiposDocumento.id, codigo: tiposDocumento.codigo })
      .from(tiposDocumento)
      .where(inArray(tiposDocumento.codigo, [...CODIGOS_REGUA_PADRAO]));

    const alvos = await this.paresPendentesPadrao();
    if (alvos.length === 0 || tipos.length === 0) {
      return { paresAplicados: [], linhasInseridas: 0, documentosPorPar: tipos.length };
    }

    const valores = alvos.flatMap((p) =>
      tipos.map((t) => ({
        codCliente: p.codCliente,
        cargoId: p.cargoId,
        tipoDocumentoId: t.id,
        exigencia: "OBRIGATORIO" as const,
      })),
    );

    const inseridas = await this.db
      .insert(reguaDocumental)
      .values(valores)
      .onConflictDoNothing()
      .returning({ codCliente: reguaDocumental.codCliente });

    return {
      paresAplicados: alvos.map((p) => ({
        codCliente: p.codCliente,
        cliente: p.cliente,
        cargo: p.cargo,
      })),
      linhasInseridas: inseridas.length,
      documentosPorPar: tipos.length,
    };
  }
}
