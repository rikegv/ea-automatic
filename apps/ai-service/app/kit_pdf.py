"""Etapa 4 do Gerador de Kit: monta o PDF consolidado de cada funcionário e o ZIP com um PDF por
funcionário.

As páginas ORIGINAIS são concatenadas via pypdf, na ordem do painel (dicionário do kit), SEM
reprocessar, preservando texto e assinaturas. O PDF contém apenas as páginas reais dos documentos.

§A.6: nada de PII em log; os binários vêm da staging efêmera e nunca persistem aqui. §A.11: sem
travessão.
"""

from __future__ import annotations

import re
import unicodedata
import zipfile
from io import BytesIO

from pypdf import PdfReader, PdfWriter


class KitStagingExpirado(Exception):
    """Um PDF de origem já não está na staging (expurgado pelo TTL de 1h). Reprocessar o kit."""


def _sanitizar_nome(nome: str) -> str:
    """Nome de arquivo seguro a partir do nome do funcionário (sem acento, só [A-Za-z0-9_-])."""
    base = unicodedata.normalize("NFKD", nome or "")
    base = "".join(c for c in base if not unicodedata.combining(c))
    base = re.sub(r"[^A-Za-z0-9_-]+", "_", base).strip("_")
    return (base or "funcionario")[:80]


def nome_arquivo_funcionario(nome: str) -> str:
    return f"kit_{_sanitizar_nome(nome)}.pdf"


def _abrir(caminho: str | None, cache: dict[str, PdfReader] | None) -> PdfReader:
    if not caminho:
        raise KitStagingExpirado()
    if cache is not None and caminho in cache:
        return cache[caminho]
    try:
        reader = PdfReader(caminho)
    except (FileNotFoundError, OSError) as exc:
        raise KitStagingExpirado() from exc
    if cache is not None:
        cache[caminho] = reader
    return reader


def montar_pdf_funcionario(
    func: dict,
    mapa_arquivos: dict[str, str],
    dicionario: list[dict],
    *,
    cache: dict[str, PdfReader] | None = None,
) -> bytes:
    """PDF consolidado de UM funcionário: apenas as páginas originais, na ordem do kit.

    `mapa_arquivos` traduz o rótulo do arquivo (origem) para o caminho na staging (nunca exposto).
    `dicionario` é mantido na assinatura por estabilidade do contrato interno (não altera a saída).
    `cache` reaproveita os PdfReader entre funcionários (essencial no ZIP: lê cada origem uma vez).
    Levanta KitStagingExpirado se um PDF de origem já foi expurgado pelo TTL.
    """
    writer = PdfWriter()

    for doc in sorted(func.get("documentos", []), key=lambda d: d["ordem"]):
        reader = _abrir(mapa_arquivos.get(doc["arquivo"]), cache)
        total = len(reader.pages)
        for pagina in doc["paginas"]:  # 1-based no PDF de origem
            if 1 <= pagina <= total:
                writer.add_page(reader.pages[pagina - 1])

    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def montar_zip(resultado: dict, mapa_arquivos: dict[str, str]) -> bytes:
    """ZIP com um PDF consolidado por funcionário, nomeado kit_<funcionario>.pdf (sufixo em colisão)."""
    dicionario = resultado.get("dicionario", [])
    funcionarios = resultado.get("funcionarios", [])
    cache: dict[str, PdfReader] = {}
    usados: dict[str, int] = {}

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for func in funcionarios:
            pdf = montar_pdf_funcionario(func, mapa_arquivos, dicionario, cache=cache)
            base = _sanitizar_nome(func.get("nome", ""))
            usados[base] = usados.get(base, 0) + 1
            sufixo = "" if usados[base] == 1 else f"_{usados[base]}"
            zf.writestr(f"kit_{base}{sufixo}.pdf", pdf)
    return buf.getvalue()
