"""Leitura SOMENTE LEITURA da planilha viva do Drive, projetada em 4 colunas.

O QUE ESTE MODULO FAZ, e é tudo o que ele faz: exporta a planilha como CSV
(`GET /drive/v3/files/{id}/export?mimeType=text/csv`), acha as colunas pelo TEXTO do cabeçalho,
devolve o conteúdo cru dessas colunas e descarta o resto. Nada mais.

O QUE ELE NAO FAZ, de propósito:
  * NAO decide nada. Não normaliza, não casa código com cliente, não julga valor malformado, não
    conhece a família `SL...`. Quem decide é o backend, com teste puro. Aqui só sai texto, com
    `strip` de espaço, porque a planilha tem valores como `' 1587726'`.
  * NAO chama IA. Nenhuma linha desta planilha vai para o Vertex. O vizinho `routers/planilha.py`
    manda amostra de linhas para o Gemini; aquele desenho não se aplica aqui e não foi copiado.
  * NAO grava nada. Não escreve no disco, não cacheia arquivo, não persiste. O CSV existe só em
    memória, pelo tempo da chamada (§A.6).
  * NAO escreve no Drive. Só o verbo `export`, que é leitura. A proibição de operação mutante é
    travada por TESTE DE FONTE (`tests/test_planilha_viva_fonte.py`), não por lembrança (§A.33).

LISTA BRANCA POR NOME DE CABEÇALHO, NUNCA POR ÍNDICE. A planilha é editada por gente e tem 65
colunas, entre elas salário, consultor, recrutador e nome de candidato aprovado. Inserir uma coluna
no meio reordena as 65 posições, e um recorte por índice passaria a devolver salário e nome de
pessoa sem que nada falhasse. Então o recorte é por texto de cabeçalho e é FAIL-CLOSED: cabeçalho
esperado ausente, ou repetido, a leitura FALHA e não devolve o que achou.

§A.6: nenhum conteúdo de célula entra em log, em corpo de exceção ou em `detail` de resposta. O que
pode aparecer é contagem e RÓTULO de coluna (que é nome de campo, não dado de pessoa).
"""

from __future__ import annotations

import csv
import io
import logging
import re
import unicodedata
from typing import Literal

from google.auth.transport.requests import AuthorizedSession
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# Credencial da service account, com a delegação de domínio já aplicada. Reusada de propósito, para
# não haver uma segunda régua de credencial no serviço. SO O ESCOPO `auth/drive` ESTA AUTORIZADO
# nesta delegação: `drive.readonly`, `drive.file`, `drive.metadata.readonly` e `spreadsheets`
# devolvem `unauthorized_client`, e isso foi medido ao vivo nos quatro. Quem "arrumar" para o escopo
# de leitura por higiene quebra a leitura e vai achar que falta permissão.
from app.drive import _credenciais_drive

logger = logging.getLogger("ea.ai.planilha_viva")

ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive"
URL_EXPORT = "https://www.googleapis.com/drive/v3/files/{file_id}/export"

# Teto explícito de tamanho. A planilha medida em 01/10/2026 dá 1,9 MB em CSV (3.533 linhas, 65
# colunas); o teto é folga larga sobre isso e existe para o caso de a planilha crescer sem limite ou
# de o id apontar para outra coisa. O corte é feito DURANTE a leitura, por orçamento de bytes, e não
# depois: o que passa do teto nunca chega a existir inteiro em memória.
TETO_BYTES = 12 * 1024 * 1024
CHUNK_BYTES = 64 * 1024

# Timeout explícito (conexão, leitura). Sem ele a chamada herdaria o padrão do socket e uma
# indisponibilidade do Google prenderia a thread do pool.
TIMEOUT_S: tuple[float, float] = (10.0, 60.0)

# Id do Drive: alfanumérico com `-` e `_`. Validado antes de entrar na URL (o id vem do corpo da
# requisição e é interpolado no caminho).
_FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,200}$")

# A LISTA BRANCA. Campo devolvido -> rótulo esperado no cabeçalho da planilha.
COLUNAS_EXIGIDAS: dict[str, str] = {
    "cliente": "Cliente",
    "codigoVaga": "Código da vaga",
    "cargo": "Vaga",
    "status": "Status",
}

# O cabeçalho costuma ser a primeira linha, mas planilha de gente às vezes tem linha de título
# acima. Procuramos a primeira linha que contenha TODOS os rótulos esperados, nas primeiras poucas
# linhas. Nenhuma linha qualificada: a leitura falha.
MAX_LINHAS_CABECALHO = 10

FamiliaErro = Literal["ACESSO", "TAMANHO", "CABECALHO", "FORMATO", "ENTRADA"]


class ErroPlanilhaViva(Exception):
    """Falha de leitura, com família para o router traduzir em HTTP.

    `detalhe` é texto seguro, montado aqui, e nunca carrega conteúdo de célula nem mensagem do
    provedor (§A.6).
    """

    def __init__(self, familia: FamiliaErro, detalhe: str) -> None:
        super().__init__(f"{familia}: {detalhe}")
        self.familia: FamiliaErro = familia
        self.detalhe = detalhe


class _CamelModel(BaseModel):
    # Mesmo contrato de `schemas.py` (camelCase na rede), declarado aqui para esta frente não
    # escrever em arquivo compartilhado.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PlanilhaVivaRequest(_CamelModel):
    file_id: str = Field(description="Id do arquivo da planilha no Drive.")


class LinhaPlanilhaViva(_CamelModel):
    linha: int = Field(description="Número da linha no CSV exportado, 1 é o cabeçalho.")
    cliente: str
    codigo_vaga: str
    cargo: str
    status: str


class LeituraPlanilhaViva(_CamelModel):
    total_linhas: int = Field(description="Linhas de dados no CSV, depois do cabeçalho.")
    linhas_uteis: int = Field(description="Linhas devolvidas, as que têm algum dos 4 campos.")
    colunas: dict[str, str] = Field(description="Campo devolvido para rótulo achado no cabeçalho.")
    linhas: list[LinhaPlanilhaViva] = Field(default_factory=list)


def _normalizar(texto: str) -> str:
    """Compara cabeçalho sem acento, sem caixa e sem espaço sobrando.

    Isto não afrouxa a lista branca: `Vaga` e `Código da vaga` continuam distintos depois da
    normalização. O que ela absorve é `CLIENTE` por `Cliente` e espaço duplicado, que é o tipo de
    diferença que aparece quando uma pessoa reedita o cabeçalho.
    """
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )
    return re.sub(r"\s+", " ", sem_acento).strip().casefold()


def validar_file_id(file_id: str) -> str:
    limpo = (file_id or "").strip()
    if not _FILE_ID_RE.match(limpo):
        raise ErroPlanilhaViva("ENTRADA", "Identificador de planilha inválido.")
    return limpo


# NAO TROCAR PELO CLIENTE OFICIAL DE DISCOVERY ("simplificando" para `files().export_media()`).
# Esta escolha é o que faz o TETO DE BYTES ser um teto de verdade. O cliente de discovery roda sobre
# `httplib2`, que CARREGA O CORPO INTEIRO na memória antes de devolver a resposta: com ele, o teto só
# poderia ser medido DEPOIS de o arquivo inteiro já estar carregado, e teto que mede depois de
# carregar não é teto, é relatório. O `AuthorizedSession` (transporte `requests` do `google-auth`,
# já instalado, nada acrescentado ao `pyproject.toml` nem ao `uv.lock`) permite `stream=True`, e aí o
# orçamento de bytes aborta a leitura NO MEIO, antes de o excesso existir. O timeout explícito vem
# pelo mesmo caminho.
def _sessao() -> AuthorizedSession:
    creds = _credenciais_drive().with_scopes([ESCOPO_DRIVE])
    return AuthorizedSession(creds)


def exportar_csv(file_id: str, *, sessao: AuthorizedSession | None = None) -> str:
    """Exporta a planilha como CSV e devolve o TEXTO, só em memória.

    O export do Google devolve apenas a PRIMEIRA aba, o que normalmente é limitação e aqui não é: a
    planilha tem uma aba só (`GERAL 2026`). CSV foi escolhido sobre xlsx porque dá um terço do
    tamanho e não exige nenhuma biblioteca de planilha.
    """
    alvo = validar_file_id(file_id)
    ses = sessao or _sessao()
    try:
        resposta = ses.get(
            URL_EXPORT.format(file_id=alvo),
            params={"mimeType": "text/csv"},
            stream=True,
            timeout=TIMEOUT_S,
        )
    except Exception as erro:  # noqa: BLE001 - família, nunca a mensagem do provedor (§A.6)
        logger.warning("planilha viva: falha de transporte ao exportar (%s)", type(erro).__name__)
        raise ErroPlanilhaViva("ACESSO", "Não foi possível ler a planilha no Drive.") from erro

    with resposta:
        if resposta.status_code != 200:
            # Só o código HTTP vai para o log. O corpo do erro do Google não entra em log nem na
            # exceção: ele pode repetir conteúdo da requisição.
            logger.warning("planilha viva: export recusado, http %s", resposta.status_code)
            raise ErroPlanilhaViva("ACESSO", "Não foi possível ler a planilha no Drive.")

        total = 0
        partes: list[bytes] = []
        for pedaco in resposta.iter_content(chunk_size=CHUNK_BYTES):
            if not pedaco:
                continue
            total += len(pedaco)
            if total > TETO_BYTES:
                partes.clear()
                logger.warning("planilha viva: export acima do teto de %s bytes", TETO_BYTES)
                raise ErroPlanilhaViva("TAMANHO", "A planilha excedeu o tamanho máximo de leitura.")
            partes.append(pedaco)

    bruto = b"".join(partes)
    partes.clear()
    # `utf-8-sig` porque o export do Google vem com BOM. `replace` para um byte estranho não
    # derrubar a leitura inteira de 3.500 linhas.
    return bruto.decode("utf-8-sig", errors="replace")


def indices_das_colunas(cabecalho: list[str]) -> dict[str, int]:
    """Resolve campo para POSIÇÃO a partir do texto do cabeçalho. Fail-closed.

    Falha quando um rótulo esperado está ausente E quando ele aparece DUAS vezes: com rótulo
    repetido não há como saber qual coluna é a certa, e escolher uma delas poderia devolver outra
    coluna qualquer da planilha.
    """
    posicoes: dict[str, list[int]] = {}
    for i, bruto in enumerate(cabecalho):
        posicoes.setdefault(_normalizar(bruto), []).append(i)

    ausentes: list[str] = []
    repetidos: list[str] = []
    achados: dict[str, int] = {}
    for campo, rotulo in COLUNAS_EXIGIDAS.items():
        encontrados = posicoes.get(_normalizar(rotulo), [])
        if not encontrados:
            ausentes.append(rotulo)
        elif len(encontrados) > 1:
            repetidos.append(rotulo)
        else:
            achados[campo] = encontrados[0]

    if ausentes:
        raise ErroPlanilhaViva(
            "CABECALHO",
            "A planilha não tem as colunas esperadas: " + ", ".join(ausentes) + ".",
        )
    if repetidos:
        raise ErroPlanilhaViva(
            "CABECALHO",
            "A planilha tem coluna repetida no cabeçalho: " + ", ".join(repetidos) + ".",
        )
    return achados


def _achar_cabecalho(linhas: list[list[str]]) -> tuple[int, dict[str, int]]:
    ultimo: ErroPlanilhaViva | None = None
    for i, linha in enumerate(linhas[:MAX_LINHAS_CABECALHO]):
        try:
            return i, indices_das_colunas(linha)
        except ErroPlanilhaViva as erro:
            ultimo = erro
    if ultimo is not None:
        raise ultimo
    raise ErroPlanilhaViva("FORMATO", "A planilha está vazia.")


def projetar(csv_texto: str) -> LeituraPlanilhaViva:
    """Recorta as 4 colunas da lista branca e devolve o texto cru delas.

    Linha em que os quatro campos estão vazios não é devolvida: é linha sem conteúdo, não é decisão
    de negócio. Linha curta (a planilha nem sempre preenche até a última coluna) devolve vazio no
    campo que falta, em vez de estourar.
    """
    try:
        todas = list(csv.reader(io.StringIO(csv_texto, newline="")))
    except csv.Error as erro:
        raise ErroPlanilhaViva("FORMATO", "A planilha não está no formato esperado.") from erro

    if not todas:
        raise ErroPlanilhaViva("FORMATO", "A planilha está vazia.")

    pos_cabecalho, indices = _achar_cabecalho(todas)
    cabecalho = todas[pos_cabecalho]
    rotulos = {campo: cabecalho[i].strip() for campo, i in indices.items()}

    def valor(linha: list[str], campo: str) -> str:
        i = indices[campo]
        return linha[i].strip() if i < len(linha) else ""

    dados = todas[pos_cabecalho + 1 :]
    linhas: list[LinhaPlanilhaViva] = []
    for deslocamento, linha in enumerate(dados):
        campos = {campo: valor(linha, campo) for campo in indices}
        if not any(campos.values()):
            continue
        linhas.append(
            LinhaPlanilhaViva(
                # 1-based sobre o CSV inteiro, para o backend conseguir apontar a linha ao time.
                linha=pos_cabecalho + 2 + deslocamento,
                cliente=campos["cliente"],
                codigo_vaga=campos["codigoVaga"],
                cargo=campos["cargo"],
                status=campos["status"],
            )
        )

    return LeituraPlanilhaViva(
        total_linhas=len(dados),
        linhas_uteis=len(linhas),
        colunas=rotulos,
        linhas=linhas,
    )


def ler_planilha_viva(
    file_id: str, *, sessao: AuthorizedSession | None = None
) -> LeituraPlanilhaViva:
    texto = exportar_csv(file_id, sessao=sessao)
    try:
        leitura = projetar(texto)
    finally:
        # O CSV inteiro (1,9 MB de dado operacional, com salário e nome de pessoa nas colunas que
        # NAO atravessam a rede) deixa de ser referenciado aqui mesmo.
        del texto
    logger.info(
        "planilha viva lida: %s linhas de dados, %s úteis",
        leitura.total_linhas,
        leitura.linhas_uteis,
    )
    return leitura
