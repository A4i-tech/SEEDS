from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator, BaseModel

from app.platform.domain import normalize_domain, normalize_domains

Domain = Annotated[str, AfterValidator(normalize_domain)]
AdditionalDomains = Annotated[list[str], AfterValidator(normalize_domains)]


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
    domain: Domain
    additional_domains: AdditionalDomains = []
    name: str = ""
    status: str = "Active"
    languages: list[LanguageConfig] | None = None


class WebsiteUpdateRequest(BaseModel):
    name: str | None = None
    domain: Domain | None = None
    additional_domains: AdditionalDomains | None = None
    status: str | None = None
    languages: list[LanguageConfig] | None = None
