import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o Assinante Da Empresa.
 *
 * Tela pequena e de uma peça só hoje, e a família existe mesmo assim por um motivo: o alerta de
 * "sem grupo padrão" é a causa mais comum de envelope que não dispara, e ele precisa estar ligado
 * ao artigo da assinatura sem ser copiado para lá.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "assinante-empresa",
  rotulo: "Assinante Da Empresa",
  preRequisitos: [
    "Ter o menu do assinante da empresa liberado para o seu usuário.",
    "Ter em mãos o nome completo, o e-mail e o documento de quem assina pela empresa.",
    "Saber qual cliente usa aquele grupo, ou se ele é o grupo padrão.",
  ],
  seDerErrado: [
    {
      sintoma: "A tela avisa que não há grupo padrão.",
      acao: "Não é erro, é alerta de configuração, e ele tem consequência: cliente que não tenha grupo próprio deixa de disparar envelope. Cadastre o grupo padrão, ou um grupo para cada cliente.",
    },
    {
      sintoma: "O grupo não foi salvo.",
      acao: "Nada foi gravado pela metade. Confira se nome, e-mail e documento estão completos e se a posição de assinatura foi informada, e tente de novo.",
    },
    {
      sintoma: "Você removeu um grupo e quer voltar atrás.",
      acao: "Cadastre o grupo de novo antes do próximo disparo. Enquanto o cliente estiver sem grupo, nenhum envelope dele sai.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
