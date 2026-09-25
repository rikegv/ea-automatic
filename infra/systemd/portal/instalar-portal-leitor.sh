#!/usr/bin/env bash
# Instalador da unidade DEFINITIVA do leitor do Portal do Candidato.
#
# EXIGE RAIZ. A fabrica nao se autoconcede acesso (secao A.0), entao este roteiro foi escrito e
# NAO foi executado. Quem roda e o diretor:
#
#     sudo bash infra/systemd/portal/instalar-portal-leitor.sh
#
# O que ele faz, e nada alem disso:
#   1. cria o usuario de sistema `ea-portal`, sem shell, sem casa de verdade, sem grupo extra;
#   2. instala uma COPIA do codigo do ai-service em /opt/ea-portal-leitor/codigo, dono root,
#      e um ambiente virtual proprio em /opt/ea-portal-leitor/venv (o leitor nao le /home);
#   3. move o ambiente magro para /etc/ea-portal-leitor/leitor.env, 0640 root:ea-portal;
#   4. instala a unidade de sistema e sobe o servico na porta 8020 de loopback.
#
# Ele NAO encosta em ea-ai-service, ea-backend, ea-frontend, ea-proxy nem nas de homologacao.
set -euo pipefail

REPO=${REPO:-/home/henrique/apps/ea-automatic}
ORIGEM_ENV=${ORIGEM_ENV:-/home/henrique/apps/ea-portal-leitor/.env}
DESTINO=/opt/ea-portal-leitor
UNIDADE=/etc/systemd/system/ea-portal-leitor.service

[[ $EUID -eq 0 ]] || { echo "Rode como raiz."; exit 1; }

# 1. usuario de sistema proprio
if ! id -u ea-portal >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin ea-portal
  echo "usuario ea-portal criado"
else
  echo "usuario ea-portal ja existe"
fi

# 2. copia do codigo e ambiente virtual proprios
install -d -o root -g root -m 0755 "$DESTINO"
rm -rf "$DESTINO/codigo"
install -d -o root -g root -m 0755 "$DESTINO/codigo"
# So o pacote da aplicacao e o manifesto. A credencial e o .env do ai-service NAO sao copiados.
cp -a "$REPO/apps/ai-service/app" "$DESTINO/codigo/app"
cp -a "$REPO/apps/ai-service/pyproject.toml" "$REPO/apps/ai-service/uv.lock" "$DESTINO/codigo/"
rm -rf "$DESTINO/codigo/app/__pycache__" "$DESTINO/codigo/app"/*/__pycache__
find "$DESTINO/codigo" -name 'credentials*.json' -delete
find "$DESTINO/codigo" -name '.env' -delete

python3 -m venv "$DESTINO/venv"
"$DESTINO/venv/bin/pip" install --quiet --upgrade pip
"$DESTINO/venv/bin/pip" install --quiet "$DESTINO/codigo"
chown -R root:root "$DESTINO"
chmod -R go-w "$DESTINO"

# area de escrita propria (staging efemera do portal)
install -d -o ea-portal -g ea-portal -m 0700 /var/lib/ea-portal-leitor

# 3. ambiente magro fora do repositorio, ilegivel para quem nao e o leitor
install -d -o root -g root -m 0755 /etc/ea-portal-leitor
if [[ -f "$ORIGEM_ENV" ]]; then
  install -o root -g ea-portal -m 0640 "$ORIGEM_ENV" /etc/ea-portal-leitor/leitor.env
  # os caminhos do provisorio apontam para /home; corrige para os de sistema
  sed -i "s#/home/henrique/apps/ea-portal-leitor/staging#/var/lib/ea-portal-leitor/staging#" /etc/ea-portal-leitor/leitor.env
  sed -i "s#/home/henrique/apps/ea-portal-leitor/credenciais#/etc/ea-portal-leitor#" /etc/ea-portal-leitor/leitor.env
  echo "ambiente magro instalado em /etc/ea-portal-leitor/leitor.env"
else
  echo "AVISO: $ORIGEM_ENV nao encontrado. Crie /etc/ea-portal-leitor/leitor.env a mao."
fi

# 4. unidade
install -o root -g root -m 0644 "$REPO/infra/systemd/portal/ea-portal-leitor.system.service" "$UNIDADE"
systemctl daemon-reload
systemctl enable --now ea-portal-leitor.service
systemctl --no-pager status ea-portal-leitor.service | head -20
echo
echo "Confira o isolamento:  systemd-analyze security ea-portal-leitor.service"
