"""Dicionário de títulos de um kit (OST etapa 2, passo 2b).

Leitura SOMENTE do banco: os títulos ATIVOS do kit selecionado, na ordem do painel. É o único
ponto de acoplamento do ai-service com o banco, e é read-only sobre uma única tabela. Isolado aqui
para ser facilmente mockado nos testes. Não loga nada (§A.6).
"""

from __future__ import annotations

import psycopg

from app.config import get_settings


def carregar_dicionario_kit(kit_tipo_id: str) -> list[str]:
    """Títulos ATIVOS do kit, ordenados pela `ordem` do painel. Lista vazia se o kit não existe."""
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL não configurado para o motor de kit.")
    with psycopg.connect(url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select titulo
                from kit_regra_documento
                where kit_tipo_id = %s and ativo = true
                order by ordem asc, titulo asc
                """,
                (kit_tipo_id,),
            )
            return [row[0] for row in cur.fetchall()]
