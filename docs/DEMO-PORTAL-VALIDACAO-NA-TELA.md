# DEMO Portal do Candidato -> GI: como VOCE (Rike) valida na tela

> Homologacao / DEMO. Nada aqui toca a producao. E o passo a passo para voce VER, na tela, o
> candidato subir o RG, a IA **APROVAR na hora**, e a **tela de conferencia** dos campos aparecer
> (o candidato confere e corrige o que a IA leu). E a validacao visual da frente (§A.0: a aprovacao
> e sua).

## O que foi montado para a demo APROVAR (23/09/2026)

Para a IA aprovar em vez de reprovar, a fabrica casou o **cadastro** com o **documento**:

- Uma **admissao sintetica** (dados SIMULADOS, §A.6, sem PII real): candidata
  **MARIA SIMULADA DA SILVA TESTE**, CPF **111.444.777-35**, nascimento **10/05/1990**.
- Um **RG fabricado** com EXATAMENTE esses dados, foto e assinatura identificaveis, dentro da
  validade. A IA compara documento x cadastro, tudo BATE, e **aprova**.

A fabrica ja mediu o veredito direto na IA (instancia isolada 8001, Gemini 2.5 Flash):
**STATUS VALIDADO**, motivo *"Documento de identidade (RG) valido, legivel, completo e dados do
titular conferem com o cadastro."* A **producao ficou intacta**; a **peca 3 (envio pro G.I)** esta
construida e **DESLIGADA**.

## O que voce precisa

- **Endereco:** o ambiente unico de homologacao, `http://10.18.117.235:3120` (§A.32).
- **O link da candidata sintetica** (pessoal, emitido agora, vale ate 26/09):
  `http://10.18.117.235:3120/portal#t=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NGE4MGYzNy03NWU4LTQ0NWEtOWQ5Yi1iMjBjMWFjZDFmMGMiLCJqdGkiOiJhNTk3Zjk4ZC04ZjBkLTQyYjktODRlNS1iYTkyMzhlMjZhMjQiLCJ0eXAiOiJwb3J0YWwtbGluayIsImlhdCI6MTc5MDE4NDg1MSwiZXhwIjoxNzkwNDQ0MDUxfQ.dcMeWUFBjm-_sZCMORKx-qpAV2uMaxkYr9dyu9584OStmiG-UVCsSTRnpqvA6xBsA_IONgZMzw9O8hR2aF_TDA`
- **Os dois dados para identificar:**
  - **CPF:** `111.444.777-35`
  - **Data de nascimento:** `10/05/1990`
- **O documento para subir:** o **RG fabricado** (`demo-portal-rg-simulado.png`) que a fabrica te
  mandou. E o mesmo que casa com o cadastro sintetico. Salve no celular ou no PC.

> DICA: o Portal e mobile-first. Fica mais fiel abrir o link **no celular**. No PC tambem funciona.

## O passo a passo na tela

1. **Abra o link.** Cai na identificacao ("Vamos Comecar", a assistente Sol).
2. Digite o **CPF** `111.444.777-35` e a **data de nascimento** `10/05/1990`, e clique **Entrar**.
   - Se aparecer *"Muitas tentativas. Aguarde alguns minutos"*, NAO e erro: e a trava anti-abuso do
     CPF (5 tentativas em 15 min, protecao de LGPD). Espere ~15 min e repita.
3. **Aceite o termo** de privacidade (marque a caixa) e clique **Comecar**.
4. Tela **"O Que Reunir"**: clique **Continuar**.
5. Tela **"Como Funciona"**: clique **Comecar a enviar**.
6. Voce chega na **trilha**. O primeiro documento e o **RG**. Escolha o arquivo (ou tire foto) e
   **suba o `demo-portal-rg-simulado.png`**.
7. Em segundos a IA le e **APROVA**, e abre a **tela de conferencia**:
   *"Confira O Que Lemos Do Seu RG"* com os campos que a IA leu ja preenchidos (numero do RG,
   orgao emissor, UF, data de emissao, nome, nascimento, filiacao). **Confira ou corrija** um campo
   e clique **Confirmar e continuar**. E essa a peca 1: o candidato conferindo o que a IA leu.

## Onde cada peca esta

- **Infra + IA (identificar, subir, a IA ler e APROVAR na hora):** LIGADA e provada na demo.
- **Peca 1 (tela de conferir os campos que a IA leu):** LIGADA. E o passo 7 acima.
- **Peca 2 (guardar o que o candidato conferiu):** construida (o "Confirmar e continuar" grava).
- **Peca 3 (mandar para o G.I):** construida e **DESLIGADA** de proposito.

## Se algo nao abrir

- **"Link Invalido":** o link foi revogado (um link novo revoga o anterior da mesma admissao). Me
  peca um link novo, emito na hora.
- **"Muitas tentativas":** a trava de 15 min do CPF (passo 2). Espere e repita.
- **"Portal indisponivel" / 503:** lacuna de config do homolog, nao regressao. Me avise.

## Observacao para voce decidir (§A.31: proponho, nao mexo)

Na tela de conferencia, abaixo dos campos lidos, aparecem alguns itens vazios com *"Nao consegui
ler este campo. Digite voce mesmo"* (ex.: "Legibilidade", "Foto", "Assinatura", "Tipo de
documento"). Esses sao **pontos de conferencia da auditoria**, nao campos que o candidato deveria
digitar, e poluem um pouco a tela. Nao mexi (fora do escopo desta OST). Se quiser, abro uma OST
para esconder do candidato os pontos que nao sao campos preenchiveis.
