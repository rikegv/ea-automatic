# Guia: disparar 1 pré-cadastro de teste (Maria) no G.I

Para o diretor. Tudo já está montado e testado até antes do envio. Falta só você disparar, conferir
que a Maria nasceu no G.I, e apagar. O envio vai para a PRODUÇÃO do G.I (não existe ambiente de
teste do fornecedor), então é 1 pré-cadastro real, que você apaga logo depois.

## O que já foi preparado e conferido

- O contrato do G.I foi confirmado ao vivo (o campo do PIS, os formatos, os códigos de cidade e banco).
- A credencial que você mandou está no lugar certo, fora do sistema, e nunca aparece em tela nem em log.
- A autenticação do sistema com o G.I foi testada e funciona (o G.I aceitou a credencial).
- Os dados da Maria Simulada estão prontos (São Paulo, Itaú, RG, CTPS, filiação).
- O ensaio rodou: o sistema monta a ficha da Maria e para sozinho, sem enviar.
- A segurança auditou e aprovou: só este disparo manual envia; o envio automático é incapaz de disparar.

## Passo a passo

**1. (Opcional) Ensaio, não envia nada:**
```
bash /home/henrique/gi-disparar-maria.sh --dry
```
Deve terminar com `GI_MONTADO_NAO_DISPARADO` e "Nada foi gravado na folha". É só a conferência.

**2. Disparar de verdade (cria a Maria no G.I):**
```
bash /home/henrique/gi-disparar-maria.sh
```
Aqui na sessão, você também pode digitar: `! bash /home/henrique/gi-disparar-maria.sh`

O resultado esperado é `GI_ENVIADO`, seguido do id que o G.I devolveu. Se aparecer `GI_FALHA_ENVIO`,
nada foi criado (provavelmente o endereço exato de criação no G.I), é só me avisar que eu ajusto.

**3. Conferir que nasceu no G.I:**
- O próprio comando já mostra o id do registro no G.I.
- Além disso, entre no G.I (a tela do fornecedor) e procure a Maria Simulada em pré-admissão
  (FuncionarioSelecao). Ela deve estar lá, com os dados sintéticos.

**4. Apagar depois:**
- Apague pela própria tela do G.I (você consegue). A nossa ferramenta de leitura do G.I é só de
  consulta, de propósito: ela não apaga nada, para não ter risco de mexer na folha por engano.

## Observações

- É 1 envio só, da Maria, nunca em massa. O caminho automático (fechamento de auditoria) foi construído
  incapaz de enviar, então nenhuma leva de admissões dispara sozinha.
- A credencial e o token nunca são exibidos nem gravados (LGPD, §A.6).
- Nota técnica registrada pela segurança: antes de ligar o envio de forma ampla (produção, vários ao
  mesmo tempo), falta uma trava contra dois disparos simultâneos na mesma pessoa. Para este teste de 1
  clique não tem efeito; fica anotado para a etapa de produção.
