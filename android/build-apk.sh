#!/usr/bin/env bash
# Builds the Maraca POS APK: a Trusted Web Activity (TWA) that opens
# https://maruposu.vercel.app/pos full screen in Chrome, so the tablet runs the
# same offline-first app as an installed app. Web updates need no new APK;
# rebuild only when twa-manifest.json changes (bump appVersionCode).
#
# Needs (outside the repo, never commit them):
#   ~/.maruposu-android/maruposu-release.keystore  signing key (back it up: updates
#                                                  must be signed with the same key)
#   ~/.maruposu-android/keystore.env               BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD
#   ~/.bubblewrap/config.json                      jdkPath + androidSdkPath (JDK 17, Android SDK)
# Output: ~/.maruposu-android/twa/app-release-signed.apk
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
KEYDIR=${MARUPOSU_ANDROID_DIR:-$HOME/.maruposu-android}
WORK=$KEYDIR/twa
mkdir -p "$WORK"
set -a; . "$KEYDIR/keystore.env"; set +a
python3 - "$HERE/twa-manifest.json" "$WORK/twa-manifest.json" "$KEYDIR/maruposu-release.keystore" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
m["signingKey"]["path"] = sys.argv[3]
json.dump(m, open(sys.argv[2], "w"), indent=2)
PY
cd "$WORK"
npx -y @bubblewrap/cli@1.27.0 update --skipVersionUpgrade </dev/null
npx -y @bubblewrap/cli@1.27.0 build --skipPwaValidation </dev/null
ls -la "$WORK"/*.apk
