"""JSON IRMÃO do formulário de VT: os campos estruturados viajam pelo bucket, junto do PDF.

POR QUE PELO BUCKET. O app externo roda no Firebase e o EA é loopback atrás da VPN, inalcançável de
fora. Foi esse o motivo do pivô para o GCS quando a frente nasceu. O bucket já é o transporte que
funciona para o PDF, então o JSON pega carona nele: nenhuma porta de entrada nova no EA.

O QUE ESTE ARQUIVO GARANTE, e é o ponto mais importante: **PDF sem JSON continua sendo arquivado**.
Todo formulário anterior a esta frente é só PDF, e ausência do irmão devolve `encontrado=false`, não
erro. Se isso virasse 404 ou exceção, a coleta pararia de arquivar justamente o acervo antigo.

§A.6: o backend manda o `id` do PDF, que já conhece, e NUNCA monta o nome do objeto. A troca de
extensão acontece no servidor, porque o nome carrega o nome do candidato.
"""

import json

from fastapi.testclient import TestClient

from app import gcs
from app.main import app

client = TestClient(app)
HEADERS = {"X-Internal-Token": "test-token"}

NOME_PDF = "FULANO DE TAL 39053344705.pdf"
NOME_JSON = "FULANO DE TAL 39053344705.json"

PAYLOAD = {
    "versao": 1,
    "optante": True,
    "cep": "01310100",
    "cidade": "São Paulo",
    "uf": "SP",
    "totalIda": 4.7,
    "totalVolta": 4.7,
    "totalDia": 9.4,
    "conducoes": [
        {"sentido": "IDA", "ordem": 1, "cartao": "BILHETE_UNICO", "valor": 4.7},
    ],
}


class _Blob:
    def __init__(self, conteudo: bytes | None):
        self._conteudo = conteudo

    def exists(self):
        return self._conteudo is not None

    def download_as_bytes(self):
        return self._conteudo or b""


class _Bucket:
    def __init__(self, objetos: dict[str, bytes]):
        self._objetos = objetos

    def blob(self, name):
        return _Blob(self._objetos.get(name))


class _Client:
    def __init__(self, objetos: dict[str, bytes]):
        self._objetos = objetos

    def bucket(self, _nome):
        return _Bucket(self._objetos)


def _montar(monkeypatch, objetos: dict[str, bytes]):
    monkeypatch.setattr(gcs, "get_storage_client", lambda: _Client(objetos))


def _pedir():
    return client.post(
        "/coleta-vt/dados", json={"bucket": "b", "id": NOME_PDF}, headers=HEADERS
    )


def test_le_o_json_irmao_derivando_o_nome_do_pdf(monkeypatch):
    _montar(monkeypatch, {NOME_JSON: json.dumps(PAYLOAD).encode("utf-8")})
    resp = _pedir()
    assert resp.status_code == 200, resp.text
    corpo = resp.json()
    assert corpo["encontrado"] is True
    assert corpo["dados"]["totalDia"] == 9.4
    # Os valores de enum chegam como o banco os espera, sem tradução no caminho.
    assert corpo["dados"]["conducoes"][0]["cartao"] == "BILHETE_UNICO"


def test_sem_json_irmao_devolve_encontrado_false_e_nao_erro(monkeypatch):
    """O acervo antigo é só PDF: isto NÃO pode quebrar o arquivamento dele."""
    _montar(monkeypatch, {})
    resp = _pedir()
    assert resp.status_code == 200
    assert resp.json() == {"encontrado": False, "dados": None}


def test_json_corrompido_nao_derruba_o_arquivamento(monkeypatch):
    _montar(monkeypatch, {NOME_JSON: b"{isto nao e json"})
    resp = _pedir()
    assert resp.status_code == 200
    assert resp.json()["encontrado"] is False


def test_json_que_nao_e_objeto_e_recusado(monkeypatch):
    """Uma lista no lugar de um objeto viraria escrita torta no banco."""
    _montar(monkeypatch, {NOME_JSON: b"[1, 2, 3]"})
    assert _pedir().json()["encontrado"] is False


def test_401_sem_token(monkeypatch):
    _montar(monkeypatch, {NOME_JSON: json.dumps(PAYLOAD).encode("utf-8")})
    resp = client.post("/coleta-vt/dados", json={"bucket": "b", "id": NOME_PDF})
    assert resp.status_code == 401
