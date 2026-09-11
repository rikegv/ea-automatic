# MAPA DE ALCANCE, ONDA C: linha de serviço, cidades IBGE, idioma com nível, SLA

Montado pelo coordenador ANTES do despacho (§A.39 passo 1). **O contrato compartilhado JÁ ESTÁ
ESCRITO E BUILDADO** (`AsLinhaDeServico`, `AsCidade`, `AsVagaIdioma`, `IDIOMA_NIVEIS`,
`IDIOMA_NIVEL_LABEL`): backend e frontend constroem **em paralelo** contra ele. Ninguém escreve em
`packages/shared-types/src/index.ts`, que é do coordenador (§A.39).

## 1. O QUE JÁ EXISTE, medido (não suponha, está aqui)

| dado | estado hoje |
|---|---|
| `vagas.natureza`, `vagas.sazonalidade` | enums, já na 1ª página da abertura |
| **`vagas.data_prevista_inicio`** (date) | **EXISTE, MAS SÓ O FECHAMENTO A ESCREVE.** Ver a §8, que corrige um erro deste mapa. **A peça 4 está BLOQUEADA aguardando decisão do diretor** |
| `vagas.idiomas` (text[]) + `vagas.idiomas_outros` | lista fechada `VAGA_IDIOMAS`, **sem nível** |
| `vagas.regiao_estado` (varchar) | **É A UF, E ELA PERMANECE.** Ver a §9: a cidade é campo NOVO AO LADO, filtrado por ela |
| `as_etapas_funil` + `as/etapas/*` + `/admin/as/etapas` | **O MOLDE** do catálogo gerenciável, pedido pelo diretor |
| `projetos_alto_volume` | **OUTRO conceito**: eventos ("BIENAL DOS LIVROS", "BF"). Ver o bloco do contrato |

## 2. O TAMANHO DA MIGRAÇÃO: pequeno, medido nas duas bases

| base | vagas | com estado | com idioma | com previsão |
|---|---|---|---|---|
| produção | **3** | 3 | 3 | 1 |
| homologação | 8 | **0** | **0** | 0 |

**A migração de dado é de 3 linhas, todas em produção.** Não é frente de carga; é uma migration com
`update` nominal. O que precisa de cuidado é a **forma** (a coluna nova e a antiga convivendo até a
tela trocar), não o volume.

## 3. A FONTE DO IBGE, conferida ao vivo

`https://servicodados.ibge.gov.br/api/v1/localidades/municipios` responde **200** desta VM e devolve
**5.571 municípios**. Cada item traz `id` (código IBGE de 7 dígitos), `nome`, e a UF em
`microrregiao.mesorregiao.UF.{sigla,nome}`.

**A carga é um script de seed que roda UMA vez e grava no banco**, no molde dos `db/carga-*.ts` que já
existem. **Não** é chamada em tempo de request (a tela não pode depender do IBGE estar no ar), e
**não** é arquivo de código (decisão do diretor). O script tem de ser **idempotente** (`on conflict do
nothing` pelo código do IBGE) e **re-executável**.

## 4. O SLA: **BLOQUEADO, VER A §8**, que corrige o que esta seção afirmava

**Nada de banco.** É `data_prevista_inicio - hoje`, derivado, substituindo a coluna "Dias Em Aberto"
da tabela de vagas. Selo de atenção quando faltar **2 dias ou menos**. **Por vaga, sem depender de
projeto.**

Cuidados que já custaram caro nesta casa e valem aqui:
- **previsão ausente** é o caso comum (2 de 3 em produção): a célula diz "não informado" (§A.11),
  nunca um traço e nunca "0 dias";
- **prazo vencido** (previsão no passado) é estado próprio, e não "0 dias";
- a coluna que sai (`Dias Em Aberto`) tem lógica de **congelamento na vaga encerrada**: leia o que
  está lá antes de remover, e decida o equivalente para o SLA.

## 5. RBAC, e é aqui que o `seguranca` entra (§A.38)

O catálogo de linhas de serviço é **administração**: o CRUD é de **SUPER_ADMIN**, no molde exato do
`EtapasFunilAdminController`, e a **leitura** (que enche o seletor da abertura) é de quem abre vaga.
Errar essa divisão é dar ao consultor o poder de renomear a linha de serviço da operação inteira.

**Menu novo nasce SÓ para o SUPER_ADMIN** (§A.23): a fábrica **registra** o menu no catálogo e **para
por aí**. Não distribuir, não conceder a ninguém.

## 6. O QUE NÃO FAZER

- Não escrever em `packages/shared-types/src/index.ts` (é do coordenador).
- Não mexer em `projetos_alto_volume` nem em nada de Alto Volume: é outro eixo.
- Não tocar na Onda B, que está na 3120 aguardando validação do diretor.
- §A.31: nada além do que está aqui. Achou que falta, **propõe no relatório**.

## 7. REGRAS DA CASA QUE ESTA FRENTE TOCA

§A.11 (travessão proibido) · §A.24 (title case em título e etiqueta; botão é ação) · §A.28 (todo
filtro é múltiplo) · §A.29 (tabela nasce ordenável) · §A.35 (**nenhum `<select>` cru**; o seletor de
cidade tem 5.570 opções, então **busca obrigatória**) · §A.37 (coluna nova nasce com filtro e
ordenação juntos) · §A.12/§A.20 (nada esmagado; a coluna de SLA entra no lugar da que sai).


---

## 8. CORREÇÃO DO MAPA: A PEÇA 4 ESTÁ BLOQUEADA, e o erro foi do coordenador

A §1 deste mapa afirmava que `vagas.data_prevista_inicio` "já existe e nada há a criar". **O campo existe. O
que o coordenador não conferiu foi QUEM O ESCREVE**, e a resposta muda a peça inteira:

**ele só é escrito no FECHAMENTO da vaga.** Está em `FecharVagaDto`, e **não** no `CreateVagaDto`. Na
tela, o campo só aparece no modal de fechar.

Medido em produção:

| vaga | status | previsão |
|---|---|---|
| 987654321 | Entregue | 07/09/2026 |
| 11111111111 | **Aberta** | **nulo** |
| 999999 | **Aberta** | **nulo** |

Em homologação, **0 de 8**.

**Consequência:** a coluna de SLA mostraria "não informado" em **100% das vagas VIVAS, para sempre**, e um
número só nas mortas. E ela **substitui "Dias Em Aberto", que funciona na vaga viva**.

**A régua que o `frontend` escreveu está CERTA** (os três casos, o congelamento, o fuso). É a **premissa**
que está errada, e ela é do coordenador. O defeito passaria em todo teste, porque a função é boa e o dado é
que não existe. É o caso de manual da §A.40: achável por leitura, antes de uma linha de tela ser desenhada.

**AS DUAS SAÍDAS SÃO DECISÃO DO DIRETOR**, porque mudam o que a peça MEDE:
1. derivar o SLA de **`vagas.data_limite`**, que é prazo e É preenchido na abertura (hoje nulo nas duas
   abertas, mas com caminho de preenchimento);
2. **acrescentar a previsão de entrega ao formulário de ABERTURA**, e aí o SLA mede o que foi pedido.

**Até a escolha chegar, a peça 4 não avança.** O que já está escrito (`lib/as-vaga-sla.ts` e os testes) fica
estacionado e é reaproveitável nas duas saídas: o que muda é de qual campo ela lê.

## 9. CORREÇÃO DO MAPA: `regiao_estado` PERMANECE, e a cidade é campo NOVO AO LADO

A §1 dizia "a lista velha de região a ser substituída", e isso é ambíguo do jeito perigoso. **A coluna é a
UF**, e ela governa outra régua: `vagas.regioes` e `vagas.regioes_outras` são validadas contra ela
(`validaRegioes` recusa região que não pertence à UF, e recusa região sem UF). As 3 vagas de produção têm
`regioes` preenchida.

**Lido como "remover", isso deixaria `vagas.regioes` órfã e quebraria a validação.** Então, com todas as
letras: **a UF PERMANECE**, a cidade é **campo novo ao lado**, e o seletor de cidade é **filtrado pela UF já
escolhida**. Nada de `regiao_estado` é removido nesta onda.

## 10. AS CONDIÇÕES DA AUDITORIA, que valem como requisito

**Seed do IBGE (VETADO sem elas).** Medição que mudou o desenho: **NENHUMA carga desta casa tem trava de
base**, e o `DATABASE_URL` padrão do `.env` aponta para **produção**. Um `db:seed:cidades` sem argumento
gravaria 5.570 linhas na base real. Exigido: trava por `current_database()` com allowlist, **contagem
mínima afirmada antes de escrever** (resposta truncada ABORTA, e `on conflict do nothing` não pode mascarar
isso), **URL constante no código** e nunca em variável de ambiente, validação linha a linha (código de 7
dígitos, UF entre as 27, nome não vazio), `AbortSignal` com timeout, e **transação única**.

**Migração dos idiomas (VETADO sem elas).** Converter a coluna in place quebra a tela **no instante em que a
Onda B subir**, porque as migrations rodam todas no mesmo comando e o código no ar ainda lê `string[]`. E
ela teria de **INVENTAR um nível** para as 3 vagas que já têm idioma, o que nenhuma migration pode decidir.
Exigido: **coluna nova ao lado**, nível **ausente** na linha legada (a tela escreve "nível não informado",
§A.11), a antiga preservada só de leitura até a tela trocar, e **afirmação de contagem** antes do `update`.

**Campo obrigatório (VETADO sem elas).** A régua indexa por **texto**, com `as Record<string, unknown>`, então
o compilador não protege. Errar o nome faz **ninguém publicar vaga nenhuma**, com typecheck verde. Exigido:
os **quatro** pontos em sincronia (a lista dos obrigatórios, o tipo dos campos, o que o service devolve e o
objeto que a tela monta), o campo no `CreateVagaDto` (senão o `ValidationPipe` recusa a abertura com 400), e
conferência contra a lista **ATIVA**, não só contra a FK (FK não pega linha inativada).

**Idioma virando par (VETADO sem elas).** Existe uma linha que, com o tipo novo, **apaga em silêncio** o
texto de "outros idiomas" na primeira gravação (`.includes(OPCAO_OUTROS)` vira sempre falso e o ramo zera o
campo). Exigido: teste provando que o texto do escape **sobrevive a uma segunda gravação**, e
`@ValidateNested({ each: true })` + `@Type()` no DTO, senão a coluna aceita JSON arbitrário de qualquer
autenticado.

**RBAC do catálogo (APROVADO com condições).** O menu novo entra em **CINCO** lugares, não um, e um teste da
casa compara a lista inteira e quebra se faltar. E a cobertura independente não pode **falsificar**
`areasDaOperacao`, que é justamente a dimensão que mordeu na Onda B.

**Cidades e §A.6 (APROVADO).** O `uf` é **obrigatório e validado** contra as 27 UFs na rota de leitura. E o
seletor de cidade é **da VAGA**: ligá-lo à cidade do CANDIDATO normalizaria dado pessoal que sobrevive ao
expurgo, e está fora do escopo (§A.14).
