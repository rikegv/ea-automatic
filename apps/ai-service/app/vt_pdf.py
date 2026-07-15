"""Composição dos documentos de VT (§A.17 etapa 2, Parte D).

Dois documentos distintos, ambos com cabeçalho/logo Soulan:
  - OPTANTE: dados pessoais + itinerário de IDA + itinerário de VOLTA + total do dia + compromisso.
  - NÃO-OPTANTE: declaração de recusa com o texto aprovado pelo diretor.

Diferente do resto do serviço (que RECORTA PDFs existentes com pypdf), aqui o documento é
DESENHADO a partir de dados estruturados, então usa reportlab/platypus.

§A.6: o PDF carrega PII por necessidade (é o documento oficial do beneficiário). Os bytes são
devolvidos ao backend e nada é gravado em disco aqui; nome/CPF nunca são logados.
"""

from datetime import date
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

LOGO = Path(__file__).parent / "assets" / "logo-soulan.png"

# Paleta da marca Soulan (lida do próprio logo): azul do texto e verde do símbolo.
AZUL = colors.HexColor("#4A7FA5")
VERDE = colors.HexColor("#9FC53D")
CINZA = colors.HexColor("#555555")
CINZA_CLARO = colors.HexColor("#EFEFEF")

MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _brl(valor: float) -> str:
    """R$ no padrão pt-BR (1.234,56). Gratuidade sai como R$ 0,00, que é a tarifa real."""
    return f"R$ {valor:,.2f}".replace(",", "~").replace(".", ",").replace("~", ".")


def _data_extenso(hoje: date) -> str:
    return f"São Paulo, {hoje.day} de {MESES[hoje.month - 1]} de {hoje.year}"


def _formatar_cpf(cpf: str) -> str:
    d = "".join(ch for ch in (cpf or "") if ch.isdigit())
    return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}" if len(d) == 11 else (cpf or "")


def _formatar_data(iso: str | None) -> str:
    if not iso:
        return "não informado"
    try:
        a, m, d = iso[:10].split("-")
        return f"{d}/{m}/{a}"
    except ValueError:
        return "não informado"


def _estilos() -> dict:
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle(
            "titulo", parent=base["Title"], fontSize=14, leading=18, textColor=AZUL, spaceAfter=2
        ),
        "subtitulo": ParagraphStyle(
            "subtitulo", parent=base["Normal"], fontSize=8.5, textColor=CINZA,
            alignment=TA_CENTER, spaceAfter=8,
        ),
        "secao": ParagraphStyle(
            "secao", parent=base["Normal"], fontSize=9, leading=12, textColor=colors.white,
            fontName="Helvetica-Bold",
        ),
        "corpo": ParagraphStyle(
            "corpo", parent=base["Normal"], fontSize=9, leading=12.5, alignment=TA_JUSTIFY,
        ),
        "celula": ParagraphStyle("celula", parent=base["Normal"], fontSize=9, leading=12),
        "rodape": ParagraphStyle(
            "rodape", parent=base["Normal"], fontSize=8, textColor=CINZA, alignment=TA_CENTER
        ),
    }


def _cabecalho(est: dict, titulo: str) -> list:
    """Cabeçalho comum: logo Soulan + título do documento."""
    blocos: list = []
    if LOGO.exists():
        # 655x173 no original: mantém a proporção ao fixar a largura.
        largura = 52 * mm
        blocos.append(Image(str(LOGO), width=largura, height=largura * 173 / 655))
        blocos.append(Spacer(1, 8))
    blocos.append(Paragraph(titulo, est["titulo"]))
    blocos.append(Paragraph("Grupo Soulan · Recursos Humanos", est["subtitulo"]))
    return blocos


def _faixa_secao(est: dict, texto: str) -> Table:
    """Faixa azul de título de seção, largura total."""
    t = Table([[Paragraph(texto, est["secao"])]], colWidths=[170 * mm])
    t.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), AZUL),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    return t


def _dados_pessoais(est: dict, d: dict) -> Table:
    linhas = [
        ["Nome", d["nome"]],
        ["CPF", _formatar_cpf(d["cpf"])],
        ["Data de nascimento", _formatar_data(d.get("dataNascimento"))],
        ["Cidade/UF", d["cidadeUf"]],
        ["Endereço", d["endereco"]],
    ]
    t = Table(
        [[Paragraph(f"<b>{r}</b>", est["celula"]), Paragraph(v, est["celula"])] for r, v in linhas],
        colWidths=[42 * mm, 128 * mm],
    )
    t.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, CINZA_CLARO),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FAFAFA")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    return t


def _tabela_itinerario(est: dict, conducoes: list[dict], total: float) -> Table:
    """Colunas oficiais: meio de transporte | cartão/tipo | valor unitário (decisão do diretor)."""
    dados = [[
        Paragraph("<b>Meio de transporte</b>", est["celula"]),
        Paragraph("<b>Cartão/tipo</b>", est["celula"]),
        Paragraph("<b>Valor unitário</b>", est["celula"]),
    ]]
    if conducoes:
        for c in conducoes:
            dados.append([
                Paragraph(c["meioTransporte"], est["celula"]),
                Paragraph(c["cartao"], est["celula"]),
                Paragraph(_brl(c["valor"]), est["celula"]),
            ])
    else:
        dados.append([Paragraph("nenhuma condução informada", est["celula"]), "", ""])
    dados.append([Paragraph("<b>Total</b>", est["celula"]), "", Paragraph(f"<b>{_brl(total)}</b>", est["celula"])])

    t = Table(dados, colWidths=[95 * mm, 45 * mm, 30 * mm], repeatRows=1)
    t.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, CINZA_CLARO),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F6F9")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FAFAFA")),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("SPAN", (0, -1), (1, -1)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    return t


def _assinatura(est: dict) -> list:
    """Linha de assinatura + data. A assinatura em si é digital (Clicksign, etapa 3).

    Vai dentro de um KeepTogether: sem isso, um itinerário longo empurra só a linha de assinatura
    para a página seguinte e o documento é assinado numa folha solta, separada do que se declara.
    """
    linha = Table([[""]], colWidths=[85 * mm])
    linha.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, colors.black)]))
    return [
        KeepTogether([
            Spacer(1, 16),
            Paragraph(_data_extenso(date.today()), est["corpo"]),
            Spacer(1, 16),
            linha,
            Paragraph("Assinatura do colaborador", est["rodape"]),
        ])
    ]


def _doc(buf: BytesIO) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Formulário de vale-transporte",
        author="Grupo Soulan",
    )


def gerar_optante(d: dict) -> bytes:
    """Documento do OPTANTE: itinerário de ida e volta, total do dia e compromisso."""
    est = _estilos()
    buf = BytesIO()
    ida = [c for c in d["conducoes"] if c["sentido"] == "IDA"]
    volta = [c for c in d["conducoes"] if c["sentido"] == "VOLTA"]

    hist: list = _cabecalho(est, "Formulário de Vale-Transporte")
    hist += [
        _faixa_secao(est, "DADOS PESSOAIS"), Spacer(1, 4), _dados_pessoais(est, d), Spacer(1, 9),
        _faixa_secao(est, "DESCRITIVO DO ITINERÁRIO - IDA"), Spacer(1, 4),
        _tabela_itinerario(est, ida, d["totalIda"]), Spacer(1, 9),
        _faixa_secao(est, "DESCRITIVO DO ITINERÁRIO - VOLTA"), Spacer(1, 4),
        _tabela_itinerario(est, volta, d["totalVolta"]), Spacer(1, 9),
    ]

    total = Table(
        [[
            Paragraph("<b>TOTAL A SER UTILIZADO NO DIA</b>", est["celula"]),
            Paragraph(f"<b>{_brl(d['totalDia'])}</b>", est["celula"]),
        ]],
        colWidths=[140 * mm, 30 * mm],
    )
    total.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), VERDE),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    hist += [total, Spacer(1, 10)]

    hist += [
        _faixa_secao(est, "COMPROMISSO DO COLABORADOR"), Spacer(1, 5),
        Paragraph(
            "Declaro que as informações acima são verdadeiras e que utilizarei o vale-transporte "
            "<b>exclusivamente</b> no deslocamento da minha residência para o local de trabalho e do "
            "local de trabalho para a minha residência, em transporte público coletivo.",
            est["corpo"],
        ),
        Spacer(1, 5),
        Paragraph(
            "Estou ciente de que a <b>declaração falsa</b> ou o <b>uso indevido</b> do benefício "
            "constitui <b>falta grave</b>, nos termos da legislação do vale-transporte.",
            est["corpo"],
        ),
        Spacer(1, 5),
        Paragraph(
            "<b>Autorizo</b> o desconto em folha de pagamento do valor correspondente à minha "
            "participação, limitado a <b>6% do meu salário-base</b>, conforme a legislação vigente.",
            est["corpo"],
        ),
        Spacer(1, 5),
        Paragraph(
            "Comprometo-me a comunicar imediatamente a empresa em caso de alteração do meu endereço "
            "ou do itinerário declarado.",
            est["corpo"],
        ),
    ]
    hist += _assinatura(est)

    _doc(buf).build(hist)
    return buf.getvalue()


def gerar_nao_optante(d: dict) -> bytes:
    """Documento de RECUSA: texto aprovado pelo diretor, literal."""
    est = _estilos()
    buf = BytesIO()

    hist: list = _cabecalho(est, "Declaração de Não Opção pelo Vale-Transporte")
    hist += [
        _faixa_secao(est, "DADOS PESSOAIS"), Spacer(1, 4), _dados_pessoais(est, d), Spacer(1, 16),
        _faixa_secao(est, "DECLARAÇÃO"), Spacer(1, 8),
        Paragraph(
            f"Eu, <b>{d['nome']}</b>, CPF <b>{_formatar_cpf(d['cpf'])}</b>, residente em "
            f"<b>{d['endereco']}</b>, declaro que não opto pela utilização do vale-transporte "
            "oferecido pela empresa.",
            est["corpo"],
        ),
        Spacer(1, 8),
        Paragraph(
            "Estou ciente de que o deslocamento entre minha residência e o local de trabalho, e "
            "vice-versa, será realizado por meios e recursos próprios, sem qualquer custo para a "
            "empresa.",
            est["corpo"],
        ),
        Spacer(1, 8),
        Paragraph(
            "Comprometo-me a comunicar a empresa caso, futuramente, passe a necessitar do benefício.",
            est["corpo"],
        ),
    ]
    hist += _assinatura(est)

    _doc(buf).build(hist)
    return buf.getvalue()


def gerar(d: dict) -> bytes:
    return gerar_optante(d) if d["tipo"] == "OPTANTE" else gerar_nao_optante(d)
