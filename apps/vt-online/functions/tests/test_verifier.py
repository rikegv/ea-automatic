"""Testes do verificador de token do VT.

Cobrem:
  - Interoperabilidade com um token REAL cunhado pelo EA (assinatura EdDSA valida sob a chave
    publica embutida) e extracao dos claims.
  - nasc_hash("11122233344|1990-05-20") == o claim nascHash do token real.
  - Reconferencia de identidade (defesa em profundidade).
  - Rejeicao de token expirado (com uma chave efemera propria, para nao depender da privada do EA).
  - Rejeicao de assinatura adulterada.
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
from vt_token import TokenInvalido, conferir_identidade, nasc_hash, verificar_token  # noqa: E402

# Token REAL cunhado pelo EA. Expira 2026-07-31, entao os testes desligam o check de exp
# APENAS onde a intencao e provar a assinatura e os claims.
TOKEN_REAL = (
    "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJub21lIjoiTUFSSUEgREUgVEVTVEUg"
    "U0lMVkEiLCJjcGYiOiIxMTEyMjIzMzM0NCIsIm5hc2NIYXNoIjoiY2M4MWJjYWU2ZTgyOTY2MzlhYjUyZjUzYTdlMWZj"
    "NTkxMDBiN2Q5ODk3ZDBhODYyNGYzNDcwNmUzM2VmNGYyMyIsImlhdCI6MTc4NDkxOTYwMywiZXhwIjoxNzg1NTI0NDAz"
    "LCJqdGkiOiIzNzEzYzBiNC0zZDE2LTQwNzAtYjRmYy1kNzg3ZmNmNzM2YTAifQ."
    "L29jUzfDwlnh4KLGyahMn562q53EtwNAWe4-0Q2hRnK1tYQhAqFJdYSBRPYGzbutqWddskmRiPbi0ozjtTPkBA"
)

CPF = "11122233344"
DATA_NASC = "1990-05-20"
NASC_HASH = "cc81bcae6e8296639ab52f53a7e1fc59100b7d9897d0a8624f34706e33ef4f23"


def test_interop_token_real():
    """A funcao aceita o token real do EA e extrai os claims (exp desligado so aqui)."""
    claims = verificar_token(TOKEN_REAL, verificar_exp=False)
    assert claims["sub"] == "00000000-0000-0000-0000-000000000001"
    assert claims["nome"] == "MARIA DE TESTE SILVA"
    assert claims["cpf"] == CPF
    assert claims["nascHash"] == NASC_HASH


def test_nasc_hash_confere_com_o_claim():
    assert nasc_hash(CPF, DATA_NASC) == NASC_HASH


def test_conferir_identidade_ok():
    claims = verificar_token(TOKEN_REAL, verificar_exp=False)
    assert conferir_identidade(claims, CPF, DATA_NASC) is True
    # Aceita CPF mascarado tambem (normaliza para digitos).
    assert conferir_identidade(claims, "111.222.333-44", DATA_NASC) is True


def test_conferir_identidade_falha_com_data_errada():
    claims = verificar_token(TOKEN_REAL, verificar_exp=False)
    assert conferir_identidade(claims, CPF, "1990-05-21") is False
    assert conferir_identidade(claims, "99988877766", DATA_NASC) is False


def test_token_expirado_e_rejeitado(monkeypatch):
    """Caminho de rejeicao por exp, com uma chave efemera propria (nao a privada do EA)."""
    sk = Ed25519PrivateKey.generate()
    raw_pub = sk.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    # A funcao passa a confiar nesta chave efemera so durante o teste.
    monkeypatch.setattr(vt_token, "PUBLIC_KEY_RAW", raw_pub)

    agora = int(time.time())
    token_expirado = jwt.encode(
        {
            "sub": "x",
            "nome": "TESTE",
            "cpf": CPF,
            "nascHash": NASC_HASH,
            "iat": agora - 7200,
            "exp": agora - 3600,
        },
        sk,
        algorithm="EdDSA",
        headers={"typ": "JWT"},
    )
    with pytest.raises(TokenInvalido) as exc:
        verificar_token(token_expirado, verificar_exp=True)
    assert "expirado" in str(exc.value)

    # E com exp valido a MESMA chave efemera passa (prova que so o exp reprovou acima).
    token_valido = jwt.encode(
        {"sub": "x", "nome": "T", "cpf": CPF, "nascHash": NASC_HASH, "iat": agora, "exp": agora + 600},
        sk,
        algorithm="EdDSA",
    )
    claims = verificar_token(token_valido, verificar_exp=True)
    assert claims["cpf"] == CPF


def test_assinatura_adulterada_e_rejeitada():
    """Um byte trocado no payload invalida a assinatura sob a chave publica do EA."""
    head, payload, sig = TOKEN_REAL.split(".")
    # Troca o ultimo char do payload por outro base64url valido diferente.
    adulterado = payload[:-1] + ("A" if payload[-1] != "A" else "B")
    with pytest.raises(TokenInvalido):
        verificar_token(f"{head}.{adulterado}.{sig}", verificar_exp=False)


def test_alg_diferente_de_eddsa_e_rejeitado():
    """Defesa contra alg confusion: qualquer alg != EdDSA e recusado."""
    forjado = jwt.encode({"sub": "x", "exp": int(time.time()) + 600}, "segredo", algorithm="HS256")
    with pytest.raises(TokenInvalido):
        verificar_token(forjado, verificar_exp=False)
