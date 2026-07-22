from pydantic import BaseModel


class WebsiteTranslationRequest(BaseModel):
    content: str
    targetLanguage: str