# PLANO DO BINDING: a conta de serviço `ea-portal-arquivador` (Desenho 1)

**Para o Rike rodar, APÓS revisão do coordenador. A fábrica NÃO executa nada disto (§A.0): binding,
geração de chave e IAM são do diretor.** Este arquivo é o roteiro, não a execução.

**O que ele destrava:** a conta "cega" que lê o balde de entrada do Portal e escreve SÓ na árvore do
prontuário no Drive, sem interpretar o documento e sem delegação domain-wide. É a ponte que faltava
para o documento entregue pelo Portal chegar ao prontuário (hoje ele fica só no balde). O código do
arquivador já está pronto e INERTE (ver `docs/PARECER-ARQUIVADOR-PORTAL.md` e o DIARIO); ele só liga
quando esta conta e este binding existirem.

**UM binding destrava DUAS coisas, sem papel a mais.** Além de criar o prontuário no Drive, a mesma
conta cega passa a servir o documento do Portal na tela de **Auditoria** (o time abre e vê o que o
candidato anexou, como era no Pandapé). A visualização só LÊ o balde, então usa exatamente o
`roles/storage.objectViewer` de (b): **não exige papel novo**, não escreve no Drive, não fura o VS3.
Ao rodar (a)(b)(c)(d) e ligar a instância, prontuário + documento-na-auditoria acendem juntos.

**Confirmado contra o Desenho 1 (memória da frente) e contra o banco de produção em 2026-10-14:**

| item | valor |
|---|---|
| projeto Google Cloud | `ea-v2-automatic` |
| conta de serviço | `ea-portal-arquivador@ea-v2-automatic.iam.gserviceaccount.com` |
| balde de entrada | `ea-portal-prod-entrada` |
| papel no balde | `roles/storage.objectViewer` (somente leitura) |
| escrita no Drive | compartilhamento das 13 pastas-pai como **Editor**, SEM delegação domain-wide |
| pastas-pai (conferidas no banco) | **13 ids distintos** em `drive_pasta_pai` (21 linhas, repetições apontam para o mesmo id) |

> **PONTO QUE O COORDENADOR PRECISA CONFIRMAR COM O RIKE ANTES DE (d), e é o único risco real do
> desenho:** a conta pura (sem delegação domain-wide) só consegue CRIAR arquivo numa pasta se a
> árvore do prontuário viver em um **Drive compartilhado (Shared Drive)**. Se as 13 pastas-pai forem
> de **Meu Drive** de uma pessoa (hoje a operação escreve nelas por delegação de `admin.soulan@`), a
> conta pura é recusada com `storageQuotaExceeded` mesmo sendo Editor. **O conserto, se for o caso:
> mover a árvore do prontuário para um Drive compartilhado e dar à conta o papel de gerenciador de
> conteúdo nele** (um passo, no lugar de (d)). A fábrica mediu que a operação hoje usa delegação
> (`DRIVE_DELEGATED_SUBJECT`), e o arquivador NÃO pode usar delegação (seria devolver a ele a chave
> humana que a postura VS3 manda tirar). Decidir Shared Drive vs. Meu Drive é do diretor.

---

> **HARDENING confirmado pela seguranca (§A.38), para o binding não furar o isolamento:**
> - A conta `ea-portal-arquivador` recebe **só** os papéis de (b) `storage.objectViewer` no balde e
>   (d) Editor nas 13 pastas. **NENHUM papel de Vertex/`aiplatform`**, e nada de outro balde. A
>   instância magra ainda monta as rotas de parser (`/auditoria`, `/kit`, `/coleta-vt`); elas ficam
>   inertes só porque a credencial não alcança nem Vertex nem outro balde. O isolamento passa a
>   depender do ESCOPO da chave, então a chave tem de ser mínima.
> - O `.env` da instância magra **não** traz `DATABASE_URL` e **não** traz `DRIVE_DELEGATED_SUBJECT`
>   (ver "Depois do binding").
> - `GOOGLE_APPLICATION_CREDENTIALS` tem de ser **caminho ABSOLUTO** para a chave de (c): o default
>   relativo resolve para a credencial unificada Drive+Vertex da operação, que é justamente o que não
>   pode chegar aqui.

## (a) Criar a conta de serviço

```bash
gcloud iam service-accounts create ea-portal-arquivador \
  --project=ea-v2-automatic \
  --display-name="EA Portal Arquivador (cego: balde -> prontuario)"
```

## (b) Dar LEITURA (somente) no balde de entrada

```bash
gcloud storage buckets add-iam-policy-binding gs://ea-portal-prod-entrada \
  --project=ea-v2-automatic \
  --member="serviceAccount:ea-portal-arquivador@ea-v2-automatic.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```

## (c) Gerar a chave no local protegido

A chave JSON vai para FORA do repositório, em caminho absoluto só do serviço (modo `0600`), do mesmo
jeito que a credencial do leitor (`docs/PORTAL-LEITOR-ISOLAMENTO-INFRA.md`). Ela NUNCA entra em
commit, em log nem no bundle (§A.6). Sugestão de caminho: `/etc/ea-portal-arquivador/credentials.json`
(ou `/home/henrique/apps/ea-portal-arquivador/credentials.json` enquanto a unidade de sistema não
sobe).

```bash
gcloud iam service-accounts keys create /etc/ea-portal-arquivador/credentials.json \
  --project=ea-v2-automatic \
  --iam-account=ea-portal-arquivador@ea-v2-automatic.iam.gserviceaccount.com
chmod 600 /etc/ea-portal-arquivador/credentials.json
```

## (d) Compartilhar as 13 pastas-pai do Drive com a conta, como Editor (SEM delegação)

Para cada id abaixo, compartilhar a pasta com
`ea-portal-arquivador@ea-v2-automatic.iam.gserviceaccount.com` no papel **Editor**. Pelo Drive, é
"Compartilhar > adicionar o e-mail da conta > Editor". Por API (se o Rike preferir script), é um
`permissions.create` por pasta com `role=writer`, `type=user`, `sendNotificationEmail=false`,
`supportsAllDrives=true`. **Nenhuma delegação domain-wide é concedida; a conta não impersona
ninguém.**

As 13 pastas-pai, conferidas em `drive_pasta_pai` (produção, ativos, 2026-10-14). Os ids não são
segredo nem PII (são identificadores do Drive, §A.6); os rótulos ajudam a conferir no Drive:

| # | folder_id | pastas que apontam para ele |
|---|---|---|
| 1 | `1UjcGJReRHBeiOMbaJ7c3bsgF4NWvxYQ0` | Contrato Estagio |
| 2 | `1VoQA9HiLsXWdCH39BRJaGOfjd2R1uF1y` | Contrato Interno, Contrato Jovem Aprendiz |
| 3 | `1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu` | Contrato Temporario |
| 4 | `19FNSX2fCObrH1uth7t0CesKSHcPzoRkz` | Contrato Terceirizado |
| 5 | `1WXvWoiOMbFFWhLlYMLpCHAh8vTAaYpxn` | Fopag cliente 16, Fopag cliente 51906 |
| 6 | `1wQXWDKnfZo6mdTelu1MQYFXstixqD6CZ` | Fopag cliente 19 |
| 7 | `17R3Jrpf9vDnn6CwlkM-dlxnWt1dMCquB` | Fopag cliente 27 |
| 8 | `1fuifnIMbwo6tmH8YEc6-0l52T-RAtqrS` | Fopag cliente 28, Fopag cliente 54792 |
| 9 | `1UIiR1XBw8yVzgckoZMaPlGHfTPzsVplB` | Fopag cliente 29, Fopag cliente 51156 |
| 10 | `1yJEoMG76rEsT-tbBcMYYrN8fozqfOYc-` | Fopag cliente 33, Fopag cliente 54925, Fopag cliente 55371 |
| 11 | `1sOSCN9ev15clCwCK_X_GlhXF_IlGEEJe` | Fopag cliente 34, Fopag cliente 55055 |
| 12 | `1FILnKhlgdPfoz1M_lje_8Rw2w1foGMYi` | Fopag cliente 44, Fopag cliente 56685 |
| 13 | `1-CyD25qKiHX97vU8x7xs_DPI8j1BlgKS` | Fopag cliente 57526 NILIT |

> **Nota:** `drive_pasta_pai` é a FONTE DA VERDADE (administrável pela tela), com o mapa de
> `drive-routing.ts` como rede de segurança. Se o diretor cadastrar uma pasta-pai nova depois, ela
> precisa receber o mesmo compartilhamento. Hoje são estes 13.

---

## Depois do binding: ligar o arquivador (ainda do diretor / devops, não é esta frente)

1. Subir a TERCEIRA instância do `ai-service` (a magra "arquivador"), espelhando o leitor
   (`docs/PORTAL-LEITOR-ISOLAMENTO-INFRA.md`), com o `.env` próprio FORA do repositório:
   - `PORTAL_PAPEL=ARQUIVADOR`
   - `PORTAL_BUCKET=ea-portal-prod-entrada`
   - `GOOGLE_APPLICATION_CREDENTIALS=<caminho absoluto da chave de (c)>`
   - `DRIVE_DELEGATED_SUBJECT=` (VAZIO, sem delegação)
   - `DATABASE_URL=` (VAZIO, sem banco)
   - `INTERNAL_TOKEN=<token próprio, diferente do leitor e da operação>`
   - porta de loopback própria (ex.: 8030; leitor é 8020, operação 8000)
2. Apontar o backend para ela, no `.env` do backend (fora do repo):
   - `PORTAL_ARQUIVADOR_URL=http://127.0.0.1:8030`
   - `PORTAL_ARQUIVADOR_TOKEN=<o mesmo INTERNAL_TOKEN acima>`
3. **Só então** armar o gatilho vivo, quando o diretor validar: `PORTAL_ARQUIVAMENTO_ARMADO=true`.
4. Rodar o reprocesso retro (ainda NÃO agora): `pnpm tsx src/db/rearquiva-portal.ts` (lista) e, com o
   aval, `--aplicar`. A meta é 100%: a prova de cobertura está no fim do DIARIO e em
   `docs/ESCOPO-SEM-PRONTUARIO-PORTAL.md`.

**Enquanto (a)(b)(c)(d) não existirem, tudo acima fica inerte: a rota do arquivador responde 403/503,
o cliente do backend diz "não configurado" e o gatilho vivo é no-op. Nada toca produção.**
