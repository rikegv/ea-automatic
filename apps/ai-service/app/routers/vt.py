"""Documento do formulário de VT (§A.17 etapa 2, Parte D).

Compõe o PDF (optante ou não-optante) a partir dos dados enviados pelo backend e devolve os bytes.
Não usa IA: é composição determinística com reportlab. Vive aqui porque TODO o trabalho com PDF do
sistema é deste serviço (o backend não tem lib de PDF).

§A.6: o corpo do POST leva PII (nome, CPF, endereço) por exigência do documento oficial. Nada é
gravado em disco e nada de PII vai para log.
"""

from fastapi import APIRouter, Depends, Response

from app import vt_pdf
from app.auth import require_internal_token
from app.schemas import DocumentoVtRequest

router = APIRouter(prefix="/vt", tags=["vt"])


@router.post("/documento")
def gerar_documento(req: DocumentoVtRequest, _: None = Depends(require_internal_token)) -> Response:
    """Devolve o PDF do formulário de VT. `tipo` decide qual dos dois documentos é composto."""
    pdf = vt_pdf.gerar(req.model_dump(by_alias=True))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="formulario-vt.pdf"'},
    )
