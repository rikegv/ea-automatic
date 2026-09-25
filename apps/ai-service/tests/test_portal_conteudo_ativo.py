"""Exigência 6 do Portal: PDF que EXECUTA ao abrir é recusado, e o PDF comum não é (§A.38).

A guarda tinha de nascer com teste porque ela é a única do sistema que olha AÇÃO dentro do PDF, e
porque o erro dela tem dois custos opostos: deixar passar um arquivo hostil, e reprovar a foto da
CTPS de alguém. Os PDFs aqui são REAIS, gerados com pypdf, no mesmo padrão do teste de senha.
"""

from io import BytesIO

from pypdf import PdfWriter
from pypdf.generic import (
    ArrayObject,
    DictionaryObject,
    NameObject,
    TextStringObject,
)

from app.portal_conteudo_ativo import conteudo_ativo_no_pdf


def _pdf_simples() -> bytes:
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


def _pdf_com_javascript() -> bytes:
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    escritor.add_js("app.alert('oi');")
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


def _pdf_com_open_action() -> bytes:
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    acao = DictionaryObject()
    acao[NameObject("/S")] = NameObject("/Launch")
    acao[NameObject("/F")] = TextStringObject("calc.exe")
    escritor._root_object[NameObject("/OpenAction")] = acao
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


def _pdf_com_acao_automatica() -> bytes:
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    aa = DictionaryObject()
    aa[NameObject("/O")] = ArrayObject()
    escritor._root_object[NameObject("/AA")] = aa
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


def test_pdf_comum_nao_tem_conteudo_ativo():
    assert conteudo_ativo_no_pdf(_pdf_simples()) == []


def test_javascript_e_pego():
    assert "javascript" in conteudo_ativo_no_pdf(_pdf_com_javascript())


def test_acao_ao_abrir_e_launch_sao_pegos():
    achados = conteudo_ativo_no_pdf(_pdf_com_open_action())
    assert "acao_ao_abrir" in achados
    assert "executa_programa" in achados


def test_acao_automatica_e_pega():
    assert "acao_automatica" in conteudo_ativo_no_pdf(_pdf_com_acao_automatica())


def test_marca_dentro_de_nome_maior_nao_e_falso_positivo():
    """A borda do nome importa: `/JSomething` NÃO é `/JS`, e sem isso a guarda reprovaria documento bom."""
    conteudo = b"%PDF-1.7\n<< /JSomething 1 /OpenActionable 2 /Launched 3 >>\n%%EOF"
    assert conteudo_ativo_no_pdf(conteudo) == []


def test_arquivo_que_nao_e_pdf_nao_e_varrido():
    assert conteudo_ativo_no_pdf(b"\xff\xd8\xff\xe0 foto qualquer") == []
