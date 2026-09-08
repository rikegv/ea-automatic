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


# Codigos de recusa do token. Sao o CONTRATO com a Cloud Function e com a tela do candidato:
# quem recusa diz POR QUE recusou, e a tela decide o que oferecer (pedir link novo x reabrir o
# link). Sem isso, "expirou de verdade" e "assinatura nao fecha" chegavam ao candidato como a
# mesma frase, e ele tentava de novo para sempre.
CODIGO_EXPIRADO = "EXPIRADO"   # o prazo do link venceu pelo relogio do servidor
CODIGO_INVALIDO = "INVALIDO"   # assinatura, formato, alg inesperado ou claim obrigatorio ausente
CODIGO_AUSENTE = "AUSENTE"     # o token nao veio no corpo do envio, ou nao e string


class TokenInvalido(Exception):
    """Token ausente, malformado, com assinatura invalida, expirado ou com claims faltando.

    Carrega o `codigo` da recusa (EXPIRADO / INVALIDO / AUSENTE) para o chamador so TRADUZIR,
    sem reinspecionar o token. Continua uma Exception comum, com a mensagem no lugar de sempre:
    quem ja capturava `TokenInvalido` e lia `str(exc)` nao muda.

    LGPD (§A.6): nem a mensagem nem o `codigo` carregam qualquer pedaco do token, do CPF, do
    nome ou dos claims. Nada aqui e logado.
    """

    def __init__(self, mensagem: str, codigo: str = CODIGO_INVALIDO):
        super().__init__(mensagem)
        self.codigo = codigo


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
        raise TokenInvalido("token ausente", CODIGO_AUSENTE)

    # A leitura do header fica DENTRO do tratamento. Ela estava fora, e `get_unverified_header`
    # levanta jwt.DecodeError (subclasse de jwt.InvalidTokenError) em token malformado: 'abc',
    # 'a.b' ou um token truncado atravessavam esta funcao crus, passavam pelo `except
    # TokenInvalido` de quem chama e viravam erro 500 no candidato que ja tinha preenchido o
    # formulario inteiro. O docstring de TokenInvalido sempre prometeu cobrir "malformado";
    # agora o codigo honra a promessa.
    #
    # O `except Exception` final nao e preguica: e rede de seguranca medida. Um token com
    # surrogate solto (o JSON do corpo aceita "\ud800") faz o PyJWT levantar UnicodeEncodeError,
    # que NAO e InvalidTokenError e escaparia igual. Nenhum caminho pode voltar a estourar aqui.
    #
    # `from None` em todo raise: corta o encadeamento da excecao original, entao nenhum traceback
    # de biblioteca acompanha a falha carregando pedaco de token (§A.6). O preco e nao ver a causa
    # original, e ele e barato: a causa util (expirado x invalido) ja vai no `codigo`.
    try:
        header = jwt.get_unverified_header(token)
        algoritmo = header.get("alg")
    except jwt.InvalidTokenError:
        raise TokenInvalido("token invalido", CODIGO_INVALIDO) from None
    except Exception:  # noqa: BLE001
        raise TokenInvalido("token invalido", CODIGO_INVALIDO) from None

    if algoritmo != "EdDSA":
        raise TokenInvalido("algoritmo do token inesperado", CODIGO_INVALIDO)

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
    except jwt.ExpiredSignatureError:
        raise TokenInvalido("token expirado", CODIGO_EXPIRADO) from None
    except jwt.InvalidTokenError:
        raise TokenInvalido("token invalido", CODIGO_INVALIDO) from None
    except Exception:  # noqa: BLE001
        raise TokenInvalido("token invalido", CODIGO_INVALIDO) from None

    for claim in _REQUIRED_CLAIMS:
        if not claims.get(claim):
            # A mensagem nomeia o CLAIM (chave fixa do formato), nunca o VALOR dele.
            raise TokenInvalido(f"claim ausente: {claim}", CODIGO_INVALIDO)

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
