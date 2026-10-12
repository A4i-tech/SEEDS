from __future__ import annotations

import re

# Matches a plain hostname (e.g. "example.com"): dot-separated labels, each
# 1-63 chars of letters/digits/hyphens, no leading/trailing hyphen per label.
DOMAIN_RE = re.compile(
    r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63}(?<!-))+$"
)


def normalize_domain(domain: str) -> str:
    normalized = domain.strip().lower()
    if not DOMAIN_RE.match(normalized):
        raise ValueError(f"Invalid domain: {domain!r}")
    return normalized


def normalize_domains(domains: list[str]) -> list[str]:
    return list(dict.fromkeys(normalize_domain(domain) for domain in domains))
