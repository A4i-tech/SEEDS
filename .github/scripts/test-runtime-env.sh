#!/bin/sh
set -eu
script="$1/runtime-env.sh"
vars=$(sed -n 's/^VARS="\(.*\)"$/\1/p' "$script")
tmp=$(mktemp -d)
echo '<meta content="__GOOGLE_SITE_VERIFICATION__">' > "$tmp/index.html.tpl"

run() { env -i PATH="$PATH" HTML_DIR="$tmp" TPL_DIR="$tmp" "$@" sh "$script" 2>"$tmp/err"; }
good() { for v in $vars; do printf '%s=value-1 ' "$v"; done; }
rejects() { # <expected stderr text> <env assignments...>
  want="$1"; shift
  if run "$@"; then echo "FAIL: accepted bad config ($want)"; exit 1; fi
  grep -q "$want" "$tmp/err" || { echo "FAIL: expected '$want', got: $(cat "$tmp/err")"; exit 1; }
}

run $(good) || { echo "FAIL: valid config rejected: $(cat "$tmp/err")"; exit 1; }
for v in $vars; do
  grep -q "\"$v\":\"value-1\"" "$tmp/env.js" || { echo "FAIL: $v missing from env.js"; exit 1; }
done
if grep -q GOOGLE_SITE "$script"; then
  grep -q 'content="value-1"' "$tmp/index.html" || { echo "FAIL: index.html token not rendered"; exit 1; }
fi

for v in $vars; do
  rejects "ERROR: $v is required" $(good | sed "s/$v=value-1 //")
  for bad in 'a"b' 'a\b' 'a<b' 'a&b' 'a|b' "a$(printf '\t')b"; do
    rejects "ERROR: $v contains" $(good | sed "s/$v=value-1 //") "$v=$bad"
  done
done
echo "OK: $1"
