"""F2 — auditoria. Gemini mockado; cobre VALIDADO, INCONFORME, fora-do-enum→PENDENTE,
sem-regras→PENDENTE, 401 sem token e redação de PII no motivo."""

import json
import uuid
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import gemini
from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_prompt_contem_data_de_hoje():
    # Sem hoje explícito → usa date.today(); a data ISO precisa aparecer no prompt.
    prompt = gemini.montar_prompt_auditoria(
        tipo_documento_nome="Comprovante de Residência",
        candidato_nome="Fulano",
        candidato_cpf="529.982.247-25",
        regras=["Emissão ≤ 90 dias da data atual."],
    )
    assert date.today().isoformat() in prompt
    assert "DATA DE HOJE" in prompt


def test_prompt_usa_data_injetada():
    prompt = gemini.montar_prompt_auditoria(
        tipo_documento_nome="X",
        candidato_nome="Y",
        candidato_cpf="00000000000",
        regras=["r"],
        hoje="2026-06-28",
    )
    assert "2026-06-28" in prompt


def test_auditar_envia_data_no_prompt(monkeypatch):
    # Intercepta o texto enviado ao Gemini e confirma que a data de hoje vai junto.
    capturado = {}

    class _Models:
        def generate_content(self, *, model, contents, config):  # noqa: ARG002
            capturado["texto"] = contents[-1].text
            return SimpleNamespace(
                text=json.dumps({"status": "VALIDADO", "motivo": "ok", "camposConferidos": []})
            )

    monkeypatch.setattr(gemini, "get_client", lambda: SimpleNamespace(models=_Models()))
    resp = client.post(
        "/auditoria/documento",
        json={
            "stagingPaths": [_staging_pdf()],
            "tipoDocumentoCodigo": "CR",
            "tipoDocumentoNome": "Comprovante de Residência",
            "candidato": {"nome": "Fulano", "cpf": "529.982.247-25"},
            "regras": [{"descricaoRegra": "Emissão ≤ 90 dias."}],
        },
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 200
    assert date.today().isoformat() in capturado["texto"]


def _fake_client(payload: dict):
    """Cria um client falso cujo generate_content devolve um response com .text = JSON."""

    class _Models:
        def generate_content(self, *, model, contents, config):  # noqa: ARG002
            return SimpleNamespace(text=json.dumps(payload))

    return SimpleNamespace(models=_Models())


def _staging_pdf(_tmp_path=None) -> str:
    # Escreve DENTRO do STAGING_DIR (o guard de path traversal exige containment).
    base = Path(get_settings().staging_dir)
    base.mkdir(parents=True, exist_ok=True)
    p = base / f"doc-{uuid.uuid4().hex}.pdf"
    p.write_bytes(b"%PDF-1.4 conteudo fake")
    return str(p)


def _req(staging_path: str) -> dict:
    return {
        "stagingPaths": [staging_path],
        "tipoDocumentoCodigo": "RG",
        "tipoDocumentoNome": "Documento de Identidade",
        "candidato": {"nome": "Fulano de Tal", "cpf": "529.982.247-25"},
        "regras": [{"descricaoRegra": "O documento deve estar legível e dentro da validade."}],
    }


def test_validado(monkeypatch, tmp_path):
    monkeypatch.setattr(
        gemini,
        "get_client",
        lambda: _fake_client(
            {"status": "VALIDADO", "motivo": "Atende às regras.", "camposConferidos": ["legibilidade"]}
        ),
    )
    resp = client.post(
        "/auditoria/documento", json=_req(_staging_pdf(tmp_path)), headers={"X-Internal-Token": "test-token"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "VALIDADO"
    assert body["valido"] is True
    assert body["camposConferidos"] == ["legibilidade"]


def test_inconforme(monkeypatch, tmp_path):
    monkeypatch.setattr(
        gemini,
        "get_client",
        lambda: _fake_client(
            {"status": "INCONFORME", "motivo": "Documento vencido.", "camposConferidos": ["validade"]}
        ),
    )
    resp = client.post(
        "/auditoria/documento", json=_req(_staging_pdf(tmp_path)), headers={"X-Internal-Token": "test-token"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "INCONFORME"
    assert body["valido"] is False


def test_status_fora_do_enum_vira_pendente(monkeypatch, tmp_path):
    monkeypatch.setattr(
        gemini,
        "get_client",
        lambda: _fake_client({"status": "APROVADO_TOTAL", "motivo": "x", "camposConferidos": []}),
    )
    resp = client.post(
        "/auditoria/documento", json=_req(_staging_pdf(tmp_path)), headers={"X-Internal-Token": "test-token"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "PENDENTE"
    assert body["valido"] is False


def test_sem_regras_vira_pendente(monkeypatch, tmp_path):
    # Nem deveria chamar o Gemini; garantimos que não há rede.
    monkeypatch.setattr(gemini, "get_client", lambda: (_ for _ in ()).throw(AssertionError("não chamar")))
    req = _req(_staging_pdf(tmp_path))
    req["regras"] = []
    resp = client.post("/auditoria/documento", json=req, headers={"X-Internal-Token": "test-token"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "PENDENTE"


def test_motivo_redige_cpf(monkeypatch, tmp_path):
    # O modelo "vaza" o CPF no motivo; o serviço tem de redigir (§A.6).
    monkeypatch.setattr(
        gemini,
        "get_client",
        lambda: _fake_client(
            {
                "status": "INCONFORME",
                "motivo": "CPF 529.982.247-25 não confere com o cadastro.",
                "camposConferidos": ["cpf"],
            }
        ),
    )
    resp = client.post(
        "/auditoria/documento", json=_req(_staging_pdf(tmp_path)), headers={"X-Internal-Token": "test-token"}
    )
    assert resp.status_code == 200
    motivo = resp.json()["motivo"]
    assert "529.982.247-25" not in motivo
    assert "[CPF]" in motivo


def test_auditoria_por_conjunto_envia_todas_as_imagens(monkeypatch):
    # Auditoria por conjunto: 2 arquivos do MESMO documento (frente e verso) vão numa ÚNICA chamada,
    # com o prompt avisando que é um conjunto. Um veredito só.
    capturado = {}

    class _Models:
        def generate_content(self, *, model, contents, config):  # noqa: ARG002
            capturado["n_partes"] = len(contents)
            capturado["prompt"] = contents[-1].text
            return SimpleNamespace(
                text=json.dumps({"status": "VALIDADO", "motivo": "ok", "camposConferidos": []})
            )

    monkeypatch.setattr(gemini, "get_client", lambda: SimpleNamespace(models=_Models()))
    p1, p2 = _staging_pdf(), _staging_pdf()
    req = _req(p1)
    req["stagingPaths"] = [p1, p2]
    resp = client.post("/auditoria/documento", json=req, headers={"X-Internal-Token": "test-token"})
    assert resp.status_code == 200
    # 2 imagens + 1 prompt = 3 partes; o prompt reconhece o conjunto.
    assert capturado["n_partes"] == 3
    assert "CONJUNTO" in capturado["prompt"]


def test_401_sem_token(tmp_path):
    resp = client.post("/auditoria/documento", json=_req(_staging_pdf(tmp_path)))
    assert resp.status_code == 401


def test_401_token_errado(tmp_path):
    resp = client.post(
        "/auditoria/documento", json=_req(_staging_pdf(tmp_path)), headers={"X-Internal-Token": "errado"}
    )
    assert resp.status_code == 401


@pytest.mark.parametrize("status_ia", ["VALIDADO", "INCONFORME", "PENDENTE"])
def test_staging_inexistente_404(monkeypatch, status_ia):
    monkeypatch.setattr(
        gemini, "get_client", lambda: _fake_client({"status": status_ia, "motivo": "", "camposConferidos": []})
    )
    # Caminho DENTRO do staging mas inexistente → 404 (não 400).
    alvo = str(Path(get_settings().staging_dir) / "nao-existe-xyz.pdf")
    resp = client.post("/auditoria/documento", json=_req(alvo), headers={"X-Internal-Token": "test-token"})
    assert resp.status_code == 404


# ── R1: path traversal — caminhos fora do STAGING_DIR são rejeitados com 400 ────────────────
@pytest.mark.parametrize(
    "caminho",
    [
        "/etc/passwd",
        "/app/credentials.json",
        "../../etc/passwd",
        "../credentials.json",
    ],
)
def test_staging_fora_da_area_400(monkeypatch, caminho):
    # O Gemini nem deve ser chamado — o guard barra antes de ler qualquer arquivo.
    monkeypatch.setattr(
        gemini, "get_client", lambda: (_ for _ in ()).throw(AssertionError("não pode chamar"))
    )
    resp = client.post("/auditoria/documento", json=_req(caminho), headers={"X-Internal-Token": "test-token"})
    assert resp.status_code == 400


def test_staging_traversal_que_escapa_400(monkeypatch):
    monkeypatch.setattr(
        gemini, "get_client", lambda: (_ for _ in ()).throw(AssertionError("não pode chamar"))
    )
    # Começa dentro do staging mas sobe com ../ até /etc/passwd.
    escapa = str(Path(get_settings().staging_dir) / ".." / ".." / ".." / "etc" / "passwd")
    resp = client.post("/auditoria/documento", json=_req(escapa), headers={"X-Internal-Token": "test-token"})
    assert resp.status_code == 400


def test_staging_legitimo_dentro_da_area(monkeypatch):
    # Caminho legítimo dentro do staging → segue o fluxo normal (200).
    monkeypatch.setattr(
        gemini,
        "get_client",
        lambda: _fake_client({"status": "VALIDADO", "motivo": "ok", "camposConferidos": []}),
    )
    resp = client.post(
        "/auditoria/documento", json=_req(_staging_pdf()), headers={"X-Internal-Token": "test-token"}
    )
    assert resp.status_code == 200


# ── Fix do mime (§A.9): arquivo SEM extensão (caminho do pull do Pandapé) ───────────────────
def _staging_sem_extensao(magic: bytes) -> str:
    """Grava um arquivo DENTRO do staging SEM extensão (mimetiza o pull do Pandapé)."""
    base = Path(get_settings().staging_dir)
    base.mkdir(parents=True, exist_ok=True)
    p = base / f"CPF-{uuid.uuid4().hex}"  # sem sufixo, como o código do tipo
    p.write_bytes(magic)
    return str(p)


def test_mime_resolvido_por_magic_bytes(monkeypatch):
    # Sem extensão no path, mas conteúdo é PDF → resolve pelos magic bytes e NÃO dá 500.
    monkeypatch.setattr(
        gemini,
        "get_client",
        lambda: _fake_client({"status": "VALIDADO", "motivo": "ok", "camposConferidos": []}),
    )
    resp = client.post(
        "/auditoria/documento",
        json=_req(_staging_sem_extensao(b"%PDF-1.4 conteudo")),
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 200


def test_formato_indeterminado_vira_415_nao_500(monkeypatch):
    # Sem extensão E sem assinatura reconhecível → 415 controlado (nunca octet-stream → 500 silencioso).
    monkeypatch.setattr(
        gemini, "get_client", lambda: (_ for _ in ()).throw(AssertionError("não pode chamar a IA"))
    )
    resp = client.post(
        "/auditoria/documento",
        json=_req(_staging_sem_extensao(b"\x00\x01\x02\x03 lixo binario")),
        headers={"X-Internal-Token": "test-token"},
    )
    assert resp.status_code == 415
