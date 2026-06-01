from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_admin_context
from app.core.config import settings
from app.core.security import hash_invite_token, new_invite_token
from app.db.session import get_db
from app.models import Household, HouseholdInvite, Membership, User
from app.schemas.household import (
    HouseholdMembershipResponse,
    HouseholdSwitch,
    InviteAccept,
    InviteCreate,
    InviteResponse,
    MemberResponse,
    MemberRoleUpdate,
)


router = APIRouter(prefix="/household")


def member_response(db: Session, membership: Membership) -> MemberResponse:
    user = db.get(User, membership.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member user not found")
    return MemberResponse(
        membership_id=membership.id,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=membership.role,
    )


@router.get("/memberships", response_model=list[HouseholdMembershipResponse])
def list_household_memberships(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[HouseholdMembershipResponse]:
    memberships = db.scalars(select(Membership).where(Membership.user_id == context.user.id))
    results: list[HouseholdMembershipResponse] = []
    for membership in memberships:
        household = db.get(Household, membership.household_id)
        if household is None:
            continue
        results.append(
            HouseholdMembershipResponse(
                membership_id=membership.id,
                household_id=household.id,
                household_name=household.name,
                role=membership.role,
            ),
        )
    return results


@router.post("/switch", response_model=HouseholdMembershipResponse)
def switch_household(
    payload: HouseholdSwitch,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> HouseholdMembershipResponse:
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == context.user.id,
            Membership.household_id == payload.household_id,
        ),
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No membership for household")
    household = db.get(Household, membership.household_id)
    if household is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")

    context.session.active_household_id = household.id
    db.commit()
    db.refresh(context.session)
    return HouseholdMembershipResponse(
        membership_id=membership.id,
        household_id=household.id,
        household_name=household.name,
        role=membership.role,
    )


@router.get("/members", response_model=list[MemberResponse])
def list_members(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[MemberResponse]:
    memberships = db.scalars(
        select(Membership)
        .where(Membership.household_id == context.household.id)
        .order_by(Membership.role.asc(), Membership.id.asc()),
    )
    return [member_response(db, membership) for membership in memberships]


@router.post("/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: InviteCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> InviteResponse:
    email = payload.email.lower()
    invited_user = db.scalar(select(User).where(User.email == email))
    if invited_user is not None:
        existing_membership = db.scalar(
            select(Membership).where(
                Membership.user_id == invited_user.id,
                Membership.household_id == context.household.id,
            ),
        )
        if existing_membership is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")
    token = new_invite_token()
    invite = HouseholdInvite(
        household_id=context.household.id,
        invited_by_user_id=context.user.id,
        email=email,
        role=payload.role,
        token_hash=hash_invite_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.invite_ttl_days),
        created_at=datetime.now(timezone.utc),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return InviteResponse(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
        invite_token=token,
    )


@router.get("/invites", response_model=list[InviteResponse])
def list_invites(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> list[InviteResponse]:
    invites = db.scalars(
        select(HouseholdInvite)
        .where(HouseholdInvite.household_id == context.household.id)
        .order_by(HouseholdInvite.created_at.desc()),
    )
    return [
        InviteResponse(
            id=invite.id,
            email=invite.email,
            role=invite.role,
            expires_at=invite.expires_at,
            accepted_at=invite.accepted_at,
            invite_token=None,
        )
        for invite in invites
    ]


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> Response:
    invite = db.scalar(
        select(HouseholdInvite).where(
            HouseholdInvite.id == invite_id,
            HouseholdInvite.household_id == context.household.id,
        ),
    )
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    db.delete(invite)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/invites/accept", response_model=MemberResponse)
def accept_invite(
    payload: InviteAccept,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> MemberResponse:
    invite = db.scalar(select(HouseholdInvite).where(HouseholdInvite.token_hash == hash_invite_token(payload.token)))
    if invite is None or invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite expired")
    if invite.email.lower() != context.user.email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invite belongs to another email")

    existing = db.scalar(
        select(Membership).where(
            Membership.user_id == context.user.id,
            Membership.household_id == invite.household_id,
        ),
    )
    if existing is not None:
        invite.accepted_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return member_response(db, existing)

    membership = Membership(user_id=context.user.id, household_id=invite.household_id, role=invite.role)
    invite.accepted_at = datetime.now(timezone.utc)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return member_response(db, membership)


@router.patch("/members/{membership_id}", response_model=MemberResponse)
def update_member_role(
    membership_id: UUID,
    payload: MemberRoleUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> MemberResponse:
    membership = db.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.household_id == context.household.id,
        ),
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role cannot be changed")
    membership.role = payload.role
    db.commit()
    db.refresh(membership)
    return member_response(db, membership)


@router.delete("/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    membership_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> Response:
    membership = db.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.household_id == context.household.id,
        ),
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner membership cannot be removed")
    db.delete(membership)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
