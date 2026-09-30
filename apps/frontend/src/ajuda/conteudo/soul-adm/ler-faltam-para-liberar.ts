import type { Artigo } from "../../tipos";

/**
 * N1 DA LIBERAÇÃO: A LEITURA DO BLOCO QUE TRAVA O BOTÃO.
 *
 * ┌─ UMA PRECISÃO DE ONDE ISSO MORA, para o texto não mandar ninguém procurar no lugar errado ────┐
 * │ "Faltam Para Liberar" NÃO é coluna da tabela: é um BLOCO vermelho DENTRO da janela de liberação, │
 * │ acima do rodapé, e a fila não tem coluna equivalente. O passo 1 diz isso na primeira linha, e o  │
 * │ resumo também, porque quem lê o título procura na tabela e não acha.                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÃO DUAS LISTAS VERMELHAS NA MESMA JANELA, E ESTE ARTIGO É SÓ SOBRE UMA ────────────────────┐
 * │ "Informações Que Faltam" é a régua de PENDÊNCIA da admissão: ela não trava nada, é configurável │
 * │ por cliente e troca de item em admissão de banco. "Faltam Para Liberar" é o conjunto FIXO de    │
 * │ seis campos que trava o botão. Rótulos quase iguais, consequências opostas, e é essa confusão   │
 * │ que produz o chamado de "está tudo bloqueado" e o de "nada está bloqueado", os dois.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ACHADO QUE O ARTIGO EXISTE PARA ENTREGAR, e ele foi medido no código da tela ─────────────┐
 * │ O bloco só é DESENHADO depois que a base da liberação está satisfeita (cliente, cargo, resposta │
 * │ do uniforme, CPF com dígito válido, o contrato do cliente quando há mais de um e o projeto de   │
 * │ Alto Volume quando ligado). Enquanto falta algo dessa base, o botão fica apagado e o bloco NÃO  │
 * │ aparece, o que parece defeito. O passo 5 e o primeiro item de erro cobrem exatamente esse caso. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO ENSINA A LIBERAR: o caminho completo é `liberar-uma-admissao`. Aqui só se lê o bloco.
 * IMAGEM É PENDÊNCIA CONHECIDA: a janela mostra pessoa, e a captura fica suspensa até a homologação
 * ter dado sintético. O texto foi escrito para funcionar sem imagem.
 *
 * §A.6: nenhum dado de pessoa, só rótulo de campo.
 */
export const artigo: Artigo = {
  slug: "ler-faltam-para-liberar",
  titulo: "Ler A Coluna Faltam Para Liberar",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "liberacao",
  resumo:
    "Como ler o bloco vermelho Faltam Para Liberar, que fica dentro da janela de liberação: quais são os seis campos que travam o botão, por que a lista encolhe sozinha e como ela se distingue das pendências que não travam.",
  termos: [
    "faltam para liberar",
    "nao consigo liberar",
    "botao liberar apagado",
    "botao liberar desabilitado",
    "campos que travam",
    "campos obrigatorios da liberacao",
    "por que nao libera",
    "esta tudo vermelho",
    "informacoes que faltam",
    "pendencia que nao trava",
  ],
  preRequisitos: [
    "Ter a janela de liberação de alguém aberta: o bloco vive dentro dela, e não na tabela da fila.",
  ],
  passos: [
    {
      gesto: "Abra a janela de liberação de uma pessoa da fila.",
      detalhe:
        "O bloco Faltam Para Liberar fica no fim da janela, logo acima da linha dos botões. Ele não existe na tabela da fila: é preciso abrir a pessoa para vê-lo.",
      controles: ["Liberar Admissão", "Faltam Para Liberar"],
    },
    {
      gesto: "Leia as etiquetas vermelhas do bloco: cada uma é um campo ainda vazio.",
      detalhe:
        "O conjunto é fixo e tem seis itens: Cargo, Sexo, Tipo de contrato, Data de admissão, Pacote de benefícios e Escala. Nenhum outro campo da janela entra aqui.",
      controles: [
        "Cargo",
        "Sexo",
        "Tipo de contrato",
        "Data de admissão",
        "Pacote de benefícios",
        "Escala",
      ],
    },
    {
      gesto: "Preencha um campo e veja a etiqueta dele sair da lista.",
      detalhe:
        "A lista é recalculada a cada preenchimento, ali mesmo, sem salvar e sem recarregar. Zerada a lista, o bloco desaparece e o botão Liberar acende.",
      controles: ["Liberar"],
    },
    {
      gesto: "Não confunda com o bloco Informações Que Faltam, no topo da mesma janela.",
      detalhe:
        "Aquele é a régua de pendências da admissão e não trava nada: o que sobrar dele segue como pendência na esteira. Ele também muda de cliente para cliente, porque a diretoria escolhe quais itens cada cliente exige, e em admissão de banco ele cobra o Termo de Banco no lugar da data de admissão.",
      controles: ["Informações Que Faltam", "Termo de Banco"],
    },
    {
      gesto: "Não aparecendo bloco nenhum e o botão continuando apagado, olhe a base da janela.",
      detalhe:
        "O bloco só é desenhado depois que o básico está resolvido: cliente, cargo, a resposta do uniforme, o CPF com dígito válido, o contrato do cliente quando o cliente tem mais de um e o projeto quando o Alto Volume está ligado. Faltando um desses, o botão fica apagado e a lista dos seis nem é mostrada.",
      controles: ["Cliente", "Possui uniforme?", "Contrato do cliente"],
    },
    {
      gesto: "Leia a frase do pé do bloco: ela muda conforme o seu papel.",
      detalhe:
        "Para consultor comum ela diz para preencher todos. Para Master e Super Admin ela diz que dá para liberar assim mesmo, pelo botão de aceite ao lado do Liberar, e que o que faltar segue como pendência na esteira.",
      controles: ["Liberar mesmo com campos faltando"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão Liberar está apagado e o bloco Faltam Para Liberar não aparece.",
      acao: "Falta algo da base, e não dos seis. Confira, nesta ordem: cliente e cargo escolhidos, a pergunta do uniforme respondida, o item do EPI descrito quando você marcou Outros, o contrato do cliente escolhido se o campo existir, e o projeto se o Alto Volume estiver ligado. Resolvida a base, o bloco aparece e passa a dizer o que ainda falta.",
    },
    {
      sintoma: "Preenchi um campo e a etiqueta dele não saiu da lista.",
      acao: "O campo provavelmente não é o mesmo da etiqueta. Salário, Setor, Departamento, Centro de custo, Loja e Gestor não estão entre os seis: eles aparecem no outro bloco, o das pendências, e não travam nada.",
    },
    {
      sintoma: "Cargo aparece na lista dos seis e eu não consigo passar adiante de jeito nenhum.",
      acao: "Cargo é trava dura, não relaxável por aceite: sem cliente e cargo não existe régua de documentos a montar. Escolha o cargo no seletor da janela.",
    },
    {
      sintoma: "Um cliente cobra um item que outro não cobra, e parece inconsistência.",
      acao: "É o bloco de pendências, não o dos seis. A diretoria configura quais itens cada cliente exige, então dois clientes mostram listas diferentes de propósito. Os seis que travam a liberação são iguais para todo mundo.",
    },
    {
      sintoma: "A lista dos seis pede Data de admissão e essa admissão é de banco.",
      acao: "Admissão de banco não tem data ainda, e o bloco das pendências entende isso, trocando a data pelo Termo de Banco. O bloco dos seis não: ali a data continua sendo cobrada. Sem a data, a liberação depende do aceite de Master ou Super Admin.",
    },
  ],
  regras: [
    "São seis campos que travam o botão Liberar, iguais para todo cliente: Cargo, Sexo, Tipo de contrato, Data de admissão, Pacote de benefícios e Escala.",
    "A lista é recalculada ao vivo: preencher o campo tira a etiqueta na hora, sem salvar.",
    "O bloco só é desenhado quando o básico da liberação já está resolvido. Botão apagado sem bloco é falta de base, não falta dos seis.",
    "Informações Que Faltam é outra lista: ela não trava nada, varia por cliente e troca a data de admissão pelo Termo de Banco em admissão de banco.",
    "Master e Super Admin liberam com faltante nos seis, por um botão de aceite à parte, e o que faltar segue como pendência da admissão na esteira.",
    "Consultor comum não tem esse caminho: para ele os seis são obrigatórios.",
  ],
  relacionados: [
    "liberar-uma-admissao",
    "vincular-a-pre-admissao-a-sala-de-espera",
    "os-filtros-e-os-cards-da-fila-de-liberacao",
    "informar-o-uniforme-e-o-epi-na-liberacao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "ler-a-regua-obrigatoria-da-admissao",
    "salvar-com-campo-obrigatorio-vazio",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/domain/admissao.ts",
    "apps/backend/src/domain/pendencia-config.ts",
  ],
  revisadoEm: "2026-09-30",
};
