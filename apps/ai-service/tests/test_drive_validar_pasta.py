"""Validação read-only da pasta-pai do Drive antes de o EA cadastrar o id (INT-2).

Antecipa o `parentNotAFolder` (id de pasta errado que só falharia no arquivamento) para o momento
do cadastro. Troca o client do Google por um duplo em memória (mesmo padrão de test_drive_dedup.py),
então cobre o caminho REAL da função e do router, sem rede. §A.6: o folderId não é PII; nada de nome
de pessoa aqui.
"""

import json

from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError

from app.drive import _FOLDER_MIME, validar_pasta
from app.main import app
from app.routers import drive as drive_router

client = TestClient(app)
HEADERS = {"X-Internal-Token": "test-token"}


class _FakeResp:
    def __init__(self, status: int):
        self.status = status
        self.reason = "erro"


def _http_error(status: int, reason_code: str) -> HttpError:
    content = json.dumps(
        {"error": {"errors": [{"reason": reason_code}], "code": status}}
    ).encode("utf-8")
    return HttpError(_FakeResp(status), content)


class GetFake:
    """Duplo do client: files().get(...).execute() devolve `resposta` ou levanta `erro`."""

    def __init__(self, resposta: dict | None = None, erro: Exception | None = None):
        self._resposta = resposta
        self._erro = erro

    def files(self):
        return self

    def get(self, *, fileId, fields, supportsAllDrives):
        return self

    def execute(self):
        if self._erro is not None:
            raise self._erro
        return self._resposta


def _pasta_ok() -> dict:
    return {
        "id": "PASTA-1",
        "mimeType": _FOLDER_MIME,
        "trashed": False,
        "capabilities": {"canAddChildren": True},
    }


# ── validar_pasta (unidade, cada caso) ───────────────────────────────────────
def test_pasta_valida():
    assert validar_pasta(GetFake(resposta=_pasta_ok()), "PASTA-1") == {"valido": True}


def test_pasta_nao_encontrada_404():
    fake = GetFake(erro=_http_error(404, "notFound"))
    resultado = validar_pasta(fake, "SUMIDA")
    assert resultado["valido"] is False
    assert "encontrada" in resultado["motivo"]


def test_id_e_arquivo_nao_pasta():
    resp = _pasta_ok()
    resp["mimeType"] = "application/pdf"
    resultado = validar_pasta(GetFake(resposta=resp), "ARQUIVO")
    assert resultado["valido"] is False
    assert "ARQUIVO".lower() in resultado["motivo"].lower()


def test_sem_permissao_de_escrita():
    resp = _pasta_ok()
    resp["capabilities"]["canAddChildren"] = False
    resultado = validar_pasta(GetFake(resposta=resp), "SO-LEITURA")
    assert resultado["valido"] is False
    assert "escrita" in resultado["motivo"]


def test_pasta_na_lixeira():
    resp = _pasta_ok()
    resp["trashed"] = True
    resultado = validar_pasta(GetFake(resposta=resp), "NA-LIXEIRA")
    assert resultado["valido"] is False
    assert "lixeira" in resultado["motivo"]


def test_erro_inesperado_reusa_motivo_http():
    # Erro não previsto (não é 404) cai no ramo genérico, que anexa o motivo de motivo_http.
    fake = GetFake(erro=_http_error(500, "backendError"))
    resultado = validar_pasta(fake, "QUALQUER")
    assert resultado["valido"] is False
    assert "500" in resultado["motivo"]


# ── POST /drive/validar-pasta (router) ───────────────────────────────────────
def test_endpoint_caminho_real(monkeypatch):
    monkeypatch.setattr(
        drive_router.drive, "get_drive_service", lambda: GetFake(resposta=_pasta_ok())
    )
    resp = client.post("/drive/validar-pasta", json={"folderId": "PASTA-1"}, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json() == {"valido": True, "motivo": None}


def test_endpoint_arquivo_nao_pasta(monkeypatch):
    resp_arquivo = _pasta_ok()
    resp_arquivo["mimeType"] = "application/pdf"
    monkeypatch.setattr(
        drive_router.drive, "get_drive_service", lambda: GetFake(resposta=resp_arquivo)
    )
    resp = client.post("/drive/validar-pasta", json={"folderId": "ARQUIVO"}, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valido"] is False
    assert body["motivo"]


def test_endpoint_mock(monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "drive_mock", True)
    resp = client.post("/drive/validar-pasta", json={"folderId": "QUALQUER"}, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json() == {"valido": True, "motivo": "mock"}


def test_endpoint_401_sem_token():
    resp = client.post("/drive/validar-pasta", json={"folderId": "PASTA-1"})
    assert resp.status_code == 401
