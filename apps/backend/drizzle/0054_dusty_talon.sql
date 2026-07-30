ALTER TABLE "admissoes" ADD COLUMN "troca_cliente_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "troca_cliente_por" uuid;--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_troca_cliente_por_usuarios_id_fk" FOREIGN KEY ("troca_cliente_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;