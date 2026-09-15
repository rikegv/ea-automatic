import { Module } from "@nestjs/common";
import { PandapeEntradaModule } from "./pandape-entrada.module";
import { PandapeQueueService } from "./pandape-queue.service";

/**
 * Módulo só do PRODUTOR da fila do Pandapé.
 *
 * Existe para quebrar o ciclo de dependência: o `PandapeModule` já importa o `AdmissoesModule` (a
 * sync reusa `AdmissoesService`), então o `AdmissoesModule` não pode importar o `PandapeModule` de
 * volta para enfileirar o pull de documentos na liberação. O `PandapeQueueService` não depende de
 * nada local (só de `ConfigService` + Redis), então isolá-lo aqui deixa os dois lados importarem o
 * MESMO produtor, sem ciclo e sem duplicar fila.
 */
@Module({
  // O produtor registra UM desfecho: o descarte por jobId ocupado (exigência 3 da auditoria), que
  // nenhum worker chega a ver. O `PandapeEntradaModule` é folha (só DRIZZLE + memória), então não
  // reintroduz o ciclo que este módulo existe para quebrar.
  imports: [PandapeEntradaModule],
  providers: [PandapeQueueService],
  exports: [PandapeQueueService],
})
export class PandapeQueueModule {}
