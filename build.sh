#!/bin/bash
# 소스(src/) → index.html 단일 파일 빌드. 테스트 통과 없이는 빌드하지 않는다.
set -e
cd "$(dirname "$0")"
npm test
cat src/head.html src/engine.js > index.html
printf '</script>\n<script>\n' >> index.html
cat src/ui.js >> index.html
printf '</script>\n</body>\n</html>\n' >> index.html
echo "BUILD OK → index.html ($(wc -c < index.html | tr -d ' ') bytes)"
