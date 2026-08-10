#!/bin/bash
# 배포 게이트 (수정 지시서 §6): npm test 실패 시 배포가 막힌다.
set -e
cd "$(dirname "$0")"
bash build.sh          # 내부에서 npm test 선행 — 실패 시 여기서 중단
git add -A
git commit -m "${1:-deploy}" || true
git push origin main
echo "DEPLOYED"
