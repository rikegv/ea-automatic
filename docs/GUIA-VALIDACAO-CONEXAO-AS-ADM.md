# Guia De Validação: A Conexão A&S Para O ADM (Fluxo Completo)

> Para o Rike validar na tela, sem termo técnico. Tudo na **3120** (`http://10.18.117.235:3120`),
> que é a homologação. A produção (a 3010) NÃO foi tocada e nada foi commitado. Login de
> administração em `~/SENHA-HOMOLOG-SUPERADMIN.txt` (conta `admin@homolog.local`).

Preparei **3 vagas fictícias** (sintéticas, sem dado real) para você passar pelo fluxo inteiro:
`SIMULADO Seed Alfa`, `SIMULADO Seed Bravo`, `SIMULADO Seed Charlie`. A **Alfa eu já enviei** para
você ver o resultado na Liberação de imediato; a **Bravo e a Charlie ficaram prontas** para você
mesmo clicar "enviar para admissão" e ver o fluxo do começo.

---

## Fase 1: Os candidatos aprovados no funil (A&S)

1. **Onde:** menu lateral, grupo Atração E Seleção, **Central De Candidatos** (ou **Central De
   Vagas**).
2. Procure os três `SIMULADO Seed`. Eles estão **Aprovados**, prontos para enviar para admissão.
3. **O que você deve ver:** os três candidatos com situação Aprovado, cada um na sua vaga fictícia.

## Fase 2: Enviar para admissão (o gatilho da ponte)

1. Em um candidato aprovado (use a **Bravo** ou a **Charlie**), acione **"Enviar para admissão"**.
2. **O que deve acontecer:** o candidato sai do funil e **nasce uma pré-admissão no ADM**,
   pré-preenchida com o que o A&S já tinha (cliente, cargo). Ele NÃO nasce direto nas frentes: entra
   na **Liberação Admissional** para o time revisar e completar.
3. **Teste do CPF (a trava de segurança):** só quem tem CPF válido é enviado. Um candidato sem CPF
   recebe um aviso e NÃO é enviado (a posição dele no funil não é consumida). As três vagas de teste
   já vêm com CPF válido, então passam.

## Fase 3: A Liberação Admissional com as cores (a função nova)

1. **Onde:** menu **Liberação Admissional** (tem o badge com o número de quem espera revisão).
2. Procure `SIMULADO Seed Alfa` (a que eu já enviei) na busca por nome, e **abra** para revisar.
3. **O que você deve ver no modal:**
   - No topo, a marca **"Veio Do Funil A&S"** e o bloco **"Informações Que Faltam"** com as
     pendências em vermelho, e o aviso de que isso **não bloqueia** a liberação.
   - **AZUL** nos campos que já vieram do A&S (Cliente, Cargo): o time vê o que já chegou.
   - **VERMELHO** nos campos pendentes (Salário, Data de admissão, Escala, Centro de custo,
     Gestor / BP, Uniforme, Tipo de contrato, Pacote de benefícios).
   - **Ao preencher** um campo vermelho, ele **sai da lista do topo na hora** e deixa de ser
     vermelho. A lista encolhe conforme você completa.
4. **A recusa continua sua (do Master):** o botão de recusar está no mesmo lugar, com a trilha de
   quem recusou.

## Fase 4: Os 11 campos que o A&S não traz

Data de admissão, setor, gestor, uniforme, EPI, loja, sexo e os demais campos que o funil não
preenche aparecem **vermelhos** (quando obrigatórios) na Liberação. Eles **não travam** o envio do
A&S para o ADM: o candidato passa, e o time completa aqui. O preenchimento segue **obrigatório para
concluir a admissão**, como sempre foi.

## Fase 5: Liberar (as frentes nascem)

1. Complete o mínimo (cliente, cargo, salário, data de admissão) e **libere**.
2. **O que deve acontecer:** a admissão sai da Liberação e **nasce nas frentes** (Auditoria, Exame,
   Cadastro) da Esteira Admissional, pelo caminho que já existia.

---

## O Que Está Protegido Por Baixo (não é para clicar, é para saber)

- **Não nasce admissão em dobro:** a mesma pessoa vinda do A&S e do Pandapé é reconhecida pela vaga
  e vira UMA admissão só (as vagas Alfa e Bravo carregam o código do Pandapé; a Charlie não, para
  cobrir os dois casos).
- **O link do Portal não vai para prontuário vazio:** enquanto a pré-admissão está na Liberação
  (sem documentos ainda), o sistema NÃO dispara a credencial do Portal. Isso foi medido: o envio
  fica "não pode enviar" até a admissão ser liberada.
- **O CPF do substituído** (quando o motivo é substituição) segue a retenção de 48h do lado da
  admissão e não contamina o dado da vaga.

## O Que Fica Pendente De Você Decidir

1. **Publicar:** validado por você, a fábrica commita e sobe (nada foi commitado ainda).
2. **O reenviar do funil:** hoje, se o time reverter um envio, a pré-admissão fica na fila da
   Liberação. Se quiser que reverter também recuse a pré-admissão, é um ajuste à parte (proponho,
   não construí).
3. **Dois retoques de tela fora do pedido, se quiser:** o subtítulo da lista da Liberação ainda diz
   "chegaram pelo Pandapé" (agora também chegam do funil), e o botão de liberar na LISTA aparece
   cortado na borda direita (a tabela tem muitas colunas). Os dois são anteriores a esta frente;
   ajusto se você pedir.
