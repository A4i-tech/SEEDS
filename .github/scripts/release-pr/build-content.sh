#!/usr/bin/env bash
dir=$(dirname "$0")
version=$("$dir/next-version.sh")
echo "title=Release $version"
echo 'body<<EOF'
"$dir/release-body.sh" "$version" $PENDING
echo EOF
