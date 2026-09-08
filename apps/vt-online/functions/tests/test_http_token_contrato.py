"""Contrato HTTP da recusa de token no passo 1 da Cloud Function.

A tela do candidato le o campo `codigo` para decidir o que oferecer (pedir um link novo x reabrir
o link que ja tem). Este arquivo prova o contrato pelo lado de fora, com uma requisicao de
verdade, e nao so pela excecao:

    HTTP 401  { "ok": false, "codigo": "EXPIRADO" | "INVALIDO" | "AUSENTE", "erro": "<pt-br>" }

Prova tambem a correcao do 500: antes, `{"token": "abc"}` fazia a funcao estourar, e o candidato
que ja tinha preenchido tudo lia "nao foi possivel enviar" sem nunca descobrir o motivo.

LGPD (§A.6): nenhuma resposta pode devolver token, CPF, nome ou claim, e isso e afirmado abaixo.
"""

import json
import os
import sys
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from flask import Request
from werkzeug.test import EnvironBuilder

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402
import vt_token  # noqa: E402

CPF = "11122233344"
NASC_HASH = "cc81bcae6e8296639ab52f53a7e1fc59100b7d9897d0a8624f34706e33ef4f23"


def _post(corpo):
    """Requisicao POST real (werkzeug + flask), do jeito que a funcao recebe em producao."""
    req = Request(EnvironBuilder(method="POST", json=corpo).get_environ())
    resposta = main.enviarVt(req)
    return resposta.status_code, json.loads(resposta.get_data(as_text=True))


@pytest.fixture()
def chave_efemera(monkeypatch):
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


@pytest.mark.parametrize("token", ["abc", "a.b", "\ud800", "x" * 300])
def test_token_malformado_devolve_401_invalido_em_vez_de_estourar(token):
    status, corpo = _post({"token": token, "payload": {}})
    assert status == 401
    assert corpo["ok"] is False
    assert corpo["codigo"] == "INVALIDO"
    assert corpo["erro"] == "link invalido, peca um link novo ao consultor"


def test_token_expirado_devolve_401_expirado(chave_efemera):
    agora = int(time.time())
    token = _cunhar(chave_efemera, iat=agora - 7200, exp=agora - 3600)
    status, corpo = _post({"token": token, "payload": {}})
    assert status == 401
    assert corpo["codigo"] == "EXPIRADO"
    assert corpo["erro"] == "o prazo deste link venceu, peca um link novo ao consultor"


@pytest.mark.parametrize("corpo_enviado", [{}, {"token": None}, {"token": ""}, {"token": 123}])
def test_token_ausente_devolve_401_ausente(corpo_enviado):
    status, corpo = _post(corpo_enviado)
    assert status == 401
    assert corpo["codigo"] == "AUSENTE"
    assert corpo["erro"] == "link incompleto, abra de novo o link que o consultor enviou"


def test_a_resposta_de_recusa_tem_exatamente_as_tres_chaves():
    """Forma fixa do contrato: nada a mais viaja de volta, nem por acidente."""
    _, corpo = _post({"token": "abc"})
    assert set(corpo.keys()) == {"ok", "codigo", "erro"}


@pytest.mark.parametrize("token", ["abc", "a.b"])
def test_a_resposta_nao_devolve_pedaco_do_token(token):
    _, corpo = _post({"token": token, "payload": {}})
    texto = json.dumps(corpo)
    assert token not in texto
    assert CPF not in texto


def test_token_expirado_nao_devolve_dado_pessoal(chave_efemera):
    """O token expirado carrega CPF, nome e nascHash; a resposta nao pode carregar nenhum deles."""
    agora = int(time.time())
    token = _cunhar(chave_efemera, iat=agora - 7200, exp=agora - 3600)
    _, corpo = _post({"token": token, "payload": {}})
    texto = json.dumps(corpo)
    assert CPF not in texto
    assert "MARIA" not in texto.upper()
    assert NASC_HASH not in texto


def test_token_valido_passa_do_passo_1_e_os_outros_retornos_nao_mudaram(chave_efemera):
    """Com token bom a funcao segue para a validacao do payload, que responde 400 sem `codigo`.

    Prova duas coisas de uma vez: a correcao nao fechou a porta de quem tem link bom, e os
    retornos dos passos seguintes continuam com a forma antiga (fora do escopo desta correcao).
    """
    status, corpo = _post({"token": _cunhar(chave_efemera), "payload": {}})
    assert status == 400
    assert corpo["ok"] is False
    assert "codigo" not in corpo
