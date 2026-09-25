"""JSON IRMAO do PDF: o contrato que o EA le para somar os valores na tela de Beneficios.

POR QUE ELE EXISTE. Esta funcao gerava o PDF, jogava no bucket e jogava fora TODO o resto. O EA
recebia um arquivo e nenhum numero, entao a coluna VT nao tinha o que somar. O JSON irmao carrega os
campos estruturados pelo MESMO transporte do PDF (o bucket), porque esta funcao roda no Firebase e o
EA e loopback atras da VPN, inalcancavel de fora.

O QUE ESTES TESTES TRANCAM:
 1. o par PDF+JSON compartilha o MESMO uid opaco (o EA lista os nomes e le o JSON do lado dele);
 2. os valores de ENUM sao os do banco do EA, sem traducao no caminho;
 3. os TOTAIS batem com as conducoes, porque e a soma que vai para a folha;
 4. o handle de casamento e o `admissaoId` (o `sub` do token), e NENHUM dado pessoal (nome, CPF,
    nascimento) entra no JSON nem no nome do objeto (§A.6, vazamento 2).
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main  # noqa: E402


# `sub` = admissaoId (o token do link ja o carrega, vt_token._REQUIRED_CLAIMS inclui "sub").
CLAIMS = {"nome": "Fulano De Tal", "cpf": "39053344705", "sub": "adm-abc-123"}

DADOS = {
    "optante": True,
    "cep": "01310100",
    "logradouro": "Avenida Paulista",
    "numero": "1000",
    "complemento": None,
    "bairro": "Bela Vista",
    "cidade": "Sao Paulo",
    "uf": "SP",
    "dataNascimento": "1995-05-31",
    "conducoes": [
        {
            "sentido": "IDA",
            "cidade": "Sao Paulo",
            "tipoTransporte": "Metro",
            "cartao": "BILHETE_UNICO",
            "cartaoOutro": None,
            "valor": 4.7,
        },
        {
            "sentido": "VOLTA",
            "cidade": "Sao Paulo",
            "tipoTransporte": "Metro",
            "cartao": "BILHETE_UNICO",
            "cartaoOutro": None,
            "valor": 4.7,
        },
    ],
}


def _sidecar(dados=None):
    d = dados or DADOS
    doc = main._monta_documento(CLAIMS, d)
    return main._sidecar(d, doc, "2026-08-20T18:00:00Z", CLAIMS["sub"])


def test_pdf_e_json_compartilham_o_mesmo_uid_opaco():
    uid = uuid.uuid4().hex
    pdf = main._nome_objeto(uid)
    jsn = main._nome_objeto_json(uid)
    assert pdf.endswith(".pdf")
    assert jsn == pdf[: -len(".pdf")] + ".json"
    assert pdf[: -len(".pdf")] == uid


def test_o_handle_de_casamento_e_o_admissao_id():
    """O EA casa o arquivo NOVO por admissaoId (o `sub` do token), lido do JSON, nao mais por CPF."""
    assert _sidecar()["admissaoId"] == "adm-abc-123"


def test_totais_batem_com_as_conducoes():
    s = _sidecar()
    assert s["totalIda"] == 4.7
    assert s["totalVolta"] == 4.7
    assert s["totalDia"] == 9.4


def test_enums_saem_como_o_banco_do_ea_espera():
    s = _sidecar()
    assert [c["sentido"] for c in s["conducoes"]] == ["IDA", "VOLTA"]
    assert {c["cartao"] for c in s["conducoes"]} == {"BILHETE_UNICO"}


def test_ordem_preserva_a_sequencia_preenchida():
    s = _sidecar()
    assert [c["ordem"] for c in s["conducoes"]] == [1, 2]


def test_nao_carrega_dado_pessoal_so_o_admissao_id():
    """O unico handle e o admissaoId (id interno, sem PII). CPF, nome e nascimento ficam de fora."""
    s = _sidecar()
    bruto = str(s)
    assert "39053344705" not in bruto
    assert "Fulano" not in bruto
    assert "1995-05-31" not in bruto
    for proibido in ("nome", "cpf", "dataNascimento", "nascHash"):
        assert proibido not in s
    assert s["admissaoId"] == "adm-abc-123"


def test_nao_optante_vai_sem_conducao_e_com_totais_zerados():
    d = {**DADOS, "optante": False, "conducoes": []}
    s = _sidecar(d)
    assert s["optante"] is False
    assert s["conducoes"] == []
    assert s["totalDia"] == 0


def test_o_aceite_vai_carimbado():
    """Trilha de responsabilizacao: sem o carimbo o EA recusa gravar os campos estruturados."""
    assert _sidecar()["cienteEm"] == "2026-08-20T18:00:00Z"
