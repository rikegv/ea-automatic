# PROPOSTA — Modelagem cliente↔empresa Soulan + CRUD de clientes

**OST Estrutural · FASE 1 (read-only, proposta). NADA aplicado.** · Data: 2026-07-07
**Aguarda validação do diretor para liberar a Fase 2 (implementação).**

> Alto impacto: mexe no modelo de dados. Este documento **propõe**; não altera schema, dados nem código.

---

## 0. Resumo executivo (o que decidir)

1. **Modelo:** adicionar 3 tabelas novas (`entidades_soulan`, `entidade_filiais`, `cliente_vinculos`)
   **sem tocar** na PK `clientes.cod_cliente` nem no que a esteira/wizard/régua já usam. O vínculo
   cliente↔(empresa, filial, tipo de serviço) vira **1:N** em `cliente_vinculos`.
2. **CNPJ da entidade Soulan: ⛔ FONTE NÃO EXISTE no sistema.** Só temos os CNPJs **dos clientes** e
   3 **raízes** Soulan. Falta a tabela **(empresa/tipo + filial) → entidade Soulan + CNPJ completo**.
   **Não inventei nenhum CNPJ.** O que falta está na §2.
3. **CRUD:** já existe um CRUD de clientes, mas o `DELETE` é **exclusão física** — precisa virar
   **inativação** (`ativo=false`). Recomendo inativar com **aviso** (nunca bloquear/excluir): é
   reversível e preserva histórico.
4. **Migração:** reconciliar os 131 por **`cod_cliente`** (UPSERT idempotente, o padrão que o
   `seed-clientes` já usa). Sem exclusão. **A base nova ainda não está no repositório** (§4/§5).

---

## 1. Modelo de dados

### 1.1 O que existe hoje (lido do sistema)

Tabela **`clientes`** (PK de negócio `cod_cliente`), 116 registros (114 da carga 1B + 2 demo):

| coluna | hoje | observação |
|---|---|---|
| `cod_cliente` (PK) | ex. `30747` | chave de negócio §A.3; usada por esteira, régua, admissões |
| `cnpj` | ex. `33.043.951/0006-01` | **CNPJ do PRÓPRIO CLIENTE** (não da Soulan) |
| `razao_social` | ex. `IFF ESSENCIAS...` | razão do cliente |
| `nome_operacao` | ex. `IFF TAUBATE` | apelido/operação |
| `empresa_grupo` | **uniforme**: `SOULAN CONSULTORIA E MAO DE OBRA TEMPORARIA LTDA` em **todos os 114** | texto livre, **sem CNPJ**; hoje não é fonte útil |
| `regiao` | número (`4`=94×, `5`, `2`, `7`, `12`, `16`, `26`…) | **é o código de região** |
| `descricao_regiao` | `PAULISTA`, `SAO JOSE CAMPOS`… | texto da região |
| `beneficios_padrao` / `escala_padrao` / `endereco_padrao` | pré-preenchem o wizard (editáveis) | **não sobrescrever na migração** |
| `ativo` (bool) | default `true` | já existe; o wizard já filtra `ativo=true` |

**Conclusões da leitura:**
- **Não existe hoje** a coluna "Empresa" (código do tipo de serviço) nem "Filial" no modelo — são
  **novidade** da base nova. O `empresa_grupo` atual é um texto único, não o código.
- O **tipo de serviço já existe, porém na ADMISSÃO**, no campo `admissoes.tipo_contrato` (valores do
  wizard: `Temporário, Terceirizado, Estágio, Interno, Fopag, Jovem Aprendiz`). O `drive-routing.ts`
  já roteia a pasta do Drive por `tipo_contrato` (e por `cod_cliente` quando é Fopag). Ou seja, **o
  código "Empresa" da base é a MESMA taxonomia do `tipo_contrato`**.
- `admissoes` referencia `cod_cliente` e `cargo_id`; **não** guarda empresa/filial/entidade.

### 1.2 Mapa Empresa (código) → tipo de serviço (regra do diretor)

| código "Empresa" | tipo de serviço | CNPJ do documento |
|---|---|---|
| 1, 3 | Temporário | entidade Soulan (empresa+filial) |
| 2 | Terceiro | entidade Soulan (empresa+filial) |
| 4 | Estágio | entidade Soulan (empresa+filial) |
| 5, 6 | Interno | entidade Soulan (empresa+filial) |
| **> 6** | **FOPAG** | **CNPJ do próprio CLIENTE** (`clientes.cnpj`) |

Determinístico a partir do código → vira uma função pura `tipoServicoDeEmpresa(codigo)`.

### 1.3 Tabelas propostas (aditivas, não quebram nada)

```
entidades_soulan                 -- catálogo das empresas do Grupo Soulan
  id (uuid, pk)
  nome            text  not null -- ex.: SOULAN ADMINISTRAÇÃO, NEAT, SOULAN CONSULTORIA
  cnpj_raiz       varchar(8)     -- ex.: 59051086, 11063100, 59749705 (raiz; NÃO é o completo)
  ativo           bool  default true

entidade_filiais                 -- CNPJ COMPLETO por filial da entidade  ⟵ DADO QUE FALTA (§2)
  id (uuid, pk)
  entidade_id     uuid  fk entidades_soulan
  filial          varchar(20)    -- código de filial da base
  cnpj            varchar(18)    -- CNPJ completo (14 díg) daquela filial  ⟵ o diretor precisa fornecer
  nome_filial     text  null
  ativo           bool  default true
  unique (entidade_id, filial)

cliente_vinculos                 -- O 1:N: cliente pode ter vários (empresa+filial)
  id (uuid, pk)
  cod_cliente     varchar(40) fk clientes.cod_cliente
  empresa_codigo  varchar(10) not null      -- o código bruto da base (1,2,3,4,5,6,>6)
  tipo_servico    enum(TEMPORARIO,TERCEIRO,ESTAGIO,INTERNO,FOPAG)  -- derivado do código
  filial          varchar(20) null          -- filial da base
  is_fopag        bool default false
  entidade_id     uuid null fk entidades_soulan   -- NULL quando FOPAG (usa CNPJ do cliente)
  ativo           bool default true
  unique (cod_cliente, empresa_codigo, filial)
```

**Resolução do CNPJ do documento (runtime, sem inventar nada):**
```
se vinculo.is_fopag        -> clientes.cnpj (CNPJ do próprio cliente)   ✅ temos
senão                      -> entidade_filiais.cnpj  onde (entidade_id, filial)   ⛔ falta o dado
```

### 1.4 Ligação com a admissão (mínima, não obrigatória agora)

- Hoje a admissão guarda `tipo_contrato` (texto). Proponho **adicionar** `admissoes.cliente_vinculo_id`
  (uuid, **nullable**, fk `cliente_vinculos`): ao criar a admissão de um cliente com N vínculos, o
  consultor escolhe **qual** vínculo (tipo/filial) — e daí saem a entidade+CNPJ e a pasta do Drive.
- **Compatibilidade:** `tipo_contrato` permanece; `cliente_vinculo_id` é opcional. Admissões antigas e
  o `drive-routing` atual continuam funcionando (fallback por `tipo_contrato`/`cod_cliente`). Migração
  do routing para o vínculo é incremental, **fora desta OST**.

### 1.5 Por que não quebra o que existe

- `clientes.cod_cliente` (PK) intacto → esteira, régua (`cod_cliente+cargo`), admissões, wizard seguem.
- `empresa_grupo` mantido para exibição/retrocompat (deixa de ser "fonte de verdade"; a verdade passa
  a ser `cliente_vinculos`).
- Tudo novo é **tabela aditiva** + 1 coluna nullable. Zero alteração destrutiva.

---

## 2. Resolução de CNPJ da entidade Soulan — ⛔ PARE: fonte incompleta

**Procurei em todo o sistema e nas bases. NÃO existe fonte autoritativa de (empresa+filial → CNPJ
Soulan).** O que existe:

- ✅ **CNPJ do cliente** (`clientes.cnpj` / coluna "CNPJ Cliente" da base). Cobre **FOPAG (>6)**, cujo
  documento usa o CNPJ do próprio cliente.
- ✅ **3 raízes** conhecidas (informadas pelo diretor): SOULAN ADMINISTRAÇÃO `59.051.086`,
  NEAT `11.063.100`, SOULAN CONSULTORIA `59.749.705`. **São só raízes (8 díg), não CNPJ completo.**
- ❌ **Não há** mapeamento código/tipo → qual entidade.
- ❌ **Não há** nenhuma tabela/arquivo com o **CNPJ completo por filial** (o dígito da filial `/000X-DV`).
- ❌ O `empresa_grupo` atual é texto uniforme, sem CNPJ; migrations não têm entidades Soulan.

**O que o diretor precisa fornecer para fechar a §2 (sem isto NÃO dá para gerar documento não-FOPAG):**
1. **Mapa tipo → entidade:** para cada tipo (Temporário / Terceiro / Estágio / Interno), **qual entidade
   Soulan** é a contratante. (Ex.: Temporário → SOULAN CONSULTORIA? Interno → SOULAN ADMINISTRAÇÃO?
   Onde entra a **NEAT**? — a confirmar, **não vou supor**.)
2. **Tabela (entidade, filial) → CNPJ completo**, cobrindo **todas as filiais** que aparecem na base
   nova. Cada filial tem seu próprio `/000X-DV`; hoje temos **zero** desses.
3. Confirmar que **FOPAG usa o CNPJ do cliente** (já é a regra informada — só ratificar).
4. **A própria base nova** (ver §5): sem ela não consigo **enumerar** os pares (Empresa, Filial) que
   precisam de CNPJ — logo não sei a lista exata de CNPJs faltantes.

> Enquanto (1)–(2) não chegarem: a Fase 2 pode criar as tabelas e migrar clientes/vínculos, mas os
> vínculos **não-FOPAG** ficam com `entidade_id`/CNPJ **pendentes** (marcados), sem chute. FOPAG fecha.

---

## 3. CRUD de clientes

### 3.1 O que já existe (lido)

- Back: `admin/clientes` — `GET` (list), `POST` (create), `PATCH :cod` (update, já aceita `ativo`),
  `DELETE :cod`. **`DELETE` faz exclusão FÍSICA** (`db.delete(clientes)`) — ⚠️ viola "não há exclusão
  física" e pode quebrar FK (admissões referenciam `cod_cliente`).
- Front: `admin/clientes/page.tsx` (lista + criar + botão que chama `DELETE`).
- Wizard/catálogo já filtram `clientes.ativo = true`.

### 3.2 Proposta

**Regra de ouro: nunca exclusão física. "Inativar" = `ativo=false`.**

- **Trocar o `DELETE` físico por inativação** (`ativo=false`, `atualizado_em=now()`), ou substituir o
  botão por `PATCH {ativo:false}`. Reativação = `PATCH {ativo:true}`. Histórico 100% preservado; o
  cliente some das seleções (wizard/esteira já respeitam `ativo`).
- **Comportamento ao inativar (recomendação = mais seguro): AVISAR, nunca BLOQUEAR nem cascatear.**
  - Cliente com admissões em andamento: **permite** inativar (é reversível e não apaga nada); mostra
    aviso *"N admissões em andamento continuam; o cliente sai das novas seleções"*. As admissões
    seguem íntegras (o registro do cliente continua existindo — não é delete).
  - Inativar um **vínculo** (empresa/filial) usado por admissão aberta: **permite** com aviso listando
    as admissões afetadas. Nada é apagado; dá para reativar.
  - Racional: bloquear inativação incentiva gambiarra; exclusão física perde histórico (proibido).
    Inativação reversível + trilha é o equilíbrio seguro (mesma filosofia §A.6 "responsabilização").

**Telas/rotas propostas:**

| Rota | Método | Ação |
|---|---|---|
| `/admin/clientes` | GET | lista com filtro **ativos/inativos**, badge de status |
| `/admin/clientes` | POST | criar cliente (+ vínculos iniciais) |
| `/admin/clientes/:cod` | PATCH | editar dados / `ativo` (inativar/reativar) |
| `/admin/clientes/:cod` | ~~DELETE~~ | **removido/soft** — vira `PATCH ativo=false` |
| `/admin/clientes/:cod/vinculos` | GET/POST | listar/adicionar vínculo (empresa+filial+tipo) |
| `/admin/clientes/:cod/vinculos/:id` | PATCH | editar/inativar vínculo |
| `/admin/entidades-soulan` | GET/POST/PATCH | catálogo entidades + filiais (CNPJ) — quando o dado chegar |

**UI:** (a) lista de Clientes com toggle ativo/inativo e busca; (b) ficha do Cliente com um bloco
**"Vínculos Soulan"** (sub-lista 1:N: empresa+filial+tipo → entidade+CNPJ resolvido, ou "CNPJ pendente");
(c) tela **Entidades Soulan** (admin) para cadastrar entidade/filial/CNPJ quando o diretor fornecer.

---

## 4. Plano de migração (131 clientes)

**Chave de reconciliação = `cod_cliente`** (PK de negócio). É o "De-Para" real (CLAUDE.md §A.3: "o
De/Para apelido↔razão social resolve-se pelo código"). O `seed-clientes.ts` já faz **UPSERT idempotente
por `cod_cliente`** — reaproveitar esse padrão.

> Observação: o único "de/para" no código é o **Pandapé→catálogo** (`resolverClienteCargo`), que está
> **pendente/TODO** e **não se aplica** aqui — esta migração é base→base por `cod_cliente`.

**Passos (idempotentes, sem exclusão):**
1. Colocar a base nova como CSV versionado (ex.: `data/clientes-carga-atualizada-07-07.csv`) — **pendente
   do arquivo** (§5).
2. **Staging** → validar 131 linhas (colunas: Empresa, Filial, Região, Descrição Região, Cod. Cliente,
   Nome Cliente, CNPJ Cliente).
3. **UPSERT `clientes`** por `cod_cliente`: preencher `cnpj`(cliente), `razao_social`/`nome_operacao`
   (definir qual é "Nome Cliente" — ver §5), `regiao`, `descricao_regiao`. **Não sobrescrever**
   `beneficios/escala/endereco_padrao` já editados (preservar trabalho do consultor).
4. **Derivar `cliente_vinculos`** de (Empresa, Filial): `tipo_servico` via mapa §1.2; `is_fopag` se >6;
   `entidade_id`+CNPJ **resolvidos só quando** a tabela de entidades/filiais existir — senão marca
   **pendente** (sem inventar).
5. **Relatório de reconciliação** (sem aplicar nada destrutivo):
   - novos (na base nova, não no EA) → inserir;
   - existentes (em ambos) → atualizar campos da base;
   - **no EA e ausentes da base nova** → **manter** (não excluir, não inativar automático); **listar
     para o diretor decidir**;
   - pares (Empresa, Filial) **sem CNPJ Soulan** → lista de bloqueio (o que falta na §2).
6. Rodar 2× e comparar (idempotência) antes de considerar concluído.

Δ esperado: EA tem ~114/116, base nova tem 131 → ~**+17 a +19** novos + updates. Confirmar com o arquivo real.

---

## 5. O que está faltando para a Fase 2 (bloqueios)

1. ⛔ **A base nova `BASE_ATUALIZADA_CLIENTES_07-07` não está no repositório/máquina** (procurei em
   `~`, Downloads, Documentos, `docs/`, `data/`). Preciso do arquivo para: enumerar os pares
   (Empresa, Filial), validar colunas e definir "Nome Cliente" = razão social **ou** operação.
2. ⛔ **Mapa tipo/Empresa → entidade Soulan** (qual entidade para cada código; papel da NEAT).
3. ⛔ **CNPJ completo por (entidade, filial)** — o dado que resolve o documento não-FOPAG. Não inventar.
4. ✅ FOPAG (>6) já resolve com `clientes.cnpj` (só ratificar a regra).

**Nada foi implementado.** Com o aval do diretor + os insumos (1)–(3), a Fase 2 implementa: migration
das 3 tabelas + coluna nullable, carga/reconciliação por `cod_cliente`, troca do delete físico por
inativação, e as telas de CRUD/vínculos/entidades.
