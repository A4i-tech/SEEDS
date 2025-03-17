from typing import List
from pydantic import BaseModel, Field

class Title(BaseModel):
    english: str
    local: str
    audioUrl: str


class Theme(BaseModel):
    english: str
    local: str
    audioUrl: str


class AudioContent(BaseModel):
    description: str
    audioUrl: str


class PureAudioData(BaseModel):
    id: str = Field(..., alias="_id")  # Maps "_id" from JSON
    type: str  # e.g., "song" or "story"
    description: str
    language: str
    title: Title
    theme: Theme
    audioContent: List[AudioContent]
    isPullModel: bool
    isTeacherApp: bool
    createdBy: str
    creation_time: int
    isDeleted: bool

    def dict(self, **kwargs):
        data_dict = super().dict(by_alias=True, **kwargs)
        data_dict["title"] = self.title.dict(**kwargs)
        data_dict["theme"] = self.theme.dict(**kwargs)
        data_dict["audioContent"] = [item.dict(**kwargs) for item in self.audioContent]
        return data_dict
