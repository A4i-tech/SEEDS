#!/bin/sh
set -eu
script="$1/runtime-env.sh"
vars=$(sed -n 's/^VARS="\(.*\)"$/\1/p' "$script")
tmp=$(mktemp -d)
mkdir "$tmp/src" "$tmp/html"
for v in $vars; do echo "x=\"__${v}__\";" >> "$tmp/src/main.js"; done

run() { env -i PATH="$PATH" SRC_DIR="$tmp/src" HTML_DIR="$tmp/html" "$@" sh "$script" 2>"$tmp/err"; }
good() { for v in $vars; do printf '%s=value-1 ' "$v"; done; }
rejects() {
  want="$1"; shift
  if run "$@"; then echo "FAIL: accepted bad config ($want)"; exit 1; fi
  grep -q "$want" "$tmp/err" || { echo "FAIL: expected '$want', got: $(cat "$tmp/err")"; exit 1; }
}

run $(good) || { echo "FAIL: valid config rejected: $(cat "$tmp/err")"; exit 1; }
for v in $vars; do
  grep -q "x=\"value-1\";" "$tmp/html/main.js" || { echo "FAIL: $v not substituted"; exit 1; }
done
if grep -q '__REACT_APP' "$tmp/html/main.js"; then echo "FAIL: placeholder left in output"; exit 1; fi
run $(good | sed 's/value-1/value-2/g') || { echo "FAIL: restart rejected"; exit 1; }
grep -q 'value-2' "$tmp/html/main.js" || { echo "FAIL: restart kept old value"; exit 1; }

for v in $vars; do
  rejects "ERROR: $v is required" $(good | sed "s/$v=value-1 //")
  for bad in 'a"b' 'a\b' 'a<b' 'a&b' 'a|b' "a$(printf '\t')b"; do
    rejects "ERROR: $v contains" $(good | sed "s/$v=value-1 //") "$v=$bad"
  done
done
echo "OK: $1"
