# Emissor do Portal (servidor falso da demo)

O EA é o **cliente** (`apps/backend/src/portal/portal-emissor.service.ts`): ele cunha um **bilhete
assinado Ed25519** e o troca, por rota, com este emissor. O emissor converte um bilhete válido numa
**URL assinada de escrita do Google Cloud Storage**, consulta metadado, corrige tipo e apaga objeto.
**O emissor NUNCA recebe o arquivo do candidato** (condição VS7): o byte vai do navegador direto ao
balde, com a URL que este serviço assina.

Este é o **"servidor falso"** que o desenho prevê pela exceção de loopback (`http://127.0.0.1`), para
a DEMO REAL. Em produção o emissor roda no projeto do Google, em `https`, com identidade de runtime.
**Nada aqui é commitado nem vai para produção nesta frente.**

## Contrato (casa 1:1 com o cliente que já existe)

Todas as rotas recebem `POST /{destino}` com corpo `{"bilhete": "<jws>"}` e `Content-Type:
application/json`. O destino é a rota **e** um claim assinado dentro do bilhete: bilhete de uma rota
não serve para outra (condições B2/B3).

| Rota | Devolve (200) | Identidade |
|---|---|---|
| `POST /assinar-escrita` | `{"url","cabecalhos","expiraEm"}` | SA de **assinatura** (só cria objeto) |
| `POST /metadado` | `{"objeto","existe","bytes","contentType","geracao"}` | SA de **curadoria** |
| `POST /corrigir-tipo` | `{"ok": bool}` | SA de **curadoria** |
| `POST /apagar` | `{"ok": bool}` | SA de **curadoria** |

**Qualquer recusa responde com status != 2xx e corpo genérico.** O cliente só olha `resposta.ok`:
recusa vira `null` do lado dele, o documento continua pendente, e a próxima tentativa resolve.

O `assinar-escrita` devolve:
- `url`: `https://storage.googleapis.com/{bucket}/{objeto}?X-Goog-...` (forma de caminho, a que o
  cliente confere em `urlDeEscritaConfere`, veto V6);
- `cabecalhos`: **exatamente** os três canônicos do bilhete (`content-type`,
  `x-goog-content-length-range`, `x-goog-if-generation-match`), sem acrescentar/remover/reordenar. O
  cliente compara byte a byte com o que assinou. **Cuidado implementado:** o SDK do GCS injeta um
  header `Host` no dict que recebe; a resposta é um snapshot tirado **antes** de assinar.
- `expiraEm`: ISO 8601.

## O que o emissor confere no bilhete (fail-closed)

1. Formato JWS de três partes; `alg == EdDSA` **antes** de qualquer conta (defesa contra confusão de
   algoritmo);
2. Assinatura Ed25519 válida sob a **chave pública do EA** (par de `PORTAL_EMISSOR_BILHETE_PRIVATE_KEY`);
3. `exp` no futuro; `dst` conhecido **e igual à rota**; `bkt` igual ao balde configurado;
4. Reimposição B1 na escrita: método `PUT`, os três cabeçalhos canônicos exatos, trava de
   sobrescrita (`x-goog-if-generation-match: 0`), teto de bytes ≤ `PORTAL_EMISSOR_MAX_BYTES`, TTL
   ≤ `PORTAL_EMISSOR_TETO_SEGUNDOS`.

**Sem a chave pública do EA, o emissor inteiro é inerte** (recusa tudo). **Sem a SA de assinatura,
`assinar-escrita` recusa** (503) sem vazar nada. **§A.6: nunca loga bilhete, URL, nome de objeto,
chave ou token** — só a rota e a classe do erro.

## Como rodar

```bash
cd infra/portal-emissor
cp .env.example .env        # preencher; ver a seção de env
uv venv && uv pip install -e .   # ou: pip install cryptography google-cloud-storage
set -a; . ./.env; set +a
python3 emissor.py
```

Sobe em `127.0.0.1:8030` por padrão (loopback, `http` permitido pela exceção do cliente).

## Provas locais (sem SA)

```bash
python3 test_local.py
```

Sobe o servidor num porto de loopback e exercita o contrato pela rede. Prova o **fail-closed** (sem
SA, bilhete válido vira recusa genérica), a defesa de confusão de algoritmo, a separação por destino,
a trava de sobrescrita, e que **o log não vaza objeto/bucket/bilhete**. Roda só com `cryptography`.

O caminho de escrita (a forma da URL V4 e os cabeçalhos idênticos aos assinados) foi validado offline
contra a lógica de `urlDeEscritaConfere` do cliente, com uma SA de RSA gerada localmente (o
`generate_signed_url` V4 assina local, sem rede). O interop Ed25519 foi provado com `node:crypto`
cunhando o bilhete e o emissor verificando.

## Variáveis de ambiente (lado servidor)

Ver `.env.example`. As quatro que precisam **casar com o backend do EA**:

| Emissor (servidor) | EA (cliente) | Regra |
|---|---|---|
| `PORTAL_EMISSOR_EA_PUBLIC_KEY` | `PORTAL_EMISSOR_BILHETE_PRIVATE_KEY` | par de chaves Ed25519 |
| `PORTAL_EMISSOR_BUCKET` | `PORTAL_GCS_BUCKET` | mesmo nome de balde |
| `PORTAL_EMISSOR_LISTEN_HOST/PORT` | `PORTAL_EMISSOR_URL` | mesmo endereço loopback |
| (kid aceito no header do bilhete) | `PORTAL_EMISSOR_KID` | opcional, rotação |

## O que precisa do GCP do Rike

- **SA de ASSINATURA** (`PORTAL_EMISSOR_SIGNER_SA_FILE`): service account no projeto
  `ea-v2-automatic` com permissão de **criar objeto** no balde do Portal (`storage.objects.create`)
  e a role que permite assinar URL localmente (a SA precisa da chave privada JSON, ou do papel
  `iam.serviceAccountTokenCreator` para SignBlob). Só CRIA objeto: não lê, não lista, não apaga.
- **SA de CURADORIA** (`PORTAL_EMISSOR_CURADORIA_SA_FILE`): identidade **separada** que lê metadado,
  corrige tipo e apaga (`storage.objects.get`/`update`/`delete`). Opcional para a demo do envio.
- O **balde** do Portal criado e nomeado (o mesmo em `PORTAL_GCS_BUCKET`/`PORTAL_EMISSOR_BUCKET`).
