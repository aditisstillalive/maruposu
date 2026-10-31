#!/usr/bin/env bash
# Builds the Maraca POS Android app (android/): the web till in a WebView plus
# Bluetooth ESC/POS printing. Web updates need no new APK; rebuild when this
# folder changes (bump versionCode/versionName in app/build.gradle).
#
# Needs, outside the repo (never commit them):
#   ~/.maruposu-android/maruposu-release.keystore  signing key — back it up: every
#                                                  update must be signed with it
#   ~/.maruposu-android/keystore.env               BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD
#   JDK 17 and the Android SDK (ANDROID_HOME, default ~/android-sdk)
# Output: ~/.maruposu-android/maruposu-<version>.apk
set -euo pipefail
cd "$(dirname "$0")"
KEYDIR=${MARUPOSU_ANDROID_DIR:-$HOME/.maruposu-android}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/android-sdk}
echo "sdk.dir=$ANDROID_HOME" > local.properties
set -a; . "$KEYDIR/keystore.env"; set +a
env -u NODE_ENV ./gradlew --no-daemon -q assembleRelease
VERSION=$(sed -n "s/.*versionName '\(.*\)'.*/\1/p" app/build.gradle)
cp app/build/outputs/apk/release/app-release.apk "$KEYDIR/maruposu-$VERSION.apk"
ls -la "$KEYDIR/maruposu-$VERSION.apk"
