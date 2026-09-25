"""DUAL-READ do handle do VT na transição do vazamento 2 (CPF no nome do objeto).

O nome do objeto passou a ser OPACO (`<uuid>.pdf`), sem CPF nem nome, porque o nome ia ao log de
acesso do Google. A identificação (o `admissaoId`) migrou para DENTRO do JSON irmão. Estes testes
provam que o `/listar` e o `/orfaos` resolvem o handle nas TRÊS classes que convivem no bucket, com
os campos IRMÃOS `cpf` e `admissaoId` (no máximo um preenchido, o backend decide por presença):

- (A/B) nome ANTIGO `NOME + 11 dígitos` → `cpf` preenchido, `admissaoId` nulo;
- (C)   nome OPACO + JSON irmão com `admissaoId` → `admissaoId` preenchido, `cpf` nulo;
- (C')  nome OPACO sem JSON legível → os dois nulos, o backend trata como órfão.

§A.6: nem o nome do objeto, nem o CPF, nem o `admissaoId` podem ir a log.
"""

import json
import logging
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app import gcs
from app.main import app

client = TestClient(app)
HEADERS = {"X-Internal-Token": "test-token"}

UID = "0123456789abcdef0123456789abcdef"
ADMISSAO_ID = "adm-7f3c-0001"

SIDECAR = {"versao": 1, "admissaoId": ADMISSAO_ID, "optante": True, "totalDia": 9.4}


class FakeBlob:
    def __init__(self, name, conteudo=b"x", content_type="application/pdf", md5_hash=None, time_created=None):
        self.name = name
        self._conteudo = conteudo
        self.content_type = content_type
        self.md5_hash = md5_hash
        self.time_created = time_created
        self.size = len(conteudo or b"")

    def exists(self):
        return self._conteudo is not None

    def download_as_bytes(self):
        return self._conteudo or b""


class FakeBucket:
    def __init__(self, blobs):
        self._by_name = {b.name: b for b in blobs}

    def blob(self, name):
        # Ausente → blob que responde exists()=False (o JSON irmão pode não existir).
        return self._by_name.get(name) or FakeBlob(name, conteudo=None)


class FakeClient:
    def __init__(self, blobs):
        self._blobs = blobs

    def list_blobs(self, _bucket):
        return list(self._blobs)

    def bucket(self, _bucket):
        return FakeBucket(self._blobs)


def _montar(monkeypatch, blobs):
    monkeypatch.setattr(gcs, "get_storage_client", lambda: FakeClient(blobs))


def _por_id(itens):
    return {it["id"]: it for it in itens}


# ── /listar: classe C (nome opaco + JSON com admissaoId) ─────────────────────
def test_listar_nome_opaco_casa_por_admissao_id(monkeypatch, caplog):
    blobs = [
        FakeBlob(f"{UID}.pdf", b"%PDF", "application/pdf"),
        FakeBlob(f"{UID}.json", json.dumps(SIDECAR).encode("utf-8"), "application/json"),
    ]
    _montar(monkeypatch, blobs)
    with caplog.at_level(logging.DEBUG):
        resp = client.post("/coleta-vt/listar", json={"bucket": "b"}, headers=HEADERS)
    assert resp.status_code == 200
    itens = _por_id(resp.json()["arquivos"])

    pdf = itens[f"{UID}.pdf"]
    assert pdf["admissaoId"] == ADMISSAO_ID
    assert pdf["cpf"] is None
    assert pdf["ehPdf"] is True

    # O JSON irmão listado por si só não tem handle (a identidade dele é consumida pelo PDF).
    jsn = itens[f"{UID}.json"]
    assert jsn["cpf"] is None
    assert jsn["admissaoId"] is None
    assert jsn["ehPdf"] is False

    # §A.6: nem o admissaoId nem o uid opaco vão a log.
    assert ADMISSAO_ID not in caplog.text
    assert UID not in caplog.text


# ── /listar: classe C' (nome opaco SEM JSON legível) ─────────────────────────
def test_listar_nome_opaco_sem_json_fica_sem_handle(monkeypatch):
    _montar(monkeypatch, [FakeBlob(f"{UID}.pdf", b"%PDF", "application/pdf")])
    resp = client.post("/coleta-vt/listar", json={"bucket": "b"}, headers=HEADERS)
    pdf = _por_id(resp.json()["arquivos"])[f"{UID}.pdf"]
    assert pdf["cpf"] is None
    assert pdf["admissaoId"] is None


# ── /listar: legado e novo convivem (dual-read) ──────────────────────────────
def test_listar_legado_e_opaco_convivem(monkeypatch):
    blobs = [
        FakeBlob("MARIA DA SILVA 11122233344.pdf", b"%PDF", "application/pdf"),
        FakeBlob(f"{UID}.pdf", b"%PDF", "application/pdf"),
        FakeBlob(f"{UID}.json", json.dumps(SIDECAR).encode("utf-8"), "application/json"),
    ]
    _montar(monkeypatch, blobs)
    itens = _por_id(client.post("/coleta-vt/listar", json={"bucket": "b"}, headers=HEADERS).json()["arquivos"])

    legado = itens["MARIA DA SILVA 11122233344.pdf"]
    assert legado["cpf"] == "11122233344"
    assert legado["admissaoId"] is None

    novo = itens[f"{UID}.pdf"]
    assert novo["admissaoId"] == ADMISSAO_ID


def test_listar_json_ilegivel_no_opaco_nao_derruba_e_nao_casa(monkeypatch):
    blobs = [
        FakeBlob(f"{UID}.pdf", b"%PDF", "application/pdf"),
        FakeBlob(f"{UID}.json", b"{quebrado", "application/json"),
    ]
    _montar(monkeypatch, blobs)
    resp = client.post("/coleta-vt/listar", json={"bucket": "b"}, headers=HEADERS)
    assert resp.status_code == 200
    pdf = _por_id(resp.json()["arquivos"])[f"{UID}.pdf"]
    assert pdf["admissaoId"] is None


# ── /orfaos: mesmo dual-read; nome opaco não expõe nome de pessoa ────────────
def test_orfaos_opaco_traz_admissao_id_e_nome_none(monkeypatch, caplog):
    quando = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)
    blobs = [
        FakeBlob(f"{UID}.pdf", b"%PDF", "application/pdf", time_created=quando),
        FakeBlob(f"{UID}.json", json.dumps(SIDECAR).encode("utf-8"), "application/json", time_created=quando),
    ]
    _montar(monkeypatch, blobs)
    with caplog.at_level(logging.DEBUG):
        resp = client.post("/coleta-vt/orfaos", json={"bucket": "b"}, headers=HEADERS)
    assert resp.status_code == 200
    pdf = _por_id(resp.json()["arquivos"])[f"{UID}.pdf"]
    assert pdf["admissaoId"] == ADMISSAO_ID
    assert pdf["cpf"] is None
    assert pdf["nome"] is None, "nome opaco não carrega nome de pessoa"
    assert ADMISSAO_ID not in caplog.text
    assert UID not in caplog.text


def test_orfaos_legado_mantem_nome_e_cpf(monkeypatch):
    quando = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)
    blobs = [FakeBlob("MARIA DA SILVA 11122233344.pdf", b"%PDF", "application/pdf", time_created=quando)]
    _montar(monkeypatch, blobs)
    it = client.post("/coleta-vt/orfaos", json={"bucket": "b"}, headers=HEADERS).json()["arquivos"][0]
    assert it["cpf"] == "11122233344"
    assert it["nome"] == "MARIA DA SILVA"
    assert it["admissaoId"] is None
