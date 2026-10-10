#!/bin/sh
# Copia o certificado do Let's Encrypt para o coturn (que roda como "turnserver" e não lê
# /etc/letsencrypt). Instale em /etc/letsencrypt/renewal-hooks/deploy/ para rodar a cada renovação.
# Troque SEU_DOMINIO abaixo.
set -e
DOMAIN=SEU_DOMINIO
install -D -m 0644 -o root -g turnserver "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /etc/coturn/certs/fullchain.pem
install -D -m 0640 -o root -g turnserver "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /etc/coturn/certs/privkey.pem
systemctl restart coturn || true
