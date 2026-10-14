"""O ARQUIVADOR do Portal (Desenho 1): lê o objeto do balde e escreve o prontuário certo, cego.

Cobre, sem rede (Drive e balde SEMPRE mockados, igual ao resto da suíte):
  - a separação de papel (condição 3): /portal/arquivar só na instância ARQUIVADOR; /portal/ler
    recusado NELA (a guarda V3);
  - o caminho feliz: lê N objetos do balde EM MEMÓRIA e sobe na subpasta DOCUMENTOS_PESSOAIS, com
    âncora de pasta e dedup por md5;
  - a inércia (condição 6): sem PORTAL_PAPEL é 403; sem PORTAL_BUCKET é 503; balde fora da allowlist
    é 400;
  - a cegueira (condição 1): o módulo NÃO importa gemini e NÃO escreve em disco;
  - §A.6: nome de objeto e nome de pessoa nunca aparecem no log.
"""

from __future__ import annotations

import logging

from fastapi.testclient import TestClient

from app import drive as drive_mod
from app import portal_bucket
from app.config import get_settings
from app.main import app
from app.portal_bucket import MetadadoObjeto

client = TestClient(app)
AUTH = {"X-Internal-Token": "test-token"}
BUCKET = "ea-portal-prod-entrada"
NOME_PESSOA = "Joao da Silva — Operacao X"
OBJETO_OPACO = "a1b2c3d4e5f6-objeto-opaco-sem-pii"

REQ = {
    "bucket": BUCKET,
    "parentFolderId": "PARENT123",
    "pastaNome": NOME_PESSOA,
    "pastaId": None,
    "itens": [
        {"objeto": OBJETO_OPACO, "nomeFinal": "RG_Joao da Silva.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
    ],
}


def _configurar(*, papel: str, bucket: str = BUCKET) -> None:
    get_settings.cache_clear()
    s = get_settings()
    object.__setattr__(s, "portal_papel", papel)
    object.__setattr__(s, "portal_bucket", bucket)


def _resetar() -> None:
    get_settings.cache_clear()
    s = get_settings()
    object.__setattr__(s, "portal_papel", "")
    object.__setattr__(s, "portal_bucket", "")


def _fakes_do_drive(monkeypatch, *, subir=None, md5_existentes=None, pasta_existe_por_id=False):
    """Mocka o Drive inteiro: nenhuma chamada de rede. Devolve a lista de uploads observados."""
    uploads: list[dict] = []
    monkeypatch.setattr(drive_mod, "get_drive_service", lambda: object())
    monkeypatch.setattr(
        drive_mod,
        "abrir_pasta_por_id",
        lambda _s, fid: {"id": fid} if pasta_existe_por_id else None,
    )
    monkeypatch.setattr(
        drive_mod, "resolver_pasta_do_funcionario", lambda _s, _n, _p: ("PASTA_FUNC", False, [])
    )
    monkeypatch.setattr(drive_mod, "buscar_ou_criar_pasta", lambda _s, _n, _p: ("SUBPASTA_ID", False))
    monkeypatch.setattr(
        drive_mod, "md5_existentes", lambda _s, _p: set(md5_existentes or [])
    )

    def _subir(_s, *, conteudo, nome_final, parent_id):  # noqa: ANN001
        uploads.append({"nome_final": nome_final, "parent_id": parent_id, "bytes": conteudo})
        return (subir or "FILE_ID")

    monkeypatch.setattr(drive_mod, "subir_arquivo", _subir)
    monkeypatch.setattr(drive_mod, "pasta_web_link", lambda _s, fid: f"https://drive/{fid}")
    return uploads


def _fakes_do_balde(monkeypatch, *, conteudo=b"%PDF-1.4 bytes", md5="abc", ausente=False):
    def _meta(_b, _o):  # noqa: ANN001
        if ausente:
            raise portal_bucket.ObjetoAusente()
        return MetadadoObjeto(
            tamanho=len(conteudo), tipo_declarado="application/pdf", md5_hex=md5,
            criado_em="2026-10-14T00:00:00+00:00", geracao=1,
        )

    def _baixar(_b, _o, *, maximo_bytes):  # noqa: ANN001
        if ausente:
            raise portal_bucket.ObjetoAusente()
        return conteudo

    monkeypatch.setattr(portal_bucket, "obter_metadado", _meta)
    monkeypatch.setattr(portal_bucket, "baixar_em_memoria", _baixar)
    # md5 do conteúdo real, para o teste de dedup casar com md5_existentes.
    monkeypatch.setattr(drive_mod, "md5_do_conteudo", lambda _c: md5)


# ── Condição 3: separação de papel ───────────────────────────────────────────
def test_arquivar_recusado_quando_nao_e_arquivador():
    _configurar(papel="")  # operação/leitor
    try:
        r = client.post("/portal/arquivar", json=REQ, headers=AUTH)
        assert r.status_code == 403
    finally:
        _resetar()


def test_ler_recusado_na_instancia_arquivador():
    # A guarda V3: quem tem a chave de escrita do prontuário NÃO lê documento.
    _configurar(papel="ARQUIVADOR")
    try:
        r = client.post("/portal/ler", json={
            "bucket": BUCKET, "objeto": OBJETO_OPACO, "tipoDocumentoCodigo": "RG",
            "tipoDocumentoNome": "RG", "candidato": {"nome": "x", "cpf": "00000000000"}, "regras": [],
        }, headers=AUTH)
        assert r.status_code == 403
    finally:
        _resetar()


# ── Condição 6: inércia ──────────────────────────────────────────────────────
def test_503_sem_bucket():
    _configurar(papel="ARQUIVADOR", bucket="")
    try:
        r = client.post("/portal/arquivar", json=REQ, headers=AUTH)
        assert r.status_code == 503
    finally:
        _resetar()


def test_400_balde_fora_da_allowlist(monkeypatch):
    _configurar(papel="ARQUIVADOR")
    try:
        r = client.post("/portal/arquivar", json={**REQ, "bucket": "outro-balde"}, headers=AUTH)
        assert r.status_code == 400
    finally:
        _resetar()


def test_401_sem_token():
    _configurar(papel="ARQUIVADOR")
    try:
        r = client.post("/portal/arquivar", json=REQ)
        assert r.status_code == 401
    finally:
        _resetar()


# ── Caminho feliz: lê do balde e escreve o prontuário certo ──────────────────
def test_arquiva_objeto_do_balde_na_subpasta_certa(monkeypatch):
    _configurar(papel="ARQUIVADOR")
    uploads = _fakes_do_drive(monkeypatch)
    _fakes_do_balde(monkeypatch, conteudo=b"%PDF-1.4 conteudo", md5="md5-do-objeto")
    try:
        r = client.post("/portal/arquivar", json=REQ, headers=AUTH)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["arquivados"] == 1
        assert body["ignorados"] == 0
        assert body["falhas"] == 0
        # Subiu o conteúdo do BALDE (não da staging), com o nome final, na subpasta resolvida.
        assert len(uploads) == 1
        assert uploads[0]["bytes"] == b"%PDF-1.4 conteudo"
        assert uploads[0]["parent_id"] == "SUBPASTA_ID"
    finally:
        _resetar()


def test_dedup_por_md5_nao_reenvia(monkeypatch):
    _configurar(papel="ARQUIVADOR")
    uploads = _fakes_do_drive(monkeypatch, md5_existentes={"md5-ja-no-destino"})
    _fakes_do_balde(monkeypatch, md5="md5-ja-no-destino")
    try:
        r = client.post("/portal/arquivar", json=REQ, headers=AUTH)
        assert r.status_code == 200
        body = r.json()
        assert body["arquivados"] == 0
        assert body["ignorados"] == 1
        assert uploads == []  # nada subiu: o md5 já estava no prontuário
    finally:
        _resetar()


def test_objeto_ausente_nao_derruba_o_lote(monkeypatch):
    _configurar(papel="ARQUIVADOR")
    _fakes_do_drive(monkeypatch)
    _fakes_do_balde(monkeypatch, ausente=True)
    try:
        r = client.post("/portal/arquivar", json=REQ, headers=AUTH)
        assert r.status_code == 200
        body = r.json()
        assert body["arquivados"] == 0
        assert body["falhas"] == 1
        assert "ObjetoAusente" in body["motivoFalhas"]
    finally:
        _resetar()


def test_ancora_usa_pasta_existente_sem_buscar_por_nome(monkeypatch):
    _configurar(papel="ARQUIVADOR")
    uploads = _fakes_do_drive(monkeypatch, pasta_existe_por_id=True)
    _fakes_do_balde(monkeypatch, md5="m")

    def _nao_deve_buscar(*_a, **_k):
        raise AssertionError("com âncora não se busca por nome")

    monkeypatch.setattr(drive_mod, "resolver_pasta_do_funcionario", _nao_deve_buscar)
    try:
        r = client.post("/portal/arquivar", json={**REQ, "pastaId": "ANCORA123"}, headers=AUTH)
        assert r.status_code == 200
        assert r.json()["pastaJaExistia"] is True
        assert len(uploads) == 1
    finally:
        _resetar()


# ── Condição 1: cegueira (sem parser, sem disco) ─────────────────────────────
def test_modulo_e_cego_nao_importa_gemini_nem_staging():
    """Travado em teste (condição 1): o arquivador não liga o motor de IA e não escreve em disco.

    A prova olha os NOMES REALMENTE LIGADOS no módulo (o que foi importado), não o texto da
    docstring: o arquivador não tem `gemini`, `portal_extracao` nem nenhum helper de `staging`
    no seu espaço de nomes, então não há caminho de código para interpretar o documento nem para
    gravar o binário em disco.
    """
    from app.routers import portal_arquivar

    ligados = set(vars(portal_arquivar))
    assert "gemini" not in ligados
    assert "portal_extracao" not in ligados
    assert "escrever_staging" not in ligados
    assert "ler_staging" not in ligados
    assert "staging" not in ligados
    # A régua de pasta é reusada de `app.drive`, e o balde de `app.portal_bucket`: é tudo que ele toca.
    assert "drive" in ligados and "portal_bucket" in ligados


# ── VISUALIZAÇÃO na Auditoria: /portal/documento (mesma conta cega) ──────────
DOC_REQ = {"bucket": BUCKET, "objeto": OBJETO_OPACO}


def test_documento_recusado_quando_nao_e_arquivador():
    _configurar(papel="")
    try:
        r = client.post("/portal/documento", json=DOC_REQ, headers=AUTH)
        assert r.status_code == 403
    finally:
        _resetar()


def test_documento_503_sem_bucket():
    _configurar(papel="ARQUIVADOR", bucket="")
    try:
        r = client.post("/portal/documento", json=DOC_REQ, headers=AUTH)
        assert r.status_code == 503
    finally:
        _resetar()


def test_documento_400_balde_fora_da_allowlist():
    _configurar(papel="ARQUIVADOR")
    try:
        r = client.post("/portal/documento", json={**DOC_REQ, "bucket": "outro"}, headers=AUTH)
        assert r.status_code == 400
    finally:
        _resetar()


def test_documento_devolve_os_bytes_do_balde(monkeypatch):
    _configurar(papel="ARQUIVADOR")
    _fakes_do_balde(monkeypatch, conteudo=b"%PDF-1.4 inteiro", md5="m")
    try:
        r = client.post("/portal/documento", json=DOC_REQ, headers=AUTH)
        assert r.status_code == 200
        assert r.content == b"%PDF-1.4 inteiro"
        assert r.headers["content-type"].startswith("application/pdf")
    finally:
        _resetar()


def test_documento_404_quando_objeto_sumiu(monkeypatch):
    _configurar(papel="ARQUIVADOR")
    _fakes_do_balde(monkeypatch, ausente=True)
    try:
        r = client.post("/portal/documento", json=DOC_REQ, headers=AUTH)
        assert r.status_code == 404
    finally:
        _resetar()


# ── §A.6: nome de objeto / pessoa nunca no log ───────────────────────────────
def test_nao_loga_nome_de_objeto_nem_pessoa(monkeypatch, caplog):
    _configurar(papel="ARQUIVADOR")
    _fakes_do_drive(monkeypatch)
    _fakes_do_balde(monkeypatch, ausente=True)  # força o caminho de log (falha)
    try:
        with caplog.at_level(logging.INFO, logger="ea.ai.portal.arquivador"):
            client.post("/portal/arquivar", json=REQ, headers=AUTH)
        texto = "\n".join(r.getMessage() for r in caplog.records)
        assert OBJETO_OPACO not in texto
        assert "Joao" not in texto and "Silva" not in texto
    finally:
        _resetar()
