import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA "sala-espera": o bloco comum dos artigos da Sala De Espera.
 *
 * ┌─ A FRASE QUE PRECISA VIR ANTES DE QUALQUER PASSO ────────────────────────────────────────────┐
 * │ A Sala De Espera NÃO é admissão. O registro daqui não tem esteira, não tem régua de documento e │
 * │ não entra em indicador nenhum: ele é o candidato ANUNCIADO, antes de existir processo. Quem lê  │
 * │ um passo a passo desta tela sem essa frase procura a pessoa na Esteira e conclui que o sistema  │
 * │ perdeu o cadastro. Por isso ela é pré-requisito, e não regra de um artigo só.                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE NÃO ENTRA AQUI ───────────────────────────────────────────────────────────────────────┐
 * │ Erro que só acontece em UM caminho fica no artigo dele. "Este registro já foi vinculado a uma   │
 * │ admissão." só aparece para quem VINCULA, e "CPF inválido." só para quem SALVA o cadastro: subir │
 * │ os dois para cá faria os dois artigos herdarem o erro que só um deles pode produzir.            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS MENSAGENS SÃO AS DO CÓDIGO, letra por letra ("Falha ao carregar a Sala de Espera.", em
 * `app/(app)/sala-espera/page.tsx`; "Cliente não encontrado." e as irmãs, em
 * `sala-espera/sala-espera.service.ts`).
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa real.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "sala-espera",
  rotulo: "Sala De Espera",
  preRequisitos: [
    "Ter o menu Sala De Espera liberado para o seu usuário.",
    "Saber que o registro da Sala não é admissão: ele não entra na esteira, não tem régua de documentos e não conta em indicador nenhum. Ele vira admissão no momento do vínculo.",
    "O cliente e o cargo já precisam existir no sistema. Os dois são escolhidos de lista, e a Sala De Espera não cria nenhum dos dois.",
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Falha ao carregar a Sala de Espera.",
      acao: "A consulta não voltou. Recarregue a página. Se repetir, confira se você continua com a sessão aberta e avise a administração.",
    },
    {
      sintoma: "A pessoa sumiu da aba Aguardando.",
      acao: "Ou ela foi vinculada a uma admissão, e está na aba Admissões Vinculadas, ou recebeu um status que encerra, e está na aba Admissões Inativadas. Nada é apagado nesta tela: o registro continua consultável nas outras duas abas.",
    },
    {
      sintoma: "A lista diz Nenhum registro com esse filtro.",
      acao: "É a busca do topo recortando a fila. Apague o que está escrito em Buscar por candidato, cliente, cargo ou telefone e a lista volta inteira.",
    },
    {
      sintoma: "O botão Salvar está apagado e não clica.",
      acao: "Falta um campo obrigatório. São cinco: Nome, Cliente, Cargo, Data de recebimento e Status. CPF, data de nascimento, e-mail e telefone são opcionais e não travam o Salvar.",
    },
    {
      sintoma:
        "Ao salvar aparece Cliente não encontrado., Cargo não encontrado. ou Status não encontrado.",
      acao: "O item escolhido saiu do catálogo enquanto a janela estava aberta, ou foi inativado. Cancele, recarregue a página e escolha de novo na lista.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você digitou. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
