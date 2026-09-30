# Guia de validação: Central De Ajuda, de 37 para 184 peças

> Para o diretor validar na **homologação, 3120**. Leva 15 minutos no caminho curto e 40 no completo.
> O caminho curto está primeiro de propósito: se ele reprovar, o resto não importa.

---

## O que mudou, em uma tabela

| módulo | antes | agora | planejado |
|---|---:|---:|---:|
| Começar Aqui, os padrões do sistema | 14 | 14 | 14 |
| Soul ADM, a esteira admissional | 21 | **87** | 87 |
| SouTalent, atração e seleção | 1 | **29** | 29 |
| Configuração e catálogos | 1 | **54** | 54 |
| **Total** | **37** | **184** | **196** |

Faltam **12**: 7 de painéis e gestão, 5 das telas do candidato. São as duas frentes que o senhor deixou
para depois dos catálogos.

Mais **25 blocos de família**, que são o texto compartilhado por tela (eram 7). E **138 imagens** em 52
telas, das quais **39 foram capturadas hoje**.

---

## Caminho curto, 15 minutos

### 1. A Central abre e mostra tudo
Abra `http://10.18.117.235:3120/ajuda`.
- Devem aparecer **quatro blocos**: Começar Aqui, Soul ADM, SouTalent e Configuração.
- O SouTalent deve dizer **29 artigos**, não 1. Foi essa a pergunta que abriu esta frente.
- A busca do topo: digite **"cancelar vaga"**, depois **"liberar acesso"**, depois **"kit"**. As três
  têm de trazer resultado.

### 2. A ajuda aparece DENTRO da tela, que é a porta que de fato se usa
Abra `/as/vagas`. No cabeçalho, ao lado do título, tem de existir o botão **Ajuda**. Clique.
- O painel abre listando só os artigos daquela tela, não o manual inteiro.
- Abra **Ler A Central De Vagas** e confira as três imagens: elas têm seta vermelha e etiqueta, e a
  etiqueta tem de estar **inteira dentro da imagem**.

Repita em `/as/candidatos` e em `/esteira`. É o teste que mede se o manual serve a quem está travado.

### 3. O primeiro artigo que um operador novo abre
Abra `/ajuda/entrar-no-sistema`. Ele era **o único dos quatorze sem imagem**, e agora tem. A imagem
mostra os dois campos e o botão de entrar, com o formulário **vazio**.

### 4. As três peças que eu mais quero que o senhor leia
Elas são as que ensinam gesto que assume risco, e são as que mais doem se estiverem erradas:
- `/ajuda/aceitar-o-avanco-com-pendencias`
- `/ajuda/liberar-apto-sem-aso-validado`
- `/ajuda/reenviar-por-correcao-com-o-pdf-corrigido`
Em cada uma, confira se está claro **o que fica registrado e em nome de quem**.

---

## Caminho completo, mais 25 minutos

### 5. Um artigo de cada frente nova
- **A&S**: `/ajuda/finalizar-a-posicao-da-vaga` e `/ajuda/revisar-uma-vaga-pendente-de-revisao`.
- **Esteira**: `/ajuda/ler-a-regua-obrigatoria-da-admissao` e `/ajuda/declinar-uma-admissao`.
- **Catálogos**: `/ajuda/o-catalogo-de-beneficios` e `/ajuda/liberar-os-menus-de-um-usuario`.
A pergunta em todos é a mesma: **o senhor conseguiria executar aquilo lendo só o artigo?**

### 6. As duas peças que explicam o sistema a quem chega hoje
`/ajuda/o-mapa-das-frentes-da-admissao` e `/ajuda/o-vocabulario-da-admissao`. Elas não ensinam gesto
nenhum: descrevem como o sistema funciona. Se estiverem erradas, estão erradas no pior lugar.

### 7. O que NÃO tem imagem, e por quê
133 dos 184 artigos ainda não têm imagem, e isso é estado conhecido, não esquecimento. A ordem foi
escrever o texto primeiro e fotografar depois, e as imagens de hoje cobriram A&S e a tela de entrada.
Dois artigos ficaram sem imagem por um motivo que **depende de decisão sua** (item 2 abaixo).

---

## As decisões que sobraram para o senhor

**1. A conta de captura é COMUM, e deveria ser MASTER.**
O motor de print entra na homologação com `manual.captura@homolog.local`. O código do motor afirma,
por escrito, que essa conta é um MASTER. **Ela não é: é COMUM.** Consequência medida: dois artigos
ficaram sem imagem, porque os controles que eles ensinam só são desenhados para Master (trocar a vaga
do candidato, e a aba de vagas liberadas recentemente).
**Eu não promovi a conta**, e é decisão sua justamente por isso: promover a própria conta da fábrica é
a fábrica se autoconceder acesso, que é o que a regra proíbe. Autorizando, os dois artigos ganham
imagem sem nenhuma mudança de dado.

**2. A ficha do candidato continua sem imagem, por veto do auditor.**
Ela concentra documento, telefone, e-mail e nascimento num bloco só, e não há recorte honesto. O
auditor ainda achou um **falso negativo provado**: o telefone é desenhado sem máscara e o filtro de
dado pessoal **não o acusa**. Levantar o veto pede conserto no produto (máscara no campo ou regra
nova no filtro), não afrouxamento.

**3. O defeito do farol, que o senhor mandou só anotar.**
Está no DIARIO, com arquivo e linha. Resumo: há duas portas que carimbam "admissão concluída" e a do
desconsiderar a integração **não tem** a guarda que a outra tem. É a mesma família do defeito de
agosto que contou 56 admissões duas vezes.

**4. Treze achados menores de produto**, em `docs/CENTRAL-DE-AJUDA-SOUTALENT-DECISOES.md`, seção 6.
Nenhum foi tocado. Os que mais doem: duas etiquetas fora do padrão de maiúsculas na tela de Não
Conformidades, um travessão em célula vazia no modal da integração, e a "Previsão do ASO" que é
obrigatória e não tem o asterisco no rótulo.

---

## O que a fábrica mexeu na homologação, e por quê

Tudo sob a regra que o senhor tornou permanente hoje (a homologação é ambiente de teste, a fábrica
semeia e apaga sem perguntar):
- **Apagou** uma linha de candidatos criada em 29/09 que tinha documento válido e e-mail corporativo
  real, mais a cadeia de admissão dela. Ela travava o filtro de dado pessoal do manual.
- **Apagou** duas vagas de teste que estavam com uma usuária real como consultora. Era por causa
  delas que o filtro recusava a imagem da Central De Vagas.
- **Semeou** um arnês sintético de A&S: 15 candidatos, 12 candidaturas (uma em cada etapa do funil
  mais os cinco desfechos), 4 vagas (aberta, cancelada, rascunho e aguardando revisão), uma lista
  enviada ao cliente e um contato registrado. Documento de família reservada, e-mail de homologação,
  e autoria da conta de captura em tudo.
- **Nada disso tocou a produção.**

O rebuild da 3120 foi combinado com a outra sessão e feito **uma vez só**, com as duas frentes juntas,
sem o senhor precisar arbitrar.

---

## Se algo estiver errado

Reprove pelo artigo, não pelo módulo: me diga o endereço (`/ajuda/<nome-do-artigo>`) e o que está
errado. O manual é escrito peça a peça e corrigido peça a peça.
