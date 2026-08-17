"""OST da concorrência no arquivamento — camadas 1, 2 e 4.

O DEFEITO. O cliente do Drive era um só, guardado em cache GLOBAL (`@lru_cache`). O objeto carrega um
`httplib2.Http` por baixo, que NÃO é thread-safe, e os endpoints síncronos deste serviço são atendidos
num pool de threads: dois arquivamentos simultâneos dividiam a mesma conexão, as threads perdedoras
ficavam paradas até o timeout de 60s e vinha `TimeoutError`. Como a RESOLUÇÃO da pasta não tinha
retentativa (só o upload tinha), isso virava 502 seco e o backend perdia o link de uma pasta que já
existia no Drive, cheia de documentos. O texto do log ainda mandava conferir o cadastro da pasta-pai,
que estava certo o tempo todo.

Estes testes travam as três correções sem tocar a rede.
"""

import threading

import pytest
from googleapiclient.errors import HttpError

from app import drive
from app.routers import drive as drive_router
from app.schemas import ArquivarRequest


# ── Camada 1: um cliente por thread ───────────────────────────────────────────
def test_service_e_o_mesmo_dentro_da_mesma_thread(monkeypatch):
    """Caminho sequencial idêntico ao de antes: quem chama duas vezes recebe o mesmo cliente."""
    monkeypatch.setattr(drive, "_local", threading.local())
    monkeypatch.setattr(drive, "_construir_drive_service", lambda: object())

    assert drive.get_drive_service() is drive.get_drive_service()


def test_cada_thread_recebe_o_seu_proprio_service(monkeypatch):
    """A correção da raiz: threads diferentes NUNCA compartilham o mesmo cliente (nem a conexão)."""
    monkeypatch.setattr(drive, "_local", threading.local())
    monkeypatch.setattr(drive, "_construir_drive_service", lambda: object())

    # Guarda o OBJETO, não o `id()`: o cache da thread morre junto com ela, e ids de objetos já
    # coletados são reaproveitados pelo CPython, o que faria clientes distintos parecerem o mesmo.
    colhidos: list[object] = []
    trava = threading.Lock()

    def tarefa():
        svc = drive.get_drive_service()
        # Duas chamadas na MESMA thread continuam devolvendo o mesmo objeto.
        assert drive.get_drive_service() is svc
        with trava:
            colhidos.append(svc)

    threads = [threading.Thread(target=tarefa) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(colhidos) == 4
    distintos = {id(s) for s in colhidos}
    assert len(distintos) == 4, "duas threads dividiram o mesmo cliente do Drive"


def test_renovar_troca_o_service_da_thread(monkeypatch):
    """A retentativa precisa de conexão NOVA: repetir na mesma repetiria o erro."""
    monkeypatch.setattr(drive, "_local", threading.local())
    monkeypatch.setattr(drive, "_construir_drive_service", lambda: object())

    antigo = drive.get_drive_service()
    novo = drive.renovar_drive_service()
    assert novo is not antigo
    assert drive.get_drive_service() is novo


# ── Camada 2: retentativa na resolução da pasta ───────────────────────────────
def _req() -> ArquivarRequest:
    return ArquivarRequest(
        parentFolderId="PAI",
        pastaNome="FULANO — CLIENTE",
        arquivos=[],
    )


def test_resolucao_retenta_uma_vez_e_conclui(monkeypatch):
    """Soluço transitório (o `TimeoutError` real) deixa de virar 502: a segunda tentativa passa."""
    chamadas = {"n": 0}

    def resolver_falhando_uma_vez(service, nome, parent):
        chamadas["n"] += 1
        if chamadas["n"] == 1:
            raise TimeoutError("The read operation timed out")
        return "PASTA_OK", True, []

    monkeypatch.setattr(drive, "resolver_pasta_do_funcionario", resolver_falhando_uma_vez)
    monkeypatch.setattr(drive, "renovar_drive_service", lambda: "SERVICE_NOVO")

    service, pasta_id, ja_existia, duplicatas = drive_router._resolver_pasta("SERVICE_VELHO", _req())

    assert chamadas["n"] == 2, "não retentou"
    assert pasta_id == "PASTA_OK"
    assert ja_existia is True
    assert duplicatas == []
    assert service == "SERVICE_NOVO", "retentou na conexão velha em vez de renovar"


def test_resolucao_nao_retenta_quando_da_certo_de_primeira(monkeypatch):
    """Sem falha, nada muda: uma chamada só, na conexão que já estava em uso."""
    chamadas = {"n": 0}

    def resolver(service, nome, parent):
        chamadas["n"] += 1
        return "PASTA", False, [{"id": "DUP1"}]

    monkeypatch.setattr(drive, "resolver_pasta_do_funcionario", resolver)
    monkeypatch.setattr(
        drive,
        "renovar_drive_service",
        lambda: pytest.fail("renovou a conexão sem precisar"),
    )

    service, pasta_id, ja_existia, duplicatas = drive_router._resolver_pasta("SERVICE", _req())

    assert chamadas["n"] == 1
    assert (service, pasta_id, ja_existia, duplicatas) == ("SERVICE", "PASTA", False, ["DUP1"])


def test_resolucao_desiste_apos_a_segunda_falha(monkeypatch):
    """Erro que PERSISTE continua sendo erro: retenta uma vez só, não em laço."""
    chamadas = {"n": 0}

    def sempre_falha(service, nome, parent):
        chamadas["n"] += 1
        raise TimeoutError("The read operation timed out")

    monkeypatch.setattr(drive, "resolver_pasta_do_funcionario", sempre_falha)
    monkeypatch.setattr(drive, "renovar_drive_service", lambda: "SERVICE_NOVO")

    with pytest.raises(TimeoutError):
        drive_router._resolver_pasta("SERVICE", _req())

    assert chamadas["n"] == 2


def test_ancora_continua_vencendo_a_busca_por_nome(monkeypatch):
    """Regra da OST da duplicação preservada: tendo link, vai direto no id e NÃO procura por nome."""
    monkeypatch.setattr(drive, "abrir_pasta_por_id", lambda s, i: {"id": "ANCORADA"})
    monkeypatch.setattr(
        drive,
        "resolver_pasta_do_funcionario",
        lambda *a: pytest.fail("procurou por nome tendo âncora válida"),
    )

    req = ArquivarRequest(
        parentFolderId="PAI", pastaNome="FULANO — CLIENTE", arquivos=[], pastaId="ANCORADA"
    )
    service, pasta_id, ja_existia, duplicatas = drive_router._resolver_pasta("SERVICE", req)

    assert (pasta_id, ja_existia, duplicatas) == ("ANCORADA", True, [])


# ── Camada 4: o texto do log diz a causa REAL ─────────────────────────────────
def test_timeout_nao_acusa_o_cadastro_da_pasta_pai():
    """A frase que mandou o diretor conferir mapeamento à toa não pode voltar para o timeout."""
    texto = drive_router._causa_provavel(TimeoutError("timed out"))
    assert "NÃO está em questão" in texto
    assert "não enxerga essa pasta-pai" not in texto


def test_erro_do_google_continua_apontando_permissao_e_id():
    """Onde a causa antiga era verdadeira (erro do Google), o texto permanece."""
    erro = HttpError(resp=type("R", (), {"status": 403, "reason": "Forbidden"})(), content=b"{}")
    texto = drive_router._causa_provavel(erro)
    assert "não enxerga essa pasta-pai" in texto
