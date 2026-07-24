"""OST do Drive, Blocos 2 e 3 — CHECAR ANTES DE CRIAR e CHECAR ANTES DE SUBIR.

O defeito medido no acervo real: 7 subpastas com arquivo repetido e 30 cópias EXTRAS do mesmo
conteúdo, mais 4 pastas de prontuário com nome duplicado sob a mesma pasta-pai. A causa é a soma de
dois fatos: a staging ganha uma cópia NOVA a cada auditoria do documento (nome com uuid próprio), e
o arquivamento sobe a staging INTEIRA sem perguntar o que já está lá.

Estes testes trocam o cliente do Google por um duplo em memória, então cobrem o caminho REAL do
router (o de produção), sem rede.
"""

import hashlib

from fastapi.testclient import TestClient

from app.main import app
from app.routers import drive as drive_router

client = TestClient(app)
HEADERS = {"X-Internal-Token": "test-token"}

PDF_A = b"%PDF-1.7 conteudo A"
PDF_B = b"%PDF-1.7 conteudo B"


def _md5(b: bytes) -> str:
    return hashlib.md5(b, usedforsecurity=False).hexdigest()


class DriveFake:
    """Duplo do client do Google: guarda pastas e arquivos em memória, com md5 real."""

    def __init__(self, pastas_existentes=None, arquivos_existentes=None):
        # {(nome, parent): [id, ...]} - lista para simular duplicata pré-existente.
        self.pastas = dict(pastas_existentes or {})
        # {parent_id: [ {"md5": ..., "nome": ...} ]}
        self.arquivos = dict(arquivos_existentes or {})
        self.criacoes_de_pasta = 0
        self.uploads = 0
        # Corpos enviados ao `files().create`, para inspecionar a marca de origem (Bloco 3).
        self.corpos_criados: list[dict] = []
        self._seq = 0

    # ── superfície usada pelo módulo drive.py ──────────────────────────────
    def files(self):
        return self

    def list(self, *, q, fields, spaces, supportsAllDrives, includeItemsFromAllDrives,
             pageSize=100, pageToken=None, orderBy=None):
        self._ultima_query = q
        return self

    def create(self, *, body=None, fields=None, supportsAllDrives=None, media_body=None):
        self._pendente = ("create", body, media_body)
        return self

    def get(self, *, fileId, fields, supportsAllDrives):
        self._pendente = ("get", fileId, None)
        return self

    def execute(self):
        acao = getattr(self, "_pendente", None)
        if acao is None:
            return self._executar_list()
        self._pendente = None
        tipo, a, b = acao
        if tipo == "get":
            return {"webViewLink": f"https://drive.google.com/drive/folders/{a}"}
        # create: pasta ou arquivo
        self.corpos_criados.append(a)
        if a.get("mimeType") == "application/vnd.google-apps.folder":
            self.criacoes_de_pasta += 1
            self._seq += 1
            novo = f"pasta-{self._seq}"
            self.pastas.setdefault((a["name"], a["parents"][0]), []).append(novo)
            return {"id": novo}
        self.uploads += 1
        self._seq += 1
        conteudo = b._conteudo  # noqa: SLF001 - duplo de teste
        self.arquivos.setdefault(a["parents"][0], []).append(
            {"md5": _md5(conteudo), "nome": a["name"]}
        )
        return {"id": f"arq-{self._seq}"}

    def _executar_list(self):
        q = self._ultima_query
        # Query de pasta por nome: "name = 'X' and mimeType = '...folder' and 'PAI' in parents ..."
        if "mimeType = 'application/vnd.google-apps.folder'" in q:
            nome = q.split("name = '")[1].split("'")[0]
            pai = q.split("and '")[1].split("' in parents")[0]
            ids = self.pastas.get((nome, pai), [])
            return {"files": [{"id": i, "createdTime": f"2026-01-0{n + 1}"} for n, i in enumerate(ids)]}
        # Query de arquivos da pasta: "'PARENT' in parents and trashed = false"
        pai = q.split("'")[1]
        return {"files": [{"md5Checksum": a["md5"]} for a in self.arquivos.get(pai, [])]}


class MediaFake:
    def __init__(self, conteudo, mimetype=None, resumable=False):
        self._conteudo = conteudo


def _montar(monkeypatch, fake: DriveFake, conteudos: dict[str, bytes]):
    monkeypatch.setattr(drive_router.drive, "get_drive_service", lambda: fake)
    monkeypatch.setattr(drive_router.drive, "MediaInMemoryUpload", MediaFake)
    monkeypatch.setattr(drive_router, "ler_staging", lambda p: conteudos[p])


def _req(arquivos):
    return {"parentFolderId": "PAI", "pastaNome": "Fulano — OP", "arquivos": arquivos}


def test_lote_com_copias_identicas_sobe_uma_vez_so(monkeypatch):
    """O caso REAL: a staging tem 3 cópias do mesmo documento (uma por auditoria)."""
    fake = DriveFake()
    _montar(monkeypatch, fake, {"/s/1": PDF_A, "/s/2": PDF_A, "/s/3": PDF_A})
    resp = client.post(
        "/drive/arquivar",
        json=_req(
            [
                {"stagingPath": f"/s/{i}", "nomeFinal": f"RG_Fulano_{i}", "subpasta": "DOCUMENTOS_PESSOAIS"}
                for i in (1, 2, 3)
            ]
        ),
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["arquivados"] == 1, "só o primeiro sobe"
    assert body["ignorados"] == 2, "as duas cópias idênticas são puladas"
    assert fake.uploads == 1


def test_arquivo_ja_no_destino_nao_sobe_de_novo(monkeypatch):
    """Rearquivar uma admissão já arquivada não pode duplicar o prontuário."""
    fake = DriveFake(
        pastas_existentes={("Fulano — OP", "PAI"): ["pasta-func"],
                           ("DOCUMENTOS PESSOAIS", "pasta-func"): ["sub-docs"]},
        arquivos_existentes={"sub-docs": [{"md5": _md5(PDF_A), "nome": "RG_Fulano"}]},
    )
    _montar(monkeypatch, fake, {"/s/1": PDF_A, "/s/2": PDF_B})
    resp = client.post(
        "/drive/arquivar",
        json=_req(
            [
                {"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"},
                {"stagingPath": "/s/2", "nomeFinal": "CPF_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"},
            ]
        ),
        headers=HEADERS,
    )
    body = resp.json()
    assert body["arquivados"] == 1, "só o conteúdo novo sobe"
    assert body["ignorados"] == 1
    assert body["pastaJaExistia"] is True, "a pasta foi REUTILIZADA, e a tela precisa saber"
    assert fake.criacoes_de_pasta == 0, "nenhuma pasta nova foi criada"


def test_pasta_existente_e_reutilizada_e_nao_recriada(monkeypatch):
    fake = DriveFake(pastas_existentes={("Fulano — OP", "PAI"): ["pasta-func"]})
    _montar(monkeypatch, fake, {"/s/1": PDF_A})
    resp = client.post(
        "/drive/arquivar",
        json=_req([{"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"}]),
        headers=HEADERS,
    )
    body = resp.json()
    assert body["pastaJaExistia"] is True
    assert body["pastaUrl"].endswith("pasta-func"), "gravou o link da pasta REUTILIZADA"
    # Só a SUBPASTA foi criada (ela não existia); a pasta do funcionário, não.
    assert fake.criacoes_de_pasta == 1


def test_pasta_duplicada_preexistente_converge_para_a_mais_antiga(monkeypatch):
    """Já há duas pastas de mesmo nome (resíduo de corrida). Todo mundo passa a usar a mais antiga."""
    fake = DriveFake(pastas_existentes={("Fulano — OP", "PAI"): ["antiga", "nova"]})
    _montar(monkeypatch, fake, {"/s/1": PDF_A})
    resp = client.post(
        "/drive/arquivar",
        json=_req([{"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"}]),
        headers=HEADERS,
    )
    assert resp.json()["pastaUrl"].endswith("antiga")


def test_pasta_nova_nasce_quando_nao_existe_nada(monkeypatch):
    fake = DriveFake()
    _montar(monkeypatch, fake, {"/s/1": PDF_A})
    resp = client.post(
        "/drive/arquivar",
        json=_req([{"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"}]),
        headers=HEADERS,
    )
    body = resp.json()
    assert body["pastaJaExistia"] is False
    assert body["arquivados"] == 1
    assert body["ignorados"] == 0
    assert fake.criacoes_de_pasta == 2, "pasta do funcionário + subpasta"


def test_falha_ao_ler_staging_vira_502_nomeado(monkeypatch):
    """Arquivo que sumiu do disco não pode virar HTTP 500 anônimo (o caso do segundo prontuário)."""
    fake = DriveFake()
    monkeypatch.setattr(drive_router.drive, "get_drive_service", lambda: fake)
    monkeypatch.setattr(drive_router.drive, "MediaInMemoryUpload", MediaFake)

    conteudos = {"/s/1": PDF_A}

    def ler(p):
        if p not in conteudos:
            raise FileNotFoundError(p)
        return conteudos[p]

    monkeypatch.setattr(drive_router, "ler_staging", ler)
    resp = client.post(
        "/drive/arquivar",
        json=_req(
            [
                {"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"},
                {"stagingPath": "/s/sumiu", "nomeFinal": "CPF_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"},
            ]
        ),
        headers=HEADERS,
    )
    assert resp.status_code == 502, "502 (falha nomeada), não 500 cru"
    detalhe = resp.json()["detail"]
    assert "2 de 2" in detalhe, "diz QUAL arquivo do lote falhou"
    assert "1 arquivo(s) foram enviados" in detalhe, "diz quantos já subiram"


def test_falha_ao_ler_link_da_pasta_vira_502_nomeado(monkeypatch):
    """O último passo também estava sem tratamento: falhar nele perdia um envio bem-sucedido."""
    fake = DriveFake()
    _montar(monkeypatch, fake, {"/s/1": PDF_A})

    def explode(_svc, _fid):
        raise RuntimeError("timeout lendo webViewLink")

    monkeypatch.setattr(drive_router.drive, "pasta_web_link", explode)
    resp = client.post(
        "/drive/arquivar",
        json=_req([{"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"}]),
        headers=HEADERS,
    )
    assert resp.status_code == 502
    assert "1 arquivo(s) foram enviados" in resp.json()["detail"]


def test_pasta_nova_recebe_marca_de_origem_na_descricao(monkeypatch):
    """Bloco 3: pasta CRIADA pelo sistema se identifica na descrição, nunca no nome."""
    fake = DriveFake()
    _montar(monkeypatch, fake, {"/s/1": PDF_A})
    client.post(
        "/drive/arquivar",
        json=_req([{"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"}]),
        headers=HEADERS,
    )
    criadas = [b for b in fake.corpos_criados if b.get("mimeType", "").endswith("folder")]
    assert criadas, "alguma pasta foi criada"
    for body in criadas:
        assert body["description"].startswith("Criada automaticamente pelo EA Automatic em ")
        assert "—" not in body["description"], "§A.11: sem travessão"
    # O NOME segue intocado: é a chave do reaproveitamento.
    assert criadas[0]["name"] == "Fulano — OP"


def test_pasta_reutilizada_NAO_recebe_descricao(monkeypatch):
    """Nada é marcado retroativamente, e reaproveitar não reescreve descrição de ninguém."""
    fake = DriveFake(
        pastas_existentes={("Fulano — OP", "PAI"): ["pasta-func"],
                           ("DOCUMENTOS PESSOAIS", "pasta-func"): ["sub-docs"]},
    )
    _montar(monkeypatch, fake, {"/s/1": PDF_A})
    client.post(
        "/drive/arquivar",
        json=_req([{"stagingPath": "/s/1", "nomeFinal": "RG_Fulano", "subpasta": "DOCUMENTOS_PESSOAIS"}]),
        headers=HEADERS,
    )
    criadas = [b for b in fake.corpos_criados if b.get("mimeType", "").endswith("folder")]
    assert criadas == [], "nenhuma pasta criada, nenhuma descrição escrita"


def test_texto_da_marca_de_origem():
    from datetime import UTC, datetime

    from app.drive import descricao_de_criacao

    txt = descricao_de_criacao(datetime(2026, 7, 23, tzinfo=UTC))
    assert txt == "Criada automaticamente pelo EA Automatic em 23/07/2026."
