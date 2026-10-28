#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/vite-project"
if ! command -v node >/dev/null; then
  if [[ -s /root/.nvm/nvm.sh ]]; then source /root/.nvm/nvm.sh; fi
fi
if ! command -v node >/dev/null; then echo '需要 Node.js 20.19+ 或 22.12+'; exit 1; fi
[[ -d node_modules ]] || npm ci
npm run build
echo '上下分屏：http://localhost:5173  纯主屏：http://localhost:5173/display  独立裁判：http://localhost:5173/control'
exec npm run preview -- --host 0.0.0.0 --port 5173 --strictPort
