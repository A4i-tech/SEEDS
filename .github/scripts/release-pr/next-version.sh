#!/usr/bin/env bash
month=$(TZ=Asia/Kolkata date +%Y.%m)
last=$(gh pr list --base a4i/main --head a4i/staging --state all --limit 100 --json title \
  --jq "[.[].title | select(startswith(\"Release $month.\")) | split(\".\")[-1] | tonumber] | max // 0")
printf '%s.%02d\n' "$month" $((last + 1))
