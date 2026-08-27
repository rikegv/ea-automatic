import { Module } from "@nestjs/common";
import { IfractalController } from "./ifractal.controller";
import { IfractalGestaoService } from "./ifractal-gestao.service";
import { IfractalStatusService } from "./ifractal-status.service";

/**
 * Frente iFractal: a visão de gestão e o catálogo de status gerenciável.
 *
 * A ABA da Esteira NÃO vive aqui: ela é a Esteira de sempre, com um tipo de frente a mais, servida
 * pela rota genérica `/esteira/:frente`. Este módulo é só o menu gerencial.
 */
@Module({
  controllers: [IfractalController],
  providers: [IfractalStatusService, IfractalGestaoService],
  exports: [IfractalStatusService],
})
export class IfractalModule {}
