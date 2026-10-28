#!/usr/bin/env bash
dir=$(dirname "$0")
echo "pending=$("$dir/pending-prs.sh" | tr '\n' ' ')"
echo "open=$(gh pr list --base a4i/main --head a4i/staging --state open --json number --jq length)"
