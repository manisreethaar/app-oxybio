#!/bin/bash
set -e

echo "========================================================="
echo "   OXYBIO - Supabase Self-Hosted Ubuntu Setup Script     "
echo "========================================================="
echo "This script will install Docker and start Supabase locally."
echo ""

# 1. Install Docker & Git
echo "=> Installing Docker and dependencies..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git jq

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 2. Clone Supabase Docker Repo
echo "=> Downloading Supabase..."
cd ~
if [ -d "supabase-docker" ]; then
  echo "Supabase directory already exists. Skipping clone."
else
  git clone --depth 1 https://github.com/supabase/supabase.git supabase-docker
fi

cd supabase-docker/docker

# 3. Setup .env with secure keys
echo "=> Generating secure keys..."
cp .env.example .env

# Generate secure random strings
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -base64 32 | tr -d '+/' | cut -c1-40)
ANON_KEY=$(openssl rand -base64 32 | tr -d '+/' | cut -c1-40)
SERVICE_ROLE_KEY=$(openssl rand -base64 32 | tr -d '+/' | cut -c1-40)

# We update the .env file with the new passwords
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
sed -i "s/^ANON_KEY=.*/ANON_KEY=$ANON_KEY/" .env
sed -i "s/^SERVICE_ROLE_KEY=.*/SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY/" .env

# Update API external URL to localhost for now
sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=http://localhost:8000|" .env

# 4. Start Supabase
echo "=> Starting Supabase Database (This may take a few minutes)..."
sudo docker compose pull
sudo docker compose up -d

echo ""
echo "========================================================="
echo "   SUPABASE INSTALLED SUCCESSFULLY!                      "
echo "========================================================="
echo "Supabase Studio is now running on your server at:"
echo "http://localhost:8000"
echo ""
echo "Database Password: $POSTGRES_PASSWORD"
echo "JWT Secret: $JWT_SECRET"
echo "Anon Key: $ANON_KEY"
echo "Service Role Key: $SERVICE_ROLE_KEY"
echo "========================================================="
echo "SAVE THESE KEYS! We will need them for the OXYBIO app."
echo ""
echo "NEXT STEPS for Cloudflare Tunnel:"
echo "1. Go to your personal laptop and visit: https://dash.cloudflare.com/sign-up"
echo "2. Create a free account."
echo "3. Go to 'Zero Trust' -> 'Networks' -> 'Tunnels'."
echo "4. Create a tunnel named 'oxybio-db'."
echo "5. Cloudflare will give you a command that looks like:"
echo "   sudo cloudflared service install eyJh..."
echo "6. Run that command here on this Ubuntu server."
echo "7. In Cloudflare, route the tunnel to 'http://localhost:8000'."
echo "========================================================="
