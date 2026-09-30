import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o vale-transporte, do lado do time.
 *
 * Reúne os artigos que o time usa: manter a tabela de tarifas e mandar o link do formulário para o
 * candidato. O lado do CANDIDATO não entra aqui: ele é outro público e outra tela.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "vt-time",
  rotulo: "Vale-Transporte",
  preRequisitos: [
    "Para manter tarifa, ter o menu de tarifas liberado. Para enviar o link, ter o menu de benefícios liberado.",
    "A tabela de tarifas vigente precisa estar cadastrada: é ela que sugere o valor ao candidato.",
    "O candidato preenche pelo celular, então o link vai pelo canal em que você já fala com ele.",
  ],
  seDerErrado: [
    {
      sintoma: "A tarifa não foi salva.",
      acao: "Confira o valor em reais e a cidade antes de repetir. Nada foi gravado pela metade.",
    },
    {
      sintoma: "Você inativou uma tarifa por engano.",
      acao: "Tarifa inativa não some: ela sai das sugestões e pode ser reativada na mesma tela. Recarregue para ver qual valor está de fato valendo.",
    },
    {
      sintoma: "O link do formulário não abre para o candidato.",
      acao: "O formulário depende do acesso público, que é configuração de infraestrutura e não do sistema. Confirme com a administração se o endereço já está publicado antes de mandar o link para a pessoa.",
    },
    {
      sintoma: "O candidato preencheu e você não vê o formulário na admissão.",
      acao: "O arquivo é recolhido por uma varredura periódica, não na hora do envio. Confira de novo mais tarde antes de pedir para a pessoa preencher outra vez.",
    },
  ],
};
