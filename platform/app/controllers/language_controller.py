from __future__ import annotations

from fastapi import APIRouter

from app.models.responses.language import LanguageListResponse
from app.platform.database import get_database
from app.repositories.website_repository import WebsiteRepository
from app.services.language_service import list_languages as get_supported_languages
from app.services.language_service import list_languages_for_site

router = APIRouter(prefix="/v1", tags=["Languages"])


@router.get(
    "/languages",
    response_model=LanguageListResponse,
    summary="List languages: the full platform catalog, or a site's own enabled languages when site_id is given",
)
async def list_languages(site_id: str | None = None) -> LanguageListResponse:
    if site_id is None:
        return get_supported_languages()
    website = await WebsiteRepository(get_database()).find_by_site_id(site_id)
    return LanguageListResponse(languages=list_languages_for_site(website))
