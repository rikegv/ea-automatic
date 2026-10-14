"""COBERTURA INDEPENDENTE (§A.38, agente `tester`, NÃO é o autor) do arquivador do Portal.

Estes testes provam GAPS que a suíte do autor (`test_portal_arquivar.py`) não cobre, e que são
exatamente os pontos onde um "mal-entendido de requisito" se esconderia:

  - DEDUP POR MD5 COM MÚLTIPLOS ITENS NO MESMO LOTE: o autor só testou md5 que JÁ estava no destino,
    com UM item. Falta provar que o segundo item com o MESMO md5, NA MESMA requisição, é ignorado
    (o `md5_no_destino` é alimentado durante o laço, linha 165 de `portal_arquivar.py`).
  - LOTE PARCIAL COM VÁRIOS ITENS: o autor testou "um objeto ausente não derruba o lote" com UM item
    só. Falta provar o requisito de verdade: num lote de VÁRIOS, a falha de UM não impede os OUTROS
    de subirem, e a contagem (arquivados/falhas) fica certa.
  - SUBPASTA CORRETA POR TIPO: o autor só exercitou DOCUMENTOS_PESSOAIS. Falta provar que cada item
    é dirigido à pasta do seu PRÓPRIO tipo (SUBPASTA_NOME), e que o upload cai no id daquela subpasta.

Mesma disciplina do autor: Drive e balde SEMPRE mockados, nenhuma chamada de rede.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import drive as drive_mod
from app import portal_bucket
from app.config import get_settings
from app.main import app
from app.portal_bucket import MetadadoObjeto

client = TestClient(app)
AUTH = {"X-Internal-Token": "test-token"}
BUCKET = "ea-portal-prod-entrada"


def _configurar(*, bucket: str = BUCKET) -> None:
    get_settings.cache_clear()
    s = get_settings()
    object.__setattr__(s, "portal_papel", "ARQUIVADOR")
    object.__setattr__(s, "portal_bucket", bucket)


def _resetar() -> None:
    get_settings.cache_clear()
    s = get_settings()
    object.__setattr__(s, "portal_papel", "")
    object.__setattr__(s, "portal_bucket", "")


def _fakes_do_drive(monkeypatch):
    """Mocka o Drive. Registra uploads e as subpastas pedidas; cada nome de subpasta ganha um id
    próprio (SUBPASTA::<nome>), para provar o roteamento por tipo."""
    uploads: list[dict] = []
    subpastas_pedidas: list[str] = []
    monkeypatch.setattr(drive_mod, "get_drive_service", lambda: object())
    monkeypatch.setattr(drive_mod, "abrir_pasta_por_id", lambda _s, _fid: None)
    monkeypatch.setattr(
        drive_mod, "resolver_pasta_do_funcionario", lambda _s, _n, _p: ("PASTA_FUNC", False, [])
    )

    def _buscar_ou_criar(_s, nome, _parent):  # noqa: ANN001
        subpastas_pedidas.append(nome)
        return (f"SUBPASTA::{nome}", False)

    monkeypatch.setattr(drive_mod, "buscar_ou_criar_pasta", _buscar_ou_criar)
    # Começa vazio; a dedup DENTRO do lote não depende do destino, e sim do set alimentado no laço.
    monkeypatch.setattr(drive_mod, "md5_existentes", lambda _s, _p: set())
    # md5 DERIVADO do conteúdo: itens com bytes diferentes não se deduplicam entre si.
    monkeypatch.setattr(drive_mod, "md5_do_conteudo", lambda c: f"md5::{c!r}")

    def _subir(_s, *, conteudo, nome_final, parent_id):  # noqa: ANN001
        uploads.append({"nome_final": nome_final, "parent_id": parent_id, "bytes": conteudo})
        return f"FILE::{nome_final}"

    monkeypatch.setattr(drive_mod, "subir_arquivo", _subir)
    monkeypatch.setattr(drive_mod, "pasta_web_link", lambda _s, fid: f"https://drive/{fid}")
    return uploads, subpastas_pedidas


def _fakes_do_balde(monkeypatch, *, ausentes: set[str] | None = None):
    """Balde onde cada objeto devolve o PRÓPRIO nome como bytes (md5 distinto por item). Objetos em
    `ausentes` levantam ObjetoAusente, para simular a falha parcial."""
    ausentes = ausentes or set()

    def _meta(_b, objeto):  # noqa: ANN001
        if objeto in ausentes:
            raise portal_bucket.ObjetoAusente()
        conteudo = objeto.encode()
        return MetadadoObjeto(
            tamanho=len(conteudo), tipo_declarado="application/pdf", md5_hex="x",
            criado_em="2026-10-14T00:00:00+00:00", geracao=1,
        )

    def _baixar(_b, objeto, *, maximo_bytes):  # noqa: ANN001
        if objeto in ausentes:
            raise portal_bucket.ObjetoAusente()
        return objeto.encode()

    monkeypatch.setattr(portal_bucket, "obter_metadado", _meta)
    monkeypatch.setattr(portal_bucket, "baixar_em_memoria", _baixar)


def _req(itens: list[dict]) -> dict:
    return {
        "bucket": BUCKET,
        "parentFolderId": "PARENT123",
        "pastaNome": "ALGUEM — Operacao",
        "pastaId": None,
        "itens": itens,
    }


# ── GAP 1: dedup por md5 com MÚLTIPLOS itens no MESMO lote ────────────────────
def test_dedup_dentro_do_lote_ignora_segundo_item_com_mesmo_md5(monkeypatch):
    """Dois objetos distintos no balde, mas com o MESMO conteúdo (mesmo md5), na MESMA requisição e
    na MESMA subpasta: o primeiro sobe, o segundo é ignorado. Prova que o `md5_no_destino` cresce
    DENTRO do laço (não só a partir do que já existia no Drive)."""
    _configurar()
    uploads, _ = _fakes_do_drive(monkeypatch)

    # Os dois objetos devolvem o MESMO byte -> mesmo md5 derivado.
    def _meta(_b, _o):  # noqa: ANN001
        return MetadadoObjeto(
            tamanho=5, tipo_declarado="application/pdf", md5_hex="x",
            criado_em="2026-10-14T00:00:00+00:00", geracao=1,
        )

    monkeypatch.setattr(portal_bucket, "obter_metadado", _meta)
    monkeypatch.setattr(portal_bucket, "baixar_em_memoria", lambda _b, _o, *, maximo_bytes: b"IGUAL")
    try:
        r = client.post(
            "/portal/arquivar",
            json=_req(
                [
                    {"objeto": "obj-A", "nomeFinal": "RG_X.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
                    {"objeto": "obj-B", "nomeFinal": "RG_X_copia.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
                ]
            ),
            headers=AUTH,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["arquivados"] == 1, "o segundo item do lote tinha md5 repetido e deveria ser ignorado"
        assert body["ignorados"] == 1
        assert body["falhas"] == 0
        assert len(uploads) == 1, "só um upload deve acontecer para dois itens de md5 idêntico no lote"
    finally:
        _resetar()


# ── GAP 2: lote PARCIAL com vários itens (falha de um não derruba os outros) ──
def test_falha_de_um_objeto_nao_derruba_os_outros_no_lote(monkeypatch):
    """Três itens; o do meio está AUSENTE no balde. Os outros dois sobem, a falha é contada e o lote
    NÃO é abortado. O autor só provou isto com UM item (não prova o requisito 'parcial')."""
    _configurar()
    uploads, _ = _fakes_do_drive(monkeypatch)
    _fakes_do_balde(monkeypatch, ausentes={"obj-meio"})
    try:
        r = client.post(
            "/portal/arquivar",
            json=_req(
                [
                    {"objeto": "obj-um", "nomeFinal": "RG_X.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
                    {"objeto": "obj-meio", "nomeFinal": "CPF_X.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
                    {"objeto": "obj-tres", "nomeFinal": "CTPS_X.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
                ]
            ),
            headers=AUTH,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["arquivados"] == 2, "os dois objetos presentes deveriam subir apesar da falha do terceiro"
        assert body["falhas"] == 1
        assert "ObjetoAusente" in body["motivoFalhas"]
        enviados = {u["nome_final"] for u in uploads}
        assert enviados == {"RG_X.pdf", "CTPS_X.pdf"}
    finally:
        _resetar()


# ── GAP 3: cada item vai para a subpasta do seu PRÓPRIO tipo ──────────────────
def test_cada_item_vai_para_a_subpasta_do_seu_tipo(monkeypatch):
    """Itens de tipos diferentes são dirigidos a subpastas diferentes (SUBPASTA_NOME), e o upload cai
    no id da subpasta certa. O autor só exercitou DOCUMENTOS_PESSOAIS."""
    _configurar()
    uploads, subpastas_pedidas = _fakes_do_drive(monkeypatch)
    _fakes_do_balde(monkeypatch)
    try:
        r = client.post(
            "/portal/arquivar",
            json=_req(
                [
                    {"objeto": "obj-rg", "nomeFinal": "RG_X.pdf", "subpasta": "DOCUMENTOS_PESSOAIS"},
                    {"objeto": "obj-aso", "nomeFinal": "ASO_X.pdf", "subpasta": "ASO"},
                ]
            ),
            headers=AUTH,
        )
        assert r.status_code == 200, r.text
        assert r.json()["arquivados"] == 2
        # SUBPASTA_NOME: DOCUMENTOS_PESSOAIS -> "DOCUMENTOS PESSOAIS"; ASO -> "ASO".
        assert set(subpastas_pedidas) == {"DOCUMENTOS PESSOAIS", "ASO"}
        destino = {u["nome_final"]: u["parent_id"] for u in uploads}
        assert destino["RG_X.pdf"] == "SUBPASTA::DOCUMENTOS PESSOAIS"
        assert destino["ASO_X.pdf"] == "SUBPASTA::ASO"
    finally:
        _resetar()
