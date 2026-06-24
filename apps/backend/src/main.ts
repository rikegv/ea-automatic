import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// Porta própria do EA (namespace isolado do CentraAtend). NÃO sobe na Fase 0.
const PORT = Number(process.env.BACKEND_PORT ?? 3011);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  await app.listen(PORT, "127.0.0.1");
}

void bootstrap();
