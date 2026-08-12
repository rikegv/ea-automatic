import { Module } from "@nestjs/common";
import { BeneficiosFilaController } from "./beneficios-fila.controller";
import { BeneficiosFilaService } from "./beneficios-fila.service";

/** Fila de Benefícios (§A.17 etapa 4). Leitura pura sobre o carimbo `beneficios_entrou_em`. */
@Module({
  controllers: [BeneficiosFilaController],
  providers: [BeneficiosFilaService],
})
export class BeneficiosFilaModule {}
