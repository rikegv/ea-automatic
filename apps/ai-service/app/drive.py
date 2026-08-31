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
import logging
import re
import threading
from datetime import UTC, datetime
from functools import lru_cache

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaInMemoryUpload

from app.config import get_settings
from app.staging import escrever_staging

_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]
logger = logging.getLogger("ea.ai.drive")

_FOLDER_MIME = "application/vnd.google-apps.folder"

# Espelha DRIVE_SUBPASTA → nome de exibição no Drive (acentuado, como o RH espera).
SUBPASTA_NOME: dict[str, str] = {
    "ASO": "ASO",
    "ADMISSAO": "ADMISSÃO",
    "BENEFICIOS": "BENEFÍCIOS",
    "DOCUMENTOS_PESSOAIS": "DOCUMENTOS PESSOAIS",
}


# Cache do cliente do Drive POR THREAD. NÃO trocar por um cache global (era `@lru_cache`).
#
# O DEFEITO QUE ISTO CORRIGE, medido contra o Drive real. O cliente do Google carrega um `httplib2.Http`
# por baixo, e `httplib2` NÃO é thread-safe: ele guarda a conexão aberta no próprio objeto. Os endpoints
# deste serviço são síncronos, então o FastAPI os atende num POOL DE THREADS, e um cache global fazia
# todas elas dividirem a MESMA conexão. Dois arquivamentos ao mesmo tempo (o que acontece o tempo todo:
# dois consultores fechando régua, a reconciliação rodando junto, o ASO subindo em paralelo) embaralhavam
# a conversa com o Google e as threads perdedoras ficavam paradas até estourar o timeout padrão de 60s,
# vindo `TimeoutError`. Sonda com 4 threads: com o cache global, 3 das 4 falharam em 60,1s; com o cache
# por thread, 4 de 4 responderam em 1,4s. Foi o que deixou o caso de 17/08/2026 (13 arquivos JÁ no
# Drive) sem link gravado no EA, e o que produziu as 12 mortes na resolução da pasta desde 20/07.
#
# Custo: um cliente por thread do pool (dezenas, não milhares), cada um com sua conexão. Comportamento de
# uma chamada sozinha é idêntico ao de antes; o que muda é só deixar de compartilhar.
_local = threading.local()


def get_drive_service():  # noqa: ANN201 - tipo do client é dinâmico
    svc = getattr(_local, "service", None)
    if svc is None:
        svc = _construir_drive_service()
        _local.service = svc
    return svc


def renovar_drive_service():  # noqa: ANN201 - tipo do client é dinâmico
    """Joga fora o cliente desta thread e devolve um novo, com conexão limpa.

    Existe para a RETENTATIVA: o modo de falha que sobrou depois do cache por thread é a conexão que
    ficou inutilizável (o Google fechou do lado dele, a rede caiu no meio). Retentar com o MESMO
    cliente repetiria o erro; retentar com um novo é o que realmente muda a tentativa.
    """
    _local.service = _construir_drive_service()
    return _local.service


@lru_cache
def _credenciais_drive():  # noqa: ANN202 - tipo do client é dinâmico
    """Credencial da service account, lida do disco UMA vez (o arquivo não muda em execução).

    Separada do cliente de propósito: o que não pode ser compartilhado entre threads é a CONEXÃO
    (o `httplib2.Http` dentro do cliente), não a credencial, e reler o JSON a cada thread seria I/O
    de disco à toa. Cada cliente recebe uma CÓPIA (`with_scopes`), para não dividir o estado de
    refresh do token.
    """
    settings = get_settings()
    creds = service_account.Credentials.from_service_account_file(
        str(settings.credentials_path), scopes=_DRIVE_SCOPES
    )
    # Delegação de domínio (INT-2): necessária para upload em My Drive compartilhado, pois a SA
    # pura não tem quota de armazenamento. Em Shared Drive a SA pura basta.
    if settings.drive_delegated_subject:
        creds = creds.with_subject(settings.drive_delegated_subject)
    return creds


def _construir_drive_service():  # noqa: ANN202 - tipo do client é dinâmico
    creds = _credenciais_drive().with_scopes(_DRIVE_SCOPES)
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
    return f"Criada automaticamente pelo SOUOperações em {d.strftime('%d/%m/%Y')}."


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


def contar_arquivos(service, folder_id: str) -> int:
    """Quantos ARQUIVOS a pasta tem, contando dentro das subpastas. Sem PII (só ids e contagem).

    É a medida de "pasta mais completa" (OST da duplicação): o prontuário guarda os documentos DENTRO
    das subpastas (DOCUMENTOS PESSOAIS, ASO, ...), então contar só os filhos diretos diria 1 para uma
    pasta com quinze documentos e 1 para outra com um. A recursão tem profundidade 2 no acervo real.
    """
    total = 0
    pilha = [folder_id]
    visitados: set[str] = set()
    while pilha:
        atual = pilha.pop()
        if atual in visitados:
            continue
        visitados.add(atual)
        token = None
        while True:
            res = (
                service.files()
                .list(
                    q=f"'{_escapar(atual)}' in parents and trashed = false",
                    fields="nextPageToken, files(id,mimeType)",
                    spaces="drive",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    pageSize=1000,
                    pageToken=token,
                )
                .execute()
            )
            for f in res.get("files", []):
                if f.get("mimeType") == _FOLDER_MIME:
                    pilha.append(f["id"])
                else:
                    total += 1
            token = res.get("nextPageToken")
            if not token:
                break
    return total


def variantes_do_nome(nome: str) -> list[str]:
    """O mesmo nome nas duas convenções de separador usadas no acervo.

    O EA monta "NOME — Operação" (travessão). O acervo do processo ANTIGO usa "NOME - Operação"
    (hífen). São strings diferentes, então a busca por nome NUNCA casava a pasta legada da mesma
    pessoa e o EA criava uma segunda: é uma das duas causas de duplicação provadas no levantamento
    (a outra é a corrida). Procurar pelas duas formas fecha esse caminho. A busca do Drive é
    insensível à CAIXA, então não é preciso variar maiúscula/minúscula.
    """
    formas = {nome}
    if "—" in nome:
        formas.add(nome.replace("—", "-"))
    if "-" in nome and "—" not in nome:
        formas.add(nome.replace("-", "—"))
    return sorted(formas)


def abrir_pasta_por_id(service, folder_id: str) -> dict | None:
    """A pasta existe, é pasta e não está na lixeira? Devolve os metadados, ou `None`.

    É a validação da ÂNCORA (decisão do diretor): quando a admissão já tem o link gravado, o
    arquivamento vai DIRETO nesse id, sem procurar por nome. Só se a pasta tiver sumido (apagada à
    mão, movida para a lixeira) o fluxo volta a procurar, em vez de estourar.
    """
    try:
        meta = (
            service.files()
            .get(fileId=folder_id, fields="id,mimeType,trashed", supportsAllDrives=True)
            .execute()
        )
    except HttpError:
        return None
    if meta.get("trashed") or meta.get("mimeType") != _FOLDER_MIME:
        return None
    return meta


def resolver_pasta_do_funcionario(
    service, nome: str, parent_id: str
) -> tuple[str, bool, list[dict]]:
    """Pasta do prontuário: devolve (id escolhido, já existia, DUPLICATAS a sinalizar).

    ESTA É A REGRA DA OST DA DUPLICAÇÃO, e ela substitui o desempate anterior (vencia a pasta MAIS
    ANTIGA) por outro, que o diretor corrigiu com um caso real: a mais antiga pode ser de uma admissão
    ANTERIOR da mesma pessoa (Rodrigo Macedo tem pasta de 2024 e de 2025), e gravar nela salvaria no
    lugar errado. **Vence a pasta com MAIS ARQUIVOS**, que é a desta admissão; empate resolve pela
    mais antiga, para continuar determinístico.

    NUNCA TRAVA por ambiguidade (regra 3 da OST): escolhe a melhor e devolve as outras em
    `duplicatas`, para o sistema avisar o diretor. §A.6: NADA é apagado aqui, a remoção é manual.

    A busca cobre as duas convenções de separador (ver `variantes_do_nome`), então a pasta do
    processo antigo entra na disputa em vez de virar uma duplicata nova.
    """
    candidatas: dict[str, dict] = {}
    for forma in variantes_do_nome(nome):
        for p in _pastas_com_nome(service, forma, parent_id):
            candidatas[p["id"]] = p

    if not candidatas:
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
        # Releitura pós-criação: se outro processo criou a mesma pasta no meio do caminho, os dois
        # convergem para uma só (a mais antiga, porque recém-criadas estão as duas vazias).
        apos: dict[str, dict] = {}
        for forma in variantes_do_nome(nome):
            for p in _pastas_com_nome(service, forma, parent_id):
                apos[p["id"]] = p
        if len(apos) > 1:
            ordenadas = sorted(apos.values(), key=lambda p: p.get("createdTime", ""))
            return ordenadas[0]["id"], False, ordenadas[1:]
        return criada["id"], False, []

    if len(candidatas) == 1:
        return next(iter(candidatas)), True, []

    # Mais de uma: conta os arquivos de cada e escolhe a mais completa.
    for p in candidatas.values():
        p["arquivos"] = contar_arquivos(service, p["id"])
    ordenadas = sorted(
        candidatas.values(), key=lambda p: (-p.get("arquivos", 0), p.get("createdTime", ""))
    )
    escolhida, extras = ordenadas[0], ordenadas[1:]
    logger.warning(
        "Prontuário com pasta DUPLICADA no Drive: %d candidatas sob o mesmo pai. Escolhida id=%s "
        "(%d arquivo[s]); as outras vão sinalizadas para consolidação manual (nada foi apagado).",
        len(ordenadas),
        escolhida["id"],
        escolhida.get("arquivos", 0),
    )
    return escolhida["id"], True, extras


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


# Acima disto o envio vai em PEDAÇOS, em vez de um POST único.
_LIMITE_RESUMABLE = 4 * 1024 * 1024
_CHUNK = 4 * 1024 * 1024


def subir_arquivo(service, *, conteudo: bytes, nome_final: str, parent_id: str) -> str:
    """Sobe UM arquivo e DEVOLVE o id dele no Drive.

    O ID JÁ ERA PEDIDO (`fields="id"`) e era JOGADO FORA. Devolvê-lo é aditivo: quem chamava sem usar
    o retorno continua idêntico. Quem precisa do link do arquivo (a coleta de VT, que grava a URL
    para a tela de Benefícios abrir o formulário) deixa de depender de procurar o arquivo pelo NOME
    depois, busca que seria ambígua justamente onde mais importa: a mesma pessoa pode ter dois
    arquivos de mesmo nome na mesma pasta (acontece hoje, no reenvio do formulário).

    Sobe UM arquivo. Arquivo grande vai em pedaços (resumable), e é isso que fecha o timeout.

    O DEFEITO QUE ISTO CORRIGE. O envio era sempre um POST ÚNICO (`resumable=False`): o arquivo
    inteiro numa requisição só. Com arquivo grande, a leitura da resposta estourava o timeout do
    socket e vinha `TimeoutError`, que **não é** `HttpError` e por isso escapava de todo o tratamento
    por arquivo do router, derrubando o lote inteiro. Aconteceu com quatro prontuários reais (Thais em
    28/07, João em 29/07, Camila e Douglas em 30/07): a pasta ficava criada, parte dos arquivos subia,
    e o link nunca era gravado.

    Em pedaços, cada requisição carrega no máximo um chunk, então o tempo de cada ida ao Google é
    limitado e previsível. Arquivo pequeno segue no caminho simples, que é mais rápido.
    """
    grande = len(conteudo) > _LIMITE_RESUMABLE
    media = MediaInMemoryUpload(
        conteudo,
        mimetype=_mime_de(nome_final),
        resumable=grande,
        **({"chunksize": _CHUNK} if grande else {}),
    )
    requisicao = service.files().create(
        body={"name": nome_final, "parents": [parent_id]},
        media_body=media,
        fields="id",
        supportsAllDrives=True,
    )
    if not grande:
        return str(requisicao.execute().get("id", ""))
    resposta = None
    while resposta is None:
        _progresso, resposta = requisicao.next_chunk()
    return str((resposta or {}).get("id", ""))


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


def validar_pasta(service, folder_id: str) -> dict:
    """Valida SOMENTE LEITURA se `folder_id` serve de pasta-pai ANTES de o EA cadastrar o id.

    POR QUE EXISTE. Cadastrar um id de pasta-pai errado passa despercebido no cadastro e só explode
    na hora de arquivar, quando o Drive recusa com `parentNotAFolder` e derruba um prontuário real
    (foi o que aconteceu). Esta checagem antecipa o erro para o momento do cadastro, com um veredito
    legivel, em vez de esperar a falha do arquivamento.

    Um unico files().get (leitura, nunca escreve, honra o contrato do modulo) traz mimeType, a
    capacidade de adicionar filhos e o estado de lixeira, e decide:
      - HttpError 404 / notFound: pasta inexistente ou fora do alcance da conta.
      - trashed: a pasta esta na lixeira.
      - mimeType diferente de pasta: o id aponta para um ARQUIVO (a causa do `parentNotAFolder`).
      - canAddChildren False: a conta ve a pasta mas nao tem permissao de escrita nela.
      - caso contrario: valida.

    §A.6: o folder_id sozinho nao e PII e pode aparecer no retorno/log; nada de nome de pessoa aqui.
    """
    try:
        res = (
            service.files()
            .get(
                fileId=folder_id,
                fields="id,mimeType,capabilities/canAddChildren,trashed",
                supportsAllDrives=True,
            )
            .execute()
        )
    except HttpError as exc:
        status_code = getattr(getattr(exc, "resp", None), "status", None)
        motivo = motivo_http(exc)
        if status_code == 404 or motivo == "notFound":
            return {
                "valido": False,
                "motivo": "Pasta nao encontrada ou a conta admin.soulan@ nao tem acesso.",
            }
        return {
            "valido": False,
            "motivo": f"Nao foi possivel validar a pasta no Drive ({motivo}).",
        }

    if res.get("trashed"):
        return {"valido": False, "motivo": "A pasta esta na lixeira."}
    if res.get("mimeType") != _FOLDER_MIME:
        return {"valido": False, "motivo": "O ID informado nao e uma PASTA (e um arquivo)."}
    capabilities = res.get("capabilities") or {}
    if capabilities.get("canAddChildren") is False:
        return {
            "valido": False,
            "motivo": (
                "A conta admin.soulan@ enxerga a pasta mas nao pode adicionar arquivos nela "
                "(sem permissao de escrita)."
            ),
        }
    return {"valido": True}


# ── Coleta de VT (§A.17): pasta coletiva onde o app Firebase deposita os PDFs de VT ──────────────
# O EA só LÊ essa pasta (list + get_media). Nada é apagado, movido ou renomeado (contrato do módulo).

# Token de 11 dígitos EXATOS (não faz parte de um número maior). O CPF acordado vem sem máscara.
_CPF_RE = re.compile(r"(?<!\d)\d{11}(?!\d)")


def listar_arquivos_da_pasta(service, parent_id: str) -> list[dict]:
    """Lista os arquivos diretos da pasta coletiva (uma consulta paginada). SOMENTE LEITURA.

    Mesmo padrão de paginação/flags de Shared Drive de `md5_existentes`. Devolve, por arquivo:
    `{"id", "name", "md5", "mimeType"}` (md5 vindo de `md5Checksum`, pode ser None). O `name` é
    consumido só DENTRO do ai-service (extração do CPF) e nunca sai deste serviço (§A.6).
    """
    achados: list[dict] = []
    token = None
    while True:
        res = (
            service.files()
            .list(
                q=f"'{parent_id}' in parents and trashed = false",
                fields="nextPageToken,files(id,name,md5Checksum,mimeType)",
                spaces="drive",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageSize=200,
                pageToken=token,
            )
            .execute()
        )
        for f in res.get("files", []):
            achados.append(
                {
                    "id": f.get("id"),
                    "name": f.get("name"),
                    "md5": f.get("md5Checksum"),
                    "mimeType": f.get("mimeType"),
                }
            )
        token = res.get("nextPageToken")
        if not token:
            return achados


def extrair_cpf_do_nome(nome: str) -> str | None:
    """Extrai o CPF (11 dígitos, sem máscara) do nome do arquivo. §A.6: o nome NUNCA é logado.

    Padrão acordado: `NOME COMPLETO EM MAIUSCULAS CPF.pdf`, com o CPF ao final. A estratégia tira a
    extensão e procura tokens de 11 dígitos consecutivos; havendo mais de um, PREFERE o último (o
    CPF fica no fim do nome, e um número interno do nome não deve ganhar dele). Devolve os 11 dígitos
    ou None quando não há um token limpo de 11 dígitos.
    """
    if not nome:
        return None
    base = nome.rsplit(".", 1)[0]
    achados = _CPF_RE.findall(base)
    if not achados:
        return None
    return achados[-1]


def baixar_para_staging(service, file_id: str) -> str:
    """Baixa o binário do arquivo (files().get_media) para a staging efêmera. SOMENTE LEITURA.

    Devolve o `stagingPath` (compatível com `ArquivoIn.stagingPath` do `POST /drive/arquivar`). O
    conteúdo transita em memória e vai para a staging; §A.6: nem o conteúdo nem o nome são logados.
    """
    conteudo = service.files().get_media(fileId=file_id, supportsAllDrives=True).execute()
    return escrever_staging(conteudo)
