import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { portalEventos, portalEventosIp } from "../db/schema";
import { montarEventoPortal, truncarIp, type PortalEventoTipo } from "../domain/portal-evento";

/** Retenção do IP COMPLETO. Passados 90 dias o valor é truncado no lugar (decisão 14 do desenho). */
export const PORTAL_DIAS_IP_COMPLETO = 90;

/**
 * Escreve a trilha do Portal (catálogo `PORTAL_*`, seção 9 do documento de regras).
 *
 * A SANITIZAÇÃO NÃO MORA AQUI, e essa separação é a proteção: quem reduz o payload é
 * `montarEventoPortal` (`domain/portal-evento.ts`), por allowlist, e este serviço NÃO tem caminho
 * alternativo para gravar. Não existe um `insert` solto em lugar nenhum do módulo, então evento
 * novo nasce sanitizado por construção, sem depender de quem o escrever se lembrar da régua.
 *
 * O IP COMPLETO VAI PARA OUTRA TABELA. A trilha guarda o hash com sal mensal; o endereço em claro
 * vive só na `portal_eventos_ip`, com leitura restrita e truncamento aos 90 dias.
 */
@Injectable()
export class PortalTrilhaService {
  private readonly log = new Logger(PortalTrilhaService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  /**
   * O PEPPER FALHA FECHADO, E É AQUI QUE ISSO ACONTECE.
   *
   * Sem `PORTAL_LOG_PEPPER` configurado, a gravação do evento FALHA. Em hipótese nenhuma ela cai
   * para CPF cru, e em hipótese nenhuma ela grava com pepper vazio, que daria um hash calculável
   * por qualquer um que soubesse o formato (um CPF tem 11 dígitos: sem pepper, a tabela inteira é
   * quebrável por força bruta em segundos, e o "hash" seria teatro).
   *
   * O fallback aleatório por processo que existe em `domain/portal-evento.ts` serve só à função
   * pura em teste. No caminho que GRAVA, a variável é obrigatória.
   */
  private pepperObrigatorio(): string {
    const pepper = (this.config.get<string>("PORTAL_LOG_PEPPER") ?? "").trim();
    if (!pepper) {
      throw new Error(
        "PORTAL_LOG_PEPPER ausente: a trilha do portal nao grava sem pepper, e nao ha fallback",
      );
    }
    return pepper;
  }

  /** O portal só opera com a trilha ligada: rota que não consegue registrar não deve conceder nada. */
  configurada(): boolean {
    return (this.config.get<string>("PORTAL_LOG_PEPPER") ?? "").trim().length > 0;
  }

  /**
   * Registra um evento. `cru` pode conter PII: é justamente esse o desenho, o chamador entrega o
   * que tem na mão e a redução acontece aqui dentro, num lugar só.
   *
   * `ipCompleto` é o único valor que escapa da redução, e ele vai para a tabela restrita, nunca
   * para a trilha principal.
   */
  async registrar(
    tipo: PortalEventoTipo,
    cru: Record<string, unknown> = {},
    ipCompleto?: string | null,
  ): Promise<void> {
    const evento = montarEventoPortal(tipo, cru, this.pepperObrigatorio());

    try {
      const [linha] = await this.db
        .insert(portalEventos)
        .values({
          tipo: evento.tipo,
          jtiLink: evento.jtiLink,
          candidatoHash: evento.candidatoHash,
          ipHash: evento.ipHash,
          uaHash: evento.uaHash,
          resultado: evento.resultado,
          motivoCodigo: evento.motivoCodigo,
          dados:
            evento.camposExtraidosN === undefined
              ? evento.dados
              : { ...evento.dados, camposExtraidosN: evento.camposExtraidosN },
        })
        .returning({ id: portalEventos.id });

      if (ipCompleto && linha) {
        await this.db
          .insert(portalEventosIp)
          .values({ eventoId: linha.id, ip: ipCompleto })
          .onConflictDoNothing();
      }
    } catch (erro) {
      // A GRAVAÇÃO NUNCA DERRUBA O FLUXO, e a razão é a assimetria: um erro ao escrever o log não
      // pode fazer uma emissão já concedida parecer recusada ao candidato, nem impedi-lo de enviar
      // um documento. Mesma postura do `arquivarAssinado` quando falha ao notificar (§A.5).
      // A falta de pepper NÃO cai aqui: ela lança antes, fora do try, porque é configuração
      // ausente e não intermitência.
      // §A.6: a mensagem repete só o tipo do evento, que é rótulo fixo.
      this.log.error(`falha ao gravar evento ${tipo} da trilha do portal`, erro as Error);
    }
  }

  /**
   * Trunca os IPs que passaram dos 90 dias. Idempotente: só toca linha ainda não truncada.
   *
   * Fica como MÉTODO e não como agendador, de propósito. Quem decide a cadência da retenção é a
   * frente da Sala De Segurança, que é outra entrega; acender um cron aqui seria a fábrica
   * decidindo escopo por conta própria (§A.31). O que não podia faltar é a rotina EXISTIR, porque
   * prazo de retenção sem quem o execute é prazo infinito por omissão.
   */
  async truncarIpsVencidos(agora: Date = new Date()): Promise<number> {
    const corte = new Date(agora.getTime() - PORTAL_DIAS_IP_COMPLETO * 24 * 60 * 60 * 1000);
    const vencidos = await this.db
      .select({ id: portalEventosIp.id, ip: portalEventosIp.ip })
      .from(portalEventosIp)
      .where(and(lt(portalEventosIp.ocorridoEm, corte), isNull(portalEventosIp.truncadoEm)))
      .limit(5000);

    for (const linha of vencidos) {
      await this.db
        .update(portalEventosIp)
        .set({ ip: truncarIp(linha.ip), truncadoEm: sql`now()` })
        .where(sql`${portalEventosIp.id} = ${linha.id}`);
    }
    return vencidos.length;
  }
}
