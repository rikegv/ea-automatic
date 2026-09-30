import type { Artigo } from "../../tipos";

/**
 * N1 DO VALE-TRANSPORTE, LADO DO TIME: PEDIR O FORMULÁRIO À PESSOA.
 *
 * ┌─ O QUE A PESSOA PRECISA SABER ANTES DE CLICAR, E É O QUE MOTIVA O ARTIGO ────────────────────┐
 * │ O sistema GERA o link e NÃO ENVIA: ele não tem canal com o candidato. Quem manda é o time, pelo │
 * │ canal que já usa, e a solicitação fica registrada em nome de quem pediu. Sem essa frase, a      │
 * │ pessoa clica, vê "gerado" e vai esperar uma resposta que nunca vem, porque ninguém mandou nada. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A SEGUNDA METADE DO ARTIGO É O QUE ACONTECE DEPOIS, e ela é ASSÍNCRONA ─────────────────────┐
 * │ O candidato preenche numa tela de fora do sistema, e o arquivo é recolhido por uma VARREDURA    │
 * │ periódica, a cada 15 minutos (`INTERVALO_MS`, em `domain/scheduler-vt-coleta.ts`). Ela arquiva  │
 * │ o formulário na subpasta de benefícios do prontuário e, quando o formulário de vale-transporte  │
 * │ está na lista de documentos daquela admissão, DÁ BAIXA nele como entregue, com autor sistema     │
 * │ (`vt-coleta.service.ts`). Ninguém precisa lançar isso à mão, e ninguém precisa ficar recarregando│
 * │ a tela: o artigo diz o prazo para a espera ser informada em vez de ansiosa.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTA PEÇA NÃO COBRE ─────────────────────────────────────────────────────────────────┐
 * │ O PREENCHIMENTO pelo candidato, que é outro público. A manutenção da tabela de tarifas, que é o │
 * │ artigo irmão. E a gestão do pacote de benefícios, que tem artigos próprios.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E AQUI ELA VALE DOBRADO: o link do formulário é CREDENCIAL, e o relatório do pedido em lote
 * sai com nome, documento, link e validade, ou seja, é arquivo sensível saindo do sistema. O artigo
 * ensina a tratar os dois assim. Nenhum nome, documento, endereço ou trecho de link aparece aqui.
 *
 * IMAGEM: pendência conhecida. A tela mostra gente em toda linha, e a auditoria de segurança recusou
 * capturar tela com pessoa enquanto a homologação não tiver dado sintético.
 */
export const artigo: Artigo = {
  slug: "enviar-o-link-do-formulario-de-vt",
  titulo: "Enviar O Link Do Formulário De VT",
  modulo: "SOUL_ADM",
  rotas: ["/beneficios"],
  menus: ["beneficios-fila"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "vt-time",
  resumo:
    "Como pedir a uma pessoa, ou a várias de uma vez, que preencham o formulário de vale-transporte pelo celular, e o que o sistema faz sozinho quando o formulário chega.",
  termos: [
    "link do vt",
    "formulario de vt",
    "mandar o formulario de vale transporte",
    "solicitar vt",
    "pedir vt",
    "vt do candidato",
    "vale transporte do funcionario",
    "baixar links de vt",
    "novo vt",
    "mudou de endereco",
    "reenviar vt",
    "o candidato preencheu o vt",
  ],
  preRequisitos: [
    "A pessoa já precisa estar na fila de benefícios, que reúne quem fechou o cadastro e tem benefício a lançar.",
    "Ter o canal por onde você fala com ela. O sistema gera o link, o envio é seu.",
  ],
  passos: [
    {
      gesto: "Abra o menu Benefícios e ache a pessoa.",
      detalhe:
        "A busca e os filtros do topo recortam a fila por cliente, por quem tem e por quem não tem cada benefício.",
      controles: ["Benefícios", "Cliente", "Com o benefício", "Sem o benefício"],
    },
    {
      gesto: "Clique na célula da coluna VT, na linha da pessoa.",
      detalhe:
        "A coluna abre a janela Vale-Transporte. Quando ainda não há formulário, ela diz Esta pessoa ainda não enviou o formulário de vale-transporte.",
      controles: ["VT", "Ver o resumo do formulário", "Vale-Transporte"],
    },
    {
      gesto: "Clique em Solicitar Novo VT.",
      detalhe:
        "Vale para admissão em andamento e para admissão já concluída, porque o vale-transporte continua mudando depois da admissão: a pessoa muda de endereço, muda de linha, a passagem sobe. O pedido fica registrado em seu nome.",
      controles: ["Solicitar Novo VT"],
    },
    {
      gesto: "Copie o link que aparece e confira até quando ele vale.",
      detalhe:
        "O link aparece num campo de leitura, com o botão de copiar ao lado, e a linha abaixo diz quando ele expira. O sistema não manda o link: quem manda é você, pelo canal em que já fala com a pessoa.",
      controles: ["Link do formulário de VT", "Copiar", "Copiado", "Expira em", "Fechar"],
    },
    {
      gesto: "Trate o link como credencial: mande direto para a pessoa, e só para ela.",
      detalhe:
        "Quem tem o link abre o formulário daquela admissão. Por isso ele não vai para grupo, não vai para lista e não fica colado em planilha compartilhada. O link some da tela quando você fecha a janela, e gerar outro é barato.",
    },
    {
      gesto: "Para pedir a muitas pessoas de uma vez, marque as linhas e clique em Baixar Links De VT.",
      detalhe:
        "A marcação vale para a página filtrada, não para a fila inteira, e a barra que aparece diz quantas você marcou. O sistema gera os links, registra cada pedido e baixa um relatório com nome, documento, link e validade, para você disparar pelo canal do time.",
      controles: ["Baixar Links De VT", "selecionada(s) nesta página"],
    },
    {
      gesto: "Guarde o relatório baixado como arquivo sensível e apague depois de usar.",
      detalhe:
        "Ele sai com dado pessoal e com credencial de acesso na mesma linha. Não reencaminhe o arquivo inteiro para quem só precisa de uma linha dele.",
    },
    {
      gesto: "Depois que a pessoa preencher, espere a próxima varredura e confira a mesma célula.",
      detalhe:
        "O sistema recolhe o formulário em ciclos de cerca de quinze minutos, arquiva o arquivo no prontuário da pessoa e, quando o formulário de vale-transporte está na lista de documentos daquela admissão, dá baixa nele como entregue, sozinho. Não é na hora do envio, e não há nada a lançar à mão.",
    },
    {
      gesto: "Releia a janela do VT para conferir o que a pessoa declarou.",
      detalhe:
        "A janela passa a mostrar ida, volta, total do dia e o cartão informado, com o botão que abre o formulário arquivado. Quem não optou pelo benefício aparece dito com todas as letras. Havendo mais de um envio, a janela lista os anteriores, cada um abrindo o seu próprio documento.",
      controles: ["Ver Formulário", "Ida", "Volta", "Dia", "Envios Anteriores", "Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela respondeu Não foi possível gerar o link.",
      acao: "O pedido não completou e nenhum link foi criado. Feche a janela, recarregue a página e tente de novo. Se repetir, avise a administração.",
    },
    {
      sintoma: "A tela respondeu Não foi possível gerar os links.",
      acao: "O pedido em lote não completou e nenhum relatório foi baixado. Tente com menos pessoas marcadas e, se repetir, faça uma a uma pela janela do VT.",
    },
    {
      sintoma: "O aviso diz que alguns links foram gerados e lista quem ficou sem.",
      acao: "O relatório traz só quem recebeu link. Confira, uma por uma, as pessoas listadas no aviso: normalmente falta na admissão delas alguma informação que o formulário precisa. Depois de resolver, marque só essas linhas e peça de novo.",
    },
    {
      sintoma: "A janela do VT diz que o arquivo do formulário ainda não foi arquivado no Drive.",
      acao: "Os valores já chegaram, o arquivo ainda não terminou de ser guardado. Confira de novo mais tarde antes de pedir para a pessoa preencher outra vez.",
    },
    {
      sintoma:
        "A janela diz que o formulário foi recebido e arquivado, mas os valores preenchidos não chegaram ao sistema.",
      acao: "Abra o formulário pelo botão da janela e confira ali o que a pessoa declarou. O documento está guardado: o que faltou foi o resumo em tela.",
    },
    {
      sintoma: "A pessoa mudou de endereço e o VT dela está velho.",
      acao: "Peça um novo pela mesma janela, em Solicitar Novo VT. O envio anterior não é apagado: ele passa para a lista de envios anteriores, e cada um continua abrindo o seu próprio documento.",
    },
    {
      sintoma: "Perdi o link antes de mandar para a pessoa.",
      acao: "O link some da tela quando a janela fecha, de propósito. Peça outro pelo mesmo botão.",
    },
    {
      sintoma: "A janela não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Fechar, no rodapé, ou pela tecla Esc.",
    },
  ],
  regras: [
    "O sistema gera o link e não envia: o envio é do time, pelo canal que já fala com a pessoa.",
    "Cada pedido feito por esta tela fica registrado com o nome de quem pediu.",
    "O link é credencial de acesso ao formulário daquela admissão: vai direto para a pessoa, nunca para grupo ou lista.",
    "O link tem prazo de validade, e a própria janela diz até quando ele vale.",
    "Solicitar vale para admissão em andamento e para admissão concluída: o vale-transporte continua mudando depois da admissão.",
    "O formulário é recolhido por uma varredura periódica, não no instante do envio.",
    "Quando o formulário de vale-transporte está na lista de documentos da admissão, a varredura dá baixa nele sozinha, como entregue.",
    "Cada envio fica guardado: o novo não apaga o anterior, e cada declaração abre o seu próprio documento.",
    "O relatório do pedido em lote carrega dado pessoal e link de acesso: é arquivo sensível e se apaga depois de usar.",
    "A marcação em lote vale para a página filtrada, não para a fila inteira.",
  ],
  relacionados: [
    "manter-as-tarifas-de-transporte",
    "montar-o-pacote-de-beneficios",
    "marcar-o-beneficio-como-cadastrado",
    "ler-a-regua-obrigatoria-da-admissao",
    "abrir-o-prontuario-no-drive",
    "filtrar-uma-lista",
    "agir-em-varias-linhas-de-uma-vez",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/beneficios/page.tsx",
    "apps/backend/src/vt-coleta/solicitacao-vt.service.ts",
    "apps/backend/src/vt-coleta/vt-coleta.service.ts",
    "apps/backend/src/domain/scheduler-vt-coleta.ts",
  ],
  revisadoEm: "2026-09-30",
};
