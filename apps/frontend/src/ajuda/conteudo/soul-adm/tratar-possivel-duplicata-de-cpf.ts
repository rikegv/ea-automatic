import type { Artigo } from "../../tipos";

/**
 * N1 DA LIBERAÇÃO: OS DOIS AVISOS DE CPF, QUE PARECEM IGUAIS E NÃO SÃO.
 *
 * ┌─ A DISTINÇÃO QUE O ARTIGO EXISTE PARA FIXAR ──────────────────────────────────────────────────┐
 * │ 1. POSSÍVEL DUPLICATA (amarelo): é PERGUNTA. O CPF tem outra admissão viva, e candidato PODE   │
 * │    ter mais de uma. O sistema mostra quais são e DEVOLVE a decisão a quem opera, que segue com │
 * │    um aceite explícito.                                                                        │
 * │ 2. CPF INVÁLIDO (vermelho): é BLOQUEIO. O dígito verificador não fecha, então o número está    │
 * │    errado desde a origem, e nem aceite resolve: alguém precisa corrigir o número.              │
 * │ Tratar o amarelo como erro faz o time recusar readmissão legítima; tratar o vermelho como      │
 * │ pergunta faz o time procurar um botão de confirmar que não existe.                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS DOIS AVISOS APARECEM EM TRÊS LUGARES DIFERENTES, e o artigo cobre os três ────────────────┐
 * │ a etiqueta na LINHA da fila (só a duplicata), o bloco dentro da JANELA de liberação (os dois) e │
 * │ a lista nominal dentro da janela do LOTE (os dois, tirando a pessoa do lote). É a mesma regra   │
 * │ vista de três alturas, e quem só conhece uma delas acha que as outras são outro assunto.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA CORREÇÃO DE PREMISSA QUE VALE ESCREVER, medida no serviço da liberação ──────────────────┐
 * │ A etiqueta da LINHA é uma foto tirada na entrada do candidato; o aviso da JANELA é consultado   │
 * │ na hora de liberar. Por isso existe linha SEM etiqueta que mostra o aviso ao liberar, e é       │
 * │ comportamento correto, não defeito: a segunda admissão pode ter nascido depois da foto.         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO COBRE o reaproveitamento de candidato pelo cadastro, que tem artigo próprio: lá o CPF conhecido
 * OFERECE trazer os dados de volta; aqui ele PERGUNTA se não é duplicata. São telas e propósitos
 * diferentes, e o artigo aponta em vez de repetir.
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: os três lugares mostram pessoa e CPF, então a captura fica suspensa
 * enquanto a homologação não tiver dado sintético. O texto foi escrito para funcionar sem imagem.
 *
 * §A.6: nenhum CPF, nome ou número de exemplo aparece aqui. Só o nome dos campos e das etiquetas.
 */
export const artigo: Artigo = {
  slug: "tratar-possivel-duplicata-de-cpf",
  titulo: "Tratar Possível Duplicata De CPF",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "liberacao",
  resumo:
    "Os dois avisos de CPF da Liberação: o de possível duplicata, que é pergunta e segue com aceite, e o de CPF inválido, que é bloqueio e só sai com a correção do número.",
  termos: [
    "cpf repetido",
    "cpf duplicado",
    "ja existe esse candidato",
    "possivel duplicata",
    "duplicidade",
    "candidato repetido",
    "mesma pessoa duas vezes",
    "cpf invalido",
    "documento invalido",
    "digito verificador",
    "cpf errado",
    "corrigir cpf",
    "readmissao",
    "segunda vaga",
  ],
  preRequisitos: [
    "Ter o documento do candidato em mãos quando o aviso for de CPF inválido: o número precisa ser conferido na origem, não adivinhado.",
  ],
  passos: [
    {
      gesto: "Repare na etiqueta Possível duplicata, ao lado do nome, ainda na fila.",
      detalhe:
        "Ela avisa que já existe admissão viva com aquele CPF. Passando o ponteiro sobre ela, o próprio sistema explica o que ela quer dizer.",
      controles: ["Possível duplicata"],
    },
    {
      gesto: "Abra a pessoa e leia o bloco Possível Duplicata De CPF, no fim da janela.",
      detalhe:
        "O bloco amarelo lista as admissões vivas daquele CPF, uma por linha, com o cliente, o cargo e a situação de cada uma. É com essa lista que se decide, e é ela que a etiqueta da fila não mostra.",
      controles: ["Possível Duplicata De CPF"],
    },
    {
      gesto: "Decida: é a mesma pessoa numa vaga nova, ou é registro repetido?",
      detalhe:
        "Uma pessoa pode ter mais de uma admissão, em clientes diferentes ou em momentos diferentes, e isso é caso normal. Registro repetido é quando a mesma vaga entrou duas vezes.",
    },
    {
      gesto: "Sendo vaga nova, clique em Confirmar e liberar.",
      detalhe:
        "O botão troca de nome quando o aviso está na tela: em vez de Liberar, ele passa a pedir a confirmação. Confirmando, a liberação segue normalmente e a admissão entra na esteira.",
      controles: ["Confirmar e liberar", "Confirmar e liberar mesmo com campos faltando"],
    },
    {
      gesto: "Sendo registro repetido, cancele e recuse a pré-admissão.",
      detalhe:
        "Recusar tira a pessoa da fila sem apagar nada: ela fica na aba Admissões Recusadas. A recusa é restrita a Master e Super Admin.",
      controles: ["Cancelar", "Recusar", "Admissões Recusadas"],
    },
    {
      gesto: "Sendo o aviso o de CPF Inválido, pare: aqui não há o que confirmar.",
      detalhe:
        "O bloco vermelho diz que o dígito verificador não fecha. Não existe aceite para isso, nem para Master: a liberação fica bloqueada até o número ser corrigido, individualmente ou em lote.",
      controles: ["CPF Inválido"],
    },
    {
      gesto: "Peça a correção do número a um Master ou Super Admin.",
      detalhe:
        "A correção é feita na ficha da admissão, no bloco Correções, pelo botão Corrigir CPF, e fica registrada no histórico com o nome de quem corrigiu. Só Master e Super Admin veem esse botão.",
      controles: ["Correções", "Corrigir CPF", "CPF correto"],
    },
    {
      gesto: "No lote, leia a lista nominal dos que ficaram de fora.",
      detalhe:
        "A janela do lote separa em dois blocos quem não vai ser liberado em massa: os de possível duplicata e os de CPF inválido, cada um com os nomes. Os demais selecionados seguem normalmente, e essas pessoas continuam na fila para tratamento um a um.",
      controles: ["Liberar selecionadas"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A tela responde: Já existe uma admissão em andamento para este CPF. Confirme que não é duplicata antes de liberar.",
      acao: "É a pergunta, não um erro. Leia no bloco amarelo quais são as admissões vivas e decida: vaga nova segue por Confirmar e liberar, registro repetido sai por Cancelar mais Recusar.",
    },
    {
      sintoma:
        "A tela responde: Já existem N admissões em andamento para este CPF. Confirme que não é duplicata antes de liberar.",
      acao: "Mesma pergunta, com mais de uma admissão viva. O bloco lista todas com cliente, cargo e situação. Havendo uma que é claramente o mesmo processo desta, o caso é de recusar esta e seguir com a que já está andando.",
    },
    {
      sintoma:
        "A tela responde: CPF inválido: o dígito verificador não fecha. Corrija o CPF antes de liberar esta admissão.",
      acao: "O número está errado na origem. Confira o documento do candidato e peça a correção a um Master ou Super Admin, pelo botão Corrigir CPF da ficha. Sem isso, essa pessoa não é liberada nem sozinha nem em lote.",
    },
    {
      sintoma:
        "O lote respondeu: Possível duplicata: precisa ser liberada individualmente, não em massa.",
      acao: "É regra, não falha: a decisão sobre duplicata é de uma pessoa olhando o caso, então ela nunca é tomada em massa. Libere essa pré-admissão pelo botão da linha dela.",
    },
    {
      sintoma: "A linha não tinha etiqueta de duplicata e o aviso apareceu só ao liberar.",
      acao: "Está correto. A etiqueta da fila é uma foto do momento em que o candidato entrou; o aviso da janela é consultado na hora de liberar. A segunda admissão pode ter nascido depois da foto, e quem manda é a consulta de agora.",
    },
    {
      sintoma: "Confirmei que não era duplicata e quero voltar atrás.",
      acao: "A admissão já entrou na esteira. Ela não volta para a fila da Liberação: encontre-a no Gerenciador e, tratando-se de registro repetido, registre o declínio dela ali.",
    },
    {
      sintoma: "O aviso amarelo não aparece e eu sei que essa pessoa já tem admissão.",
      acao: "A pergunta só considera admissão VIVA. Admissão já concluída, declinada ou com rescisão é histórico, e readmitir alguém é o comportamento esperado: por isso ela não gera aviso.",
    },
  ],
  regras: [
    "Possível duplicata é pergunta: o sistema mostra as admissões vivas daquele CPF e a decisão fica com quem opera.",
    "A mesma pessoa pode ter mais de uma admissão. Só conta como duplicata o mesmo processo entrando duas vezes.",
    "Só admissão VIVA gera a pergunta. Concluída, declinada ou com rescisão é histórico e não avisa nada.",
    "CPF inválido é bloqueio, e não tem aceite: nem Master libera com o dígito quebrado.",
    "A correção do CPF é restrita a Master e Super Admin, e fica registrada com o nome de quem corrigiu.",
    "No lote, quem tem possível duplicata e quem tem CPF inválido fica de fora, nominalmente, e continua na fila para tratamento individual.",
    "A etiqueta da fila é uma foto da entrada do candidato; o aviso da janela é consultado no instante de liberar. Divergir entre as duas é esperado.",
    "Recusar não apaga: a pessoa fica na aba Admissões Recusadas.",
  ],
  relacionados: [
    "liberar-uma-admissao",
    "liberar-em-lote",
    "recusar-uma-admissao-na-liberacao",
    "reaproveitar-um-candidato-pelo-cpf",
    "ler-faltam-para-liberar",
    "ler-a-ficha-da-admissao",
    "achar-uma-admissao-no-gerenciador",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/frontend/src/components/esteira/AdmissaoDetalheModal.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
