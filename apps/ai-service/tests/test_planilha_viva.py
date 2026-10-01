"""Leitura da planilha viva: lista branca por NOME de cabeçalho, fail-closed, só em memória.

Nenhuma chamada de rede: a sessão autorizada é substituída por uma falsa que devolve um CSV montado
aqui. O CSV de teste tem colunas sensíveis de propósito (salário, consultor, recrutador, candidato
aprovado), porque o que estes testes provam é que elas NAO atravessam a rede.
"""

import pytest
from fastapi.testclient import TestClient

from app import planilha_viva as pv
from app.main import app

FILE_ID = "1H2scESNQPO-A8k05CcDj2mhLy3uoeEs7CiIKL1_mzHQ"

# Cabeçalho no formato da planilha real: as 4 da lista branca espalhadas entre as sensíveis.
CABECALHO = [
    "Data",
    "Consultor",
    "Cliente",
    "Salário",
    "Código da vaga",
    "Vaga",
    "Recrutador",
    "Candidato aprovado",
    "Status",
    "Observação",
]

LINHAS = [
    [
        "01/10/2026",
        "Ana",
        "GERDAU AÇOS",
        "4500,00",
        " 1587726",
        "Soldador",
        "Bia",
        "Jose da Silva",
        "Fechada",
        "nada",
    ],
    [
        "02/10/2026",
        "Ana",
        "SOULAN SERVICOS",
        "2100,50",
        "1587999",
        "Porteiro",
        "Bia",
        "Maria de Souza",
        "Em andamento",
        "",
    ],
    ["", "", "", "", "", "", "", "", "", ""],
    ["03/10/2026", "Caio", "", "", "SL0012", "", "Dani", "", "", ""],
]


def montar_csv(cabecalho: list[str], linhas: list[list[str]], *, bom: bool = True) -> bytes:
    corpo = "\r\n".join(",".join(f'"{c}"' for c in linha) for linha in [cabecalho, *linhas])
    prefixo = "﻿" if bom else ""
    return (prefixo + corpo + "\r\n").encode("utf-8")


class RespostaFalsa:
    def __init__(self, conteudo: bytes, status: int = 200) -> None:
        self.conteudo = conteudo
        self.status_code = status
        self.fechada = False

    def __enter__(self):
        return self

    def __exit__(self, *_: object) -> None:
        self.fechada = True

    def iter_content(self, chunk_size: int = 1024):
        for i in range(0, len(self.conteudo), chunk_size):
            yield self.conteudo[i : i + chunk_size]


class SessaoFalsa:
    def __init__(
        self, resposta: RespostaFalsa | None = None, erro: Exception | None = None
    ) -> None:
        self.resposta = resposta
        self.erro = erro
        self.chamadas: list[dict] = []

    def get(self, url: str, **kwargs):  # noqa: ANN003
        self.chamadas.append({"url": url, **kwargs})
        if self.erro is not None:
            raise self.erro
        return self.resposta


@pytest.fixture
def sessao(monkeypatch) -> SessaoFalsa:
    s = SessaoFalsa(RespostaFalsa(montar_csv(CABECALHO, LINHAS)))
    monkeypatch.setattr(pv, "_sessao", lambda: s)
    return s


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# ── A rota ────────────────────────────────────────────────────────────────────────────────────


def test_rota_exige_token_interno(client, sessao):
    r = client.post("/planilha-viva/ler", json={"fileId": FILE_ID})
    assert r.status_code == 401
    # Fail-closed: sem o guard nada foi lido do Drive.
    assert sessao.chamadas == []


def test_rota_devolve_so_as_quatro_colunas(client, sessao, auth_headers):
    r = client.post("/planilha-viva/ler", json={"fileId": FILE_ID}, headers=auth_headers)
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert set(corpo) == {"totalLinhas", "linhasUteis", "colunas", "linhas"}
    assert corpo["totalLinhas"] == 4
    assert corpo["linhasUteis"] == 3
    assert corpo["colunas"] == {
        "cliente": "Cliente",
        "codigoVaga": "Código da vaga",
        "cargo": "Vaga",
        "status": "Status",
    }
    for linha in corpo["linhas"]:
        assert set(linha) == {"linha", "cliente", "codigoVaga", "cargo", "status"}


def test_nenhum_dado_sensivel_atravessa_a_rede(client, sessao, auth_headers):
    r = client.post("/planilha-viva/ler", json={"fileId": FILE_ID}, headers=auth_headers)
    bruto = r.text
    for proibido in [
        "Salário",
        "Consultor",
        "Recrutador",
        "Candidato aprovado",
        "4500,00",
        "2100,50",
        "Jose da Silva",
        "Maria de Souza",
        "Ana",
        "Bia",
        "Caio",
    ]:
        assert proibido not in bruto, proibido


def test_rota_usa_o_export_csv_com_teto_e_timeout(client, sessao, auth_headers):
    client.post("/planilha-viva/ler", json={"fileId": FILE_ID}, headers=auth_headers)
    chamada = sessao.chamadas[0]
    assert chamada["url"].endswith(f"/drive/v3/files/{FILE_ID}/export")
    assert chamada["params"] == {"mimeType": "text/csv"}
    assert chamada["stream"] is True
    assert chamada["timeout"] == pv.TIMEOUT_S


def test_escopo_e_o_unico_autorizado_na_delegacao():
    # `drive.readonly` devolve unauthorized_client nesta delegação. Medido nos quatro escopos.
    assert pv.ESCOPO_DRIVE == "https://www.googleapis.com/auth/drive"


# ── A projeção ────────────────────────────────────────────────────────────────────────────────


def test_valores_saem_crus_com_strip():
    leitura = pv.projetar(montar_csv(CABECALHO, LINHAS).decode("utf-8-sig"))
    primeira = leitura.linhas[0]
    # ' 1587726' perde o espaço e nada mais: o ai-service não normaliza nem julga.
    assert primeira.codigo_vaga == "1587726"
    assert primeira.cliente == "GERDAU AÇOS"
    assert primeira.cargo == "Soldador"
    assert primeira.status == "Fechada"
    # A família SL... sai como está: quem rejeita é o backend.
    assert leitura.linhas[-1].codigo_vaga == "SL0012"


def test_linha_vazia_nao_e_devolvida_e_a_numeracao_segue_o_csv():
    leitura = pv.projetar(montar_csv(CABECALHO, LINHAS).decode("utf-8-sig"))
    assert [item.linha for item in leitura.linhas] == [2, 3, 5]


def test_linha_curta_nao_estoura():
    leitura = pv.projetar(
        montar_csv(CABECALHO, [["01/10/2026", "Ana", "ACME"]]).decode("utf-8-sig")
    )
    assert leitura.linhas[0].cliente == "ACME"
    assert leitura.linhas[0].codigo_vaga == ""


def test_coluna_inserida_no_meio_nao_desloca_o_recorte():
    """O defeito que a lista branca por nome existe para impedir.

    Com recorte por índice, inserir uma coluna antes de `Cliente` passaria a devolver o salário e o
    nome do candidato sem nada falhar.
    """
    cabecalho = ["Coluna nova", *CABECALHO]
    linhas = [["x", *linha] for linha in LINHAS]
    leitura = pv.projetar(montar_csv(cabecalho, linhas).decode("utf-8-sig"))
    assert leitura.linhas[0].cliente == "GERDAU AÇOS"
    assert leitura.linhas[0].codigo_vaga == "1587726"
    assert "4500,00" not in leitura.model_dump_json()
    assert "Jose da Silva" not in leitura.model_dump_json()


def test_cabecalho_depois_de_linha_de_titulo():
    csv_texto = montar_csv(["Relatório Geral 2026"], [CABECALHO, *LINHAS]).decode("utf-8-sig")
    leitura = pv.projetar(csv_texto)
    assert leitura.linhas_uteis == 3
    assert leitura.linhas[0].linha == 3


def test_cabecalho_tolera_caixa_e_espaco_sobrando():
    cabecalho = [c.upper() if c == "Cliente" else c for c in CABECALHO]
    cabecalho = ["  CODIGO  DA   VAGA " if c == "Código da vaga" else c for c in cabecalho]
    leitura = pv.projetar(montar_csv(cabecalho, LINHAS).decode("utf-8-sig"))
    assert leitura.colunas["cliente"] == "CLIENTE"
    assert leitura.linhas[0].codigo_vaga == "1587726"


@pytest.mark.parametrize("faltando", ["Cliente", "Código da vaga", "Vaga", "Status"])
def test_cabecalho_ausente_falha_e_nao_devolve_o_que_achou(faltando):
    cabecalho = [c for c in CABECALHO if c != faltando]
    linhas = [
        [v for c, v in zip(CABECALHO, linha, strict=True) if c != faltando] for linha in LINHAS
    ]
    with pytest.raises(pv.ErroPlanilhaViva) as exc:
        pv.projetar(montar_csv(cabecalho, linhas).decode("utf-8-sig"))
    assert exc.value.familia == "CABECALHO"
    assert faltando in exc.value.detalhe


def test_cabecalho_repetido_falha():
    cabecalho = [*CABECALHO, "Cliente"]
    linhas = [[*linha, "OUTRO"] for linha in LINHAS]
    with pytest.raises(pv.ErroPlanilhaViva) as exc:
        pv.projetar(montar_csv(cabecalho, linhas).decode("utf-8-sig"))
    assert exc.value.familia == "CABECALHO"


def test_cabecalho_ausente_devolve_422_sem_conteudo_de_celula(client, monkeypatch, auth_headers):
    cabecalho = [c for c in CABECALHO if c != "Status"]
    linhas = [linha[:8] + linha[9:] for linha in LINHAS]
    s = SessaoFalsa(RespostaFalsa(montar_csv(cabecalho, linhas)))
    monkeypatch.setattr(pv, "_sessao", lambda: s)
    r = client.post("/planilha-viva/ler", json={"fileId": FILE_ID}, headers=auth_headers)
    assert r.status_code == 422
    assert "Status" in r.json()["detail"]
    for proibido in ["4500,00", "Jose da Silva", "GERDAU"]:
        assert proibido not in r.text


def test_planilha_vazia_falha():
    with pytest.raises(pv.ErroPlanilhaViva) as exc:
        pv.projetar("")
    assert exc.value.familia == "FORMATO"


# ── Os limites da leitura ─────────────────────────────────────────────────────────────────────


def test_teto_de_tamanho_corta_durante_a_leitura(monkeypatch):
    grande = b"a" * (pv.TETO_BYTES + pv.CHUNK_BYTES)
    s = SessaoFalsa(RespostaFalsa(grande))
    monkeypatch.setattr(pv, "_sessao", lambda: s)
    with pytest.raises(pv.ErroPlanilhaViva) as exc:
        pv.exportar_csv(FILE_ID)
    assert exc.value.familia == "TAMANHO"


def test_teto_devolve_413(client, monkeypatch, auth_headers):
    s = SessaoFalsa(RespostaFalsa(b"a" * (pv.TETO_BYTES + 1)))
    monkeypatch.setattr(pv, "_sessao", lambda: s)
    r = client.post("/planilha-viva/ler", json={"fileId": FILE_ID}, headers=auth_headers)
    assert r.status_code == 413


def test_http_diferente_de_200_vira_503_sem_mensagem_do_provedor(client, monkeypatch, auth_headers):
    s = SessaoFalsa(RespostaFalsa(b'{"error":{"message":"segredo do provedor"}}', status=403))
    monkeypatch.setattr(pv, "_sessao", lambda: s)
    r = client.post("/planilha-viva/ler", json={"fileId": FILE_ID}, headers=auth_headers)
    assert r.status_code == 503
    assert "segredo do provedor" not in r.text


def test_falha_de_transporte_vira_503_sem_a_mensagem(client, monkeypatch, auth_headers):
    s = SessaoFalsa(erro=RuntimeError("stack trace com url assinada dentro"))
    monkeypatch.setattr(pv, "_sessao", lambda: s)
    r = client.post("/planilha-viva/ler", json={"fileId": FILE_ID}, headers=auth_headers)
    assert r.status_code == 503
    assert "url assinada" not in r.text


@pytest.mark.parametrize(
    "ruim", ["", "   ", "curto", "../../etc/passwd", "id com espaco", "a" * 300]
)
def test_file_id_invalido_e_recusado_antes_de_qualquer_chamada(ruim, monkeypatch):
    s = SessaoFalsa(RespostaFalsa(b""))
    monkeypatch.setattr(pv, "_sessao", lambda: s)
    with pytest.raises(pv.ErroPlanilhaViva) as exc:
        pv.exportar_csv(ruim)
    assert exc.value.familia == "ENTRADA"
    assert s.chamadas == []


def test_file_id_invalido_devolve_422(client, sessao, auth_headers):
    r = client.post("/planilha-viva/ler", json={"fileId": "../x"}, headers=auth_headers)
    assert r.status_code == 422
    assert sessao.chamadas == []
