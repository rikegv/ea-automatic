"""OST B1 / Bloco 1 — backoff para 429 do Vertex e família de erros distinguível.

Antes: 429 de QUOTA (transitório, é para retentar) e falha real chegavam os DOIS como 500 cru, e não
havia como diferenciar. Agora o transitório é retentado com backoff e o que sobra vira um HTTP que
diz o que houve.
"""

import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app import gemini
from app.config import get_settings
from app.main import app
from app.vertex_erros import (
    ESPERAS_S,
    TENTATIVAS_MAXIMAS,
    ErroVertex,
    chamar_com_backoff,
    classificar_erro_vertex,
)

client = TestClient(app)
AUTH = {"X-Internal-Token": "test-token"}


class _ErroComCodigo(Exception):
    def __init__(self, code: int) -> None:
        super().__init__(f"erro {code}")
        self.code = code


def _staging() -> str:
    base = Path(get_settings().staging_dir)
    base.mkdir(parents=True, exist_ok=True)
    p = base / f"doc-{uuid.uuid4().hex}.pdf"
    p.write_bytes(b"%PDF-1.4 conteudo")
    return str(p)


def _req() -> dict:
    return {
        "stagingPaths": [_staging()],
        "tipoDocumentoCodigo": "RG",
        "tipoDocumentoNome": "RG",
        "candidato": {"nome": "Fulano de Tal", "cpf": "529.982.247-25"},
        "regras": [{"descricaoRegra": "O documento deve estar legível."}],
    }


# ── Classificação ───────────────────────────────────────────────────────────
def test_429_e_quota_por_codigo_e_por_texto():
    assert classificar_erro_vertex(_ErroComCodigo(429)) == "QUOTA"
    assert classificar_erro_vertex(Exception("429 RESOURCE_EXHAUSTED ...")) == "QUOTA"


def test_demais_familias():
    assert classificar_erro_vertex(_ErroComCodigo(400)) == "ENTRADA"
    assert classificar_erro_vertex(_ErroComCodigo(403)) == "CREDENCIAL"
    assert classificar_erro_vertex(_ErroComCodigo(503)) == "INDISPONIVEL"
    assert classificar_erro_vertex(Exception("INVALID_ARGUMENT")) == "ENTRADA"
    assert classificar_erro_vertex(Exception("qualquer outra coisa")) == "DESCONHECIDO"


# ── Backoff ─────────────────────────────────────────────────────────────────
def test_quota_e_retentada_e_pode_dar_certo(monkeypatch):
    monkeypatch.setattr("app.vertex_erros.time.sleep", lambda _s: None)
    tentativas = {"n": 0}

    def _fn():
        tentativas["n"] += 1
        if tentativas["n"] < 3:
            raise _ErroComCodigo(429)
        return "ok"

    assert chamar_com_backoff(_fn) == "ok"
    assert tentativas["n"] == 3


def test_quota_persistente_esgota_as_tentativas_e_vira_ErroVertex(monkeypatch):
    esperas: list[float] = []
    monkeypatch.setattr("app.vertex_erros.time.sleep", esperas.append)
    tentativas = {"n": 0}

    def _fn():
        tentativas["n"] += 1
        raise _ErroComCodigo(429)

    try:
        chamar_com_backoff(_fn)
        raise AssertionError("deveria ter levantado ErroVertex")
    except ErroVertex as e:
        assert e.familia == "QUOTA"
    assert tentativas["n"] == TENTATIVAS_MAXIMAS
    assert esperas == list(ESPERAS_S)  # backoff exponencial declarado: 2s, 4s, 8s


def test_erro_NAO_transitorio_nao_gasta_retentativa(monkeypatch):
    monkeypatch.setattr("app.vertex_erros.time.sleep", lambda _s: None)
    tentativas = {"n": 0}

    def _fn():
        tentativas["n"] += 1
        raise _ErroComCodigo(400)  # entrada inválida não melhora esperando

    try:
        chamar_com_backoff(_fn)
        raise AssertionError("deveria ter levantado ErroVertex")
    except ErroVertex as e:
        assert e.familia == "ENTRADA"
    assert tentativas["n"] == 1


# ── HTTP da rota ────────────────────────────────────────────────────────────
def test_rota_devolve_429_com_motivo_de_QUOTA(monkeypatch):
    def _quota(**kwargs):
        raise ErroVertex("QUOTA")

    monkeypatch.setattr(gemini, "auditar_documento", _quota)
    resp = client.post("/auditoria/documento", json=_req(), headers=AUTH)

    assert resp.status_code == 429  # NÃO é mais 500 cru
    assert "quota" in resp.json()["detail"].lower()


def test_rota_distingue_entrada_de_indisponibilidade(monkeypatch):
    for familia, esperado in (("ENTRADA", 422), ("CREDENCIAL", 503), ("INDISPONIVEL", 503)):

        def _erro(_f=familia, **kwargs):
            raise ErroVertex(_f)

        monkeypatch.setattr(gemini, "auditar_documento", _erro)
        resp = client.post("/auditoria/documento", json=_req(), headers=AUTH)
        assert resp.status_code == esperado, familia
