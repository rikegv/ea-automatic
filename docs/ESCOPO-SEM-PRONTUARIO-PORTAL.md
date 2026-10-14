# ESCOPO: quem está sem prontuário do Portal (medido em produção, 2026-10-14)

**Medido, não deduzido** (`ea_automatic`, container `ea-db`). §A.6: só id técnico de admissão e
contagens, nenhum nome, CPF ou nome de objeto. Este é o alvo do reprocesso de
`src/db/rearquiva-portal.ts` e a base da prova de 100%.

## Correção de premissa (§A.27): o "~3.125" NÃO é o escopo

A ordem falava em "~3.125 candidatos do Portal sem prontuário". **Medido, esse número é o TAMANHO DA
BASE INTEIRA de admissões (3.159 no total), não a população do Portal.** A esmagadora maioria
(2.621 sem `drive_pasta_url`) é histórico/carga que NUNCA passou pelo Portal e NÃO tem documento de
Portal para arquivar: reprocessá-la não faria sentido e não é a meta. O Portal só está no ar desde
08/10, e o escopo REAL do arquivador é só quem entregou documento por ele.

## O escopo real do arquivador

| métrica | valor |
|---|---|
| objetos confirmados e não reprovados no balde (todas as origens) | 147 |
| desses, de Fabricio (já resolvido à mão, FORA do lote) | 8 |
| **objetos no lote do reprocesso** (excl. Fabricio e encerrados) | **133** |
| **admissões no lote** (farol EM_ADMISSAO) | **21** |
| admissões encerradas (DECLINOU) com objeto, EXCLUÍDAS (§A.16) | 1 (6 objetos) |
| janela de chegada | 2026-10-08 a 2026-10-14 |
| das 21 do lote: SEM pasta de prontuário | 17 |
| das 21 do lote: COM pasta, mas documentos do Portal não arquivados ("2ª variante") | 4 |

As 4 COM_PASTA provam por que o reprocesso é POR OBJETO, não "só quem não tem pasta": são admissões
cuja pasta já existe (criada pelo caminho antigo) mas cujos documentos do Portal nunca entraram. A
dedup por md5 do arquivador cuida disso: quem já está lá é ignorado, só o que falta sobe.

## A lista completa do lote (21 admissões, farol EM_ADMISSAO)

`confirmado_em` não-nulo (chegada provada) e `reprovado_em` nulo. `objetos` = quantos documentos do
Portal entram no prontuário daquela admissão.

| admissao_id | objetos | pasta hoje |
|---|---|---|
| 0944eac7-6af7-4044-96c4-bef14fc89cb1 | 9 | SEM_PASTA |
| eb506628-9ec6-4dc8-a1cc-28213ed76667 | 9 | SEM_PASTA |
| 2ef1ac05-6546-4f23-80df-7b82b3c38182 | 9 | SEM_PASTA |
| 7f45b8d1-d41f-48ce-b933-bd07f8690957 | 9 | COM_PASTA |
| c0ed251c-0419-4bc7-be4a-f9d625ef4c01 | 9 | SEM_PASTA |
| 9cd04590-ac8e-4740-b0bc-6afb93823774 | 9 | SEM_PASTA |
| ddd57fd5-ad74-4f1a-af8f-765e48a4869e | 8 | SEM_PASTA |
| a6657bcb-e2a4-464d-95d6-22453a63afbf | 8 | SEM_PASTA |
| 2853bfc6-95e6-4fff-96f1-960b4715563d | 8 | COM_PASTA |
| d96b2bae-d62a-4fa8-a2ae-a927ebf19fa3 | 8 | COM_PASTA |
| 96851004-94b3-49ee-8ca3-013f3b99c9b5 | 7 | SEM_PASTA |
| ea5e49cb-48dd-41ad-bc8a-279da210616e | 6 | SEM_PASTA |
| bf314abf-3a94-4ef2-8c66-402abffa60da | 6 | SEM_PASTA |
| 4e0ea210-88ac-43d7-afd1-1ce3c56f6d4d | 6 | SEM_PASTA |
| 72f57c73-f5d8-4373-8782-75ad7f355016 | 6 | SEM_PASTA |
| 8392895e-f766-4c69-a8f6-c96845101304 | 5 | SEM_PASTA |
| 6fcca21b-a59c-474b-b11f-f566ad3139c8 | 5 | SEM_PASTA |
| 5a7f2054-d45d-41bd-8e3f-1a40e2452e88 | 4 | SEM_PASTA |
| 7ba01358-4416-423c-a7b4-4b24e65b455f | 3 | SEM_PASTA |
| 85e146e9-d2cc-48db-b0e0-ebf7acfdb547 | 1 | COM_PASTA |
| 910ff8b6-897d-4f21-a14a-dc5ebf9acf6c | 1 | SEM_PASTA |

**Total: 21 admissões, 133 objetos.** Esta lista é viva: toda admissão nova do Portal entra no mesmo
critério, e o GATILHO LIVE (quando armado) passa a cobrir as novas sem reprocesso. O lote é só o
acúmulo até a ponte existir.

Excluído do lote por decisão/regra:
- `5eeb96cc-86f7-40f1-adbc-9be8da415a13` (Fabricio) — resolvido à mão pelo diretor.
- `67870ddd-3489-4e88-9be7-ecee341522d7` (DECLINOU, 6 objetos) — encerrado não tem prontuário ativo
  (§A.16).

## A PROVA DE 100% (rodar depois do reprocesso, meta = diferença 0)

"Admissões do Portal no lote" menos "admissões do lote cuja pasta existe no Drive". Depois do
reprocesso, `drive_pasta_url` fica preenchido para todas (o self-heal grava o link), então a conta
de admissões-sem-pasta DENTRO do lote deve ir a zero:

```sql
-- Quantas admissões do lote ainda estão SEM pasta (meta: 0 após o reprocesso)
select count(*) as faltando_pasta
from (
  select pc.admissao_id
  from portal_credenciais pc join admissoes a on a.id = pc.admissao_id
  where pc.confirmado_em is not null and pc.reprovado_em is null
    and pc.admissao_id <> '5eeb96cc-86f7-40f1-adbc-9be8da415a13'
    and a.farol_global not in ('DECLINOU','RESCISAO')
  group by pc.admissao_id
) lote
join admissoes a on a.id = lote.admissao_id
where a.drive_pasta_url is null;
```

> A pasta existir NÃO prova que todos os documentos subiram (as 4 COM_PASTA mostram isso). A prova
> forte de 100% por DOCUMENTO exige comparar, por admissão, os objetos confirmados contra os
> arquivos na subpasta do Drive, o que depende de olhar o Drive (via a instância arquivadora, só
> depois do binding). O resultado do runner já reporta, por admissão, `arquivados`/`ignorados`/
> `falhas`: 100% é **falhas = 0 em todas as 21**, e o número de `arquivados + ignorados` cobrindo os
> 133 objetos. É essa a prova que o diretor vai ver ao rodar `--aplicar`.
