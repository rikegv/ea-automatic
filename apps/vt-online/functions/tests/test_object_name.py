"""Prova que o nome do objeto no bucket e OPACO, sem nenhum dado pessoal (§A.6, vazamento 2).

Antes o nome era `NOME MAIUSCULO CPF.pdf`, e o CPF cru vazava para o log de acesso do Google. Agora
o nome e um UUID v4 opaco (`<uuid>.pdf`), e o par PDF+JSON compartilha a MESMA raiz (o mesmo uid),
senao o sidecar deixa de casar com o PDF.
"""

import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import _nome_objeto, _nome_objeto_json  # noqa: E402


def test_nome_do_pdf_e_opaco_sem_pii():
    uid = uuid.uuid4().hex
    nome = _nome_objeto(uid)
    assert nome == f"{uid}.pdf"
    assert nome.endswith(".pdf")


def test_nome_opaco_nao_carrega_cpf_nem_letra():
    """Nome opaco = so o uid hex + extensao. Sem nome de pessoa (letras de A-Z) nem CPF (11 digitos)."""
    uid = uuid.uuid4().hex
    nome = _nome_objeto(uid)
    base = nome[: -len(".pdf")]
    # UUID hex e so [0-9a-f]; nenhuma letra maiuscula de nome e nenhum bloco de 11 digitos de CPF.
    assert re.fullmatch(r"[0-9a-f]+", base)
    assert not re.search(r"[G-Zg-z]", base)
    assert not re.search(r"\d{11}", base)


def test_pdf_e_json_compartilham_a_mesma_raiz():
    """O par PDF+JSON precisa do MESMO uid, senao o sidecar deixa de casar com o PDF."""
    uid = uuid.uuid4().hex
    pdf = _nome_objeto(uid)
    jsn = _nome_objeto_json(uid)
    assert pdf.endswith(".pdf")
    assert jsn.endswith(".json")
    assert pdf[: -len(".pdf")] == jsn[: -len(".json")] == uid
