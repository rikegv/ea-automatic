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

# Cabeçalho no formato da planilha real: as 4 EXIGIDAS da lista branca espalhadas entre as
# sensíveis, e as 4 OPCIONAIS no fim. As opcionais ficam no fim de propósito: há testes que recortam
# o cabeçalho por índice (o do 422, que remove `Status`), e mexer nas 10 primeiras posições os
# quebraria por motivo que não é o da frente.
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
    "Tipo de Vaga",
    "Célula de Atendimento",
    "Data de Abertura / Alinhamento",
    "SLA acordado para entrega",
]

OPCIONAIS = [
    "Tipo de Vaga",
    "Célula de Atendimento",
    "Data de Abertura / Alinhamento",
    "SLA acordado para entrega",
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
        "Reposição",
        " Célula Norte",
        "15/09/2026",
        "30 dias",
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
        "Aumento de quadro",
        "Célula Sul",
        "01/10/2026",
        "",
    ],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["03/10/2026", "Caio", "", "", "SL0012", "", "Dani", "", "", "", "", "", "", ""],
]


def sem_colunas(rotulos: list[str]) -> tuple[list[str], list[list[str]]]:
    """Mesmo cabeçalho e mesmas linhas, sem os rótulos pedidos. Recorte por NOME, não por índice."""
    manter = [i for i, c in enumerate(CABECALHO) if c not in rotulos]
    return (
        [CABECALHO[i] for i in manter],
        [[linha[i] for i in manter] for linha in LINHAS],
    )


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


def test_rota_devolve_so_as_colunas_da_lista_branca(client, sessao, auth_headers):
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
        "tipoVaga": "Tipo de Vaga",
        "celulaAtendimento": "Célula de Atendimento",
        "dataAbertura": "Data de Abertura / Alinhamento",
        "slaEntrega": "SLA acordado para entrega",
    }
    for linha in corpo["linhas"]:
        assert set(linha) == {
            "linha",
            "cliente",
            "codigoVaga",
            "cargo",
            "status",
            "tipoVaga",
            "celulaAtendimento",
            "dataAbertura",
            "slaEntrega",
        }


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


# ── As colunas OPCIONAIS ──────────────────────────────────────────────────────────────────────


def test_opcionais_presentes_saem_projetadas_com_strip():
    leitura = pv.projetar(montar_csv(CABECALHO, LINHAS).decode("utf-8-sig"))
    primeira = leitura.linhas[0]
    assert primeira.tipo_vaga == "Reposição"
    # ' Célula Norte' perde o espaço e nada mais: o ai-service não normaliza nem julga.
    assert primeira.celula_atendimento == "Célula Norte"
    assert primeira.data_abertura == "15/09/2026"
    assert primeira.sla_entrega == "30 dias"
    # Célula VAZIA com cabeçalho presente é "", nunca None: a distinção é o contrato.
    assert leitura.linhas[1].sla_entrega == ""


@pytest.mark.parametrize(
    ("rotulo", "campo"),
    [
        ("Tipo de Vaga", "tipo_vaga"),
        ("Célula de Atendimento", "celula_atendimento"),
        ("Data de Abertura / Alinhamento", "data_abertura"),
        ("SLA acordado para entrega", "sla_entrega"),
    ],
)
def test_opcional_ausente_nao_falha_devolve_none_e_nao_e_declarada(rotulo, campo):
    """O motivo de serem opcionais: renomear uma destas na planilha NAO pode derrubar a leitura.

    Se derrubasse, o espelho congelaria e vaga real sairia da tela.
    """
    cabecalho, linhas = sem_colunas([rotulo])
    leitura = pv.projetar(montar_csv(cabecalho, linhas).decode("utf-8-sig"))
    assert leitura.linhas_uteis == 3
    # `colunas` declara SÓ o que foi achado.
    alias = next(k for k, v in pv.COLUNAS_OPCIONAIS.items() if v == rotulo)
    assert alias not in leitura.colunas
    # E o campo vem None em TODA linha, não "".
    assert [getattr(item, campo) for item in leitura.linhas] == [None, None, None]


def test_todas_as_opcionais_ausentes_a_leitura_segue_inteira():
    """O caso que protege a fila: planilha sem nenhuma das novas colunas continua lida."""
    cabecalho, linhas = sem_colunas(OPCIONAIS)
    leitura = pv.projetar(montar_csv(cabecalho, linhas).decode("utf-8-sig"))
    assert leitura.linhas_uteis == 3
    assert set(leitura.colunas) == {"cliente", "codigoVaga", "cargo", "status"}
    assert leitura.linhas[0].cliente == "GERDAU AÇOS"
    assert leitura.linhas[0].codigo_vaga == "1587726"
    assert leitura.linhas[0].status == "Fechada"
    for item in leitura.linhas:
        assert item.tipo_vaga is None
        assert item.celula_atendimento is None
        assert item.data_abertura is None
        assert item.sla_entrega is None


def test_opcional_repetida_e_tratada_como_ausente_e_nao_falha():
    """Rótulo repetido não "escolhe a primeira": escolher poderia devolver outra das 65 colunas."""
    cabecalho = [*CABECALHO, "Tipo de Vaga"]
    linhas = [[*linha, "LIXO SENSIVEL"] for linha in LINHAS]
    leitura = pv.projetar(montar_csv(cabecalho, linhas).decode("utf-8-sig"))
    assert leitura.linhas_uteis == 3
    assert "tipoVaga" not in leitura.colunas
    assert all(item.tipo_vaga is None for item in leitura.linhas)
    assert "LIXO SENSIVEL" not in leitura.model_dump_json()
    # As demais opcionais seguem resolvendo.
    assert leitura.colunas["celulaAtendimento"] == "Célula de Atendimento"


def test_opcional_nao_decide_qual_linha_e_cabecalho():
    """A âncora do cabeçalho segue sendo SÓ as exigidas. Linha de título com opcional não ganha."""
    csv_texto = montar_csv(["Tipo de Vaga", "Célula de Atendimento"], [CABECALHO, *LINHAS]).decode(
        "utf-8-sig"
    )
    leitura = pv.projetar(csv_texto)
    assert leitura.linhas[0].linha == 3
    assert leitura.linhas[0].tipo_vaga == "Reposição"


def test_opcional_nao_ressuscita_linha_descartada():
    """Linha com os 4 exigidos vazios continua fora, mesmo com opcional preenchido."""
    linha = ["", "", "", "", "", "", "", "", "", "", "Reposição", "Célula Norte", "x", "y"]
    leitura = pv.projetar(montar_csv(CABECALHO, [linha]).decode("utf-8-sig"))
    assert leitura.linhas_uteis == 0


def test_opcional_em_linha_curta_vem_vazia_e_nao_estoura():
    leitura = pv.projetar(
        montar_csv(CABECALHO, [["01/10/2026", "Ana", "ACME"]]).decode("utf-8-sig")
    )
    # Cabeçalho existe, a linha é que acabou antes: "" e não None.
    assert leitura.linhas[0].tipo_vaga == ""
    assert leitura.linhas[0].sla_entrega == ""


def test_opcional_tolera_caixa_e_espaco_sobrando():
    cabecalho = [
        "  CELULA   DE ATENDIMENTO " if c == "Célula de Atendimento" else c for c in CABECALHO
    ]
    leitura = pv.projetar(montar_csv(cabecalho, LINHAS).decode("utf-8-sig"))
    assert leitura.colunas["celulaAtendimento"] == "CELULA   DE ATENDIMENTO"
    assert leitura.linhas[0].celula_atendimento == "Célula Norte"


@pytest.mark.parametrize(
    "intrusa", ["Salário na Abertura", "Nome da Pessoa Candidata Aprovada", "Telefone"]
)
def test_canario_a6_coluna_fora_das_duas_listas_nao_atravessa(intrusa):
    """§A.6: o que não está em NENHUMA das duas listas brancas não aparece em campo nenhum."""
    cabecalho = [*CABECALHO, intrusa]
    linhas = [[*linha, "VALOR QUE NAO PODE SAIR"] for linha in LINHAS]
    leitura = pv.projetar(montar_csv(cabecalho, linhas).decode("utf-8-sig"))
    bruto = leitura.model_dump_json()
    assert "VALOR QUE NAO PODE SAIR" not in bruto
    assert intrusa not in bruto
    assert intrusa not in leitura.colunas.values()


def test_as_duas_listas_brancas_tem_exatamente_os_rotulos_acordados():
    """Cardinalidade é a superfície de auditoria: coluna a mais aqui é coluna a mais na rede."""
    assert pv.COLUNAS_EXIGIDAS == {
        "cliente": "Cliente",
        "codigoVaga": "Código da vaga",
        "cargo": "Vaga",
        "status": "Status",
    }
    assert pv.COLUNAS_OPCIONAIS == {
        "tipoVaga": "Tipo de Vaga",
        "celulaAtendimento": "Célula de Atendimento",
        "dataAbertura": "Data de Abertura / Alinhamento",
        "slaEntrega": "SLA acordado para entrega",
    }
    assert set(pv.COLUNAS_EXIGIDAS).isdisjoint(pv.COLUNAS_OPCIONAIS)
    assert set(pv.LinhaPlanilhaViva.model_fields) == {
        "linha",
        "cliente",
        "codigo_vaga",
        "cargo",
        "status",
        "tipo_vaga",
        "celula_atendimento",
        "data_abertura",
        "sla_entrega",
    }


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
