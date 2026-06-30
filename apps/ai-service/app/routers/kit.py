"""F9 — Gerador de kit. Desmembra o PDF-mãe extraindo as páginas de UM candidato.

OST §5 literal: apenas extrai e devolve o caminho na staging — SEM Clicksign, SEM Drive.
§A.6: o nome do candidato nunca é logado; o binário transita e é descartado.
"""

import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status
from pypdf import PdfReader, PdfWriter

from app import gemini
from app.auth import require_internal_token
from app.config import get_settings
from app.schemas import KitRequest, KitResponse
from app.staging import ler_staging

router = APIRouter(prefix="/kit", tags=["kit"])


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
