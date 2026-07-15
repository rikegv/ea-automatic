import "dotenv/config";
import { createDb } from "./client";

/**
 * View de resolução empresa/CNPJ por vínculo — "relatório da clínica pronto para puxar" (OST
 * estrutural, Fase 2, capstone). O relatório da clínica lê SÓ desta view:
 *   SELECT empresa_resolvida, cnpj_resolvido FROM vw_vinculo_empresa_cnpj WHERE cod_cliente = $1;
 *
 * Regra de resolução (regra FINAL — empresa + FILIAL p/ Temp/Terc — §A.3):
 *  - FOPAG (is_fopag, empresa > 6): CNPJ = do PRÓPRIO cliente (clientes.cnpj); empregador = razão do cliente.
 *  - INTERNO (empresa 5,6) / ESTÁGIO (empresa 4): CNPJ FIXO da entidade Soulan (entidades_soulan.cnpj),
 *    independe de filial; empregador = nome da entidade (SOULAN ADMIN p/ 5, NEAT p/ 6, CENTRAL DE
 *    ESTAGIOS p/ 4). Estágio não faz exame admissional (fica fora do relatório da clínica), mas o
 *    vínculo/CNPJ existe para os demais usos.
 *  - TEMPORÁRIO (empresa 1,3) / TERCEIRO (empresa 2): CNPJ por (entidade_id, filial) via entidade_filiais;
 *    empregador = nome da entidade. Filial fora do mapa → cnpj_resolvido = NULL (NAO_RESOLVIDO).
 *  Nunca chuta.
 *
 * Idempotente (DROP+CREATE) e reversível (DROP VIEW). Não modela dado novo — só expõe a resolução já
 * persistida. Não materializa CNPJ de cliente fora da view (§A.6).
 */
const VIEW_SQL = `
DROP VIEW IF EXISTS vw_vinculo_empresa_cnpj;
CREATE VIEW vw_vinculo_empresa_cnpj AS
SELECT
  v.id                                                        AS cliente_vinculo_id,
  v.cod_cliente,
  v.empresa_codigo,
  v.tipo_servico,
  v.is_fopag,
  CASE
    WHEN v.is_fopag                                    THEN c.cnpj
    WHEN v.tipo_servico IN ('INTERNO','ESTAGIO')       THEN e.cnpj
    WHEN v.tipo_servico IN ('TEMPORARIO','TERCEIRO')   THEN ef.cnpj
    ELSE NULL
  END                                                         AS cnpj_resolvido,
  CASE WHEN v.is_fopag THEN c.razao_social  ELSE e.nome  END  AS empresa_resolvida,
  CASE
    WHEN v.is_fopag AND c.cnpj IS NOT NULL                                    THEN 'FOPAG_CNPJ_PROPRIO'
    WHEN v.tipo_servico IN ('INTERNO','ESTAGIO') AND e.cnpj IS NOT NULL       THEN 'ENTIDADE_SOULAN'
    WHEN v.tipo_servico IN ('TEMPORARIO','TERCEIRO') AND ef.cnpj IS NOT NULL  THEN 'FILIAL_SOULAN'
    ELSE 'NAO_RESOLVIDO'
  END                                                         AS origem_cnpj
FROM cliente_vinculos v
JOIN      clientes         c  ON c.cod_cliente = v.cod_cliente
LEFT JOIN entidades_soulan e  ON e.id = v.entidade_id
LEFT JOIN entidade_filiais ef ON ef.entidade_id = v.entidade_id AND ef.filial = v.filial;
`;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql } = createDb(url, 1);
  await sql.unsafe(VIEW_SQL);
  const [{ n }] = await sql.unsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM vw_vinculo_empresa_cnpj WHERE cnpj_resolvido IS NOT NULL;`,
  );
  await sql.end();
  console.log(
    `[view-relatorio-clinica] vw_vinculo_empresa_cnpj criada. CNPJ resolvido em ${n}/131 vínculos.`,
  );
}

if ((process.argv[1] ?? "").includes("view-relatorio-clinica")) {
  main().catch((err) => {
    console.error("[view-relatorio-clinica] falhou:", err);
    process.exit(1);
  });
}

export { VIEW_SQL };
