"""Testes da RECUSA do token: nada escapa cru, e a razao vem por codigo.

Dois defeitos medidos em producao motivam este arquivo:

  A) `jwt.get_unverified_header` estava FORA de qualquer try. Token malformado ('abc', 'a.b',
     token truncado em um caractere) levantava jwt.DecodeError, que ATRAVESSAVA o
     `except TokenInvalido` da Cloud Function: a funcao estourava, e o candidato que ja tinha
     preenchido o formulario inteiro lia "nao foi possivel enviar" e tentava para sempre.

  B) Os tres motivos de recusa (venceu / nao fecha / nem veio) chegavam a tela como a mesma
     frase. Agora cada TokenInvalido carrega um `codigo`: EXPIRADO, INVALIDO ou AUSENTE.

Chave EFEMERA propria (como o test_verifier.py ja faz no caso de expiracao) para nao depender
da chave privada do EA, que vive so no EA.

LGPD (§A.6): os CPFs e nomes aqui sao ficticios, e nenhum teste imprime token ou claim.
"""

import os
import sys
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import vt_token  # noqa: E402
from vt_token import (  # noqa: E402
    CODIGO_AUSENTE,
    CODIGO_EXPIRADO,
    CODIGO_INVALIDO,
    TokenInvalido,
    verificar_token,
)

CPF = "11122233344"
NASC_HASH = "cc81bcae6e8296639ab52f53a7e1fc59100b7d9897d0a8624f34706e33ef4f23"


@pytest.fixture()
def chave_efemera(monkeypatch):
    """Passa a confiar numa chave gerada na hora, so durante o teste."""
    sk = Ed25519PrivateKey.generate()
    raw_pub = sk.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    monkeypatch.setattr(vt_token, "PUBLIC_KEY_RAW", raw_pub)
    return sk


def _cunhar(sk, **extra):
    agora = int(time.time())
    claims = {
        "sub": "00000000-0000-0000-0000-000000000001",
        "nome": "MARIA DE TESTE SILVA",
        "cpf": CPF,
        "nascHash": NASC_HASH,
        "iat": agora,
        "exp": agora + 600,
    }
    claims.update(extra)
    return jwt.encode(claims, sk, algorithm="EdDSA", headers={"typ": "JWT"})


# ── Defeito A: malformado nao escapa mais ──────────────────────────────────────
@pytest.mark.parametrize("token", ["abc", "a.b", "so.dois", "....", "a.b.c"])
def test_token_malformado_vira_token_invalido(token):
    """Sem TokenInvalido aqui, o pytest.raises falha e o DecodeError aparece no relatorio."""
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token)
    assert exc.value.codigo == CODIGO_INVALIDO


def test_token_truncado_em_um_caractere(chave_efemera):
    """O caso real do link copiado pela metade: um caractere a menos no fim."""
    token = _cunhar(chave_efemera)
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token[:-1])
    assert exc.value.codigo == CODIGO_INVALIDO


@pytest.mark.parametrize("token", ["abc", "a.b", "\ud800", "eyJhbGciOiJFZERTQSJ9", "x" * 500])
def test_nenhum_erro_cru_de_biblioteca_escapa(token):
    """A regra dura: SO TokenInvalido sai daqui.

    Se qualquer jwt.DecodeError, jwt.InvalidTokenError ou UnicodeEncodeError (o surrogate solto
    que o JSON do corpo aceita) voltar a escapar, este teste quebra antes de chegar em producao.
    """
    try:
        verificar_token(token)
    except TokenInvalido:
        pass
    except BaseException as exc:  # noqa: BLE001
        pytest.fail(f"escapou excecao crua: {type(exc).__name__}")
    else:
        pytest.fail("token quebrado nao deveria ter sido aceito")


def test_decode_error_e_subclasse_de_invalid_token_error():
    """Ancora do desenho: tratar InvalidTokenError cobre DecodeError, nao o contrario."""
    assert issubclass(jwt.DecodeError, jwt.InvalidTokenError)
    assert issubclass(jwt.ExpiredSignatureError, jwt.InvalidTokenError)


# ── Defeito B: a razao da recusa vem por codigo ────────────────────────────────
def test_token_expirado_traz_codigo_expirado(chave_efemera):
    agora = int(time.time())
    token = _cunhar(chave_efemera, iat=agora - 7200, exp=agora - 3600)
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token)
    assert exc.value.codigo == CODIGO_EXPIRADO


@pytest.mark.parametrize("token", [None, "", 0, 12345, b"token", {"token": "x"}, []])
def test_token_ausente_ou_nao_string_traz_codigo_ausente(token):
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token)
    assert exc.value.codigo == CODIGO_AUSENTE


@pytest.mark.parametrize("claim", ["sub", "nome", "cpf", "nascHash"])
def test_claim_obrigatorio_vazio_traz_codigo_invalido(chave_efemera, claim):
    """Assinatura fecha, mas falta claim obrigatorio: e INVALIDO, nao EXPIRADO."""
    token = _cunhar(chave_efemera, **{claim: ""})
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token)
    assert exc.value.codigo == CODIGO_INVALIDO
    assert claim in str(exc.value)  # nomeia a CHAVE que faltou, nunca o VALOR de nenhuma outra


def test_assinatura_que_nao_fecha_traz_codigo_invalido(chave_efemera):
    """Cunhado por OUTRA chave: a assinatura nao fecha sob a chave confiada."""
    outra = Ed25519PrivateKey.generate()
    token = _cunhar(outra)
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token)
    assert exc.value.codigo == CODIGO_INVALIDO


def test_alg_inesperado_traz_codigo_invalido():
    """Alg confusion: HS256 e recusado como INVALIDO, e nao como expirado."""
    forjado = jwt.encode({"sub": "x", "exp": int(time.time()) + 600}, "segredo", algorithm="HS256")
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(forjado)
    assert exc.value.codigo == CODIGO_INVALIDO


def test_token_valido_continua_passando(chave_efemera):
    """A correcao nao pode ter fechado a porta de quem tem link bom."""
    claims = verificar_token(_cunhar(chave_efemera))
    assert claims["cpf"] == CPF
    assert claims["nascHash"] == NASC_HASH


# ── Compatibilidade e LGPD ─────────────────────────────────────────────────────
def test_token_invalido_continua_uma_excecao_comum():
    """Quem ja capturava TokenInvalido e lia str(exc) nao muda de comportamento."""
    exc = TokenInvalido("token invalido")
    assert isinstance(exc, Exception)
    assert str(exc) == "token invalido"
    assert exc.codigo == CODIGO_INVALIDO  # o padrao, para quem levanta sem informar


@pytest.mark.parametrize("token", ["abc", "a.b", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.zzz"])
def test_a_mensagem_nao_carrega_pedaco_do_token(token):
    """§A.6: nem a mensagem nem o encadeamento da excecao levam o token junto."""
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token)
    texto = str(exc.value)
    assert token not in texto
    assert token[:8] not in texto
    # `from None` em todos os raises que nascem dentro de um except: nenhuma excecao de
    # biblioteca fica encadeada, entao nenhum traceback dela acompanha a falha. Quando o raise
    # nasce fora de except (o alg inesperado), simplesmente nao ha contexto a suprimir.
    assert exc.value.__cause__ is None
    assert exc.value.__context__ is None or exc.value.__suppress_context__ is True


def test_claims_de_token_valido_nao_vazam_na_mensagem_de_expiracao(chave_efemera):
    """O token expirado tem CPF e nome dentro; a frase de recusa nao pode ter nenhum dos dois."""
    agora = int(time.time())
    token = _cunhar(chave_efemera, iat=agora - 7200, exp=agora - 3600)
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token)
    texto = str(exc.value)
    assert CPF not in texto
    assert "MARIA" not in texto.upper()
    assert NASC_HASH not in texto
