"""Acesso à staging efêmera (§A.6 / F2). Lê o binário que transita e nunca persiste no banco.

O `stagingPath` vem da requisição (rede interna, mas com X-Internal-Token um chamador poderia
forjar um caminho). Por isso aplicamos um guard de path traversal REAL: o caminho é resolvido e
tem de estar contido no `STAGING_DIR` resolvido — qualquer coisa fora (absoluto arbitrário ou
`../` que escapa) é rejeitada com 400. Caminhos nunca são logados nem ecoados no erro.
"""

import uuid
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


def escrever_staging(conteudo: bytes, sufixo: str = ".pdf") -> str:
    """Grava bytes na staging efêmera e devolve o stagingPath (compatível com ler_staging).

    Escritor SIMÉTRICO ao `ler_staging`: o nome do arquivo é gerado internamente (uuid), nunca vem
    de fora, então não há como o chamador forjar um caminho de escrita. O caminho de destino ainda
    passa pelo mesmo guard de path traversal (`caminho_staging_seguro`) por defesa em profundidade.
    §A.6: nada do conteúdo nem nome de origem é logado; o binário é efêmero (TTL da staging).
    """
    base = Path(get_settings().staging_dir).resolve()
    base.mkdir(parents=True, exist_ok=True)
    nome = f"{uuid.uuid4().hex}{sufixo}"
    destino = caminho_staging_seguro(str(base / nome))
    destino.write_bytes(conteudo)
    return str(destino)
