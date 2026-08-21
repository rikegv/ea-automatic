"""Leitura SOMENTE LEITURA de um bucket do Google Cloud Storage (§A.17, coleta de VT).

O app externo (Firebase) grava os PDFs de VT num bucket do GCS (projeto vt-online-soulan). O EA
apenas LÊ esse bucket: lista os objetos e baixa um objeto para a staging efêmera. Nada é criado,
movido, renomeado ou apagado.

CREDENCIAL: a MESMA service account do Drive/Vertex (settings.credentials_path), a identidade
ea-automatic-sa, acessando o GCS DIRETAMENTE. Sem delegação de domínio: o GCS não usa
with_subject (isso é do Drive). O bucket vive em outro projeto (vt-online-soulan), mas o acesso é
concedido cross-project por IAM (roles/storage.objectViewer) no próprio bucket, então alcançar um
bucket nomeado funciona mesmo sem que o projeto da credencial coincida.

§A.6: o nome do objeto (carrega nome do candidato + CPF) e o CPF NUNCA são logados aqui.
"""

from __future__ import annotations

import base64
import binascii
from functools import lru_cache

from google.cloud import storage
from google.oauth2 import service_account

from app.config import get_settings
from app.staging import escrever_staging

# Somente leitura: só listar objetos e baixar bytes. Nenhum escopo de escrita.
_GCS_SCOPES = ["https://www.googleapis.com/auth/devstorage.read_only"]


@lru_cache
def get_storage_client() -> storage.Client:
    """Client do GCS a partir da MESMA service account do Drive/Vertex, escopo somente leitura.

    Acesso DIRETO ao GCS (sem with_subject/delegação, que é padrão de Drive). O projeto passado é o
    da própria credencial; o bucket alvo pode estar em outro projeto, resolvido por IAM no bucket.
    """
    settings = get_settings()
    creds = service_account.Credentials.from_service_account_file(
        str(settings.credentials_path), scopes=_GCS_SCOPES
    )
    return storage.Client(credentials=creds, project=creds.project_id)


def listar_objetos(bucket: str) -> list[dict]:
    """Lista os objetos do bucket. SOMENTE LEITURA.

    Devolve, por objeto: `{"name", "md5", "contentType", "size"}`. O `md5` sai em HEX: o GCS
    devolve `md5_hash` em base64, então decodificamos base64 e re-codificamos em hex. Objeto sem
    md5 (raro, objetos compostos) fica com `md5=None`. O `name` é consumido só DENTRO do ai-service
    (extração do CPF) e nunca sai deste serviço nem é logado (§A.6).
    """
    client = get_storage_client()
    itens: list[dict] = []
    for blob in client.list_blobs(bucket):
        md5_hex: str | None = None
        if blob.md5_hash:
            md5_hex = binascii.hexlify(base64.b64decode(blob.md5_hash)).decode("ascii")
        itens.append(
            {
                "name": blob.name,
                "md5": md5_hex,
                "contentType": blob.content_type,
                "size": blob.size,
            }
        )
    return itens


def baixar_objeto_para_staging(bucket: str, name: str) -> str:
    """Baixa o binário do objeto para a staging efêmera. SOMENTE LEITURA.

    Devolve o `stagingPath` (compatível com `ler_staging` / `ArquivoIn.stagingPath`). O conteúdo
    transita em memória e vai para a staging; §A.6: nem o conteúdo nem o nome do objeto são logados.
    """
    client = get_storage_client()
    conteudo = client.bucket(bucket).blob(name).download_as_bytes()
    return escrever_staging(conteudo, ".pdf")

def ler_objeto_texto(bucket: str, name: str) -> str | None:
    """Lê UM objeto pequeno como texto. SOMENTE LEITURA. `None` quando o objeto não existe.

    NÃO PASSA PELA STAGING, ao contrário do PDF, e a diferença é proposital: a staging existe para o
    BINÁRIO do documento, que é grande, é efêmero e tem TTL (§A.6). O JSON irmão do formulário é um
    punhado de campos que vão direto para o banco; escrevê-lo em disco só criaria mais uma cópia de
    dado pessoal para expurgar depois.

    Objeto ausente é ESTADO NORMAL, não erro: todo formulário anterior ao JSON irmão continua sendo
    só PDF, e o arquivamento desses segue funcionando sem os campos estruturados.
    """
    client = get_storage_client()
    blob = client.bucket(bucket).blob(name)
    if not blob.exists():
        return None
    return blob.download_as_bytes().decode("utf-8", errors="replace")


def listar_objetos_com_nome(bucket: str) -> list[dict]:
    """Como `listar_objetos`, mas DEVOLVE o nome do objeto e a hora em que ele chegou.

    EXISTE SÓ PARA O DIAGNÓSTICO DO ÓRFÃO, e o nome é o ponto: quando um formulário não casa com
    nenhuma admissão, o único jeito de saber DE QUEM ele é está no nome do objeto (NOME + CPF), que
    é justamente o que o resto desta frente nunca deixa sair daqui.

    §A.6, e a diferença é o que torna isto aceitável: o nome é LIDO NA HORA e devolvido para uma tela
    autenticada, e NÃO é persistido em lugar nenhum. Guardar nome e CPF de quem não está na base
    seria criar cadastro de alguém que o sistema não conhece; mostrar na tela de quem já tem acesso
    ao bucket não acrescenta exposição nenhuma. Nada aqui é logado.
    """
    client = get_storage_client()
    itens: list[dict] = []
    for blob in client.list_blobs(bucket):
        md5_hex: str | None = None
        if blob.md5_hash:
            md5_hex = binascii.hexlify(base64.b64decode(blob.md5_hash)).decode("ascii")
        itens.append(
            {
                "name": blob.name,
                "md5": md5_hex,
                "contentType": blob.content_type,
                "criadoEm": blob.time_created.isoformat() if blob.time_created else None,
            }
        )
    return itens
