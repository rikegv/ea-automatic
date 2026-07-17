-- Dedup Pandapé: idVacancy desnormalizado em admissoes + possivel_duplicata (flag) + UNIQUE PARCIAL
-- (candidato_cpf + id_vacancy) só entre faróis VIVOS e com id_vacancy não nulo (não barra wizard manual
-- nem 2ª admissão da mesma pessoa em vaga diferente ou com histórico terminal, §A.16). Anti-corrida.
ALTER TABLE "admissoes" ADD COLUMN "id_vacancy" varchar(80);--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "possivel_duplicata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_admissao_cpf_vaga_viva" ON "admissoes" USING btree ("candidato_cpf","id_vacancy") WHERE "admissoes"."id_vacancy" is not null and "admissoes"."farol_global" in ('EM_ADMISSAO','BANCO_AGUARDAR','AGUARDANDO_LIBERACAO');