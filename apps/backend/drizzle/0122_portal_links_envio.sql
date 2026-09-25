-- PORTAL DO CANDIDATO: O CARIMBO DO ENVIO DO LINK (automático pelo funil, manual pelo Gerenciador).
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0116, da 0119, da 0120 e da 0121: o `drizzle-kit` não gera
-- comentário nem `IF NOT EXISTS`, e regenerar este SQL apaga as duas coisas.
--
-- ══ POR QUE O REGISTRO MORA AQUI, E NÃO SÓ EM `portal_eventos` ═════════════════════════════════
--
-- A trilha do portal TEM RETENÇÃO DECLARADA (90 dias, 12 e 24 meses) e `PortalTrilhaService.
-- registrar` ENGOLE falha de gravação de propósito, para que um erro de log não derrube um envio.
-- As duas coisas são certas para uma trilha e erradas para um DADO OPERACIONAL: o Gerenciador do
-- Portal precisa responder "este link foi enviado? quando? por quem? por qual caminho?" hoje e
-- daqui a dois anos, e não pode responder "não" porque o expurgo passou ou porque um insert falhou
-- em silêncio. É a MESMA razão pela qual `primeiro_acesso_em` virou coluna (0120) em vez de ser
-- contado a partir de `PORTAL_LINK_ABERTO`.
--
-- ══ O QUE ESTAS COLUNAS NÃO SÃO: UM SEGUNDO ESTADO DO LINK ═════════════════════════════════════
--
-- Envio NÃO decide se o link está VIVO. A precedência continua sendo REVOGADO > BLOQUEADO >
-- SUSPENSO > VENCIDO > VIVO, e nenhuma destas quatro colunas entra nela. Por isso elas NÃO foram
-- acrescentadas à projeção `COLUNAS_DO_LINK` (`portal/portal-link-colunas.ts`), que existe para
-- que restrição nova não fique de fora de uma das cinco leituras de estado: pôr envio lá dentro
-- diluiria justamente a afirmação que aquela constante faz (tudo que está nela FECHA a porta).
--
-- ┌─ §A.6 (LGPD): NENHUMA COLUNA DE ENDEREÇO, NEM EM CLARO NEM HASHEADA ────────────────────────┐
-- │ Endereço em claro em qualquer tabela é VETO da auditoria (exigência S6), e um hash não        │
-- │ resolveria: e-mail tem espaço de busca pequeno e dicionário pronto, então `sha256(email)` é   │
-- │ o próprio e-mail para quem tiver a lista, e ainda por cima vira chave de correlação entre     │
-- │ candidatos. O DESTINO É DERIVADO NA LEITURA, MASCARADO (`f****o@empresa.com`), a partir de    │
-- │ `candidatos.email`, que é onde o cadastro já mora e onde o titular já o mantém.               │
-- │                                                                                               │
-- │ O que estas colunas guardam é CARIMBO, CANAL, CAMINHO e AUTOR (usuário do EA). Nada do        │
-- │ candidato: nenhum e-mail, nenhum CPF, nenhum nome e nenhuma URL do link (a URL é credencial,  │
-- │ no mesmo regime do token e da URL assinada do armazenamento).                                  │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ══ POR QUE `envio_canal` E `envio_origem` SÃO COLUNAS, E NÃO UM BOOLEANO ══════════════════════
--
-- `envio_canal` nasce com UM valor possível (`EMAIL`) porque o diretor fechou "só e-mail por ora,
-- WhatsApp depois". Um `enviado_por_email boolean` teria de ser desfeito no dia do WhatsApp, e é
-- nessa troca que as duas verdades passam a conviver.
--
-- `envio_origem` é o item 4 da OST em forma de dado ("todo link aparece no Gerenciador,
-- INDEPENDENTE da origem"): `AUTOMATICO` é o disparo do "Enviar Para Admissão" no funil de A&S,
-- `MANUAL` é o RH gerando e enviando pelo Gerenciador. Os dois passam pela MESMA emissão, então a
-- coluna é o único lugar onde a diferença sobrevive.
--
-- SEM CHECK NOS DOIS, de propósito e no mesmo espírito do `tipo` de `portal_eventos`: o catálogo
-- vive em código (`CANAIS_DE_ENVIO_DO_LINK` e `ORIGENS_DE_ENVIO_DO_LINK`, em `shared-types`), e
-- acrescentar o WhatsApp não pode exigir migration.
--
-- TODAS NULAS: nulo é "este link nunca foi enviado por canal nenhum", que é a verdade de todo link
-- emitido até hoje (a emissão manual devolve a URL na tela e quem a entrega é o consultor, à mão).
-- Nenhuma carga reescreve linha nenhuma.
ALTER TABLE "portal_links" ADD COLUMN IF NOT EXISTS "enviado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portal_links" ADD COLUMN IF NOT EXISTS "envio_canal" varchar(20);--> statement-breakpoint
ALTER TABLE "portal_links" ADD COLUMN IF NOT EXISTS "envio_origem" varchar(20);--> statement-breakpoint
ALTER TABLE "portal_links" ADD COLUMN IF NOT EXISTS "enviado_por_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_enviado_por_id_usuarios_id_fk"
    FOREIGN KEY ("enviado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
