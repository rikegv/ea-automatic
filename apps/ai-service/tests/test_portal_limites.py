"""Os limites do leitor do Portal, medidos SEM confiar no que o cliente declarou.

O ponto de cada teste aqui é o mesmo: extensão e tipo declarado não decidem nada, e a dimensão da
imagem sai do CABEÇALHO, sem decodificar um pixel (decodificar é o ataque da bomba de descompressão).
"""

import struct
import zlib
from io import BytesIO

from pypdf import PdfWriter

from app.portal_inspecao import inspecionar
from app.portal_limites import contar_paginas_pdf, dimensao_da_imagem, tipo_por_conteudo


def _pdf(paginas: int = 1) -> bytes:
    escritor = PdfWriter()
    for _ in range(paginas):
        escritor.add_blank_page(width=200, height=200)
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


def _png(largura: int, altura: int) -> bytes:
    """PNG com IHDR REAL (a dimensão é lida daqui), sem pixel nenhum: nada precisa ser decodificado."""
    ihdr = struct.pack(">II", largura, altura) + bytes([8, 2, 0, 0, 0])
    corpo = b"IHDR" + ihdr
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", len(ihdr))
        + corpo
        + struct.pack(">I", zlib.crc32(corpo))
    )


def _jpeg(largura: int, altura: int) -> bytes:
    """JPEG mínimo: SOI, um APP0 para o passeio ter de saltar um segmento, e o SOF0 com a dimensão."""
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00" + b"\x00" * 9
    sof0 = b"\xff\xc0" + struct.pack(">H", 11) + bytes([8]) + struct.pack(">HH", altura, largura) + b"\x01\x11\x00"
    return b"\xff\xd8" + app0 + sof0 + b"\xff\xd9"


LIMITES = {"paginas_max": 20, "lado_max": 20_000, "megapixels_max": 80.0}


def test_tipo_sai_do_conteudo_e_nao_da_extensao():
    assert tipo_por_conteudo(_pdf()) == "application/pdf"
    assert tipo_por_conteudo(_png(10, 10)) == "image/png"
    assert tipo_por_conteudo(_jpeg(10, 10)) == "image/jpeg"
    assert tipo_por_conteudo(b"MZ executavel disfarcado de documento") is None


def test_dimensao_lida_do_cabecalho():
    assert dimensao_da_imagem(_png(1234, 567), "image/png") == (1234, 567)
    assert dimensao_da_imagem(_jpeg(4032, 3024), "image/jpeg") == (4032, 3024)


def test_contagem_de_paginas():
    assert contar_paginas_pdf(_pdf(3)) == 3
    assert contar_paginas_pdf(b"%PDF-1.7 lixo") is None


def test_inspecao_aceita_pdf_comum():
    veredicto = inspecionar(_pdf(2), **LIMITES)
    assert veredicto["ok"] is True
    assert veredicto["mime"] == "application/pdf"
    assert veredicto["paginas"] == 2


def test_inspecao_recusa_formato_desconhecido():
    assert inspecionar(b"MZ nao e documento", **LIMITES)["recusa"] == "FORMATO"


def test_inspecao_recusa_pdf_com_paginas_demais():
    veredicto = inspecionar(_pdf(5), paginas_max=3, lado_max=20_000, megapixels_max=80.0)
    assert veredicto["recusa"] == "PAGINAS"


def test_inspecao_recusa_imagem_gigante_sem_decodificar():
    """50.000 por 50.000 = 2,5 bilhões de pixels declarados em 33 bytes de cabeçalho."""
    veredicto = inspecionar(_png(50_000, 50_000), **LIMITES)
    assert veredicto["recusa"] == "DIMENSAO"


def test_inspecao_recusa_pdf_com_senha():
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    escritor.encrypt(user_password="segredo")
    buf = BytesIO()
    escritor.write(buf)
    assert inspecionar(buf.getvalue(), **LIMITES)["recusa"] == "PDF_PROTEGIDO"


def test_inspecao_recusa_pdf_com_conteudo_ativo():
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    escritor.add_js("app.alert('oi');")
    buf = BytesIO()
    escritor.write(buf)
    veredicto = inspecionar(buf.getvalue(), **LIMITES)
    assert veredicto["recusa"] == "CONTEUDO_ATIVO"
    assert "javascript" in veredicto["conteudo_ativo"]
