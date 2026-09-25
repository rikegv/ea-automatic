"""O leitor do Portal ponta a ponta: bucket falso, Gemini mockado, NENHUM byte no disco.

Três coisas estão sob teste e nenhuma delas é o caminho feliz sozinho:
 1. **Inerte sem configuração**: sem PORTAL_BUCKET a rota responde 503 e não tenta nada.
 2. **Os cortes**: bucket fora da allowlist, objeto ausente (a chegada NÃO se confirmou), tamanho
    acima do teto cortado PELO METADADO (sem baixar) e de novo pelo orçamento (quando o metadado
    mente), e arquivo com conteúdo ativo recusado ANTES de qualquer chamada de IA.
 3. **A promessa do disco**: ao fim de uma leitura inteira, a pasta de staging continua vazia, e o
    módulo do leitor não tem sequer import de `app.staging`.

§A.6: a resposta não carrega binário, nem nome de objeto, nem valor extraído.
"""

import ast
import os
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app import gemini, portal_bucket
from app.config import get_settings
from app.main import app

client = TestClient(app)
AUTH = {"X-Internal-Token": "test-token"}
BUCKET = "ea-portal-entrada-teste"


def _pdf(paginas: int = 1, javascript: bool = False) -> bytes:
    escritor = PdfWriter()
    for _ in range(paginas):
        escritor.add_blank_page(width=200, height=200)
    if javascript:
        escritor.add_js("app.alert('oi');")
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


class FakeBlob:
    def __init__(self, conteudo: bytes, *, tamanho: int | None = None):
        self._conteudo = conteudo
        self.size = len(conteudo) if tamanho is None else tamanho
        self.content_type = "application/octet-stream"
        self.md5_hash = None
        self.time_created = None
        self.generation = 17

    def open(self, modo, chunk_size=None):  # noqa: ARG002 - assinatura do blob real
        return BytesIO(self._conteudo)


class FakeBucket:
    def __init__(self, blobs: dict):
        self._blobs = blobs

    def get_blob(self, nome):
        return self._blobs.get(nome)

    def blob(self, nome):
        return self._blobs[nome]


class FakeClient:
    def __init__(self, blobs: dict):
        self._bucket = FakeBucket(blobs)

    def bucket(self, nome):  # noqa: ARG002
        return self._bucket


@pytest.fixture
def portal_ligado():
    """Liga o leitor (PORTAL_BUCKET) só para o teste e devolve a configuração ao fim."""
    os.environ["PORTAL_BUCKET"] = BUCKET
    get_settings.cache_clear()
    yield
    del os.environ["PORTAL_BUCKET"]
    get_settings.cache_clear()


def _bucket_com(blobs: dict, monkeypatch):
    monkeypatch.setattr(portal_bucket, "get_storage_client", lambda: FakeClient(blobs))


def _gemini_ok(monkeypatch, capturado: dict | None = None):
    def _falso(**kwargs):
        if capturado is not None:
            capturado.update(kwargs)
        return {"status": "VALIDADO", "motivo": "ok", "camposConferidos": ["nome"]}

    monkeypatch.setattr(gemini, "auditar_documento", _falso)


def _corpo(objeto: str = "entrada/abc.pdf") -> dict:
    return {
        "bucket": BUCKET,
        "objeto": objeto,
        "tipoDocumentoCodigo": "RG",
        "tipoDocumentoNome": "RG",
        "candidato": {"nome": "Fulano de Tal", "cpf": "529.982.247-25"},
        "regras": [{"descricaoRegra": "O documento deve estar legível."}],
    }


def test_sem_token_interno_recusa():
    assert client.post("/portal/ler", json=_corpo()).status_code == 401


def test_inerte_sem_bucket_configurado():
    """O bucket ainda não existe: sem configuração a rota responde 503 e o serviço segue de pé."""
    assert client.post("/portal/ler", json=_corpo(), headers=AUTH).status_code == 503
    assert client.get("/health").status_code == 200


def test_bucket_fora_da_allowlist(portal_ligado):
    corpo = _corpo() | {"bucket": "bucket-do-vt"}
    assert client.post("/portal/ler", json=corpo, headers=AUTH).status_code == 400


def test_objeto_ausente_e_chegada_nao_confirmada(portal_ligado, monkeypatch):
    _bucket_com({}, monkeypatch)
    assert client.post("/portal/ler", json=_corpo(), headers=AUTH).status_code == 404


def test_tamanho_cortado_pelo_metadado_sem_baixar(portal_ligado, monkeypatch):
    """O corte vem ANTES de carregar: o blob nem chega a ser aberto."""

    class BlobQueExplodeSeBaixado(FakeBlob):
        def open(self, modo, chunk_size=None):
            raise AssertionError("baixou um objeto que já devia ter sido recusado pelo metadado")

    grande = BlobQueExplodeSeBaixado(b"%PDF-", tamanho=11 * 1024 * 1024)
    _bucket_com({"entrada/abc.pdf": grande}, monkeypatch)
    assert client.post("/portal/ler", json=_corpo(), headers=AUTH).status_code == 413


def test_orcamento_corta_quando_o_metadado_mente(portal_ligado, monkeypatch):
    """Metadado é declaração: o objeto diz 1 KB e entrega 11 MB, e a medida real o barra."""
    mentiroso = FakeBlob(b"%PDF-" + b"\x00" * (11 * 1024 * 1024), tamanho=1024)
    _bucket_com({"entrada/abc.pdf": mentiroso}, monkeypatch)
    assert client.post("/portal/ler", json=_corpo(), headers=AUTH).status_code == 413


def test_conteudo_ativo_recusado_antes_da_ia(portal_ligado, monkeypatch):
    def _nunca(**kwargs):  # noqa: ARG001
        raise AssertionError("arquivo com conteúdo ativo não pode chegar ao motor de IA")

    monkeypatch.setattr(gemini, "auditar_documento", _nunca)
    _bucket_com({"entrada/abc.pdf": FakeBlob(_pdf(javascript=True))}, monkeypatch)
    resp = client.post("/portal/ler", json=_corpo(), headers=AUTH)
    assert resp.status_code == 200
    dado = resp.json()
    assert dado["aceito"] is False
    assert dado["recusa"] == "CONTEUDO_ATIVO"
    assert "javascript" in dado["chegada"]["conteudoAtivo"]


def test_leitura_devolve_campos_e_metadados_de_chegada(portal_ligado, monkeypatch):
    capturado: dict = {}
    _gemini_ok(monkeypatch, capturado)
    conteudo = _pdf(2)
    _bucket_com({"entrada/abc.pdf": FakeBlob(conteudo)}, monkeypatch)

    resp = client.post("/portal/ler", json=_corpo(), headers=AUTH)
    assert resp.status_code == 200
    dado = resp.json()
    assert dado["aceito"] is True
    assert dado["auditoria"]["status"] == "VALIDADO"
    assert dado["chegada"]["paginas"] == 2
    assert dado["chegada"]["mimeDetectado"] == "application/pdf"
    assert dado["chegada"]["tamanhoBytes"] == len(conteudo)
    # §A.6: nem o binário nem o nome do objeto voltam na resposta.
    assert "entrada/abc.pdf" not in resp.text
    # O motor recebeu os BYTES, e o mime veio dos magic bytes, não do tipo declarado pelo cliente.
    assert capturado["partes"][0][0] == conteudo
    assert capturado["partes"][0][1] == "application/pdf"


def test_sem_regra_ativa_vira_escalada_e_nao_reprovacao(portal_ligado, monkeypatch):
    def _nunca(**kwargs):  # noqa: ARG001
        raise AssertionError("sem regra não há critério: não se chama a IA")

    monkeypatch.setattr(gemini, "auditar_documento", _nunca)
    _bucket_com({"entrada/abc.pdf": FakeBlob(_pdf())}, monkeypatch)
    resp = client.post("/portal/ler", json=_corpo() | {"regras": []}, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["auditoria"]["status"] == "PENDENTE"


def test_nenhum_byte_toca_o_disco(portal_ligado, monkeypatch):
    """A promessa central do Portal: a staging continua vazia depois de uma leitura inteira."""
    _gemini_ok(monkeypatch)
    _bucket_com({"entrada/abc.pdf": FakeBlob(_pdf())}, monkeypatch)
    staging = Path(get_settings().staging_dir)
    antes = set(staging.rglob("*")) if staging.exists() else set()

    assert client.post("/portal/ler", json=_corpo(), headers=AUTH).status_code == 200

    depois = set(staging.rglob("*")) if staging.exists() else set()
    assert depois == antes


def test_o_leitor_nao_alcanca_a_staging_nem_por_import():
    """Tranca estrutural: nenhum módulo do leitor IMPORTA a staging, então não há como escrever.

    A varredura é da ÁRVORE do arquivo, não do texto: comentário e docstring citam `escrever_staging`
    para explicar por que ele não está lá, e um teste sobre texto cru confundiria a explicação com a
    chamada. O que se proíbe é o import e a chamada, não a palavra.
    """
    for modulo in ("app/routers/portal.py", "app/portal_bucket.py", "app/portal_inspecao.py"):
        arvore = ast.parse(Path(modulo).read_text(encoding="utf-8"))
        for no in ast.walk(arvore):
            if isinstance(no, ast.ImportFrom):
                assert no.module != "app.staging", modulo
            if isinstance(no, ast.Import):
                assert all(a.name != "app.staging" for a in no.names), modulo
            if isinstance(no, ast.Name):
                assert no.id != "escrever_staging", modulo
            if isinstance(no, ast.Attribute):
                assert no.attr != "escrever_staging", modulo
