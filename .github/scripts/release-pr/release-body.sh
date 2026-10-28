#!/usr/bin/env bash
version=$1
shift
printf '## Release %s\n\n' "$version"
"$(dirname "$0")/linked-issues.sh" "$@" | sed 's/^/- /'
