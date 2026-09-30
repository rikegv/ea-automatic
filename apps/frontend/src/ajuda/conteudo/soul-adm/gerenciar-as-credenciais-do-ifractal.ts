import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA IFRACTAL: preencher a credencial de ponto na própria linha.
 *
 * ┌─ A SENHA FICA VISÍVEL, E ESTE ARTIGO JÁ ENSINOU O CONTRÁRIO DURANTE DOIS DIAS ───────────────┐
 * │ Decisão do diretor de 30/09/2026: o campo de senha da aba iFractal fica em TEXTO CLARO, e o      │
 * │ assunto está encerrado. O fundamento é dele: a senha é PROVISÓRIA e existe para ser repassada ao │
 * │ candidato, então o time que opera a aba é justamente quem precisa LÊ-LA, e esse time já enxerga  │
 * │ aquele dado todos os dias, coberto pelo documento de confidencialidade que assinou.              │
 * │                                                                                                  │
 * │ O QUE ESTE BLOCO DIZIA ANTES, e é registro que vale mais do que o texto novo: entre 28 e 30/09   │
 * │ o campo foi mascarado, como conserto de segurança, e o artigo ensinava os pontinhos como         │
 * │ comportamento correto. O mascaramento QUEBROU A OPERAÇÃO, porque quem cadastra a senha precisa   │
 * │ lê-la para repassar, e foi revertido. Enquanto durou, o manual estava certo sobre a tela e       │
 * │ errado sobre o trabalho.                                                                          │
 * │                                                                                                  │
 * │ ISTO NÃO É ACHADO DE SEGURANÇA, e auditoria futura que levantar o campo tem a resposta dada.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A DECISÃO VALE PARA A TELA, NÃO PARA A IMAGEM, E A DISTINÇÃO É O QUE PROTEGE ESTE ARQUIVO ──┐
 * │ Senha visível na TELA é decisão tomada. Senha em PRINT, em log ou em qualquer arquivo que entre │
 * │ no repositório continua PROIBIDA, e o motivo não é formalismo: quem está na tela é o time com    │
 * │ acesso e com termo assinado, enquanto a sessão dura; o arquivo versionado é qualquer um que       │
 * │ clone o projeto, para sempre, e imagem que entra no histórico não sai.                            │
 * │                                                                                                  │
 * │ CONSEQUÊNCIA PRÁTICA PARA QUEM MEXER NAS IMAGENS DESTE ARTIGO: o filtro de dado pessoal só       │
 * │ ignorava aquele campo enquanto ele era do tipo senha. Em texto claro, ele LÊ o valor, e a regra  │
 * │ de rótulo recusa a imagem. Isso é o comportamento certo. As duas saídas legítimas são recorte    │
 * │ que deixe a coluna de senha fora do quadro, ou arnês com credencial sintética declarada.         │
 * │ Afrouxar o filtro não é uma delas.                                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTA ABA NÃO SE PARECE COM AS OUTRAS ───────────────────────────────────────────────┐
 * │ Composição própria, decidida pelo diretor: Matrícula, Cliente, Nome, Data adm., Tipo De Marcação, │
 * │ Login, Senha e Status. Saem Contrato, Cargo, Loja, Projeto, as pendências obrigatórias e a coluna │
 * │ de avanço. Quem chega da Auditoria procura controles onde eles não estão, e o artigo avisa antes.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DOIS DETALHES DE COMPORTAMENTO QUE O TEXTO NÃO PODE OMITIR ─────────────────────────────────┐
 * │ 1. NÃO EXISTE BOTÃO DE SALVAR: a gravação acontece ao SAIR do campo. Quem procura o botão acha    │
 * │    que não salvou e redigita.                                                                    │
 * │ 2. A LISTA DE STATUS É EDITÁVEL pelo time no menu gerencial do iFractal, então o artigo cita os    │
 * │    quatro que vêm de fábrica e diz que a lista pode ter outros. Fixar a lista como definitiva      │
 * │    envelheceria o artigo no primeiro status novo.                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "gerenciar-as-credenciais-do-ifractal",
  titulo: "Gerenciar As Credenciais Do iFractal",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como preencher o login e a senha do sistema de ponto direto na linha da aba iFractal, por que a senha fica visível na tabela e como mover o status até finalizar.",
  termos: [
    "ifractal",
    "ponto",
    "marcacao de ponto",
    "relogio de ponto",
    "credencial",
    "login",
    "senha",
    "usuario do ponto",
    "senha aparece na tela",
    "ler a senha do candidato",
    "repassar a senha",
    "biometria",
    "cartao",
    "reconhecimento facial",
    "aplicativo",
    "tipo de marcacao",
    "nao cadastrado",
    "pendente de envio",
    "finalizado",
  ],
  preRequisitos: [
    "A frente do iFractal já precisa ter nascido para aquela admissão: ela abre junto do Cadastro, quando a Auditoria e o Exame fecham, e vale para todos os clientes.",
    "Ter em mãos o login e a senha criados no iFractal para aquela pessoa.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e clique na aba iFractal.",
      detalhe:
        "Ela é a quinta aba, ao lado da Integração. As colunas são diferentes das outras abas: não há contrato, cargo nem pendências obrigatórias aqui.",
      controles: ["Esteira Admissional", "Farol Admissional", "IFRACTAL"],
      print: {
        arquivo: "01-aba-ifractal.png",
        legenda: "Passo 1: a aba iFractal aberta, com as colunas próprias dela.",
      },
    },
    {
      gesto: "Ache a pessoa pela busca do topo, ou recorte a fila pelo ícone de funil.",
      detalhe:
        "Esta aba tem filtros próprios por Matrícula, Nome Do Funcionário e Tipo De Marcação, além de cliente, status e data de admissão. Login e senha não são filtro: ninguém procura uma pessoa pela credencial dela.",
      controles: [
        "Buscar por nome, CPF ou cliente",
        "Abrir filtros",
        "Matrícula",
        "Nome Do Funcionário",
        "Tipo De Marcação",
      ],
    },
    {
      gesto: "Confira a coluna Tipo De Marcação antes de criar a credencial.",
      detalhe:
        "Ela diz como aquela pessoa vai marcar ponto e é herdada do cadastro do cliente, não se edita aqui. Os valores são Cartão, Biometria, Reconhecimento Facial e Aplicativo.",
      controles: [
        "Tipo De Marcação",
        "Cartão",
        "Biometria",
        "Reconhecimento Facial",
        "Aplicativo",
      ],
    },
    {
      gesto: "Clique no campo Login da linha e digite o usuário criado no iFractal.",
      detalhe:
        "Os dois campos são editados direto na linha, sem abrir janela nenhuma. Não existe botão de salvar: a gravação acontece quando você sai do campo, e um ícone discreto aparece por um instante ao lado da senha enquanto ela é gravada.",
      controles: ["Login", "login"],
      print: {
        arquivo: "02-campos-login-e-senha.png",
        legenda: "Passo 4: os campos de login e de senha editáveis na própria linha.",
      },
    },
    {
      gesto: "Clique no campo Senha e digite a senha.",
      detalhe:
        "A senha fica visível na linha, e isso é decisão de quem dirige: ela é provisória e existe para ser repassada ao candidato, então quem cadastra precisa conseguir ler o que gravou. Para trocar, digite a nova por cima e saia do campo. Trate a tela como se trata credencial: não deixe a aba aberta em tela compartilhada nem fotografe a lista.",
      controles: ["Senha", "senha"],
    },
    {
      gesto: "Abra o seletor da coluna Status e mova a frente conforme o andamento.",
      detalhe:
        "Nesta aba o seletor é a própria coluna Status. De fábrica, a lista traz Não Cadastrado, Cadastrado, Pendente De Envio e Finalizado, e Finalizado é o que conclui a frente. A lista é mantida pelo time, então pode ter outros nomes.",
      controles: [
        "Status",
        "Não Cadastrado",
        "Cadastrado",
        "Pendente De Envio",
        "Finalizado",
      ],
      print: {
        arquivo: "03-seletor-de-status.png",
        legenda: "Passo 6: o seletor de status dentro da coluna Status, na linha.",
      },
    },
    {
      gesto: "Para rever quem você já finalizou, clique no card Logins Finalizados.",
      detalhe:
        "Concluir tira a linha da fila, então é esse card que traz os finalizados de volta. Clicar de novo desliga o filtro.",
      controles: ["Logins Finalizados", "Total na fila"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A senha aparece em pontinhos e você não consegue lê-la.",
      acao: "Se você está vendo pontinhos, a tela do seu navegador está desatualizada: recarregue a página. O campo voltou a mostrar o valor em 30/09/2026, justamente porque o time precisa ler a senha para repassar ao candidato.",
    },
    {
      sintoma: "Digitei o login e não achei o botão de salvar.",
      acao: "Não existe botão. A gravação acontece quando você sai do campo, seja clicando fora, seja com a tecla Tab. Se nada mudou no valor, o sistema não chama o servidor à toa.",
    },
    {
      sintoma: "A tela avisou que falhou ao salvar a credencial do iFractal.",
      acao: "O valor não foi gravado. Clique no campo, ajuste o conteúdo e saia dele de novo para repetir a gravação. Se insistir, avise a TI.",
    },
    {
      sintoma: "O status que eu preciso não está na lista do seletor.",
      acao: "A lista de status desta frente é mantida pelo time no menu gerencial do iFractal, e não é fixa. Peça a inclusão a quem administra esse menu: o status novo passa a aparecer no seletor sem precisar de nada na sua tela.",
    },
    {
      sintoma: "O Tipo De Marcação da pessoa está errado e o campo não deixa editar.",
      acao: "Ele é herdado do cadastro do cliente, e não se edita nesta aba de propósito. A correção é feita na ficha daquele cliente, e a coluna passa a mostrar o valor novo.",
    },
    {
      sintoma: "A pessoa não aparece nesta aba.",
      acao: "A frente do iFractal nasce junto do Cadastro, quando a Auditoria e o Exame fecham. Antes disso não existe linha aqui. Depois de finalizada, ela sai da fila e volta pelo card Logins Finalizados.",
    },
  ],
  regras: [
    "A frente do iFractal nasce para todos os clientes, junto do Cadastro, quando a Auditoria e o Exame fecham.",
    "A senha fica visível na tela, por decisão de quem dirige: ela é provisória e existe para ser repassada ao candidato. Para trocar, digite a nova por cima.",
    "Visível na tela não quer dizer livre: não fotografe a lista, não a projete em tela compartilhada e não a cole em mensagem.",
    "Login e senha são gravados ao sair do campo, sem botão de salvar.",
    "A credencial nunca é registrada em log do sistema.",
    "O Tipo De Marcação é herdado do cadastro do cliente e não se edita nesta aba.",
    "A lista de status desta frente é mantida pelo time, e é ela que define qual status conclui a frente.",
    "O iFractal corre em paralelo ao fim da esteira e não segura a conclusão da admissão: a admissão termina sem esperar por ele.",
    "Login e senha não viram filtro: os filtros desta aba são matrícula, nome, tipo de marcação, cliente, status e data de admissão.",
  ],
  relacionados: [
    "concluir-o-cadastro-e-o-contrato",
    "acompanhar-a-integracao",
    "filtrar-uma-lista",
    "ordenar-a-lista-pelo-cabecalho",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/esteira/nascimento-cadastro.ts",
    "apps/backend/src/ifractal/ifractal-status.service.ts",
  ],
  revisadoEm: "2026-09-28",
};
