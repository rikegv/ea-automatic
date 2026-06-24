import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { OriginGuard } from "./auth/guards/origin.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { DrizzleModule } from "./db/drizzle.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DrizzleModule,
    UsersModule,
    AuthModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    // Ordem dos guards globais: throttle → origin → autenticação → papel (§A.2/§A.3).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
