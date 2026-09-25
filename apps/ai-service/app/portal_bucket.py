"""Leitura SOMENTE LEITURA, EM MEMÓRIA, do bucket de ENTRADA do Portal do Candidato.

O CAMINHO, aprovado em docs/DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md (seções 3 e 4): o celular sobe o
arquivo UMA VEZ, direto para o bucket do Google, e só depois o backend pede a este serviço que leia
o objeto. GRAVA PRIMEIRO, LÊ DEPOIS. Ler primeiro deixaria campos na tela de um arquivo que não
subiu, que é entrega falsa e silenciosa, o mesmo padrão de dano da §A.33; gravar primeiro, no pior
caso, dá digitação manual. Por isso a leitura aqui também é a CONFIRMAÇÃO DE CHEGADA: o metadado do
objeto é a prova, e a palavra do navegador não vale nada.

O MOLDE É O `app/gcs.py` NA FORMA, e a diferença é justamente na credencial: o `gcs.py` usa a
credencial Google UNIFICADA do Drive e do Vertex (§A.5), e este módulo NÃO a usa, de propósito. Ele
carrega uma conta DEDICADA, com leitura só neste bucket, sem nenhum papel em Drive e sem nenhum papel
em Vertex. É a exigência 4 da auditoria (docs/PARECER-SEGURANCA-PORTAL-CONSTRUIDO.md) e a condição VS3
da troca: quem abre arquivo que veio da internet não pode segurar a chave do prontuário. O que se
reusa do molde é a forma: escopo SOMENTE LEITURA e acesso cross-project concedido por IAM no próprio
bucket. NÃO reusar `gcs.py` aqui, em hipótese nenhuma. O que muda é o que NÃO está aqui: este módulo não importa a
staging, nem por engano. Nenhum caminho de código do leitor do Portal alcança `escrever_staging`,
e a ausência do import é a primeira tranca disso.

DUAS TRANCAS DE TAMANHO, NESTA ORDEM: o metadado é conferido ANTES de o primeiro byte ser baixado
(objeto grande é recusado sem custo nenhum de rede), e o download é medido por orçamento de bytes
(`portal_fluxo`), porque metadado é declaração e a medida tem de ser do que entrou de fato.

§A.6: o nome do objeto é OPACO por construção (derivado com pepper mais um sorteio, do lado do
backend), e NÃO carrega nome nem CPF. Ainda assim ele nunca é logado nem devolvido, porque nome de
objeto viaja para o registro de acesso do Google e porque a régua é de minimização, não de confiança.
O conteúdo transita só em memória, nunca vai ao disco, nunca vai ao banco, nunca vai ao log.
"""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from functools import lru_cache

from google.api_core import exceptions as gexc
from google.cloud import storage
from google.oauth2 import service_account

from app.config import get_settings
from app.portal_fluxo import ler_com_orcamento

__all__ = ["MetadadoObjeto", "ObjetoAusente", "obter_metadado", "baixar_em_memoria"]

# Somente leitura. O leitor NÃO escreve no bucket de entrada: quem assina credencial de escrita é o
# backend, com conta de serviço DEDICADA, e essa chave nunca chega a este serviço (exigência 1).
_GCS_SCOPES = ["https://www.googleapis.com/auth/devstorage.read_only"]

# Pedaço do download. Pequeno o bastante para o orçamento abortar cedo, grande o bastante para não
# transformar um arquivo de 10 MB em centenas de idas ao Google.
_PEDACO_BYTES = 256 * 1024


class ObjetoAusente(Exception):
    """O objeto não está no bucket. É o caso em que a confirmação de chegada FALHA."""


@dataclass(frozen=True)
class MetadadoObjeto:
    """O que o Google diz sobre o objeto. Serve de prova de chegada e de primeiro corte de tamanho.

    `tipo_declarado` é a DECLARAÇÃO de quem enviou e não decide nada: o tipo que vale sai dos magic
    bytes (`portal_limites.tipo_por_conteudo`). Ele viaja só para o backend poder corrigir o tipo do
    objeto depois da leitura (exigência 10).
    """

    tamanho: int
    tipo_declarado: str | None
    md5_hex: str | None
    criado_em: str | None
    geracao: int | None


@lru_cache
def get_storage_client() -> storage.Client:
    """Client do GCS pela service account, escopo somente leitura. Lazy, para o teste poder trocar."""
    settings = get_settings()
    creds = service_account.Credentials.from_service_account_file(
        str(settings.credentials_path), scopes=_GCS_SCOPES
    )
    return storage.Client(credentials=creds, project=creds.project_id)


def obter_metadado(bucket: str, objeto: str) -> MetadadoObjeto:
    """Metadado do objeto, SEM baixar um byte. `ObjetoAusente` quando ele não chegou."""
    blob = get_storage_client().bucket(bucket).get_blob(objeto)
    if blob is None:
        raise ObjetoAusente()
    md5_hex: str | None = None
    if blob.md5_hash:
        try:
            md5_hex = binascii.hexlify(base64.b64decode(blob.md5_hash)).decode("ascii")
        except (binascii.Error, ValueError):
            md5_hex = None
    return MetadadoObjeto(
        tamanho=int(blob.size or 0),
        tipo_declarado=blob.content_type,
        md5_hex=md5_hex,
        criado_em=blob.time_created.isoformat() if blob.time_created else None,
        geracao=int(blob.generation) if blob.generation else None,
    )


def baixar_em_memoria(bucket: str, objeto: str, *, maximo_bytes: int) -> bytes:
    """Baixa o objeto EM MEMÓRIA, por pedaços, sob orçamento de bytes. Nunca escreve em disco.

    `OrcamentoEstourado` sobe para o chamador quando o objeto é maior do que o declarado no metadado,
    que é o caso em que a declaração mentiu. `ObjetoAusente` quando ele sumiu entre o metadado e a
    leitura (a janela existe, e sumir é resposta válida: a chegada não se confirmou).
    """
    blob = get_storage_client().bucket(bucket).blob(objeto)
    try:
        with blob.open("rb", chunk_size=_PEDACO_BYTES) as fluxo:
            return ler_com_orcamento(iter(lambda: fluxo.read(_PEDACO_BYTES), b""), maximo_bytes)
    except gexc.NotFound as exc:
        raise ObjetoAusente() from exc
