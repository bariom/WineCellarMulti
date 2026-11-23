from pydantic import BaseModel, ConfigDict, Field


class BackupPreviewResponse(BaseModel):
    # "schema" would shadow a BaseModel attribute: the field is aliased in JSON.
    model_config = ConfigDict(populate_by_name=True)

    backup_schema: str = Field(alias="schema")
    exported_at: str
    household_name: str
    counts: dict[str, int]
    file_count: int
    # Bottle photos (each saved in two sizes), memory photos and purchase documents.
    photo_counts: dict[str, int] = Field(default_factory=dict)
    target_empty: bool
    warnings: list[str]
    # Restores this upload without sending it again; valid for 30 minutes.
    upload_token: str = ""


class BackupRestoreResponse(BaseModel):
    restored: dict[str, int]
    skipped: dict[str, int]
    file_count: int
    warnings: list[str]
