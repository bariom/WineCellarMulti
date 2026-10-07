from pydantic import BaseModel, ConfigDict

from app.schemas.sensory_agent import SensoryEstimate, SourceEvidence


class RefinementDimensions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: SensoryEstimate | None
    acidity: SensoryEstimate | None
    tannin: SensoryEstimate | None
    sweetness: SensoryEstimate | None
    aromatic_intensity: SensoryEstimate | None
    fruit: SensoryEstimate | None
    wood: SensoryEstimate | None
    spice: SensoryEstimate | None
    minerality: SensoryEstimate | None


class SensoryRefinementOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    producer: str
    vintage: str
    identity_evidence: SourceEvidence
    dimensions: RefinementDimensions
