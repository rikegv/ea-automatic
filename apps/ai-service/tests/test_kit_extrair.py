"""Etapa 2/3 do Gerador de Kit: endpoint POST /kit/extrair (job assíncrono) + polling de status.

PDFs sintéticos reais (páginas em branco via pypdf); Gemini e o dicionário do banco são mockados
(nenhuma rede/DB no pytest). Cobre o fluxo completo, o descarte da staging (§A.6), o guard de token,
kit vazio, e o RETRY com backoff no 429 (fila da OST 3.1). Espaçamento e backoff zerados no teste.
"""

import time
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.genai import errors
from pypdf import PdfReader, PdfWriter

from app import gemini, kit_dict
from app.config import get_settings
from app.kit_motor import PaginaClassificada
from app.main import app

client = TestClient(app)
AUTH = {"X-Internal-Token": "test-token"}

DIC = [
    "REGISTRO DE EMPREGADO",
    "CONTRATO DE TRABALHO TEMPORÁRIO",
    "TERMO DE RESPONSABILIDADE",
    "DECLARAÇÃO DE DEPENDENTES",
]


@pytest.fixture(autouse=True)
def _sem_espera(monkeypatch):
    # Fila sem espaçamento nem backoff no teste (rápido e determinístico).
    s = get_settings()
    monkeypatch.setattr(s, "kit_espaco_lote_s", 0.0, raising=False)
    monkeypatch.setattr(s, "kit_retry_base_s", 0.0, raising=False)
    monkeypatch.setattr(kit_dict, "carregar_dicionario_kit", lambda _id: DIC)


def _pdf_staging(n_paginas: int) -> str:
    w = PdfWriter()
    for _ in range(n_paginas):
        w.add_blank_page(width=200, height=200)
    base = Path(get_settings().staging_dir)
    base.mkdir(parents=True, exist_ok=True)
    p = base / f"kit-{uuid.uuid4().hex}.pdf"
    with p.open("wb") as fh:
        w.write(fh)
    return str(p)


def _pg(n, titulo, nome, cpf=None):
    return PaginaClassificada(pagina=n, titulo=titulo, nome=nome, cpf=cpf)


def _mock_classificador(sequencia_por_lote):
    it = iter(sequencia_por_lote)

    def _fake(*, conteudo_pdf, titulos_dicionario):  # noqa: ARG001
        return next(it)

    return _fake


def _esperar(job_id, timeout=8.0):
    """Poll do status até concluir/erro (o job roda em thread de fundo)."""
    fim = time.time() + timeout
    while time.time() < fim:
        r = client.get(f"/kit/extrair/status/{job_id}", headers=AUTH)
        assert r.status_code == 200, r.text
        data = r.json()
        if data["status"] in ("concluido", "erro"):
            return data
        time.sleep(0.05)
    raise AssertionError("job não concluiu no tempo")


def _iniciar(paths):
    resp = client.post(
        "/kit/extrair",
        json={"kitTipoId": "kit-1", "documentos": [{"stagingPath": p, "arquivo": Path(p).name} for p in paths]},
        headers=AUTH,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_fluxo_completo_mantem_staging_para_download(monkeypatch):
    seq = [
        [_pg(1, "REGISTRO DE EMPREGADO", "Ana Lima"), _pg(2, "REGISTRO DE EMPREGADO", "Bruno Souza"), _pg(3, "REGISTRO DE EMPREGADO", "Carla Dias")],
        [_pg(1, "TERMO DE RESPONSABILIDADE", "Ana Lima"), _pg(2, None, None), _pg(3, "TERMO DE RESPONSABILIDADE", "Bruno Souza")],
    ]
    monkeypatch.setattr(gemini, "classificar_um_lote", _mock_classificador(seq))
    paths = [_pdf_staging(3), _pdf_staging(3)]
    inicio = _iniciar(paths)
    assert inicio["totalLotes"] == 2  # 3 páginas por PDF, lote de 28 => 1 lote cada
    data = _esperar(inicio["jobId"])
    assert data["status"] == "concluido"
    res = data["resultado"]
    assert res["log"]["pdfs"] == 2 and res["log"]["funcionarios"] == 3
    assert res["dicionario"][0] == {"titulo": "REGISTRO DE EMPREGADO", "ordem": 1}
    ana = next(f for f in res["funcionarios"] if f["nome"] == "Ana Lima")
    termo = next(d for d in ana["documentos"] if d["titulo"] == "TERMO DE RESPONSABILIDADE")
    assert termo["paginas"] == [1, 2] and termo["arquivo"] == Path(paths[1]).name
    # Etapa 4: a staging é MANTIDA após processar (o download consolida as páginas originais).
    # O expurgo é por TTL de 1h (StagingPurgeService), não mais imediato.
    assert all(Path(p).exists() for p in paths)
    for p in paths:
        Path(p).unlink(missing_ok=True)


def test_download_funcionario_e_zip(monkeypatch):
    # Um PDF, um lote: Ana com os 4 documentos do kit (completa); Bruno só com REGISTRO (incompleto).
    seq = [
        [
            _pg(1, "REGISTRO DE EMPREGADO", "Ana Lima"),
            _pg(2, "CONTRATO DE TRABALHO TEMPORÁRIO", "Ana Lima"),
            _pg(3, "TERMO DE RESPONSABILIDADE", "Ana Lima"),
            _pg(4, "DECLARAÇÃO DE DEPENDENTES", "Ana Lima"),
            _pg(5, "REGISTRO DE EMPREGADO", "Bruno Souza"),
        ]
    ]
    monkeypatch.setattr(gemini, "classificar_um_lote", _mock_classificador(seq))
    path = _pdf_staging(5)
    inicio = _iniciar([path])
    job = inicio["jobId"]
    data = _esperar(job)
    assert data["status"] == "concluido"
    funcs = data["resultado"]["funcionarios"]
    ana_i = next(i for i, f in enumerate(funcs) if f["nome"] == "Ana Lima")
    bruno_i = next(i for i, f in enumerate(funcs) if f["nome"] == "Bruno Souza")

    # Individual, completo: 4 páginas originais na ordem do kit, SEM aviso.
    r = client.get(f"/kit/download/{job}/funcionario/{ana_i}", headers=AUTH)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert "kit_Ana_Lima.pdf" in r.headers.get("content-disposition", "")
    assert len(PdfReader(BytesIO(r.content)).pages) == 4

    # Individual, incompleto: SEM página de aviso, apenas a página real encontrada (só REGISTRO).
    r2 = client.get(f"/kit/download/{job}/funcionario/{bruno_i}", headers=AUTH)
    assert r2.status_code == 200
    reader2 = PdfReader(BytesIO(r2.content))
    assert len(reader2.pages) == 1
    assert "AVISO" not in (reader2.pages[0].extract_text() or "")

    # ZIP: um PDF por funcionário.
    rz = client.get(f"/kit/download/{job}/zip", headers=AUTH)
    assert rz.status_code == 200
    assert rz.headers["content-type"] == "application/zip"
    nomes = zipfile.ZipFile(BytesIO(rz.content)).namelist()
    assert len(nomes) == len(funcs)
    assert any(n.startswith("kit_Ana_Lima") for n in nomes)

    Path(path).unlink(missing_ok=True)


def test_reimportar_anexa_documento_que_faltava(monkeypatch):
    seq = [
        [_pg(1, "REGISTRO DE EMPREGADO", "Bruno Souza")],            # processamento inicial
        [_pg(1, "CONTRATO DE TRABALHO TEMPORÁRIO", "Bruno Souza")],  # reimportação
    ]
    monkeypatch.setattr(gemini, "classificar_um_lote", _mock_classificador(seq))
    path0 = _pdf_staging(1)
    job = _iniciar([path0])["jobId"]
    data = _esperar(job)
    bruno_i = next(i for i, f in enumerate(data["resultado"]["funcionarios"]) if f["nome"] == "Bruno Souza")
    assert len(data["resultado"]["funcionarios"][bruno_i]["documentos"]) == 1  # só REGISTRO

    path1 = _pdf_staging(1)
    r = client.post(
        f"/kit/reimportar/{job}/funcionario/{bruno_i}",
        json={"documentos": [{"stagingPath": path1, "arquivo": Path(path1).name}]},
        headers=AUTH,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "CONTRATO DE TRABALHO TEMPORÁRIO" in body["anexados"]
    titulos = [d["titulo"] for d in body["resultado"]["funcionarios"][bruno_i]["documentos"]]
    assert titulos == ["REGISTRO DE EMPREGADO", "CONTRATO DE TRABALHO TEMPORÁRIO"]  # anexado, na ordem
    for p in (path0, path1):
        Path(p).unlink(missing_ok=True)


def test_reimportar_pessoa_divergente_409(monkeypatch):
    seq = [
        [_pg(1, "REGISTRO DE EMPREGADO", "Bruno Souza")],
        [_pg(1, "CONTRATO DE TRABALHO TEMPORÁRIO", "Outra Pessoa")],  # nome diferente -> recusa
    ]
    monkeypatch.setattr(gemini, "classificar_um_lote", _mock_classificador(seq))
    job = _iniciar([_pdf_staging(1)])["jobId"]
    _esperar(job)
    r = client.post(
        f"/kit/reimportar/{job}/funcionario/0",
        json={"documentos": [{"stagingPath": _pdf_staging(1), "arquivo": "x.pdf"}]},
        headers=AUTH,
    )
    assert r.status_code == 409


def test_reimportar_job_desconhecido_404():
    r = client.post(
        "/kit/reimportar/naoexiste/funcionario/0",
        json={"documentos": [{"stagingPath": "x", "arquivo": "x.pdf"}]},
        headers=AUTH,
    )
    assert r.status_code == 404


def test_resultado_expira_apos_a_janela(monkeypatch):
    monkeypatch.setattr(gemini, "classificar_um_lote", _mock_classificador([[_pg(1, "REGISTRO DE EMPREGADO", "Ana Lima")]]))
    job = _iniciar([_pdf_staging(1)])["jobId"]
    _esperar(job)
    # Encolhe a janela de retenção: a próxima consulta expurga o resultado (item 1d).
    monkeypatch.setattr(get_settings(), "kit_job_ttl_s", 0, raising=False)
    assert client.get(f"/kit/extrair/status/{job}", headers=AUTH).status_code == 404


def test_download_sem_token_401():
    assert client.get("/kit/download/qualquer/zip").status_code == 401
    assert client.get("/kit/download/qualquer/funcionario/0").status_code == 401


def test_download_job_desconhecido_404():
    assert client.get("/kit/download/naoexiste/zip", headers=AUTH).status_code == 404
    assert client.get("/kit/download/naoexiste/funcionario/0", headers=AUTH).status_code == 404


def test_retry_no_429_resolve_e_conta(monkeypatch):
    chamadas = {"n": 0}

    def _flaky(*, conteudo_pdf, titulos_dicionario):  # noqa: ARG001
        chamadas["n"] += 1
        if chamadas["n"] < 3:  # falha 429 nas 2 primeiras, sucede na 3a
            raise errors.ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})
        return [_pg(1, "REGISTRO DE EMPREGADO", "Ana Lima")]

    monkeypatch.setattr(gemini, "classificar_um_lote", _flaky)
    inicio = _iniciar([_pdf_staging(1)])
    data = _esperar(inicio["jobId"])
    assert data["status"] == "concluido"  # retry resolveu
    assert data["retries"] == 2  # duas re-tentativas contadas
    assert chamadas["n"] == 3


def test_429_persistente_falha_amigavel(monkeypatch):
    def _sempre_429(*, conteudo_pdf, titulos_dicionario):  # noqa: ARG001
        raise errors.ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})

    monkeypatch.setattr(gemini, "classificar_um_lote", _sempre_429)
    inicio = _iniciar([_pdf_staging(1)])
    data = _esperar(inicio["jobId"])
    assert data["status"] == "erro"
    assert "Vertex" in data["erro"] and "12345" not in data["erro"]  # mensagem amigável, sem PII


def test_status_sem_token_401():
    assert client.get("/kit/extrair/status/qualquer").status_code == 401


def test_kit_sem_titulos_422(monkeypatch):
    monkeypatch.setattr(kit_dict, "carregar_dicionario_kit", lambda _id: [])
    resp = client.post(
        "/kit/extrair",
        json={"kitTipoId": "vazio", "documentos": [{"stagingPath": _pdf_staging(1), "arquivo": "x.pdf"}]},
        headers=AUTH,
    )
    assert resp.status_code == 422
