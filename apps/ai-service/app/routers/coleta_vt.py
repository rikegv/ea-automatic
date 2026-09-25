"""§A.17 (coleta de VT): leitura do bucket do GCS onde o app externo grava os PDFs de VT.

A fonte deixou de ser uma pasta do Drive e passou a ser um bucket do Google Cloud Storage: o app
externo (Firebase) escreve os PDFs no bucket, e o EA apenas LÊ. Duas operações SOMENTE LEITURA:
listar os objetos do bucket e baixar um objeto para a staging efêmera.

§A.6: o nome do objeto (nome do candidato + CPF) NUNCA sai daqui nem é logado; a resposta leva só
o CPF extraído no servidor.
"""

import json
import logging
import re

from fastapi import APIRouter, Depends

from app import gcs
from app.auth import require_internal_token
from app.drive import extrair_cpf_do_nome
from app.schemas import (
    BaixarColetaVtRequest,
    BaixarColetaVtResponse,
    DadosColetaVtRequest,
    DadosColetaVtResponse,
    ItemOrfaoVt,
    OrfaosColetaVtRequest,
    OrfaosColetaVtResponse,
    ItemColetaVt,
    ListarColetaVtRequest,
    ListarColetaVtResponse,
)

router = APIRouter(prefix="/coleta-vt", tags=["coleta-vt"])
logger = logging.getLogger("ea.ai.coleta_vt")


def _admissao_id_do_json(bucket: str, nome_pdf: str) -> str | None:
    """Lê o `admissaoId` do JSON irmão de um PDF de nome OPACO. §A.6: nada aqui é logado.

    O JSON irmão tem o MESMO nome do PDF com a extensão trocada. Objeto ausente, ilegível ou sem o
    campo devolve `None` (o arquivo fica sem identificação, e o backend o trata como órfão).
    """
    nome_json = re.sub(r"\.pdf$", "", nome_pdf, flags=re.IGNORECASE) + ".json"
    bruto = gcs.ler_objeto_texto(bucket, nome_json)
    if bruto is None:
        return None
    try:
        dados = json.loads(bruto)
    except json.JSONDecodeError:
        logger.warning("JSON irmão do VT ilegível ao resolver o handle; objeto fica sem identificação.")
        return None
    if not isinstance(dados, dict):
        return None
    valor = dados.get("admissaoId")
    return str(valor) if valor else None


def _resolver_handle(bucket: str, nome: str) -> tuple[str | None, str | None]:
    """DUAL-READ da transição do vazamento 2. Devolve `(cpf, admissaoId)`, IRMÃOS, no máximo um cheio.

    Ordem (o contrato): 1) nome no padrão ANTIGO (`NOME + 11 dígitos`) → CPF do nome (legado A e B);
    2) nome OPACO de PDF → baixa o JSON irmão, lê `admissaoId` (novo, classe C). O backend casa por
    presença: `if admissaoId` → admissão; `elif cpf` → CPF; senão → nome fora do padrão. O não-PDF
    opaco (o próprio JSON irmão) fica sem handle. §A.6: nem o nome, nem o CPF, nem o id vão a log.
    """
    cpf = extrair_cpf_do_nome(nome)
    if cpf:
        return cpf, None
    if nome.lower().endswith(".pdf"):
        admissao_id = _admissao_id_do_json(bucket, nome)
        if admissao_id:
            return None, admissao_id
    return None, None


@router.post("/listar", response_model=ListarColetaVtResponse, response_model_by_alias=True)
def coleta_vt_listar(
    req: ListarColetaVtRequest, _: None = Depends(require_internal_token)
) -> ListarColetaVtResponse:
    itens: list[ItemColetaVt] = []
    for obj in gcs.listar_objetos(req.bucket):
        cpf, admissao_id = _resolver_handle(req.bucket, obj.get("name") or "")
        itens.append(
            ItemColetaVt(
                id=obj["name"],
                md5=obj.get("md5"),
                mime_type=obj.get("contentType") or "application/octet-stream",
                cpf=cpf,
                admissao_id=admissao_id,
                eh_pdf=obj.get("contentType") == "application/pdf",
            )
        )
    return ListarColetaVtResponse(arquivos=itens)


@router.post("/baixar", response_model=BaixarColetaVtResponse, response_model_by_alias=True)
def coleta_vt_baixar(
    req: BaixarColetaVtRequest, _: None = Depends(require_internal_token)
) -> BaixarColetaVtResponse:
    staging_path = gcs.baixar_objeto_para_staging(req.bucket, req.id)
    return BaixarColetaVtResponse(staging_path=staging_path)


@router.post("/dados", response_model=DadosColetaVtResponse, response_model_by_alias=True)
def coleta_vt_dados(
    req: DadosColetaVtRequest, _: None = Depends(require_internal_token)
) -> DadosColetaVtResponse:
    """Campos estruturados do formulário, do JSON IRMÃO do PDF (mesmo nome, extensão .json).

    POR QUE O JSON VIAJA PELO BUCKET, e não por uma chamada do app ao EA: o app externo roda no
    Firebase e o EA é loopback atrás da VPN, inalcançável de fora. O bucket já é o transporte que
    funciona para o PDF; o JSON pega carona nele, sem abrir nenhuma porta de entrada no EA.

    O NOME DO JSON É DERIVADO AQUI, no servidor, a partir do nome do PDF. O backend manda o `id` que
    já conhece e nunca monta nome de objeto, que carrega o nome do candidato (§A.6).

    Objeto ausente devolve `encontrado=False`, não 404: é o estado normal de todo formulário anterior
    a esta frente, e o arquivamento do PDF não pode depender disso.
    """
    nome_json = re.sub(r"\.pdf$", "", req.id, flags=re.IGNORECASE) + ".json"
    bruto = gcs.ler_objeto_texto(req.bucket, nome_json)
    if bruto is None:
        return DadosColetaVtResponse(encontrado=False)
    try:
        dados = json.loads(bruto)
    except json.JSONDecodeError:
        # JSON corrompido não derruba o arquivamento do PDF: vira "não encontrado" e fica no log.
        logger.warning("JSON irmão do formulário de VT ilegível; seguindo só com o PDF.")
        return DadosColetaVtResponse(encontrado=False)
    if not isinstance(dados, dict):
        return DadosColetaVtResponse(encontrado=False)
    return DadosColetaVtResponse(encontrado=True, dados=dados)



@router.post("/orfaos", response_model=OrfaosColetaVtResponse, response_model_by_alias=True)
def coleta_vt_orfaos(
    req: OrfaosColetaVtRequest, _: None = Depends(require_internal_token)
) -> OrfaosColetaVtResponse:
    """Dono e data de chegada de cada objeto do bucket, para o diagnóstico do VT ÓRFÃO.

    POR QUE ESTA ROTA EXISTE, sendo que `/listar` já varre o mesmo bucket: `/listar` devolve só o
    CPF, porque o nome do objeto (NOME + CPF) não sai deste serviço em operação normal. Quando o
    formulário NÃO casa com admissão nenhuma, porém, o CPF sozinho não resolve nada: é justamente o
    caso em que ele não encontra ninguém. Sem o nome, o time olha um digest e não tem como agir.

    §A.6, e é o que torna isto aceitável: a leitura é NA HORA e o resultado NÃO é persistido em lugar
    nenhum, nem logado. Ele existe enquanto a tela está aberta. Guardar nome e CPF de quem não está
    na base seria criar cadastro de alguém que o sistema não conhece.

    Só JSON e PDF do VT vivem neste bucket, então a rota não filtra por tipo: o backend decide o que
    fazer com cada um a partir do md5 que ele já tem no ledger.
    """
    itens: list[ItemOrfaoVt] = []
    for obj in gcs.listar_objetos_com_nome(req.bucket):
        nome_obj = obj.get("name") or ""
        cpf, admissao_id = _resolver_handle(req.bucket, nome_obj)
        itens.append(
            ItemOrfaoVt(
                id=nome_obj,
                md5=obj.get("md5"),
                cpf=cpf,
                admissao_id=admissao_id,
                # Nome opaco não carrega nome de pessoa: `None`. Só o legado (com CPF) tem nome.
                nome=_nome_sem_cpf(nome_obj) if cpf else None,
                criado_em=obj.get("criadoEm"),
            )
        )
    return OrfaosColetaVtResponse(arquivos=itens)


def _nome_sem_cpf(objeto: str) -> str | None:
    """O nome da pessoa, tirado do nome do objeto ("NOME COMPLETO 12345678901.pdf").

    Remove a extensão e o CPF do fim. Nome fora do padrão devolve `None` em vez de devolver lixo:
    melhor a tela dizer "não identificado" do que exibir um fragmento sem sentido como se fosse
    gente.
    """
    base = re.sub(r"\.(pdf|json)$", "", objeto or "", flags=re.IGNORECASE).strip()
    sem_cpf = re.sub(r"[\s_-]*\d{11}$", "", base).strip()
    return sem_cpf or None
