"""Firebase Cloud Function (Python, 2a geracao) do formulario de VT online.

Fluxo: o candidato preenche o formulario no Hosting (mobile-first), o app verifica o token
OFFLINE (so UX) e faz POST para ESTA funcao. Aqui a verificacao do token e AUTORITATIVA (EdDSA),
a identidade e reconferida (defesa em profundidade), o payload e validado, o PDF e gerado
(replica do vt_pdf.py do EA) e enviado a um bucket coletivo do Google Cloud Storage com a
identidade de runtime da funcao (Application Default Credentials, sem chave JSON no repositorio).

LGPD: token, CPF, nome e nascHash NUNCA sao logados. So metadados nao sensiveis (ok/erro).
"""

import base64
import json
import logging
import os
from datetime import datetime, timezone

from firebase_functions import https_fn, options

import vt_pdf
from vt_token import TokenInvalido, conferir_identidade, verificar_token

# ── Configuracao de deploy ────────────────────────────────────────────────────
# Bucket coletivo do Google Cloud Storage onde os PDFs sao arquivados. O OPERADOR
# define no deploy (ver README). Placeholder proposital: sem um nome valido, a
# funcao recusa o upload (503). A service account de runtime tem storage nativo no
# proprio projeto (vt-online-soulan), sem o problema de quota zero do Drive.
BUCKET_PLACEHOLDER = "COLOQUE_AQUI_O_NOME_DO_BUCKET"

CARTAO_ROTULO = {
    "BILHETE_UNICO": "Bilhete Único",
    "CARTAO_TOP": "Cartão TOP",
}
CARTOES_VALIDOS = {"BILHETE_UNICO", "CARTAO_TOP", "OUTRO"}
SENTIDOS_VALIDOS = {"IDA", "VOLTA"}


class DadosInvalidos(Exception):
    """Payload fora do formato/limites esperados (espelha o DTO do EA)."""


# ── Validacao do payload (espelha EnviarFormularioDto do EA) ────────────────────
def _txt(v, campo, *, minimo, maximo, obrigatorio=True):
    if v is None:
        if obrigatorio:
            raise DadosInvalidos(f"{campo} obrigatorio")
        return None
    if not isinstance(v, str):
        raise DadosInvalidos(f"{campo} invalido")
    s = v.strip()
    if obrigatorio and len(s) < minimo:
        raise DadosInvalidos(f"{campo} obrigatorio")
    if len(s) > maximo:
        raise DadosInvalidos(f"{campo} excede {maximo} caracteres")
    return s


def _valida_data_iso(v):
    s = _txt(v, "dataNascimento", minimo=10, maximo=10)
    ano, mes, dia = s.split("-") if s.count("-") == 2 else ("", "", "")
    if not (len(s) == 10 and ano.isdigit() and mes.isdigit() and dia.isdigit()):
        raise DadosInvalidos("dataNascimento invalida")
    return s


def _valida_valor(v):
    if isinstance(v, str):
        v = v.replace(",", ".")
    try:
        n = float(v)
    except (TypeError, ValueError) as exc:
        raise DadosInvalidos("valor invalido") from exc
    if n < 0:
        raise DadosInvalidos("valor nao pode ser negativo")
    # Duas casas decimais no maximo (espelha maxDecimalPlaces: 2 do DTO).
    return round(n + 1e-9, 2)


def _valida_conducao(c):
    if not isinstance(c, dict):
        raise DadosInvalidos("conducao invalida")
    sentido = c.get("sentido")
    if sentido not in SENTIDOS_VALIDOS:
        raise DadosInvalidos("sentido invalido")
    cidade = _txt(c.get("cidade"), "cidade da conducao", minimo=1, maximo=120)
    tipo = _txt(c.get("tipoTransporte"), "tipoTransporte", minimo=1, maximo=120)
    cartao = c.get("cartao")
    if cartao not in CARTOES_VALIDOS:
        raise DadosInvalidos("cartao invalido")
    cartao_outro = _txt(c.get("cartaoOutro"), "cartaoOutro", minimo=1, maximo=60, obrigatorio=False)
    if cartao == "OUTRO" and not cartao_outro:
        raise DadosInvalidos("informe qual e o cartao quando escolher a opcao Outro")
    valor = _valida_valor(c.get("valor"))
    return {
        "sentido": sentido,
        "cidade": cidade,
        "tipoTransporte": tipo,
        "cartao": cartao,
        "cartaoOutro": cartao_outro,
        "valor": valor,
    }


def _valida_payload(body):
    if not isinstance(body, dict):
        raise DadosInvalidos("corpo invalido")

    optante = body.get("optante")
    if not isinstance(optante, bool):
        raise DadosInvalidos("optante deve ser verdadeiro ou falso")

    cep_bruto = body.get("cep")
    if not isinstance(cep_bruto, str):
        raise DadosInvalidos("cep obrigatorio")
    cep = "".join(ch for ch in cep_bruto if ch.isdigit())
    if len(cep) != 8:
        raise DadosInvalidos("cep deve ter 8 digitos")

    uf = _txt(body.get("uf"), "uf", minimo=2, maximo=2)
    if not (len(uf) == 2 and uf.isalpha()):
        raise DadosInvalidos("uf deve ter 2 letras")

    dados = {
        "optante": optante,
        "cep": cep,
        "logradouro": _txt(body.get("logradouro"), "logradouro", minimo=1, maximo=200),
        "numero": _txt(body.get("numero"), "numero", minimo=1, maximo=20),
        "complemento": _txt(body.get("complemento"), "complemento", minimo=1, maximo=100, obrigatorio=False),
        "bairro": _txt(body.get("bairro"), "bairro", minimo=1, maximo=120),
        "cidade": _txt(body.get("cidade"), "cidade", minimo=1, maximo=120),
        "uf": uf.upper(),
    }

    conducoes_in = body.get("conducoes") or []
    if not isinstance(conducoes_in, list):
        raise DadosInvalidos("conducoes deve ser uma lista")
    if len(conducoes_in) > 40:
        raise DadosInvalidos("conducoes em excesso")

    # Nao-optante nao descreve itinerario: as conducoes sao descartadas mesmo se vierem.
    conducoes = [_valida_conducao(c) for c in conducoes_in] if optante else []
    if optante and not conducoes:
        raise DadosInvalidos("informe pelo menos uma conducao para quem opta pelo vale-transporte")

    dados["conducoes"] = conducoes
    dados["dataNascimento"] = _valida_data_iso(body.get("dataNascimento"))
    return dados


# ── Montagem do documento (espelha VtService.documento do EA) ───────────────────
def _rotulo_cartao(c):
    if c["cartao"] in CARTAO_ROTULO:
        return CARTAO_ROTULO[c["cartao"]]
    return c.get("cartaoOutro") or "Outro"


def _monta_documento(claims, dados):
    conducoes = [
        {
            "sentido": c["sentido"],
            # Coluna "Meio de transporte" = tipo + cidade (decisao do diretor). Hifen simples.
            "meioTransporte": f"{c['tipoTransporte']} - {c['cidade']}",
            "cartao": _rotulo_cartao(c),
            "valor": c["valor"],
        }
        for c in dados["conducoes"]
    ]
    total_ida = round(sum(c["valor"] for c in dados["conducoes"] if c["sentido"] == "IDA"), 2)
    total_volta = round(sum(c["valor"] for c in dados["conducoes"] if c["sentido"] == "VOLTA"), 2)

    endereco = " - ".join(
        p
        for p in [
            f"{dados['logradouro']}, {dados['numero']}",
            dados.get("complemento"),
            dados["bairro"],
            f"CEP {dados['cep'][:5]}-{dados['cep'][5:]}",
        ]
        if p
    )

    return {
        "tipo": "OPTANTE" if dados["optante"] else "NAO_OPTANTE",
        "nome": claims["nome"],
        "cpf": claims["cpf"],
        "dataNascimento": dados["dataNascimento"],
        "endereco": endereco,
        "cidadeUf": f"{dados['cidade']}/{dados['uf']}",
        "conducoes": conducoes,
        "totalIda": total_ida,
        "totalVolta": total_volta,
        "totalDia": round(total_ida + total_volta, 2),
    }


# ── Upload ao bucket coletivo do GCS (ADC, sem chave JSON) ──────────────────────
def _bucket_name():
    nome = (os.environ.get("VT_COLLECTIVE_BUCKET") or "").strip()
    if not nome or nome == BUCKET_PLACEHOLDER:
        raise RuntimeError("VT_COLLECTIVE_BUCKET nao configurado")
    return nome


def _nome_objeto(nome, cpf):
    # Nome do objeto EXATO: NOME EM MAIUSCULAS + um espaco + CPF de 11 digitos (sem mascara).
    return f"{nome.upper()} {cpf}.pdf"


def _agora_iso():
    """Instante do aceite, em UTC e no formato que o EA le direto (ISO 8601 com Z)."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _nome_objeto_json(nome, cpf):
    """JSON IRMAO do PDF: mesmo nome, extensao trocada. O EA deriva este nome do lado dele."""
    return f"{nome.upper()} {cpf}.json"


def _sidecar(dados, doc, ciente_em):
    """Campos ESTRUTURADOS que viajam junto do PDF, para o EA somar na tela de Beneficios.

    POR QUE PELO BUCKET, e nao por uma chamada ao EA: esta funcao roda no Firebase e o EA e loopback
    atras da VPN, inalcancavel de fora. Foi esse o motivo do pivo para o GCS quando a frente nasceu.
    O bucket ja e o transporte que funciona para o PDF; o JSON pega carona, sem abrir porta nenhuma.

    OS VALORES DE ENUM SAO OS DO BANCO DO EA (IDA/VOLTA, BILHETE_UNICO/CARTAO_TOP/OUTRO), de
    proposito: sem traducao no caminho nao ha um segundo lugar onde a lista pode divergir.

    NENHUM DADO DE IDENTIFICACAO AQUI. Nada de nome, CPF ou data de nascimento: o EA ja sabe de quem
    e o arquivo pelo CPF no NOME do objeto, e repetir isso dentro do JSON so espalharia dado pessoal
    por mais um lugar sem necessidade.
    """
    return {
        "versao": 1,
        "optante": dados["optante"],
        "cep": dados["cep"],
        "logradouro": dados["logradouro"],
        "numero": dados["numero"],
        "complemento": dados.get("complemento"),
        "bairro": dados["bairro"],
        "cidade": dados["cidade"],
        "uf": dados["uf"],
        "totalIda": doc["totalIda"],
        "totalVolta": doc["totalVolta"],
        "totalDia": doc["totalDia"],
        # CARIMBADO NO SERVIDOR, e nao enviado pelo aparelho: o relogio do celular pode estar errado,
        # e este e o registro do aceite (trilha de responsabilizacao). O app so chama esta rota DEPOIS
        # que o candidato confirma os tres avisos, entao o instante em que a requisicao chega e o
        # instante do aceite, a menos de segundos.
        "cienteEm": ciente_em,
        "conducoes": [
            {
                "sentido": c["sentido"],
                # A ordem preserva a sequencia em que o candidato preencheu; sem ela o itinerario
                # apareceria embaralhado do outro lado.
                "ordem": i + 1,
                "cidade": c["cidade"],
                "tipoTransporte": c["tipoTransporte"],
                "cartao": c["cartao"],
                "cartaoOutro": c["cartaoOutro"],
                "valor": c["valor"],
            }
            for i, c in enumerate(dados["conducoes"])
        ],
    }


def _enviar_json_ao_bucket(nome, cpf, conteudo):
    """Sobe o JSON irmao. FALHA AQUI NAO DERRUBA O ENVIO: o PDF ja subiu, e o formulario do candidato
    esta entregue. Sem o JSON o EA arquiva o PDF do mesmo jeito e a tela so nao soma os valores.
    """
    # Import LOCAL, igual ao do envio do PDF: mantem o cold start da funcao leve, porque a rota so
    # toca o Storage no fim do fluxo.
    from google.cloud import storage

    client = storage.Client()
    blob = client.bucket(_bucket_name()).blob(_nome_objeto_json(nome, cpf))
    blob.upload_from_string(
        json.dumps(conteudo, ensure_ascii=False).encode("utf-8"),
        content_type="application/json",
    )
    return blob.name


def _enviar_ao_bucket(nome, cpf, pdf_bytes):
    from google.cloud import storage

    # Application Default Credentials = a service account de runtime da funcao. Ela escreve no
    # bucket do PROPRIO projeto (storage nativo), sem chave JSON no repositorio.
    client = storage.Client()
    bucket = client.bucket(_bucket_name())
    blob = bucket.blob(_nome_objeto(nome, cpf))
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    return blob.name


# ── Handler HTTP ────────────────────────────────────────────────────────────────
def _json(status, obj):
    return https_fn.Response(
        json.dumps(obj), status=status, headers={"Content-Type": "application/json; charset=utf-8"}
    )


@https_fn.on_request(
    region="us-central1",
    memory=options.MemoryOption.MB_512,
    timeout_sec=60,
)
def enviarVt(req: https_fn.Request) -> https_fn.Response:
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204)
    if req.method != "POST":
        return _json(405, {"ok": False, "erro": "metodo nao permitido"})

    try:
        body = req.get_json(silent=True) or {}
    except Exception:
        return _json(400, {"ok": False, "erro": "corpo invalido"})

    token = body.get("token")
    payload = body.get("payload") if isinstance(body.get("payload"), dict) else body

    # 1) Token autoritativo (assinatura EdDSA + exp).
    try:
        claims = verificar_token(token)
    except TokenInvalido:
        return _json(401, {"ok": False, "erro": "link invalido ou expirado, peca um novo ao consultor"})

    # 2) Payload no formato/limites do DTO do EA.
    try:
        dados = _valida_payload(payload)
    except DadosInvalidos as exc:
        return _json(400, {"ok": False, "erro": str(exc)})

    # 3) Defesa em profundidade: reconfere CPF + sha256(cpf|dataNascimento) contra os claims.
    cpf_informado = "".join(ch for ch in str(payload.get("cpf", "")) if ch.isdigit())
    if not conferir_identidade(claims, cpf_informado, dados["dataNascimento"]):
        return _json(401, {"ok": False, "erro": "dados de identificacao nao conferem"})

    # 4) PDF (replica do vt_pdf.py) a partir do que foi enviado.
    try:
        doc = _monta_documento(claims, dados)
        pdf_bytes = vt_pdf.gerar(doc)
    except Exception:
        return _json(500, {"ok": False, "erro": "nao foi possivel gerar o documento"})

    # 5) Arquivamento no bucket coletivo do GCS (ADC).
    try:
        objeto = _enviar_ao_bucket(claims["nome"], claims["cpf"], pdf_bytes)
    except RuntimeError:
        return _json(503, {"ok": False, "erro": "arquivamento nao configurado, procure o RH"})
    except Exception:
        return _json(502, {"ok": False, "erro": "nao foi possivel arquivar o documento agora"})

    # 6) JSON irmao com os campos estruturados. DEPOIS do PDF e num try proprio: o PDF e a entrega
    #    que nao pode falhar, e o JSON e o que permite a tela somar. Um sem o outro e melhor que
    #    nenhum dos dois.
    try:
        _enviar_json_ao_bucket(claims["nome"], claims["cpf"], _sidecar(dados, doc, _agora_iso()))
    except Exception:  # noqa: BLE001
        logging.warning("JSON irmao do formulario nao subiu; o PDF foi arquivado normalmente.")

    # 7) O PDF VOLTA PARA O CANDIDATO, para a tela final oferecer visualizar e baixar.
    #    Ele ja esta em memoria: gerar de novo, ou pedir de volta ao bucket, seria trabalho repetido.
    #    Base64 porque a resposta e JSON; ~50 KB de PDF viram ~67 KB de texto, que cabe folgado.
    return _json(
        200,
        {
            "ok": True,
            "optante": dados["optante"],
            "objeto": objeto,
            "pdfBase64": base64.b64encode(pdf_bytes).decode("ascii"),
        },
    )
