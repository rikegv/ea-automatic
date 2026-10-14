"""O ARQUIVADOR do Portal (Desenho 1 do Prontuário Drive): copia o objeto do balde de entrada para
a árvore do prontuário no Drive, EM MEMÓRIA, SEM INTERPRETAR o conteúdo ("cega").

POR QUE ESTA ROTA EXISTE. O documento que o candidato entrega pelo Portal vive só no balde de
entrada (GCS). O leitor (`/portal/ler`) lê esse objeto em memória para AUDITAR, mas é um processo
SEM Drive, de propósito (VS3: quem abre arquivo hostil não segura a chave do prontuário), então ele
não arquiva. O arquivador da esteira (`/drive/arquivar`) escreve no Drive, mas lê da STAGING local e
nunca enxerga o balde do Portal. Resultado medido: o documento do Portal nunca chegava ao prontuário
(docs/DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md; frente Prontuário Drive). Esta rota é a ponte que faltava,
numa instância DEDICADA e cega.

O QUE ESTA ROTA É, E O QUE ELA NÃO É:
 - **Cega, sem parser (condição 1).** NÃO importa `gemini`, NÃO chama o Vertex, NÃO interpreta o
   documento. Copia bytes. O destino e a régua de pasta são os mesmos do `/drive/arquivar` (âncora
   `pasta_id`, dedup por md5, subpasta), reusados de `app.drive`.
 - **Separada por papel (condição 3).** Só responde na instância ARQUIVADOR
   (`PORTAL_PAPEL=ARQUIVADOR`, `exigir_papel_arquivador`). A operação e o leitor são recusados aqui.
 - **Allowlist de um balde só.** Igual ao leitor: sem isso, quem tivesse o token interno copiaria
   qualquer balde que a conta alcança.
 - **Não toca disco.** Lê cada objeto por `portal_bucket` (orçamento de bytes, em memória) e sobe ao
   Drive; o binário morre no fim da requisição, em qualquer caminho (§A.6).
 - **Inerte por padrão (condição 6).** Sem `PORTAL_BUCKET` e sem `PORTAL_PAPEL=ARQUIVADOR`, não faz
   nada. O binding de IAM que dá à conta leitura no balde e escrita nas pastas é do diretor (§A.0).

§A.6: nome de objeto, nome de pessoa e CPF NUNCA são logados. Ao log vão só contagens e ids de
pasta (que não são dado pessoal). O `nome_final` carrega o nome do candidato (exceção já registrada
do prontuário) e também nunca é logado.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from googleapiclient.errors import HttpError

from app import drive, portal_bucket
from app.auth import require_internal_token
from app.config import get_settings
from app.drive import SUBPASTA_NOME
from app.portal_fluxo import OrcamentoEstourado
from app.portal_papel import exigir_papel_arquivador
from app.schemas import ArquivamentoDrive, PortalArquivarRequest, PortalDocumentoRequest

router = APIRouter(prefix="/portal", tags=["portal-arquivar"])
logger = logging.getLogger("ea.ai.portal.arquivador")


def _resolver_pasta(service, req: PortalArquivarRequest):  # noqa: ANN001, ANN201 - client dinâmico
    """Resolve a pasta do prontuário com UMA retentativa em conexão nova. Espelha `routers/drive.py`.

    ÂNCORA PRIMEIRO (OST da duplicação, decisão do diretor): se a admissão já tem pasta gravada, o
    arquivamento vai direto nela pelo id e NÃO procura por nome, que é o que fecha a corrida entre
    duas execuções. A busca por nome só acontece na primeira vez ou se a pasta ancorada sumiu.
    """
    for tentativa in (1, 2):
        try:
            ancorada = drive.abrir_pasta_por_id(service, req.pasta_id) if req.pasta_id else None
            if ancorada:
                return service, ancorada["id"], True, []
            if req.pasta_id:
                logger.warning(
                    "Pasta ancorada não encontrada no Drive (id=%s): caindo na busca por nome.",
                    req.pasta_id,
                )
            pasta_id, ja_existia, extras = drive.resolver_pasta_do_funcionario(
                service, req.pasta_nome, req.parent_folder_id
            )
            return service, pasta_id, ja_existia, [p["id"] for p in extras]
        except Exception:  # noqa: BLE001
            if tentativa == 2:
                raise
            service = drive.renovar_drive_service()
    raise AssertionError("inalcançável")  # pragma: no cover


@router.post("/arquivar", response_model=ArquivamentoDrive, response_model_by_alias=True)
def portal_arquivar(
    req: PortalArquivarRequest,
    _: None = Depends(require_internal_token),
    __: None = Depends(exigir_papel_arquivador),
) -> ArquivamentoDrive:
    settings = get_settings()

    if not settings.portal_bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Arquivador do Portal não configurado (balde de entrada ausente).",
        )
    # ALLOWLIST DE UM BALDE SÓ (igual ao leitor).
    if req.bucket != settings.portal_bucket:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Balde não permitido para o arquivador do Portal.",
        )

    service = drive.get_drive_service()
    try:
        service, pasta_func_id, pasta_ja_existia, duplicatas = _resolver_pasta(service, req)
    except Exception as exc:  # noqa: BLE001
        motivo = drive.motivo_http(exc) if isinstance(exc, HttpError) else type(exc).__name__
        logger.error(
            "Arquivador do Portal: falha ao resolver a pasta do prontuário (%s). parentFolderId=%s.",
            motivo,
            req.parent_folder_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Não foi possível abrir ou criar a pasta do prontuário no Drive ({motivo}).",
        ) from exc

    subpasta_cache: dict[str, str] = {}
    md5_no_destino: dict[str, set[str]] = {}
    arquivados = 0
    ignorados = 0
    ids_enviados: list[str] = []
    falhas: list[str] = []

    for indice, item in enumerate(req.itens):
        nome_sub = SUBPASTA_NOME[item.subpasta]
        if item.subpasta not in subpasta_cache:
            subpasta_cache[item.subpasta], _ = drive.buscar_ou_criar_pasta(
                service, nome_sub, pasta_func_id
            )
            md5_no_destino[item.subpasta] = drive.md5_existentes(
                service, subpasta_cache[item.subpasta]
            )

        # LEITURA DO OBJETO EM MEMÓRIA. Metadado antes do primeiro byte (corta objeto grande sem
        # baixar), download sob orçamento de bytes. Nunca escreve em disco. Objeto ausente ou maior
        # que o teto NÃO derruba o lote: vira contagem de falha, igual ao upload que falha.
        conteudo: bytes | None = None
        try:
            meta = portal_bucket.obter_metadado(req.bucket, item.objeto)
            if meta.tamanho > settings.portal_bytes_max:
                raise ValueError("TamanhoAcimaDoTeto")
            conteudo = portal_bucket.baixar_em_memoria(
                req.bucket, item.objeto, maximo_bytes=settings.portal_bytes_max
            )
        except (portal_bucket.ObjetoAusente, OrcamentoEstourado, ValueError) as exc:
            # §A.6: nunca o nome do objeto. Índice e tipo da falha bastam para o diagnóstico.
            logger.warning(
                "Arquivador do Portal: objeto %d/%d não pôde ser lido do balde (%s); o lote segue.",
                indice + 1,
                len(req.itens),
                type(exc).__name__,
            )
            falhas.append(type(exc).__name__)
            continue

        try:
            md5_local = drive.md5_do_conteudo(conteudo)
            if md5_local in md5_no_destino[item.subpasta]:
                ignorados += 1
                continue
            novo_id = drive.subir_arquivo(
                service,
                conteudo=conteudo,
                nome_final=item.nome_final,
                parent_id=subpasta_cache[item.subpasta],
            )
            if novo_id:
                ids_enviados.append(novo_id)
            arquivados += 1
            md5_no_destino[item.subpasta].add(md5_local)
        except Exception as exc:  # noqa: BLE001
            # UM OBJETO QUE FALHA NÃO DERRUBA O LOTE (mesma regra do /drive/arquivar). Contado, o lote
            # segue, e a próxima tentativa completa (a dedup por md5 não reenvia o que já subiu).
            motivo = drive.motivo_http(exc) if isinstance(exc, HttpError) else type(exc).__name__
            logger.error(
                "Arquivador do Portal: objeto %d/%d NÃO subiu (%s), subpasta=%s. %d já subiram.",
                indice + 1,
                len(req.itens),
                motivo,
                item.subpasta,
                arquivados,
            )
            falhas.append(motivo)
        finally:
            del conteudo

    if ignorados:
        logger.info(
            "Arquivador do Portal: %d objeto(s) ignorado(s) por já estarem no prontuário (md5).",
            ignorados,
        )

    try:
        pasta_url = drive.pasta_web_link(service, pasta_func_id)
    except Exception:  # noqa: BLE001
        pasta_url = f"https://drive.google.com/drive/folders/{pasta_func_id}"

    return ArquivamentoDrive(
        pasta_url=pasta_url,
        arquivados=arquivados,
        arquivos_ids=ids_enviados,
        ignorados=ignorados,
        pasta_ja_existia=pasta_ja_existia,
        duplicatas=duplicatas,
        falhas=len(falhas),
        motivo_falhas=sorted(set(falhas)),
    )


@router.post("/documento")
def portal_documento(
    req: PortalDocumentoRequest,
    _: None = Depends(require_internal_token),
    __: None = Depends(exigir_papel_arquivador),
) -> Response:
    """VISUALIZAÇÃO na Auditoria: devolve os BYTES do objeto do balde, para o backend servir inline.

    Mesma conta cega, mesma postura do /portal/arquivar: lê o objeto EM MEMÓRIA (orçamento de bytes),
    NÃO interpreta, NÃO toca disco, e devolve o binário. Quem decide o content-type que vai ao
    navegador é o backend (ele tem o tipo corrigido da credencial); aqui o media_type é só o declarado
    no metadado. §A.6: o nome do objeto nunca é logado; o binário morre no fim da requisição.
    """
    settings = get_settings()
    if not settings.portal_bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Arquivador do Portal não configurado (balde de entrada ausente).",
        )
    if req.bucket != settings.portal_bucket:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Balde não permitido para o arquivador do Portal.",
        )

    try:
        meta = portal_bucket.obter_metadado(req.bucket, req.objeto)
    except portal_bucket.ObjetoAusente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="O arquivo não está mais no armazenamento.",
        ) from None
    if meta.tamanho > settings.portal_bytes_max:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Arquivo acima do limite de {settings.portal_bytes_max // (1024 * 1024)} MB.",
        )

    conteudo: bytes | None = None
    try:
        conteudo = portal_bucket.baixar_em_memoria(
            req.bucket, req.objeto, maximo_bytes=settings.portal_bytes_max
        )
    except OrcamentoEstourado:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Arquivo maior do que o declarado.",
        ) from None
    except portal_bucket.ObjetoAusente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="O arquivo não está mais no armazenamento.",
        ) from None

    try:
        return Response(
            content=conteudo,
            media_type=(meta.tipo_declarado or "application/octet-stream"),
        )
    finally:
        del conteudo
