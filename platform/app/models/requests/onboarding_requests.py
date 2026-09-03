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


class WebsiteCreateRequest(BaseModel):
    project_id: str
    domain: str
    name: str = ""
    status: str = "Active"


class WebsiteUpdateRequest(BaseModel):
    name: str | None = None
    domain: str | None = None
    status: str | None = None
