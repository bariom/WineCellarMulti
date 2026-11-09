"""Generic Excel / spreadsheet import (docs/SPREADSHEET_IMPORT.md).

The client keeps the file and sends it again at each step; nothing is stored.
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.api.deps import CurrentContext, require_admin_context
from app.schemas.spreadsheet_import import SpreadsheetAnalysis
from app.services.spreadsheet_import.analysis import analyze_workbook
from app.services.spreadsheet_import.reader import (
    MAX_FILE_BYTES,
    SpreadsheetError,
    Workbook,
    read_workbook,
)

router = APIRouter(prefix="/imports/spreadsheet")


async def read_upload(file: UploadFile) -> tuple[bytes, str]:
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "file_too_large", "message": "The file is larger than 5 MB."},
        )
    return content, file.filename or ""


def spreadsheet_error(error: SpreadsheetError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"code": error.code, "message": str(error)},
    )


def analyze_content(content: bytes, filename: str) -> SpreadsheetAnalysis:
    workbook: Workbook = read_workbook(content, filename)
    return analyze_workbook(workbook)


@router.post("/analyze", response_model=SpreadsheetAnalysis)
async def analyze_spreadsheet(
    file: UploadFile = File(...),
    context: CurrentContext = Depends(require_admin_context),
) -> SpreadsheetAnalysis:
    """Propose the kind of each table and the field of each column; writes nothing."""
    del context  # Admins of the active household only; the analysis reads no cellar data.
    content, filename = await read_upload(file)
    try:
        return await run_in_threadpool(analyze_content, content, filename)
    except SpreadsheetError as error:
        raise spreadsheet_error(error) from error
