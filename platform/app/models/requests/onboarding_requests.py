"""Request schemas for project/website onboarding endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class ProjectCreateRequest(BaseModel):
    name: str
    description: str = ""
    sourceLanguage: str = "English"
    status: str = "Active"


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    sourceLanguage: str | None = None
    status: str | None = None


class WebsiteCreateRequest(BaseModel):
    projectId: str
    domain: str
    name: str = ""
    status: str = "Active"


class WebsiteUpdateRequest(BaseModel):
    name: str | None = None
    domain: str | None = None
    status: str | None = None
