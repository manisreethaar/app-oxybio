#!/bin/bash
echo "Fixing Cloudflare Tunnel configuration..."

UUID="4828ff3c-4fb7-4e5d-98ab-c35fbf67a8b9"
CERT_DIR="/root/.cloudflared"

echo "Tunnel UUID: $UUID"

sudo mkdir -p /etc/cloudflared
sudo bash -c "cat << EOF > /etc/cloudflared/config.yml
tunnel: $UUID
credentials-file: /etc/cloudflared/$UUID.json

ingress:
  - hostname: db.oxygenbioinnovations.com
    service: http://localhost:8000
  - service: http_status:404
EOF"

sudo cp $CERT_DIR/$UUID.json /etc/cloudflared/ 2>/dev/null || echo "JSON copy skipped or failed"

sudo cloudflared service uninstall || true
sudo cloudflared service install
sudo systemctl restart cloudflared

echo "Tunnel fixed and restarted!"
