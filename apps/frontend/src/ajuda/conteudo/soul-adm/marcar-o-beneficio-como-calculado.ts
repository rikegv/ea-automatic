import type { Artigo } from "../../tipos";

/**
 * N1 DE BENEFÍCIOS: O CARIMBO VISTO PELOS NÚMEROS DA TELA.
 *
 * ┌─ UMA CORREÇÃO DE PREMISSA, MEDIDA, E ELA MUDA O RECORTE DESTA PEÇA ──────────────────────────┐
 * │ O escopo desta peça dizia que "calculado" e "cadastrado" seriam DOIS carimbos diferentes. NÃO  │
 * │ SÃO. Existe UM estágio só (`status_cadastro_beneficio`, com dois valores: aguardando cálculo e │
 * │ benefício calculado), e o artigo irmão `marcar-o-beneficio-como-cadastrado` já ensina o clique, │
 * │ o lote e a reversão dele. O irmão usa "cadastrado" no título porque é a palavra do TIME; a tela │
 * │ escreve "calculado".                                                                           │
 * │                                                                                                │
 * │ ENTÃO ESTA PEÇA NÃO REPETE O IRMÃO, e o recorte que sobra é legítimo e estava órfão: o que o    │
 * │ carimbo SIGNIFICA, o que ele NÃO faz, e como ele se lê nos três números do topo, que são o      │
 * │ resumo E o seletor de visão da tabela. O lote e a reversão ficam com o irmão, apontado no       │
 * │ passo a passo e nas regras, em vez de descritos duas vezes.                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE O CARIMBO ALCANÇA, medido: `avancarEstagio` (`beneficios/beneficios-fila.service.ts`)
 * escreve UMA coluna, o estágio do benefício, que nenhuma outra tela lê. Ele não toca frente da
 * esteira, não toca o pacote da pessoa e não manda nada para sistema nenhum. Sem essa frase o time
 * carimba achando que lançou, ou deixa de carimbar achando que dispararia algo.
 *
 * SEM IMAGEM, pendência conhecida: a fila mostra gente e a captura está vetada pela auditoria de
 * segurança enquanto a homologação não tiver arnês sintético.
 *
 * §A.6: nenhum dado de pessoa, nenhum valor de benefício copiado de tela.
 */
export const artigo: Artigo = {
  slug: "marcar-o-beneficio-como-calculado",
  titulo: "Marcar O Benefício Como Calculado",
  modulo: "SOUL_ADM",
  rotas: ["/beneficios"],
  menus: ["beneficios-fila"],
  publico: "OPERACAO",
  nivel: "N1",
  familia: "beneficios",
  resumo:
    "O que o carimbo de benefício calculado quer dizer, o que ele não faz, e como ler os três números do topo da tela antes e depois de carimbar. O clique em lote e a reversão estão no artigo de marcar o benefício como cadastrado.",
  termos: [
    "calculado",
    "beneficio calculado",
    "aguardando calculo",
    "carimbo",
    "estagio do beneficio",
    "indicadores",
    "numeros do topo",
    "total na esteira de beneficios",
    "o que significa calculado",
    "calculado ou cadastrado",
    "tirar da fila de beneficios",
  ],
  preRequisitos: [
    "Ter lançado o benefício no sistema em que ele é cadastrado. O carimbo é o registro de que o trabalho foi feito.",
  ],
  passos: [
    {
      gesto: "Abra o menu Benefícios e leia os três números do topo antes de mexer em nada.",
      detalhe:
        "O primeiro é a esteira inteira de benefícios. O segundo é quem ainda aguarda cálculo, em vermelho. O terceiro é quem já foi calculado, em verde. Os dois últimos somam o primeiro, então eles dizem quanto falta do total.",
      controles: [
        "Benefícios",
        "Total Na Esteira De Benefícios",
        "Não Calculados, Benefício Não Calculado",
        "Calculados, Benefício Calculado",
      ],
    },
    {
      gesto: "Clique num dos três números para trocar a visão da tabela.",
      detalhe:
        "Eles são o resumo e o seletor ao mesmo tempo: o escolhido fica destacado e a tabela passa a mostrar aquele recorte. Os números contam a mesma busca e os mesmos filtros que você deixou aplicados.",
      controles: ["Clique para ver estes registros na tabela", "Fila De Trabalho", "Finalizados"],
    },
    {
      gesto: "Confirme que o benefício já foi lançado no sistema em que ele é cadastrado.",
      detalhe:
        "O carimbo não lança nada: ele registra que alguém já fez o lançamento. Carimbar antes de lançar deixa a fila mentindo para quem vem depois.",
    },
    {
      gesto: "Clique no botão verde de check na coluna Ações da linha.",
      detalhe:
        "O aviso do mouse escreve a ação por extenso. A linha muda de estágio na hora, e a coluna Status passa de Benefício Não Calculado para Benefício Calculado.",
      controles: ["Ações", "Marcar como calculado", "Status"],
    },
    {
      gesto: "Volte aos números do topo e confira o que mudou.",
      detalhe:
        "O número de não calculados cai e o de calculados sobe, na mesma quantidade. O total não muda: quem foi carimbado trocou de lado, não saiu da esteira de benefícios.",
    },
    {
      gesto: "Para carimbar muita gente de uma vez, ou para desfazer, use o artigo irmão.",
      detalhe:
        "O carimbo em massa e a reversão para a fila de trabalho estão no artigo de marcar o benefício como cadastrado, que é o mesmo carimbo com a palavra que o time usa.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O time fala benefício cadastrado e a tela fala calculado. São dois carimbos.",
      acao: "É um só. A tela escreve Benefício Não Calculado e Benefício Calculado, o time fala cadastrar o benefício, e o estágio é o mesmo: a pessoa está calculada ou aguardando cálculo. Não existe um segundo carimbo a fazer depois.",
    },
    {
      sintoma: "Carimbei uma pessoa e o número do total não mudou.",
      acao: "É o esperado. O total conta a esteira inteira de benefícios. Quem se move são os dois números ao lado dele, um para baixo e o outro para cima.",
    },
    {
      sintoma: "Cliquei num número do topo e a tabela inteira trocou de conteúdo.",
      acao: "Os três números também são o seletor de visão. Clique no primeiro para voltar a ver todos, ou escolha a aba que você quer ver.",
    },
    {
      sintoma: "Carimbei e quero saber se isso mandou o benefício para algum sistema.",
      acao: "Não mandou. O carimbo escreve só o estágio do benefício dentro desta tela. Ele não altera nenhuma frente da esteira, não muda o pacote da pessoa e não dispara envio para lugar nenhum.",
    },
    {
      sintoma: "Tem gente na fila sem pacote nenhum montado.",
      acao: "O carimbo não confere o pacote. Monte o pacote pelo lápis da linha antes de carimbar, pelo artigo de montar o pacote de benefícios.",
    },
  ],
  regras: [
    "Existe um carimbo só, com dois estágios: aguardando cálculo e benefício calculado.",
    "O carimbo é registro de trabalho feito, não lançamento: o sistema não manda nada para nenhum sistema de benefício.",
    "Os três números do topo somam por construção: o total é a soma dos não calculados com os calculados.",
    "Os três números são também o seletor de visão da tabela, e contam o mesmo recorte de busca e filtros que estiver aplicado.",
    "Carimbar não altera nenhuma frente da esteira nem o pacote de benefícios da pessoa.",
    "Quem carimba certifica que o lançamento já foi feito. Carimbar antes de lançar deixa a fila mentindo para quem vem depois.",
  ],
  relacionados: [
    "marcar-o-beneficio-como-cadastrado",
    "montar-o-pacote-de-beneficios",
    "as-regras-de-beneficio-do-cliente",
    "a-memoria-do-pacote-por-cliente-e-cargo",
    "filtrar-pelo-card-de-indicador",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/beneficios/page.tsx",
    "apps/backend/src/beneficios/beneficios-fila.service.ts",
    "apps/backend/src/beneficios/beneficios-fila.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
