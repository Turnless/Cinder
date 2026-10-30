#!/bin/sh
# Runs before the Cinder worker starts (ExecStartPre). Refuses to start with missing or
# placeholder settings, with the master wallet key on the server, or with trading on SoDEX
# mainnet unless explicitly allowed. Installed to /opt/cinder/check-env.sh by update.sh.
fail=0

missing() {
  echo "cinder-worker: $1 is empty in /opt/cinder/.env.worker" >&2
  fail=1
}

check() {
  name="$1"
  eval "value=\${$name}"
  if [ -z "$value" ]; then
    missing "$name"
  else
    case "$value" in
      your_*|*your_*_here*|change_me)
        echo "cinder-worker: $name still has a placeholder value" >&2
        fail=1 ;;
    esac
  fi
}

for name in TURSO_DATABASE_URL TURSO_AUTH_TOKEN SOSOVALUE_API_KEY OPENAI_API_KEY; do
  check "$name"
done

# Autonomous trading needs Cinder's SoDEX API key (created with scripts/register-sodex-api-key.js)
if [ "$AUTO_TRADE_ENABLED" = "true" ]; then
  for name in SODEX_API_KEY_NAME SODEX_API_KEY_PRIVATE_KEY USER_WALLET_ADDRESS; do
    check "$name"
  done
fi

# The master wallet key can withdraw funds; the worker never needs it
if [ -n "$SODEX_MASTER_PRIVATE_KEY" ]; then
  echo "cinder-worker: remove SODEX_MASTER_PRIVATE_KEY from /opt/cinder/.env.worker; it must not be on the server" >&2
  fail=1
fi

# Mainnet needs a deliberate opt-in. The network setting is shared with the site.
network=$(printf '%s' "$NEXT_PUBLIC_SODEX_NETWORK" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
if [ "$network" = "mainnet" ] && [ "$ALLOW_MAINNET" != "true" ]; then
  echo "cinder-worker: NEXT_PUBLIC_SODEX_NETWORK is mainnet; add ALLOW_MAINNET=true to .env.worker if that is intended" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "cinder-worker: not starting. Edit /opt/cinder/.env.worker, then: systemctl restart cinder-worker" >&2
  exit 1
fi
echo "cinder-worker: settings check passed (network=${network:-testnet}, AUTO_TRADE_ENABLED=${AUTO_TRADE_ENABLED:-false})"
