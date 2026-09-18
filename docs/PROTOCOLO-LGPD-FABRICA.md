# PROTOCOLO LGPD DA FABRICA

Regra permanente. Definida UMA vez, aplicada automaticamente em toda integracao e toda frente que
toque dado pessoal. A fabrica APLICA este protocolo, nao reabre a discussao a cada construcao.

Vale para Digai, GI, Portal, Pandape, Clicksign e tudo daqui para frente. Complementa a secao A.6
do CLAUDE.md, que continua valendo: esta e a forma executavel dela.

O protocolo existe porque o cuidado com LGPD estava travando cada frente no mesmo ponto, e a
discussao voltava do zero toda vez. Aqui ela esta resolvida: quem constroi consulta a regra, aplica
e segue. Quem audita (agente seguranca) confere contra ESTA lista, nao contra suposicao.

---

## 1. DADO SENSIVEL NUNCA SAI DO SISTEMA

**Dado sensivel:** CPF, nome, e-mail, telefone, data de nascimento, endereco, raca, sexo, estado
civil, grau de instrucao, deficiencia, antecedentes criminais, saude (ASO, exame), e qualquer
identificador de terceiro que reidentifique a pessoa (codigo de funcionario, matricula, userId do
ATS quando acompanhado de outro campo da pessoa).

**Onde ele NAO pode aparecer, em nenhuma hipotese:**

| Superficie | Regra |
|---|---|
| Log de aplicacao | Proibido. Nem em erro, nem em debug, nem em stack trace. |
| Transcript da sessao / pulso ao diretor | Proibido. O que se reporta e contagem e estrutura. |
| Commit, mensagem de commit, arquivo versionado | Proibido. |
| URL, query string, path de rota | Proibido, inclusive em chamada a terceiro. |
| Mensagem de erro devolvida ao usuario | Proibido. |
| Retorno de LISTA de API | Proibido para identificador direto. Sai so na ficha individual. |

**O que PODE ser reportado:** contagem (quantos), estrutura (quais campos existem, preenchido ou
vazio), nome de campo, formato (11 digitos, ISO-8601), distribuicao de valor de CATALOGO (nunca de
valor que seja julgamento sobre a pessoa).

**Quando precisar ver exemplo, MASCARA.** CPF vira `***.***.***-**` ou os 3 ultimos digitos apenas;
e-mail vira `a***@dominio`; nome vira iniciais. A mascara e obrigatoria antes de o valor chegar a
qualquer superficie da tabela acima, nao depois.

### 1.1 As tres armadilhas de mascaramento ja medidas, e a trava de cada uma

Vieram de veto real do agente `seguranca` (16/09/2026) e viraram regra porque cada uma passou por
um teste verde antes de ser pega.

1. **Porcentagem desfaz o piso de supressao.** Suprimir contagem pequena com `<5` e imprimir
   `(33%)` com o denominador ao lado reidentifica: 33% de 3 e 1. **A supressao vale para o par
   contagem E porcentagem, sempre juntos.**
2. **Teste que so procura o placeholder nao prova mascaramento.** Um teste que busca `<5` na saida
   passa com o valor real impresso ao lado. **O teste de mascaramento procura o VALOR REAL na saida
   e exige que ele NAO esteja la.**
3. **Lista de pistas por substring pega o campo errado.** `"titulo"` como pista de descricao faz
   `tituloEleitor` ser impresso como se fosse rotulo. **Pista de campo seguro e lista EXATA de nomes,
   nunca substring.**

### 1.2 Catalogo, nao registro de pessoa

Para descobrir os valores possiveis de um campo (grau de instrucao, raca, estado civil), le-se o
**CATALOGO** da API. Nunca o registro de uma pessoa real. Foi assim que raca, sexo e deficiencia de
uma pessoa identificavel foram impressos uma vez, e a licao e essa.

---

## 2. GRADE DE ACESSO (allowlist), OBRIGATORIA EM TODA INTEGRACAO

Nenhuma integracao chama API de terceiro diretamente. Ela chama atraves de uma **grade**: uma
camada unica que so deixa passar o que a funcao exige.

**O que a grade faz, e e fail-closed em todos os pontos:**

- **Allowlist de METODO.** Integracao de leitura e GET-only, declarado em codigo. Escrita exige
  entrada propria e explicita na grade, uma por acao (secao 6).
- **Allowlist de ROTA.** Lista fechada de padroes de caminho. O que nao esta na lista e recusado
  ANTES de a chamada sair, nao depois de o servidor responder.
- **Id de rota com alfabeto FECHADO: `[A-Za-z0-9._-]{1,64}`.** Nunca `[^/]+`. O curinga generico
  aceita `%2f`, `%2e` e `%00`, e um servidor que decodifica antes de rotear resolve FORA da
  allowlist. Medido e vetado.
- **PII NUNCA COMO SEGMENTO DE PATH NEM EM QUERY STRING.** Endpoint de busca por CPF, e-mail,
  telefone ou documento e BARRADO, mesmo existindo e mesmo sendo conveniente. Motivo medido: o erro
  do terceiro ECOA o path, entao o dado vaza pelo 401. Busca por dado pessoal vai no CORPO da
  requisicao.
- **Anti-SSRF.** Host de destino e constante de configuracao, nunca vem de dado lido. Esquema
  obrigatoriamente `https`. Sem redirecionamento seguido automaticamente para host fora da lista.
- **TLS NUNCA DESLIGADO.** Desativar verificacao de certificado esta VETADO em definitivo. Cert
  quebrado significa host errado, e foi o que aconteceu: a proibicao virou TESTE no codigo, nao
  lembranca (mesma logica da secao A.33).
- **A grade SE AUTOTESTA, e o autoteste e adversarial.** Nao basta a grade existir: ela roda uma
  bateria que tenta furar cada regra e exige que ela ACUSE. Inspecao de codigo que recebe o caminho
  do arquivo e le sozinha pode ser enganada por injecao depois do ponto onde ela para de olhar;
  **a inspecao recebe o TEXTO por parametro e o autoteste injeta o ataque exigindo que ela acuse.**

---

## 3. MINIMIZACAO

So se coleta, so se trafega e so se grava o dado que a funcao **usa de verdade**.

- Campo que nao responde nenhuma pergunta da OST **sai da coleta, inclusive da contagem**. Foi o
  caso de deficiencia e antecedentes criminais na leitura do Digai.
- Campo que e **julgamento sobre a pessoa** (score de compatibilidade, nivel aferido, probabilidade)
  nao entra em distribuicao nem em relatorio.
- Leitura em producao de terceiro comeca pelo **menor recorte que responde a pergunta**. Varredura
  completa se justifica quando a pergunta e sobre a base inteira, e mesmo assim entrega CONTAGEM.
- Na nossa base: campo que a tela nao mostra e a regra nao usa **nao e criado**.

---

## 4. RASTRO

Toda leitura e toda escrita de dado pessoal por integracao deixa registro de **quem, o que e
quando**, e **nunca do valor**.

O rastro grava: identificador do usuario ou do job, a acao, o recurso alcancado (id tecnico da
vaga, do candidato, da chamada), o carimbo de tempo e o resultado. Nao grava CPF, nome, e-mail,
telefone, nem a URL completa quando ela carregar identificador de pessoa.

O rastro e **permanente e consultavel**. Ele responde a pergunta de auditoria "quem viu o que", que
e a pergunta que a LGPD faz. Um rastro que guarda o valor do dado deixa de ser rastro e vira uma
segunda copia do dado pessoal.

---

## 5. EXPURGO

- **Credencial de terceiro** usada em investigacao ou carga pontual e destruida ao fim
  (`shred -u`), junto com a pasta de trabalho. Credencial de operacao vive em variavel de ambiente,
  nunca em arquivo versionado, nunca em codigo.
- **Dado temporario** (staging de documento, arquivo baixado, resposta crua de API guardada em
  disco) tem TTL declarado e expurgo no fechamento. O padrao da casa e 48h.
- **Saida longa de script** vai para arquivo FORA do repositorio, sem buffer, e e removida ao fim.
- **Dado pessoal de quem saiu do processo** tem retencao declarada e varredor que a aplica. O que se
  descarta e o que IDENTIFICA (CPF, e-mail, telefone, nascimento, id do ATS); a linha permanece,
  para as contagens historicas nao passarem a mentir.

---

## 6. ESCRITA EM PRODUCAO DE TERCEIRO

O cenario mais sensivel do protocolo. Ler errado mostra dado que nao devia; **escrever errado muda
a vida de alguem num sistema que nao e nosso, e nao tem desfazer.**

**Regra zero, e ela vem antes de todas: se da para NAO escrever, nao escreve.** Antes de abrir
qualquer caminho de escrita, a fabrica prova que a funcao nao se resolve por leitura mais acao do
nosso lado. Quando se resolve, esse e o caminho, e a escrita nao e construida.

Quando a escrita for mesmo necessaria:

1. **SO O ENDPOINT DA ACAO.** Uma entrada na grade, uma acao, um metodo, um caminho exato. Nada de
   allowlist de escrita por prefixo, nada de "o mesmo cliente serve para o resto".
2. **CONFIRMACAO ANTES.** A acao e disparada por gesto explicito e informado do usuario, que ve o
   que vai acontecer e para quem, antes de acontecer.
3. **RASTRO OBRIGATORIO** (secao 4), com autor, alvo tecnico, carimbo e resultado.
4. **NUNCA EM LOTE SEM O DIRETOR VER.** Acao em massa que escreve em producao de terceiro mostra a
   lista do que vai fazer e **exige aceite explicito sobre aquela lista**. Lote disparado sem essa
   tela esta proibido.
5. **IDEMPOTENCIA.** Repetir a mesma acao nao duplica efeito. Onde o terceiro nao garante, a guarda
   e nossa, gravada ANTES de notificar (a ordem de gravar antes de avisar vem da INT-4, secao A.5:
   notificar antes de gravar faz uma falha virar duplicata na retentativa).
6. **LIMITE DE VAZAO.** Escrita respeita o teto de requisicao do terceiro com folga, por fila com
   limitador, porque estourar o teto derruba as OUTRAS integracoes que dividem o mesmo balde.

---

## 7. QUEM AUDITA, E CONTRA O QUE

O agente `seguranca` audita contra ESTA lista, com poder de veto (secao A.6 e A.38). A auditoria e
**adversarial**: ele tenta PROVAR a violacao, e na duvida veta e pede evidencia.

**O autor nao declara o protocolo cumprido.** E o ponto inteiro: quem escreveu a regra confere
contra a mesma suposicao que usou para escreve-la.

**O MAPA E AUDITADO ANTES DO PRIMEIRO DESPACHO** (secao A.40): a pergunta "quem mais escreve este
dado?" e um `grep`, nao talento de auditor, e o furo achado no mapa custa zero rodada, enquanto o
mesmo furo achado no codigo custa duas.

**A saida e APROVADO ou VETADO, com arquivo e linha.** Vetado, nao sobe.

---

## 8. CHECKLIST DE APLICACAO

A fabrica percorre esta lista em toda frente que toque dado pessoal ou API de terceiro:

- [ ] Nenhum dado sensivel em log, pulso, commit, URL ou retorno de lista.
- [ ] Mascara aplicada antes da superficie, e o teste dela procura o VALOR, nao o placeholder.
- [ ] Supressao cobre contagem E porcentagem juntas.
- [ ] Grade de acesso existe, e fail-closed, com allowlist de metodo e de rota.
- [ ] Id de rota com alfabeto fechado, nunca curinga.
- [ ] Nenhum endpoint com PII no path ou na query.
- [ ] Host constante, https, sem redirecionamento para fora da lista.
- [ ] Verificacao de TLS ligada, e ha teste que impede desliga-la.
- [ ] Grade tem autoteste adversarial, com a inspecao recebendo o texto por parametro.
- [ ] So os campos que a funcao usa sao coletados, trafegados e gravados.
- [ ] Rastro de quem, o que e quando, sem o valor do dado.
- [ ] Credencial e dado temporario com expurgo declarado.
- [ ] Escrita em terceiro: provou que nao da para evitar, endpoint unico, confirmacao, rastro,
      idempotencia, limite de vazao, e lote so com o diretor vendo a lista.
- [ ] RBAC: a acao exige o papel certo, com guard na rota.
- [ ] O `seguranca` auditou o MAPA antes do primeiro despacho, e o CODIGO antes do deploy.

---

*Protocolo criado na frente da integracao Digai, por decisao do diretor, para que o cuidado com
LGPD deixe de ser discussao por frente e passe a ser regra aplicada. Vale sem prazo.*
