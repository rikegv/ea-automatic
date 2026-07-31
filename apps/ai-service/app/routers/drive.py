"""INT-2 — Arquivamento no Drive ao fechar a régua obrigatória (F2).

Cria a pasta do funcionário, as 4 subpastas sob demanda e sobe os arquivos renomeados.
§A.6: nomes de pessoa não são logados; binários descartados após o upload.
"""

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from googleapiclient.errors import HttpError

from app import drive
from app.auth import require_internal_token
from app.config import get_settings
from app.drive import SUBPASTA_NOME
from app.schemas import (
    ArquivamentoDrive,
    ArquivarRequest,
    LocalizarPastaRequest,
    LocalizarPastaResponse,
    ValidarPastaRequest,
    ValidarPastaResponse,
)
from app.staging import ler_staging

router = APIRouter(prefix="/drive", tags=["drive"])
logger = logging.getLogger("ea.ai.drive")


def _mock_slug(pasta_nome: str) -> str:
    """Identificador SEM PII para o link fictício do mock: hash curto do pastaNome.

    O nome do candidato (que compõe pastaNome) NUNCA entra no link nem no que será persistido.
    """
    return hashlib.sha256(pasta_nome.encode("utf-8")).hexdigest()[:8]


@router.post("/arquivar", response_model=ArquivamentoDrive, response_model_by_alias=True)
def arquivar(req: ArquivarRequest, _: None = Depends(require_internal_token)) -> ArquivamentoDrive:
    settings = get_settings()

    # Modo mock (validação visual híbrida): não toca na API do Google. Sem PII no log.
    if settings.drive_mock:
        logger.warning(
            "DRIVE_MOCK ativo: arquivamento simulado (%d arquivo(s), sem chamada ao Drive).",
            len(req.arquivos),
        )
        return ArquivamentoDrive(
            pasta_url=f"https://drive.google.com/drive/folders/MOCK-{_mock_slug(req.pasta_nome)}",
            arquivados=len(req.arquivos),
        )

    service = drive.get_drive_service()

    duplicatas: list[str] = []
    try:
        # ÂNCORA PRIMEIRO (OST da duplicação, decisão do diretor). Se a admissão já tem pasta
        # gravada, vai direto nela pelo ID: quem tem link não procura, e quem não procura não cria
        # uma segunda. É isto que fecha a corrida entre duas execuções simultâneas. A busca por nome
        # só acontece na PRIMEIRA vez, ou se a pasta ancorada tiver sumido do Drive.
        ancorada = drive.abrir_pasta_por_id(service, req.pasta_id) if req.pasta_id else None
        if ancorada:
            pasta_func_id, pasta_ja_existia = ancorada["id"], True
        else:
            if req.pasta_id:
                logger.warning(
                    "Pasta ancorada não encontrada no Drive (id=%s): caindo na busca por nome. "
                    "Ela pode ter sido apagada ou movida para a lixeira.",
                    req.pasta_id,
                )
            pasta_func_id, pasta_ja_existia, extras = drive.resolver_pasta_do_funcionario(
                service, req.pasta_nome, req.parent_folder_id
            )
            duplicatas = [p["id"] for p in extras]
    except Exception as exc:  # noqa: BLE001
        # Este caminho subia um 502 MUDO: nem log, nem motivo. Descoberto na troca de credencial,
        # quando a identidade nova não enxergava a pasta-pai e a única informação disponível era
        # "502 Bad Gateway". §A.6: motivo do Google e id da pasta-pai (id não é PII), nunca o nome.
        motivo = drive.motivo_http(exc) if isinstance(exc, HttpError) else type(exc).__name__
        logger.error(
            "Falha ao resolver a pasta do funcionário (%s). parentFolderId=%s. Causa provável: a "
            "conta que o sistema usa não enxerga essa pasta-pai, ou o id está errado.",
            motivo,
            req.parent_folder_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"Não foi possível abrir ou criar a pasta do funcionário no Drive ({motivo}). "
                "Verifique se a conta do sistema tem acesso à pasta de destino."
            ),
        ) from exc
    if pasta_ja_existia:
        # §A.6: sem nome de pessoa no log. O id da pasta não é PII.
        logger.info("Prontuário JÁ EXISTIA no Drive, pasta reutilizada (id=%s).", pasta_func_id)

    subpasta_cache: dict[str, str] = {}
    # md5 do que JÁ está em cada subpasta de destino. Uma consulta por subpasta, não por arquivo.
    md5_no_destino: dict[str, set[str]] = {}
    arquivados = 0
    ignorados = 0
    # Falhas por arquivo: NÃO abortam o lote, viram contagem na resposta (ver o except do laço).
    falhas: list[str] = []
    for indice, arq in enumerate(req.arquivos):
        nome_sub = SUBPASTA_NOME[arq.subpasta]
        if arq.subpasta not in subpasta_cache:
            subpasta_cache[arq.subpasta], _ = drive.buscar_ou_criar_pasta(
                service, nome_sub, pasta_func_id
            )
            md5_no_destino[arq.subpasta] = drive.md5_existentes(
                service, subpasta_cache[arq.subpasta]
            )
        # LEITURA DA STAGING COM ERRO NOMEADO. Este ponto ficava FORA de qualquer tratamento, então
        # um arquivo que sumiu do disco entre a listagem (no backend) e a leitura (aqui) derrubava o
        # arquivamento INTEIRO como HTTP 500 cru, sem dizer o que houve. Foi o que aconteceu num caso
        # real: os arquivos subiram, o lote morreu no fim, e o backend só viu "500". Agora a falha
        # diz qual arquivo do lote e quantos já tinham subido. §A.6: índice e contagem, nunca o nome.
        try:
            conteudo = ler_staging(arq.staging_path)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Arquivamento interrompido: falha ao ler o arquivo %d/%d da staging (%s). "
                "%d arquivo(s) já subiram; a staging NÃO deve ser expurgada.",
                indice + 1,
                len(req.arquivos),
                type(exc).__name__,
                arquivados,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"Não foi possível ler o arquivo {indice + 1} de {len(req.arquivos)} para enviar "
                    f"ao Drive. {arquivados} arquivo(s) foram enviados."
                ),
            ) from exc

        # CHECAR ANTES DE SUBIR (regra do diretor). O critério de "mesmo arquivo" é o CONTEÚDO (md5),
        # não o nome: o mesmo documento chega com nomes diferentes, e o EA renomeia tudo para
        # `{Tipo}_{Nome}`, o que faria duas versões distintas do mesmo tipo colidirem por nome.
        # É esta checagem que corta a duplicação na raiz: a staging acumula uma cópia a cada
        # auditoria do documento (cada auditoria grava um arquivo novo com uuid próprio), e o
        # arquivamento sobe a staging inteira. Sem esta verificação, reauditar três vezes punha três
        # cópias idênticas no prontuário, que é o que o acervo mostra hoje.
        md5_local = drive.md5_do_conteudo(conteudo)
        if md5_local in md5_no_destino[arq.subpasta]:
            ignorados += 1
            del conteudo
            continue

        try:
            drive.subir_arquivo(
                service,
                conteudo=conteudo,
                nome_final=arq.nome_final,
                parent_id=subpasta_cache[arq.subpasta],
            )
            arquivados += 1
            # O que acabou de subir passa a contar como "já está lá": dois arquivos IDÊNTICOS dentro
            # do MESMO lote (a staging tem isso) sobem uma vez só.
            md5_no_destino[arq.subpasta].add(md5_local)
        except Exception as exc:  # noqa: BLE001
            # DIAGNÓSTICO DO ARQUIVAMENTO. Antes, qualquer erro do Google subia como 500 cru: o
            # backend só via "HTTP 500" e o consultor não via nada. O caso real foi um 403
            # `parentNotAFolder` no 16º arquivo de um lote em que os 15 anteriores subiram para a
            # MESMA pasta, ou seja, erro transitório do Drive e não defeito do dado.
            # §A.6: logamos motivo, índice e id de pasta (id não é PII). NUNCA `nome_final`, que
            # carrega o nome do candidato.
            motivo = drive.motivo_http(exc) if isinstance(exc, HttpError) else type(exc).__name__
            logger.warning(
                "Drive recusou upload (%s) no arquivo %d/%d, subpasta=%s, pastaId=%s. Retentando "
                "com a pasta reresolvida.",
                motivo,
                indice + 1,
                len(req.arquivos),
                arq.subpasta,
                subpasta_cache[arq.subpasta],
            )
            # RETENTATIVA ÚNICA com a subpasta RERESOLVIDA. Cobre as duas hipóteses de uma vez: se o
            # id em cache ficou inválido, o novo lookup conserta; se foi soluço do Drive, a segunda
            # tentativa passa. Não retenta em laço: erro que persiste é erro de verdade.
            try:
                subpasta_cache[arq.subpasta], _ = drive.buscar_ou_criar_pasta(
                    service, nome_sub, pasta_func_id
                )
                # A RETENTATIVA PODIA DUPLICAR: se o upload chegou a criar o arquivo e o erro veio
                # depois, subir de novo geraria uma segunda cópia. Reler os md5 do destino ANTES de
                # repetir fecha essa porta, e é o motivo de a checagem de conteúdo estar aqui também.
                md5_no_destino[arq.subpasta] = drive.md5_existentes(
                    service, subpasta_cache[arq.subpasta]
                )
                if md5_local in md5_no_destino[arq.subpasta]:
                    logger.info(
                        "Arquivo %d/%d já estava no destino após a falha: nada a reenviar.",
                        indice + 1,
                        len(req.arquivos),
                    )
                    arquivados += 1
                    continue
                drive.subir_arquivo(
                    service,
                    conteudo=conteudo,
                    nome_final=arq.nome_final,
                    parent_id=subpasta_cache[arq.subpasta],
                )
                arquivados += 1
                md5_no_destino[arq.subpasta].add(md5_local)
            except Exception as exc2:  # noqa: BLE001
                # UM ARQUIVO QUE FALHA NÃO DERRUBA O LOTE (decisão do diretor: o sistema resolve
                # sozinho). Antes isto virava 502, e o backend, que só grava a URL quando a resposta
                # chega, perdia o link de uma pasta que JÁ EXISTIA no Drive com parte dos arquivos
                # dentro. A admissão aparecia como "sem pasta" tendo pasta, e alguém tinha de agir à
                # mão. Agora a falha é CONTADA, o lote continua, a resposta volta 200 com o link, e a
                # próxima tentativa completa o que faltou (a checagem por md5 não reenvia nada).
                #
                # `Exception` e não `HttpError` de propósito: o erro real dos quatro prontuários
                # travados foi `TimeoutError`, que não é HttpError e escapava de todo o tratamento.
                motivo2 = drive.motivo_http(exc2) if isinstance(exc2, HttpError) else type(exc2).__name__
                logger.error(
                    "Arquivo %d/%d NÃO subiu (%s), subpasta=%s. O lote continua; %d já subiram. "
                    "A staging NÃO deve ser expurgada.",
                    indice + 1,
                    len(req.arquivos),
                    motivo2,
                    arq.subpasta,
                    arquivados,
                )
                falhas.append(motivo2)
        finally:
            del conteudo

    if ignorados:
        logger.info(
            "Arquivamento: %d arquivo(s) ignorado(s) por já estarem no prontuário (mesmo conteúdo).",
            ignorados,
        )
    # O LINK DA PASTA É O ÚLTIMO PASSO, e também estava sem tratamento: falhar aqui perdia um
    # arquivamento que JÁ tinha dado certo, porque o backend só grava a URL quando a resposta chega.
    # Agora a falha é nomeada e o lote não vira 500 anônimo.
    try:
        pasta_url = drive.pasta_web_link(service, pasta_func_id)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Arquivos enviados (%d), mas falhou ao ler o link da pasta (%s). Nada foi perdido no "
            "Drive; o EA vai tentar de novo e a checagem de conteúdo evita duplicar.",
            arquivados,
            type(exc).__name__,
        )
        # NEM ISTO derruba mais: a pasta existe e o id é conhecido, então monta-se o link canônico.
        # Perder o link de uma pasta que existe é o que fazia a admissão voltar para a fila à toa.
        pasta_url = f"https://drive.google.com/drive/folders/{pasta_func_id}"

    return ArquivamentoDrive(
        pasta_url=pasta_url,
        arquivados=arquivados,
        ignorados=ignorados,
        pasta_ja_existia=pasta_ja_existia,
        duplicatas=duplicatas,
        falhas=len(falhas),
        motivo_falhas=sorted(set(falhas)),
    )


# ── Validação de pasta-pai do Drive (read-only) ──────────────────────────────
# Antecipa o `parentNotAFolder` (id de pasta-pai errado que só falharia no arquivamento) para o
# momento do cadastro. Uma única leitura (files().get), nada é criado, movido ou apagado.


@router.post("/validar-pasta", response_model=ValidarPastaResponse, response_model_by_alias=True)
def validar_pasta(
    req: ValidarPastaRequest, _: None = Depends(require_internal_token)
) -> ValidarPastaResponse:
    settings = get_settings()

    # Modo mock (ambiente sem Drive real): não trava o cadastro, responde válido.
    if settings.drive_mock:
        logger.warning("DRIVE_MOCK ativo: validar-pasta simulado (sem chamada ao Drive).")
        return ValidarPastaResponse(valido=True, motivo="mock")

    service = drive.get_drive_service()
    resultado = drive.validar_pasta(service, req.folder_id)
    return ValidarPastaResponse(valido=resultado["valido"], motivo=resultado.get("motivo"))


@router.post("/localizar-pasta", response_model=LocalizarPastaResponse, response_model_by_alias=True)
def localizar_pasta(
    req: LocalizarPastaRequest, _: None = Depends(require_internal_token)
) -> LocalizarPastaResponse:
    """A pasta do prontuário JÁ EXISTE no Drive? SOMENTE LEITURA: não cria nem altera nada.

    É o insumo da reconciliação automática do Diagnóstico: o sistema confere sozinho se o prontuário
    está lá e, estando, liga a admissão e apaga a pendência, em vez de pedir que alguém olhe o Drive
    e clique. Usa a MESMA régua do arquivamento (as duas convenções de nome e a pasta mais completa).
    """
    settings = get_settings()
    if settings.drive_mock:
        return LocalizarPastaResponse(encontrada=False)

    service = drive.get_drive_service()
    candidatas: dict[str, dict] = {}
    for forma in drive.variantes_do_nome(req.pasta_nome):
        for p in drive._pastas_com_nome(service, forma, req.parent_folder_id):  # noqa: SLF001
            candidatas[p["id"]] = p
    if not candidatas:
        return LocalizarPastaResponse(encontrada=False)

    for p in candidatas.values():
        p["arquivos"] = drive.contar_arquivos(service, p["id"])
    ordenadas = sorted(
        candidatas.values(), key=lambda p: (-p.get("arquivos", 0), p.get("createdTime", ""))
    )
    escolhida = ordenadas[0]
    return LocalizarPastaResponse(
        encontrada=True,
        pasta_id=escolhida["id"],
        pasta_url=f"https://drive.google.com/drive/folders/{escolhida['id']}",
        arquivos=escolhida.get("arquivos", 0),
        duplicatas=[p["id"] for p in ordenadas[1:]],
    )
