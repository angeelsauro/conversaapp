#!/bin/bash
# Run inside a Bubblewrap project after `bubblewrap update`, before `bubblewrap build`.
# Fixes Bubblewrap 1.27's template for today's tools (checked on 9 Oct 2026):
#  - AGP 8.9.1 cannot read the current Android 36 platform package → AGP 8.13.2 with Gradle 8.14.3;
#  - the retired jcenter() repository → mavenCentral();
#  - the web manifest copied into the app always points at the app's own host (the admin
#    panel is behind Cloudflare Access, so Bubblewrap reads it from the public app instead).
# androidbrowserhelper 2.7.x needs minSdkVersion 24: set it in twa-manifest.json.
set -e
host=$(python3 -c "import json;print(json.load(open('twa-manifest.json'))['host'])")
sed -i "s#com.android.tools.build:gradle:8.9.1#com.android.tools.build:gradle:8.13.2#" build.gradle
sed -i 's/jcenter()/mavenCentral()/' build.gradle
sed -i 's#gradle-8.11.1-bin.zip#gradle-8.14.3-bin.zip#' gradle/wrapper/gradle-wrapper.properties
sed -i '/distributionSha256Sum/d' gradle/wrapper/gradle-wrapper.properties
sed -i -E "s#(resValue \"string\", \"webManifestUrl\", )'[^']*'#\1'https://$host/manifest.webmanifest'#" app/build.gradle
grep -q "gradle:8.13.2" build.gradle && grep -q "minSdkVersion 24" app/build.gradle && echo "Plantilla corregida para $host"
