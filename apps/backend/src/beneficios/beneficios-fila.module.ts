import { Module } from "@nestjs/common";
import { BeneficiosFilaController } from "./beneficios-fila.controller";
import { BeneficiosFilaService } from "./beneficios-fila.service";
import { RegrasBeneficioController } from "./regras-beneficio.controller";
import { RegrasBeneficioService } from "./regras-beneficio.service";

/**
 * Fila de Benefícios (§A.17 etapa 4). Leitura pura sobre o carimbo `beneficios_entrou_em`.
 *
 * As REGRAS de benefício por cliente (onda 2) entram aqui como controller e serviço PRÓPRIOS, sem
 * alterar os da fila: mesmo menu e mesma tela, recortes distintos (cliente e admissão).
 */
@Module({
  controllers: [BeneficiosFilaController, RegrasBeneficioController],
  providers: [BeneficiosFilaService, RegrasBeneficioService],
})
export class BeneficiosFilaModule {}
