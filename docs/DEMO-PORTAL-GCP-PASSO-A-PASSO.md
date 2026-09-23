# DEMO Portal do Candidato -> GI: passo a passo do Google Cloud (para o Rike)

> Documento de HOMOLOGACAO / DEMO. Nada aqui vai para producao. E a lista do que **voce (Rike)**
> clica no console do Google Cloud, no projeto **`ea-v2-automatic`**, para a fabrica plugar a demo.
> Ao final ha a lista curta do que voce devolve para a fabrica.
>
> Regra de seguranca (§A.6): as chaves JSON que voce baixar sao **segredo**. Mande pelo canal
> combinado, nunca cole em chat aberto nem em e-mail publico. A fabrica nunca aparece com esses
> arquivos em log.

Voce vai criar **tres coisas**, nesta ordem:

1. Um **balde** (bucket) temporario, onde o documento do candidato cai por alguns dias e some sozinho.
2. Uma **conta de servico que ASSINA o envio** (para o emissor), a que gera o link de upload.
3. Uma **conta de servico que so LE** o balde (para a IA isolada que audita o documento).

Tudo no projeto **`ea-v2-automatic`**. Confirme, no topo do console, que o projeto selecionado e esse
antes de comecar.

---

## A) O BALDE TEMPORARIO (Cloud Storage)

Menu do console: **Cloud Storage > Buckets > Criar (Create)**.

1. **Nome do bucket** (sugestao): `ea-portal-homolog-entrada`
   O nome e global no Google inteiro; se acusar que ja existe, acrescente um sufixo, por exemplo
   `ea-portal-homolog-entrada-01`. **Anote o nome final que ficou** (voce devolve ele no fim).
2. **Regiao (Location):** escolha **Region** (nao multi-region) e selecione **`southamerica-east1`
   (Sao Paulo)**. Fica perto e barato; e demo, o volume e pequeno.
3. **Classe de armazenamento (Storage class):** **Standard**.
4. **Controle de acesso (Access control):** marque **Uniform** (acesso uniforme no nivel do bucket).
   Nao use "Fine-grained". Isso e o que faz a permissao valer pelo papel da conta de servico, e nao
   por arquivo.
5. **Protecao contra exclusao / versionamento:** deixe **desligado**. E balde de passagem.
6. Clique **Criar**. Se aparecer um aviso sobre "impedir acesso publico" (Prevent public access),
   **aceite/mantenha ligado**, o balde nao pode ser publico.

### A.1) Expurgo automatico (lifecycle), o balde se limpa sozinho

Ainda no bucket recem-criado: aba **Lifecycle (Ciclo de vida) > Adicionar regra (Add a rule)**.

- **Acao (Action):** **Excluir objeto (Delete object)**.
- **Condicao (Condition):** **Idade (Age)** = **3** dias. (Se preferir margem para a demo, use 7.)
- Salvar.

Isso apaga qualquer documento que o candidato subiu depois de N dias, sem ninguem lembrar. E a
retencao minima da §A.6 em forma de configuracao.

### A.2) CORS (para o celular do candidato subir o arquivo direto no balde)

O upload e feito pelo navegador do candidato direto no Google (upload "resumavel"), entao o balde
precisa autorizar o site da demo a falar com ele. Isso **nao tem botao** no console; se faz por
comando. **Voce nao precisa rodar**, e mais facil voce so confirmar o dominio e a fabrica aplica.
Deixo aqui o conteudo para registro:

Dominio da demo (de onde o candidato abre o Portal): `http://10.18.117.235:3120`
(se a demo for aberta por outro endereco/dominio, me avise qual, que ajusto).

Arquivo `cors.json` que a fabrica aplica com `gcloud storage buckets update`:

```json
[
  {
    "origin": ["http://10.18.117.235:3120"],
    "method": ["PUT", "POST", "GET", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
```

> Se voce preferir aplicar voce mesmo: `gcloud storage buckets update gs://NOME-DO-BUCKET --cors-file=cors.json`.
> Mas o combinado e voce so me passar o nome do bucket e o dominio; o CORS eu aplico.

---

## B) A CONTA DE SERVICO QUE **ASSINA O ENVIO** (para o emissor)

Esta e a conta que gera o link assinado de upload. E a mais poderosa das duas, entao ela so pode
**escrever no balde** e **assinar**, e nada alem.

Menu: **IAM e administrador (IAM & Admin) > Contas de servico (Service Accounts) > Criar conta de
servico (Create service account)**.

1. **Nome (sugestao):** `portal-emissor-homolog`
   O e-mail sai automatico, algo como
   `portal-emissor-homolog@ea-v2-automatic.iam.gserviceaccount.com`. **Anote esse e-mail.**
2. **Nao** conceda papel nenhum na tela de criacao (o "Grant this service account access to
   project"). Pule essa etapa (Continue / Done). O acesso e dado **no balde**, nao no projeto
   inteiro, para ela nao alcancar mais nada.

### B.1) Dar a ela acesso de ESCRITA **so nesse balde**

Volte em **Cloud Storage > Buckets > (o balde que voce criou) > Permissoes (Permissions) >
Conceder acesso (Grant access)**.

- **Novos principais (New principals):** cole o e-mail da conta `portal-emissor-homolog@...`.
- **Papel (Role):** **Storage Object Admin** (`roles/storage.objectAdmin`).
  (Ela precisa criar o objeto e, no fluxo de correcao, apagar; por isso Admin do objeto, e nao so
  Creator. Continua sendo **so neste balde**.)
- Salvar.

### B.2) Dar a ela o poder de ASSINAR (para o link de upload funcionar)

Para gerar link assinado, a conta precisa poder assinar em nome dela mesma. Ha **dois caminhos**;
o **caminho 2 (chave JSON) e o mais simples para a demo** e e o que eu recomendo.

**Caminho 1 (sem baixar chave, mais "certo" a longo prazo):** dar a ela o papel
**Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) **sobre ela mesma**.
Em **Contas de servico > (a conta) > Permissoes > Conceder acesso**, principal = o proprio e-mail
dela, papel = Service Account Token Creator. Nesse caminho voce **nao baixa chave** e me diz so o
e-mail.

**Caminho 2 (chave JSON, recomendado para a demo):** baixe uma chave.
Em **Contas de servico > (a conta `portal-emissor-homolog`) > Chaves (Keys) > Adicionar chave (Add
key) > Criar nova chave (Create new key) > JSON > Criar**. O navegador baixa um arquivo `.json`.
**Esse arquivo e um dos que voce me devolve.** Guarde com cuidado.

---

## C) A CONTA DE SERVICO QUE **SO LE** (para a IA isolada / leitor)

Esta e a conta que a IA isolada (a instancia 8001 do homolog) usa para **baixar e auditar** o
documento. Ela **so le**, nada mais.

Menu: **IAM e administrador > Contas de servico > Criar conta de servico**.

1. **Nome (sugestao):** `portal-leitor-homolog`
   E-mail automatico `portal-leitor-homolog@ea-v2-automatic.iam.gserviceaccount.com`.
   **Anote o e-mail.**
2. Sem papel na criacao (pule, como na B).

### C.1) Dar a ela acesso de LEITURA **so nesse balde**

**Cloud Storage > Buckets > (o balde) > Permissoes > Conceder acesso**.

- **Principal:** o e-mail `portal-leitor-homolog@...`.
- **Papel:** **Storage Object Viewer** (`roles/storage.objectViewer`), **so leitura**.
- Salvar.

### C.2) Baixar a chave dela

**Contas de servico > (a conta `portal-leitor-homolog`) > Chaves > Adicionar chave > Criar nova
chave > JSON > Criar.** Baixa o `.json`. **E o segundo arquivo que voce me devolve.**

> Sobre a IA (Vertex/Gemini): a auditoria usa o mesmo modelo `gemini-2.5-flash`. Se a conta de
> leitura NAO tiver acesso ao Vertex, a leitura do texto do documento pode falhar mesmo com o
> arquivo baixado. Se der esse erro na demo, o ajuste e adicionar a ela o papel **Vertex AI User**
> (`roles/aiplatform.user`) no projeto. Deixo anotado para nao travar a demo; comeco sem, e so
> peco se aparecer.

---

## O QUE VOCE ME DEVOLVE (a fabrica pluga)

1. **O nome final do balde** (item A.1). Ex.: `ea-portal-homolog-entrada`.
2. **A chave JSON da conta que ASSINA** (`portal-emissor-homolog`), item B.2, caminho 2.
   (Ou, se escolher o caminho 1, so o e-mail dela e o aviso de que usou Token Creator.)
3. **A chave JSON da conta que so LE** (`portal-leitor-homolog`), item C.2.
4. **O e-mail das duas contas de servico** (aparecem no nome da conta).
5. Se a demo for aberta por um endereco diferente de `http://10.18.117.235:3120`, **qual e**
   (para o CORS do item A.2).

Com isso a fabrica:
- coloca o **nome do balde** em `PORTAL_GCS_BUCKET` (backend do homolog) e `PORTAL_BUCKET` (IA
  isolada 8001), que hoje estao com o placeholder `REPLACE_COM_O_BUCKET_DO_RIKE`;
- salva a **chave da conta de leitura** em
  `/home/henrique/apps/ea-homolog-ai-service/credenciais/portal-leitor-homolog.json` (a IA isolada
  ja aponta para esse caminho);
- entrega a **chave da conta que assina** para a sessao do emissor;
- aplica o **CORS** no balde;
- reinicia so os servicos do homolog e confere a demo.

Nada disso toca a producao (a IA de producao na 8000 e o balde/segredos de producao ficam intactos).
