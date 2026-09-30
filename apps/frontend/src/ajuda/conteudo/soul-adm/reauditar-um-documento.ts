import type { Artigo } from "../../tipos";

/**
 * ─ REAUDITAR: pedir nova análise do arquivo que JÁ chegou ───────────────────────────────────────
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E O QUE O ARTIGO IRMÃO JÁ DIZIA ────────────────────────────────────┐
 * │ O N1 da aba ("auditar-os-documentos-da-admissao") cita Reauditar UMA vez, no bloco de erro do   │
 * │ documento travado, e o cabeçalho dele diz por que: ali o botão não é recurso avançado, é o      │
 * │ conserto do sintoma que a própria tela manda consertar. O que aquele artigo não faz é ENSINAR    │
 * │ o controle: quando usar fora do caso travado, que a análise vale para qualquer estado, o que    │
 * │ acontece na tela enquanto roda, e o que o sistema pergunta quando o documento já foi assumido   │
 * │ por uma pessoa. É esse o recorte daqui.                                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE ───────────────────────────────────────────────────┐
 * │ AS REGRAS DE APROVAÇÃO da inteligência artificial (por que ela aceita ou recusa um documento)   │
 * │ não estão aqui, e não é omissão: o artigo ensina a PEDIR a nova leitura, não a prever o         │
 * │ resultado dela. Assumir o documento como válido e reabrir a pendência são as duas saídas        │
 * │ vizinhas e têm peça própria, cada uma apontada em Relacionados.                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO ─────────────────────────────────────────┐
 * │ A captura desta janela está vetada pela auditoria de segurança enquanto a homologação não    │
 * │ tiver arnês sintético (a tela mostra documento de pessoa). O texto foi escrito para funcionar │
 * │ sem imagem, e os prints entram em entrega própria.                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS `controles` SAÍRAM LETRA POR LETRA de `AuditoriaDocsModal.tsx`: o botão é só ícone, então o
 * rótulo declarado é o nome acessível ("Reauditar documento"); "Parado há" é a parte FIXA do
 * marcador, que monta a frase com o tempo na frente; e "Processando…" é o que o botão de envio da
 * MESMA linha passa a exibir enquanto a análise roda. §A.6: o aviso de documento já assumido carrega
 * o NOME de quem assumiu, então aqui se descreve o aviso e se cita só a pergunta final, que é fixa.
 */
export const artigo: Artigo = {
  slug: "reauditar-um-documento",
  titulo: "Reauditar Um Documento",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como pedir que a inteligência artificial leia de novo um documento que já chegou, sem exigir novo envio do candidato, e o que a tela mostra enquanto essa leitura acontece.",
  termos: [
    "reauditar",
    "reanalisar",
    "analisar de novo",
    "passar de novo",
    "rodar de novo",
    "a IA travou",
    "documento parado",
    "parado ha",
    "aguardando auditoria",
    "ia nao leu",
    "ia errou",
    "documento sem veredito",
    "sem resposta da ia",
    "auditoria travada",
    "tentar de novo",
  ],
  preRequisitos: [
    "O documento já precisa ter chegado: a nova análise usa o arquivo que o sistema recebeu, e não pede nada ao candidato.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional pelo menu da lateral esquerda.",
      controles: ["Esteira Admissional"],
    },
    {
      gesto: "Na aba Auditoria, ache a pessoa e clique em Auditar, na coluna Avanço / Auditoria.",
      controles: ["AUDITORIA", "Avanço / Auditoria", "Auditar"],
    },
    {
      gesto:
        "Procure na linha do documento o aviso de tempo parado, escrito como Parado há e o tempo.",
      detalhe:
        "Ele aparece só quando a leitura passou do tempo esperado, e o aviso da tela diz, letra por letra: Auditoria parada além do esperado. Use Reauditar; se insistir, avise a TI. Sem esse aviso, documento sem veredito normalmente é documento que ninguém mandou, e aí a saída é cobrar o envio, não reauditar.",
      controles: ["Parado há", "Aguardando auditoria"],
    },
    {
      gesto: "Clique na seta circular da linha, o Reauditar documento.",
      detalhe:
        "Ela pede nova leitura do arquivo que já está no sistema, sem novo envio. Vale para qualquer situação do documento, inclusive um já aprovado: quem decide que a leitura precisa ser refeita é você.",
      controles: ["Reauditar documento"],
    },
    {
      gesto: "Espere o fim da análise sem fechar a janela.",
      detalhe:
        "Enquanto roda, o botão de envio daquela linha mostra Processando e os demais controles da linha ficam desligados. A janela inteira continua utilizável para os outros documentos.",
      controles: ["Processando…"],
    },
    {
      gesto: "Leia a etiqueta e o motivo que voltaram na linha.",
      detalhe:
        "O resultado novo substitui o anterior, inclusive uma aprovação. A barra de progresso no alto da janela se ajusta na mesma hora, porque a régua obrigatória mudou.",
      controles: ["Validado", "Inconforme", "Pendente", "obrigatórios validados"],
    },
    {
      gesto:
        "Se o sistema perguntar antes de reanalisar, decida se mantém o que uma pessoa já tinha assumido.",
      detalhe:
        "Documento assumido como válido por alguém do time não é sobrescrito em silêncio: a pergunta traz o nome de quem assumiu e termina com Deseja reanalisar mesmo assim? Confirmando, a leitura roda e pode derrubar aquela decisão. Recusando, nada acontece.",
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "Aparece: Não há arquivo disponível para reauditar este documento. Anexe o arquivo novamente.",
      acao: "Não existe mais arquivo guardado daquele documento: ele é descartado quando a régua fecha e vale por 48 horas. Não há o que reanalisar, então o caminho é enviar o arquivo de novo pelo botão de envio da própria linha.",
    },
    {
      sintoma:
        "Aparece: Falha de rede ao reauditar o documento. Verifique a conexão e tente de novo.",
      acao: "O pedido não chegou ao sistema, e nenhum veredito foi alterado. Clique de novo. Se repetir, confira a conexão e avise a TI.",
    },
    {
      sintoma:
        "A tela recusa dizendo que o contrato já foi enviado para assinatura, ou que já foi assinado, ou que o kit está na fila de assinatura.",
      acao: "Nova análise pode reprovar um documento que já estava aprovado, e isso mexeria no pacote que sustenta um contrato vivo. Resolva a assinatura primeiro: cancele o envelope na Gestão Das Assinaturas, ou tire o kit da fila, e só então reaudite. Contrato já assinado se corrige pelo reenvio por correção.",
    },
    {
      sintoma: "Reauditei e voltou o mesmo resultado de antes.",
      acao: "A leitura é do mesmo arquivo, então repetir sem mudar nada tende a repetir o veredito. Quando a causa estava fora do documento (um dado do cadastro do candidato escrito errado, por exemplo), corrija a causa primeiro e reaudite depois. Quando o documento está certo e a leitura insiste em recusar, a saída é assumir o documento como válido.",
    },
    {
      sintoma: "Reauditei um documento que estava aprovado e ele voltou reprovado.",
      acao: "É o efeito esperado: o resultado novo substitui o anterior. Se aquele era o último obrigatório aceito, a frente de Auditoria volta a ficar pendente e o Cadastro, se já estava aberto, fecha junto. A saída é enviar o arquivo correto ou assumir o documento como válido.",
    },
  ],
  regras: [
    "A nova análise usa o arquivo que já chegou. Ela não pede nada ao candidato e não gasta tentativa dele no Portal.",
    "Vale para qualquer situação do documento, inclusive um já aprovado: quem decide que a leitura precisa ser refeita é o time, não o sistema.",
    "O resultado novo substitui o anterior, para melhor ou para pior, e a régua obrigatória é recalculada na mesma hora.",
    "Documento assumido como válido por uma pessoa só é reanalisado com aceite explícito de quem clicou, e o aviso mostra quem tinha assumido.",
    "Quando não há mais arquivo guardado, o sistema tenta buscar de novo na origem do candidato; não achando, ele avisa e pede novo envio em vez de fingir que analisou.",
    "Com contrato já enviado para assinatura, já assinado, ou com o kit na fila, a nova análise é recusada: primeiro se resolve a assinatura.",
    "O aviso de tempo parado aparece só depois de a leitura passar do tempo esperado, e ele existe para separar falha de sistema de documento que simplesmente não foi enviado.",
  ],
  relacionados: [
    "auditar-os-documentos-da-admissao",
    "visualizar-um-documento-da-admissao",
    "assumir-um-documento-como-valido",
    "reabrir-a-pendencia-de-um-documento",
    "ler-a-regua-obrigatoria-da-admissao",
    "concluir-o-cadastro-e-o-contrato",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx",
    "apps/frontend/src/lib/parado.ts",
    "apps/backend/src/reauditoria/reauditoria.service.ts",
    "apps/backend/src/domain/auditoria-parada.ts",
    "apps/backend/src/domain/reabertura-documento.ts",
  ],
  revisadoEm: "2026-09-30",
};
