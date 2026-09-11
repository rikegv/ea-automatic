# MAPA DE ALCANCE: gestão completa dentro do painel da vaga (busca + filtros nas duas abas)

Montado pelo coordenador ANTES do despacho (§A.39 passo 1, §A.40 regra 1).

## 1. O PEDIDO

Nas abas **Ver Candidatos** e **Ver Candidatos Alocados**, dentro do painel da vaga:
- **busca por NOME** (§A.6: CPF nunca na URL);
- **filtro por SITUAÇÃO**, multiselect (§A.28);
- **filtro por ETAPA**, multiselect;
- tudo convivendo com a **seleção múltipla e as ações em massa** que já existem.

Vale nas **DUAS** abas. Reusar o que existe, não inventar (§A.26).

## 2. O QUE JÁ EXISTE E TEM DE SER REUSADO

| peça | onde | observação |
|---|---|---|
| `MultiSelect` do design system | `components/ui/MultiSelect.tsx` | **já tem busca interna**, chips e marca/desmarca. Usado em 8 telas, **incluindo a própria Central de Vagas**. É ele, §A.28/§A.35 |
| catálogo de ETAPAS | `useEtapas()`, **já importado no painel** (`VagaPainelModal.tsx:81,989`) | §A.37 cumprido por construção: o catálogo vem de ENDPOINT, não das linhas carregadas |
| vocabulário de SITUAÇÃO | `CANDIDATURA_SITUACOES` (`@ea/shared-types`) | lista fechada do domínio. **Nenhuma lista nova de situação se escreve** |
| rótulos | `CANDIDATURA_SITUACAO_LABEL`, `rotuloDaEtapa`/`tomDaEtapa` | já existem, já são usados nas pills da mesma tabela |
| ações em massa | `AcoesEmMassaDaVaga.tsx` | já trata falha por linha (`AsResultadoEmMassa` + `ResultadoLoteModal`) |

## 3. VOLUME MEDIDO, e ele decide a arquitetura

Maior vaga da homologação: **51 candidaturas**. As demais têm 3, 2, 1, 0.

**Consequência: o filtro e a busca são CLIENTE, sobre a lista que o painel JÁ carrega inteira**
(`precisaDaLista` em `VagaPainelModal`, que busca `as/candidatos/vaga/:vagaId`). Isso resolve três
coisas de uma vez:
- **§A.6 satisfeita por construção**: nenhum parâmetro novo na URL, nenhum endpoint novo, nenhum CPF
  em lugar nenhum. O pedido do diretor ("CPF nunca na URL") vira impossível, não uma disciplina;
- zero alcance no backend, então **nenhuma rota validada é tocada**;
- resposta instantânea, sem ida ao servidor a cada tecla.

Se um dia uma vaga passar de alguns milhares, isto se revisita. Não é hoje.

## 4. O RISCO CENTRAL DESTA FRENTE, e ele já mordeu esta casa

**SELEÇÃO + FILTRO = AÇÃO SOBRE LINHA INVISÍVEL.**

Hoje a seleção é resolvida sobre a **lista inteira**, não sobre o recorte à vista
(`VagaPainelModal`, o comentário diz "sai da `lista` inteira, e não do recorte da aba"), e o lote
manda **todos** os ids sem filtrar (`AcoesEmMassaDaVaga.tsx:124`, `selecionadas.map((c) => c.id)`).

Com filtros, isto vira: a pessoa marca 8, filtra para 2, clica em massa, e **os 8 são afetados**.
Seis deles ela não está vendo.

**E não é hipótese: a auditoria de segurança JÁ achou a versão anterior deste mesmo defeito** nesta
mesma barra. O modal calcula `parados` e `alvos` e promete "N pessoas vão para a esteira"
(`AcoesEmMassaDaVaga.tsx:571-580`), e o backend aplica em `selecionadas.length`. **A tela conta certo
e a régua conta errado.** Acrescentar filtro sem resolver isso multiplica o buraco.

**DECISÃO DO COORDENADOR (§A.39 passo 2), e ela não é negociável no briefing:**
**a seleção NUNCA sobrevive invisível.** Linha que sai do recorte à vista (por busca ou por filtro)
sai da seleção. É a única régua em que o número da barra e o efeito no banco não têm como divergir, e
essa divergência é exatamente a dívida que esta casa já está pagando. O diretor pediu "buscar,
filtrar, **selecionar os que aparecem**, agir em massa", que é a mesma coisa dita do lado dele.

**O "selecionar todos", se existir, seleciona o RECORTE À VISTA**, nunca a lista inteira.

## 5. ALCANCE NO RESTO DA TELA

- **A troca de aba já limpa a seleção** (comportamento existente, mantido). Os filtros devem seguir a
  mesma régua: **cada aba tem o seu recorte**, e nada vaza de uma para a outra.
- **A aba de alocados já é um recorte** (só quem entregou posição). O filtro de situação ali opera
  DENTRO desse recorte, e não por cima dele: ele não pode trazer de volta quem a aba exclui.
- **O contador da aba** ("Ver Candidatos 51") é da lista inteira. Com filtro ativo, a tela precisa
  dizer quantos está mostrando sem fingir que o total mudou.
- **§A.29 (ordenação)**: a tabela do painel já ordena. Filtro e ordenação têm de conviver.

## 6. O QUE NÃO É PARA FAZER

- Não criar endpoint novo, não mexer em `vagas.service` nem em `candidatos.service`.
- Não escrever lista nova de situação nem de etapa.
- Não mexer no `ui/Modal` (58 telas) nem no `ui/MultiSelect` (8 telas) sem perguntar (§A.26).
- Não acrescentar coluna, KPI ou ação que ninguém pediu (§A.31).
