import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { StagingService } from "./staging.service";

/**
 * Expurgo por TTL da staging efêmera (§A.6 / F2). Sweep in-process a cada 1h (mesmo padrão do
 * ExpurgoService; BullMQ fica reservado à fila do Pandapé). Regras:
 *   - dir de admissão com mtime > 48h  → removido (admissão que nunca fechou a régua);
 *   - arquivo em `_kits` com mtime > 2h → removido (janela do resultado do Gerador de Kit).
 * O mtime é o relógio — não há tabela de metadados de arquivo (§A.6). Loga só contagens.
 */
@Injectable()
export class StagingPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("StagingPurgeService");
  private timer?: NodeJS.Timeout;
  private static readonly INTERVALO_MS = 60 * 60 * 1000; // 1h
  private static readonly TTL_ADMISSAO_MS = 48 * 60 * 60 * 1000; // 48h
  // Janela do resultado do Gerador de Kit: o resultado processado (e as origens para o download)
  // ficam disponíveis por no mínimo 2h, mesmo se o consultor sair da tela e voltar. Depois, §A.6.
  private static readonly TTL_KIT_MS = 2 * 60 * 60 * 1000; // 2h

  constructor(private readonly staging: StagingService) {}

  onModuleInit(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), StagingPurgeService.INTERVALO_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Varre a raiz da staging e remove o que passou do TTL. Retorna quantos itens removeu. */
  async sweep(): Promise<number> {
    const raiz = this.staging.raiz();
    let entradas;
    try {
      entradas = await readdir(raiz, { withFileTypes: true });
    } catch {
      return 0; // raiz ainda não existe — nada a expurgar.
    }
    const agora = Date.now();
    let removidos = 0;

    for (const e of entradas) {
      const caminho = join(raiz, e.name);
      try {
        if (e.name === StagingService.KITS_DIR) {
          removidos += await this.purgarKits(caminho, agora);
        } else if (e.isDirectory()) {
          const st = await stat(caminho);
          if (agora - st.mtimeMs > StagingPurgeService.TTL_ADMISSAO_MS) {
            await rm(caminho, { recursive: true, force: true });
            removidos++;
          }
        }
      } catch (err) {
        this.logger.warn(
          `Falha ao expurgar ${e.name}: ${err instanceof Error ? err.message : "erro"}`,
        );
      }
    }

    if (removidos > 0) this.logger.log(`Staging: ${removidos} item(ns) expurgado(s) por TTL.`);
    return removidos;
  }

  private async purgarKits(kitsDir: string, agora: number): Promise<number> {
    let nomes: string[];
    try {
      nomes = await readdir(kitsDir);
    } catch {
      return 0;
    }
    let n = 0;
    for (const nome of nomes) {
      const f = join(kitsDir, nome);
      const st = await stat(f);
      if (agora - st.mtimeMs > StagingPurgeService.TTL_KIT_MS) {
        await rm(f, { force: true });
        n++;
      }
    }
    return n;
  }
}
