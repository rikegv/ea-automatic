"""F9 — Gerador de kit. Desmembra o PDF-mãe extraindo as páginas de UM candidato.

OST §5 literal: apenas extrai e devolve o caminho na staging — SEM Clicksign, SEM Drive.
§A.6: o nome do candidato nunca é logado; o binário transita e é descartado.
"""

import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pypdf import PdfReader, PdfWriter

from app import gemini, kit_job, kit_pdf
from app.auth import require_internal_token
from app.config import get_settings
from app.schemas import (
    KitExtrairRequest,
    KitJobStart,
    KitJobStatus,
    KitReimportarRequest,
    KitRequest,
    KitResponse,
)
from app.staging import ler_staging

router = APIRouter(prefix="/kit", tags=["kit"])


@router.post("/extrair", response_model=KitJobStart, response_model_by_alias=True)
def extrair_kit(req: KitExtrairRequest, _: None = Depends(require_internal_token)) -> KitJobStart:
    """Inicia o motor de extração (OST etapa 3.1) como JOB assíncrono e devolve o id para polling.

    O processamento roda em fila (lotes em sequência, espaçados, com retry/backoff no 429 do Vertex).
    §A.6: nome/CPF nunca são logados; o CPF sai mascarado; os binários da staging são apagados ao fim.
    """
    try:
        job_id, total_lotes = kit_job.iniciar(
            req.kit_tipo_id,
            [{"staging_path": d.staging_path, "arquivo": d.arquivo} for d in req.documentos],
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Motor de kit indisponível: banco não configurado.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Kit sem títulos ativos cadastrados no painel.",
        ) from exc
    return KitJobStart(job_id=job_id, total_lotes=total_lotes)


@router.get("/extrair/status/{job_id}", response_model=KitJobStatus, response_model_by_alias=True)
def status_kit(job_id: str, _: None = Depends(require_internal_token)) -> KitJobStatus:
    """Progresso do job: lote atual/total, mensagem amigável e, ao concluir, o resultado."""
    job = kit_job.status(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job não encontrado.")
    return KitJobStatus(
        status=job.status,
        lote_atual=job.lote_atual,
        total_lotes=job.total_lotes,
        mensagem=job.mensagem,
        retries=job.retries,
        resultado=job.resultado,
        erro=job.erro,
    )


def _job_concluido(job_id: str) -> kit_job.Job:
    """Recupera um job concluído com resultado, ou 404 (desconhecido/expirado/ainda processando)."""
    job = kit_job.status(job_id)
    if job is None or job.status != "concluido" or not job.resultado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kit não disponível para download."
        )
    return job


@router.get("/download/{job_id}/funcionario/{indice}")
def download_funcionario(
    job_id: str, indice: int, _: None = Depends(require_internal_token)
) -> Response:
    """PDF consolidado de UM funcionário (páginas originais na ordem do kit; aviso se incompleto)."""
    job = _job_concluido(job_id)
    funcionarios = job.resultado.get("funcionarios", [])
    if indice < 0 or indice >= len(funcionarios):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionário não encontrado no kit."
        )
    func = funcionarios[indice]
    try:
        pdf = kit_pdf.montar_pdf_funcionario(
            func, job.mapa_arquivos, job.resultado.get("dicionario", [])
        )
    except kit_pdf.KitStagingExpirado as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Os PDFs de origem expiraram (TTL). Reprocesse o kit para baixar.",
        ) from exc
    nome_arq = kit_pdf.nome_arquivo_funcionario(func.get("nome", "funcionario"))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome_arq}"'},
    )


@router.get("/download/{job_id}/zip")
def download_zip(job_id: str, _: None = Depends(require_internal_token)) -> Response:
    """ZIP com um PDF consolidado por funcionário (kit_<funcionario>.pdf)."""
    job = _job_concluido(job_id)
    if not job.resultado.get("funcionarios"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum funcionário para baixar."
        )
    try:
        conteudo = kit_pdf.montar_zip(job.resultado, job.mapa_arquivos)
    except kit_pdf.KitStagingExpirado as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Os PDFs de origem expiraram (TTL). Reprocesse o kit para baixar.",
        ) from exc
    return Response(
        content=conteudo,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="kits.zip"'},
    )


@router.post("/reimportar/{job_id}/funcionario/{indice}")
def reimportar_funcionario(
    job_id: str,
    indice: int,
    req: KitReimportarRequest,
    _: None = Depends(require_internal_token),
) -> dict:
    """Reimporta PDFs para UM funcionário do resultado, anexando os documentos que faltavam.

    404 job/índice inexistente; 409 PDF de outra pessoa; 422 nada reconhecido; 503 IA indisponível.
    §A.6: o nome do funcionário nunca é logado; só os binários da staging transitam.
    """
    documentos = [{"staging_path": d.staging_path, "arquivo": d.arquivo} for d in req.documentos]
    try:
        return kit_job.reimportar(job_id, indice, documentos)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resultado não encontrado ou expirado. Reprocesse o kit.",
        ) from exc
    except kit_job.ReimportInvalido as exc:
        if exc.motivo == "pessoa":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="pessoa") from exc
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="nao-reconhecido"
        ) from exc
    except Exception as exc:  # noqa: BLE001 - qualquer falha da IA vira indisponibilidade amigável
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ia-indisponivel"
        ) from exc


@router.post("/gerar", response_model=KitResponse, response_model_by_alias=True)
def gerar_kit(req: KitRequest, _: None = Depends(require_internal_token)) -> KitResponse:
    conteudo = ler_staging(req.staging_path)
    try:
        reader = PdfReader(BytesIO(conteudo))
    except Exception as exc:  # noqa: BLE001 - PDF inválido
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não foi possível ler o PDF-mãe.",
        ) from exc

    total = len(reader.pages)
    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PDF-mãe sem páginas."
        )

    paginas = gemini.localizar_paginas_kit(
        conteudo_pdf=conteudo, nome_candidato=req.nome_candidato, total_paginas=total
    )
    if not paginas:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhuma página do PDF-mãe corresponde ao candidato informado.",
        )

    writer = PdfWriter()
    for n in paginas:
        writer.add_page(reader.pages[n - 1])

    settings = get_settings()
    settings.kits_dir.mkdir(parents=True, exist_ok=True)
    destino = settings.kits_dir / f"{uuid.uuid4().hex}.pdf"
    with destino.open("wb") as fh:
        writer.write(fh)

    del conteudo
    return KitResponse(staging_path_kit=str(destino))
