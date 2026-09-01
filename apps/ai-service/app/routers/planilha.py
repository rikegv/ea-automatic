"""Mapeamento de colunas de PLANILHA DE LOJAS por IA (cenário 1, etapa 2).

Espelha `auditoria.py`: mesma autenticação por token interno e a MESMA tradução de família de erro do
Vertex para HTTP, para o backend distinguir quota (transitório) de falha de credencial.

O QUE ESTE ROUTER **NÃO** FAZ, e é a decisão central da etapa: ele não recebe a planilha. Recebe só o
CABEÇALHO e uma AMOSTRA de linhas, já extraídos pelo backend com ExcelJS e csv-parse. A tarefa da IA
é entender QUAIS COLUNAS são o quê; aplicar o mapeamento às até 2.000 linhas é trabalho de código,
determinístico, no backend. Isso deixa a importação repetível, barata e independente do modelo na
hora de gravar.

§A.6: nome de loja e endereço de estabelecimento não são dado pessoal. Ainda assim, vai só a amostra
(o mínimo necessário), nada é persistido aqui e NENHUM conteúdo de planilha entra em log.
"""

from fastapi import APIRouter, Depends, HTTPException

from app import gemini
from app.auth import require_internal_token
from app.schemas import MapeamentoColunas, PlanilhaMapearRequest
from app.vertex_erros import ErroVertex, FamiliaErroVertex

router = APIRouter(prefix="/planilha", tags=["planilha"])

# Mesma tabela do `auditoria.py`, pelo mesmo motivo: QUOTA é transitório e o backend pode oferecer
# nova tentativa; CREDENCIAL é configuração e ninguém deve retentar em laço.
HTTP_POR_FAMILIA: dict[FamiliaErroVertex, int] = {
    "QUOTA": 429,
    "ENTRADA": 422,
    "CREDENCIAL": 503,
    "INDISPONIVEL": 503,
    "DESCONHECIDO": 503,
}

DETALHE_POR_FAMILIA: dict[FamiliaErroVertex, str] = {
    "QUOTA": "Limite de uso da IA atingido (quota). Escolha as colunas manualmente ou tente depois.",
    "ENTRADA": "A IA não conseguiu interpretar o cabeçalho desta planilha.",
    "CREDENCIAL": "Motor de IA sem credencial válida.",
    "INDISPONIVEL": "Motor de IA indisponível.",
    "DESCONHECIDO": "Motor de IA indisponível.",
}

# Teto da amostra. Quinze linhas bastam para reconhecer uma coluna, e um teto explícito impede que um
# backend futuro mande a planilha inteira por engano e transforme uma chamada barata numa cara.
MAX_AMOSTRA = 30


@router.post("/mapear-colunas", response_model=MapeamentoColunas)
def mapear_colunas(
    req: PlanilhaMapearRequest, _: None = Depends(require_internal_token)
) -> MapeamentoColunas:
    if not req.cabecalho:
        raise HTTPException(status_code=422, detail="Planilha sem cabeçalho para interpretar.")

    try:
        dado = gemini.mapear_colunas_planilha(
            cabecalho=req.cabecalho,
            amostra=[linha[: len(req.cabecalho)] for linha in req.amostra[:MAX_AMOSTRA]],
        )
    except ErroVertex as erro:
        # §A.6: sobe a família e o detalhe padrão, nunca a mensagem do provedor nem o conteúdo.
        raise HTTPException(
            status_code=HTTP_POR_FAMILIA[erro.familia],
            detail=DETALHE_POR_FAMILIA[erro.familia],
        ) from erro

    return MapeamentoColunas(**dado)
