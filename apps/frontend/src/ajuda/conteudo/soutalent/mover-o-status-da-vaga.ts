import type { Artigo } from "../../tipos";

/**
 * ─ MOVER O STATUS DA VAGA: o caminho para os status que a administração cadastrou ───────────────
 *
 * O QUE ESTA PEÇA COBRE: onde fica o gesto, como escolher o destino, a observação que vai para o
 * histórico, e por que o destino que a pessoa procura pode não estar na lista.
 *
 * ┌─ O CORAÇÃO DO ARTIGO É UMA DISTINÇÃO, E NÃO UM PASSO A PASSO ────────────────────────────────┐
 * │ Este caminho NÃO ENCERRA VAGA, e é isso que a pessoa precisa entender antes de usá-lo. Quem  │
 * │ encerra são FECHAR e CANCELAR, que conferem candidato pendente e posição preenchida. O texto  │
 * │ diz isso três vezes de propósito (no resumo, no primeiro passo e nas regras), porque o gesto  │
 * │ parece um atalho para qualquer estado e não é: a lista de destinos exclui tudo o que encerra. │
 * │ Fechar e cancelar entram por `relacionados`, e o passo a passo deles mora lá.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA **NÃO** COBRE ────────────────────────────────────────────────────────────────────┐
 * │ PUBLICAR RASCUNHO não acontece por aqui (o gesto nem aparece na vaga em rascunho), e o        │
 * │ caminho é a trilha de abertura: artigo próprio. REABRIR também não, porque desfazer um        │
 * │ encerramento tem régua e permissão próprias: artigo próprio. E o CADASTRO dos status, que é a │
 * │ tela da administração, é assunto de outro módulo.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa atravessa esta janela. A observação é texto de processo, e o texto diz
 * isso no passo em que ela é escrita. NENHUM print é declarado: a captura da superfície de A&S está
 * vetada pela auditoria, e o texto foi escrito para funcionar sem imagem.
 */
export const artigo: Artigo = {
  slug: "mover-o-status-da-vaga",
  titulo: "Mover O Status Da Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-vagas",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como levar a vaga para outro status da lista cadastrada, com o motivo registrado no histórico, e por que este caminho não encerra a vaga.",
  termos: [
    "mudar status da vaga",
    "trocar status",
    "stand by",
    "pausar vaga",
    "colocar vaga em espera",
    "mover vaga",
    "status da vaga",
    "suspender vaga",
  ],
  preRequisitos: [
    "A vaga precisa estar viva. Vaga fechada e vaga cancelada não mudam de status por aqui.",
    "A vaga não pode estar em rascunho: rascunho sai da fila publicando pela trilha de abertura.",
  ],
  passos: [
    {
      gesto: "Abra a gestão da vaga pela linha dela, na Central De Vagas.",
      detalhe:
        "O gesto de mover fica no topo do painel, colado na pill que mostra o status atual, e não na barra das abas.",
    },
    {
      gesto: "Clique em Mover status, ao lado da pill de status.",
      detalhe:
        "Ele só aparece onde tem o que fazer: na vaga encerrada e na vaga em rascunho o botão não existe.",
      controles: ["Mover status"],
    },
    {
      gesto: "Escolha o novo status na lista.",
      detalhe:
        "A lista traz só os status que aceitam movimento manual, e nunca o status em que a vaga já está. Nenhum destino que encerra a vaga aparece ali.",
      controles: ["Mover Status Da Vaga", "Novo status", "Escolher o novo status"],
    },
    {
      gesto: "Escreva por que a vaga está sendo movida.",
      detalhe:
        "O campo é opcional e aceita até 500 caracteres. O que você escrever vai inteiro para o histórico da vaga. Quem moveu e quando ficam registrados sozinhos, mesmo sem texto.",
      controles: ["Por que a vaga está sendo movida"],
    },
    {
      gesto: "Clique em Mover status para salvar.",
      detalhe:
        "A pill do topo passa a mostrar o status novo, e a linha da lista acompanha. A vaga continua viva e continua recebendo candidato, se o status escolhido permitir.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão Mover status não aparece no topo do painel.",
      acao: "Ele não existe na vaga encerrada nem na vaga em rascunho. Vaga fechada ou cancelada não muda de status por aqui, e rascunho sai da fila publicando pela trilha de abertura.",
    },
    {
      sintoma:
        "A janela diz que não há para onde mover esta vaga, porque nenhum outro status aceita movimento manual.",
      acao: "Quem cadastra essa lista é a administração, na tela de Status Da Vaga. Peça a inclusão do status que você precisa, marcado como movível manualmente.",
    },
    {
      sintoma: "O status que eu procuro não está na lista.",
      acao: "Três coisas ficam sempre fora: os status que encerram a vaga (para encerrar, use fechar vaga ou cancelar vaga), os que estão fora de circulação, e o próprio status em que a vaga já está.",
    },
    {
      sintoma: "A tela mostra A vaga já está neste status. Recarregue a página.",
      acao: "Alguém moveu a vaga enquanto a janela estava aberta, ou o clique foi duplo. Recarregue a página e confira a pill de status antes de tentar de novo.",
    },
    {
      sintoma:
        "A tela mostra Esta vaga já foi encerrada e o status dela não muda mais por aqui. Recarregue a página.",
      acao: "A vaga foi fechada ou cancelada enquanto você preenchia. Para trazer uma vaga cancelada de volta ao trabalho, o caminho é reabrir a vaga.",
    },
    {
      sintoma:
        "A tela mostra O rascunho é publicado pela trilha de abertura, que confere os campos obrigatórios.",
      acao: "Rascunho não é publicado por este caminho, e isso é proposital: a cobrança dos campos obrigatórios só existe na trilha. Use continuar rascunho na barra da vaga.",
    },
    {
      sintoma:
        "A tela diz que a vaga veio do Pandapé e está pendente de revisão.",
      acao: "Essa vaga sai da fila pela liberação, que confere o cliente vinculado. Mover o status não substitui a revisão.",
    },
    {
      sintoma: "A tela mostra Este status não existe. Recarregue a página.",
      acao: "A lista da sua tela está velha, porque a administração mexeu no cadastro de status. Recarregue a página e escolha de novo.",
    },
    {
      sintoma: "A tela mostra Não foi possível mover o status da vaga.",
      acao: "A gravação não voltou. Tente de novo. Se repetir, recarregue a página e confira se a sua sessão continua aberta.",
    },
  ],
  regras: [
    "Mover o status não encerra a vaga. Fechar e cancelar continuam sendo as únicas portas para isso, e são elas que conferem os candidatos pendentes e as posições preenchidas.",
    "A lista de destinos traz só o que aceita movimento manual, e nunca o status atual da vaga.",
    "Vaga em rascunho não sai por aqui: ela é publicada pela trilha de abertura, que cobra os campos obrigatórios.",
    "Vaga encerrada não sai por aqui: desfazer um encerramento é reabrir a vaga, com permissão e régua próprias.",
    "Quem cadastra a lista de status é a administração, na tela de Status Da Vaga.",
    "Todo movimento fica no histórico da vaga, com quem moveu, quando, de onde para onde, e a observação inteira.",
    "O status movido à mão é respeitado pelo sistema: ele não é trocado sozinho por trás.",
  ],
  relacionados: [
    "fechar-a-vaga",
    "cancelar-a-vaga",
    "reabrir-a-vaga-cancelada",
    "continuar-um-rascunho-de-vaga",
    "abrir-o-painel-da-vaga",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/MoverStatusVagaModal.tsx",
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/frontend/src/lib/as-status-vaga.ts",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
