import { Module } from "@nestjs/common";
import { PandapeEntradaService } from "./pandape-entrada.service";
import { PandapeNomeCacheService } from "./pandape-nome-cache.service";
import { PandapeEntradaRetencaoService } from "./pandape-entrada-retencao.service";

/**
 * Módulo do REGISTRO DURÁVEL das entradas do Pandapé (OST 15/09/2026).
 *
 * FOLHA de propósito, no mesmo espírito do `PandapeQueueModule`: depende só do DRIZZLE (global) e do
 * cache em memória, então pode ser importado tanto pelo módulo da FILA (que registra o descarte por
 * jobId ocupado) quanto pelo `PandapeModule` (porta e worker), sem ciclo e sem duas instâncias do
 * cache de nomes, que precisa ser ÚNICO: worker e HTTP são o mesmo processo, e é isso que permite o
 * nome nunca sair da memória.
 */
@Module({
  providers: [PandapeEntradaService, PandapeNomeCacheService, PandapeEntradaRetencaoService],
  exports: [PandapeEntradaService, PandapeNomeCacheService],
})
export class PandapeEntradaModule {}
