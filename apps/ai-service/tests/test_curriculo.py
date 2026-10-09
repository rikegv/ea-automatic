"""Extração de candidato por CURRÍCULO (POST /curriculo/extrair).

Gemini SEMPRE mockado (nenhuma chamada de rede). Cobre: PDF devolve a forma mapeada; DOCX extrai o
texto de verdade (parágrafos + tabela, python-docx rodando, Gemini mockado) e devolve a forma;
vários telefones (>= 2); campo ausente vira vazio; data/UF inválidas viram vazio (nunca chute);
arquivo ilegível e formato não suportado => 200 com erroLeitura; falha de motor (quota) => 429;
401 sem token.

A fábrica monta currículos SINTÉTICOS no teste (CPF de família reservada com verificador válido,
e-mail de domínio de homolog) — nenhum dado de pessoa real entra em fixture versionada (§A.6).
"""

import json
from io import BytesIO
from types import SimpleNamespace

from docx import Document
from fastapi.testclient import TestClient

from app import gemini
from app.main import app
from app.vertex_erros import ErroVertex

client = TestClient(app)

URL = "/curriculo/extrair"
AUTH = {"X-Internal-Token": "test-token"}


def _fake_client(payload: dict, capturado: dict | None = None):
    """Cliente Vertex falso: devolve `payload` como JSON e, se pedido, captura os contents enviados."""

    class _Models:
        def generate_content(self, *, model, contents, config):  # noqa: ARG002
            if capturado is not None:
                capturado["contents"] = contents
                capturado["config"] = config
            return SimpleNamespace(text=json.dumps(payload))

    return SimpleNamespace(models=_Models())


def _mock_gemini(monkeypatch, payload: dict, capturado: dict | None = None):
    monkeypatch.setattr(gemini, "get_client", lambda: _fake_client(payload, capturado))


def _docx_bytes(paragrafos: list[str], tabela: list[list[str]] | None = None) -> bytes:
    """Gera um .docx REAL em memória para o caminho de extração de texto rodar de verdade."""
    doc = Document()
    for p in paragrafos:
        doc.add_paragraph(p)
    if tabela:
        t = doc.add_table(rows=len(tabela), cols=len(tabela[0]))
        for i, linha in enumerate(tabela):
            for j, valor in enumerate(linha):
                t.cell(i, j).text = valor
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


# CPF sintético de família reservada (000.000.000-00..99 não é válido; uso um com DV correto de teste).
_PAYLOAD_COMPLETO = {
    "nome": "Candidato Sintetico De Teste",
    "cpf": "52998224725",
    "email": "candidato@homolog.example",
    "telefones": ["(11) 99999-0001", "11 3333-0002"],
    "nascimento": "1990-02-01",
    "cidade": "São Paulo",
    "uf": "SP",
    "confianca": {"nome": "ALTA", "telefones": "MEDIA"},
}


def test_401_sem_token():
    resp = client.post(
        URL,
        files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"nomeArquivo": "cv.pdf"},
    )
    assert resp.status_code == 401


def test_pdf_devolve_forma_mapeada(monkeypatch):
    capturado: dict = {}
    _mock_gemini(monkeypatch, _PAYLOAD_COMPLETO, capturado)
    resp = client.post(
        URL,
        files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"nomeArquivo": "cv.pdf"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["erroLeitura"] is None
    assert body["candidato"] == {
        "nome": "Candidato Sintetico De Teste",
        "cpf": "52998224725",
        "email": "candidato@homolog.example",
        "telefones": ["(11) 99999-0001", "11 3333-0002"],
        "nascimento": "1990-02-01",
        "cidade": "São Paulo",
        "uf": "SP",
    }
    assert body["confianca"] == {"nome": "ALTA", "telefones": "MEDIA"}
    # PDF vai como bytes ao modelo (Part.from_bytes), não como texto.
    primeira = capturado["contents"][0]
    assert getattr(primeira, "inline_data", None) is not None or getattr(primeira, "text", None) is None


def test_docx_extrai_texto_de_verdade(monkeypatch):
    capturado: dict = {}
    _mock_gemini(monkeypatch, _PAYLOAD_COMPLETO, capturado)
    conteudo = _docx_bytes(
        paragrafos=["Candidato Sintetico De Teste", "candidato@homolog.example"],
        tabela=[["Telefone", "(11) 99999-0001"], ["Cidade", "São Paulo / SP"]],
    )
    resp = client.post(
        URL,
        files={
            "file": (
                "cv.docx",
                conteudo,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"nomeArquivo": "cv.docx"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    assert resp.json()["candidato"]["nome"] == "Candidato Sintetico De Teste"
    # O texto do .docx (parágrafos E célula de tabela) chegou ao modelo como Part.from_text.
    texto_enviado = "\n".join(
        getattr(parte, "text", "") or "" for parte in capturado["contents"]
    )
    assert "CONTEÚDO DO CURRÍCULO" in texto_enviado
    assert "Candidato Sintetico De Teste" in texto_enviado
    assert "(11) 99999-0001" in texto_enviado  # veio da TABELA, prova a varredura de tabela


def test_varios_telefones_capturados(monkeypatch):
    payload = dict(_PAYLOAD_COMPLETO, telefones=["(11) 99999-0001", "11 3333-0002", "0800 777 0003"])
    _mock_gemini(monkeypatch, payload)
    resp = client.post(
        URL,
        files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"nomeArquivo": "cv.pdf"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    telefones = resp.json()["candidato"]["telefones"]
    assert len(telefones) >= 2
    assert telefones == ["(11) 99999-0001", "11 3333-0002", "0800 777 0003"]


def test_campo_ausente_vira_vazio(monkeypatch):
    # O modelo devolveu só nome; o resto vazio/lista vazia. Nada é inventado.
    payload = {
        "nome": "Candidato Sintetico",
        "cpf": "",
        "email": "",
        "telefones": [],
        "nascimento": "",
        "cidade": "",
        "uf": "",
    }
    _mock_gemini(monkeypatch, payload)
    resp = client.post(
        URL,
        files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"nomeArquivo": "cv.pdf"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    cand = resp.json()["candidato"]
    assert cand["nome"] == "Candidato Sintetico"
    assert cand["cpf"] == ""
    assert cand["email"] == ""
    assert cand["telefones"] == []
    assert cand["nascimento"] == ""
    assert cand["cidade"] == ""
    assert cand["uf"] == ""


def test_data_e_uf_invalidas_viram_vazio(monkeypatch):
    # Data fora do ISO e UF de 3 letras: descartadas (vazio), nunca repassadas como chute.
    payload = dict(_PAYLOAD_COMPLETO, nascimento="01/02/1990", uf="SPP")
    _mock_gemini(monkeypatch, payload)
    resp = client.post(
        URL,
        files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"nomeArquivo": "cv.pdf"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    cand = resp.json()["candidato"]
    assert cand["nascimento"] == ""
    assert cand["uf"] == ""


def test_formato_nao_suportado_vira_erro_leitura(monkeypatch):
    # Nunca chama o modelo: se chamasse, o teste quebraria (get_client não mockado de propósito).
    resp = client.post(
        URL,
        files={"file": ("cv.txt", b"curriculo em texto puro", "text/plain")},
        data={"nomeArquivo": "cv.txt"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["erroLeitura"] is not None
    assert body["candidato"]["nome"] == ""
    assert body["candidato"]["telefones"] == []


def test_docx_corrompido_vira_erro_leitura():
    # Começa com PK (assinatura de ZIP) mas não é um Word válido: extração falha, vira erroLeitura 200.
    resp = client.post(
        URL,
        files={
            "file": (
                "cv.docx",
                b"PK\x03\x04lixo que nao e um docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"nomeArquivo": "cv.docx"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    assert resp.json()["erroLeitura"] is not None


def test_arquivo_vazio_vira_erro_leitura():
    resp = client.post(
        URL,
        files={"file": ("cv.pdf", b"", "application/pdf")},
        data={"nomeArquivo": "cv.pdf"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    assert resp.json()["erroLeitura"] is not None


def test_quota_do_motor_vira_429(monkeypatch):
    # Falha do MOTOR (não do arquivo) sobe como HTTP distinguível, não 200 com erroLeitura.
    def _estoura(**kwargs):  # noqa: ARG001
        raise ErroVertex("QUOTA")

    monkeypatch.setattr(gemini, "extrair_curriculo", _estoura)
    resp = client.post(
        URL,
        files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"nomeArquivo": "cv.pdf"},
        headers=AUTH,
    )
    assert resp.status_code == 429
