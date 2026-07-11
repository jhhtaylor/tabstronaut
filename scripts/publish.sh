#!/usr/bin/env bash
set -euo pipefail

if [ -z "${OVSX_PAT:-}" ]; then
  echo "OVSX_PAT is not set (needed to publish to open-vsx.org). Add it to your shell profile." >&2
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
VSIX="tabstronaut-${VERSION}.vsix"

npx vsce package

npx vsce publish --packagePath "$VSIX"
npx ovsx publish "$VSIX" --pat "$OVSX_PAT"

echo "Published ${VSIX} to VS Code Marketplace and Open VSX."
