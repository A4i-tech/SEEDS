#!/bin/sh
set -eu
SRC_DIR="${SRC_DIR:-/opt/app}"
HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"
VARS="REACT_APP_API_BASE_URL REACT_APP_STORAGE_ACCOUNT_NAME"
set --
for v in $VARS; do
  val=$(printenv "$v" || true)
  if [ -z "$val" ]; then
    echo "ERROR: $v is required and was not set. Set it as a container environment variable and restart." >&2
    exit 1
  fi
  case $val in
    *'"'*|*'\'*|*'<'*|*'&'*|*'|'*|*[[:cntrl:]]*)
      echo "ERROR: $v contains a forbidden character (\" \ < & | or a control character). Remove it and restart." >&2
      exit 1 ;;
  esac
  set -- "$@" -e "s|__${v}__|$val|g"
done
cp -R "$SRC_DIR"/. "$HTML_DIR"/
find "$HTML_DIR" -type f \( -name '*.js' -o -name '*.html' \) -exec sed -i "$@" {} +
