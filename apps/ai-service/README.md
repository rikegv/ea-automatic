# ai-service (EA AUTOMATIC)

Motor de IA isolado (FastAPI + Python 3.12, gerido por `uv`). Consome **Vertex AI / Gemini
(Google)** via SDK do Google Cloud (`google-genai`, cliente Vertex), autenticado por **service
account** no projeto `ea-v2-automatic` — **não usa Claude/Anthropic API** (CLAUDE.md §A.2/§A.5
INT-3). A mesma credencial serve o **Drive** (INT-2) e o **Vertex AI** (INT-3), escopos distintos.

## Fase 4 — o que faz

- **F2 — Auditoria documental incremental** (`POST /auditoria/documento`): lê o documento da
  staging, audita contra as **regras de auditoria ativas** (insumo do diretor, §A.9) e devolve um
  `ResultadoAuditoria` com `status` restrito ao enum `VALIDADO|INCONFORME|PENDENTE`. A **régua**
  (quais documentos são exigidos) é resolvida pelo backend; aqui só se decide a **validade**.
- **INT-2 — Arquivamento no Drive** (`POST /drive/arquivar`): cria a pasta do funcionário, as 4
  subpastas (`ASO`, `ADMISSÃO`, `BENEFÍCIOS`, `DOCUMENTOS PESSOAIS`) sob demanda e sobe cada
  arquivo renomeado; devolve o `webViewLink` da pasta. Suporta Shared Drives.
- **F9 — Gerador de kit** (`POST /kit/gerar`): o Gemini localiza as páginas do candidato no
  PDF-mãe; o `pypdf` extrai para um novo PDF na staging. **Sem Clicksign, sem Drive** (OST §5).

## Segurança (CLAUDE.md §A.6)

- Todos os endpoints exigem o header `X-Internal-Token` (== `INTERNAL_TOKEN`). Sem token → 401.
  Sem porta pública: o token é **defesa em profundidade** na rede interna.
- **Staging efêmera, fora do banco.** O binário transita em memória e o buffer é descartado após
  a chamada. O documento **nunca persiste**.
- **CPF / nome / conteúdo do documento NUNCA são logados.** O `motivo` devolvido é sanitizado
  contra eco de CPF.
- **Prompt injection:** as regras são *server-supplied*; o modelo é instruído a ignorar quaisquer
  instruções contidas no documento auditado.

## Configuração

Copie `.env.example` para `.env` e preencha. `credentials.json` (service account) fica na raiz do
serviço. **Ambos são gitignored — nunca commitar.**

| Variável | Descrição |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Caminho da service account (default `./credentials.json`) |
| `GOOGLE_CLOUD_PROJECT` | `ea-v2-automatic` |
| `VERTEX_AI_LOCATION` | Região do Vertex (ex.: `us-central1`) |
| `GEMINI_MODEL` | Modelo multimodal (ex.: `gemini-2.5-flash`, disponível em `us-central1`) |
| `STAGING_DIR` | Diretório da staging efêmera |
| `INTERNAL_TOKEN` | Token do header `X-Internal-Token` |
| `DRIVE_DELEGATED_SUBJECT` | (opcional) usuário a impersonar (INT-2 delegation em My Drive) |
| `DRIVE_MOCK` | `true` simula o arquivamento (validação visual; não chama o Drive) |

## Dev

```bash
uv sync --all-extras                                   # instala deps + grupo dev
uv run pytest -q                                       # testes (Gemini e Drive mockados)
uv run ruff check .                                    # lint
uv run uvicorn app.main:app --host 127.0.0.1 --port 8010   # subir local
```

## Docker

```bash
docker build -t ea-ai-service apps/ai-service
docker run --rm -p 8010:8000 \
  -v "$PWD/apps/ai-service/credentials.json:/app/credentials.json:ro" \
  --env-file apps/ai-service/.env \
  ea-ai-service
```

`credentials.json` e `.env` são montados em runtime — nunca entram na imagem.
