#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed." >&2
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "Error: npm is not installed." >&2
  exit 1
fi

node -e "const v=+process.version.slice(1).split('.')[0]; if(v<18){process.stderr.write('Error: Node.js 18+ required, found '+process.version+'\n');process.exit(1)}"

if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ] 2>/dev/null; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting AI Lens..."
echo "  Open: http://localhost:5173"
echo ""

npm run dev
