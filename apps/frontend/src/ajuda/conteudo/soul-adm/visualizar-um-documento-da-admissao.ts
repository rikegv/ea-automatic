import type { Artigo } from "../../tipos";

/**
 * ─ VISUALIZAR: abrir o arquivo que o candidato mandou, e só isso ────────────────────────────────
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E POR QUE ELA PRECISOU EXISTIR ──────────────────────────────────────┐
 * │ O N1 da aba ("auditar-os-documentos-da-admissao") cita o olho de passagem, dentro do passo de  │
 * │ corrigir uma recusa, e menciona no bloco de erro que o arquivo pode ter expirado. Ele NÃO       │
 * │ ensina o controle: não diz que arquivo único abre direto em aba nova, não diz que documento com │
 * │ várias peças (frente e verso, páginas da carteira de trabalho) lista as peças abaixo da linha,  │
 * │ e não diz que o veredito é do CONJUNTO. É esse o recorte daqui.                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE ────────────────────────────────────────────────────┐
 * │ O VEREDITO da inteligência artificial (o que é Validado, Inconforme, Pendente, e o que fazer   │
 * │ com cada um) é do N1 da aba. Aqui o veredito aparece só como contexto de POR QUE alguém quer    │
 * │ olhar o arquivo. Reauditar, assumir como válido e reabrir a pendência têm peça própria, e a     │
 * │ leitura da régua obrigatória também: repetir qualquer um deles aqui recriaria duas aulas sobre  │
 * │ o mesmo botão, que é o defeito que a família de artigos existe para evitar.                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO ──────────────────────────────────────────┐
 * │ A captura desta janela está VETADA pela auditoria de segurança enquanto a homologação não     │
 * │ tiver arnês sintético: a tela mostra documento de pessoa, e imagem vai para o repositório, que │
 * │ guarda para sempre. O texto foi escrito para funcionar SEM imagem, e nenhum passo depende de   │
 * │ "veja a figura". Os prints entram em entrega própria.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS `controles` FORAM LIDOS LETRA POR LETRA de `AuditoriaDocsModal.tsx`. Dois cuidados: o rótulo do
 * olho é o nome acessível ("Visualizar documento"), porque o botão é só ícone; e a lista de peças
 * escreve "3 arquivos neste documento:", com o número vindo da contagem, então o que se declara é a
 * parte fixa. §A.6: nenhum valor de documento, nome ou número de pessoa aparece neste arquivo.
 */
export const artigo: Artigo = {
  slug: "visualizar-um-documento-da-admissao",
  titulo: "Visualizar Um Documento Da Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como abrir o arquivo que o candidato mandou, para conferir com os próprios olhos qual documento chegou, inclusive quando o mesmo documento tem várias páginas.",
  termos: [
    "ver documento",
    "visualizar documento",
    "abrir documento",
    "abrir arquivo",
    "conferir documento",
    "olhinho",
    "olho",
    "ver o que o candidato mandou",
    "ver anexo",
    "abrir anexo",
    "frente e verso",
    "paginas da carteira",
    "documento errado",
    "nao consigo ver o documento",
    "documento indisponivel",
  ],
  preRequisitos: [
    "O documento já precisa ter chegado: só dá para visualizar arquivo que o candidato enviou, que alguém subiu à mão ou que o sistema puxou.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional pelo menu da lateral esquerda.",
      controles: ["Esteira Admissional"],
    },
    {
      gesto: "Na aba Auditoria, ache a pessoa e clique em Auditar, na coluna Avanço / Auditoria.",
      detalhe: "Abre a janela com os documentos que a régua exige daquela admissão.",
      controles: ["AUDITORIA", "Avanço / Auditoria", "Auditar"],
    },
    {
      gesto: "Ache a linha do documento que você quer conferir, pelo nome dele.",
      detalhe:
        "Sob o nome está a exigência daquele documento na régua, e é ela que diz se a falta dele trava a frente.",
      controles: ["Obrigatório", "Não obrigatório", "Facultativo"],
    },
    {
      gesto: "Clique no olho, à direita da linha, para abrir o documento recebido.",
      detalhe:
        "Quando o documento tem um arquivo só, ele abre na hora, em outra aba do navegador. Nada é alterado: visualizar não muda o veredito nem a situação do documento.",
      controles: ["Visualizar documento"],
    },
    {
      gesto:
        "Quando o documento tem mais de um arquivo, escolha a peça na lista que aparece abaixo da linha.",
      detalhe:
        "É o caso de frente e verso e das páginas da carteira de trabalho. Cada peça abre no clique, e vale abrir todas: o veredito é do conjunto, não da primeira folha.",
      /*
       * A tela escreve "3 arquivos neste documento:", com o número vindo da contagem real, e cada
       * botão da lista leva o nome do TIPO com a posição ("Nome do documento (1 de 3)"). Declarar o
       * número ou o nome montado seria declarar rótulo que não existe fixo em lugar nenhum.
       */
      controles: ["arquivos neste documento:"],
    },
    {
      gesto: "Confira se o arquivo é mesmo o documento pedido naquela linha.",
      detalhe:
        "É a conferência que a inteligência artificial não faz por você: ela julga o conteúdo do arquivo que chegou, e quem percebe que chegou o documento de outra pessoa da família, ou a página errada, é quem olha.",
    },
    {
      gesto: "Feche a aba do documento e volte à janela da auditoria. Para sair dela, use Fechar.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A tela responde: Documento não está mais disponível para visualização. Verifique no Pandapé.",
      acao: "O arquivo é temporário e não está mais guardado aqui: ele é descartado quando a régua fecha e vale por 48 horas. Isso não é falha e não apaga nada do processo, o veredito e a situação do documento continuam. Quando precisar do arquivo em si, procure no Pandapé ou no prontuário do Drive.",
    },
    {
      sintoma:
        "Aparece: Falha ao consultar os arquivos deste documento. Verifique a conexão e tente de novo.",
      acao: "A janela não conseguiu perguntar ao sistema o que existe naquele documento. Tente o olho de novo. Se repetir, feche e abra a janela, e persistindo avise a TI: nenhum documento é alterado por essa falha.",
    },
    {
      sintoma: "Aparece: Falha ao abrir o documento. Verifique a conexão e tente de novo.",
      acao: "A lista foi consultada, mas o arquivo não chegou até o navegador. Clique de novo no olho. Se insistir, confira antes se o aviso de indisponível não apareceu na linha, que é o caso de arquivo já descartado.",
    },
    {
      sintoma: "Cliquei no olho e nada apareceu na janela.",
      acao: "Quando o documento tem um arquivo só, ele abre em OUTRA aba do navegador, e a janela da auditoria fica como estava. Procure a aba nova. Lista de peças só aparece quando há mais de um arquivo no mesmo documento.",
    },
    {
      sintoma: "O olho está apagado e não aceita clique.",
      acao: "Ou aquele documento está sendo processado neste momento (o botão de envio da linha mostra Processando), e aí basta esperar o fim da análise, ou a linha está com o aviso de tipo de documento não identificado, que é caso para a administração conferir o cadastro do tipo.",
    },
  ],
  regras: [
    "Visualizar não altera nada: não muda veredito, não muda a régua e não conta como ação no documento.",
    "O arquivo é temporário no sistema. Ele vale por 48 horas e é descartado quando a régua obrigatória fecha, porque o que o sistema guarda é a situação de cada documento, nunca o arquivo.",
    "Um mesmo documento pode ter várias peças, e o veredito é do conjunto: frente e verso, ou todas as páginas, respondem juntas por um resultado só.",
    "O que você abre aqui vem do próprio sistema, não do Drive. O prontuário no Drive só recebe os documentos quando a régua obrigatória fecha, então no momento em que se julga um reprovado ainda não há nada lá.",
    "A janela nunca expõe onde o arquivo está guardado: ela pede a peça pela posição na lista, e o sistema resolve o resto.",
  ],
  relacionados: [
    "auditar-os-documentos-da-admissao",
    "reauditar-um-documento",
    "assumir-um-documento-como-valido",
    "reabrir-a-pendencia-de-um-documento",
    "ler-a-regua-obrigatoria-da-admissao",
    "abrir-o-prontuario-no-drive",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/reauditoria/documento-arquivo.service.ts",
    "apps/backend/src/staging/staging-visualizacao.ts",
  ],
  revisadoEm: "2026-09-30",
};
