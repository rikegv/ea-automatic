import { Inject, Injectable, Logger, BadRequestException, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { STATUS_IFRACTAL_SEMENTE } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { frenteStatusCatalogo, frentesAdmissao } from "../db/schema";

/**
 * O CATÁLOGO DE STATUS DA FRENTE IFRACTAL, que é GERENCIÁVEL pelo time (decisão do diretor).
 *
 * ESTA FRENTE É A ÚNICA ASSIM. As outras quatro têm a lista fixa em código (`ORDEM_STATUS`), porque
 * cada status delas carrega REGRA: "Apto" exige ASO validado, "Cadastrado" abre o gate do kit,
 * "Análise ok" fecha a auditoria. Renomear qualquer um daqueles quebraria a regra amarrada nele.
 *
 * No iFractal não há regra por status: são RÓTULOS que o consultor escolhe para dizer em que ponto
 * está o cadastro no sistema de ponto. Sem regra amarrada, renomear e acrescentar é seguro, e é
 * exatamente por isso que só aqui o catálogo pôde virar dado editável em vez de código.
 *
 * O QUE O SISTEMA PRECISA SABER, e sabe: qual status CONCLUI a frente. É a coluna `conclui`, que já
 * existia na tabela, e a tela deixa marcar. Nasce no "Finalizado".
 *
 * §A.6: só códigos e rótulos de status. Nenhum dado pessoal, nenhuma credencial.
 */
@Injectable()
export class IfractalStatusService implements OnModuleInit {
  private readonly logger = new Logger("IfractalStatusService");

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * SEMEIA UMA VEZ, E SÓ SE ESTIVER VAZIO.
   *
   * Diferente do convergedor de menus, que realinha rótulos a cada boot, aqui o boot NÃO pode
   * realinhar nada: o rótulo é do time, não do código. Um `onConflictDoUpdate` desfaria em silêncio,
   * a cada restart, todo rename que alguém tivesse feito. Semear só no vazio é o que torna a lista
   * genuinamente editável.
   *
   * Não derruba o boot se falhar: catálogo ausente é problema de tela, não de aplicação no ar.
   */
  async onModuleInit(): Promise<void> {
    try {
      const [{ n }] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(frenteStatusCatalogo)
        .where(eq(frenteStatusCatalogo.tipo, "IFRACTAL"));
      if (n > 0) return;

      await this.db.insert(frenteStatusCatalogo).values(
        STATUS_IFRACTAL_SEMENTE.map((s) => ({
          tipo: "IFRACTAL" as const,
          codigo: s.codigo,
          rotulo: s.rotulo,
          ordem: s.ordem,
          conclui: s.conclui,
        })),
      );
      this.logger.log(`Catálogo do iFractal semeado com ${STATUS_IFRACTAL_SEMENTE.length} status.`);
    } catch (e) {
      this.logger.warn(`Falha ao semear o catálogo do iFractal: ${(e as Error).message}`);
    }
  }

  /** A lista vigente, na ordem que a tela exibe e o seletor oferece. */
  async listar() {
    return this.db
      .select({
        id: frenteStatusCatalogo.id,
        codigo: frenteStatusCatalogo.codigo,
        rotulo: frenteStatusCatalogo.rotulo,
        ordem: frenteStatusCatalogo.ordem,
        conclui: frenteStatusCatalogo.conclui,
      })
      .from(frenteStatusCatalogo)
      .where(eq(frenteStatusCatalogo.tipo, "IFRACTAL"))
      .orderBy(asc(frenteStatusCatalogo.ordem), asc(frenteStatusCatalogo.id));
  }

  /**
   * Acrescenta um status. O CÓDIGO é derivado do rótulo e é ESTÁVEL: é ele que fica gravado em
   * `frentes_admissao.status`, então renomear depois não pode mexer nele (senão as admissões que já
   * estão naquele status apontariam para o nada).
   */
  async criar(dto: { rotulo: string }) {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome do status.");
    const codigo = codigoDoRotulo(rotulo);
    if (!codigo) throw new BadRequestException("O nome precisa ter ao menos uma letra ou número.");

    const existente = await this.db
      .select({ id: frenteStatusCatalogo.id })
      .from(frenteStatusCatalogo)
      .where(and(eq(frenteStatusCatalogo.tipo, "IFRACTAL"), eq(frenteStatusCatalogo.codigo, codigo)));
    if (existente.length) throw new BadRequestException("Já existe um status com esse nome.");

    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${frenteStatusCatalogo.ordem}), 0)::int` })
      .from(frenteStatusCatalogo)
      .where(eq(frenteStatusCatalogo.tipo, "IFRACTAL"));

    const [criado] = await this.db
      .insert(frenteStatusCatalogo)
      .values({ tipo: "IFRACTAL", codigo, rotulo, ordem: max + 1, conclui: false })
      .returning();
    return criado;
  }

  /** Renomeia. O código NÃO muda, de propósito (ver `criar`). */
  async renomear(id: number, dto: { rotulo: string }) {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome do status.");
    const [upd] = await this.db
      .update(frenteStatusCatalogo)
      .set({ rotulo })
      .where(and(eq(frenteStatusCatalogo.id, id), eq(frenteStatusCatalogo.tipo, "IFRACTAL")))
      .returning();
    if (!upd) throw new NotFoundException("Status não encontrado.");
    return upd;
  }

  /**
   * Marca QUAL status conclui a frente. É EXCLUSIVO: marcar um desmarca os demais, na mesma
   * transação. Dois concluintes deixariam a frente com duas verdades, e a pergunta "esta admissão
   * terminou no iFractal?" passaria a depender de qual linha o Postgres devolvesse primeiro.
   */
  async definirConcluinte(id: number) {
    return this.db.transaction(async (tx) => {
      const [alvo] = await tx
        .select({ id: frenteStatusCatalogo.id })
        .from(frenteStatusCatalogo)
        .where(and(eq(frenteStatusCatalogo.id, id), eq(frenteStatusCatalogo.tipo, "IFRACTAL")));
      if (!alvo) throw new NotFoundException("Status não encontrado.");

      await tx
        .update(frenteStatusCatalogo)
        .set({ conclui: false })
        .where(and(eq(frenteStatusCatalogo.tipo, "IFRACTAL"), ne(frenteStatusCatalogo.id, id)));
      const [upd] = await tx
        .update(frenteStatusCatalogo)
        .set({ conclui: true })
        .where(eq(frenteStatusCatalogo.id, id))
        .returning();
      return upd;
    });
  }

  /**
   * Remove um status. BARRA quando alguma admissão está NELE: apagar deixaria aquelas linhas
   * apontando para um código que não existe mais, e a tela mostraria o código cru sem explicação.
   * O recado diz QUANTAS estão, para o time saber o que mover antes.
   */
  async remover(id: number) {
    const [alvo] = await this.db
      .select({ codigo: frenteStatusCatalogo.codigo, conclui: frenteStatusCatalogo.conclui })
      .from(frenteStatusCatalogo)
      .where(and(eq(frenteStatusCatalogo.id, id), eq(frenteStatusCatalogo.tipo, "IFRACTAL")));
    if (!alvo) throw new NotFoundException("Status não encontrado.");
    if (alvo.conclui) {
      throw new BadRequestException(
        "Este é o status que conclui a frente. Marque outro como concluinte antes de remover este.",
      );
    }

    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(frentesAdmissao)
      .where(and(eq(frentesAdmissao.tipo, "IFRACTAL"), eq(frentesAdmissao.status, alvo.codigo)));
    if (n > 0) {
      throw new BadRequestException(
        `${n} ${n === 1 ? "admissão está" : "admissões estão"} neste status. Mova ${n === 1 ? "ela" : "elas"} para outro antes de remover.`,
      );
    }

    await this.db.delete(frenteStatusCatalogo).where(eq(frenteStatusCatalogo.id, id));
    return { ok: true };
  }
}

/**
 * Rótulo para CÓDIGO estável: "Pendente De Envio" vira "PENDENTE_DE_ENVIO". Sem acento, sem espaço,
 * em maiúsculas, porque é o valor que vai para `frentes_admissao.status` e vive lá para sempre.
 */
export function codigoDoRotulo(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
