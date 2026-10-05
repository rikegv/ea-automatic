-- EDITAR E EXCLUIR VAGA JA LIBERADA (Central de Vagas, 05/10/2026). Ver docs/MAPA-CRUD-VAGA-LIBERADA.md.
--
-- As duas tabelas NAO TEM FK para "vagas", e e desenho (E-6 do veto do seguranca): CASCADE apagaria a
-- trilha junto com a vaga excluida, NO ACTION impediria excluir vaga editada, SET NULL perderia o
-- vinculo. Elas existem justamente para sobreviver a vaga.
--
-- Sec. A.6: "de"/"para" so carregam valor nos campos de TIPO FECHADO; texto livre grava
-- valor_omitido = true com os dois nulos. O instantaneo da exclusao leva so tipo fechado.

CREATE TABLE IF NOT EXISTS "vaga_edicoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vaga_id" uuid NOT NULL,
  -- QUEM editou, da sessao. Autoria e trilha, nunca campo de formulario.
  "por_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
  "em" timestamp with time zone DEFAULT now() NOT NULL,
  "campo" varchar(40) NOT NULL,
  "de" text,
  "para" text,
  "valor_omitido" boolean NOT NULL,
  -- A LISTA FECHADA de campos da trilha, a mesma de VAGA_EDICAO_CAMPOS_DA_TRILHA (domain/vaga-edicao.ts).
  CONSTRAINT "ck_vaga_edicoes_campo" CHECK ("campo" IN ('cargoId', 'nomeDivulgacao', 'codCliente', 'natureza', 'vinculo', 'sazonalidade', 'linhaServicoId', 'cidadeId', 'segmentoId', 'comercialId', 'posicoesOficiais', 'posicoesBanco', 'escolaridade', 'salarioAbertura', 'dataAbertura', 'dataLimite', 'solicitanteNome', 'solicitanteTelefone', 'solicitanteEmail', 'dataSolicitacao', 'dataAlinhamento', 'dataRealinhamento', 'tempoContrato', 'motivo', 'justificativaMotivo', 'tipoSubstituicao', 'substituidoNome', 'substituidoCpf', 'localTrabalho', 'regiaoEstado', 'regioes', 'regioesOutras', 'horarioEscala', 'modeloTrabalho', 'detalheHibrido', 'confidencial', 'divulgarEmpresa', 'faixaEtaria', 'genero', 'idiomasExigidos', 'idiomasOutros', 'cursosConhecimentos', 'testes', 'testesOutro', 'experiencia', 'atribuicoes', 'perfilComportamental', 'ambiente', 'etapasPs', 'etapasPsOutra', 'observacoes', 'consultorId', 'recruiterId', 'beneficios', 'entrevistasRemovidas')),
  -- Linha "alterado" nao carrega valor nenhum: o banco garante o que o servico promete.
  CONSTRAINT "ck_vaga_edicoes_omitido_sem_valor"
    CHECK ("valor_omitido" = false OR ("de" IS NULL AND "para" IS NULL))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vaga_edicoes_vaga" ON "vaga_edicoes" ("vaga_id", "em");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vaga_exclusoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vaga_id" uuid NOT NULL,
  "codigo" varchar(40),
  "id_vacancy_pandape" varchar(40),
  "por_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
  "em" timestamp with time zone DEFAULT now() NOT NULL,
  "instantaneo" jsonb NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vaga_exclusoes_vaga" ON "vaga_exclusoes" ("vaga_id");
