"""§A.17 (coleta de VT): leitura do bucket do GCS onde o app externo grava os PDFs de VT.

A fonte deixou de ser uma pasta do Drive e passou a ser um bucket do Google Cloud Storage: o app
externo (Firebase) escreve os PDFs no bucket, e o EA apenas LÊ. Duas operações SOMENTE LEITURA:
listar os objetos do bucket e baixar um objeto para a staging efêmera.

§A.6: o nome do objeto (nome do candidato + CPF) NUNCA sai daqui nem é logado; a resposta leva só
o CPF extraído no servidor.
"""

import json
import logging
import re

from fastapi import APIRouter, Depends

from app import gcs
from app.auth import require_internal_token
from app.drive import extrair_cpf_do_nome
from app.schemas import (
    BaixarColetaVtRequest,
    BaixarColetaVtResponse,
    DadosColetaVtRequest,
    DadosColetaVtResponse,
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


@router.post("/dados", response_model=DadosColetaVtResponse, response_model_by_alias=True)
def coleta_vt_dados(
    req: DadosColetaVtRequest, _: None = Depends(require_internal_token)
) -> DadosColetaVtResponse:
    """Campos estruturados do formulário, do JSON IRMÃO do PDF (mesmo nome, extensão .json).

    POR QUE O JSON VIAJA PELO BUCKET, e não por uma chamada do app ao EA: o app externo roda no
    Firebase e o EA é loopback atrás da VPN, inalcançável de fora. O bucket já é o transporte que
    funciona para o PDF; o JSON pega carona nele, sem abrir nenhuma porta de entrada no EA.

    O NOME DO JSON É DERIVADO AQUI, no servidor, a partir do nome do PDF. O backend manda o `id` que
    já conhece e nunca monta nome de objeto, que carrega o nome do candidato (§A.6).

    Objeto ausente devolve `encontrado=False`, não 404: é o estado normal de todo formulário anterior
    a esta frente, e o arquivamento do PDF não pode depender disso.
    """
    nome_json = re.sub(r"\.pdf$", "", req.id, flags=re.IGNORECASE) + ".json"
    bruto = gcs.ler_objeto_texto(req.bucket, nome_json)
    if bruto is None:
        return DadosColetaVtResponse(encontrado=False)
    try:
        dados = json.loads(bruto)
    except json.JSONDecodeError:
        # JSON corrompido não derruba o arquivamento do PDF: vira "não encontrado" e fica no log.
        logger.warning("JSON irmão do formulário de VT ilegível; seguindo só com o PDF.")
        return DadosColetaVtResponse(encontrado=False)
    if not isinstance(dados, dict):
        return DadosColetaVtResponse(encontrado=False)
    return DadosColetaVtResponse(encontrado=True, dados=dados)
