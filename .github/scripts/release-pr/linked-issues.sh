#!/usr/bin/env bash
for pr in "$@"; do
  gh api graphql -F number="$pr" -f query='
    query($number: Int!) {
      repository(owner: "A4i-tech", name: "SEEDS") {
        pullRequest(number: $number) {
          closingIssuesReferences(first: 10) { nodes { url } }
        }
      }
    }' --jq '.data.repository.pullRequest.closingIssuesReferences.nodes[].url'
done | sort -u
