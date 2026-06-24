import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDb } from "./client";

export const DRIZZLE = Symbol("DRIZZLE");

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>("DATABASE_URL");
        return createDb(url).db;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
