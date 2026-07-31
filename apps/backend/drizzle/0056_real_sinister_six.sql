ALTER TYPE "public"."tipo_servico" ADD VALUE 'APRENDIZ';--> statement-breakpoint
ALTER TABLE "cliente_beneficio_padrao" DROP CONSTRAINT "uq_cliente_beneficio_padrao";--> statement-breakpoint
ALTER TABLE "cliente_pendencia_config" DROP CONSTRAINT "uq_cliente_pendencia";--> statement-breakpoint
DROP INDEX "uq_assinante_empresa_cpf_cliente";--> statement-breakpoint
ALTER TABLE "regua_documental" DROP CONSTRAINT "regua_documental_cod_cliente_cargo_id_tipo_documento_id_pk";--> statement-breakpoint
ALTER TABLE "assinante_empresa" ADD COLUMN "cliente_vinculo_id" uuid;--> statement-breakpoint
ALTER TABLE "cliente_beneficio_padrao" ADD COLUMN "cliente_vinculo_id" uuid;--> statement-breakpoint
ALTER TABLE "cliente_pendencia_config" ADD COLUMN "cliente_vinculo_id" uuid;--> statement-breakpoint
ALTER TABLE "regua_documental" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "regua_documental" ADD CONSTRAINT "regua_documental_id_pk" PRIMARY KEY("id");--> statement-breakpoint
ALTER TABLE "regua_documental" ADD COLUMN "cliente_vinculo_id" uuid;--> statement-breakpoint
ALTER TABLE "assinante_empresa" ADD CONSTRAINT "assinante_empresa_cliente_vinculo_id_cliente_vinculos_id_fk" FOREIGN KEY ("cliente_vinculo_id") REFERENCES "public"."cliente_vinculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_beneficio_padrao" ADD CONSTRAINT "cliente_beneficio_padrao_cliente_vinculo_id_cliente_vinculos_id_fk" FOREIGN KEY ("cliente_vinculo_id") REFERENCES "public"."cliente_vinculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_pendencia_config" ADD CONSTRAINT "cliente_pendencia_config_cliente_vinculo_id_cliente_vinculos_id_fk" FOREIGN KEY ("cliente_vinculo_id") REFERENCES "public"."cliente_vinculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua_documental" ADD CONSTRAINT "regua_documental_cliente_vinculo_id_cliente_vinculos_id_fk" FOREIGN KEY ("cliente_vinculo_id") REFERENCES "public"."cliente_vinculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assinante_empresa_cpf_vinculo" ON "assinante_empresa" USING btree ("cliente_vinculo_id","cpf") WHERE "assinante_empresa"."cliente_vinculo_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cliente_beneficio_padrao" ON "cliente_beneficio_padrao" USING btree ("cod_cliente","beneficio") WHERE "cliente_beneficio_padrao"."cliente_vinculo_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vinculo_beneficio_padrao" ON "cliente_beneficio_padrao" USING btree ("cliente_vinculo_id","beneficio") WHERE "cliente_beneficio_padrao"."cliente_vinculo_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cliente_pendencia" ON "cliente_pendencia_config" USING btree ("cod_cliente","chave") WHERE "cliente_pendencia_config"."cliente_vinculo_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vinculo_pendencia" ON "cliente_pendencia_config" USING btree ("cliente_vinculo_id","chave") WHERE "cliente_pendencia_config"."cliente_vinculo_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_regua_cliente" ON "regua_documental" USING btree ("cod_cliente","cargo_id","tipo_documento_id") WHERE "regua_documental"."cliente_vinculo_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_regua_vinculo" ON "regua_documental" USING btree ("cliente_vinculo_id","cargo_id","tipo_documento_id") WHERE "regua_documental"."cliente_vinculo_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assinante_empresa_cpf_cliente" ON "assinante_empresa" USING btree ("cod_cliente","cpf") WHERE "assinante_empresa"."cod_cliente" is not null and "assinante_empresa"."cliente_vinculo_id" is null;--> statement-breakpoint
ALTER TABLE "cliente_vinculos" ADD CONSTRAINT "uq_cliente_vinculo_tipo" UNIQUE("cod_cliente","tipo_servico");