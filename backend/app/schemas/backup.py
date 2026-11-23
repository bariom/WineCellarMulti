from pydantic import BaseModel, ConfigDict, Field


class BackupPreviewResponse(BaseModel):
    # "schema" would shadow a BaseModel attribute: the field is aliased in JSON.
    model_config = ConfigDict(populate_by_name=True)

    backup_schema: str = Field(alias="schema")
    exported_at: str
    household_name: str
    counts: dict[str, int]
    file_count: int
    target_empty: bool
    warnings: list[str]


class BackupRestoreResponse(BaseModel):
    restored: dict[str, int]
    skipped: dict[str, int]
    file_count: int
    warnings: list[str]
