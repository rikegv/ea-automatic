DROP INDEX "uq_assinante_empresa_cliente";--> statement-breakpoint
DROP INDEX "uq_assinante_empresa_padrao";--> statement-breakpoint
ALTER TABLE "assinante_empresa" ADD COLUMN "ordem" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assinante_empresa_cpf_cliente" ON "assinante_empresa" USING btree ("cod_cliente","cpf") WHERE "assinante_empresa"."cod_cliente" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assinante_empresa_cpf_padrao" ON "assinante_empresa" USING btree ("cpf") WHERE "assinante_empresa"."cod_cliente" is null;--> statement-breakpoint
ALTER TABLE "assinante_empresa" ADD CONSTRAINT "ck_assinante_empresa_ordem" CHECK ("assinante_empresa"."ordem" >= 1);