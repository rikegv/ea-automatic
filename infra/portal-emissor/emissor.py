#!/usr/bin/env python3
"""
EMISSOR DO PORTAL, o "servidor falso" do desenho (VS7 / troca do modelo do VT).

O EA é o CLIENTE (apps/backend/src/portal/portal-emissor.service.ts): ele cunha um bilhete
assinado Ed25519 e o troca, por rota, com este emissor. O emissor NUNCA recebe o arquivo do
candidato: ele converte um bilhete valido numa URL assinada de escrita do Google Cloud Storage,
consulta metadado, corrige tipo e apaga objeto. O byte vai do navegador direto ao balde.

Este arquivo existe para a DEMO REAL e para o loopback que a excecao `http` do cliente ja permite
(127.0.0.1 / ::1 / localhost). Em producao o emissor roda no projeto do Google, em https, com
identidade de runtime. Aqui ele roda local, sobre uma service account de arquivo.

CONTRATO (casa 1:1 com o cliente que ja existe no EA):

  POST /assinar-escrita   corpo {"bilhete": "<jws>"}  ->  {"url","cabecalhos","expiraEm"}
  POST /metadado          corpo {"bilhete": "<jws>"}  ->  {"objeto","existe","bytes","contentType","geracao"}
  POST /corrigir-tipo     corpo {"bilhete": "<jws>"}  ->  {"ok": bool}
  POST /apagar            corpo {"bilhete": "<jws>"}  ->  {"ok": bool}

  Qualquer recusa responde com status != 2xx e corpo generico. O cliente so olha `resposta.ok`,
  entao recusa = nulo do lado dele = documento continua pendente, e a proxima tentativa resolve.

DUAS IDENTIDADES SEPARADAS (condicoes B2/B3 do parecer):
  - a SA de ASSINATURA so CRIA objeto (assinar-escrita). E a que a demo exige.
  - a SA de CURADORIA le/corrige/apaga (metadado, corrigir-tipo, apagar). Separada de proposito.
  Se a curadoria nao estiver provisionada, so as rotas de curadoria ficam inertes; a escrita, nao.

FAIL-CLOSED e §A.6:
  - Sem a chave publica do EA, NADA e verificavel: todas as rotas recusam.
  - Sem a SA de assinatura, `assinar-escrita` recusa com erro claro e generico.
  - Nada de bilhete, URL, nome de objeto, chave ou token vai para log. So a rota e a classe do erro.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# --- §A.6: log so com rota e classe de erro, nunca corpo/credencial/objeto ---------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s emissor %(levelname)s %(message)s")
log = logging.getLogger("portal-emissor")

# --- Contrato do bilhete, espelhando portal-bilhete.ts -----------------------------------------
DESTINOS = ("assinar-escrita", "metadado", "corrigir-tipo", "apagar")
ALG_ESPERADO = "EdDSA"
ORDEM_CANONICA = ("content-type", "x-goog-content-length-range", "x-goog-if-generation-match")
GCS_HOST = "storage.googleapis.com"


class BilheteRecusado(Exception):
    """Qualquer desvio na verificacao do bilhete. A mensagem NAO vai para o cliente nem para log."""


class NaoConfigurado(Exception):
    """A peca exigida (chave publica, SA) nao existe. Fail-closed, com erro generico ao cliente."""


# --- Configuracao, so do ambiente (§A.6: nada hardcoded, chave/SA so de env/arquivo) -----------
class Config:
    def __init__(self) -> None:
        self.host = (os.environ.get("PORTAL_EMISSOR_LISTEN_HOST") or "127.0.0.1").strip()
        self.port = int((os.environ.get("PORTAL_EMISSOR_LISTEN_PORT") or "8030").strip())
        self.bucket = (os.environ.get("PORTAL_EMISSOR_BUCKET") or "").strip()
        self.teto_seg = int((os.environ.get("PORTAL_EMISSOR_TETO_SEGUNDOS") or "600").strip())
        self.max_bytes = int((os.environ.get("PORTAL_EMISSOR_MAX_BYTES") or str(10 * 1024 * 1024)).strip())
        self.signer_sa_file = (os.environ.get("PORTAL_EMISSOR_SIGNER_SA_FILE") or "").strip()
        self.curadoria_sa_file = (os.environ.get("PORTAL_EMISSOR_CURADORIA_SA_FILE") or "").strip()
        self._pub_pem = self._carregar_pub()

    def _carregar_pub(self) -> str:
        # A chave publica do EA (par de PORTAL_EMISSOR_BILHETE_PRIVATE_KEY). Aceita PEM cru ou
        # PEM em base64 (uma linha, como o EA guarda a privada). Ausente => emissor inerte.
        cru = (os.environ.get("PORTAL_EMISSOR_EA_PUBLIC_KEY") or "").strip()
        arquivo = (os.environ.get("PORTAL_EMISSOR_EA_PUBLIC_KEY_FILE") or "").strip()
        if not cru and arquivo:
            try:
                with open(arquivo, "r", encoding="utf-8") as fh:
                    cru = fh.read().strip()
            except OSError:
                return ""
        if not cru:
            return ""
        if "BEGIN" in cru:
            return cru
        try:
            return base64.b64decode(cru).decode("utf-8")
        except Exception:
            return ""

    @property
    def chave_publica_pem(self) -> str:
        return self._pub_pem

    def verificavel(self) -> bool:
        return bool(self._pub_pem)


# --- Verificacao do bilhete (espelha verificarBilhete de portal-bilhete.ts) --------------------
def _b64url_json(parte: str) -> dict:
    resto = parte + "=" * (-len(parte) % 4)
    return json.loads(base64.urlsafe_b64decode(resto.encode("ascii")).decode("utf-8"))


def _b64url_bytes(parte: str) -> bytes:
    resto = parte + "=" * (-len(parte) % 4)
    return base64.urlsafe_b64decode(resto.encode("ascii"))


def verificar_bilhete(bilhete: str, chave_publica_pem: str, destino_rota: str, bucket_cfg: str) -> dict:
    """Devolve os claims quando o bilhete e valido para ESTA rota. Levanta BilheteRecusado senao.

    A recusa de algoritmo vem ANTES da conta da assinatura: defesa contra confusao de algoritmo.
    Nada aqui e logado; a mensagem da excecao fica interna."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import serialization

    partes = bilhete.split(".") if isinstance(bilhete, str) else []
    if len(partes) != 3:
        raise BilheteRecusado("malformado")
    cab_b64, payload_b64, sig_b64 = partes

    try:
        cabecalho = _b64url_json(cab_b64)
    except Exception as exc:
        raise BilheteRecusado("cabecalho ilegivel") from exc
    if cabecalho.get("alg") != ALG_ESPERADO:
        raise BilheteRecusado("alg inesperado")

    try:
        chave = serialization.load_pem_public_key(chave_publica_pem.encode("utf-8"))
    except Exception as exc:
        raise NaoConfigurado("chave publica ilegivel") from exc

    entrada = f"{cab_b64}.{payload_b64}".encode("ascii")
    try:
        chave.verify(_b64url_bytes(sig_b64), entrada)
    except InvalidSignature as exc:
        raise BilheteRecusado("assinatura invalida") from exc
    except Exception as exc:
        raise BilheteRecusado("assinatura ilegivel") from exc

    try:
        claims = _b64url_json(payload_b64)
    except Exception as exc:
        raise BilheteRecusado("claims ilegiveis") from exc

    agora = int(datetime.now(timezone.utc).timestamp())
    exp = claims.get("exp")
    if not isinstance(exp, int) or exp <= agora:
        raise BilheteRecusado("expirado")

    dst = claims.get("dst")
    if dst not in DESTINOS:
        raise BilheteRecusado("destino desconhecido")
    # O destino ENTRA na assinatura: bilhete de uma rota nunca serve para outra (B2/B3).
    if dst != destino_rota:
        raise BilheteRecusado("destino nao casa com a rota")

    # O emissor e autoritativo do balde: so assina para o balde dele (rebaixamento de poder).
    if bucket_cfg and claims.get("bkt") != bucket_cfg:
        raise BilheteRecusado("balde diferente do configurado")

    if not isinstance(claims.get("obj"), str) or not claims["obj"]:
        raise BilheteRecusado("objeto ausente")

    return claims


def reimpor_escrita(claims: dict, cfg: Config) -> dict:
    """Condicao B1: o emissor CONFERE a regra e RECUSA, nunca completa em silencio.

    Para `assinar-escrita`: metodo PUT, exatamente os tres cabecalhos canonicos, trava de
    sobrescrita e teto de bytes. Devolve o mapa de cabecalhos a assinar (== ao que o EA mandou,
    pois a conferencia passou)."""
    if claims.get("mtd") != "PUT":
        raise BilheteRecusado("metodo diferente de PUT na escrita")

    hdr = claims.get("hdr")
    if not isinstance(hdr, dict):
        raise BilheteRecusado("cabecalhos ausentes")
    if tuple(hdr.keys()) != ORDEM_CANONICA:
        # Ordem e conjunto exatos: o cliente compara o que volta com o que assinou, byte a byte.
        raise BilheteRecusado("cabecalhos fora da regua canonica")

    if hdr.get("x-goog-if-generation-match") != "0":
        raise BilheteRecusado("sem trava de sobrescrita")

    faixa = hdr.get("x-goog-content-length-range") or ""
    try:
        _, teto = faixa.split(",")
        if int(teto) > cfg.max_bytes:
            raise BilheteRecusado("teto de bytes acima do permitido")
    except BilheteRecusado:
        raise
    except Exception as exc:
        raise BilheteRecusado("faixa de tamanho ilegivel") from exc

    return dict(hdr)


# --- Clientes GCS, importados de forma preguicosa para o fail-closed rodar so com cryptography --
def _cliente_gcs(sa_file: str):
    if not sa_file or not os.path.isfile(sa_file):
        raise NaoConfigurado("service account ausente")
    from google.cloud import storage  # import tardio: a demo de fail-closed nao precisa dele
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_file(sa_file)
    return storage.Client(credentials=creds, project=getattr(creds, "project_id", None)), creds


def assinar_escrita(claims: dict, cfg: Config) -> dict:
    from datetime import timedelta as _td

    cabecalhos = reimpor_escrita(claims, cfg)
    client, creds = _cliente_gcs(cfg.signer_sa_file)  # levanta NaoConfigurado se faltar a SA
    blob = client.bucket(claims["bkt"]).blob(claims["obj"])

    ttl = max(1, min(int(claims.get("ttl") or cfg.teto_seg), cfg.teto_seg))
    # O SDK MUTA o dict de cabecalhos que recebe, acrescentando `Host`. Se aquele dict virasse a
    # resposta, o cliente veria um cabecalho a mais e recusaria (a conferencia dele exige o MESMO
    # conjunto, sem acrescentar). Por isso a resposta e um snapshot tirado ANTES da assinatura, e o
    # SDK recebe uma copia descartavel.
    url = blob.generate_signed_url(
        version="v4",
        expiration=_td(seconds=ttl),
        method="PUT",
        headers=dict(cabecalhos),
        credentials=creds,
    )
    expira = datetime.now(timezone.utc) + timedelta(seconds=ttl)
    # A URL nasce como https://storage.googleapis.com/{bucket}/{objeto}?..., que e a forma de
    # caminho que urlDeEscritaConfere aceita. Os cabecalhos voltam identicos aos assinados.
    return {"url": url, "cabecalhos": cabecalhos, "expiraEm": expira.isoformat()}


def consultar_metadado(claims: dict, cfg: Config) -> dict:
    from google.cloud.exceptions import NotFound

    client, _ = _cliente_gcs(cfg.curadoria_sa_file)  # identidade de CURADORIA, nunca a de escrita
    blob = client.bucket(claims["bkt"]).blob(claims["obj"])
    try:
        blob.reload()
    except NotFound:
        return {"objeto": claims["obj"], "existe": False, "bytes": 0, "contentType": "", "geracao": None}
    return {
        "objeto": claims["obj"],  # o ECO obrigatorio, conferido pelo cliente contra o pedido
        "existe": True,
        "bytes": int(blob.size or 0),
        "contentType": (blob.content_type or "").strip(),
        "geracao": int(blob.generation) if blob.generation else None,
    }


def corrigir_tipo(claims: dict, cfg: Config) -> dict:
    from google.cloud.exceptions import NotFound

    client, _ = _cliente_gcs(cfg.curadoria_sa_file)
    hdr = claims.get("hdr") or {}
    tipo = (hdr.get("content-type") or "").strip()
    if not tipo:
        raise BilheteRecusado("tipo de conteudo ausente na correcao")
    blob = client.bucket(claims["bkt"]).blob(claims["obj"])
    try:
        blob.reload()
        blob.content_type = tipo
        blob.patch()
    except NotFound:
        return {"ok": False}
    return {"ok": True}


def apagar(claims: dict, cfg: Config) -> dict:
    from google.cloud.exceptions import NotFound

    client, _ = _cliente_gcs(cfg.curadoria_sa_file)
    blob = client.bucket(claims["bkt"]).blob(claims["obj"])
    try:
        blob.delete()
    except NotFound:
        return {"ok": True}  # ja nao esta la: o efeito desejado ja aconteceu
    return {"ok": True}


# Mapa rota -> executor. metodo/curadoria fail-closam sozinhos ao pedir a SA correspondente.
EXECUTORES = {
    "assinar-escrita": assinar_escrita,
    "metadado": consultar_metadado,
    "corrigir-tipo": corrigir_tipo,
    "apagar": apagar,
}


class Handler(BaseHTTPRequestHandler):
    cfg: Config = None  # type: ignore[assignment]

    def log_message(self, *args) -> None:
        # Silencia o log de acesso padrao do http.server (evita registrar corpo/rota com query).
        return

    def _responder(self, status: int, corpo: dict) -> None:
        dados = json.dumps(corpo).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_POST(self) -> None:  # noqa: N802 (nome exigido pelo http.server)
        rota = self.path.strip("/").split("?", 1)[0]
        if rota not in DESTINOS:
            self._responder(404, {"erro": "rota desconhecida"})
            return

        # Fail-closed geral: sem a chave publica do EA nada e verificavel.
        if not self.cfg.verificavel():
            log.error("recusa em /%s: emissor sem chave publica do EA", rota)
            self._responder(503, {"erro": "emissor nao configurado"})
            return

        try:
            tamanho = int(self.headers.get("Content-Length") or "0")
            corpo = json.loads(self.rfile.read(tamanho).decode("utf-8")) if tamanho else {}
            bilhete = corpo.get("bilhete")
            if not isinstance(bilhete, str) or not bilhete:
                raise BilheteRecusado("corpo sem bilhete")
        except BilheteRecusado:
            self._responder(400, {"erro": "bilhete ausente"})
            return
        except Exception:
            # §A.6: nem o corpo nem o erro de parse vao para log (podem ecoar a credencial).
            log.error("recusa em /%s: corpo ilegivel", rota)
            self._responder(400, {"erro": "corpo ilegivel"})
            return

        try:
            claims = verificar_bilhete(bilhete, self.cfg.chave_publica_pem, rota, self.cfg.bucket)
            resultado = EXECUTORES[rota](claims, self.cfg)
            self._responder(200, resultado)
        except BilheteRecusado:
            # §A.6: so a rota. Nunca o motivo detalhado, o bilhete, o objeto nem a URL.
            log.error("recusa em /%s: bilhete recusado", rota)
            self._responder(401, {"erro": "bilhete recusado"})
        except NaoConfigurado:
            log.error("recusa em /%s: peca de assinatura ausente (fail-closed)", rota)
            self._responder(503, {"erro": "emissor nao configurado"})
        except Exception as exc:
            # So a classe do erro. Mensagens de rede/GCS costumam trazer a URL ou o nome do objeto.
            log.error("erro em /%s: %s", rota, type(exc).__name__)
            self._responder(502, {"erro": "falha ao assinar"})


def main() -> int:
    cfg = Config()
    # Trava de robustez (seguranca): sem balde configurado o emissor NAO sobe. Um emissor sem
    # `PORTAL_EMISSOR_BUCKET` verificaria bilhete de qualquer balde (o `bucket_cfg` vazio pula a
    # conferencia em `verificar_bilhete`), rebaixando a garantia "so assino para o meu balde". E o
    # mesmo molde do fail-closed da chave publica, so que aqui derruba o boot em vez de recusar por
    # rota, porque balde vazio e erro de operador, nao estado inerte. §A.6: nao loga o nome do balde.
    if not cfg.bucket:
        log.error("emissor NAO sobe: PORTAL_EMISSOR_BUCKET vazio (fail-closed de configuracao)")
        return 2
    Handler.cfg = cfg
    servidor = ThreadingHTTPServer((cfg.host, cfg.port), Handler)
    # §A.6: nao registra bucket, SA nem chave. So o suficiente para saber que subiu e o estado.
    log.info(
        "emissor no ar em %s:%d | verificavel=%s | assinatura=%s | curadoria=%s",
        cfg.host,
        cfg.port,
        cfg.verificavel(),
        bool(cfg.signer_sa_file),
        bool(cfg.curadoria_sa_file),
    )
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
