"""OS LIMITES DO LEITOR do Portal, todos medidos SEM CONFIAR no que o cliente declarou.

POR QUE ESTE ARQUIVO EXISTE. Hoje não há teto nenhum no caminho do documento: nenhum interceptor do
backend declara `limits`, e o `ler_staging` faz `read_bytes()` do arquivo inteiro sem conferir
tamanho. Isso era aceitável enquanto quem mandava arquivo era consultor autenticado. No Portal quem
manda é o candidato, e o arquivo hostil é um caso de projeto, não um acidente.

AS TRÊS COISAS QUE ESTE ARQUIVO NÃO FAZ, E CADA UMA É UMA DECISÃO:
 1. **Não olha extensão nem `Content-Type`.** O nome do arquivo vem do aparelho do candidato e o tipo
    declarado vem do cliente; os dois são palavra de quem está do outro lado. O tipo sai dos MAGIC
    BYTES, que é o conteúdo real. Por isso `tipo_por_conteudo` não recebe caminho nenhum, ao
    contrário do `gemini.resolver_mime`, que começa pela extensão e só cai nos bytes depois.
 2. **Não DECODIFICA imagem para medir.** Decodificar é exatamente o ataque: um PNG de poucos KB pode
    virar gigabytes de pixel na memória. Largura e altura saem do CABEÇALHO (o `IHDR` do PNG, o marco
    `SOFn` do JPEG), que são poucos bytes lidos de posição fixa. É também por isso que não entrou
    biblioteca de imagem como dependência, e é melhor assim.
 3. **Não abre o PDF inteiro para contar página.** Quem conta é o `pypdf`, que já é dependência e já
    é usado na detecção de senha, e a contagem roda dentro do processo filho com morte dura
    (`portal_processo`), porque é o ponto onde um PDF construído para travar trava.

§A.6: tudo aqui é função pura sobre bytes. Nada é logado, nada é persistido, nada toca CPF ou nome.
"""

from __future__ import annotations

import struct
from io import BytesIO

from pypdf import PdfReader

__all__ = [
    "TIPOS_ACEITOS",
    "tipo_por_conteudo",
    "dimensao_da_imagem",
    "contar_paginas_pdf",
]

# Os três formatos que a auditoria sabe ler (o mesmo conjunto que o `resolver_mime` já aceita).
TIPOS_ACEITOS = ("application/pdf", "image/jpeg", "image/png")

_PNG_ASSINATURA = b"\x89PNG\r\n\x1a\n"

# Marcos SOF do JPEG que carregam altura e largura. Ficam de fora os marcos de dados (SOS), os de
# reinício e os que não descrevem quadro: DHT (c4), JPG (c8) e DAC (cc).
_SOF_JPEG = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def tipo_por_conteudo(conteudo: bytes) -> str | None:
    """O mime pelos MAGIC BYTES. `None` = formato que não sabemos ler, e o chamador recusa.

    Nunca devolve `application/octet-stream`: mandar octet-stream ao Vertex vira 400 e chega do
    outro lado como falha genérica, que foi o problema que o Bloco A da auditoria já corrigiu.
    """
    if len(conteudo) < 8:
        return None
    if conteudo[:4] == b"%PDF":
        return "application/pdf"
    if conteudo[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if conteudo[:8] == _PNG_ASSINATURA:
        return "image/png"
    return None


def dimensao_da_imagem(conteudo: bytes, mime: str) -> tuple[int, int] | None:
    """(largura, altura) lidas do CABEÇALHO, sem decodificar um único pixel. `None` = não legível.

    `None` NÃO é passe livre: o chamador trata cabeçalho ilegível como recusa, porque imagem cuja
    dimensão não se consegue ler é imagem que não vamos entregar ao motor sem saber o que é.
    """
    if mime == "image/png":
        return _dimensao_png(conteudo)
    if mime == "image/jpeg":
        return _dimensao_jpeg(conteudo)
    return None


def _dimensao_png(conteudo: bytes) -> tuple[int, int] | None:
    """PNG: o `IHDR` é obrigatoriamente o primeiro chunk, com largura e altura em posição fixa."""
    if len(conteudo) < 24 or conteudo[:8] != _PNG_ASSINATURA or conteudo[12:16] != b"IHDR":
        return None
    largura, altura = struct.unpack(">II", conteudo[16:24])
    return (largura, altura)


def _dimensao_jpeg(conteudo: bytes) -> tuple[int, int] | None:
    """JPEG: caminha de marco em marco até o primeiro SOF, sem nunca entrar nos dados comprimidos.

    O passeio é limitado pelo próprio tamanho declarado de cada segmento e por um teto de saltos, para
    que um arquivo construído com segmentos circulares não vire laço infinito aqui dentro.
    """
    total = len(conteudo)
    i = 2  # pula o SOI (ffd8)
    saltos = 0
    while i + 3 < total and saltos < 2048:
        saltos += 1
        if conteudo[i] != 0xFF:
            i += 1
            continue
        marco = conteudo[i + 1]
        if marco in (0xFF, 0x01) or 0xD0 <= marco <= 0xD9:
            i += 2
            continue
        tamanho = struct.unpack(">H", conteudo[i + 2 : i + 4])[0]
        if tamanho < 2:
            return None
        if marco in _SOF_JPEG:
            if i + 9 > total:
                return None
            altura, largura = struct.unpack(">HH", conteudo[i + 5 : i + 9])
            return (largura, altura)
        i += 2 + tamanho
    return None


def contar_paginas_pdf(conteudo: bytes) -> int | None:
    """Número de páginas do PDF. `None` quando o arquivo não abre, e isso também é recusa.

    RODA DENTRO DO PROCESSO FILHO (`portal_processo`): é aqui que um PDF hostil consegue prender o
    interpretador, e leitor travado não pode segurar o serviço inteiro.
    """
    try:
        leitor = PdfReader(BytesIO(conteudo))
        if leitor.is_encrypted:
            # Sem senha não há como contar. Quem trata senha é o `pdf_seguranca`, com motivo próprio.
            return None
        return len(leitor.pages)
    except Exception:  # noqa: BLE001 - PDF malformado não derruba o leitor
        return None
