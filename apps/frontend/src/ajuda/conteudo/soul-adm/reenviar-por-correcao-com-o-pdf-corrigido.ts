import type { Artigo } from "../../tipos";

/**
 * N1 DO REENVIO POR CORREÇÃO. É o único caminho desta tela que ainda pede um arquivo, porque por
 * natureza ele exige o PDF corrigido.
 *
 * O CORAÇÃO DO ARTIGO É O ACEITE DE DUPLA CORREÇÃO, e não o upload. Quando a admissão veio do
 * sistema de origem das vagas, o dado já entrou também no sistema da folha, e aquele envio é ÚNICO e
 * não volta: corrigir só aqui deixa o erro vivo do outro lado, e corrigir pela origem não desfaz
 * nada. O sistema não consegue verificar tecnicamente que a pessoa corrigiu nos dois lugares, então
 * ele cobra a declaração e a GUARDA, com autor, data e o termo que foi aceito.
 *
 * O QUE ELE DELIBERADAMENTE NÃO COBRE:
 *   - GERAR O KIT: o reenvio parte do PDF corrigido e o sistema refaz o kit sozinho. O Gerador De
 *     Kit é outra tela, com artigo próprio.
 *   - CANCELAR ISOLADO e TROCAR O KIT: artigos irmãos. O reenvio já cancela o documento atual no
 *     caminho, e é essa a diferença entre ele e o cancelamento.
 *
 * O subtítulo da janela fica fora de `controles` porque carrega o nome da pessoa e o cliente.
 */
export const artigo: Artigo = {
  slug: "reenviar-por-correcao-com-o-pdf-corrigido",
  titulo: "Reenviar Por Correção",
  modulo: "SOUL_ADM",
  rotas: ["/assinaturas"],
  menus: ["assinaturas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "assinaturas",
  resumo:
    "Como reenviar o contrato de um candidato a partir do PDF corrigido, e o que significa a declaração de dupla correção que o sistema cobra antes de deixar você seguir.",
  termos: [
    "reenviar contrato",
    "reenviar por correcao",
    "contrato com erro",
    "contrato errado",
    "mandei errado",
    "corrigir contrato",
    "salario errado no contrato",
    "trocar o contrato",
    "dupla correcao",
    "declaracao de ciencia",
    "contrato expirado",
    "contrato venceu",
  ],
  preRequisitos: [
    "Ter em mãos o PDF corrigido de onde o contrato daquele candidato será refeito.",
    "Ter corrigido o dado errado no cadastro do sistema antes de reenviar: o kit novo é montado a partir do que está gravado.",
  ],
  passos: [
    {
      gesto: "Corrija primeiro o dado errado onde ele mora, e só depois volte para cá.",
      detalhe:
        "Reenviar sem corrigir gera um contrato novo com o mesmo erro. Quando a admissão veio do sistema de origem das vagas, a correção também precisa ser feita direto no sistema da folha, e isso é o que a declaração do passo 6 cobra.",
    },
    {
      gesto: "Abra o Ass. Click e ache o candidato.",
      detalhe:
        "O reenvio aparece em quem tem documento em andamento, em quem foi cancelado e em quem expirou. Ele não aparece em quem ainda não teve documento criado.",
      controles: [
        "Ass. Click",
        "Gestão Das Assinaturas",
        "Cancelados E Expirados",
        "Aguardando Assinatura",
        "Cancelado",
        "Expirado",
      ],
    },
    {
      gesto: "Clique no ícone de reenvio da coluna Ações.",
      controles: ["Ações", "Reenviar por correção com o PDF corrigido"],
    },
    {
      gesto: "Leia o aviso da janela Reenviar por correção.",
      detalhe:
        "Ele diz o que vai acontecer: o documento atual é cancelado e um novo é disparado a partir do PDF corrigido. O contrato anterior deixa de valer.",
      controles: ["Reenviar por correção"],
    },
    {
      gesto: "Escolha o PDF corrigido no campo de arquivo.",
      detalhe:
        "O sistema aceita só PDF. É dele que o kit daquele candidato é montado de novo, então ele precisa conter o contrato da pessoa certa.",
      controles: ["PDF-mãe corrigido"],
    },
    {
      gesto: "Clique em Reenviar.",
      detalhe: "O botão fica apagado enquanto nenhum arquivo foi escolhido.",
      controles: ["Reenviar", "Enviando"],
    },
    {
      gesto:
        "Quando o sistema exigir a declaração de dupla correção, LEIA o termo e marque a caixa ao lado dele.",
      detalhe:
        "O termo é este: Declaro que corrigi os dados no SOUOperações E diretamente no G.I. Estou ciente de que o envio Pandapé para G.I é único e irreversível: a correção não pode ser feita pelo Pandapé. Marcar significa que você corrigiu nos dois sistemas. O sistema não tem como conferir isso, então ele registra quem declarou, quando e o texto declarado.",
    },
    {
      gesto: "Clique em Reenviar de novo, agora com a declaração marcada.",
      detalhe:
        "Com a declaração pendente o botão fica apagado. Cancelar fecha a janela sem reenviar nada.",
      controles: ["Reenviar", "Cancelar"],
    },
    {
      gesto: "Confira o resultado na fila.",
      detalhe:
        "O documento anterior fica registrado como cancelado e o novo nasce a partir do kit refeito, chamando a pessoa para assinar outra vez. Use o Atualizar se a linha ainda não tiver trocado de recorte.",
      controles: ["Atualizar", "Gestão Das Assinaturas"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela avisa: Falha ao reenviar por correção.",
      acao: "O reenvio não completou. Recarregue a fila pelo Atualizar e confira a etiqueta daquele candidato antes de repetir: se o documento anterior já está cancelado, o cancelamento aconteceu e falta só o novo. Não repita o reenvio sem conferir.",
    },
    {
      sintoma: "O botão de reenviar está apagado.",
      acao: "Falta escolher o arquivo, ou falta marcar a declaração de dupla correção que o sistema pediu. Os dois são obrigatórios quando aparecem.",
    },
    {
      sintoma: "O sistema me pediu uma declaração e eu não sei se devo marcar.",
      acao: "Marque só se você realmente corrigiu o dado nos dois sistemas. A declaração fica registrada com o seu nome e a data, e é ela que responde pela correção: não existe verificação automática por trás dela.",
    },
    {
      sintoma: "Corrigi pelo sistema de origem das vagas e achei que estava resolvido.",
      acao: "Não está. O envio daquele sistema para a folha acontece uma vez só e não volta atrás, então corrigir na origem não muda o que já entrou. A correção tem de ser feita no cadastro daqui e direto no sistema da folha.",
    },
    {
      sintoma: "O ícone de reenvio não aparece na linha.",
      acao: "Ele existe em documento em andamento, cancelado ou expirado. Em quem ainda não teve documento criado, o caminho é disparar a assinatura pela fila; para trocar apenas o arquivo anexado, use a troca de kit.",
    },
    {
      sintoma: "Reenviei e o candidato continua sem ser chamado.",
      acao: "O kit é refeito e o documento novo é criado em seguida, não no mesmo instante. Use o Atualizar depois de alguns instantes. Se a linha ficar parada, avise a administração em vez de reenviar mais uma vez.",
    },
  ],
  regras: [
    "O reenvio cancela o documento atual e cria um novo a partir do PDF corrigido. O contrato anterior deixa de valer.",
    "Quando a admissão veio do sistema de origem das vagas, o sistema exige a declaração de dupla correção antes de deixar reenviar.",
    "A declaração afirma que o dado foi corrigido aqui E direto no sistema da folha. A correção não pode ser feita pelo sistema de origem das vagas, porque aquele envio é único e não volta atrás.",
    "O aceite é registrado de forma permanente e consultável, com autor, data e o texto do termo que foi declarado.",
    "O controle é por responsabilização, não por verificação técnica: o sistema não confere a correção no outro sistema, ele guarda quem declarou.",
    "O aceite é gravado antes de qualquer outra ação do reenvio, então a trilha existe mesmo que o reenvio falhe depois.",
    "O kit novo é montado a partir do que está gravado no cadastro. Corrigir o cadastro antes é parte do procedimento.",
    "O documento novo chama a pessoa para assinar outra vez, com prazo novo de 30 dias.",
  ],
  relacionados: [
    "ler-a-gestao-das-assinaturas",
    "cancelar-o-documento-na-clicksign",
    "trocar-o-kit-anexado",
    "disparar-a-assinatura-de-um-candidato",
    "editar-os-dados-de-uma-admissao",
    "enviar-o-kit-para-assinatura",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/assinaturas/page.tsx",
    "apps/backend/src/clicksign/clicksign-sync.service.ts",
    "apps/backend/src/clicksign/clicksign.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
