import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA AUDITORIA: o caminho principal, e só ele.
 *
 * ┌─ O QUE FICOU FORA, E É ESCOLHA, NÃO ESQUECIMENTO ────────────────────────────────────────────┐
 * │ Reauditar sem novo arquivo, assumir o documento como válido por decisão do consultor, reabrir a │
 * │ pendência de um documento que a I.A aprovou errado, solicitar reenvio ao candidato e zerar as   │
 * │ tentativas dele são RECURSOS SECUNDÁRIOS, de exceção, e são N2. Quem lê este artigo precisa     │
 * │ mandar documento, ler veredito e fechar a régua, que é o trabalho do dia.                      │
 * │                                                                                                 │
 * │ O "Reauditar" aparece uma vez, no bloco de erro do documento travado, porque é a própria tela    │
 * │ que instrui isso no aviso de "Parado há": ali ele não é recurso avançado, é o conserto do        │
 * │ sintoma, e omiti-lo deixaria a pessoa sem saída no único caso em que ela emperra de verdade.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O ARTIGO INSISTE QUE A FRENTE FECHA SOZINHA ───────────────────────────────────────┐
 * │ A régua obrigatória completa leva a Auditoria a Análise Finalizada AUTOMATICAMENTE (§A.3, regra │
 * │ 2 do complemento), e quem não sabe disso procura um botão de concluir que não existe, ou pior,  │
 * │ força o status pelo seletor com documento faltando e cai no aceite, que fica registrado no nome │
 * │ dele. O passo 9 e duas das regras existem para evitar exatamente esse caminho.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS `controles` FORAM LIDOS LETRA POR LETRA, e os fixos e os variáveis estão separados: as abas são
 * escritas em maiúscula no código (`AUDITORIA`), e as duas etiquetas de progresso da coluna Status
 * montam a frase com um número na frente ("9 aprovados"), então o que se declara é a parte FIXA. O
 * seletor de status da linha fica sem `controles` pelo mesmo motivo do artigo do ASO: o nome
 * acessível dele carrega o nome da pessoa (§A.6) e as opções vêm do catálogo vivo.
 */
export const artigo: Artigo = {
  slug: "auditar-os-documentos-da-admissao",
  titulo: "Auditar Os Documentos Da Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como trabalhar a fila da Auditoria: abrir os documentos de uma admissão, enviar cada um para a leitura da inteligência artificial, acompanhar a régua obrigatória e deixar a frente fechar sozinha.",
  termos: [
    "auditoria",
    "auditar",
    "auditar documento",
    "documento",
    "documentos",
    "regua",
    "regua documental",
    "checklist",
    "conferir documento",
    "documento pendente",
    "documento reprovado",
    "inconforme",
    "recusado",
    "falta documento",
    "analise pendente",
    "analise finalizada",
    "fechar auditoria",
    "prontuario",
    "drive",
    "aguardando reenvio",
  ],
  preRequisitos: [
    "Ter em mãos os arquivos dos documentos, em PDF ou em foto legível.",
    "A régua do cliente mais o cargo já precisa estar cadastrada: é ela que diz quais documentos são exigidos daquela pessoa.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional pelo menu da lateral esquerda.",
      controles: ["Esteira Admissional", "Farol Admissional"],
      print: {
        arquivo: "01-aba-auditoria.png",
        legenda: "Passo 1: a Esteira Admissional aberta na aba Auditoria, com as cinco abas no topo.",
      },
    },
    {
      gesto: "Clique na aba Auditoria.",
      detalhe:
        "Ela já vem aberta quando você entra na tela. Cada aba é uma fila independente, então quem está na Auditoria não sai de lá porque o exame andou.",
      controles: ["AUDITORIA"],
    },
    {
      gesto: "Digite o nome, o CPF ou o cliente na busca do topo para achar a pessoa.",
      detalhe: "A busca filtra a fila enquanto você digita, não precisa apertar nada.",
      controles: ["Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Leia a coluna Status para saber em que ponto a auditoria daquela pessoa está.",
      detalhe:
        "O texto não é fixo: ele acompanha a régua. Abaixo dele, uma etiqueta verde conta quantos documentos obrigatórios já foram aprovados e uma etiqueta vermelha aparece só quando existe documento reprovado, que é o que pede ação do time.",
      /*
       * "aprovados" e "reprovados" são a parte FIXA das duas etiquetas de progresso: a tela desenha
       * "9 aprovados" e "2 reprovados", com o número vindo da régua. Declarar o número seria declarar
       * um rótulo que não existe.
       */
      controles: [
        "Status",
        "Análise Pendente",
        "Aguardando Reenvio Dos Docs",
        "Análise Finalizada",
        "aprovados",
        "reprovados",
      ],
    },
    {
      gesto: "Clique em Auditar, na coluna Avanço / Auditoria da linha.",
      detalhe: "Abre a janela com todos os documentos que a régua exige daquela admissão.",
      controles: ["Avanço / Auditoria", "Auditar"],
      print: {
        arquivo: "02-botao-auditar.png",
        legenda: "Passo 5: o botão Auditar na coluna de avanço da linha.",
      },
    },
    {
      gesto: "Leia a barra de progresso no alto da janela antes de mexer em qualquer documento.",
      detalhe:
        "Ela diz quantos obrigatórios já estão validados, a porcentagem e, quando falta algo, o nome do que falta. Quando fecha, o texto vira Régua completa.",
      controles: [
        "Auditoria documental por IA",
        "obrigatórios validados",
        "Régua completa",
        "Faltam:",
      ],
    },
    {
      gesto: "Clique em Auditar documento na linha do documento e escolha o arquivo.",
      detalhe:
        "Vale PDF, JPG ou PNG. Sob o nome de cada documento está a exigência dele: só os obrigatórios travam o fechamento da frente. Assim que o arquivo sobe, a inteligência artificial lê e devolve o veredito sozinha.",
      controles: ["Auditar documento", "Obrigatório", "Não obrigatório", "Facultativo"],
    },
    {
      gesto: "Leia a etiqueta que apareceu na linha do documento e o motivo abaixo dela.",
      detalhe:
        "Validado em verde é documento aceito. Inconforme em vermelho é recusado, e o motivo escrito pela inteligência artificial fica logo abaixo. Pendente em amarelo é leitura sem conclusão. Aguardando auditoria é arquivo já recebido com a leitura ainda por rodar.",
      controles: ["Validado", "Inconforme", "Pendente", "Aguardando auditoria"],
    },
    {
      gesto: "Para corrigir uma recusa, clique em Enviar novo arquivo na mesma linha.",
      detalhe:
        "O novo envio substitui o veredito anterior, inclusive uma recusa. Antes disso, use o olho para abrir o arquivo que subiu e conferir se foi o documento certo.",
      controles: ["Enviar novo arquivo", "Visualizar documento"],
    },
    {
      gesto:
        "Siga até a barra dizer Régua completa e feche a janela: a frente conclui sozinha, sem botão.",
      detalhe:
        "Com todos os obrigatórios validados, a Auditoria passa a Análise Finalizada automaticamente, o prontuário é arquivado no Drive e a linha sai da fila. Para revê-la, use o card Auditorias Finalizadas.",
      controles: [
        "Régua completa",
        "Prontuário arquivado no Drive.",
        "Abrir pasta",
        "Auditorias Finalizadas",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O documento voltou Inconforme.",
      acao: "Leia o motivo escrito abaixo da linha do documento: é ele que diz o que a inteligência artificial recusou. Peça o arquivo correto ao candidato e use Enviar novo arquivo, que substitui o veredito anterior.",
    },
    {
      sintoma: "A linha do documento diz Parado há e um tempo.",
      acao: "A leitura travou além do esperado, e isso é diferente de documento que ninguém mandou. Clique em Reauditar, que reanalisa o arquivo já recebido sem exigir novo envio. Se insistir, avise a TI.",
    },
    {
      sintoma: "A janela diz sem régua para este par cliente e cargo.",
      acao: "Não há documento exigido cadastrado para essa combinação, então não há o que auditar. Peça à administração o cadastro da régua daquele cliente com aquele cargo.",
    },
    {
      sintoma: "A régua fechou e o aviso diz que ainda não há pasta no Drive.",
      acao: "Os documentos seguem guardados e o sistema tenta enviar de novo na próxima ação. Se continuar assim, avise a TI: nada foi perdido.",
    },
    {
      sintoma: "Mudei o status para Análise Finalizada pelo seletor e o sistema pediu aceite.",
      acao: "Ainda falta documento obrigatório na régua. Você pode avançar assumindo o aceite, que fica registrado em seu nome, ou cancelar e completar a régua, que é o caminho em que a frente fecha sozinha.",
    },
    {
      sintoma: "Cliquei no olho para ver o documento e a tela disse que ele não está mais disponível.",
      acao: "O arquivo é temporário: ele expira em 48 horas e é descartado quando a régua fecha. O veredito e a situação do documento continuam guardados; o binário, não.",
    },
  ],
  regras: [
    "Quais documentos são exigidos vem da régua do cliente mais o cargo: muda o cargo, muda o checklist.",
    "Quem dá o veredito de cada documento é a inteligência artificial, na leitura do arquivo. A auditoria é feita documento por documento, não em bloco.",
    "A frente fecha pela régua obrigatória: quando todos os obrigatórios ficam validados, a Auditoria vai para Análise Finalizada sozinha, sem ninguém clicar.",
    "Documento não obrigatório e facultativo não travam o fechamento da frente. Só os obrigatórios contam.",
    "Enviar um arquivo novo substitui o veredito anterior daquele documento, inclusive uma recusa.",
    "O arquivo é temporário no sistema. Quando a régua fecha, o prontuário é arquivado no Drive e a cópia local é descartada: o que fica guardado é a situação de cada documento, nunca o arquivo.",
    "Auditoria e Exame correm em paralelo, e concluir uma não mexe na outra.",
    "O Cadastro só abre depois que a Auditoria e o Exame fecham.",
    "Concluir a Auditoria pelo seletor com documento obrigatório pendente exige aceite explícito, e esse aceite fica registrado em seu nome.",
  ],
  relacionados: [
    "anexar-o-aso-no-exame",
    "concluir-o-cadastro-e-o-contrato",
    "abrir-o-prontuario-no-drive",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/auditoria/auditoria.service.ts",
  ],
  revisadoEm: "2026-09-28",
};
