import { Module } from "@nestjs/common";
import { AssinanteEmpresaService } from "./assinante-empresa.service";

/**
 * Módulo enxuto do ASSINANTE DA EMPRESA (INT-4). Isolado porque dois lados o consomem: o
 * `ClicksignModule` (que resolve quem assina ao montar o envelope) e o `AdminModule` (a tela de
 * cadastro). Sem ele, um teria de importar o outro e criaria acoplamento desnecessário.
 */
@Module({
  providers: [AssinanteEmpresaService],
  exports: [AssinanteEmpresaService],
})
export class AssinanteEmpresaModule {}
