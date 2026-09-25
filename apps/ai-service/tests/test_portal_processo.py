"""Exigência 5: a inspeção roda em PROCESSO FILHO e morre de verdade no estouro do tempo.

O que este teste protege é a diferença entre abortar a ESPERA e abortar o TRABALHO. O tempo limite
que já existia no caminho da IA é do lado de quem chama (120s no backend): ele desiste, e o
interpretador do lado de cá continua mastigando o arquivo para sempre. Com alguns arquivos assim, o
serviço para de atender sem nunca ter caído.
"""

import multiprocessing as mp
from io import BytesIO

import pytest
from pypdf import PdfWriter

from app.portal_processo import TempoEsgotado, inspecionar_com_morte_dura

LIMITES = {"paginas_max": 20, "lado_max": 20_000, "megapixels_max": 80.0}


def _pdf() -> bytes:
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


def test_veredicto_atravessa_o_processo_filho():
    veredicto = inspecionar_com_morte_dura(_pdf(), tempo_max_s=30.0, **LIMITES)
    assert veredicto["ok"] is True
    assert veredicto["mime"] == "application/pdf"


def test_prazo_estourado_levanta_e_nao_deixa_filho_vivo():
    """Prazo impossível: o filho nem termina de nascer, e mesmo assim ninguém sobrevive ao retorno."""
    with pytest.raises(TempoEsgotado):
        inspecionar_com_morte_dura(_pdf(), tempo_max_s=0.001, **LIMITES)
    assert [p for p in mp.active_children() if p.is_alive()] == []
