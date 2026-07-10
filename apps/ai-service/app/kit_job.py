"""Fila do motor de kit (OST 3.1): processa os lotes de páginas em SEQUÊNCIA, com espaçamento entre
as chamadas ao Gemini e retry com backoff exponencial no 429 do Vertex (disputa temporária de
recurso, não limite fixo). O trabalho roda numa thread de fundo; a tela acompanha o progresso por
polling. §A.6: nada de PII em log; CPF já sai mascarado do motor; binários da staging apagados ao
fim. §A.11: sem travessão.
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from io import BytesIO

from google.genai import errors
from pypdf import PdfReader, PdfWriter

from app import gemini, kit_dict, kit_motor
from app.config import get_settings
from app.staging import ler_staging

_JOBS: dict[str, "Job"] = {}
_LOCK = threading.Lock()


@dataclass
class Job:
    status: str = "processando"  # processando | concluido | erro
    lote_atual: int = 0
    total_lotes: int = 0
    mensagem: str = "Iniciando..."
    retries: int = 0
    resultado: dict | None = None
    erro: str | None = None
    # Etapa 4 (download): traduz o rótulo do arquivo (origem) para o caminho na staging. Fica em
    # memória (o caminho é um uuid sem PII, §A.6) para reconstruir o PDF consolidado sob demanda.
    mapa_arquivos: dict[str, str] = field(default_factory=dict)
    # Retenção de 2h: marca de criação para expurgar o resultado após a janela (§A.6, efêmero).
    criado_em: float = field(default_factory=time.time)


class ReimportInvalido(Exception):
    """Reimportação recusada: `motivo` = 'pessoa' (nome divergente) ou 'nao_reconhecido'."""

    def __init__(self, motivo: str) -> None:
        self.motivo = motivo
        super().__init__(motivo)


def _atualizar(job_id: str, **campos: object) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return
        for chave, valor in campos.items():
            setattr(job, chave, valor)


def _expurgar_expirados() -> None:
    """Remove jobs além da janela de retenção (chamado sob _LOCK)."""
    ttl = get_settings().kit_job_ttl_s
    agora = time.time()
    for jid in [j for j, job in _JOBS.items() if agora - job.criado_em > ttl]:
        del _JOBS[jid]


def status(job_id: str) -> Job | None:
    with _LOCK:
        _expurgar_expirados()
        return _JOBS.get(job_id)


def _retries_atual(job_id: str) -> int:
    with _LOCK:
        job = _JOBS.get(job_id)
        return job.retries if job else 0


def _e_429(exc: BaseException) -> bool:
    """Reconhece o 429/RESOURCE_EXHAUSTED do Vertex (disputa temporária de recurso)."""
    if isinstance(exc, errors.ClientError):
        codigo = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if codigo == 429:
            return True
    texto = str(exc)
    return "429" in texto or "RESOURCE_EXHAUSTED" in texto


def _sub_pdf(reader: PdfReader, inicio: int, fim: int) -> bytes:
    writer = PdfWriter()
    for i in range(inicio, fim):
        writer.add_page(reader.pages[i])
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _lotes_de(n_paginas: int) -> int:
    tamanho = max(1, get_settings().kit_lote_paginas)
    return max(1, (n_paginas + tamanho - 1) // tamanho)


def _classificar_com_retry(
    job_id: str, sub_bytes: bytes, dicionario: list[str]
) -> list[kit_motor.PaginaClassificada]:
    """Uma chamada ao Gemini por lote, com backoff exponencial no 429 (2, 4, 8, 16 ... segundos)."""
    s = get_settings()
    ultima: BaseException | None = None
    for tentativa in range(1, s.kit_retry_max + 1):
        try:
            return gemini.classificar_um_lote(conteudo_pdf=sub_bytes, titulos_dicionario=dicionario)
        except Exception as exc:  # noqa: BLE001 - decide pelo tipo do erro logo abaixo
            ultima = exc
            if _e_429(exc) and tentativa < s.kit_retry_max:
                espera = s.kit_retry_base_s * (2 ** (tentativa - 1))
                _atualizar(
                    job_id,
                    retries=_retries_atual(job_id) + 1,
                    mensagem=(
                        "Aguardando disponibilidade da IA, tentando novamente "
                        f"({tentativa}/{s.kit_retry_max})..."
                    ),
                )
                if espera > 0:
                    time.sleep(espera)
                continue
            raise
    if ultima is not None:  # pragma: no cover - laço sempre retorna ou levanta antes
        raise ultima
    return []


def _mensagem_erro(exc: BaseException) -> str:
    if _e_429(exc):
        return (
            "A IA (Vertex) está sem disponibilidade no momento (limite temporário). "
            "Tente novamente em instantes."
        )
    return "Falha ao processar o kit."


def _montar_resultado(res: kit_motor.ResultadoMotor, dicionario: list[str]) -> dict:
    return {
        "funcionarios": [
            {
                "nome": f.nome,
                "cpfMascarado": f.cpf_mascarado,
                "revisao": f.revisao,
                "documentos": [
                    {"titulo": d.titulo, "ordem": d.ordem, "paginas": d.paginas, "arquivo": d.origem}
                    for d in f.documentos
                ],
            }
            for f in res.funcionarios
        ],
        "naoReconhecidos": [
            {"arquivo": n.staging_path, "paginas": n.paginas, "motivo": n.motivo}
            for n in res.nao_reconhecidos
        ],
        "dicionario": [{"titulo": t, "ordem": i + 1} for i, t in enumerate(dicionario)],
        "log": {
            "pdfs": res.pdfs,
            "funcionarios": len(res.funcionarios),
            "docsPorFuncionario": [len(f.documentos) for f in res.funcionarios],
            "semReconhecimento": len(res.nao_reconhecidos),
        },
    }


def _rodar(job_id: str, documentos: list[dict], dicionario: list[str]) -> None:
    s = get_settings()
    try:
        # 1. Lê os PDFs e conta os lotes totais.
        pdfs = []  # (arquivo, reader, n_paginas)
        total_lotes = 0
        for doc in documentos:
            conteudo = ler_staging(doc["staging_path"])
            reader = PdfReader(BytesIO(conteudo))
            n = len(reader.pages)
            total_lotes += _lotes_de(n)
            pdfs.append((doc["arquivo"], reader, n))
            del conteudo
        _atualizar(job_id, total_lotes=total_lotes)

        # 2. Processa lote a lote, EM SEQUÊNCIA, com espaçamento entre as chamadas.
        paginas_por_pdf: list[tuple[str, list[kit_motor.PaginaClassificada]]] = []
        lote_idx = 0
        for arquivo, reader, n in pdfs:
            paginas: list[kit_motor.PaginaClassificada] = []
            for inicio in range(0, n, s.kit_lote_paginas):
                fim = min(inicio + s.kit_lote_paginas, n)
                lote_idx += 1
                _atualizar(
                    job_id,
                    lote_atual=lote_idx,
                    mensagem=f"Processando lote {lote_idx} de {total_lotes}...",
                )
                if lote_idx > 1 and s.kit_espaco_lote_s > 0:
                    time.sleep(s.kit_espaco_lote_s)
                classificadas = _classificar_com_retry(job_id, _sub_pdf(reader, inicio, fim), dicionario)
                for pg in classificadas:
                    pg.pagina += inicio  # reposiciona no PDF de origem
                paginas.extend(classificadas)
            paginas_por_pdf.append((arquivo, paginas))

        # 3. Monta os kits por funcionário.
        resultado = kit_motor.processar(paginas_por_pdf, dicionario)
        _atualizar(
            job_id,
            status="concluido",
            mensagem="Concluído",
            resultado=_montar_resultado(resultado, dicionario),
        )
    except Exception as exc:  # noqa: BLE001 - qualquer falha vira estado de erro do job
        _atualizar(job_id, status="erro", erro=_mensagem_erro(exc))
    # §A.6 (Etapa 4): os binários da staging NÃO são apagados aqui. A Etapa 4 monta o PDF
    # consolidado a partir das páginas originais, então as origens precisam sobreviver até o
    # download. O StagingPurgeService expurga `_kits` por TTL (1h) do jeito efêmero de sempre.


def iniciar(kit_tipo_id: str, documentos: list[dict]) -> tuple[str, int]:
    """Valida, conta os lotes e dispara o job em thread. Devolve (job_id, total_lotes)."""
    dicionario = kit_dict.carregar_dicionario_kit(kit_tipo_id)
    if not dicionario:
        raise ValueError("kit-sem-titulos")
    total_lotes = 0
    for doc in documentos:
        conteudo = ler_staging(doc["staging_path"])
        total_lotes += _lotes_de(len(PdfReader(BytesIO(conteudo)).pages))
        del conteudo
    job_id = uuid.uuid4().hex
    mapa = {doc["arquivo"]: doc["staging_path"] for doc in documentos}
    with _LOCK:
        _expurgar_expirados()  # não acumula histórico: expira o que passou da janela de 2h
        _JOBS[job_id] = Job(total_lotes=total_lotes, mapa_arquivos=mapa)
    threading.Thread(target=_rodar, args=(job_id, documentos, dicionario), daemon=True).start()
    return job_id, total_lotes


def _classificar_documentos(
    job_id: str, documentos: list[dict], dicionario: list[str]
) -> list[tuple[str, list[kit_motor.PaginaClassificada]]]:
    """Classifica PDFs (mesmo fluxo do lote + retry/backoff no 429). Páginas 1-based na origem."""
    s = get_settings()
    paginas_por_pdf: list[tuple[str, list[kit_motor.PaginaClassificada]]] = []
    for doc in documentos:
        conteudo = ler_staging(doc["staging_path"])
        reader = PdfReader(BytesIO(conteudo))
        n = len(reader.pages)
        paginas: list[kit_motor.PaginaClassificada] = []
        for inicio in range(0, n, s.kit_lote_paginas):
            fim = min(inicio + s.kit_lote_paginas, n)
            classificadas = _classificar_com_retry(job_id, _sub_pdf(reader, inicio, fim), dicionario)
            for pg in classificadas:
                pg.pagina += inicio
            paginas.extend(classificadas)
        paginas_por_pdf.append((doc["arquivo"], paginas))
        del conteudo
    return paginas_por_pdf


def reimportar(job_id: str, indice: int, documentos: list[dict]) -> dict:
    """Reimporta PDFs para UM funcionário já identificado: classifica os novos PDFs (mesmo fluxo de
    detecção título+nome), confere se são da mesma pessoa e ANEXA os documentos que faltavam. Não
    cria funcionário novo, não reprocessa os demais. Levanta KeyError (job/índice inexistente) ou
    ReimportInvalido ('pessoa' = nome divergente, 'nao_reconhecido' = nada identificado).
    """
    job = status(job_id)
    if job is None or job.status != "concluido" or not job.resultado:
        raise KeyError("job")
    funcionarios = job.resultado["funcionarios"]
    if indice < 0 or indice >= len(funcionarios):
        raise KeyError("indice")
    alvo = funcionarios[indice]
    dicionario = [d["titulo"] for d in job.resultado.get("dicionario", [])]

    novo = kit_motor.processar(_classificar_documentos(job_id, documentos, dicionario), dicionario)
    alvo_norm = kit_motor.normalizar(alvo["nome"])
    correspondente = next(
        (f for f in novo.funcionarios if kit_motor.normalizar(f.nome) == alvo_norm), None
    )
    if correspondente is None:
        raise ReimportInvalido("nao_reconhecido" if not novo.funcionarios else "pessoa")

    presentes = {d["titulo"] for d in alvo["documentos"]}
    anexados: list[str] = []
    with _LOCK:
        for d in correspondente.documentos:
            if d.titulo in presentes:
                continue
            alvo["documentos"].append(
                {"titulo": d.titulo, "ordem": d.ordem, "paginas": d.paginas, "arquivo": d.origem}
            )
            presentes.add(d.titulo)
            anexados.append(d.titulo)
        alvo["documentos"].sort(key=lambda x: x["ordem"])
        for doc in documentos:
            job.mapa_arquivos[doc["arquivo"]] = doc["staging_path"]
        job.resultado["log"]["docsPorFuncionario"] = [len(f["documentos"]) for f in funcionarios]
    return {"resultado": job.resultado, "anexados": anexados}
