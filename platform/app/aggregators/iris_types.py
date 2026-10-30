from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, HttpUrl, UrlConstraints


def _reject_credentials(url: HttpUrl) -> HttpUrl:
    if url.username or url.password:
        raise ValueError("audio URL must not carry credentials")
    return url


IrisAudioUrl = Annotated[HttpUrl, UrlConstraints(allowed_schemes=["https"]), AfterValidator(_reject_credentials)]


class IrisBook(BaseModel):
    model_config = ConfigDict(frozen=True)

    book_id: str
    name: str
    tactile_ids: list[str]


class IrisTactile(BaseModel):
    model_config = ConfigDict(frozen=True)

    tactile_id: str
    language_id: str
    title_english: str
    title: str
    content: dict[str, str]
    author_id: str
    is_poster: str
    audio_urls: list[IrisAudioUrl]


class IrisConfig(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)

    base_url: Annotated[HttpUrl, UrlConstraints(allowed_schemes=["https"])]
    mobile: str = Field(min_length=1)
    password: str = Field(min_length=1)


class IrisLoginResponse(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)

    access_token: str = Field(alias="accessToken", min_length=1)
    cc_id: str
    aid: str
