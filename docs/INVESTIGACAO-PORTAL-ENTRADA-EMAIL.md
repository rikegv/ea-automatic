# Investigação: o sentido da entrada por e-mail do Portal, e a ideia do diretor

Investigação a pedido do diretor (01/10/2026). Nada construído. §A.38: o `seguranca` opinou sobre
enumeração de base. Cada afirmação com arquivo:linha.

## O achado que muda a pergunta

O caminho "Entrar Com Meu E-mail" **NÃO é um atalho para quem perdeu o link**. É a **porta do
candidato SEM CPF**. O passo final dele (`identidade`) ESCREVE cpf+data_nascimento num registro que
estava com CPF nulo (`portal-acesso-email.service.ts:908-913`). O cabeçalho da classe (`:66-76`)
documenta que a porta existe para essa população: CPF nulo não diverge de nada, então a trava
CPF+nascimento do link é VAZIA justamente nela (prova no domínio: `domain/portal-acesso-email.ts:237-250`,
`divergencias()` só acusa se `cpfRegistrado.length > 0`).

Consequência: o candidato de CPF nulo **não passa pelo link mesmo com o link na mão**, porque o 2º
fator do `identificar` (CPF+nascimento) não casa com uma ficha de CPF nulo
(`portal-identidade.service.ts:838-847`). A porta de e-mail é a **única entrada self-service** dele.

## As 6 perguntas

1. **Sentido do caminho por e-mail, e quem entra só por ele:** a população de CPF nulo (acima). Não é
   redundância do link: é a porta de quem o link não consegue admitir.
2. **O link carrega identificação?** Sim, o token identifica a admissão; CPF+nascimento é o 2º fator.
   Para o candidato COM CPF, o link basta + 2º fator. Para o de CPF nulo, o link trava no 2º fator.
3. **A ideia do diretor (e-mail primeiro, bifurca por ter CPF) funciona?** Na segurança, **não como
   descrita: o `seguranca` VETOU.** A bifurcação (pedir CPF quando o e-mail tem cadastro, mandar
   código quando não) vira um **oráculo de enumeração**: o visitante lê o comportamento da tela e
   descobre se o e-mail tem cadastro COM CPF (pior que existência: revela identidade), e reabre o
   canal de tempo que o desenho atual fechou de propósito (`:359-377`, `:393-419`).
4. **Há desenho melhor?** Ver a tabela abaixo. A recomendação é **(iii)** ou **(i)**.
5. **Quem perdeu o link:** o `recuperacao` exige o token do link (é "tenho o link e travei no 2º
   fator", não "perdi o link"). Para quem perdeu de vez, a saída é **"Fale com o RH"** (já na tela) e
   o RH reemitir pelo Gerenciador. **Mas isso só serve a quem TEM CPF.**
6. **O correio não está configurado:** `exigirConfiguracao` lança **503** sem pepper+trilha+correio
   (`:247-253`); medido no `.env` de produção: `PORTAL_CODIGO_PEPPER` e `PORTAL_CORREIO_*` AUSENTES.
   **A porta de e-mail devolve 503 hoje.** A tela oferece uma porta que não abre.

## A resposta uniforme de hoje já é anti-enumeração

O `solicitar` calcula a resposta na PRIMEIRA linha e devolve o MESMO objeto para e-mail existente,
inexistente, ambíguo, travado ou anonimizado (`:288-291`), com rate-limit por hash (3/h, 10/dia,
`:444`), e o `confirmar` não devolve dado da pessoa (`:553-562`). **O medo "qualquer visitante
descobre se há cadastro" NÃO procede hoje:** a porta não vaza existência, e ainda está 503.

## Os desenhos (veredito do `seguranca`)

| desenho | enumeração | onboarding CPF nulo | custo |
|---|---|---|---|
| (i) dois cartões como está | **protege (total)** | preserva | zero, já em produção |
| (ii) e-mail primeiro BIFURCADO (ideia do diretor) | **QUEBRA, VETADO** | preserva | perde a resposta uniforme |
| **(iii) e-mail primeiro, código SEMPRE uniforme, CPF+nascimento só DEPOIS do código confirmado** | **protege (total)** | preserva | mínimo: é quase o que o backend já faz |
| (iv) só link + "Fale com o RH" | máxima (sem porta de e-mail) | **QUEBRA**: CPF nulo perde a entrada self-service, e o RH reemitir link NÃO resolve (falta o CPF para o 2º fator) | alto humano |

## Recomendação

- **Se o diretor quer "e-mail primeiro":** desenho **(iii)**. Entrega a ordem que ele quer SEM o
  oráculo, e muda pouco: o backend já faz e-mail→código→identidade. O ramo "pedir CPF" só acontece
  **depois** da posse da caixa provada pelo código, então não há sinal pré-código a ler.
- **Se não faz questão da ordem:** manter **(i)**, que já protege.
- **(ii) está vetado** e **(iv) quebra o onboarding do CPF nulo.**
- **Independente do desenho, uma correção honesta HOJE:** o cartão de e-mail oferece uma porta que
  responde 503 (correio não configurado). Enquanto o SendGrid/Gmail não liga, o cartão não deveria
  ser oferecido, ou deveria dizer que a via está indisponível. (Proposta, não construído.)

## A pergunta operacional que decide tudo, e é do diretor

Existe, HOJE, candidato de CPF nulo chegando? Se a admissão sempre entra com CPF (Pandapé/GI), a porta
de e-mail está dormente e o debate muda. Se o CPF nulo é real, **(iv) está fora** e o onboarding dele
depende dessa porta. Essa é a informação que o diretor tem e o código não.
