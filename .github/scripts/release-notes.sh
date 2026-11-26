#!/usr/bin/env bash
# usage: release-notes.sh version | notes <git-range> <version>   (needs GH_TOKEN, GITHUB_REPOSITORY)
set -euo pipefail
repo="${GITHUB_REPOSITORY:?}"

case "${1:?}" in
  version)
    ym=$(date +%Y.%m)
    n=$(git tag --list "v${ym}.*" | wc -l)
    printf '%s.%02d\n' "$ym" $((n + 1))
    ;;
  notes)
    range="${2:?}"
    version="${3:?}"
    prs=$(git log --format=%s "$range" | sed -nE 's/^Merge pull request #([0-9]+) from .*|.*\(#([0-9]+)\)$/\1\2/p' | sort -un)
    echo "## Release $version"
    echo
    if [ -z "$prs" ]; then
      echo "No changes since the last release."
    else
      for pr in $prs; do
        gh api graphql -F number="$pr" -f query='
          query($number: Int!) {
            repository(owner: "'"${repo%/*}"'", name: "'"${repo#*/}"'") {
              pullRequest(number: $number) {
                title
                closingIssuesReferences(first: 10) { nodes { number repository { nameWithOwner } } }
              }
            }
          }' --jq '.data.repository.pullRequest | "- \(.title) (" + ([.closingIssuesReferences.nodes[] | "\(.repository.nameWithOwner)#\(.number)"] + ["'"$repo"'#'"$pr"'"] | join(", ")) + ")"'
      done
    fi
    echo
    echo "All releases: https://github.com/$repo/releases"
    ;;
  *)
    echo "usage: $0 version | notes <git-range> <version>" >&2
    exit 2
    ;;
esac
