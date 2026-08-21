"""Prova que o nome do objeto no bucket e montado como NOME MAIUSCULO CPF.pdf.

O nome do arquivo arquivado no bucket coletivo do GCS deve ser EXATAMENTE o nome do candidato em
MAIUSCULAS, um unico espaco, e o CPF de 11 digitos sem mascara, com a extensao .pdf.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import _nome_objeto  # noqa: E402


def test_nome_objeto_maiusculo_cpf():
    assert _nome_objeto("Maria de Teste Silva", "11122233344") == "MARIA DE TESTE SILVA 11122233344.pdf"


def test_nome_objeto_ja_maiusculo_estavel():
    assert _nome_objeto("JOAO SOUZA", "98765432100") == "JOAO SOUZA 98765432100.pdf"


def test_nome_objeto_espaco_unico_entre_nome_e_cpf():
    nome = "ANA LIMA"
    cpf = "00011122233"
    objeto = _nome_objeto(nome, cpf)
    assert objeto == f"{nome} {cpf}.pdf"
    assert objeto.endswith(".pdf")
    # exatamente um espaco separando o nome do CPF (nome de teste sem espacos internos).
    assert objeto.count(" ") == nome.count(" ") + 1
