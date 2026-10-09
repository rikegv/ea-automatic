"""Extração de candidato a partir de UM currículo (PDF ou .docx), import por currículo (§A.1/F6).

O QUE ESTA ROTA FAZ, E É A DECISÃO CENTRAL: o mapeador de planilha devolve ÍNDICE DE COLUNA; um
currículo não tem coluna. Aqui a IA extrai VALOR (campo -> valor lido), reusando a MESMA linha
multimodal Vertex/Gemini da auditoria (`gemini.extrair_curriculo`), sem credencial, projeto ou API
nova. PDF vai direto como bytes ao modelo; .docx NÃO é ingerido pelo Vertex, então o texto é extraído
localmente com python-docx (parágrafos + tabelas) e enviado como texto.

TOLERANTE A ARQUIVO RUIM, DE PROPÓSITO: o backend processa currículos em LOTE. Um arquivo vazio,
corrompido ou de formato não suportado NÃO derruba a requisição em 500: devolve 200 com `erroLeitura`
e o candidato todo vazio, para o lote sobreviver a um arquivo ruim. Falha do MOTOR (quota,
credencial, indisponibilidade do Vertex) é outra coisa: sobe como HTTP distinguível (429/503/422),
no mesmo molde da auditoria, para o backend saber que é transitório e poder retentar.

§A.6: o binário e os valores extraídos são PII e transitam SÓ em memória. Nada é persistido; o buffer
é descartado ao fim da requisição. O LOG traz apenas contagens e booleanos, NUNCA o nome do arquivo
(que pode ser PII), o conteúdo ou qualquer valor lido.

Guard: `Depends(require_internal_token)`, no molde de todo o serviço. Sem porta pública.
"""

from __future__ import annotations

import logging
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app import curriculo as curriculo_mod
from app import gemini
from app.auth import require_internal_token
from app.routers.auditoria import DETALHE_POR_FAMILIA, HTTP_POR_FAMILIA
from app.schemas import CurriculoCandidato, CurriculoExtracaoResponse
from app.vertex_erros import ErroVertex

router = APIRouter(prefix="/curriculo", tags=["curriculo"])
logger = logging.getLogger("ea.ai.curriculo")


class _DocxIlegivel(Exception):
    """O .docx não pôde ser aberto/lido (ZIP inválido, não é Word, corrompido). §A.6: sem PII."""


def _tipo_arquivo(nome: str, conteudo: bytes) -> str | None:
    """'PDF' | 'DOCX' | None. Decide pela extensão do nome e, na falta, pelos magic bytes.

    Rejeita qualquer outra coisa (inclusive .doc binário antigo e .xlsx, que também é ZIP/PK):
    sem extensão reconhecida, só o %PDF entra direto; PK é tratado como tentativa de DOCX e, se não
    for um Word de verdade, a extração de texto falha e vira `erroLeitura`.
    """
    low = (nome or "").strip().lower()
    if low.endswith(".pdf"):
        return "PDF"
    if low.endswith(".docx"):
        return "DOCX"
    if low.endswith(".doc"):  # binário antigo: não é suportado (python-docx não lê .doc)
        return None
    if conteudo[:4] == b"%PDF":
        return "PDF"
    if conteudo[:4] == b"PK\x03\x04":
        return "DOCX"
    return None


def extrair_texto_docx(conteudo: bytes) -> str:
    """Texto de um .docx: parágrafos + células de tabela, em memória. §A.6: nada é escrito em disco.

    python-docx é importado AQUI (função) para manter o módulo leve e o import localizado ao caminho
    que realmente usa a dependência.
    """
    try:
        from docx import Document  # noqa: PLC0415 — import localizado ao caminho DOCX
    except ImportError as exc:  # pragma: no cover - dependência declarada no pyproject
        raise _DocxIlegivel() from exc

    try:
        documento = Document(BytesIO(conteudo))
    except Exception as exc:  # noqa: BLE001 — qualquer falha de abertura vira "ilegível", sem PII
        raise _DocxIlegivel() from exc

    partes: list[str] = [p.text for p in documento.paragraphs if p.text and p.text.strip()]
    for tabela in documento.tables:
        for linha in tabela.rows:
            for celula in linha.cells:
                if celula.text and celula.text.strip():
                    partes.append(celula.text)
    return "\n".join(partes)


def _resposta_erro(mensagem: str) -> CurriculoExtracaoResponse:
    """Resposta 200 de arquivo ilegível: candidato todo vazio + `erroLeitura`. §A.6: sem PII."""
    return CurriculoExtracaoResponse(
        candidato=CurriculoCandidato(**curriculo_mod.candidato_vazio()),
        confianca={},
        erro_leitura=mensagem,
    )


@router.post("/extrair", response_model=CurriculoExtracaoResponse, response_model_by_alias=True)
async def extrair(
    file: UploadFile = File(...),
    nomeArquivo: str = Form(default=""),  # noqa: N803 — nome do campo é fixado pelo contrato HTTP
    _: None = Depends(require_internal_token),
) -> CurriculoExtracaoResponse:
    conteudo = await file.read()
    try:
        if not conteudo:
            return _resposta_erro("Arquivo vazio.")

        tipo = _tipo_arquivo(nomeArquivo or (file.filename or ""), conteudo)
        if tipo is None:
            return _resposta_erro("Formato não suportado (esperado PDF ou DOCX).")

        try:
            if tipo == "PDF":
                bruto = gemini.extrair_curriculo(conteudo_pdf=conteudo)
            else:
                try:
                    texto = extrair_texto_docx(conteudo)
                except _DocxIlegivel:
                    return _resposta_erro("Não foi possível ler o arquivo DOCX (corrompido ou inválido).")
                if not texto.strip():
                    return _resposta_erro("Currículo sem texto legível.")
                bruto = gemini.extrair_curriculo(texto=texto)
        except ErroVertex as erro:
            # Falha do MOTOR, não do arquivo: HTTP distinguível para o backend retentar o transitório.
            # §A.6: mensagem fixa, nunca o corpo devolvido pelo provedor.
            raise HTTPException(
                status_code=HTTP_POR_FAMILIA[erro.familia],
                detail=DETALHE_POR_FAMILIA[erro.familia],
            ) from erro

        corpo = curriculo_mod.mapear_resposta(bruto)
        candidato = corpo["candidato"]
        # §A.6: o log conta QUANTOS campos vieram e QUANTOS telefones, NUNCA os valores nem o nome do
        # arquivo. Contagem é métrica; valor e nome de arquivo são PII.
        logger.info(
            "Extração de currículo (%s): %d de %d campos lidos, %d telefone(s).",
            tipo,
            sum(1 for c in ("nome", "cpf", "email", "nascimento", "cidade", "uf") if candidato[c])
            + (1 if candidato["telefones"] else 0),
            7,
            len(candidato["telefones"]),
        )
        return CurriculoExtracaoResponse(
            candidato=CurriculoCandidato(**candidato),
            confianca=corpo["confianca"],
            erro_leitura=None,
        )
    finally:
        # §A.6: o binário sai da memória ao fim da requisição, em qualquer caminho, inclusive no erro.
        del conteudo
        await file.close()
