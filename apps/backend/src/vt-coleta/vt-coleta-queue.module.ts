import { Module } from "@nestjs/common";
import { VtColetaQueueService } from "./vt-coleta-queue.service";

/**
 * Módulo só do PRODUTOR da fila da coleta de VT. Isolado para o mesmo motivo do
 * `PandapeQueueModule`: quebrar dependências cíclicas. O produtor não depende de nada local (só de
 * `ConfigService` + Redis), então quem precisa enfileirar (controller, diagnóstico) importa este
 * módulo sem arrastar o worker nem o núcleo.
 */
@Module({
  providers: [VtColetaQueueService],
  exports: [VtColetaQueueService],
})
export class VtColetaQueueModule {}
