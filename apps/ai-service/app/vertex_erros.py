"""Classificação da família de erros do Vertex + retentativa com backoff (OST B1, Bloco 1).

PROBLEMA QUE ISTO RESOLVE. Uma reauditoria bateu **429 RESOURCE_EXHAUSTED** (quota do Vertex) e o
ai-service devolveu **500 cru**. Do lado de fora, um 500 de quota (transitório, é para retentar) era
indistinguível de um 500 de erro real (não adianta retentar), e o diretor não tinha como saber qual
era qual. Rodando o LOTE em sequência isso aconteceria em série.

DUAS COISAS ACONTECEM AQUI:
 1. **Retentativa com backoff exponencial** para o que é transitório (quota e indisponibilidade).
 2. **Classificação** do erro numa família, para o HTTP de saída ser legível: quota devolve 429,
    entrada inválida devolve 422, credencial e indisponibilidade devolvem 503. Nunca mais 500 cru.

§A.6: nada de PII. As mensagens são fixas e nunca ecoam o corpo da resposta do Vertex, que pode
espelhar o conteúdo enviado.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Literal, TypeVar

__all__ = [
    "FamiliaErroVertex",
    "ErroVertex",
    "classificar_erro_vertex",
    "chamar_com_backoff",
    "TENTATIVAS_MAXIMAS",
    "ESPERAS_S",
]

logger = logging.getLogger("vertex")

FamiliaErroVertex = Literal["QUOTA", "ENTRADA", "CREDENCIAL", "INDISPONIVEL", "DESCONHECIDO"]

# Política de retentativa (declarada no diário): até 3 retentativas, esperando 2s, 4s e 8s.
# Teto de espera acumulada = 14 segundos, bem abaixo do timeout de 120s do backend.
TENTATIVAS_MAXIMAS = 4  # 1 tentativa + 3 retentativas
ESPERAS_S: tuple[float, ...] = (2.0, 4.0, 8.0)

# Só o que é transitório é retentado. Entrada inválida e credencial errada não melhoram esperando.
_RETENTAVEIS: frozenset[str] = frozenset({"QUOTA", "INDISPONIVEL"})

T = TypeVar("T")


class ErroVertex(Exception):
    """Erro do Vertex já classificado. `familia` é o que o chamador usa para escolher o HTTP."""

    def __init__(self, familia: FamiliaErroVertex, *, tentativas: int = 1) -> None:
        super().__init__(familia)
        self.familia: FamiliaErroVertex = familia
        self.tentativas = tentativas


def _codigo_http(exc: BaseException) -> int | None:
    """Extrai o status HTTP do erro do SDK do Google, sem depender de uma classe específica."""
    for atributo in ("code", "status_code"):
        valor = getattr(exc, atributo, None)
        if isinstance(valor, int):
            return valor
    resposta = getattr(exc, "response", None)
    valor = getattr(resposta, "status_code", None)
    return valor if isinstance(valor, int) else None


def classificar_erro_vertex(exc: BaseException) -> FamiliaErroVertex:
    """Classifica pelo status HTTP e, na falta dele, pelo código textual do erro (RESOURCE_EXHAUSTED
    e companhia). NUNCA olha o corpo da resposta, que pode espelhar conteúdo enviado (§A.6)."""
    codigo = _codigo_http(exc)
    if codigo == 429:
        return "QUOTA"
    if codigo in (401, 403):
        return "CREDENCIAL"
    if codigo == 400:
        return "ENTRADA"
    if codigo is not None and 500 <= codigo < 600:
        return "INDISPONIVEL"

    texto = str(exc).upper()
    if "RESOURCE_EXHAUSTED" in texto or "QUOTA" in texto or "RATE LIMIT" in texto:
        return "QUOTA"
    if "PERMISSION_DENIED" in texto or "UNAUTHENTICATED" in texto:
        return "CREDENCIAL"
    if "INVALID_ARGUMENT" in texto or "FAILED_PRECONDITION" in texto:
        return "ENTRADA"
    if "UNAVAILABLE" in texto or "DEADLINE_EXCEEDED" in texto or "INTERNAL" in texto:
        return "INDISPONIVEL"
    return "DESCONHECIDO"


def chamar_com_backoff(fn: Callable[[], T], *, o_que: str = "chamada ao Vertex") -> T:
    """Executa `fn`, retentando com backoff exponencial o que é TRANSITÓRIO (quota e
    indisponibilidade). Esgotadas as tentativas, levanta `ErroVertex` com a família, para o chamador
    traduzir em HTTP. Erro não transitório sobe na primeira ocorrência, sem espera inútil.

    §A.6: o log traz a família, a tentativa e o rótulo da operação. Nunca a mensagem do provedor.
    """
    ultima: FamiliaErroVertex = "DESCONHECIDO"
    for tentativa in range(1, TENTATIVAS_MAXIMAS + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — a classificação é justamente o tratamento
            ultima = classificar_erro_vertex(exc)
            if ultima not in _RETENTAVEIS or tentativa == TENTATIVAS_MAXIMAS:
                logger.error(
                    "%s falhou (familia=%s, tentativa=%d/%d), sem nova retentativa",
                    o_que,
                    ultima,
                    tentativa,
                    TENTATIVAS_MAXIMAS,
                )
                raise ErroVertex(ultima, tentativas=tentativa) from exc
            espera = ESPERAS_S[tentativa - 1]
            logger.warning(
                "%s falhou (familia=%s, tentativa=%d/%d), retentando em %.0fs",
                o_que,
                ultima,
                tentativa,
                TENTATIVAS_MAXIMAS,
                espera,
            )
            time.sleep(espera)
    raise ErroVertex(ultima, tentativas=TENTATIVAS_MAXIMAS)
