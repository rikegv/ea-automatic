import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoDadosGi, portalConferencia, portalDadosGiAceites, tiposDocumento } from "../db/schema";
import { filtrarCamposGi } from "../domain/dados-gi-campos";
import { montarGravacaoDadosGi, type CampoConfirmadoGi } from "../domain/portal-dados-gi";
import { PortalTrilhaService } from "./portal-trilha.service";

export interface GravarDadosGiEntrada {
  admissaoId: string;
  jtiLink: string;
  campos: CampoConfirmadoGi[];
  /**
   * O CÓDIGO do tipo de documento cuja conferência o candidato acabou de confirmar (ex.: "RG",
   * "PIS_PASEP"). Vem do front, que confirma UM documento por vez. É o que ESCOPA a anulação: só a
   * conferência DESSE documento é zerada. Ausente no passo FINAL (sobras de vários documentos, as
   * conferências já foram zeradas na confirmação por-documento): aí nada é anulado, só o dossiê grava.
   *
   * ⚠️ POR QUE É SEGURO vir do corpo (diferente de `admissaoId`, que NUNCA pode): a anulação já está
   * presa à admissão da SESSÃO, e ela só limpa SUGESTÃO da IA (dado regenerável), nunca escreve dado
   * autoritativo — a persistência do dossiê (allowlist de colunas) independe deste campo. Um código
   * forjado só mexeria numa sugestão da PRÓPRIA admissão do forjador: auto-dano, sem vetor de terceiro.
   */
  tipoDocumento?: string | null;
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
    // Upsert idempotente + ANULAÇÃO DA CONFERÊNCIA DO DOCUMENTO CONFIRMADO, na MESMA transação (C9).
    // Depois que o candidato confirmou um documento, o valor autoritativo vive em `admissao_dados_gi`,
    // e a sugestão crua da IA daquele documento não pode seguir viva em `portal_conferencia`: os
    // `campos` viram `[]` e `confirmado_em` é carimbado. O `veredito` sobrevive de propósito, para a
    // tela ainda dizer "ajustar" num documento reprovado.
    //
    // ⚠️ A ANULAÇÃO É ESCOPADA AO DOCUMENTO CONFIRMADO (`entrada.tipoDocumento`), NUNCA à admissão
    // inteira. Esta é a correção do bug de 15/10: antes zerava TODA conferência da admissão a cada POST,
    // mas o front confirma UM documento por vez. Como as chaves de extração NÃO são únicas por documento
    // (`pis` sai de CTPS e de PIS_PASEP; `nomeCompleto`/`dataNascimento`/`cidadeNascimento` de vários) e
    // a conferência guarda o catálogo INTEIRO do tipo, zerar por admissão (ou por chave contra todas as
    // conferências) ou (1) escondia o RG/CTPS/título que o candidato nunca confirmou (o bug), ou
    // (2) auto-confirmava um documento irmão que compartilha uma chave, ou (3) deixava um documento com
    // campo compartilhado já deduplicado preso "pendente" para sempre. Escopar ao documento confirmado
    // fecha os três: limpa só aquela conferência, e preserva a "segunda chance" (o nome que não saiu no
    // RG segue vivo na conferência da CTPS). O passo FINAL não manda `tipoDocumento` e não anula nada
    // (as conferências já foram zeradas na confirmação por-documento); ele só grava o dossiê.
    // §A.6: nenhum valor sai daqui; a I/O é só carimbo e esvaziamento de UMA conferência.
    const tipoDoc = typeof entrada.tipoDocumento === "string" ? entrada.tipoDocumento.trim() : "";
    await this.db.transaction(async (tx) => {
      await tx
        .insert(admissaoDadosGi)
        .values({ admissaoId: g.admissaoId, ...base })
        .onConflictDoUpdate({ target: admissaoDadosGi.admissaoId, set: base });
      if (!tipoDoc) return;
      // As conferências VIVAS da admissão da SESSÃO (escopo cross-admission garantido no SQL), cada uma
      // com o CÓDIGO do seu tipo. A conferência a anular é a do documento confirmado, achada pelo
      // código. Código fora do catálogo ou sem conferência viva não casa: nada é anulado (fail-closed).
      const conferencias = await tx
        .select({ id: portalConferencia.id, codigo: tiposDocumento.codigo })
        .from(portalConferencia)
        .innerJoin(tiposDocumento, eq(tiposDocumento.id, portalConferencia.tipoDocumentoId))
        .where(eq(portalConferencia.admissaoId, g.admissaoId));
      const alvo = conferencias.find((c) => c.codigo === tipoDoc);
      if (!alvo) return;
      await tx
        .update(portalConferencia)
        .set({ confirmadoEm: agora, campos: [], atualizadoEm: agora })
        .where(eq(portalConferencia.id, alvo.id));
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
