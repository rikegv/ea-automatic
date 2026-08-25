"""O arquivamento DEVOLVE o id de cada arquivo que criou (`arquivosIds`).

POR QUE ISTO EXISTE. A coleta de VT precisa gravar a URL do formulário no banco, para a tela de
Benefícios abrir o PDF sem ninguém procurar no Drive. O id já era pedido ao Google (`fields="id"`) e
era jogado fora, então o EA só tinha o link da PASTA.

PROCURAR O ARQUIVO PELO NOME DEPOIS NÃO SERVE, e é o motivo de o id vir do próprio upload: a mesma
pessoa pode ter DOIS arquivos de mesmo nome na mesma pasta (acontece hoje, quando o candidato reenvia
o formulário), e a busca por nome não sabe qual dos dois é o desta vez.

ARQUIVO IGNORADO NÃO ENTRA NA LISTA. Ele não foi criado agora, e quem guarda a URL já a guardou na
primeira vez, porque o ledger da coleta é único por (md5, origem). A lista responde "o que subiu
nesta chamada", não "o que existe lá".
"""

from fastapi.testclient import TestClient

from app.main import app
from tests.test_drive_dedup import PDF_A, PDF_B, DriveFake, _montar, _req

client = TestClient(app)
HEADERS = {"X-Internal-Token": "test-token"}


def test_devolve_um_id_por_arquivo_criado(monkeypatch):
    fake = DriveFake()
    _montar(monkeypatch, fake, {"/s/1": PDF_A, "/s/2": PDF_B})
    resp = client.post(
        "/drive/arquivar",
        json=_req(
            [
                {"stagingPath": "/s/1", "nomeFinal": "VT_FULANO", "subpasta": "BENEFICIOS"},
                {"stagingPath": "/s/2", "nomeFinal": "ASO_FULANO", "subpasta": "ASO"},
            ]
        ),
        headers=HEADERS,
    )
    assert resp.status_code == 200, resp.text
    corpo = resp.json()
    assert corpo["arquivados"] == 2
    # Um id por arquivo criado, e ids DISTINTOS: é o que permite montar o link certo de cada um.
    assert len(corpo["arquivosIds"]) == 2
    assert len(set(corpo["arquivosIds"])) == 2


def test_arquivo_ja_no_destino_nao_gera_id(monkeypatch):
    """Reenvio do MESMO conteúdo: nada sobe, então nada entra na lista."""
    fake = DriveFake()
    _montar(monkeypatch, fake, {"/s/1": PDF_A, "/s/2": PDF_A})
    req = _req([{"stagingPath": "/s/1", "nomeFinal": "VT_FULANO", "subpasta": "BENEFICIOS"}])
    primeira = client.post("/drive/arquivar", json=req, headers=HEADERS).json()
    assert len(primeira["arquivosIds"]) == 1

    req2 = _req([{"stagingPath": "/s/2", "nomeFinal": "VT_FULANO", "subpasta": "BENEFICIOS"}])
    segunda = client.post("/drive/arquivar", json=req2, headers=HEADERS).json()
    assert segunda["ignorados"] == 1
    assert segunda["arquivosIds"] == []


def test_modo_mock_nao_promete_id_que_nao_existe(monkeypatch):
    """No mock nada sobe de verdade, então a lista vem vazia em vez de inventar id."""
    monkeypatch.setattr(__import__("app.config", fromlist=["get_settings"]).get_settings(), "drive_mock", True, raising=False)
    fake = DriveFake()
    _montar(monkeypatch, fake, {"/s/1": PDF_A})
    resp = client.post(
        "/drive/arquivar",
        json=_req([{"stagingPath": "/s/1", "nomeFinal": "VT_FULANO", "subpasta": "BENEFICIOS"}]),
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json().get("arquivosIds", []) == []
