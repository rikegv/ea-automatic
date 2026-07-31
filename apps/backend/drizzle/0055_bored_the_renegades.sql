ALTER TABLE "dados_vaga_folha" ADD COLUMN "possui_uniforme" boolean;--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "uniforme_camiseta" varchar(4);--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "uniforme_calca" varchar(4);--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "uniforme_bota" varchar(4);--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "possui_epi" boolean;--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "epi_itens" text;--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "epi_outros" varchar(200);