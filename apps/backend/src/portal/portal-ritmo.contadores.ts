import { Injectable, Logger } from "@nestjs/common";
import type { MotivoSemIp, RegraDeRitmo } from "../domain/portal-ritmo";

/** As duas portas do Portal que têm limitador, para o contador separar uma da outra. */
export type PortaDoRitmo = "ANONIMA" | "SESSAO";

export interface ResumoDoRitmo {
  /** Requisições em que um IP de cliente foi derivado com sucesso. */
  comIp: number;
  /** Requisições em que NÃO houve IP confiável, quebradas por motivo técnico. */
  semIp: Record<MotivoSemIp, number>;
  /** Recusas por regra e por porta. É o número que mede o colateral de CGNAT. */
  recusas: Record<PortaDoRitmo, Record<RegraDeRitmo, number>>;
  /** Desde quando a contagem corre (ela zera no reinício do processo, como os baldes). */
  desde: string;
}

/**
 * OS CONTADORES DO LIMITADOR (veto 2 da auditoria, mais a ressalva aprovada).
 *
 * ╔═ O VETO 2, EM UMA FRASE: HOJE A FALHA É SILENCIOSA NOS DOIS SENTIDOS ══════════════════════╗
 * ║ "Saltos declarado e nenhum IP confiável derivado" não contava nada e não registrava nada.   ║
 * ║ Alguém configura, acredita que fechou o veto, e o balde por IP segue MORTO: a porta cai      ║
 * ║ para o teto da superfície e nada no sistema diz isso em voz alta. A mesma cegueira vale ao   ║
 * ║ contrário: ninguém saberia dizer se a derivação passou a funcionar depois de um ajuste.     ║
 * ╚═════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ┌─ E A RESSALVA APROVADA, que é barata e responde uma pergunta que a trilha não responde ─────┐
 * │ O registro do estouro é ESTRANGULADO em uma linha por regra por minuto, de propósito (log de │
 * │ recusa em rota pública é amplificação). O preço é que a trilha não distingue UM abusador de  │
 * │ QUARENTA candidatos legítimos barrados atrás do mesmo CGNAT num disparo em lote. O contador  │
 * │ agregado responde isso sem custo e sem PII: são inteiros em memória.                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: NÃO HÁ ENDEREÇO AQUI, nem hash de endereço, nem CPF, nem rótulo que identifique pessoa.
 * São contagens e motivos técnicos de lista fechada. É o mínimo que responde à pergunta.
 *
 * ZERA NO REINÍCIO, como os baldes, e isso é dito no `desde` do resumo em vez de escondido: quem
 * lê o número precisa saber de quando ele conta.
 */
@Injectable()
export class PortalRitmoContadores {
  private readonly log = new Logger(PortalRitmoContadores.name);
  private readonly desde = new Date();
  private comIp = 0;
  private readonly semIp = new Map<MotivoSemIp, number>();
  private readonly recusas = new Map<string, number>();
  /** Último aviso emitido por motivo, para o WARN não virar a amplificação que ele denuncia. */
  private readonly ultimoAviso = new Map<MotivoSemIp, number>();

  private static readonly AVISO_INTERVALO_MS = 5 * 60_000;

  /**
   * Registra o desfecho da derivação do IP.
   *
   * O AVISO SÓ SAI QUANDO A CONFIGURAÇÃO DIZ QUE DEVIA TER FUNCIONADO, e é essa a distinção que
   * fecha o veto: `DESLIGADO` é o estado de nascença e não é defeito nenhum, então não avisa. Todo
   * o resto significa "alguém configurou e a topologia não é a declarada", que é exatamente o
   * silêncio que não podia continuar existindo.
   */
  registrarOrigem(motivo: MotivoSemIp | null, agoraMs: number = Date.now()): void {
    if (motivo === null) {
      this.comIp += 1;
      return;
    }
    this.semIp.set(motivo, (this.semIp.get(motivo) ?? 0) + 1);
    if (motivo === "DESLIGADO") return;

    const ultimo = this.ultimoAviso.get(motivo) ?? Number.NEGATIVE_INFINITY;
    if (agoraMs - ultimo < PortalRitmoContadores.AVISO_INTERVALO_MS) return;
    this.ultimoAviso.set(motivo, agoraMs);
    // §A.6: a mensagem repete o MOTIVO, que é rótulo fixo, e a contagem. Nenhum endereço.
    this.log.warn(
      `limite de ritmo do portal SEM IP CONFIAVEL (${motivo}): a topologia declarada nao bate com ` +
        `a que chega, entao o balde por IP nao esta rodando e sobra o teto de superficie. ` +
        `ocorrencias=${this.semIp.get(motivo)}`,
    );
  }

  /** Conta uma recusa. É o número que mede o colateral (quarenta legítimos x um abusador). */
  registrarRecusa(porta: PortaDoRitmo, regra: RegraDeRitmo): void {
    const chave = `${porta}:${regra}`;
    this.recusas.set(chave, (this.recusas.get(chave) ?? 0) + 1);
  }

  /** O retrato, para quem for construir a Sala De Segurança ou um health. Sem PII, por construção. */
  resumo(): ResumoDoRitmo {
    const semIp = {} as Record<MotivoSemIp, number>;
    for (const [motivo, n] of this.semIp) semIp[motivo] = n;
    const recusas = { ANONIMA: {}, SESSAO: {} } as ResumoDoRitmo["recusas"];
    for (const [chave, n] of this.recusas) {
      const [porta, regra] = chave.split(":") as [PortaDoRitmo, RegraDeRitmo];
      recusas[porta][regra] = n;
    }
    return { comIp: this.comIp, semIp, recusas, desde: this.desde.toISOString() };
  }
}
