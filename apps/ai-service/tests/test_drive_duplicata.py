"""OST DA DUPLICAÇÃO DE PASTA. Âncora pelo id, escolha da pasta MAIS COMPLETA e aviso das extras.

O acervo real tinha 16 prontuários com pasta duplicada, todas nascidas com 8 a 65 segundos de
diferença: duas execuções simultâneas procuravam por nome, as duas não achavam, as duas criavam.
Estes testes cobrem o caminho REAL do router (o de produção), com um duplo do client do Google.
"""

from fastapi.testclient import TestClient

from app import drive as drive_mod
from app.main import app
from app.routers import drive as drive_router

client = TestClient(app)
HEADERS = {"X-Internal-Token": "test-token"}
FOLDER = "application/vnd.google-apps.folder"
PDF = b"%PDF-1.7 documento"


class DriveFake:
    """Duplo com o suficiente para pasta por nome, conteúdo por pasta e busca por id."""

    def __init__(self):
        # id -> {"name","parents","createdTime","trashed","mimeType"}
        self.itens: dict[str, dict] = {}
        self.criacoes_de_pasta = 0
        self._seq = 0

    # ── montagem do cenário ────────────────────────────────────────────────
    def add_pasta(self, id_, nome, pai, criada_em, arquivos=0):
        self.itens[id_] = {
            "id": id_,
            "name": nome,
            "parents": [pai],
            "createdTime": criada_em,
            "trashed": False,
            "mimeType": FOLDER,
        }
        for n in range(arquivos):
            self._seq += 1
            fid = f"{id_}-arq{n}"
            self.itens[fid] = {
                "id": fid,
                "name": f"doc{n}",
                "parents": [id_],
                "createdTime": criada_em,
                "trashed": False,
                "mimeType": "application/pdf",
            }
        return id_

    # ── superfície usada pelo drive.py ─────────────────────────────────────
    def files(self):
        return self

    def list(self, **kw):
        self._pendente = ("list", kw.get("q"), None)
        return self

    def create(self, *, body=None, fields=None, supportsAllDrives=None, media_body=None):
        self._pendente = ("create", body, media_body)
        return self

    def get(self, *, fileId, fields, supportsAllDrives):
        self._pendente = ("get", fileId, None)
        return self

    def execute(self):
        tipo, a, _b = self._pendente
        self._pendente = None
        if tipo == "get":
            item = self.itens.get(a)
            if item is None:
                from googleapiclient.errors import HttpError

                raise HttpError(_Resp(404), b"nao encontrado")
            if "webViewLink" in (a or ""):
                pass
            return {**item, "webViewLink": f"https://drive.google.com/drive/folders/{a}"}
        if tipo == "create":
            if a.get("mimeType") == FOLDER:
                self.criacoes_de_pasta += 1
                self._seq += 1
                novo = f"nova-{self._seq}"
                self.add_pasta(novo, a["name"], a["parents"][0], "2026-07-30T10:00:00Z")
                return {"id": novo}
            self._seq += 1
            return {"id": f"arq-{self._seq}"}
        return self._listar(a)

    def _listar(self, q: str):
        if f"mimeType = '{FOLDER}'" in q:
            nome = q.split("name = '")[1].split("'")[0]
            pai = q.split("and '")[1].split("' in parents")[0]
            achados = [
                i
                for i in self.itens.values()
                if i["mimeType"] == FOLDER and i["name"] == nome and pai in i["parents"]
            ]
        else:
            pai = q.split("'")[1]
            achados = [i for i in self.itens.values() if pai in i["parents"]]
        achados.sort(key=lambda i: i["createdTime"])
        return {"files": achados}


class _Resp:
    def __init__(self, status):
        self.status = status
        self.reason = "erro"


class MediaFake:
    def __init__(self, conteudo, mimetype=None, resumable=False):
        self._conteudo = conteudo


def _montar(monkeypatch, fake):
    monkeypatch.setattr(drive_router.drive, "get_drive_service", lambda: fake)
    monkeypatch.setattr(drive_router.drive, "MediaInMemoryUpload", MediaFake)
    monkeypatch.setattr(drive_router, "ler_staging", lambda p: PDF)
    monkeypatch.setattr(drive_router.drive, "md5_existentes", lambda s, p: set())


def _req(**extra):
    base = {
        "parentFolderId": "PAI",
        "pastaNome": "FULANO DE TAL — OPERACAO",
        "arquivos": [
            {"stagingPath": "/s/1", "nomeFinal": "RG_FULANO", "subpasta": "DOCUMENTOS_PESSOAIS"}
        ],
    }
    base.update(extra)
    return base


# ── ÂNCORA: quem tem link não procura, e quem não procura não duplica ──────────────
def test_com_ancora_vai_direto_na_pasta_e_nao_cria_nada(monkeypatch):
    fake = DriveFake()
    fake.add_pasta("PASTA-BOA", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-01T10:00:00Z", arquivos=5)
    _montar(monkeypatch, fake)

    resp = client.post("/drive/arquivar", json=_req(pastaId="PASTA-BOA"), headers=HEADERS)

    assert resp.status_code == 200
    body = resp.json()
    assert "PASTA-BOA" in body["pastaUrl"], "arquivou na pasta ancorada"
    assert body["pastaJaExistia"] is True
    # A única criação possível seria a SUBPASTA de destino, nunca a pasta do funcionário.
    assert fake.criacoes_de_pasta == 1, "criou só a subpasta DOCUMENTOS PESSOAIS"


def test_ancora_que_sumiu_do_drive_cai_na_busca_por_nome(monkeypatch):
    """Pasta apagada à mão não pode derrubar o arquivamento: volta a procurar pelo nome."""
    fake = DriveFake()
    fake.add_pasta("PASTA-VIVA", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-01T10:00:00Z", arquivos=3)
    _montar(monkeypatch, fake)

    resp = client.post("/drive/arquivar", json=_req(pastaId="PASTA-QUE-NAO-EXISTE"), headers=HEADERS)

    assert resp.status_code == 200
    assert "PASTA-VIVA" in resp.json()["pastaUrl"]


# ── SEM ÂNCORA: vence a MAIS COMPLETA, não a mais antiga ───────────────────────────
def test_escolhe_a_pasta_com_mais_documentos_e_avisa_a_outra(monkeypatch):
    """A regra que o diretor corrigiu: a mais ANTIGA pode ser de uma admissão anterior."""
    fake = DriveFake()
    fake.add_pasta("DE-2025", "FULANO DE TAL — OPERACAO", "PAI", "2025-03-01T10:00:00Z", arquivos=2)
    fake.add_pasta("DESTA-ADMISSAO", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-24T10:00:00Z", arquivos=15)
    _montar(monkeypatch, fake)

    resp = client.post("/drive/arquivar", json=_req(), headers=HEADERS)

    body = resp.json()
    assert "DESTA-ADMISSAO" in body["pastaUrl"], "vence a mais completa, não a mais antiga"
    assert body["duplicatas"] == ["DE-2025"], "a outra volta para o diretor apagar"
    assert body["pastaJaExistia"] is True


def test_nunca_trava_por_ambiguidade(monkeypatch):
    """Regra 3 da OST: escolhe a melhor e segue, mesmo com três candidatas."""
    fake = DriveFake()
    fake.add_pasta("A", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-01T10:00:00Z", arquivos=1)
    fake.add_pasta("B", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-02T10:00:00Z", arquivos=9)
    fake.add_pasta("C", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-03T10:00:00Z", arquivos=0)
    _montar(monkeypatch, fake)

    resp = client.post("/drive/arquivar", json=_req(), headers=HEADERS)

    assert resp.status_code == 200, "não trava"
    body = resp.json()
    assert "B" in body["pastaUrl"]
    assert sorted(body["duplicatas"]) == ["A", "C"]


def test_empate_no_numero_de_arquivos_resolve_pela_mais_antiga(monkeypatch):
    """Empate precisa ser determinístico, senão execuções diferentes gravam em pastas diferentes."""
    fake = DriveFake()
    fake.add_pasta("VELHA", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-01T10:00:00Z", arquivos=4)
    fake.add_pasta("NOVA", "FULANO DE TAL — OPERACAO", "PAI", "2026-07-09T10:00:00Z", arquivos=4)
    _montar(monkeypatch, fake)

    resp = client.post("/drive/arquivar", json=_req(), headers=HEADERS)

    assert "VELHA" in resp.json()["pastaUrl"]


# ── ACERVO ANTIGO: hífen e travessão são a MESMA pessoa ────────────────────────────
def test_pasta_do_processo_antigo_com_hifen_e_reaproveitada(monkeypatch):
    """Era a segunda causa de duplicação: nome com hífen nunca casava com o travessão do EA."""
    fake = DriveFake()
    fake.add_pasta("LEGADA", "FULANO DE TAL - OPERACAO", "PAI", "2025-02-01T10:00:00Z", arquivos=12)
    _montar(monkeypatch, fake)

    resp = client.post("/drive/arquivar", json=_req(), headers=HEADERS)

    body = resp.json()
    assert "LEGADA" in body["pastaUrl"], "reaproveitou a pasta do processo antigo"
    assert fake.criacoes_de_pasta == 1, "criou só a subpasta, não um prontuário novo"


def test_sem_nenhuma_pasta_cria_uma(monkeypatch):
    fake = DriveFake()
    _montar(monkeypatch, fake)

    resp = client.post("/drive/arquivar", json=_req(), headers=HEADERS)

    body = resp.json()
    assert body["pastaJaExistia"] is False
    assert body["duplicatas"] == []


# ── unidades puras ────────────────────────────────────────────────────────────────
def test_variantes_do_nome_cobre_as_duas_convencoes():
    assert drive_mod.variantes_do_nome("FULANO — OP") == ["FULANO - OP", "FULANO — OP"]
    assert drive_mod.variantes_do_nome("FULANO - OP") == ["FULANO - OP", "FULANO — OP"]


def test_contar_arquivos_conta_dentro_das_subpastas():
    fake = DriveFake()
    fake.add_pasta("RAIZ", "X", "PAI", "2026-01-01T00:00:00Z", arquivos=2)
    fake.add_pasta("SUB", "DOCUMENTOS PESSOAIS", "RAIZ", "2026-01-01T00:00:00Z", arquivos=7)
    # 2 na raiz + 7 na subpasta; a subpasta em si não conta como arquivo.
    assert drive_mod.contar_arquivos(fake, "RAIZ") == 9


# ── UMA FALHA NÃO DERRUBA O LOTE (OST "o sistema resolve sozinho") ───────────────
def test_timeout_em_um_arquivo_nao_derruba_o_lote_nem_perde_a_pasta(monkeypatch):
    """O defeito real de quatro prontuários: Thais, João, Camila e Douglas.

    O envio era um POST único e, com arquivo grande, estourava `TimeoutError`. Como TimeoutError
    NÃO é `HttpError`, ele escapava do tratamento por arquivo e derrubava a requisição inteira com
    500, DEPOIS de a pasta já existir e parte dos arquivos ter subido. O backend só grava a URL
    quando a resposta chega, então a admissão ficava "sem pasta" tendo pasta no Drive, e alguém
    precisava agir à mão. Agora a falha é contada, o lote segue e o link volta.
    """
    fake = DriveFake()
    _montar(monkeypatch, fake)
    # Conteúdo DIFERENTE por arquivo: com o mesmo conteúdo o dedup por md5 pularia os outros dois e
    # o segundo nem chegaria a ser enviado.
    monkeypatch.setattr(drive_router, "ler_staging", lambda caminho: f"%PDF {caminho}".encode())

    original = drive_mod.subir_arquivo

    def falha_sempre_no_doc_2(service, *, conteudo, nome_final, parent_id):
        # Falha na tentativa E na retentativa: é o timeout que não passa nem insistindo.
        if nome_final == "DOC_2":
            raise TimeoutError("The read operation timed out")
        return original(service, conteudo=conteudo, nome_final=nome_final, parent_id=parent_id)

    monkeypatch.setattr(drive_router.drive, "subir_arquivo", falha_sempre_no_doc_2)

    resp = client.post(
        "/drive/arquivar",
        json=_req(
            arquivos=[
                {"stagingPath": f"/s/{i}", "nomeFinal": f"DOC_{i}", "subpasta": "DOCUMENTOS_PESSOAIS"}
                for i in (1, 2, 3)
            ]
        ),
        headers=HEADERS,
    )

    assert resp.status_code == 200, "não vira mais 500"
    body = resp.json()
    assert "/drive/folders/" in body["pastaUrl"], "o link da pasta volta, que é o que salva o caso"
    assert body["falhas"] == 1
    assert body["motivoFalhas"] == ["TimeoutError"]
    # O segundo falhou na tentativa e na retentativa; o primeiro e o terceiro subiram normalmente.
    assert body["arquivados"] == 2
