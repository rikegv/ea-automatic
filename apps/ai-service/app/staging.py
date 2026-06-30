"""Acesso à staging efêmera (§A.6 / F2). Lê o binário que transita e nunca persiste no banco.

O `stagingPath` vem da requisição (rede interna, mas com X-Internal-Token um chamador poderia
forjar um caminho). Por isso aplicamos um guard de path traversal REAL: o caminho é resolvido e
tem de estar contido no `STAGING_DIR` resolvido — qualquer coisa fora (absoluto arbitrário ou
`../` que escapa) é rejeitada com 400. Caminhos nunca são logados nem ecoados no erro.
"""

from pathlib import Path

from fastapi import HTTPException, status

from app.config import get_settings


def caminho_staging_seguro(staging_path: str) -> Path:
    """Resolve e valida que `staging_path` está sob STAGING_DIR. 400 se escapar (sem vazar o path)."""
    base = Path(get_settings().staging_dir).resolve()
    try:
        alvo = Path(staging_path).resolve()
    except (TypeError, ValueError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="stagingPath inválido."
        ) from exc
    if alvo != base and not alvo.is_relative_to(base):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stagingPath fora da área de staging permitida.",
        )
    return alvo


def ler_staging(staging_path: str) -> bytes:
    """Lê os bytes de um arquivo da staging, após o guard de path traversal.

    400 se o caminho escapar do STAGING_DIR; 404 se não existir/for inválido (sem expor o path).
    """
    alvo = caminho_staging_seguro(staging_path)
    if not alvo.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo de staging não encontrado.",
        )
    return alvo.read_bytes()
