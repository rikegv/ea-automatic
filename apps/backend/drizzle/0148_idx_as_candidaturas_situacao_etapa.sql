-- Paginacao no servidor da Central de Candidatos e da aba Ver Candidatos (07/10/2026).
--
-- Indice ADITIVO e IDEMPOTENTE para os group-bys e filtros que a paginacao passou a rodar sempre no
-- servidor: o `kpisDaBusca` agrega por situacao e por etapa sobre o conjunto filtrado inteiro, e o
-- recorte da vaga (aba alocados, filtro de situacao/etapa) casa por (situacao, etapa). Sem o indice,
-- cada carga varre `as_candidaturas` inteira.
--
-- NAO MEXE EM NENHUMA COLUNA, NAO DERRUBA NADA: `IF NOT EXISTS` deixa a migration segura de re-aplicar
-- em producao e na homologacao. Sec. A.6: indice sobre codigos de catalogo (situacao/etapa), nenhum
-- dado pessoal.
CREATE INDEX IF NOT EXISTS idx_as_candidaturas_situacao_etapa
  ON as_candidaturas (situacao, etapa);
