"""GUARDA DE CONTEÚDO ATIVO: PDF que EXECUTA ao abrir nunca é aceito pelo Portal (exigência 6).

POR QUE ESTE ARQUIVO EXISTE. A auditoria adversarial do Portal do Candidato (§A.38) apontou uma
lacuna REAL, e não de refinamento: o sistema inteiro nunca olhou se um PDF carrega ação executável.
A varredura confirmou zero ocorrência de `/JavaScript`, `/OpenAction` ou `/Launch` em qualquer
verificação do backend ou do ai-service. Até aqui isso era tolerável porque todo arquivo vinha de um
consultor autenticado; no Portal quem escolhe o arquivo é uma pessoa de fora, que não tem crachá.

O MOLDE É O DA §A.33, e é deliberado: `domain/contrato-assinado.ts` prova a assinatura procurando
`/ByteRange` e `/Name(Clicksign)` na estrutura do PDF, não no texto da página. Aqui o alvo muda (as
marcas de AÇÃO e de conteúdo EMBUTIDO, em vez das de assinatura), o método é o mesmo, e pelo mesmo
motivo: estrutura não se exibe nem se perde por acidente.

DUAS VARREDURAS, E CADA UMA COBRE O BURACO DA OUTRA:
 1. **Marcas cruas**, byte a byte. Pega o PDF trivial e não depende de parser nenhum, então funciona
    inclusive no arquivo malformado que faria o parser desistir.
 2. **Catálogo pelo pypdf**. O PDF moderno guarda objetos dentro de `/ObjStm` COMPRIMIDOS, e ali a
    marca crua não aparece: `/OpenAction` some do buffer e reaparece só depois de descomprimir. Sem
    esta segunda passada, esconder a ação seria questão de salvar o arquivo com compressão.

REGRA DE OURO, E ELA É O OPOSTO DA DO `pdf_seguranca.py`: na dúvida, RECUSAR. Lá o custo do erro é
reprovar a CTPS de alguém; aqui o custo do erro é abrir um arquivo hostil. Erro de parse na segunda
varredura não vira recusa sozinho (o arquivo seria ilegível de todo jeito e cai no limite de páginas),
mas nenhuma marca encontrada é jamais ignorada.

§A.6: função pura sobre bytes. Não loga, não persiste, não toca CPF, nome nem URL. O que sai é a
lista dos RÓTULOS das marcas encontradas, nunca um trecho do documento.
"""

from __future__ import annotations

import re
from io import BytesIO

from pypdf import PdfReader

__all__ = ["conteudo_ativo_no_pdf", "MOTIVO_CONTEUDO_ATIVO"]

MOTIVO_CONTEUDO_ATIVO = (
    "Documento com conteúdo executável ou arquivo embutido. Reenviar o documento como PDF simples, "
    "ou tirar uma foto legível dele."
)

# Nome do PDF seguido de um DELIMITADOR do formato. Sem a borda, `/JS` casaria dentro de `/JSomething`
# e a guarda viraria fonte de recusa falsa.
_BORDA = r"(?=[\s/<>\[\]()%]|$)"

# Rótulo devolvido → nomes do PDF que o acionam. O rótulo é o que o backend mostra e o que entra em
# log; ele descreve a CAPACIDADE, não a marca, porque quem lê o relatório não lê PDF.
_MARCAS: dict[str, tuple[str, ...]] = {
    "javascript": ("JavaScript", "JS"),
    "acao_ao_abrir": ("OpenAction",),
    "acao_automatica": ("AA",),
    "executa_programa": ("Launch",),
    "arquivo_embutido": ("EmbeddedFile", "EmbeddedFiles"),
    "formulario_dinamico": ("XFA",),
    "midia_ativa": ("RichMedia", "Movie", "Sound"),
    "envia_dados": ("SubmitForm", "ImportData"),
    "abre_documento_externo": ("GoToR",),
}

_REGEX: dict[str, re.Pattern[bytes]] = {
    rotulo: re.compile(
        rb"/(?:" + b"|".join(re.escape(n.encode("ascii")) for n in nomes) + rb")" + _BORDA.encode(),
    )
    for rotulo, nomes in _MARCAS.items()
}

# Onde a segunda varredura procura, já descomprimido pelo pypdf: a chave no catálogo → o rótulo.
_CHAVES_CATALOGO: tuple[tuple[str, str], ...] = (
    ("/OpenAction", "acao_ao_abrir"),
    ("/AA", "acao_automatica"),
    ("/JavaScript", "javascript"),
    ("/EmbeddedFiles", "arquivo_embutido"),
    ("/XFA", "formulario_dinamico"),
)


def conteudo_ativo_no_pdf(conteudo: bytes) -> list[str]:
    """Rótulos das capacidades ativas encontradas no PDF. Lista VAZIA = nada executável achado.

    Só faz sentido para PDF: outro formato devolve lista vazia, porque JPEG e PNG não executam
    (o tamanho e a dimensão deles são tratados no `portal_limites`).
    """
    if len(conteudo) < 5 or conteudo[:4] != b"%PDF":
        return []
    achados: set[str] = set()
    for rotulo, regex in _REGEX.items():
        if regex.search(conteudo):
            achados.add(rotulo)
    achados.update(_varrer_catalogo(conteudo))
    return sorted(achados)


def _varrer_catalogo(conteudo: bytes) -> set[str]:
    """Segunda passada, já DESCOMPRIMIDA: o que a marca crua não vê dentro de `/ObjStm`.

    Olha o catálogo (`/Root`), o dicionário de nomes e o formulário. Erro de parse devolve vazio de
    propósito: a primeira passada já rodou, e um PDF que o pypdf não abre não vai passar pelos outros
    limites nem virar auditoria útil.
    """
    achados: set[str] = set()
    try:
        leitor = PdfReader(BytesIO(conteudo))
        if leitor.is_encrypted:
            # Cifrado só por permissões: sem a senha do dono não dá para descomprimir o catálogo.
            # Não é recusa por si (quem recusa senha é o pdf_seguranca), é ausência de segunda passada.
            return achados
        raiz = leitor.trailer.get("/Root")
        raiz = raiz.get_object() if hasattr(raiz, "get_object") else raiz
        if not hasattr(raiz, "get"):
            return achados
        for chave, rotulo in _CHAVES_CATALOGO:
            if chave in raiz:
                achados.add(rotulo)
        nomes = raiz.get("/Names")
        nomes = nomes.get_object() if hasattr(nomes, "get_object") else nomes
        if hasattr(nomes, "get"):
            for chave, rotulo in _CHAVES_CATALOGO:
                if chave in nomes:
                    achados.add(rotulo)
        formulario = raiz.get("/AcroForm")
        formulario = formulario.get_object() if hasattr(formulario, "get_object") else formulario
        if hasattr(formulario, "get") and "/XFA" in formulario:
            achados.add("formulario_dinamico")
    except Exception:  # noqa: BLE001 - PDF hostil ou malformado não derruba a guarda
        return achados
    return achados
