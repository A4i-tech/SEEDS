from __future__ import annotations

from pydantic import BaseModel


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
    name: str = ""
    status: str = "Active"
    languages: list[LanguageConfig] | None = None


class WebsiteUpdateRequest(BaseModel):
    name: str | None = None
    domain: str | None = None
    status: str | None = None
    languages: list[LanguageConfig] | None = None
