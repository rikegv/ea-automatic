"""F2 — Auditoria documental incremental por IA (INT-3).

Lê o documento da staging, audita contra as regras ativas (server-supplied) e devolve um
ResultadoAuditoria com status restrito ao enum. §A.6: sem log de PII; buffer descartado.
"""

from fastapi import APIRouter, Depends

from app import gemini
from app.auth import require_internal_token
from app.gemini import _mime_de
from app.schemas import AuditoriaRequest, ResultadoAuditoria
from app.staging import ler_staging

router = APIRouter(prefix="/auditoria", tags=["auditoria"])


@router.post("/documento", response_model=ResultadoAuditoria, response_model_by_alias=True)
def auditar_documento(
    req: AuditoriaRequest, _: None = Depends(require_internal_token)
) -> ResultadoAuditoria:
    regras = [r.descricao_regra for r in req.regras if r.descricao_regra.strip()]

    # Sem régua de auditoria definida → não há critério; é escalada, não reprovação (§A.9).
    if not regras:
        return ResultadoAuditoria(
            valido=False,
            status="PENDENTE",
            motivo=(
                "Não há regras de auditoria ativas para este tipo de documento; "
                "validação manual necessária."
            ),
            campos_conferidos=[],
        )

    conteudo = ler_staging(req.staging_path)
    try:
        resultado = gemini.auditar_documento(
            conteudo=conteudo,
            mime_type=_mime_de(req.staging_path),
            tipo_documento_nome=req.tipo_documento_nome,
            candidato_nome=req.candidato.nome,
            candidato_cpf=req.candidato.cpf,
            regras=regras,
        )
    finally:
        # §A.6 — descarta o buffer do documento da memória após a chamada.
        del conteudo

    status = resultado["status"]
    return ResultadoAuditoria(
        valido=status == "VALIDADO",
        status=status,
        motivo=resultado["motivo"],
        campos_conferidos=resultado["camposConferidos"],
    )
