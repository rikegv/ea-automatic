import { Module } from "@nestjs/common";
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
  providers: [PandapeQueueService],
  exports: [PandapeQueueService],
})
export class PandapeQueueModule {}
