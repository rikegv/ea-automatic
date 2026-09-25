# Portal Do Candidato: O Caminho Do Arquivo E Da IA

**Estado:** INVESTIGAÇÃO E PROPOSTA. Nada construído, nada commitado, nenhum arquivo do app tocado.
**Veredito da auditoria:** **VETADO COM CONCESSÃO.** A direção é aceita, o caminho como escrito não passa
ainda. As dez exigências estão na seção 6.
**Quem trabalhou:** `arquiteto` (o caminho), `ia` (onde a leitura roda e o teto), `seguranca` (auditoria
adversarial, §A.38). Consolidação e conferência: coordenador.
**Régua:** §A.11, §A.24, §A.31, §A.38, §A.39.

---

## 1. Como O VT Faz Hoje, E Por Que Ele Não Serve De Modelo Inteiro

**A leitura do VT é DEPOIS, não na hora, e por dois motivos.**

1. O app externo deposita o PDF num bucket do Google, e o EA **varre esse bucket de 15 em 15 minutos**
   (`apps/backend/src/domain/scheduler-vt-coleta.ts`, `INTERVALO_MS = 15 * 60 * 1000`). O candidato já
   fechou o navegador havia muito quando o EA olha.
2. **E o VT não faz extração por IA.** Os campos estruturados vêm de um **JSON irmão** que o próprio app
   externo grava ao lado do PDF (`AiClientService.dadosColetaVt`). O VT é um formulário que o candidato
   digitou, não um documento lido.

**Conclusão:** o precedente do VT cobre "o arquivo vai para o Google" e **não cobre** "a IA lê o
documento". A parte que o diretor quer é justamente a que nunca foi construída. O que se aproveita dali é
o desenho de armazenamento, não o de leitura.

---

## 2. Onde A IA Pode Ler Na Hora, Sem Tocar A Plataforma Principal

O serviço de leitura **já existe e já é um processo separado** do backend: o `ai-service`, que fala com o
Vertex. E o mais importante, **ele já recebe bytes**: a função que manda o documento ao modelo trabalha
sobre conteúdo em memória (`apps/ai-service/app/gemini.py`, três chamadas de `Part.from_bytes`), e a
checagem de PDF com senha também é função pura sobre bytes.

**Mas ele não está isolado, e isso é o achado.** A instância de hoje carrega a credencial do banco e a do
Drive delegado, e é a mesma que atende a auditoria da operação. Usá-la como está significaria pôr o
processo que abre arquivo hostil ao lado das chaves da casa.

**Recomendação: o MESMO código, numa SEGUNDA instância com ambiente magro**, sem credencial de banco e
sem Drive, dedicada ao portal. Reuso quase total, isolamento de verdade, e a queda de uma não derruba a
outra.

**Duas coisas precisam ser construídas, e nenhuma existe hoje:**
- **uma entrada que receba o arquivo em memória.** Hoje o arquivo chega ao leitor **por caminho em
  disco**, sempre: não há um único endpoint de upload no `ai-service` (zero ocorrências, conferido pelo
  coordenador). Com uma armadilha medida junto: a biblioteca web do Python **grava em disco sozinha**
  acima de 1 MB, então a leitura tem de ser por fluxo com orçamento de bytes, senão o arquivo toca o
  disco sem ninguém ter pedido.
- **a checagem de conteúdo ativo** (PDF que executa ao abrir). **Não existe em lugar nenhum do sistema**,
  conferido por varredura. É lacuna real, não item de refinamento.

---

## 3. O Caminho Proposto, Ponta A Ponta

1. O candidato se identifica (CPF e nascimento). Até aqui só viaja JSON.
2. Ele escolhe o documento e **pede autorização**. Viajam só o identificador e o tamanho.
3. **O EA assina uma credencial de escrita** de objeto único: nome escolhido por nós, prazo de minutos,
   tipo e tamanho embutidos na assinatura, sem leitura, sem listagem, sem sobrescrita.
4. **O celular sobe direto para o bucket do Google, uma vez só.** O arquivo não passa pela plataforma
   principal.
5. O navegador avisa que terminou, **e a palavra dele não vale nada**.
6. O EA manda o leitor separado ler o objeto **em memória, no mesmo ciclo**, em segundos, com o candidato
   na tela.
7. A leitura devolve **campos, nunca binário**, e serve de **confirmação de que o arquivo chegou**.
8. O candidato confere e confirma. **Só a confirmação humana grava.**

**A plataforma principal aparece em três pontos, nenhum deles com o arquivo:** identifica, assina a
credencial, guarda status e campos confirmados.

**A ordem é GRAVAR PRIMEIRO, LER DEPOIS**, e a auditoria confirmou sem ressalva. A assimetria de dano
decide: ler primeiro pode deixar campos na tela de um arquivo que não subiu, que é entrega falsa e
silenciosa, o mesmo padrão da §A.33. Gravar primeiro, no pior caso, dá digitação manual.

**"Na hora" continua cumprido.** O "depois" que se deve recusar é o do VT, uma varredura de 15 em 15
minutos. Uma leitura disparada pelo próprio envio, em segundos, com o candidato olhando a tela, é na
hora.

---

## 4. O Candidato No 4G Decidiu O Desenho

Este caminho sobe **uma vez só**. O envio duplo (mandar para o Google e mandar uma cópia para o nosso
leitor), que era a recomendação anterior da segurança, custaria ao candidato de 25 a 50 MB extras na
régua típica, o dobro de tempo de subida, e **duas falhas independentes por documento**, num celular em
rede ruim, que é o caso real e não o caso feliz.

**O `seguranca` reverteu a própria recomendação, por escrito**, e o motivo é o critério dele mesmo: o
byte passa por nós nas duas, então o envio duplo **não compra um único item de segurança**. E o custo que
ele havia atribuído ao envio único era falso. O envio único ainda ganha em três pontos: dispensa expor o
leitor ao navegador, permite conferir o metadado do objeto **antes** de baixar o primeiro byte, e faz a
confirmação de chegada sair de graça.

---

## 5. A IA No Navegador Do Candidato: Descartada, E O Motivo Não É Peso

A pergunta tem duas leituras, e a resposta honesta é diferente em cada uma.

- **Modelo rodando no próprio aparelho:** descartado por **qualidade e alcance**, não por peso. O
  reconhecimento de texto que roda no navegador devolve texto sem estrutura em foto de documento
  brasileiro, e o modelo local que existe no navegador de computador **não existe no iPhone**, que é
  metade do parque.
- **O navegador chamando a IA da nuvem direto:** isso é **tecnicamente possível**, e o motivo de recusar
  é **credencial**. Seria entregar ao aparelho do candidato uma chave que fala com o nosso projeto do
  Google, o **mesmo projeto que atende a auditoria da esteira**. Quem tivesse a chave gastaria a nossa
  cota, e a exaustão de cota já tem tratamento de erro próprio no código, ou seja, já é um problema
  conhecido da casa. Junto vazariam a régua e o prompt, que passariam a ser editáveis por quem quisesse.

**Registrar o motivo certo importa:** descartar pela razão errada faz a opção voltar na próxima
conversa.

---

## 6. O Veredito Da Auditoria: Vetado Com Concessão

A direção passa. O caminho como escrito, não. **Duas contradições e três vetos novos:**

**A mais grave, e ela existia entre os dois desenhos:** os dois agentes discordavam sobre **qual chave
assina a credencial**. Um supôs conta de serviço dedicada e concluiu que o pior dano seria "escrever
lixo"; o outro apontou que dá para assinar com a chave que já temos, **que é a mesma conta do Drive e do
Vertex**. Se valer a segunda, a conclusão tranquilizadora do primeiro é falsa. **Conferido pelo
coordenador: existe uma credencial só no serviço de IA, e o projeto declara que a mesma conta serve Drive
e Vertex** (§A.5). A auditoria está certa, e a chave dedicada deixa de ser detalhe.

**Os outros furos achados na credencial:** a contagem de quantidade e de ritmo ficaria na **confirmação**
e não na **emissão**, o que torna ilimitado pedir credencial e nunca enviar; cada credencial é na prática
uma chamada gratuita ao nosso motor de IA, no mesmo projeto da esteira, ou seja, fila de quem está sendo
admitido; a proibição de sobrescrever precisa estar **dentro do que é assinado**, senão o cliente
simplesmente a omite; e **ninguém tem permissão de apagar** o arquivo recusado.

**Sobre o isolamento do leitor:** tirar a credencial de banco é **cosmético** enquanto todos os serviços
rodam sob o mesmo usuário do sistema, sem nenhuma diretriz de isolamento. Conferido pelo coordenador:
todas as unidades são do mesmo usuário.

**As dez exigências antes de construir** (as de número 1, 3 e 4 impedem começar):

1. Conta de serviço **dedicada** à escrita, com a chave no backend e **nunca** no serviço que lê.
2. Não sobrescrita, tipo e faixa de tamanho **nos cabeçalhos assinados**, e o mecanismo de envio
   escolhido.
3. Contar quantidade e ritmo **na emissão**, mais um teto de extrações por link.
4. O leitor em **usuário de sistema próprio**, com limites de memória, de processos e de alcance de rede.
5. A análise em processo filho, com morte dura no tempo limite.
6. **Construir a checagem de conteúdo ativo**, que não existe hoje.
7. Área de entrada isolada do prontuário, e o recusado **apagado ativamente**.
8. O teste de que a credencial não lê e não lista **executado**, não suposto.
9. Reescrever o pedido ao Fernando com as cláusulas que faltam.
10. O tipo de conteúdo corrigido por nós depois da leitura.

---

## 7. O Que Depende Do Fernando, Que É Pouco

**A fábrica resolve sozinha:** a segunda instância do leitor, a rota no nosso proxy de borda (que já
existe e é nosso), os tetos, a identidade, o link, as tentativas, os logs, a Sala De Segurança, e **a
assinatura da credencial, que é local**.

**Do Fernando, um pedido só, de console, sem rede, sem endereço novo, sem certificado:** criar o bucket
de entrada com acesso público bloqueado e ciclo de vida, liberar o **CORS** só para o domínio do portal
(sem isso o envio quebra em silêncio, e não dá para fazer daqui), criar a conta de serviço de escrita com
papel **só de criar objeto**, e dar leitura à conta que o EA já usa.

**Dependência zero não existe**, e é honesto dizer: só o dono do projeto concede escrita, e a fábrica não
se autoconcede acesso (§A.0). Mas isto é uma tela de console, não uma frente de infraestrutura.

**O pedido FOI reescrito** (exigência 9), e está em `docs/PEDIDO-FERNANDO-BUCKET-PORTAL.md`, pronto
para enviar. O que faltava na primeira versão era: faltam o projeto e a região, por
qual canal a chave é entregue, quais cabeçalhos o CORS libera, quem apaga o arquivo recusado, o registro
de acesso ao bucket, a proibição explícita de acesso público, e se a varredura de vírus cobre este bucket
novo.

---

## 8. O Que Ficava Para O Diretor: DECIDIDO EM 18/09/2026

1. **Direção APROVADA**: envio único, gravar primeiro e ler depois, leitor separado.
2. **As dez exigências AUTORIZADAS** como parte da construção, e não como refinamento posterior.
3. **O pedido reescrito ao Fernando está PRONTO**, em `docs/PEDIDO-FERNANDO-BUCKET-PORTAL.md`, e leva
   junto as três perguntas do arquivo reprovado depois de gravado, porque aquilo é infraestrutura dele.

**Fechado junto:** o **envio é ÚNICO, não duplo**. O `seguranca` reverteu a própria recomendação do
envio duplo, que não comprava segurança, e a IA lê **em memória**. O registro está na seção 0 de
`docs/DESENHO-PORTAL-SEGURANCA.md`.

**O que resta é execução.** O bloqueio único é o comando privilegiado do diretor, e ele é auditado em
`docs/PARECER-SEGURANCA-PORTAL-CONSTRUIDO.md`.
