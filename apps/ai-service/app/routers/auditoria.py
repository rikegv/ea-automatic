"""F2 — Auditoria documental incremental por IA (INT-3).

Lê o documento da staging, audita contra as regras ativas (server-supplied) e devolve um
ResultadoAuditoria com status restrito ao enum. §A.6: sem log de PII; buffer descartado.
"""

from fastapi import APIRouter, Depends, HTTPException
from starlette.status import HTTP_415_UNSUPPORTED_MEDIA_TYPE

from app import gemini
from app.auth import require_internal_token
from app.gemini import resolver_mime
from app.pdf_seguranca import MOTIVO_PDF_PROTEGIDO, pdf_exige_senha_para_abrir
from app.schemas import AuditoriaRequest, ResultadoAuditoria
from app.staging import ler_staging
from app.vertex_erros import ErroVertex, FamiliaErroVertex

router = APIRouter(prefix="/auditoria", tags=["auditoria"])

# OST B1 / Bloco 1 — família do erro do Vertex → HTTP, para o backend distinguir o que é QUOTA
# (transitório, o documento volta para a fila) do que é falha real. Antes tudo caía em 500 cru.
HTTP_POR_FAMILIA: dict[FamiliaErroVertex, int] = {
    "QUOTA": 429,  # limite de uso: retentar depois, o documento NÃO está errado
    "ENTRADA": 422,  # o Vertex recusou o conteúdo enviado: acionável
    "CREDENCIAL": 503,  # service account sem acesso: problema de configuração
    "INDISPONIVEL": 503,
    "DESCONHECIDO": 503,
}

DETALHE_POR_FAMILIA: dict[FamiliaErroVertex, str] = {
    "QUOTA": "Limite de uso da IA atingido (quota). Nova tentativa mais tarde.",
    "ENTRADA": "Documento não pôde ser processado pelo motor de IA.",
    "CREDENCIAL": "Motor de IA sem credencial válida.",
    "INDISPONIVEL": "Motor de IA indisponível.",
    "DESCONHECIDO": "Motor de IA indisponível.",
}


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
        # OST A / Bloco 1: PDF que exige senha para ABRIR não vai à IA (o Vertex devolve "no pages").
        # A checagem é do pypdf, tentando abrir com senha vazia; PDF cifrado só por PERMISSÕES passa
        # direto e é auditado normalmente, que era o falso positivo da checagem por string `/Encrypt`.
        if pdf_exige_senha_para_abrir(conteudo):
            del conteudo
            continue
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

    # Todos os arquivos do conjunto exigem senha → INCONFORME determinístico, com motivo ACIONÁVEL e
    # sem gastar chamada de IA. Se ao menos um arquivo abre, o conjunto é auditado com o que abre
    # (não-bloqueio: uma página protegida não condena o documento inteiro).
    if not partes:
        return ResultadoAuditoria(
            valido=False,
            status="INCONFORME",
            motivo=MOTIVO_PDF_PROTEGIDO,
            campos_conferidos=[],
        )

    try:
        resultado = gemini.auditar_documento(
            partes=partes,
            tipo_documento_nome=req.tipo_documento_nome,
            candidato_nome=req.candidato.nome,
            candidato_cpf=req.candidato.cpf,
            regras=regras,
        )
    except ErroVertex as erro:
        # OST B1 / Bloco 1: o Vertex já foi retentado com backoff quando o erro era transitório. Aqui
        # o que sobrou vira um HTTP DISTINGUÍVEL, em vez do 500 cru que misturava quota com falha
        # real. §A.6: mensagem fixa, nunca o corpo devolvido pelo provedor.
        raise HTTPException(status_code=HTTP_POR_FAMILIA[erro.familia], detail=DETALHE_POR_FAMILIA[erro.familia]) from erro
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
