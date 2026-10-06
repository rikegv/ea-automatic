# Pedido ao Fernando: acesso público do Portal do Candidato

Tudo aqui foi medido em 29/09/2026, não suposto. O mapa com as medidas está em
`docs/MAPA-PORTAL-ACESSO-PUBLICO.md`.

## O resumo, em três linhas

1. O Portal precisa de um **subdomínio próprio**, não de um subcaminho. Medido: a aplicação emite
   os arquivos dela a partir da raiz do site, então em `soulan.com.br/clientesportal` a página
   chegaria ao candidato sem formatação e sem funcionar.
2. O vhost pertence ao **servidor que já recebe o tráfego público** (`192.168.1.174`), não ao
   servidor novo (`192.168.1.234`). Medido: é o `.174` que responde pelo `soulan.com.br` e termina
   o certificado, e é ele que já conversa com a VM do EA todo dia pelo webhook do Pandapé.
3. Por isso o pedido é **pequeno**: um registro de DNS, um arquivo de configuração e um
   certificado. **Nada de firewall, nada de NAT, nada de porta nova.**

## O que depende do Fernando, com os valores exatos

### 1. Registro de DNS
No painel do **Registro.br** (a zona do `soulan.com.br` está lá):

```
Tipo: A
Nome: portal
Domínio: soulan.com.br        →  portal.soulan.com.br
Valor: 187.102.148.222
```

O endereço está **decidido**: `portal.soulan.com.br`. Ele já vem preenchido no arquivo de
configuração, não há nada para trocar lá dentro.

Esse é o mesmo IP público do site atual. Não muda nada do que já existe.

### 2. Configuração do site, no servidor 192.168.1.174
Arquivo pronto e comentado, entregue junto: `portal-soulan.conf`.
Ele nega tudo por padrão e libera só os caminhos do Portal do candidato.

Comandos, na ordem:
```
sudo a2enmod proxy proxy_http headers ssl rewrite
sudo cp portal-soulan.conf /etc/apache2/sites-available/
sudo a2ensite portal-soulan
sudo apache2ctl configtest
sudo systemctl reload apache2
```

O site institucional `soulan.com.br` **não é tocado**: o Apache separa os dois pelo nome do
endereço. O `webpanda` do Pandapé também segue intocado.

### 3. Certificado
```
sudo certbot --apache -d portal.soulan.com.br
```
O certbot já funciona nesse servidor (o certificado atual do `soulan.com.br` é dele, Let's Encrypt,
válido até 30/10/2026).

## Dois pré-requisitos que são NOSSOS, não dele

O Fernando pode ligar o vhost, mas ele só serve conteúdo depois que estes dois estiverem feitos do
nosso lado. Avisar isso junto evita que ele ligue e pareça quebrado:

1. **Publicar o código do Portal em produção.** As tabelas e os segredos já estão lá, mas o
   programa em execução ainda não tem o Portal: `http://127.0.0.1:3010/portal` responde 404 hoje.
2. **Acrescentar o endereço público ao `ALLOWED_ORIGINS`** do backend, senão a primeira tela do
   candidato responde "Origin não permitida".

## O que a fábrica já fez e testou sozinha

O arquivo de configuração foi escrito, validado (`apache2 -t` = Syntax OK) e **exercitado num
Apache de verdade**: 20 caminhos do Portal liberados, 16 caminhos do sistema barrados com 403,
travessia de caminho barrada, e a tela do Portal renderizada num navegador de celular através dele.
O caminho do proxy está provado; falta só o endereço real.

## Uma observação sobre o servidor novo (192.168.1.234)

Ele está de pé e funcionando, mas **não recebe tráfego público**: a porta 443 dele está fechada e o
endereço público entrega no servidor antigo. Ele também está sem os módulos de proxy do Apache
habilitados e sem certbot. Não é problema: só significa que ele não é o caminho mais curto para o
Portal. Ele continua útil como servidor de arquivos.

## E o endereço bonito, se o diretor quiser

Se fizer diferença divulgar `soulan.com.br/clientesportal`, dá para deixá-lo funcionando como
**atalho** que leva ao Portal, sem quebrar nada. É uma linha a mais na configuração do site
institucional. É opcional, e o link que o candidato recebe por mensagem não depende disso.
