from __future__ import annotations

import functools
import json
import logging
import re
from urllib.parse import urlparse

import httpx

from app.aggregators.iris_types import IrisBook, IrisConfig, IrisLoginResponse, IrisTactile
from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

_JSON_START = re.compile(r"^[\[{]", re.MULTILINE)


def parse_iris_json(text: str) -> object:
    match = _JSON_START.search(text)
    if match is None:
        raise RuntimeError("Iris response has no JSON body")
    if match.start() > 0:
        logger.warning("Iris response carried PHP warnings before the JSON body; stripped")
    return json.loads(text[match.start():])


class IrisClient:
    def __init__(self, config: IrisConfig) -> None:
        self._base_url = str(config.base_url).rstrip("/")
        self._mobile = config.mobile
        self._password = config.password
        self._http = httpx.AsyncClient(timeout=30.0, follow_redirects=False)
        self._jwt = ""
        self._cc_id = ""
        self._aid = ""

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get_session(self) -> str:
        if self._jwt:
            return self._jwt
        res = await self._http.post(
            f"{self._base_url}/login.php",
            data={"ph": self._mobile, "pw": self._password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        res.raise_for_status()
        body = parse_iris_json(res.text)
        login = IrisLoginResponse.model_validate(body)
        self._jwt = login.access_token
        self._cc_id = login.cc_id
        self._aid = login.aid
        return self._jwt

    async def _get(self, path: str, params: dict[str, str]) -> object:
        res = await self._http.get(
            f"{self._base_url}/{path}",
            params=params,
            headers={"Authorization": await self.get_session()},
        )
        res.raise_for_status()
        return parse_iris_json(res.text)

    async def list_books(self) -> list[IrisBook]:
        await self.get_session()
        body = await self._get("getBooks.php", {"id": self._cc_id})
        books: list[IrisBook] = []
        for b in body["data"]["books"]:
            details = json.loads(b["book_details"])
            tactiles = b["tactiles"]
            books.append(IrisBook(
                book_id=str(b["bookid"]),
                name=next(iter(details.values()))["name"],
                tactile_ids=[] if tactiles == [] else list(tactiles.keys()),
            ))
        return books

    async def list_tactiles(self, book_id: str) -> list[IrisTactile]:
        body = await self._get("viewTactiles.php", {"bookid": book_id, "type": "1"})
        language_ids = sorted({lang for variants in body.values() for v in variants for lang in v})
        audio_by_language: dict[str, list[str]] = {}
        for lang in language_ids:
            dl = await self._get(
                "downloadbook.php",
                {"id": self._aid, "bookid": book_id, "lastsync": "0", "language": lang},
            )
            audio_by_language[lang] = [p for t in dl["tactiles"] for p in t["paths"]]

        tactiles: list[IrisTactile] = []
        for tactile_id, variants in body.items():
            for variant in variants:
                for lang, v in variant.items():
                    urls = [
                        u for u in audio_by_language[lang]
                        if urlparse(u).path.split("/")[2] == tactile_id and urlparse(u).path.split("/")[3] == lang
                    ]
                    tactiles.append(IrisTactile(
                        tactile_id=tactile_id, language_id=lang,
                        title_english=v["title_english"], title=v["title"], content=v["content"],
                        author_id=str(v["author_id"]), is_poster=str(v["is_poster"]), audio_urls=urls,
                    ))
        return tactiles


@functools.cache
def get_iris_client() -> IrisClient:
    s = get_settings()
    return IrisClient(IrisConfig(base_url=s.iris_base_url, mobile=s.iris_mobile, password=s.iris_password))


async def close_iris_client() -> None:
    if get_iris_client.cache_info().currsize:
        await get_iris_client().aclose()
        get_iris_client.cache_clear()
