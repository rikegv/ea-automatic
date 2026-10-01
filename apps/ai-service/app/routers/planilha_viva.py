"""Leitura da planilha VIVA do Drive, projetada em 4 colunas. Somente leitura.

Uma rota, um verbo: exporta a planilha como CSV, recorta as colunas da lista branca e devolve as
linhas cruas. O backend consome por HTTP e é ELE quem decide o que casa, o que é ambíguo, o que é
malformado e o que é código interno. O `ai-service` não ganha lógica de negócio aqui.

Guard: `Depends(require_internal_token)`, ALÉM do loopback, no molde de `routers/planilha.py`. Rota
sem o guard nasce aberta a qualquer coisa que alcance o loopback da VM.

§A.6: o CSV existe só em memória; nenhum conteúdo de célula entra em log nem no `detail` do erro. O
`detail` sobe família e texto padrão montado aqui, nunca a mensagem do provedor.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_internal_token
from app.planilha_viva import (
    FamiliaErro,
    ErroPlanilhaViva,
    LeituraPlanilhaViva,
    PlanilhaVivaRequest,
    ler_planilha_viva,
)

router = APIRouter(prefix="/planilha-viva", tags=["planilha-viva"])

# ACESSO é transitório (indisponibilidade, credencial), então 503 e o backend pode retentar.
# CABECALHO, FORMATO e ENTRADA são 422: retentar não muda nada, alguém precisa olhar a planilha.
HTTP_POR_FAMILIA: dict[FamiliaErro, int] = {
    "ACESSO": 503,
    "TAMANHO": 413,
    "CABECALHO": 422,
    "FORMATO": 422,
    "ENTRADA": 422,
}


@router.post("/ler", response_model=LeituraPlanilhaViva)
def ler(req: PlanilhaVivaRequest, _: None = Depends(require_internal_token)) -> LeituraPlanilhaViva:
    try:
        return ler_planilha_viva(req.file_id)
    except ErroPlanilhaViva as erro:
        raise HTTPException(
            status_code=HTTP_POR_FAMILIA[erro.familia], detail=erro.detalhe
        ) from erro
