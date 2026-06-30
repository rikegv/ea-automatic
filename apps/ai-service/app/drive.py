"""Arquivamento no Google Drive (INT-2). Service account; suporta Shared Drives.

Cria a pasta do funcionário sob `parentFolderId`, as 4 subpastas sob demanda e sobe cada arquivo
renomeado. §A.6: nomes de pessoa NUNCA são logados; o binário é descartado pelo chamador.

CONTRATO DE OPERAÇÕES (resposta ao admin de Workspace, Fernando — preocupação com deleção
acidental). Este módulo SÓ executa operações ADITIVAS/somente-leitura sobre o Drive:
  1. VERIFICAR se uma pasta existe   → files().list   (somente leitura)
  2. CRIAR pasta                     → files().create (aditivo)
  3. FAZER UPLOAD de arquivo         → files().create (aditivo)
  (+ files().get apenas para ler o `webViewLink` da pasta — somente leitura)
É PROIBIDO introduzir qualquer operação destrutiva/mutante de itens existentes —
files().delete, files().update, trash/untrash, move (alterar `parents`), rename ou
permissions(). Nada disso existe aqui e qualquer adição deve ser vetada na revisão (§A.6).
"""

from __future__ import annotations

from functools import lru_cache

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload

from app.config import get_settings

_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]
_FOLDER_MIME = "application/vnd.google-apps.folder"

# Espelha DRIVE_SUBPASTA → nome de exibição no Drive (acentuado, como o RH espera).
SUBPASTA_NOME: dict[str, str] = {
    "ASO": "ASO",
    "ADMISSAO": "ADMISSÃO",
    "BENEFICIOS": "BENEFÍCIOS",
    "DOCUMENTOS_PESSOAIS": "DOCUMENTOS PESSOAIS",
}


@lru_cache
def get_drive_service():  # noqa: ANN201 - tipo do client é dinâmico
    settings = get_settings()
    creds = service_account.Credentials.from_service_account_file(
        str(settings.credentials_path), scopes=_DRIVE_SCOPES
    )
    # Delegação de domínio (INT-2): necessária para upload em My Drive compartilhado, pois a SA
    # pura não tem quota de armazenamento. Em Shared Drive a SA pura basta.
    if settings.drive_delegated_subject:
        creds = creds.with_subject(settings.drive_delegated_subject)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _escapar(nome: str) -> str:
    """Escapa aspas simples para a query do Drive."""
    return nome.replace("\\", "\\\\").replace("'", "\\'")


def buscar_ou_criar_pasta(service, nome: str, parent_id: str) -> str:
    """Devolve o id de uma subpasta `nome` sob `parent_id`, criando se não existir."""
    query = (
        f"name = '{_escapar(nome)}' and mimeType = '{_FOLDER_MIME}' "
        f"and '{parent_id}' in parents and trashed = false"
    )
    res = (
        service.files()
        .list(
            q=query,
            fields="files(id)",
            spaces="drive",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    existentes = res.get("files", [])
    if existentes:
        return existentes[0]["id"]
    criada = (
        service.files()
        .create(
            body={"name": nome, "mimeType": _FOLDER_MIME, "parents": [parent_id]},
            fields="id",
            supportsAllDrives=True,
        )
        .execute()
    )
    return criada["id"]


def _mime_de(nome: str) -> str:
    n = nome.lower()
    if n.endswith(".pdf"):
        return "application/pdf"
    if n.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if n.endswith(".png"):
        return "image/png"
    if n.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def subir_arquivo(service, *, conteudo: bytes, nome_final: str, parent_id: str) -> None:
    media = MediaInMemoryUpload(conteudo, mimetype=_mime_de(nome_final), resumable=False)
    service.files().create(
        body={"name": nome_final, "parents": [parent_id]},
        media_body=media,
        fields="id",
        supportsAllDrives=True,
    ).execute()


def pasta_web_link(service, folder_id: str) -> str:
    res = (
        service.files()
        .get(fileId=folder_id, fields="webViewLink", supportsAllDrives=True)
        .execute()
    )
    return res.get("webViewLink", "")
