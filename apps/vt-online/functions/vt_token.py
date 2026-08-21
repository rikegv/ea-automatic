"""Verificacao AUTORITATIVA do token do link de VT (EdDSA / Ed25519), lado servidor.

O consultor do EA gera um link assinado com a chave PRIVADA (que vive so no EA). Este app externo
so tem a metade PUBLICA e apenas VERIFICA. A verificacao e feita com PyJWT sobre o backend
`cryptography`, com a chave publica EMBUTIDA abaixo (segura para embarcar).

LGPD: o token carrega CPF, nome e nascHash. Nada disso e logado em nenhuma hipotese.
"""

import hashlib
import hmac

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

# Chave PUBLICA Ed25519 do EA (metade publica da chave de assinatura do link). Segura para embarcar.
PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA10pE78Ni8yZSdvezY7hUNunGoFaSzVy8m2g6gNU1pyY=
-----END PUBLIC KEY-----"""

# Mesma chave em bytes crus (32 bytes do ponto Ed25519), forma canonica usada pelo verificador.
PUBLIC_KEY_RAW = bytes.fromhex(
    "d74a44efc362f3265276f7b363b85436e9c6a05692cd5cbc9b683a80d535a726"
)

# Claims obrigatorios que o token do link precisa carregar.
_REQUIRED_CLAIMS = ("sub", "nome", "cpf", "nascHash", "exp")


class TokenInvalido(Exception):
    """Token ausente, malformado, com assinatura invalida, expirado ou com claims faltando."""


def _public_key() -> Ed25519PublicKey:
    return Ed25519PublicKey.from_public_bytes(PUBLIC_KEY_RAW)


def nasc_hash(cpf: str, data_nascimento: str) -> str:
    """sha256 hex de `${cpf}|${dataNascimento}` (data ISO yyyy-mm-dd). Espelha o EA (nascHashDe)."""
    return hashlib.sha256(f"{cpf}|{data_nascimento}".encode("utf-8")).hexdigest()


def verificar_token(token: str, *, verificar_exp: bool = True) -> dict:
    """Verifica assinatura EdDSA + exp (opcional) e devolve os claims.

    `verificar_exp=False` e usado APENAS em teste de interoperabilidade com um token ja expirado;
    o caminho de rejeicao de expiracao e coberto por teste proprio. Em producao fica True.
    """
    if not token or not isinstance(token, str):
        raise TokenInvalido("token ausente")

    header = jwt.get_unverified_header(token)
    if header.get("alg") != "EdDSA":
        raise TokenInvalido("algoritmo do token inesperado")

    try:
        claims = jwt.decode(
            token,
            key=_public_key(),
            algorithms=["EdDSA"],
            options={
                "verify_exp": verificar_exp,
                "require": ["exp"] if verificar_exp else [],
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenInvalido("token expirado") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenInvalido("token invalido") from exc

    for claim in _REQUIRED_CLAIMS:
        if not claims.get(claim):
            raise TokenInvalido(f"claim ausente: {claim}")

    return claims


def conferir_identidade(claims: dict, cpf: str, data_nascimento: str) -> bool:
    """Defesa em profundidade: reconfere CPF e sha256(cpf|dataNascimento) contra os claims.

    Nunca confia no cliente. Comparacoes em tempo constante para nao vazar por timing.
    """
    cpf_digits = "".join(ch for ch in (cpf or "") if ch.isdigit())
    esperado_hash = nasc_hash(cpf_digits, (data_nascimento or "")[:10])
    cpf_ok = _iguais(cpf_digits, str(claims.get("cpf", "")))
    hash_ok = _iguais(esperado_hash, str(claims.get("nascHash", "")))
    return cpf_ok and hash_ok


def _iguais(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
