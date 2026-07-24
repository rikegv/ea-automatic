CREATE TABLE "documento_arquivos_coletados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"tipo_documento_id" uuid NOT NULL,
	"hash_conteudo" varchar(64) NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_arquivo_coletado_admissao_hash" UNIQUE("admissao_id","hash_conteudo")
);
--> statement-breakpoint
ALTER TABLE "documento_arquivos_coletados" ADD CONSTRAINT "documento_arquivos_coletados_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_arquivos_coletados" ADD CONSTRAINT "documento_arquivos_coletados_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_arquivo_coletado_admissao_tipo" ON "documento_arquivos_coletados" USING btree ("admissao_id","tipo_documento_id");