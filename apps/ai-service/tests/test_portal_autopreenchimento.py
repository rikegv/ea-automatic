"""O AUTO-PREENCHIMENTO do Portal: a rota devolve VALORES, e nenhum deles vai para o log.

Quatro promessas sob teste, e a terceira é a que o `seguranca` vai tentar quebrar:
 1. a rota devolve `sugestoes` com os valores lidos, e o bloco se ANUNCIA como sugestão (V12);
 2. campo de baixa confiança, vazio ou de desistência volta VAZIO e marcado, NUNCA chutado;
 3. **nenhum valor extraído aparece em log**, em caminho nenhum, nem no de erro;
 4. a auditoria da ESTEIRA não mudou: sem campos pedidos, schema, instrução e prompt são os de antes.
"""

import logging
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app import gemini, portal_bucket, portal_extracao
from app.config import get_settings
from app.main import app
from tests.test_portal_leitor import AUTH, BUCKET, FakeBlob, FakeClient  # reuso do arnês

client = TestClient(app)

# Valores plausíveis e falsos, escolhidos para serem INCONFUNDÍVEIS num log: se qualquer um deles
# aparecer numa linha registrada, o teste sabe exatamente qual regra caiu.
RG_LIDO = "12.345.678-9"
NOME_LIDO = "Fulano De Tal Da Silva"
MAE_LIDA = "Sicrana De Tal"


def _pdf() -> bytes:
    escritor = PdfWriter()
    escritor.add_blank_page(width=200, height=200)
    buf = BytesIO()
    escritor.write(buf)
    return buf.getvalue()


@pytest.fixture
def portal_ligado(monkeypatch):
    monkeypatch.setenv("PORTAL_BUCKET", BUCKET)
    get_settings.cache_clear()
    monkeypatch.setattr(
        portal_bucket,
        "get_storage_client",
        lambda: FakeClient({"entrada/abc.pdf": FakeBlob(_pdf())}),
    )
    yield
    get_settings.cache_clear()


def _corpo(tipo: str = "RG") -> dict:
    return {
        "bucket": BUCKET,
        "objeto": "entrada/abc.pdf",
        "tipoDocumentoCodigo": tipo,
        "tipoDocumentoNome": tipo,
        "candidato": {"nome": "Fulano de Tal", "cpf": "529.982.247-25"},
        "regras": [{"descricaoRegra": "O documento deve estar legível."}],
    }


def _gemini_com(extraidos: list[dict], monkeypatch, capturado: dict | None = None):
    def _falso(**kwargs):
        if capturado is not None:
            capturado.update(kwargs)
        return {
            "status": "VALIDADO",
            "motivo": "ok",
            "camposConferidos": ["nome"],
            "camposExtraidos": extraidos,
        }

    monkeypatch.setattr(gemini, "auditar_documento", _falso)


# ── 1. A rota devolve valores, e diz que são sugestão ──────────────────────
def test_devolve_os_valores_extraidos_alem_do_veredicto(portal_ligado, monkeypatch):
    capturado: dict = {}
    _gemini_com(
        [
            {"campo": "rgNumero", "valor": RG_LIDO, "confianca": 0.96},
            {"campo": "nomeCompleto", "valor": NOME_LIDO, "confianca": 0.91},
        ],
        monkeypatch,
        capturado,
    )
    dado = client.post("/portal/ler", json=_corpo(), headers=AUTH).json()

    # O veredicto continua onde estava: o auto-preenchimento ACRESCENTA, não troca.
    assert dado["auditoria"]["status"] == "VALIDADO"
    por_campo = {c["campo"]: c for c in dado["sugestoes"]["campos"]}
    assert por_campo["rgNumero"]["valor"] == RG_LIDO
    assert por_campo["rgNumero"]["lido"] is True
    assert por_campo["rgNumero"]["confianca"] == 0.96
    assert por_campo["nomeCompleto"]["valor"] == NOME_LIDO
    # V12: a FORMA anuncia que é sugestão, para nenhum consumidor tratar como dado conferido.
    assert dado["sugestoes"]["origem"] == "IA_SUGESTAO"
    assert dado["sugestoes"]["exigeConfirmacaoHumana"] is True
    # Uma passada só pelo arquivo: a extração viajou NA chamada da auditoria.
    assert {c["campo"] for c in capturado["campos_a_extrair"]} == {
        a.campo for a in portal_extracao.campos_para("RG")
    }


def test_todo_campo_do_catalogo_volta_mesmo_sem_o_modelo_citar(portal_ligado, monkeypatch):
    """A tela precisa saber o que foi perguntado e não obtido, para pedir ao candidato."""
    _gemini_com([{"campo": "rgNumero", "valor": RG_LIDO, "confianca": 0.9}], monkeypatch)
    dado = client.post("/portal/ler", json=_corpo(), headers=AUTH).json()
    assert {c["campo"] for c in dado["sugestoes"]["campos"]} == {
        a.campo for a in portal_extracao.campos_para("RG")
    }
    assert [c for c in dado["sugestoes"]["campos"] if c["campo"] == "nomeMae"][0]["lido"] is False


def test_tipo_sem_catalogo_nao_sugere_nada_e_a_auditoria_segue(portal_ligado, monkeypatch):
    capturado: dict = {}
    _gemini_com([], monkeypatch, capturado)
    dado = client.post("/portal/ler", json=_corpo("BANCO_EXCLUSIVO"), headers=AUTH).json()
    assert dado["sugestoes"] is None
    assert dado["auditoria"]["status"] == "VALIDADO"
    assert capturado["campos_a_extrair"] is None


def test_arquivo_recusado_nao_tem_sugestao(portal_ligado, monkeypatch):
    def _nunca(**kwargs):  # noqa: ARG001
        raise AssertionError("sem regra não se chama a IA, e sem IA não há sugestão")

    monkeypatch.setattr(gemini, "auditar_documento", _nunca)
    dado = client.post("/portal/ler", json=_corpo() | {"regras": []}, headers=AUTH).json()
    assert dado["sugestoes"] is None


# ── 2. Baixa confiança volta VAZIO, nunca chutado ──────────────────────────
@pytest.mark.parametrize(
    "item",
    [
        {"campo": "rgNumero", "valor": RG_LIDO, "confianca": 0.69},  # abaixo do piso
        {"campo": "rgNumero", "valor": RG_LIDO, "confianca": "alta"},  # confiança não numérica
        {"campo": "rgNumero", "valor": RG_LIDO},  # confiança ausente
        {"campo": "rgNumero", "valor": "   ", "confianca": 0.99},  # vazio disfarçado
        {"campo": "rgNumero", "valor": "não informado", "confianca": 0.99},  # desistência em texto
        {"campo": "rgNumero", "valor": "x" * 200, "confianca": 0.99},  # texto vazando pelo campo
    ],
)
def test_campo_sem_leitura_confiavel_volta_vazio_e_marcado(portal_ligado, monkeypatch, item):
    _gemini_com([item], monkeypatch)
    dado = client.post("/portal/ler", json=_corpo(), headers=AUTH).json()
    rg = [c for c in dado["sugestoes"]["campos"] if c["campo"] == "rgNumero"][0]
    assert rg["valor"] == ""
    assert rg["lido"] is False
    assert rg["confianca"] == 0.0


def test_chave_inventada_pelo_modelo_e_descartada(portal_ligado, monkeypatch):
    """Catálogo fechado: campo que ninguém pediu não tem onde ser guardado e não volta."""
    _gemini_com([{"campo": "salarioPretendido", "valor": "9999", "confianca": 1.0}], monkeypatch)
    dado = client.post("/portal/ler", json=_corpo(), headers=AUTH).json()
    assert all(c["campo"] != "salarioPretendido" for c in dado["sugestoes"]["campos"])
    assert "9999" not in str(dado["sugestoes"])


def test_resposta_sem_veredicto_estruturado_nao_traz_valor(monkeypatch):
    """Resposta em que não se confia para o status não merece confiança para o conteúdo."""
    monkeypatch.setattr(
        gemini,
        "_extrair_json",
        lambda _r: {"status": "SEI_LA", "camposExtraidos": [{"campo": "cpf", "valor": RG_LIDO}]},
    )
    monkeypatch.setattr(gemini, "chamar_com_backoff", lambda f, o_que: None)  # noqa: ARG005
    out = gemini.auditar_documento(
        partes=[(b"%PDF-", "application/pdf")],
        tipo_documento_nome="CPF",
        candidato_nome="Fulano",
        candidato_cpf="529.982.247-25",
        regras=["legível"],
        campos_a_extrair=[{"campo": "cpf", "rotulo": "CPF", "formato": "digitos"}],
    )
    assert out["camposExtraidos"] == []


# ── 3. §A.6: valor extraído NÃO vai para log ───────────────────────────────
def test_nenhum_valor_extraido_vai_para_o_log(portal_ligado, monkeypatch, caplog):
    """A regra mais sensível da entrega: a resposta carrega PII, o log carrega CONTAGEM.

    Captura-se a árvore INTEIRA de logs (`caplog.set_level` na raiz), não só a do leitor, porque um
    vazamento pelo logger do motor ou de uma biblioteca valeria tanto quanto um vazamento pelo nosso.
    """
    caplog.set_level(logging.DEBUG)
    _gemini_com(
        [
            {"campo": "rgNumero", "valor": RG_LIDO, "confianca": 0.97},
            {"campo": "nomeCompleto", "valor": NOME_LIDO, "confianca": 0.93},
            {"campo": "nomeMae", "valor": MAE_LIDA, "confianca": 0.88},
        ],
        monkeypatch,
    )
    resp = client.post("/portal/ler", json=_corpo(), headers=AUTH)

    # Os valores estão na RESPOSTA, que é para onde eles devem ir.
    assert RG_LIDO in resp.text
    # E não estão em NENHUMA linha de log, nem na mensagem nem no rastro formatado.
    registrado = "\n".join(caplog.messages) + "\n" + caplog.text
    for valor in (RG_LIDO, NOME_LIDO, MAE_LIDA):
        assert valor not in registrado
    # O que se registra é quantidade e resultado: 3 de 8 campos lidos.
    assert "3 de 8" in caplog.text


def test_valor_extraido_nao_vaza_nem_quando_a_ia_falha(portal_ligado, monkeypatch, caplog):
    """Caminho de ERRO, que é por onde PII costuma escapar: exceção com o dado dentro."""
    caplog.set_level(logging.DEBUG)

    def _explode(**kwargs):  # noqa: ARG001
        raise RuntimeError(f"falha ao ler {RG_LIDO} de {NOME_LIDO}")

    monkeypatch.setattr(gemini, "auditar_documento", _explode)
    with pytest.raises(RuntimeError):
        client.post("/portal/ler", json=_corpo(), headers=AUTH)
    # A exceção é do teste (o motor falso), mas a régua é: NÓS não escrevemos valor em log.
    nosso = [r for r in caplog.records if r.name.startswith("ea.ai")]
    for registro in nosso:
        assert RG_LIDO not in registro.getMessage()
        assert NOME_LIDO not in registro.getMessage()


def test_o_modulo_de_extracao_nao_tem_logger(portal_ligado):
    """Tranca estrutural: o módulo que manipula o valor não tem como registrá-lo."""
    fonte = portal_extracao.__file__ or ""
    with open(fonte, encoding="utf-8") as f:
        texto = f.read()
    assert "import logging" not in texto
    assert "getLogger" not in texto


# ── 4. A auditoria da ESTEIRA não mudou ────────────────────────────────────
def test_sem_campos_pedidos_o_prompt_e_o_schema_sao_os_de_antes():
    prompt_antigo = gemini.montar_prompt_auditoria(
        tipo_documento_nome="RG",
        candidato_nome="Fulano",
        candidato_cpf="529.982.247-25",
        regras=["legível"],
        hoje="2026-09-18",
    )
    assert "CAMPOS PARA EXTRAIR" not in prompt_antigo
    assert gemini._schema_auditoria(None) is gemini._AUDITORIA_SCHEMA


def test_com_campos_pedidos_o_prompt_lista_as_chaves_e_manda_nao_chutar():
    prompt = gemini.montar_prompt_auditoria(
        tipo_documento_nome="RG",
        candidato_nome="Fulano",
        candidato_cpf="529.982.247-25",
        regras=["legível"],
        hoje="2026-09-18",
        campos_a_extrair=[{"campo": "rgNumero", "rotulo": "Número do RG", "formato": "texto"}],
    )
    assert "CAMPOS PARA EXTRAIR" in prompt
    assert "rgNumero" in prompt
    assert "valor vazio e confianca 0" in prompt
