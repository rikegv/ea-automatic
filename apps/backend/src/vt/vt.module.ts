import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { VtController } from "./vt.controller";
import { VtSessaoGuard } from "./vt-sessao.guard";
import { VtService } from "./vt.service";

/**
 * Formulário de VT online do candidato (§A.17 etapa 2). JwtModule já é global no AppModule;
 * AiModule entra pela composição do PDF (o ai-service é quem monta o documento).
 */
@Module({
  imports: [ConfigModule, AiModule],
  controllers: [VtController],
  providers: [VtService, VtSessaoGuard],
})
export class VtModule {}
