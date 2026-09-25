"""Mapeador de colunas de CANDIDATO por IA (Central de Candidatos, A&S).

Espelha o mapeador de LOJAS. Gemini SEMPRE mockado (nenhuma chamada de rede). Cobre: cabeçalho
reconhecido, coluna ausente vira null, índice fora do intervalo vira null, cidade+UF juntas → UF
null, amostra truncada em MAX_AMOSTRA, 401 sem token, 422 sem cabeçalho e a família QUOTA → 429 com
a mensagem de "escolha as colunas manualmente".
"""

import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app import gemini
from app.main import app
from app.routers import planilha as planilha_router
from app.vertex_erros import ErroVertex

client = TestClient(app)

URL = "/planilha/mapear-colunas-candidato"
AUTH = {"X-Internal-Token": "test-token"}


def _fake_client(payload: dict, capturado: dict | None = None):
    """Cliente Vertex falso: devolve `payload` como JSON e, se pedido, captura o texto enviado."""

    class _Models:
        def generate_content(self, *, model, contents, config):  # noqa: ARG002
            if capturado is not None:
                capturado["texto"] = contents[-1].text
                capturado["config"] = config
            return SimpleNamespace(text=json.dumps(payload))

    return SimpleNamespace(models=_Models())


def test_401_sem_token():
    resp = client.post(URL, json={"cabecalho": ["Nome"], "amostra": []})
    assert resp.status_code == 401


def test_422_sem_cabecalho(monkeypatch):
    resp = client.post(URL, json={"cabecalho": [], "amostra": []}, headers=AUTH)
    assert resp.status_code == 422


def test_cabecalho_reconhecido(monkeypatch):
    payload = {
        "coluna_nome": 0,
        "coluna_cpf": 1,
        "coluna_email": 2,
        "coluna_telefone": 3,
        "coluna_nascimento": 4,
        "coluna_cidade": 5,
        "coluna_uf": 6,
        "confianca": "ALTA",
        "observacao": "cabeçalho explícito",
    }
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client(payload))
    resp = client.post(
        URL,
        json={
            "cabecalho": ["Nome", "CPF", "E-mail", "Telefone", "Nascimento", "Cidade", "UF"],
            "amostra": [["Ana", "529.982.247-25", "a@x.com", "11999", "01/02/1990", "SP", "SP"]],
        },
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "colunaNome": 0,
        "colunaCpf": 1,
        "colunaEmail": 2,
        "colunaTelefone": 3,
        "colunaNascimento": 4,
        "colunaCidade": 5,
        "colunaUf": 6,
        "confianca": "ALTA",
        "observacao": "cabeçalho explícito",
    }


def test_coluna_ausente_vira_null(monkeypatch):
    # Só nome e CPF existem; o resto a IA devolve null e o response mantém null (camelCase).
    payload = {
        "coluna_nome": 0,
        "coluna_cpf": 1,
        "coluna_email": None,
        "coluna_telefone": None,
        "coluna_nascimento": None,
        "coluna_cidade": None,
        "coluna_uf": None,
        "confianca": "MEDIA",
        "observacao": "só nome e cpf",
    }
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client(payload))
    resp = client.post(
        URL,
        json={"cabecalho": ["Nome", "CPF"], "amostra": [["Ana", "529.982.247-25"]]},
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["colunaNome"] == 0
    assert body["colunaCpf"] == 1
    assert body["colunaEmail"] is None
    assert body["colunaTelefone"] is None
    assert body["colunaNascimento"] is None
    assert body["colunaCidade"] is None
    assert body["colunaUf"] is None


def test_indice_fora_do_intervalo_vira_null(monkeypatch):
    # A IA devolveu um índice que não existe no cabeçalho (só 2 colunas): saneado para None.
    payload = {
        "coluna_nome": 0,
        "coluna_cpf": 9,  # fora do intervalo
        "coluna_email": None,
        "coluna_telefone": None,
        "coluna_nascimento": None,
        "coluna_cidade": None,
        "coluna_uf": None,
        "confianca": "BAIXA",
        "observacao": "",
    }
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client(payload))
    resp = client.post(
        URL,
        json={"cabecalho": ["Nome", "Documento"], "amostra": []},
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["colunaNome"] == 0
    assert body["colunaCpf"] is None


def test_cidade_e_uf_juntas_uf_null(monkeypatch):
    # Coluna única "Cidade/UF" → mapeada como cidade, UF fica null (regra do prompt, honrada aqui).
    payload = {
        "coluna_nome": 0,
        "coluna_cpf": None,
        "coluna_email": None,
        "coluna_telefone": None,
        "coluna_nascimento": None,
        "coluna_cidade": 1,
        "coluna_uf": None,
        "confianca": "MEDIA",
        "observacao": "cidade e uf na mesma coluna",
    }
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client(payload))
    resp = client.post(
        URL,
        json={"cabecalho": ["Nome", "Cidade/UF"], "amostra": [["Ana", "São Paulo/SP"]]},
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["colunaCidade"] == 1
    assert body["colunaUf"] is None


def test_confianca_invalida_vira_baixa(monkeypatch):
    payload = {
        "coluna_nome": 0,
        "coluna_cpf": None,
        "coluna_email": None,
        "coluna_telefone": None,
        "coluna_nascimento": None,
        "coluna_cidade": None,
        "coluna_uf": None,
        "confianca": "TALVEZ",  # fora do enum
        "observacao": "x",
    }
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client(payload))
    resp = client.post(URL, json={"cabecalho": ["Nome"], "amostra": []}, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["confianca"] == "BAIXA"


def test_amostra_truncada_em_max(monkeypatch):
    # O router corta a amostra em MAX_AMOSTRA antes de chamar a IA: a chamada nunca recebe a
    # planilha inteira (§A.6). Capturamos o texto enviado e contamos as linhas da amostra.
    capturado: dict = {}
    payload = {
        "coluna_nome": 0,
        "coluna_cpf": None,
        "coluna_email": None,
        "coluna_telefone": None,
        "coluna_nascimento": None,
        "coluna_cidade": None,
        "coluna_uf": None,
        "confianca": "ALTA",
        "observacao": "",
    }
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client(payload, capturado))
    limite = planilha_router.MAX_AMOSTRA
    amostra = [[f"Pessoa {i}"] for i in range(limite + 25)]
    resp = client.post(URL, json={"cabecalho": ["Nome"], "amostra": amostra}, headers=AUTH)
    assert resp.status_code == 200
    # Cabeçalho + "AMOSTRA DE N LINHAS" no prompt; a contagem informada é o teto, não o total enviado.
    assert f"AMOSTRA DE {limite} LINHAS" in capturado["texto"]
    # A última linha enviada é a de índice (limite-1); a de índice `limite` NÃO pode aparecer.
    assert f"Pessoa {limite - 1}" in capturado["texto"]
    assert f"Pessoa {limite}" not in capturado["texto"]


def test_quota_vira_429_com_mensagem_manual(monkeypatch):
    # A IA estourou a quota: o router traduz para 429 e devolve a mensagem que orienta o time a
    # escolher as colunas manualmente, seguindo sem a IA.
    def _estoura(**kwargs):  # noqa: ARG001
        raise ErroVertex("QUOTA")

    monkeypatch.setattr(gemini, "mapear_colunas_candidato", _estoura)
    resp = client.post(URL, json={"cabecalho": ["Nome"], "amostra": []}, headers=AUTH)
    assert resp.status_code == 429
    assert "manual" in resp.json()["detail"].lower()
