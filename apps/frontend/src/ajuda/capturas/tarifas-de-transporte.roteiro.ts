/**
 * ROTEIRO PILOTO DA FASE 0: Tarifas De Transporte.
 *
 * ESCOLHIDO POR NÃO TER DADO DE PESSOA. É tabela de tarifa pública (cidade, transporte, valor), e é
 * de propósito: o plano proíbe captura em lote antes do veredito do `seguranca` sobre o gate de PII,
 * então o motor se prova numa tela onde um erro do gate não teria consequência.
 *
 * ELE TAMBÉM EXERCITA O DEFEITO CONHECIDO DO SPIKE: o primeiro alvo é o TÍTULO, colado no topo da
 * tela, que é exatamente onde o rótulo ancorado em `cy - 100` saía cortado. E os dois alvos do filtro
 * ficam lado a lado, o que força a régua de colisão entre rótulos.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "tarifas-de-transporte",
  url: "/admin/tarifas",
  capturas: [
    {
      arquivo: "01-tela.png",
      legenda: "A tela de Tarifas De Transporte, com o formulário de cadastro e a lista vigente.",
      alvos: [
        {
          papel: "heading",
          nome: /Tarifas De Transporte/i,
          texto: "1. Você está em Tarifas",
          lado: "abaixo",
        },
        {
          seletor: 'input[placeholder="Cidade *"]',
          texto: "2. Cadastre a tarifa aqui",
          lado: "abaixo",
        },
        {
          papel: "textbox",
          nome: /Buscar por cidade ou transporte/i,
          texto: "3. Busque na lista",
          lado: "direita",
        },
      ],
    },
  ],
};
