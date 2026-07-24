"""OST A / Bloco 1 — PDF protegido por senha: detecção CORRETA (exige senha para ABRIR).

Regressão do falso positivo que reprovou a CTPS da Silvia: um PDF cifrado apenas por PERMISSÕES
(senha de dono, senha de usuário VAZIA) tem `/Encrypt` no corpo, abre sem senha nenhuma e NÃO pode
ser marcado como protegido. Os PDFs aqui são REAIS, gerados com pypdf, não fixtures fake.
"""

import uuid
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app import gemini
from app.config import get_settings
from app.main import app
from app.pdf_seguranca import pdf_exige_senha_para_abrir

client = TestClient(app)
AUTH = {"X-Internal-Token": "test-token"}


def _pdf(*, user_password: str | None = None, owner_password: str | None = None) -> bytes:
    """PDF de 1 página em branco, opcionalmente cifrado."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    if user_password is not None or owner_password is not None:
        writer.encrypt(user_password=user_password or "", owner_password=owner_password)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _staging(conteudo: bytes) -> str:
    base = Path(get_settings().staging_dir)
    base.mkdir(parents=True, exist_ok=True)
    p = base / f"doc-{uuid.uuid4().hex}.pdf"
    p.write_bytes(conteudo)
    return str(p)


def _req(*paths: str) -> dict:
    return {
        "stagingPaths": list(paths),
        "tipoDocumentoCodigo": "CTPS",
        "tipoDocumentoNome": "CTPS",
        "candidato": {"nome": "Fulano de Tal", "cpf": "529.982.247-25"},
        "regras": [{"descricaoRegra": "O documento deve estar legível."}],
    }


# ── A função pura ───────────────────────────────────────────────────────────
def test_pdf_com_encrypt_mas_SEM_senha_de_abertura_nao_e_protegido():
    """O caso da Silvia: cifrado só por permissões (senha de dono), abre sem senha."""
    conteudo = _pdf(user_password="", owner_password="dono-secreto")
    assert b"/Encrypt" in conteudo  # a checagem ANTIGA daria positivo aqui
    assert pdf_exige_senha_para_abrir(conteudo) is False


def test_pdf_com_senha_de_abertura_e_protegido():
    assert pdf_exige_senha_para_abrir(_pdf(user_password="segredo")) is True


def test_pdf_limpo_e_nao_pdf_nao_sao_protegidos():
    assert pdf_exige_senha_para_abrir(_pdf()) is False
    assert pdf_exige_senha_para_abrir(b"\xff\xd8\xff imagem jpeg com /Encrypt no meio") is False
    assert pdf_exige_senha_para_abrir(b"") is False


def test_na_duvida_nao_marca_protegido():
    """PDF corrompido: preferimos mandar para a IA a reprovar documento bom (regra da OST)."""
    assert pdf_exige_senha_para_abrir(b"%PDF-1.7 lixo /Encrypt sem estrutura valida") is False


# ── O efeito na rota de auditoria ───────────────────────────────────────────
def test_rota_audita_normalmente_pdf_cifrado_so_por_permissoes(monkeypatch):
    """Regressão exigida: /Encrypt sem senha de abertura NÃO pode virar INCONFORME."""
    chamou = {"n": 0}

    def _fake(**kwargs):
        chamou["n"] += 1
        return {"status": "VALIDADO", "motivo": "Documento legível.", "camposConferidos": []}

    monkeypatch.setattr(gemini, "auditar_documento", _fake)
    caminho = _staging(_pdf(user_password="", owner_password="dono"))

    resp = client.post("/auditoria/documento", json=_req(caminho), headers=AUTH)

    assert resp.status_code == 200
    assert resp.json()["status"] == "VALIDADO"
    assert chamou["n"] == 1  # foi para a IA, não foi vetado antes


def test_rota_reprova_sem_gastar_ia_quando_todos_exigem_senha(monkeypatch):
    def _nunca(**kwargs):
        raise AssertionError("a IA não pode ser chamada para PDF protegido")

    monkeypatch.setattr(gemini, "auditar_documento", _nunca)
    caminho = _staging(_pdf(user_password="segredo"))

    resp = client.post("/auditoria/documento", json=_req(caminho), headers=AUTH)

    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["status"] == "INCONFORME"
    assert "protegido por senha" in corpo["motivo"]


def test_conjunto_com_uma_pagina_protegida_audita_as_demais(monkeypatch):
    """Não-bloqueio: uma página protegida não condena o conjunto inteiro."""
    recebidos = {}

    def _fake(**kwargs):
        recebidos["n"] = len(kwargs["partes"])
        return {"status": "VALIDADO", "motivo": "ok", "camposConferidos": []}

    monkeypatch.setattr(gemini, "auditar_documento", _fake)
    protegido = _staging(_pdf(user_password="segredo"))
    aberto = _staging(_pdf())

    resp = client.post("/auditoria/documento", json=_req(protegido, aberto), headers=AUTH)

    assert resp.status_code == 200
    assert recebidos["n"] == 1  # só a página que abre foi auditada
