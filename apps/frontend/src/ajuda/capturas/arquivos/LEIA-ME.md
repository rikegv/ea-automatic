# Arquivos do gesto `subirArquivo`

Esta pasta é a **única** de onde o motor de captura sobe arquivo. `caminhoDoArquivoDePreparo`
(`apps/frontend/src/ajuda/captura.ts`) recusa caminho absoluto e subida de diretório, então um
roteiro não consegue apontar para fora daqui.

**Todo arquivo aqui é SINTÉTICO, e a regra é dura:** o que sobe aparece na tela, a tela vira PNG e o
PNG entra no git, que guarda para sempre (§A.6). Nunca coloque aqui uma planilha de verdade, nem
"só para testar": o gate de dado pessoal audita a tela depois, mas a régua deste projeto é não
depender da última barreira quando a primeira é de graça.

**Prefira CSV a XLSX.** CSV é texto: ele é diffável, revisável em code review e não traz binário
para o repositório. O importador de lojas decide o formato por magic bytes, então CSV serve.

**Nada de nome de pessoa, nem inventado.** Nome plausível de pessoa num print é indistinguível de
nome real para quem lê, e o gate de dado pessoal recusa nome em forma completa. Use nome de loja,
endereço e código, que é o que a planilha de lojas realmente carrega.
