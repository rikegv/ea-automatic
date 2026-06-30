"""Defesa em profundidade: todo endpoint interno exige X-Internal-Token.

Sem porta pública (só rede interna), mas o token barra chamadas não autorizadas
dentro da rede. Comparação em tempo constante; o token nunca é logado (§A.6).
"""

from secrets import compare_digest

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_token
    if not expected or not x_internal_token or not compare_digest(x_internal_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token interno ausente ou inválido.",
        )
