import type { Artigo } from "../../tipos";

/**
 * N2 DO GERENCIADOR, O DESFECHO 2 de 3: PAUSAR E RETOMAR. Mesmo seletor de status do declínio e da
 * marca de banco, lido de uma vez com eles.
 *
 * ┌─ A DISTINÇÃO ENTRE PAUSA E DECLÍNIO É O ARTIGO INTEIRO ───────────────────────────────────────┐
 * │ São dois gestos no MESMO seletor, e a operação os confunde porque os dois "tiram da fila". O     │
 * │ que os separa: o declínio ENCERRA (e quem volta é processo novo), a pausa ADIA (e retomar não    │
 * │ restaura nada, porque nada foi alterado). Por isso este artigo NÃO ensina declinar, que é artigo │
 * │ irmão: explicar o encerramento aqui criaria a segunda explicação que diverge no primeiro ajuste. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE A PAUSA FAZ E O QUE ELA NÃO FAZ, LIDO DO CÓDIGO ───────────────────────────────────────┐
 * │ A pausa é uma marca paralela da admissão (`pausarAdmissao`, `esteira.service`): NÃO toca etapa   │
 * │ nenhuma e NÃO toca a situação geral, que continua sendo calculada por baixo. Daí as três         │
 * │ consequências que o artigo escreve e que ninguém adivinha:                                      │
 * │   . a AUDITORIA continua rodando durante a pausa, por decisão do diretor (a pausa é sobre o      │
 * │     cliente, não sobre a análise interna);                                                      │
 * │   . o kit e o envio para assinatura são BARRADOS, com mensagem própria de cada um;              │
 * │   . a pausada não conta como trabalho em andamento nem como pendência (`comPendenciaSql` exige   │
 * │     a marca ausente), e é isso que faz os cards fecharem sem contar ninguém duas vezes.          │
 * │ SÓ admissão em andamento pausa: banco, concluída e encerrada são recusadas com 409 e mensagem.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA E DECLARADA: a captura das telas que mostram gente está vetada
 * pela auditoria de segurança enquanto a homologação não tiver arnês sintético. O texto nomeia o
 * rótulo literal de cada controle para funcionar sem print.
 */
export const artigo: Artigo = {
  slug: "pausar-e-retomar-uma-admissao",
  titulo: "Pausar E Retomar Uma Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "Como parar uma admissão sem encerrá-la, registrar o motivo da parada, encontrar as pausadas depois e retomar de onde parou.",
  termos: [
    "pausar",
    "pausa",
    "pausada",
    "parar admissao",
    "suspender admissao",
    "segurar admissao",
    "congelar",
    "retomar",
    "despausar",
    "voltar a admissao",
    "cliente suspendeu",
    "admissao parada",
    "motivo da pausa",
    "sumiu da fila",
  ],
  preRequisitos: [
    "A admissão precisa estar em andamento. Admissão de banco, concluída ou encerrada não pausa.",
  ],
  passos: [
    {
      gesto: "Ache a pessoa na lista e clique no lápis, na coluna Ações.",
      controles: ["Ações", "Editar", "Editar admissão"],
    },
    {
      gesto: "No bloco Status das frentes, abra o seletor Status (farol) e escolha Admissão Pausada.",
      detalhe:
        "A pausa aparece no seletor logo depois de Em Admissão, porque é de lá que ela nasce. Escolhê-la não apaga a situação real da admissão: ela continua sendo calculada por baixo da pausa.",
      controles: ["Status das frentes", "Status (farol)", "Admissão Pausada", "Em Admissão"],
    },
    {
      gesto: "Escreva o porquê no campo Motivo da pausa (opcional).",
      detalhe:
        "É opcional de propósito, porque pausa rápida não depende de justificativa. Escrito, ele aparece na ficha e fica na trilha com o seu nome e a data, o que resolve o Por Que Esta Parou de duas semanas depois.",
      controles: ["Motivo da pausa (opcional)"],
    },
    {
      gesto: "Clique em Salvar alterações.",
      detalhe:
        "O aviso da tela diz que a admissão foi atualizada e acrescenta Admissão pausada. Na linha da lista aparece uma segunda etiqueta, Pausada, ao lado da situação de sempre.",
      controles: ["Cancelar", "Salvar alterações", "Pausada"],
    },
    {
      gesto: "Para achar as pausadas depois, filtre pelo campo Status escolhendo Admissão Pausada.",
      detalhe:
        "A pausada sai da fila de trabalho das etapas, mas não desaparece: ela continua na lista do Gerenciador e é encontrada por este filtro e pela busca por nome.",
      controles: ["Status", "Admissão Pausada"],
    },
    {
      gesto: "Para retomar, volte ao lápis e escolha o status que a admissão tinha, em geral Em Admissão.",
      detalhe:
        "Retomar não recomeça nada: como a pausa não mexeu em etapa nenhuma, cada uma continua no ponto em que estava, inclusive o que andou durante a pausa.",
      controles: ["Status (farol)", "Em Admissão", "Salvar alterações"],
    },
    {
      gesto: "Confira na ficha, pelo olho, se a etiqueta Pausada saiu.",
      detalhe:
        "O bloco Status das frentes mostra a etiqueta enquanto a pausa existir, com o motivo. O aviso da tela acrescenta Admissão retomada quando ela sai.",
      controles: ["Ver ficha", "Status das frentes", "Pausada", "Motivo da pausa:"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "Aparece Só admissão em andamento pode ser pausada (banco, concluída e declinada não entram).",
      acao: "Pausa vale para quem está andando. Admissão de banco já é espera, e concluída ou encerrada não tem o que parar. Ajuste primeiro a situação, se for o caso.",
    },
    {
      sintoma: "Aparece Esta admissão já está pausada.",
      acao: "Alguém pausou antes de você, provavelmente enquanto a sua tela estava aberta. Recarregue a página para ver a etiqueta e o motivo que já foram registrados.",
    },
    {
      sintoma: "Aparece Esta admissão não está pausada.",
      acao: "Você tentou retomar uma admissão que já foi retomada. Recarregue a página e confira a linha.",
    },
    {
      sintoma: "Pausei e a admissão sumiu da fila da etapa.",
      acao: "É o comportamento certo: pausada não é trabalho a fazer agora. Ela continua a um clique, pelo filtro Status com Admissão Pausada, e a busca por nome na fila também a revela.",
    },
    {
      sintoma:
        "Aparece Admissão pausada: retome a admissão para gerar o kit, ou para enviar à assinatura.",
      acao: "Pausada não gera kit nem dispara assinatura. Retome a admissão e repita a ação. Nada foi cancelado: é adiamento, não perda.",
    },
    {
      sintoma: "A admissão está pausada e a auditoria dos documentos continuou andando.",
      acao: "É de propósito. A pausa é sobre o cliente, não sobre a análise interna: documento que chega segue sendo auditado durante a pausa.",
    },
    {
      sintoma: "Retomei e o motivo da pausa anterior continua escrito na ficha.",
      acao: "O motivo é preservado por escolha: apagar jogaria fora o porquê da última parada. A trilha da ficha guarda cada pausa e cada retomada, com quem fez e quando.",
    },
  ],
  regras: [
    "Pausa adia, declínio encerra. A pausada volta de onde parou; quem declinou, se voltar, é processo novo.",
    "A pausa não altera etapa nenhuma nem a situação geral da admissão: ela é uma marca por cima, e a situação segue sendo calculada por baixo.",
    "A pausada sai da fila de trabalho das etapas e continua encontrável na lista do Gerenciador, pelo filtro Status e pela busca.",
    "A pausada não conta como admissão em andamento nem como pendência obrigatória nos cards, porque parada não é trabalho andando.",
    "Só admissão em andamento pode ser pausada. Banco, concluída e encerrada não entram.",
    "O motivo da pausa é opcional, e o que for escrito vai para a ficha e para a trilha, com autor e data.",
    "A auditoria dos documentos continua durante a pausa. O kit e o envio para assinatura, não.",
    "Retomar não restaura nada, porque nada foi desfeito. O que andou durante a pausa continua valendo.",
  ],
  relacionados: [
    "declinar-uma-admissao",
    "marcar-uma-admissao-como-banco",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "editar-os-dados-de-uma-admissao",
    "ler-a-ficha-da-admissao",
    "achar-uma-admissao-no-gerenciador",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/components/gerenciador/EditAdmissaoModal.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/frontend/src/lib/farol.ts",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/admissoes/admissoes-filtros.ts",
    "apps/backend/src/domain/admissao.ts",
  ],
  revisadoEm: "2026-09-30",
};
