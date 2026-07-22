"""F2 — Auditoria documental incremental por IA (INT-3).

Lê o documento da staging, audita contra as regras ativas (server-supplied) e devolve um
ResultadoAuditoria com status restrito ao enum. §A.6: sem log de PII; buffer descartado.
"""

from fastapi import APIRouter, Depends, HTTPException
from starlette.status import HTTP_415_UNSUPPORTED_MEDIA_TYPE

from app import gemini
from app.auth import require_internal_token
from app.gemini import resolver_mime
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

    if not req.staging_paths:
        raise HTTPException(status_code=422, detail="Nenhum arquivo para auditar.")

    # Auditoria por CONJUNTO: lê cada arquivo do MESMO documento e resolve o mime de cada um. BLOCO A
    # (defensivo): mime pela extensão e, na falta, pelos magic bytes; se nem assim resolver, NÃO manda
    # `application/octet-stream` ao Vertex (400 → 500 silencioso), devolve 415 controlado que o backend
    # traduz em "aguardando auditoria". §A.6: o motivo não carrega PII (é o formato, não o conteúdo).
    partes: list[tuple[bytes, str]] = []
    for sp in req.staging_paths:
        conteudo = ler_staging(sp)
        mime_type = resolver_mime(sp, conteudo)
        if mime_type is None:
            for c, _ in partes:
                del c
            del conteudo
            raise HTTPException(
                status_code=HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Formato de arquivo não suportado para auditoria (esperado PDF, JPEG ou PNG).",
            )
        partes.append((conteudo, mime_type))
    try:
        resultado = gemini.auditar_documento(
            partes=partes,
            tipo_documento_nome=req.tipo_documento_nome,
            candidato_nome=req.candidato.nome,
            candidato_cpf=req.candidato.cpf,
            regras=regras,
        )
    finally:
        # §A.6 — descarta os buffers dos documentos da memória após a chamada.
        for c, _ in partes:
            del c
        partes.clear()

    status = resultado["status"]
    return ResultadoAuditoria(
        valido=status == "VALIDADO",
        status=status,
        motivo=resultado["motivo"],
        campos_conferidos=resultado["camposConferidos"],
    )
