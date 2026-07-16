import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

// Porta própria do EA (namespace isolado do CentraAtend).
const PORT = Number(process.env.BACKEND_PORT ?? 3011);

/**
 * Achata os erros de validação em mensagens PLANAS, sem o caminho do campo.
 *
 * O formato padrão do Nest prefixa o DTO aninhado ("candidato.A data de nascimento é inválida"),
 * o que joga estrutura interna na cara do consultor e estraga justamente as mensagens que
 * escrevemos em linguagem de gente. Aqui devolvemos só o texto da regra, na mesma forma
 * (`message: string[]`) que o front já consome.
 */
function mensagensPlanas(erros: ValidationError[]): string[] {
  const out: string[] = [];
  const visitar = (lista: ValidationError[]): void => {
    for (const e of lista) {
      if (e.constraints) out.push(...Object.values(e.constraints));
      if (e.children?.length) visitar(e.children);
    }
  };
  visitar(erros);
  return out;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (erros) => new BadRequestException(mensagensPlanas(erros)),
    }),
  );
  await app.listen(PORT, "127.0.0.1");
}

void bootstrap();
