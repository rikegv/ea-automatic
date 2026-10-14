-- ESTADO CONSULTAVEL DA FALHA DE EMISSAO DO LINK DO PORTAL (12/10/2026, frente A.1).
--
-- PARA QUE: o gancho de emissao do link na liberacao (`AdmissoesService.liberar` e `liberarEmLote`)
-- era best-effort e ENGOLIA a excecao em silencio: so logava o nome da classe do erro, sem gravar
-- estado nem retentar. O candidato ficava liberado e SEM link, e a falha sumia sem rastro no banco.
-- Estas tres colunas tornam "liberou e o link nao saiu" uma CONSULTA, alimentam o sinal "Sem Link"
-- do Gerenciador do Portal e a fila de retry (BullMQ).
--
--   portal_link_falha_em      quando a ultima tentativa automatica falhou (nulo = sem falha pendente)
--   portal_link_falha_motivo  SO o CODIGO do motivo (catalogo fechado), nunca texto livre
--   portal_link_tentativas    quantas tentativas automaticas ja foram feitas (0 = nenhuma falha)
--
-- SUCESSO LIMPA O ESTADO: quando a emissao enfim entrega, os tres voltam a (null, null, 0).
--
-- TAXONOMIA (decisao do diretor): (a) recusa legitima (fluxo-2, link vivo em uso) NAO carimba;
-- (b) falha transitoria (canal de e-mail fora, excecao inesperada) carimba + retry; (c) dado
-- faltando (e-mail invalido/ausente) carimba SEM retry e vira fila de "corrigir e reemitir".
--
-- ADITIVA (sec. A.27): `ADD COLUMN IF NOT EXISTS`, nada e apagado nem renomeado. Default 0 em
-- `tentativas` para as admissoes existentes nascerem sem falha. Sec. A.6: `portal_link_falha_motivo`
-- guarda SO o codigo do catalogo (`MotivoDeRecusaDeEnvio` + `EXCECAO_INESPERADA`), NUNCA e-mail,
-- link, token, CPF, nome nem id de pessoa.
ALTER TABLE "admissoes" ADD COLUMN IF NOT EXISTS "portal_link_falha_em" timestamptz;
ALTER TABLE "admissoes" ADD COLUMN IF NOT EXISTS "portal_link_falha_motivo" varchar(40);
ALTER TABLE "admissoes" ADD COLUMN IF NOT EXISTS "portal_link_tentativas" integer NOT NULL DEFAULT 0;
