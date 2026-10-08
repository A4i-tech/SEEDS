from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel

# Matches a plain hostname (e.g. "example.com"): dot-separated labels, each
# 1-63 chars of letters/digits/hyphens, no leading/trailing hyphen per label.
DOMAIN_RE = re.compile(
    r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63}(?<!-))+$"
)


def _normalize_domains(domains: list[str]) -> list[str]:
    normalized = list(dict.fromkeys(domain.strip().lower() for domain in domains))
    for domain in normalized:
        if not DOMAIN_RE.match(domain):
            raise ValueError(f"Invalid domain: {domain!r}")
    return normalized


AdditionalDomains = Annotated[list[str], AfterValidator(_normalize_domains)]


class ProjectCreateRequest(BaseModel):
    name: str
    description: str = ""
    source_language: str = "English"
    status: str = "Active"


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    source_language: str | None = None
    status: str | None = None


class LanguageConfig(BaseModel):
    code: str
    enabled: bool = True


class WebsiteCreateRequest(BaseModel):
    project_id: str | None = None
    domain: str
    additional_domains: AdditionalDomains = []
    name: str = ""
    status: str = "Active"
    languages: list[LanguageConfig] | None = None


class WebsiteUpdateRequest(BaseModel):
    name: str | None = None
    domain: str | None = None
    additional_domains: AdditionalDomains = []
    status: str | None = None
    languages: list[LanguageConfig] | None = None
