# VT ONLINE SOULAN

Aplicativo Firebase autonomo para o candidato preencher o formulario de vale-transporte (VT) pelo
celular, gerar o PDF e arquivar num bucket coletivo do Google Cloud Storage (projeto proprio).

Este app vive FORA do monorepo do EA AUTOMATIC. Ele nao chama o EA em tempo de execucao: verifica o
link do candidato OFFLINE, com a metade publica da chave de assinatura do EA. O EA continua fechado
(loopback), sem exposicao publica.

- Projeto Firebase: `vt-online-soulan` (org soulan.com.br).
- Runtime: Firebase Cloud Functions em Python (2a geracao) + Firebase Hosting (estatico).

---

## Arquitetura

```
Candidato (celular)
   |  abre  https://vt-online-soulan.web.app/vt?t=<token>
   v
Firebase Hosting  (public/)
   - index.html + styles.css + app.js  (formulario mobile-first)
   - ed25519.js   (verifica a assinatura do token OFFLINE, so para UX)
   - tarifas.json (snapshot da tabela de tarifas do EA, so sugere valores)
   - logo-soulan.png
   |
   |  ViaCEP direto do navegador  ->  https://viacep.com.br/ws/{cep}/json/
   |
   |  POST /api/enviar  (rewrite do Hosting)
   v
Cloud Function Python  enviarVt  (functions/)
   1. verifica o token de forma AUTORITATIVA (EdDSA / Ed25519, chave publica embutida) + exp
   2. reconfere CPF e sha256(cpf|dataNascimento) contra os claims (defesa em profundidade)
   3. valida o payload (espelha o DTO do EA)
   4. gera o PDF com reportlab (replica de vt_pdf.py: layouts OPTANTE e NAO_OPTANTE)
   5. envia ao bucket coletivo do GCS com a service account de runtime (ADC, sem chave JSON no repo)
```

O bucket vive no PROPRIO projeto da funcao (`vt-online-soulan`), onde a service account de runtime
tem storage nativo (sem o problema de quota zero do Drive). O EA le esse mesmo bucket depois
(cross-project, so leitura). O token e emitido pelo EA (consultor gera o link). O EA assina com a chave PRIVADA Ed25519, que
vive so no EA. Este app so tem a metade PUBLICA e apenas verifica.

### Claims do token (JWT compacto, alg EdDSA)

`sub` (admissaoId), `nome`, `cpf` (11 digitos), `nascHash` (sha256 hex de `${cpf}|${dataNascimento}`),
`iat`, `exp`, `jti`.

---

## Estrutura do repositorio

```
vt-online-soulan/
  firebase.json          # Hosting (rewrites /vt e /api/enviar) + functions (python312)
  .firebaserc            # projeto default: vt-online-soulan
  .gitignore
  README.md
  public/                # Firebase Hosting (estatico)
    index.html
    styles.css
    app.js               # fluxo: token -> identificacao -> formulario -> avisos -> envio
    ed25519.js           # verificacao Ed25519 no navegador (WebCrypto + fallback puro em JS)
    tarifas.json         # SNAPSHOT da tabela de tarifas (18 tarifas), so sugere valores
    logo-soulan.png      # mesmo logo dos PDFs
  functions/             # Cloud Function Python (2a geracao)
    main.py              # handler enviarVt (on_request)
    vt_token.py          # verificador EdDSA autoritativo (PyJWT + cryptography), chave publica embutida
    vt_pdf.py            # replica do ai-service/app/vt_pdf.py (reportlab, 2 layouts)
    requirements.txt
    .env.example         # modelo de functions/.env (VT_COLLECTIVE_BUCKET)
    assets/
      logo-soulan.png    # logo usado no cabecalho dos PDFs
    tests/
      test_verifier.py   # teste de interoperabilidade com o token real do EA
```

---

## Os DOIS valores que o operador preenche no deploy

O codigo esta completo. So faltam dois valores de ambiente que dependem da conta:

1. Service account de RUNTIME da funcao (e-mail)  ->  a identidade com que a funcao escreve no
   bucket via Application Default Credentials. Precisa de `roles/storage.objectAdmin` no bucket
   coletivo (item 2). Definida no deploy com `--service-account=<SA-email>` (ver abaixo). NAO ha
   chave JSON no repo.

2. `VT_COLLECTIVE_BUCKET`  ->  nome do BUCKET COLETIVO do Google Cloud Storage (no projeto
   `vt-online-soulan`) onde os PDFs sao arquivados. Definido em `functions/.env` (ver abaixo). O
   valor nasce vazio; enquanto nao for preenchido, a funcao recusa o upload (503).

---

## Deploy (o operador nao consegue rodar aqui; passos exatos)

Pre-requisitos: `firebase-tools` instalado (`npm i -g firebase-tools`), `gcloud` opcional, Python
3.12 disponivel, acesso ao projeto `vt-online-soulan`.

### 1. Login e projeto

```bash
firebase login
cd vt-online-soulan
firebase use vt-online-soulan
```

### 2. Definir o nome do bucket coletivo do GCS

```bash
cp functions/.env.example functions/.env
# edite functions/.env e preencha com o nome real do bucket:
# VT_COLLECTIVE_BUCKET=vt-online-soulan-coletivo
```

O Firebase CLI carrega `functions/.env` e publica como variavel de ambiente da funcao.

### 3. Preparar o bucket e a service account de runtime (identidade da funcao)

A funcao escreve no bucket do PROPRIO projeto usando a service account de RUNTIME (ADC), que tem
storage nativo (sem quota zero do Drive). Passos:

```bash
# a) escolha (ou crie) a service account de runtime, ex.:
#    vt-runtime@vt-online-soulan.iam.gserviceaccount.com
# b) crie o bucket no projeto vt-online-soulan (regiao proxima da funcao):
gcloud storage buckets create gs://vt-online-soulan-coletivo \
  --project vt-online-soulan --location us-central1 \
  --uniform-bucket-level-access
# c) de a SA de runtime permissao de escrita no bucket:
gcloud storage buckets add-iam-policy-binding gs://vt-online-soulan-coletivo \
  --member serviceAccount:vt-runtime@vt-online-soulan.iam.gserviceaccount.com \
  --role roles/storage.objectAdmin
```

Como o bucket vive no MESMO projeto da service account de runtime, o upload usa storage nativo do
projeto (sem o problema de quota zero que o Drive impoe a service accounts) e ADC dispensa chave JSON.

### 3b. Acesso de LEITURA do EA (cross-project)

O EA le esse mesmo bucket para puxar os PDFs. A service account do EA
`ea-automatic-sa@ea-v2-automatic.iam.gserviceaccount.com` precisa de `roles/storage.objectViewer`
no bucket (concessao cross-project, so leitura):

```bash
gcloud storage buckets add-iam-policy-binding gs://vt-online-soulan-coletivo \
  --member serviceAccount:ea-automatic-sa@ea-v2-automatic.iam.gserviceaccount.com \
  --role roles/storage.objectViewer
```

### 3c. Lifecycle recomendado (auto-expurgo em 30 dias)

Recomendado: regra de Object Lifecycle no bucket que apaga automaticamente objetos com mais de 30
dias (minimizacao, os PDFs sao efemeros apos o EA le-los). Exemplo:

```bash
cat > /tmp/lifecycle.json <<'JSON'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}
JSON
gcloud storage buckets update gs://vt-online-soulan-coletivo --lifecycle-file=/tmp/lifecycle.json
```

### 4. Deploy do Hosting e da funcao, fixando a service account de runtime

```bash
# funcao com a service account de runtime escolhida:
firebase deploy --only functions --project vt-online-soulan \
  -- --service-account=vt-runtime@vt-online-soulan.iam.gserviceaccount.com
```

Se o seu `firebase-tools` nao repassar a flag, defina a identidade da funcao pelo gcloud APOS o
primeiro deploy (a funcao 2a geracao roda no Cloud Run):

```bash
gcloud run services update enviarvt \
  --region us-central1 \
  --service-account vt-runtime@vt-online-soulan.iam.gserviceaccount.com \
  --project vt-online-soulan
```

Depois publique o Hosting:

```bash
firebase deploy --only hosting --project vt-online-soulan
```

Ou tudo de uma vez: `firebase deploy --project vt-online-soulan`.

### 5. Verificar

- Formulario: `https://vt-online-soulan.web.app/vt?t=<token-real-do-EA>`.
- O EA ja aponta para essa URL base (`VT_LINK_BASE_URL_PADRAO = https://vt-online-soulan.web.app/vt`).

---

## Como atualizar o snapshot de tarifas

`public/tarifas.json` e um SNAPSHOT da tabela de tarifas do EA. O app usa so para SUGERIR valores;
o candidato sempre pode digitar um valor proprio, e o servidor nunca confia no valor sugerido.

Quando as tarifas mudarem no EA (tela `/admin/tarifas`), re-exporte o snapshot a partir do CSV
oficial e publique de novo:

```bash
python3 - <<'PY'
import csv, json
origem = "/caminho/para/ea-automatic/apps/backend/src/db/data/tarifas-transporte-inicial.csv"
rows = []
with open(origem, newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        rows.append({"cidade": r["cidade_sistema"],
                     "tipoTransporte": r["tipo_transporte"],
                     "valor": round(float(r["valor_rs"]), 2)})
rows.sort(key=lambda x: (x["cidade"], x["tipoTransporte"]))
json.dump(rows, open("public/tarifas.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(len(rows), "tarifas")
PY
firebase deploy --only hosting --project vt-online-soulan
```

Este app NAO chama o EA para buscar tarifas de propriedade (por design: isolamento total). O
snapshot e a fonte da sugestao.

---

## Rodar o teste (verificador de token)

Prova que a funcao aceita um token REAL cunhado pelo EA, extrai os claims e que
`sha256("11122233344|1990-05-20")` bate com o claim `nascHash`. Cobre tambem rejeicao de token
expirado, assinatura adulterada e alg diferente de EdDSA.

```bash
cd functions
python3 -m venv venv && . venv/bin/activate      # ou: uv venv venv
pip install -r requirements.txt pytest            # ou: uv pip install -r requirements.txt pytest
pytest tests/ -v
```

O teste desliga a checagem de `exp` APENAS para o token real (que expira em 2026-07-31); o caminho
de rejeicao por expiracao e coberto por um token de vida curta assinado com uma chave efemera
propria, sem depender da chave privada do EA.

---

## Modelo de seguranca (LGPD)

- Verificacao do token em duas camadas: OFFLINE no navegador (UX, `ed25519.js`) e AUTORITATIVA no
  servidor (`vt_token.py`, EdDSA + `exp`). O cliente nunca e fonte de verdade.
- Segunda barreira de identidade: o candidato digita CPF + data de nascimento; conferimos o CPF
  contra o claim e `sha256(cpf|dataNascimento)` contra o `nascHash`, no cliente E no servidor.
- Chave publica embutida (segura para embarcar); a chave PRIVADA vive so no EA.
- Sem chave JSON no repositorio: o upload ao bucket usa Application Default Credentials, a service
  account de runtime da funcao, que tem storage nativo no proprio projeto.
- Sem chamada ao EA em runtime: o EA permanece fechado. So o ViaCEP (publico) e chamado do navegador.
- Nunca logamos token, CPF, nome ou `nascHash`. A resposta da funcao carrega so metadados nao
  sensiveis (`ok`, `optante`, `objeto`).
- O PDF (que carrega PII por necessidade, e o documento oficial) so trafega em memoria; nada e
  gravado em disco na funcao, alem do envio ao bucket.

---

## O PDF

Replica fiel de `apps/ai-service/app/vt_pdf.py` do EA, com o mesmo logo Soulan e as mesmas secoes:

- OPTANTE: DADOS PESSOAIS, DESCRITIVO DO ITINERARIO IDA e VOLTA, TOTAL A SER UTILIZADO NO DIA,
  COMPROMISSO DO COLABORADOR, bloco de assinatura.
- NAO_OPTANTE: DADOS PESSOAIS, DECLARACAO de nao opcao, bloco de assinatura.

O `tipo` (OPTANTE / NAO_OPTANTE) e derivado do campo `optante` do formulario.

Nome do objeto no bucket, exatamente: `NOME EM MAIUSCULAS 11digitosdocpf.pdf`
(ex.: `MARIA DE TESTE SILVA 11122233344.pdf`).
