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

import hashlib
from datetime import UTC, datetime
from functools import lru_cache

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
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


def motivo_http(exc: HttpError) -> str:
    """Código curto do erro do Drive (`reason`), para log e mensagem. Sem PII.

    O corpo do erro do Google traz `errors[].reason` (ex.: `parentNotAFolder`,
    `storageQuotaExceeded`, `insufficientFilePermissions`), que é o que distingue "a árvore está
    errada" de "acabou a cota" de "a service account não tem acesso". Sem isso o backend só enxerga
    "HTTP 500" e ninguém sabe o que fazer. Nunca inclui nome de arquivo nem de pessoa.
    """
    try:
        detalhes = exc.error_details  # type: ignore[attr-defined]
        if isinstance(detalhes, list) and detalhes:
            primeiro = detalhes[0]
            if isinstance(primeiro, dict) and primeiro.get("reason"):
                return str(primeiro["reason"])
    except Exception:  # noqa: BLE001 - diagnóstico nunca pode derrubar o fluxo
        pass
    status_code = getattr(getattr(exc, "resp", None), "status", "?")
    return f"HTTP {status_code}"


def descricao_de_criacao(agora: datetime | None = None) -> str:
    """Texto gravado na DESCRIÇÃO da pasta criada pelo sistema (decisão do diretor).

    POR QUE NA DESCRIÇÃO, e não no nome. O Drive não deixa o AUTOR ser diferente de quem autenticou,
    então "foi o sistema que criou" precisa ser gravado por nós, em algum campo. O NOME está fora de
    questão por duas razões, e a segunda é técnica: o diretor decidiu que o nome fica como está, e o
    nome é a CHAVE do reaproveitamento (`buscar_ou_criar_pasta` procura por nome antes de criar).
    Mexer nele reintroduziria exatamente a duplicação de pasta que acabou de ser fechada.

    Vale só para pasta NOVA: reaproveitar pasta existente não reescreve descrição de ninguém, e nada
    é marcado retroativamente. §A.6: o texto não tem nome de pessoa nem qualquer dado do candidato.
    """
    d = agora or datetime.now(UTC)
    return f"Criada automaticamente pelo EA Automatic em {d.strftime('%d/%m/%Y')}."


def _pastas_com_nome(service, nome: str, parent_id: str) -> list[dict]:
    """Pastas com aquele NOME exato sob `parent_id`, mais antiga primeiro. Nunca inclui lixeira."""
    query = (
        f"name = '{_escapar(nome)}' and mimeType = '{_FOLDER_MIME}' "
        f"and '{parent_id}' in parents and trashed = false"
    )
    res = (
        service.files()
        .list(
            q=query,
            fields="files(id,createdTime)",
            spaces="drive",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            orderBy="createdTime",
        )
        .execute()
    )
    return res.get("files", [])


def buscar_ou_criar_pasta(service, nome: str, parent_id: str) -> tuple[str, bool]:
    """Id da pasta `nome` sob `parent_id`, criando só se não existir. Devolve (id, ja_existia).

    CHECAR ANTES DE CRIAR (regra do diretor, OST do Drive). Duas garantias, e a segunda é nova:

    1. **Reuso por nome.** Se já existe pasta com aquele nome no destino, ela é REUTILIZADA. O
       `ja_existia` sobe até a tela, para o consultor saber que o prontuário não nasceu agora.

    2. **Desempate determinístico quando já há duplicata.** O acervo real tem pastas de mesmo nome
       criadas por corrida (dois arquivamentos simultâneos: os dois consultaram, os dois não acharam
       nada, os dois criaram). Antes o código pegava a primeira que o Drive devolvesse, e a ordem do
       Drive não é estável, então execuções diferentes podiam gravar em pastas diferentes. Agora a
       ordenação é por `createdTime` e vence sempre a MAIS ANTIGA: todo mundo converge para a mesma
       pasta, e a duplicata remanescente para de receber arquivo novo.

    Também relê a listagem DEPOIS de criar, fechando a janela da corrida: se outro processo criou a
    mesma pasta no meio do caminho, os dois passam a usar a mais antiga.

    NADA é apagado aqui (contrato do módulo, §A.6). Isto é PREVENÇÃO: impede o duplicado de nascer,
    não remove o que já existe.
    """
    existentes = _pastas_com_nome(service, nome, parent_id)
    if existentes:
        return existentes[0]["id"], True

    criada = (
        service.files()
        .create(
            body={
                "name": nome,
                "mimeType": _FOLDER_MIME,
                "parents": [parent_id],
                # Marca de origem: só na CRIAÇÃO (ver `descricao_de_criacao`).
                "description": descricao_de_criacao(),
            },
            fields="id",
            supportsAllDrives=True,
        )
        .execute()
    )
    # Releitura pós-criação: se houve corrida, converge para a mais antiga (que pode não ser a nossa).
    apos = _pastas_com_nome(service, nome, parent_id)
    if len(apos) > 1:
        return apos[0]["id"], False
    return criada["id"], False


def md5_do_conteudo(conteudo: bytes) -> str:
    """MD5 do binário local, no MESMO formato do `md5Checksum` que o Drive devolve (hex minúsculo).

    É o critério de "mesmo arquivo" adotado: CONTEÚDO, não nome. Nome não serve, porque o mesmo
    documento chega com nomes diferentes (o acervo real tem `RG.pdf` e `RG (2).pdf` com bytes
    idênticos) e porque o EA renomeia tudo para `{Tipo}_{Nome}`, o que faria duas versões DIFERENTES
    do mesmo tipo colidirem por nome e uma delas nunca subir.
    """
    return hashlib.md5(conteudo, usedforsecurity=False).hexdigest()


def md5_existentes(service, parent_id: str) -> set[str]:
    """Conjunto de md5 dos arquivos já presentes na pasta. Uma consulta por pasta, não por arquivo.

    O Drive calcula `md5Checksum` para arquivo binário comum (é o nosso caso: PDF, JPG, PNG).
    Item sem checksum (atalho, arquivo nativo do Google) simplesmente não entra no conjunto, então
    nunca bloqueia um upload por engano.
    """
    achados: set[str] = set()
    token = None
    while True:
        res = (
            service.files()
            .list(
                q=f"'{parent_id}' in parents and trashed = false",
                fields="nextPageToken,files(md5Checksum)",
                spaces="drive",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageSize=200,
                pageToken=token,
            )
            .execute()
        )
        for f in res.get("files", []):
            if f.get("md5Checksum"):
                achados.add(f["md5Checksum"])
        token = res.get("nextPageToken")
        if not token:
            return achados


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


def readiness_drive() -> dict:
    """CAMINHO REAL do Drive (tela de diagnóstico, Bloco 3): confirma que a credencial EM USO
    (admin.soulan@ via delegação) alcança o Drive, com um about.get (leitura, sem escrever). Prova
    auth + acesso, não só que o processo subiu. Nunca levanta.
    """
    try:
        svc = get_drive_service()
        about = svc.about().get(fields="user(emailAddress),storageQuota(limit)").execute()
        email = (about.get("user") or {}).get("emailAddress")
        return {"ok": True, "detalhe": f"Drive acessível como conta institucional", "identidade": email, "erro": None}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detalhe": "falha ao acessar o Drive", "identidade": None, "erro": type(exc).__name__}


def pasta_web_link(service, folder_id: str) -> str:
    res = (
        service.files()
        .get(fileId=folder_id, fields="webViewLink", supportsAllDrives=True)
        .execute()
    )
    return res.get("webViewLink", "")
