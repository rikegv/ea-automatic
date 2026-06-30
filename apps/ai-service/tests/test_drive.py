"""INT-2 — Drive. Cobre o modo mock (sem rede, slug sem PII), o fail-fast do guard de
ambiente e o 401 sem token.

O caminho REAL não é testado aqui (bate na API do Google); é validado por smoke manual.
"""

import hashlib

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import drive as drive_router_mod  # noqa: F401  (garante import do módulo de rota)
from app.config import Settings, get_settings
from app.main import app
from app.routers.drive import _mock_slug

client = TestClient(app)

PASTA_NOME = "Joao da Silva — Operacao X"
REQ = {
    "parentFolderId": "PARENT123",
    "pastaNome": PASTA_NOME,
    "arquivos": [
        {"stagingPath": "/tmp/x.pdf", "nomeFinal": "rg.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
        {"stagingPath": "/tmp/y.pdf", "nomeFinal": "aso.pdf", "subpasta": "ASO"},
    ],
}


def _set_mock(value: bool):
    get_settings.cache_clear()
    s = get_settings()
    object.__setattr__(s, "drive_mock", value)


def test_drive_mock_nao_chama_api(monkeypatch):
    _set_mock(True)
    # Se tocar na API real, o get_drive_service quebraria o teste — garantimos que NÃO é chamado.
    from app.routers import drive as drive_router

    monkeypatch.setattr(
        drive_router.drive,
        "get_drive_service",
        lambda: (_ for _ in ()).throw(AssertionError("mock não pode chamar o Drive")),
    )
    try:
        resp = client.post("/drive/arquivar", json=REQ, headers={"X-Internal-Token": "test-token"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["arquivados"] == 2
        assert body["pastaUrl"].startswith("https://drive.google.com/drive/folders/MOCK-")
    finally:
        _set_mock(False)


def test_mock_slug_sem_pii():
    # R2(a): o slug é um hash curto do pastaNome — não contém o nome cru nem partes dele.
    slug = _mock_slug(PASTA_NOME)
    assert slug == hashlib.sha256(PASTA_NOME.encode("utf-8")).hexdigest()[:8]
    assert len(slug) == 8
    assert "joao" not in slug.lower()
    assert "silva" not in slug.lower()
    assert " " not in slug


def test_fail_fast_mock_em_producao():
    # R2(b): DRIVE_MOCK=true + APP_ENV de produção → recusa instanciar (fail-fast).
    with pytest.raises(ValidationError):
        Settings(app_env="production", drive_mock=True, internal_token="x")


def test_mock_permitido_em_dev():
    # Em dev o mock é válido (não levanta).
    s = Settings(app_env="dev", drive_mock=True, internal_token="x")
    assert s.drive_mock is True
    assert s.is_producao is False


def test_drive_401_sem_token():
    resp = client.post("/drive/arquivar", json=REQ)
    assert resp.status_code == 401
