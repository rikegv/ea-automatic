"""INT-2 — Arquivamento no Drive ao fechar a régua obrigatória (F2).

Cria a pasta do funcionário, as 4 subpastas sob demanda e sobe os arquivos renomeados.
§A.6: nomes de pessoa não são logados; binários descartados após o upload.
"""

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app import drive
from app.auth import require_internal_token
from app.config import get_settings
from app.drive import SUBPASTA_NOME
from app.schemas import ArquivamentoDrive, ArquivarRequest
from app.staging import ler_staging

router = APIRouter(prefix="/drive", tags=["drive"])
logger = logging.getLogger("ea.ai.drive")


def _mock_slug(pasta_nome: str) -> str:
    """Identificador SEM PII para o link fictício do mock: hash curto do pastaNome.

    O nome do candidato (que compõe pastaNome) NUNCA entra no link nem no que será persistido.
    """
    return hashlib.sha256(pasta_nome.encode("utf-8")).hexdigest()[:8]


@router.post("/arquivar", response_model=ArquivamentoDrive, response_model_by_alias=True)
def arquivar(req: ArquivarRequest, _: None = Depends(require_internal_token)) -> ArquivamentoDrive:
    settings = get_settings()

    # Modo mock (validação visual híbrida): não toca na API do Google. Sem PII no log.
    if settings.drive_mock:
        logger.warning(
            "DRIVE_MOCK ativo: arquivamento simulado (%d arquivo(s), sem chamada ao Drive).",
            len(req.arquivos),
        )
        return ArquivamentoDrive(
            pasta_url=f"https://drive.google.com/drive/folders/MOCK-{_mock_slug(req.pasta_nome)}",
            arquivados=len(req.arquivos),
        )

    service = drive.get_drive_service()

    try:
        pasta_func_id = drive.buscar_ou_criar_pasta(service, req.pasta_nome, req.parent_folder_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao criar a pasta do funcionário no Drive.",
        ) from exc

    subpasta_cache: dict[str, str] = {}
    arquivados = 0
    for arq in req.arquivos:
        nome_sub = SUBPASTA_NOME[arq.subpasta]
        if arq.subpasta not in subpasta_cache:
            subpasta_cache[arq.subpasta] = drive.buscar_ou_criar_pasta(
                service, nome_sub, pasta_func_id
            )
        conteudo = ler_staging(arq.staging_path)
        try:
            drive.subir_arquivo(
                service,
                conteudo=conteudo,
                nome_final=arq.nome_final,
                parent_id=subpasta_cache[arq.subpasta],
            )
            arquivados += 1
        finally:
            del conteudo

    return ArquivamentoDrive(
        pasta_url=drive.pasta_web_link(service, pasta_func_id), arquivados=arquivados
    )
