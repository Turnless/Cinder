#!/bin/sh
# Updates the Cinder worker to the latest code on GitHub's main branch, and installs the
# start-up check, systemd unit and this script from deploy/vps/ so the server matches the repo.
# Usage (as root on the server):  /opt/cinder/update.sh
set -e
cd /opt/cinder/app

before=$(sudo -u cinder git rev-parse --short HEAD)
sudo -u cinder git fetch -q origin main
sudo -u cinder git reset -q --hard origin/main
after=$(sudo -u cinder git rev-parse --short HEAD)

changed=0
if [ "$before" != "$after" ]; then
  echo "Updating $before -> $after:"
  sudo -u cinder git log --oneline "$before..$after"
  sudo -u cinder -H npm ci --omit=dev --no-audit --no-fund
  changed=1
fi

# Server files that live in the repo
if ! cmp -s deploy/vps/check-env.sh /opt/cinder/check-env.sh; then
  install -m 755 deploy/vps/check-env.sh /opt/cinder/check-env.sh
  echo "Installed the new check-env.sh."
  changed=1
fi
if ! cmp -s deploy/vps/cinder-worker.service /etc/systemd/system/cinder-worker.service; then
  install -m 644 deploy/vps/cinder-worker.service /etc/systemd/system/cinder-worker.service
  systemctl daemon-reload
  echo "Installed the new systemd unit."
  changed=1
fi
if ! cmp -s deploy/vps/update.sh /opt/cinder/update.sh; then
  # Through a new file, so this running copy is not rewritten under itself
  install -m 755 deploy/vps/update.sh /opt/cinder/update.sh.new
  mv /opt/cinder/update.sh.new /opt/cinder/update.sh
  echo "Installed the new update.sh."
fi

if [ "$changed" -eq 0 ]; then
  echo "Already up to date ($after)."
  exit 0
fi

if systemctl is-active --quiet cinder-worker; then
  echo "Restarting worker (running jobs get up to 60s to finish)..."
  systemctl restart cinder-worker
  sleep 5
  systemctl --no-pager --lines=0 status cinder-worker | head -3
else
  echo "Worker is not running; start it with: systemctl start cinder-worker"
fi
