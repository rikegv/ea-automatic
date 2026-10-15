import { Module } from "@nestjs/common";
import { RelatorioController } from "./relatorio.controller";

/**
 * Exportação genérica em xlsx (OST das ondas, Onda 2). Sem providers: o controller chama a função
 * pura `gerarXlsxGenerico`. Registrado no AppModule.
 */
@Module({
  controllers: [RelatorioController],
})
export class RelatorioModule {}
