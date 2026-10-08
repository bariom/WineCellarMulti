from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.sensory_reference import TraitReview


class ReviewChoice(BaseModel):
    trait: TraitReview
    action: Literal["retain", "adjust", "blocked", "recorded"]
    proposed_value: float | None
    lower: float | None = None
    upper: float | None = None
    advice: str


class ReviewProposal(BaseModel):
    identity_id: UUID
    revision: str
    policy: str
    choices: list[ReviewChoice]
    previously_approved: bool
    undo_history_id: UUID | None = None


class ApplyReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    dimensions: list[str] = Field(min_length=1, max_length=9)
    acknowledged: Literal[True]


class UndoReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")


class AppliedReview(BaseModel):
    proposal: ReviewProposal
    history_id: UUID
