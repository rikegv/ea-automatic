import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminModule } from "./admin/admin.module";
import { AdmissoesModule } from "./admissoes/admissoes.module";
import { AiModule } from "./ai/ai.module";
import { AuditoriaModule } from "./auditoria/auditoria.module";
import { AuthModule } from "./auth/auth.module";
import { ClicksignModule } from "./clicksign/clicksign.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { OriginGuard } from "./auth/guards/origin.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { MenuGuard } from "./auth/guards/menu.guard";
import { MenusModule } from "./auth/menus.module";
import { DiagnosticoModule } from "./diagnostico/diagnostico.module";
import { SenhaTemporariaGuard } from "./auth/guards/senha-temporaria.guard";
import { DrizzleModule } from "./db/drizzle.module";
import { EsteiraModule } from "./esteira/esteira.module";
import { KitModule } from "./kit/kit.module";
import { NaoConformidadesModule } from "./nao-conformidades/nao-conformidades.module";
import { PandapeModule } from "./pandape/pandape.module";
import { ReauditoriaModule } from "./reauditoria/reauditoria.module";
import { ReguaModule } from "./regua/regua.module";
import { StagingModule } from "./staging/staging.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { UsersModule } from "./users/users.module";
import { VtModule } from "./vt/vt.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DrizzleModule,
    UsersModule,
    AuthModule,
    MenusModule,
    AdminModule,
    AdmissoesModule,
    EsteiraModule,
    NaoConformidadesModule,
    AiModule,
    StagingModule,
    ReguaModule,
    AuditoriaModule,
    KitModule,
    PandapeModule,
    ReauditoriaModule,
    ClicksignModule,
    VtModule,
    DiagnosticoModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    // Ordem dos guards globais: throttle → origin → autenticação → senha temporária → papel
    // (§A.2/§A.3 + OST-EA-GESTAO-USUARIOS). O SenhaTemporariaGuard vem logo após o JwtAuthGuard
    // (que popula req.user) e antes do RolesGuard: força a troca de senha no primeiro acesso.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SenhaTemporariaGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Permissão de MENU por usuário (OST): por último, depois de papel. Admin tem bypass; operação
    // não reivindicada por menu passa (leitura de catálogo aberta). Ver `MenuGuard`.
    { provide: APP_GUARD, useClass: MenuGuard },
  ],
})
export class AppModule {}
