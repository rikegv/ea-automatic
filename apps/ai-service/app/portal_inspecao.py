"""A INSPEÇÃO do arquivo do Portal: tudo o que se decide sobre os bytes ANTES de chamar a IA.

ESTA FUNÇÃO RODA DENTRO DO PROCESSO FILHO (`portal_processo`), e é por isso que ela é pura: recebe
bytes e números, devolve um veredicto, não abre rede, não lê configuração e não escreve nada. É o
único ponto do Portal em que um arquivo escolhido por uma pessoa de fora é efetivamente ABERTO por
um interpretador nosso, e é o ponto em que um arquivo construído para travar trava.

A ORDEM DOS CORTES NÃO É ARBITRÁRIA, e cada passo só existe porque o anterior não o cobre:
 1. **Tipo pelo conteúdo real.** Antes de qualquer análise, saber o que é. Extensão e tipo declarado
    são palavra do candidato e não entram na decisão.
 2. **Senha para abrir** (reusa `pdf_seguranca`, que já existe e já tem o critério certo, o de tentar
    abrir com senha vazia, e não a busca da string `/Encrypt` que reprovou a CTPS da Silvia).
 3. **Conteúdo ativo** (`portal_conteudo_ativo`, exigência 6). Vem ANTES da contagem de páginas de
    propósito: se o arquivo executa, não interessa quantas páginas ele tem.
 4. **Páginas**, para PDF, e **dimensão**, para imagem, medida no cabeçalho sem decodificar.

O QUE ELA NÃO FAZ: não chama o Vertex. A chamada ao modelo é rede, tem retentativa e taxonomia de
erro próprias (`vertex_erros`) e fica no processo pai, onde vive a credencial. Mandar a credencial
para o processo que abre bytes hostis desfaria metade do motivo de o filho existir.

§A.6: nenhum campo extraído, nenhum trecho do documento e nenhum nome de arquivo aparecem no
veredicto. O que sai são rótulos e números.
"""

from __future__ import annotations

from app.pdf_seguranca import MOTIVO_PDF_PROTEGIDO, pdf_exige_senha_para_abrir
from app.portal_conteudo_ativo import MOTIVO_CONTEUDO_ATIVO, conteudo_ativo_no_pdf
from app.portal_limites import contar_paginas_pdf, dimensao_da_imagem, tipo_por_conteudo

__all__ = ["inspecionar", "MOTIVOS"]

# Motivo por recusa. Texto de tela: diz o que a pessoa tem de fazer, sem jargão e sem travessão
# (§A.11). Nenhum deles carrega PII.
MOTIVOS: dict[str, str] = {
    "FORMATO": (
        "Formato de arquivo não aceito. Enviar o documento em PDF, JPEG ou PNG."
    ),
    "PDF_PROTEGIDO": MOTIVO_PDF_PROTEGIDO,
    "CONTEUDO_ATIVO": MOTIVO_CONTEUDO_ATIVO,
    "PDF_ILEGIVEL": (
        "Não foi possível abrir o PDF enviado. Reenviar o arquivo ou enviar uma foto do documento."
    ),
    "PAGINAS": (
        "Documento com páginas demais. Enviar apenas as páginas do documento pedido."
    ),
    "IMAGEM_ILEGIVEL": (
        "Não foi possível ler a imagem enviada. Tirar a foto de novo ou enviar em PDF."
    ),
    "DIMENSAO": (
        "Imagem grande demais. Reduzir a resolução da foto e enviar de novo."
    ),
}


def inspecionar(
    conteudo: bytes,
    *,
    paginas_max: int,
    lado_max: int,
    megapixels_max: float,
) -> dict:
    """Veredicto sobre os bytes. `{"ok": bool, "recusa": str|None, "motivo": str, ...metadados}`.

    Recusa NUNCA é exceção: o candidato precisa de uma frase acionável na tela, e o backend precisa
    distinguir "o arquivo não serve" de "o leitor quebrou". Exceção fica reservada para falha nossa.
    """
    mime = tipo_por_conteudo(conteudo)
    if mime is None:
        return _recusa("FORMATO")

    if mime == "application/pdf":
        if pdf_exige_senha_para_abrir(conteudo):
            return _recusa("PDF_PROTEGIDO", mime=mime)
        ativos = conteudo_ativo_no_pdf(conteudo)
        if ativos:
            return _recusa("CONTEUDO_ATIVO", mime=mime, conteudo_ativo=ativos)
        paginas = contar_paginas_pdf(conteudo)
        if paginas is None:
            return _recusa("PDF_ILEGIVEL", mime=mime)
        if paginas > paginas_max:
            return _recusa("PAGINAS", mime=mime, paginas=paginas)
        return _aceito(mime=mime, paginas=paginas)

    dimensao = dimensao_da_imagem(conteudo, mime)
    if dimensao is None:
        # Cabeçalho ilegível NÃO é passe livre: sem saber a dimensão, não entregamos ao motor.
        return _recusa("IMAGEM_ILEGIVEL", mime=mime)
    largura, altura = dimensao
    if largura <= 0 or altura <= 0:
        return _recusa("IMAGEM_ILEGIVEL", mime=mime)
    megapixels = (largura * altura) / 1_000_000
    if largura > lado_max or altura > lado_max or megapixels > megapixels_max:
        return _recusa("DIMENSAO", mime=mime, largura=largura, altura=altura)
    return _aceito(mime=mime, largura=largura, altura=altura)


def _recusa(codigo: str, **extras) -> dict:
    return {"ok": False, "recusa": codigo, "motivo": MOTIVOS[codigo], **extras}


def _aceito(**extras) -> dict:
    return {"ok": True, "recusa": None, "motivo": "", **extras}
