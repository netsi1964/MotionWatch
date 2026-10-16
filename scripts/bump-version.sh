#!/bin/sh
# Stamp a new version (Danish time, Europe/Copenhagen): versionYYYY-MM-DD-HH-MM
# Updates src/version.js and the service-worker cache name, so installed
# copies of the app (cache-first service worker) pick up the new files.
set -e
cd "$(dirname "$0")/.."
V="version$(TZ=Europe/Copenhagen date +%Y-%m-%d-%H-%M)"
printf '/** Build stamp (Danish time, Europe/Copenhagen). Updated by scripts/bump-version.sh before each deploy. */\nexport const VERSION = "%s";\n' "$V" > src/version.js
# -i.bak works with both GNU and BSD (macOS) sed
sed -i.bak "s|^const CACHE = .*|const CACHE = \"motionwatch-shell-$V\";|" sw.js && rm -f sw.js.bak
echo "$V"
