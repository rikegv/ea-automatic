#!/usr/bin/env python3
"""
Prova LOCAL do emissor sem service account. Sobe o servidor num porto de loopback e exercita o
contrato pela rede, exatamente como o EA faz. O foco e o FAIL-CLOSED: sem a SA de assinatura, um
bilhete valido NAO vira URL, vira recusa generica, e nada sensivel aparece no log.

Roda com so `cryptography` instalado (a mesma que o sistema ja tem). Nao precisa de google-cloud
nem de rede externa, porque nenhum caminho de sucesso de assinatura e alcancado de proposito.

    python3 infra/portal-emissor/test_local.py
"""

from __future__ import annotations

import base64
import io
import json
import logging
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import emissor
from http.server import ThreadingHTTPServer


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def cunhar(priv: Ed25519PrivateKey, claims: dict, alg: str = "EdDSA") -> str:
    cab = b64url(json.dumps({"alg": alg, "typ": "JWT"}).encode("utf-8"))
    pay = b64url(json.dumps(claims).encode("utf-8"))
    sig = b64url(priv.sign(f"{cab}.{pay}".encode("ascii")))
    return f"{cab}.{pay}.{sig}"


def claims_escrita(bkt="ea-portal-entrada", obj="a1b2c3d4/RG__uuid.pdf", ttl=600) -> dict:
    agora = int(datetime.now(timezone.utc).timestamp())
    return {
        "dst": "assinar-escrita",
        "bkt": bkt,
        "obj": obj,
        "mtd": "PUT",
        "hdr": {
            "content-type": "application/pdf",
            "x-goog-content-length-range": "0,1048576",
            "x-goog-if-generation-match": "0",
        },
        "ttl": ttl,
        "abs": agora + ttl,
        "jti": "00000000-0000-0000-0000-000000000000",
        "iat": agora,
        "exp": agora + 60,
    }


class CapturaLog(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.linhas: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.linhas.append(record.getMessage())


def post(porta: int, rota: str, corpo: dict):
    dados = json.dumps(corpo).encode("utf-8")
    req = urllib.request.Request(
        f"http://127.0.0.1:{porta}/{rota}", data=dados, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def subir(cfg: emissor.Config):
    emissor.Handler.cfg = cfg
    srv = ThreadingHTTPServer(("127.0.0.1", 0), emissor.Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, srv.server_address[1]


def cfg_com(pub_pem: str | None, bucket="ea-portal-entrada") -> emissor.Config:
    c = emissor.Config.__new__(emissor.Config)
    c.host, c.port = "127.0.0.1", 0
    c.bucket = bucket
    c.teto_seg = 600
    c.max_bytes = 10 * 1024 * 1024
    c.signer_sa_file = ""      # SEM SA de assinatura: prova o fail-closed
    c.curadoria_sa_file = ""
    c._pub_pem = pub_pem or ""
    return c


def main() -> int:
    priv = Ed25519PrivateKey.generate()
    pub_pem = priv.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")
    outra = Ed25519PrivateKey.generate()

    captura = CapturaLog()
    emissor.log.addHandler(captura)
    emissor.log.setLevel(logging.ERROR)

    falhas = 0

    def checar(nome, cond):
        nonlocal falhas
        print(("  OK  " if cond else "FALHA ") + nome)
        if not cond:
            falhas += 1

    # 1) Sem chave publica do EA: emissor inteiro inerte -> 503
    srv, porta = subir(cfg_com(None))
    st, body = post(porta, "assinar-escrita", {"bilhete": cunhar(priv, claims_escrita())})
    checar("sem chave publica do EA => 503 e recusa", st == 503 and "erro" in body)
    srv.shutdown()

    # A partir daqui, com a chave publica configurada (mas SEM SA de assinatura).
    srv, porta = subir(cfg_com(pub_pem))

    # 2) Bilhete VALIDO, sem SA de assinatura: fail-closed -> 503, corpo generico
    captura.linhas.clear()
    c = claims_escrita()
    st, body = post(porta, "assinar-escrita", {"bilhete": cunhar(priv, c)})
    checar("bilhete valido sem SA => 503 fail-closed", st == 503)
    # §A.6: nem o objeto, nem o bucket, nem o bilhete podem ter vazado para o log
    log_txt = "\n".join(captura.linhas)
    checar("log nao vaza objeto", c["obj"] not in log_txt)
    checar("log nao vaza bucket no detalhe", c["bkt"] not in log_txt)
    checar("corpo do erro nao ecoa objeto", c["obj"] not in json.dumps(body))

    # 3) Confusao de algoritmo: alg != EdDSA recusado ANTES de qualquer conta -> 401
    st, _ = post(porta, "assinar-escrita", {"bilhete": cunhar(priv, claims_escrita(), alg="none")})
    checar("alg 'none' => 401 recusa", st == 401)

    # 4) Assinatura de outra chave (impostor) -> 401
    st, _ = post(porta, "assinar-escrita", {"bilhete": cunhar(outra, claims_escrita())})
    checar("assinatura de chave alheia => 401", st == 401)

    # 5) Destino nao casa com a rota (bilhete de apagar batendo na escrita) -> 401
    c5 = claims_escrita()
    c5["dst"] = "apagar"
    st, _ = post(porta, "assinar-escrita", {"bilhete": cunhar(priv, c5)})
    checar("destino != rota => 401 (B2/B3)", st == 401)

    # 6) Balde diferente do configurado -> 401
    st, _ = post(porta, "assinar-escrita", {"bilhete": cunhar(priv, claims_escrita(bkt="outro-balde"))})
    checar("balde alheio => 401", st == 401)

    # 7) Bilhete expirado -> 401
    c7 = claims_escrita()
    c7["exp"] = int(datetime.now(timezone.utc).timestamp()) - 5
    st, _ = post(porta, "assinar-escrita", {"bilhete": cunhar(priv, c7)})
    checar("bilhete expirado => 401", st == 401)

    # 8) Sem trava de sobrescrita (generation != 0) -> 401 (reimposicao B1)
    c8 = claims_escrita()
    c8["hdr"]["x-goog-if-generation-match"] = "42"
    st, _ = post(porta, "assinar-escrita", {"bilhete": cunhar(priv, c8)})
    checar("sem trava de sobrescrita => 401", st == 401)

    # 9) Corpo sem bilhete -> 400
    st, _ = post(porta, "assinar-escrita", {"nada": "aqui"})
    checar("corpo sem bilhete => 400", st == 400)

    # 10) Rota desconhecida -> 404
    st, _ = post(porta, "rota-inexistente", {"bilhete": cunhar(priv, claims_escrita())})
    checar("rota desconhecida => 404", st == 404)

    srv.shutdown()

    print()
    if falhas:
        print(f"{falhas} verificacao(oes) FALHARAM")
        return 1
    print("todas as verificacoes passaram (fail-closed provado sem SA)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
