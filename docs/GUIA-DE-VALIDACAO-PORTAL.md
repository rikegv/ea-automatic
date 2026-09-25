# Guia De Validação: O Portal Do Candidato Na Homologação

> Para o Rike validar na tela, sem termo técnico. Tudo acontece na **3120**
> (`http://10.18.117.235:3120`), que é o ambiente de homologação. A produção (a 3010) não é tocada.
> Cada passo diz **onde entrar**, **o que clicar** e **o que você deve ver**.

O login de administração da homologação está no arquivo
`~/SENHA-HOMOLOG-SUPERADMIN.txt` (conta `admin@homolog.local`).

---

## Parte 1: A Tela De Dicas (menu de configuração)

**Onde:** entre na 3120 como administrador, menu lateral, **Dicas De Documento** (grupo
Administração). Se ele não aparecer, é porque o menu novo nasce só para o Super Admin, e você está
com a conta certa.

1. **A lista.** Você vê os tipos de documento, um por linha, com a coluna **Situação** dizendo "Com
   Dica", "Sem Dica" ou "Dica Inativa". No topo, o contador "X de 31 documentos com dica cadastrada".
2. **Cadastrar uma dica.** Clique em "Nova dica" (ou "cadastrar" numa linha sem dica), escolha um
   documento, escreva o texto e salve. A linha passa a "Com Dica".
   - **Teste que o sistema recusa `<` e `>`:** escreva uma dica com o sinal de menor ou maior no
     texto. Ela deve ser **recusada** com um aviso, não salva. É a defesa contra código na tela do
     candidato.
3. **Os filtros.** Clique no ícone de filtro ao lado de "Nova dica". Aparecem **dois** filtros,
   Situação e Documento, e só esses dois. Escolha "Com Dica" em Situação: a lista mostra só quem tem
   dica, e o contador do topo **continua** dizendo "X de 31" (o total não muda com o filtro), com
   uma linha "Filtro ativo: N na lista".
4. **Ocultar e reativar.** Numa dica cadastrada, clique em "ocultar": a situação vira "Dica Inativa"
   e o texto continua guardado. Clique em "reativar": volta a "Com Dica".

---

## Parte 2: O Bloqueio Do Menu De Dicas (o acesso restrito)

O que você quer confirmar: **um usuário Master NÃO edita a dica sem você liberar.**

1. **Saia** da conta de administrador (botão Sair).
2. **Entre** como o Master de teste: `usuario06@homolog.local`, senha `Homolog@Master6`.
3. Olhe o **menu lateral**: **não** deve haver "Dicas De Documento". Um Master comum não enxerga esse
   menu.
4. **Tente forçar:** digite na barra de endereço `http://10.18.117.235:3120/admin/dicas-documento`.
   A tela **não** deve abrir a lista de dicas: ou some, ou dá acesso negado. É o bloqueio funcionando.
5. Volte para a conta de administrador. Ali a tela abre normal. **Conclusão:** só quem você liberar
   escreve a dica; o Master, sozinho, não.

---

## Parte 3: O Gerenciador Do Portal (a fila de coleta)

**Onde:** como administrador, menu **Gerenciador Do Portal**.

1. **Os cinco cards** no topo: Encaminhados, Acessaram, Não Acessaram, Concluíram, Intervenção
   Humana. Anote os números.
2. **Clique em "Acessaram".** A tabela abaixo tem de mostrar **exatamente** o número que o card diz,
   e uma frase avisando que as abas ficam suspensas enquanto o card está aceso. **Este era o bug:**
   antes, clicar zerava a tabela. Agora ela filtra, inclusive os finalizados.
3. **A coluna Origem** existe na tabela (Automático, Manual, Entrega À Mão, ou "não informado").
4. **O olho** (primeiro ícone de cada linha) abre um cartão enxuto só com as informações do
   candidato. **Não** deve haver CPF, e-mail nem telefone nesse cartão.
5. **Enviar link.** O botão "Enviar link" no topo abre uma busca por nome. Como o e-mail ainda não
   está ligado, ao tentar enviar você verá um aviso de que o envio está indisponível, não um erro.

---

## Parte 4: A Trilha Do Candidato E O Botão Do VT

Esta é a parte que exige um link. Para ver a trilha, você precisa entrar como o candidato entraria.
Peça à fábrica para gerar um link de um candidato de teste (o Playwright já faz isso nas provas), ou
use o que estiver no relatório da fábrica. Abra o link no celular ou numa janela estreita.

1. **A tela inicial** ("Portal Do Candidato" no topo, centralizado, sem o "Grupo Soulan").
2. **A lista de documentos** aparece **nesta ordem** no começo: RG, CPF, Comprovante de Residência,
   Comprovante de Conta Bancária, e os obrigatórios do cargo. A Certidão e os demais vêm depois.
3. **A casa do Vale-Transporte** não pede upload: ela tem um **botão** "Abrir o formulário de
   vale-transporte" e um texto dizendo que se preenche em outra página. O link de pular ali diz
   **"Preencher depois"**, não "não tenho este documento".
4. **Clique no botão do VT.** Abre uma aba nova com o formulário. Na homologação, ele mostra "este
   link foi alterado depois de gerado": **isso é o esperado**, porque a chave da homologação é de
   teste e o formulário real recusa o token de teste. Em produção, ele abriria o formulário de
   verdade.
5. **O ícone de Dicas** aparece na casa de um documento **só se aquele documento tiver dica
   cadastrada** (Parte 1). Clique nele: abre um cartão pequeno com a dica. Documento sem dica não tem
   o ícone.

---

## Parte 5: A Retomada (o candidato sai e volta)

1. Com a trilha aberta, **feche a aba** e **abra a 3120 sem o link** (digite só
   `http://10.18.117.235:3120/portal`).
2. Você deve ver **"Abra O Link De Novo"**, com um ícone de link e a instrução de abrir de novo o
   link que recebeu. **Não** deve dizer "Link Inválido" nem mandar procurar o RH de cara: o link
   dele ainda está vivo, só a aba morreu.
3. Um link de fato revogado ou vencido continua mostrando "Link Inválido". São coisas diferentes.

---

## As Três Decisões Dos Vazamentos De CPF: TOMADAS

Não são mais para decidir, ficam registradas aqui como fechadas (22/09/2026):

1. **Subir o app do VT no Firebase: AUTORIZADO.** Libera os vazamentos 2 e 3 em produção. Detalhe em
   `docs/PLANO-CPF-NA-URL-DO-VT.md`, seção 7.
2. **Prazo de 30 dias do link do consultor: MANTER.** Os links antigos vencem sozinhos, os novos já
   nascem sem CPF na URL. Ninguém perde acesso.
3. **O passivo dos 202 CPFs já no log: NÃO MEXER.** "O que passou passou", corrige só daqui para
   frente.

## O Que Ainda Depende Do Fernando (infra, não é decisão sua)

1. **Ligar o e-mail:** o canal está inerte até o Fernando definir a conta remetente (Workspace ou
   SendGrid). Sem isso, o link do Portal não sai por e-mail (só à mão).
2. **A lista de rotas do Portal para a barreira do Fernando** está fechada no documento de segurança
   (seção F7.1). Entra junto quando ele montar a barreira.
