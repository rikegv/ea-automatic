import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { sql as fragmento } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { menus } from "../db/schema";
import { MENUS } from "../domain/menus";

/**
 * CONVERGÊNCIA DO CATÁLOGO DE MENUS NO BOOT (OST do menu Clínicas invisível).
 *
 * O BURACO QUE ISTO FECHA, e ele já mordeu duas vezes. O registro dos menus vive em código
 * (`domain/menus`), mas a tela de liberação de menu-por-usuário lista a TABELA `menus`. A ponte
 * entre os dois era um seed MANUAL (`pnpm db:seed:menus`), fora do deploy. Resultado real: o menu
 * "Clínicas" subiu com rota, tela e CRUD funcionando, e mesmo assim **não existia como opção** para
 * o diretor liberar, porque ninguém rodou o seed. O menu existia e era invisível.
 *
 * Agora a convergência acontece sozinha a cada boot, no mesmo padrão do catálogo de status de frente:
 * `onConflictDoUpdate` realinha rótulo, rota, grupo e ordem; a chave (`codigo`) nunca é tocada. Menu
 * novo passa a existir no catálogo pelo simples fato de ter sido registrado em código e deployado.
 *
 * O QUE ISTO **NÃO** FAZ, e é o ponto mais importante (§A.23): **não concede acesso a ninguém**. Ele
 * só REGISTRA o menu para que ele possa ser liberado. Quem enxerga cada menu é decisão do diretor,
 * tomada na tela de liberação, usuário a usuário. O passo de GRANDFATHER que existe no
 * `seed-menus.ts` (dar menus a quem nunca foi configurado) continua FORA daqui, de propósito: aquilo
 * é concessão, e concessão nunca é rotina de deploy.
 *
 * Não derruba o boot se falhar: um catálogo desatualizado é problema de tela, não de aplicação no ar.
 *
 * §A.6: só códigos e rótulos de menu. Nenhum dado pessoal.
 */
@Injectable()
export class MenusCatalogoService implements OnModuleInit {
  private readonly logger = new Logger("MenusCatalogoService");

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async onModuleInit(): Promise<void> {
    try {
      const novos = await this.convergir();
      this.logger.log(
        `Catálogo de menus convergido: ${MENUS.length} registrados` +
          (novos.length > 0 ? `, ${novos.length} novo(s): ${novos.join(", ")}.` : "."),
      );
    } catch (err) {
      this.logger.warn(
        `Catálogo de menus não convergiu no boot: ${err instanceof Error ? err.message : "erro"}. ` +
          `A tela de liberação pode não listar menu recém-criado até o próximo boot.`,
      );
    }
  }

  /**
   * Alinha a tabela ao registro em código. Devolve os códigos que ENTRARAM agora (para o log dizer o
   * que mudou, em vez de repetir o total a cada restart).
   */
  async convergir(): Promise<string[]> {
    const existentes = new Set(
      (await this.db.select({ codigo: menus.codigo }).from(menus)).map((l) => l.codigo),
    );
    const novos = MENUS.map((m) => m.codigo).filter((c) => !existentes.has(c));

    await this.db
      .insert(menus)
      .values(
        MENUS.map(({ codigo, rotulo, href, grupo, ordem }) => ({
          codigo,
          rotulo,
          href,
          grupo,
          ordem,
          ativo: true,
        })),
      )
      .onConflictDoUpdate({
        target: menus.codigo,
        set: {
          rotulo: fragmento`excluded.rotulo`,
          href: fragmento`excluded.href`,
          grupo: fragmento`excluded.grupo`,
          ordem: fragmento`excluded.ordem`,
          ativo: fragmento`true`,
        },
      });
    return novos;
  }
}
