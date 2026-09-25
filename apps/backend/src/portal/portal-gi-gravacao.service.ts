import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoDadosGi, portalConferencia, portalDadosGiAceites } from "../db/schema";
import { filtrarCamposGi } from "../domain/dados-gi-campos";
import { montarGravacaoDadosGi, type CampoConfirmadoGi } from "../domain/portal-dados-gi";
import { PortalTrilhaService } from "./portal-trilha.service";

export interface GravarDadosGiEntrada {
  admissaoId: string;
  jtiLink: string;
  campos: CampoConfirmadoGi[];
  ip: string | null;
}

export interface GravarDadosGiResultado {
  gravado: boolean;
  /** Quantos campos foram confirmados. Nunca um valor, só a contagem (§A.6). */
  campos: number;
}

/**
 * PORTAL→GI, PEÇA 2: grava os dados que o CANDIDATO CONFIRMOU em `admissao_dados_gi`.
 *
 * A ÚNICA PORTA DE ESCRITA de `admissao_dados_gi` pelo candidato, e ela é fechada por três travas,
 * todas provadas no contrato do `tester` (`portal-dados-gi.contrato.tester.spec.ts`):
 *  1. a admissão vem da SESSÃO, nunca do corpo (o controller passa `req.portal.admissaoId`);
 *  2. só o VALOR CONFIRMADO persiste, nunca a sugestão crua da IA (`montarGravacaoDadosGi`, V12);
 *  3. allowlist FECHADA de colunas (`filtrarCamposGi`): valor confirmado sem coluna do GI não grava.
 *
 * A DECISÃO mora no domínio (`montarGravacaoDadosGi`); esta classe só faz a I/O: mapeia os valores
 * confirmados para colunas e grava, mais o rastro do aceite e a contagem na trilha.
 *
 * §A.6: NENHUM CPF/RG/nome/valor em log. O rastro do aceite guarda só RÓTULOS; o evento da trilha,
 * só a CONTAGEM. Nada aqui imprime valor.
 */
@Injectable()
export class PortalDadosGiService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly trilha: PortalTrilhaService,
  ) {}

  async gravar(entrada: GravarDadosGiEntrada): Promise<GravarDadosGiResultado> {
    // O DOMÍNIO decide o que persiste (só o confirmado), os rótulos do aceite e o TTL do expurgo.
    const g = montarGravacaoDadosGi({
      admissaoDaSessao: entrada.admissaoId,
      jtiLink: entrada.jtiLink,
      campos: entrada.campos,
      agora: new Date(),
    });

    // Dos valores confirmados, só os que têm COLUNA no GI viram gravação (allowlist de colunas).
    const { update } = filtrarCamposGi(g.valores);

    const agora = new Date();
    const base = {
      ...update,
      confirmadoEm: agora,
      jtiLink: g.jtiLink,
      expurgarEm: g.expurgarEm,
      atualizadoEm: agora,
    };
    // Upsert idempotente + ANULAÇÃO da conferência, na MESMA transação (C9). Depois que o candidato
    // confirmou, o valor autoritativo vive em `admissao_dados_gi`, e a sugestão crua da IA não pode
    // seguir viva em `portal_conferencia`: os `campos` viram `[]` e `confirmado_em` é carimbado. O
    // `veredito` sobrevive de propósito, para a tela ainda dizer "ajustar" num documento reprovado.
    // Anula por ADMISSÃO (a confirmação do GI é em lote, sem tipo): a confirmação supera todas as
    // sugestões daquela admissão. §A.6: nenhum valor sai daqui; a I/O é só carimbo e esvaziamento.
    await this.db.transaction(async (tx) => {
      await tx
        .insert(admissaoDadosGi)
        .values({ admissaoId: g.admissaoId, ...base })
        .onConflictDoUpdate({ target: admissaoDadosGi.admissaoId, set: base });
      await tx
        .update(portalConferencia)
        .set({ confirmadoEm: agora, campos: [], atualizadoEm: agora })
        .where(eq(portalConferencia.admissaoId, g.admissaoId));
    });

    // Rastro do aceite, PII-free: QUAIS campos (rótulos), QUANDO, ancorado em admissão + jti_link.
    if (g.rotulosAceitos.length > 0) {
      await this.db.insert(portalDadosGiAceites).values({
        admissaoId: g.admissaoId,
        jtiLink: g.jtiLink,
        camposConfirmados: g.rotulosAceitos.join(", "),
      });
    }

    // Evento próprio `PORTAL_DADOS_GI_CONFIRMADO`: a trilha carrega só a CONTAGEM (`camposExtraidosN`),
    // nunca rótulo nem valor. Os rótulos moram em `portal_dados_gi_aceites` (dado, não log).
    await this.trilha.registrar(
      "PORTAL_DADOS_GI_CONFIRMADO",
      { jtiLink: g.jtiLink, camposExtraidosN: g.rotulosAceitos.length },
      entrada.ip,
    );

    return { gravado: true, campos: g.rotulosAceitos.length };
  }
}
