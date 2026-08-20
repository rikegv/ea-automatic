-- ============================================================================
-- ANONIMIZAÇÃO DO CLONE DE HOMOLOGAÇÃO (§A.6 / LGPD)
--
-- Roda SEMPRE contra `ea_automatic_homolog`, NUNCA contra produção. O script `clonar.sh` recusa
-- rodar em qualquer outro database (guard no topo), porque um erro de digitação aqui destruiria a
-- base real de forma irreversível.
--
-- Princípio: minimização. A homologação precisa de VOLUME e de FORMA (CPF válido de 11 dígitos, nome
-- com espaço, e-mail com arroba, data plausível) para as telas se comportarem como em produção. Ela
-- NÃO precisa de uma única pessoa real.
-- ============================================================================

\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF current_database() <> 'ea_automatic_homolog' THEN
    RAISE EXCEPTION 'RECUSADO: anonimização só roda em ea_automatic_homolog (atual: %)', current_database();
  END IF;
END
$guard$;

-- ── Gerador de CPF VÁLIDO e determinístico ──────────────────────────────────
-- Precisa ser VÁLIDO (dígito verificador correto) porque `isValidCpf` governa telas, exportação e o
-- mascaramento do Clicksign: CPF inválido faria a homologação se comportar diferente da produção
-- justamente nas bordas que interessa testar. Mesmo algoritmo de `shared-types/index.ts`.
CREATE OR REPLACE FUNCTION hml_cpf_valido(base bigint) RETURNS text AS $$
DECLARE
  nove text := lpad(((base % 899999999) + 100000000)::text, 9, '0');
  d int[] := ARRAY[]::int[];
  i int; soma int; d1 int; d2 int;
BEGIN
  FOR i IN 1..9 LOOP d := d || substr(nove, i, 1)::int; END LOOP;

  soma := 0;
  FOR i IN 1..9 LOOP soma := soma + d[i] * (11 - i); END LOOP;
  d1 := (soma * 10) % 11; IF d1 = 10 THEN d1 := 0; END IF;

  d := d || d1;
  soma := 0;
  FOR i IN 1..10 LOOP soma := soma + d[i] * (12 - i); END LOOP;
  d2 := (soma * 10) % 11; IF d2 = 10 THEN d2 := 0; END IF;

  RETURN nove || d1::text || d2::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 1. CPF do candidato (chave primária, com filho em `admissoes`) ───────────
-- `admissoes.candidato_cpf` referencia `candidatos.cpf` com NO ACTION, então pai e filho têm de
-- mudar no mesmo instante. `session_replication_role = replica` suspende os gatilhos de FK durante a
-- troca; a integridade é RECONFERIDA no fim do script, com contagem, e não na base da confiança.
CREATE TABLE hml_cpf_map AS
SELECT
  cpf AS antigo,
  CASE
    -- Identidade PROVISÓRIA (`PROV` + 7, os 48 declínios sem CPF): continua NÃO numérica de
    -- propósito. É o que mantém `isValidCpf` false e preserva o comportamento que o sistema já tem
    -- para essa classe. Trocar por CPF numérico faria a homologação mentir sobre eles.
    WHEN cpf !~ '^[0-9]{11}$'
      THEN 'PROV' || lpad(to_hex(row_number() OVER (ORDER BY cpf))::text, 7, '0')
    ELSE hml_cpf_valido(100000000 + row_number() OVER (ORDER BY cpf))
  END AS novo
FROM candidatos;

CREATE UNIQUE INDEX ON hml_cpf_map (antigo);

SET session_replication_role = replica;

UPDATE admissoes a SET candidato_cpf = m.novo FROM hml_cpf_map m WHERE a.candidato_cpf = m.antigo;
UPDATE candidatos c SET cpf = m.novo FROM hml_cpf_map m WHERE c.cpf = m.antigo;

SET session_replication_role = origin;

-- ── 2. Demais dados pessoais do candidato ───────────────────────────────────
-- Nome com DOIS termos de propósito: várias telas quebram nome em primeiro/último e a exportação
-- ordena por nome. Um nome de palavra única esconderia esses defeitos.
UPDATE candidatos c SET
  nome            = 'Candidato ' || s.n || ' Homolog',
  email           = 'candidato' || s.n || '@homolog.local',
  telefone        = '119' || lpad((10000000 + s.n)::text, 8, '0'),
  data_nascimento = CASE WHEN c.data_nascimento IS NULL THEN NULL
                         ELSE DATE '1980-01-01' + (((s.n * 37) % 9000)::int) END,
  banco           = CASE WHEN c.banco IS NULL THEN NULL ELSE 'Banco Homolog' END,
  agencia         = CASE WHEN c.agencia IS NULL THEN NULL ELSE '0001' END,
  conta           = CASE WHEN c.conta IS NULL THEN NULL ELSE lpad(s.n::text, 8, '0') || '-0' END
FROM (SELECT cpf, row_number() OVER (ORDER BY cpf) AS n FROM candidatos) s
WHERE c.cpf = s.cpf;

-- ── 3. Sala de espera (CPF OPCIONAL, tabela própria, sem FK para candidatos) ─
UPDATE sala_espera se SET
  cpf             = CASE WHEN se.cpf IS NULL THEN NULL ELSE hml_cpf_valido(700000000 + s.n) END,
  nome            = 'Espera ' || s.n || ' Homolog',
  email           = CASE WHEN se.email IS NULL THEN NULL ELSE 'espera' || s.n || '@homolog.local' END,
  telefone        = CASE WHEN se.telefone IS NULL THEN NULL ELSE '119' || lpad((20000000 + s.n)::text, 8, '0') END,
  data_nascimento = CASE WHEN se.data_nascimento IS NULL THEN NULL
                         ELSE DATE '1985-01-01' + (((s.n * 41) % 9000)::int) END
FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM sala_espera) s
WHERE se.id = s.id;

-- ── 4. CPF de SUBSTITUIÇÃO (§A.3 regra 10, o dado com TTL de 48h) ───────────
UPDATE dados_vaga_folha d SET
  substituido_cpf  = CASE WHEN d.substituido_cpf IS NULL THEN NULL ELSE hml_cpf_valido(800000000 + s.n) END,
  substituido_nome = CASE WHEN d.substituido_nome IS NULL THEN NULL ELSE 'Substituido ' || s.n || ' Homolog' END
FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM dados_vaga_folha) s
WHERE d.id = s.id;

-- ── 5. Signatários da empresa (pessoas reais do Grupo Soulan) ───────────────
UPDATE assinante_empresa a SET
  nome  = 'Assinante ' || s.n || ' Homolog',
  email = 'assinante' || s.n || '@homolog.local',
  cpf   = CASE WHEN a.cpf IS NULL THEN NULL ELSE hml_cpf_valido(900000000 + s.n) END
FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM assinante_empresa) s
WHERE a.id = s.id;

-- ── 6. Endereço residencial do candidato (formulário de VT) ─────────────────
-- CEP e logradouro de VT são a MORADA da pessoa. O total de tarifa fica intacto: é o número que a
-- tela calcula e o que interessa testar.
UPDATE formularios_vt SET
  cep         = '01001000',
  logradouro  = 'Rua De Homologacao',
  numero      = '100',
  complemento = NULL,
  bairro      = 'Centro',
  cidade      = 'Sao Paulo',
  uf          = 'SP';

-- ── 7. Trilha de alterações do candidato ────────────────────────────────────
-- `valor_anterior`/`valor_novo` guardam o conteúdo do campo alterado, e entre os campos alterados
-- estão e-mail, nome e CPF. A trilha (quem, quando, qual campo) é preservada; só o VALOR é apagado.
UPDATE candidato_alteracoes_log SET
  valor_anterior = CASE WHEN valor_anterior IS NULL THEN NULL ELSE '[anonimizado]' END,
  valor_novo     = CASE WHEN valor_novo     IS NULL THEN NULL ELSE '[anonimizado]' END;

-- ── 8. Texto livre digitado por humano ──────────────────────────────────────
-- Ninguém garante que uma observação não tenha nome de pessoa dentro. Texto livre não é
-- anonimizável por regra, então é ESVAZIADO. A estrutura (existe ou não observação) é preservada.
UPDATE admissoes           SET observacao_liberacao = '[anonimizado]' WHERE observacao_liberacao IS NOT NULL;
UPDATE documentos_admissao SET observacao           = '[anonimizado]' WHERE observacao           IS NOT NULL;

-- ── 9. Matrícula na folha ───────────────────────────────────────────────────
UPDATE admissoes a SET matricula = 'H' || lpad(s.n::text, 7, '0')
FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM admissoes) s
WHERE a.id = s.id AND a.matricula IS NOT NULL;

-- ── 10. Usuários internos ───────────────────────────────────────────────────
-- Papel, área e marcação de menu são PRESERVADOS: são exatamente o que a homologação precisa testar
-- (§A.23). Só a identidade e a credencial mudam.
--
-- A SENHA É TROCADA POR UMA ÚNICA SENHA DE HOMOLOGAÇÃO, e isso é decisão de segurança, não
-- conveniência: clonar o hash de produção faria a senha real do time abrir a homologação, e a
-- homologação tem postura de segurança mais fraca por natureza.
UPDATE usuarios u SET
  nome  = 'Usuario ' || lpad(s.n::text, 2, '0') || ' Homolog',
  email = 'usuario' || lpad(s.n::text, 2, '0') || '@homolog.local'
FROM (SELECT id, row_number() OVER (ORDER BY criado_em, id) AS n FROM usuarios) s
WHERE u.id = s.id;

-- ── 11. Agendadores DESLIGADOS (armadilha (b) da OST) ───────────────────────
-- Esta é a trava que impede a homologação de disparar envelope de assinatura REAL, pull real no
-- Pandapé, escrita real no Drive e leitura real do bucket de VT. É a PRIMEIRA de duas camadas; a
-- segunda é a ausência de credencial no `.env` de homologação.
--
-- `estaLigado()` devolve TRUE quando a linha não existe ("default ligado"), então apagar não serve:
-- a linha tem de EXISTIR com `ligado = false`.
INSERT INTO pandape_scheduler_estado (chave, ligado)   VALUES ('pandape',   false) ON CONFLICT (chave) DO UPDATE SET ligado = false;
INSERT INTO clicksign_scheduler_estado (chave, ligado) VALUES ('clicksign', false) ON CONFLICT (chave) DO UPDATE SET ligado = false;
INSERT INTO exame_scheduler_estado (chave, ligado)     VALUES ('exame',     false) ON CONFLICT (chave) DO UPDATE SET ligado = false;
INSERT INTO vt_coleta_scheduler_estado (chave, ligado) VALUES ('vt-coleta', false) ON CONFLICT (chave) DO UPDATE SET ligado = false;

-- ── 12. Conferência, com o script FALHANDO se algo escapar ──────────────────
-- Verificação, não confiança. Qualquer resto de PII aborta a criação da homologação.
DO $conf$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM admissoes a
    LEFT JOIN candidatos c ON c.cpf = a.candidato_cpf WHERE c.cpf IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'FK candidato_cpf quebrada em % admissões', n; END IF;

  SELECT count(*) INTO n FROM candidatos WHERE nome NOT LIKE '%Homolog';
  IF n > 0 THEN RAISE EXCEPTION '% candidatos com nome real', n; END IF;

  SELECT count(*) INTO n FROM candidatos
    WHERE cpf ~ '^[0-9]{11}$' AND cpf NOT IN (SELECT novo FROM hml_cpf_map);
  IF n > 0 THEN RAISE EXCEPTION '% CPFs fora do mapa de anonimização', n; END IF;

  SELECT count(*) INTO n FROM usuarios WHERE email NOT LIKE '%@homolog.local';
  IF n > 0 THEN RAISE EXCEPTION '% usuários com e-mail real', n; END IF;

  SELECT count(*) INTO n FROM (
    SELECT ligado FROM pandape_scheduler_estado   UNION ALL
    SELECT ligado FROM clicksign_scheduler_estado UNION ALL
    SELECT ligado FROM exame_scheduler_estado     UNION ALL
    SELECT ligado FROM vt_coleta_scheduler_estado) t WHERE ligado;
  IF n > 0 THEN RAISE EXCEPTION '% agendadores ainda LIGADOS', n; END IF;

  RAISE NOTICE 'Anonimização conferida: sem PII residual, agendadores desligados.';
END
$conf$;

DROP TABLE hml_cpf_map;
