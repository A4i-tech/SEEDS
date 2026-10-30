#!/bin/sh
set -eu
HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"
VARS="REACT_APP_API_BASE_URL REACT_APP_STORAGE_ACCOUNT_NAME REACT_APP_GOOGLE_SITE_VERIFICATION"
out=""
for v in $VARS; do
  val=$(printenv "$v" || true)
  if [ -z "$val" ]; then
    echo "ERROR: $v is required and was not set. Set it as a container environment variable and restart." >&2
    exit 1
  fi
  case $val in
    *'"'*|*'\'*|*'<'*|*'&'*|*'|'*|*[[:cntrl:]]*|*[[:space:]]*)
      echo "ERROR: $v contains a forbidden character (\" \ < & |, whitespace, or a control character). Remove it and restart." >&2
      exit 1 ;;
  esac
  # Only index.html uses the Google token, so keep it out of env.js.
  [ "$v" = REACT_APP_GOOGLE_SITE_VERIFICATION ] || out="$out\"$v\":\"$val\","
done
echo "window.__ENV__ = {$out};" > "$HTML_DIR/env.js"
# Google reads the raw HTML, so the verification token goes into index.html.
sed "s|__GOOGLE_SITE_VERIFICATION__|$REACT_APP_GOOGLE_SITE_VERIFICATION|" "${TPL_DIR:-/opt}/index.html.tpl" > "$HTML_DIR/index.html"
