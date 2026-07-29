"""§A.17 (coleta de VT): as duas operações SOMENTE LEITURA sobre o bucket do GCS.

A fonte deixou de ser uma pasta do Drive e passou a ser um bucket do Google Cloud Storage. Os
testes trocam o client do GCS por um duplo em memória, cobrindo o caminho REAL do router sem rede.
§A.6: o nome cru do objeto (candidato + CPF) nunca pode sair do ai-service nem ir a log; a resposta
leva só o CPF extraído no servidor.
"""

import base64
import hashlib
import logging

from fastapi.testclient import TestClient

from app import gcs
from app.drive import extrair_cpf_do_nome
from app.main import app
from app.staging import ler_staging

client = TestClient(app)
HEADERS = {"X-Internal-Token": "test-token"}

PDF_VT = b"%PDF-1.7 formulario de VT"

# md5 de PDF_VT nos dois formatos: base64 (como o GCS devolve em md5_hash) e hex (o que a API expõe).
_RAW_MD5 = hashlib.md5(PDF_VT).digest()
MD5_B64 = base64.b64encode(_RAW_MD5).decode("ascii")
MD5_HEX = _RAW_MD5.hex()


class FakeBlob:
    """Duplo de um blob do GCS: expõe name, md5_hash (base64), content_type, size e download."""

    def __init__(self, name, md5_hash, content_type, size, conteudo=b""):
        self.name = name
        self.md5_hash = md5_hash
        self.content_type = content_type
        self.size = size
        self._conteudo = conteudo

    def download_as_bytes(self):
        return self._conteudo


class FakeBucket:
    def __init__(self, blobs):
        self._blobs = {b.name: b for b in blobs}

    def blob(self, name):
        return self._blobs[name]


class FakeStorageClient:
    """Duplo do storage.Client: list_blobs(bucket) e bucket(bucket).blob(name).download_as_bytes()."""

    def __init__(self, blobs):
        self._blobs = blobs

    def list_blobs(self, bucket):
        return list(self._blobs)

    def bucket(self, bucket):
        return FakeBucket(self._blobs)


def _montar(monkeypatch, fake: FakeStorageClient):
    monkeypatch.setattr(gcs, "get_storage_client", lambda: fake)


# ── extrair_cpf_do_nome (reaproveitado de drive.py) ──────────────────────────
def test_cpf_happy_path():
    assert extrair_cpf_do_nome("MARIA DA SILVA 11122233344.pdf") == "11122233344"


def test_cpf_mascarado_nao_e_reconhecido():
    # CPF com máscara (pontos/traço) não é um token de 11 dígitos consecutivos.
    assert extrair_cpf_do_nome("MARIA DA SILVA 111.222.333-44.pdf") is None


def test_cpf_ausente_retorna_none():
    assert extrair_cpf_do_nome("FORMULARIO SEM DOCUMENTO.pdf") is None


def test_cpf_com_numero_interno_pega_o_do_final():
    # Um número interno no nome (ex.: "3 VIA") não deve ganhar do CPF ao final.
    assert extrair_cpf_do_nome("JOAO 3 VIA 98765432100.pdf") == "98765432100"


def test_cpf_nome_vazio():
    assert extrair_cpf_do_nome("") is None


# ── POST /coleta-vt/listar ───────────────────────────────────────────────────
def test_listar_hex_md5_pdf_flag_cpf_e_nao_vaza_nome(monkeypatch, caplog):
    fake = FakeStorageClient(
        blobs=[
            FakeBlob("MARIA DA SILVA 11122233344.pdf", MD5_B64, "application/pdf", len(PDF_VT)),
            FakeBlob("JOAO SEM CPF.jpg", None, "image/jpeg", 10),
        ]
    )
    _montar(monkeypatch, fake)
    with caplog.at_level(logging.DEBUG):
        resp = client.post("/coleta-vt/listar", json={"bucket": "vt-online"}, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    itens = body["arquivos"]
    assert len(itens) == 2

    a, b = itens
    # id = nome do objeto (o backend precisa dele para pedir o download).
    assert a["id"] == "MARIA DA SILVA 11122233344.pdf"
    assert a["ehPdf"] is True
    assert a["cpf"] == "11122233344"
    assert a["md5"] == MD5_HEX, "md5 sai em HEX, não em base64"
    assert a["md5"] != MD5_B64
    assert a["mimeType"] == "application/pdf"

    assert b["id"] == "JOAO SEM CPF.jpg"
    assert b["ehPdf"] is False, "só application/pdf é PDF"
    assert b["cpf"] is None, "sem CPF no nome"
    assert b["md5"] is None, "objeto sem md5_hash vira None"

    # §A.6: o nome cru do candidato NUNCA aparece em NENHUM log.
    texto_log = caplog.text
    assert "MARIA" not in texto_log
    assert "SILVA" not in texto_log
    assert "JOAO" not in texto_log
    assert "11122233344" not in texto_log


def test_listar_401_sem_token():
    resp = client.post("/coleta-vt/listar", json={"bucket": "vt-online"})
    assert resp.status_code == 401


# ── POST /coleta-vt/baixar ───────────────────────────────────────────────────
def test_baixar_grava_na_staging_e_pode_ser_lido_de_volta(monkeypatch, caplog):
    nome = "MARIA DA SILVA 11122233344.pdf"
    fake = FakeStorageClient(
        blobs=[FakeBlob(nome, MD5_B64, "application/pdf", len(PDF_VT), conteudo=PDF_VT)]
    )
    _montar(monkeypatch, fake)
    with caplog.at_level(logging.DEBUG):
        resp = client.post(
            "/coleta-vt/baixar", json={"bucket": "vt-online", "id": nome}, headers=HEADERS
        )
    assert resp.status_code == 200
    staging_path = resp.json()["stagingPath"]
    assert staging_path.endswith(".pdf")
    # O caminho devolvido passa pelo guard de ler_staging e traz de volta o mesmo binário.
    assert ler_staging(staging_path) == PDF_VT
    # §A.6: nem o nome do objeto nem o CPF vão a log.
    assert "MARIA" not in caplog.text
    assert "11122233344" not in caplog.text


def test_baixar_401_sem_token():
    resp = client.post("/coleta-vt/baixar", json={"bucket": "vt-online", "id": "x"})
    assert resp.status_code == 401
