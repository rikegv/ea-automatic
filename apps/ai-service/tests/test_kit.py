"""F9 — kit. Gemini mockado; pypdf real sobre um PDF de 3 páginas fake."""

import json
import uuid
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from app import gemini
from app.config import get_settings
from app.main import app

client = TestClient(app)


def _fake_client(payload: dict):
    class _Models:
        def generate_content(self, *, model, contents, config):  # noqa: ARG002
            return SimpleNamespace(text=json.dumps(payload))

    return SimpleNamespace(models=_Models())


def _staging_base() -> Path:
    base = Path(get_settings().staging_dir)
    base.mkdir(parents=True, exist_ok=True)
    return base


def _pdf_3_paginas(_tmp_path=None) -> str:
    # Escreve DENTRO do STAGING_DIR (o guard de path traversal exige containment).
    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(width=200, height=200)
    p = _staging_base() / f"mae-{uuid.uuid4().hex}.pdf"
    with p.open("wb") as fh:
        writer.write(fh)
    return str(p)


def test_kit_extrai_paginas(monkeypatch, tmp_path):
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client({"paginas": [2, 3]}))
    resp = client.post(
        "/kit/gerar",
        json={"stagingPath": _pdf_3_paginas(tmp_path), "nomeCandidato": "Fulano de Tal"},
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 200
    caminho = resp.json()["stagingPathKit"]
    with open(caminho, "rb") as fh:
        reader = PdfReader(BytesIO(fh.read()))
    assert len(reader.pages) == 2


def test_kit_paginas_fora_do_intervalo_sao_filtradas(monkeypatch, tmp_path):
    # 7 está fora (PDF tem 3); deve sobrar só a página 1.
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client({"paginas": [1, 7]}))
    resp = client.post(
        "/kit/gerar",
        json={"stagingPath": _pdf_3_paginas(tmp_path), "nomeCandidato": "Fulano"},
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 200
    with open(resp.json()["stagingPathKit"], "rb") as fh:
        assert len(PdfReader(BytesIO(fh.read())).pages) == 1


def test_kit_nenhuma_pagina_422(monkeypatch, tmp_path):
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client({"paginas": []}))
    resp = client.post(
        "/kit/gerar",
        json={"stagingPath": _pdf_3_paginas(tmp_path), "nomeCandidato": "Sicrano"},
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 422


def test_kit_401_sem_token(tmp_path):
    resp = client.post(
        "/kit/gerar",
        json={"stagingPath": _pdf_3_paginas(tmp_path), "nomeCandidato": "Fulano"},
    )
    assert resp.status_code == 401


def test_kit_pdf_invalido_422(monkeypatch):
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client({"paginas": [1]}))
    p = _staging_base() / f"nao-{uuid.uuid4().hex}.pdf"
    p.write_bytes(b"isto nao e um pdf")
    resp = client.post(
        "/kit/gerar",
        json={"stagingPath": str(p), "nomeCandidato": "Fulano"},
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 422


def test_kit_staging_fora_da_area_400(monkeypatch):
    monkeypatch.setattr(
        gemini, "get_client", lambda: (_ for _ in ()).throw(AssertionError("não pode chamar"))
    )
    resp = client.post(
        "/kit/gerar",
        json={"stagingPath": "/etc/passwd", "nomeCandidato": "Fulano"},
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 400
