from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_write_context
from app.db.session import get_db
from app.models import UserTag, UserWineTag
from app.schemas.tags import UserTagCreate, UserTagResponse, UserTagUpdate


router = APIRouter(prefix="/tags")


def clean_tag_name(value: str) -> str:
    return " ".join(value.strip().split())[:80]


def get_user_tag(db: Session, context: CurrentContext, tag_id: UUID) -> UserTag:
    tag = db.scalar(select(UserTag).where(UserTag.id == tag_id, UserTag.user_id == context.user.id))
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    return tag


def get_or_create_user_tag(db: Session, context: CurrentContext, name: str, color: str = "") -> UserTag:
    cleaned_name = clean_tag_name(name)
    if not cleaned_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag name is required")
    tag = db.scalar(
        select(UserTag).where(
            UserTag.user_id == context.user.id,
            func.lower(UserTag.name) == cleaned_name.lower(),
        ),
    )
    if tag is not None:
        return tag
    tag = UserTag(user_id=context.user.id, name=cleaned_name, color=color.strip()[:16])
    db.add(tag)
    db.flush()
    return tag


@router.get("", response_model=list[UserTagResponse])
def list_tags(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> list[UserTag]:
    return list(db.scalars(select(UserTag).where(UserTag.user_id == context.user.id).order_by(UserTag.name.asc())))


@router.post("", response_model=UserTagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    payload: UserTagCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> UserTag:
    tag = get_or_create_user_tag(db, context, payload.name, payload.color)
    db.commit()
    db.refresh(tag)
    return tag


@router.patch("/{tag_id}", response_model=UserTagResponse)
def update_tag(
    tag_id: UUID,
    payload: UserTagUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> UserTag:
    tag = get_user_tag(db, context, tag_id)
    if payload.name is not None:
        cleaned_name = clean_tag_name(payload.name)
        if not cleaned_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag name is required")
        existing = db.scalar(
            select(UserTag).where(
                UserTag.user_id == context.user.id,
                func.lower(UserTag.name) == cleaned_name.lower(),
                UserTag.id != tag.id,
            ),
        )
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists")
        tag.name = cleaned_name
    if payload.color is not None:
        tag.color = payload.color.strip()[:16]
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> Response:
    tag = get_user_tag(db, context, tag_id)
    db.query(UserWineTag).filter(UserWineTag.user_id == context.user.id, UserWineTag.tag_id == tag.id).delete()
    db.delete(tag)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
