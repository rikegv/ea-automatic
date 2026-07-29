"""§A.17 (coleta de VT): leitura do bucket do GCS onde o app externo grava os PDFs de VT.

A fonte deixou de ser uma pasta do Drive e passou a ser um bucket do Google Cloud Storage: o app
externo (Firebase) escreve os PDFs no bucket, e o EA apenas LÊ. Duas operações SOMENTE LEITURA:
listar os objetos do bucket e baixar um objeto para a staging efêmera.

§A.6: o nome do objeto (nome do candidato + CPF) NUNCA sai daqui nem é logado; a resposta leva só
o CPF extraído no servidor.
"""

import logging

from fastapi import APIRouter, Depends

from app import gcs
from app.auth import require_internal_token
from app.drive import extrair_cpf_do_nome
from app.schemas import (
    BaixarColetaVtRequest,
    BaixarColetaVtResponse,
    ItemColetaVt,
    ListarColetaVtRequest,
    ListarColetaVtResponse,
)

router = APIRouter(prefix="/coleta-vt", tags=["coleta-vt"])
logger = logging.getLogger("ea.ai.coleta_vt")


@router.post("/listar", response_model=ListarColetaVtResponse, response_model_by_alias=True)
def coleta_vt_listar(
    req: ListarColetaVtRequest, _: None = Depends(require_internal_token)
) -> ListarColetaVtResponse:
    objetos = gcs.listar_objetos(req.bucket)
    itens = [
        ItemColetaVt(
            id=obj["name"],
            md5=obj.get("md5"),
            mime_type=obj.get("contentType") or "application/octet-stream",
            cpf=extrair_cpf_do_nome(obj.get("name") or ""),
            eh_pdf=obj.get("contentType") == "application/pdf",
        )
        for obj in objetos
    ]
    return ListarColetaVtResponse(arquivos=itens)


@router.post("/baixar", response_model=BaixarColetaVtResponse, response_model_by_alias=True)
def coleta_vt_baixar(
    req: BaixarColetaVtRequest, _: None = Depends(require_internal_token)
) -> BaixarColetaVtResponse:
    staging_path = gcs.baixar_objeto_para_staging(req.bucket, req.id)
    return BaixarColetaVtResponse(staging_path=staging_path)
