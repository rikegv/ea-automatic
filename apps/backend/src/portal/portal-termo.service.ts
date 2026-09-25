import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { TermoAceiteResposta } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { portalTermoAceite } from "../db/schema";

export interface AceitarTermoEntrada {
  /** A admissão do BILHETE (sessão do Portal). É nela que se grava, sempre. */
  admissaoId: string;
  /** O `jti` do link da sessão. Ancoradouro do CANDIDATO (não é usuário do sistema). */
  jtiLink: string;
  /**
   * A admissão que o CORPO do pedido tentou informar, se veio alguma. O controller NUNCA a manda
   * como origem; existe aqui como guarda de defesa em profundidade (molde de `montarGravacaoDadosGi`).
   */
  admissaoNoCorpo?: string;
}

/**
 * PORTAL: a GRAVAÇÃO do aceite do termo de privacidade (LGPD), corrige o bug 1 (o termo reaparecia
 * por ser estado React não persistido).
 *
 * A admissão vem da SESSÃO, nunca do corpo, e um corpo que aponte para admissão diferente é
 * RECUSADO (defesa em profundidade). O aceite é prova de CONSENTIMENTO: uma linha por admissão,
 * SEM TTL (não expurga), o primeiro aceite é o que vale (upsert que não sobrescreve o carimbo).
 *
 * §A.6: PII-free por construção. Guarda só admissão + carimbo + `jti_link`. Nenhum CPF, nome ou
 * valor entra aqui, e nada é logado.
 */
@Injectable()
export class PortalTermoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async aceitar(entrada: AceitarTermoEntrada): Promise<TermoAceiteResposta> {
    if (entrada.admissaoNoCorpo && entrada.admissaoNoCorpo !== entrada.admissaoId) {
      // Rótulo fixo, sem PII: a divergência é o fato, o id nunca entra na mensagem.
      throw new BadRequestException("A admissao do corpo diverge da sessao do bilhete.");
    }

    const aceitoEm = new Date();
    // Upsert idempotente: uma linha por admissão. `onConflictDoNothing` PRESERVA o primeiro aceite,
    // que é a prova de consentimento real; re-clicar não move o carimbo para frente.
    await this.db
      .insert(portalTermoAceite)
      .values({ admissaoId: entrada.admissaoId, aceitoEm, jtiLink: entrada.jtiLink })
      .onConflictDoNothing({ target: portalTermoAceite.admissaoId });

    // Lê o carimbo GRAVADO (o primeiro), não o deste request, para a resposta refletir o
    // consentimento persistido.
    const [linha] = await this.db
      .select({ aceitoEm: portalTermoAceite.aceitoEm })
      .from(portalTermoAceite)
      .where(eq(portalTermoAceite.admissaoId, entrada.admissaoId))
      .limit(1);

    return { aceito: true, aceitoEm: (linha?.aceitoEm ?? aceitoEm).toISOString() };
  }
}
