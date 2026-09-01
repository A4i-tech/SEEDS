from __future__ import annotations

import httpx
from bs4 import BeautifulSoup


class WebsiteExtractor:
    """Extract readable content from a public website."""

    async def extract(self, url: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 "
                        "(Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 "
                        "Chrome/138.0 Safari/537.36"
                    )
                },
                follow_redirects=True,
            )

        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        for tag in soup([
            "script",
            "style",
            "noscript",
            "svg",
            "footer",
            "header",
        ]):
            tag.decompose()

        title = ""

        if soup.title:
            title = soup.title.get_text(strip=True)

        content_tags = ["h1", "h2", "h3", "p", "li", "button", "span"]

        paragraphs = []
        seen: set[str] = set()

        for tag in soup.find_all(content_tags):
            # A container tag (e.g. <li> wrapping a <p>) whose text is
            # already captured by one of its own matching descendants -
            # counting it too would duplicate that descendant's text.
            if tag.find(content_tags) is not None:
                continue

            text = tag.get_text(" ", strip=True)

            if len(text) > 2 and text not in seen:
                seen.add(text)
                paragraphs.append(text)

        return {
            "url": url,
            "title": title,
            "content": paragraphs,
        }
