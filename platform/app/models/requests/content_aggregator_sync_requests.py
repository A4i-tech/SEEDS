from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictInt


class SyncAllRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    only_new: bool = Field(False, alias="onlyNew")
    dry_run: bool = Field(False, alias="dryRun")
    limit: StrictInt = Field(0, ge=0)


class SyncCourseRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    dry_run: bool = Field(False, alias="dryRun")


class ProblemChoiceEdit(BaseModel):
    value: str
    text: str


class ProblemBlockEditRequest(BaseModel):
    question: str
    choices: list[ProblemChoiceEdit]
