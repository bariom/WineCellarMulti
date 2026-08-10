from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentContext,
    get_current_context,
    require_admin_context,
    require_write_context,
)
from app.core.config import settings
from app.core.security import hash_invite_token, new_invite_token
from app.db.session import get_db
from app.models import (
    AiAuditLog,
    Household,
    HouseholdInvite,
    HouseholdRegionalGapSettings,
    Membership,
    User,
    UserOperationalActionSnooze,
    UserSession,
    Wine,
    WineShareOffer,
    WishlistItem,
)
from app.schemas.household import (
    HouseholdCreate,
    HouseholdMembershipResponse,
    HouseholdSwitch,
    HouseholdUpdate,
    InviteAccept,
    InviteCreate,
    InviteResponse,
    MemberResponse,
    MemberRoleUpdate,
    OperationalActionSnoozeCreate,
    OperationalActionSnoozeResponse,
    RegionalGapSettingsResponse,
    RegionalGapSettingsUpdate,
)
from app.services.email import send_email
from app.services.notifications import create_user_notification

router = APIRouter(prefix="/household")


def ensure_restaurant_mode_available(context: CurrentContext, operating_mode: str) -> None:
    if (
        operating_mode == "restaurant"
        and not context.user.can_use_restaurant_mode
        and not context.user.is_app_admin
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Restaurant mode is not currently available",
        )


def ensure_restaurant_cellar_limit(
    db: Session,
    context: CurrentContext,
    operating_mode: str,
    current_household_id: UUID | None = None,
) -> None:
    if operating_mode != "restaurant":
        return
    existing_restaurant_household_id = db.scalar(
        select(Household.id)
        .join(Membership, Membership.household_id == Household.id)
        .where(
            Membership.user_id == context.user.id,
            Household.operating_mode == "restaurant",
            *([Household.id != current_household_id] if current_household_id else []),
        )
        .limit(1)
    )
    if existing_restaurant_household_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Each user can have access to only one restaurant cellar",
        )


def regional_gap_settings_response(settings: HouseholdRegionalGapSettings | None) -> RegionalGapSettingsResponse:
    if settings is None:
        return RegionalGapSettingsResponse()
    return RegionalGapSettingsResponse(
        targets=settings.targets or [],
        last_ai_suggestion=settings.last_ai_suggestion,
        profile_targets=settings.profile_targets or {},
        ai_suggestions=settings.ai_suggestions or [],
        updated_at=settings.updated_at,
    )


@router.get("/regional-gap-settings", response_model=RegionalGapSettingsResponse)
def get_regional_gap_settings(db: Session = Depends(get_db), context: CurrentContext = Depends(get_current_context)) -> RegionalGapSettingsResponse:
    return regional_gap_settings_response(db.get(HouseholdRegionalGapSettings, context.household.id))


@router.put("/regional-gap-settings", response_model=RegionalGapSettingsResponse)
def save_regional_gap_settings(
    payload: RegionalGapSettingsUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> RegionalGapSettingsResponse:
    settings = db.get(HouseholdRegionalGapSettings, context.household.id)
    if settings is None:
        settings = HouseholdRegionalGapSettings(household_id=context.household.id)
        db.add(settings)
    settings.targets = [target.model_dump() for target in payload.targets]
    settings.last_ai_suggestion = payload.last_ai_suggestion
    settings.profile_targets = {
        profile: [target.model_dump() for target in targets]
        for profile, targets in payload.profile_targets.items()
    }
    settings.ai_suggestions = payload.ai_suggestions
    settings.updated_by_user_id = context.user.id
    db.commit()
    db.refresh(settings)
    return regional_gap_settings_response(settings)


@router.get("/operational-action-snoozes", response_model=list[OperationalActionSnoozeResponse])
def list_operational_action_snoozes(db: Session = Depends(get_db), context: CurrentContext = Depends(get_current_context)) -> list[OperationalActionSnoozeResponse]:
    now = datetime.now(UTC)
    db.execute(delete(UserOperationalActionSnooze).where(UserOperationalActionSnooze.user_id == context.user.id, UserOperationalActionSnooze.household_id == context.household.id, UserOperationalActionSnooze.until <= now))
    db.commit()
    snoozes = db.scalars(select(UserOperationalActionSnooze).where(UserOperationalActionSnooze.user_id == context.user.id, UserOperationalActionSnooze.household_id == context.household.id))
    return [OperationalActionSnoozeResponse(action_id=item.action_id, signature=item.signature, until=item.until) for item in snoozes]


@router.post("/operational-action-snoozes", response_model=OperationalActionSnoozeResponse)
def save_operational_action_snooze(
    payload: OperationalActionSnoozeCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> OperationalActionSnoozeResponse:
    until = payload.until.replace(tzinfo=UTC) if payload.until.tzinfo is None else payload.until.astimezone(UTC)
    if until <= datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Snooze expiry must be in the future")
    snooze = db.scalar(select(UserOperationalActionSnooze).where(UserOperationalActionSnooze.user_id == context.user.id, UserOperationalActionSnooze.household_id == context.household.id, UserOperationalActionSnooze.action_id == payload.action_id))
    if snooze is None:
        snooze = UserOperationalActionSnooze(user_id=context.user.id, household_id=context.household.id, action_id=payload.action_id, signature=payload.signature, until=until)
        db.add(snooze)
    else:
        snooze.signature = payload.signature
        snooze.until = until
    db.commit()
    return OperationalActionSnoozeResponse(action_id=snooze.action_id, signature=snooze.signature, until=snooze.until)


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
        visibility_scope=membership.visibility_scope,
    )


def notify_invited_user(
    *, email: str, household_name: str, role: str, visibility_scope: str, inviter_name: str
) -> None:
    send_email(
        recipients=[email],
        subject=f"[{settings.app_name}] Household invitation",
        body=(
            "You received a Vinaris household invitation.\n\n"
            f"Household: {household_name}\n"
            f"Invited by: {inviter_name}\n"
            f"Role: {role}\n"
            f"Visibility: {visibility_scope}\n\n"
            "Open the app and sign in with this email address to review or accept the invitation."
        ),
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
                operating_mode=household.operating_mode,
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No membership for household"
        )
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
        operating_mode=household.operating_mode,
        role=membership.role,
    )


@router.post("", response_model=HouseholdMembershipResponse, status_code=status.HTTP_201_CREATED)
def create_household(
    payload: HouseholdCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> HouseholdMembershipResponse:
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Household name is required"
        )
    ensure_restaurant_mode_available(context, payload.operating_mode)
    ensure_restaurant_cellar_limit(db, context, payload.operating_mode)

    household = Household(name=name, operating_mode=payload.operating_mode)
    db.add(household)
    db.flush()
    membership = Membership(
        user_id=context.user.id,
        household_id=household.id,
        role="owner",
        visibility_scope="all",
    )
    db.add(membership)
    context.session.active_household_id = household.id
    db.commit()
    db.refresh(household)
    db.refresh(membership)
    db.refresh(context.session)
    return HouseholdMembershipResponse(
        membership_id=membership.id,
        household_id=household.id,
        household_name=household.name,
        operating_mode=household.operating_mode,
        role=membership.role,
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_active_household(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> Response:
    if context.membership.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the household owner can delete a cellar",
        )

    member_rows = list(
        db.scalars(select(Membership).where(Membership.household_id == context.household.id))
    )
    fallback_household_by_user: dict[UUID, UUID] = {}
    for membership in member_rows:
        fallback = db.scalar(
            select(Membership.household_id)
            .where(
                Membership.user_id == membership.user_id,
                Membership.household_id != context.household.id,
            )
            .order_by(Membership.id.asc())
        )
        if fallback is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Every member must still have at least one other cellar before this cellar can be deleted",
            )
        fallback_household_by_user[membership.user_id] = fallback

    sessions = list(
        db.scalars(
            select(UserSession).where(UserSession.active_household_id == context.household.id)
        )
    )
    for user_session in sessions:
        fallback_household_id = fallback_household_by_user.get(user_session.user_id)
        if fallback_household_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unable to reassign active cellar for one or more members",
            )
        user_session.active_household_id = fallback_household_id

    wine_ids = list(db.scalars(select(Wine.id).where(Wine.household_id == context.household.id)))
    if wine_ids:
        db.query(WineShareOffer).filter(WineShareOffer.wine_id.in_(wine_ids)).delete(
            synchronize_session=False
        )
    db.query(WineShareOffer).filter(WineShareOffer.household_id == context.household.id).delete(
        synchronize_session=False
    )
    db.query(AiAuditLog).filter(AiAuditLog.household_id == context.household.id).delete(
        synchronize_session=False
    )
    db.query(HouseholdInvite).filter(HouseholdInvite.household_id == context.household.id).delete(
        synchronize_session=False
    )
    db.query(WishlistItem).filter(WishlistItem.household_id == context.household.id).delete(
        synchronize_session=False
    )
    db.query(Wine).filter(Wine.household_id == context.household.id).delete(
        synchronize_session=False
    )
    db.query(Membership).filter(Membership.household_id == context.household.id).delete(
        synchronize_session=False
    )
    db.delete(context.household)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("", response_model=HouseholdMembershipResponse)
def update_active_household(
    payload: HouseholdUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> HouseholdMembershipResponse:
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Household name is required"
            )
        context.household.name = name
    if payload.operating_mode is not None:
        ensure_restaurant_mode_available(context, payload.operating_mode)
        ensure_restaurant_cellar_limit(
            db,
            context,
            payload.operating_mode,
            current_household_id=context.household.id,
        )
        context.household.operating_mode = payload.operating_mode
    db.commit()
    db.refresh(context.household)
    return HouseholdMembershipResponse(
        membership_id=context.membership.id,
        household_id=context.household.id,
        household_name=context.household.name,
        operating_mode=context.household.operating_mode,
        role=context.membership.role,
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
    visibility_scope = "all" if payload.role == "admin" else payload.visibility_scope
    invited_user = db.scalar(select(User).where(User.email == email))
    if invited_user is not None:
        existing_membership = db.scalar(
            select(Membership).where(
                Membership.user_id == invited_user.id,
                Membership.household_id == context.household.id,
            ),
        )
        if existing_membership is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="User is already a member"
            )
    token = new_invite_token()
    invite = HouseholdInvite(
        household_id=context.household.id,
        invited_by_user_id=context.user.id,
        email=email,
        role=payload.role,
        visibility_scope=visibility_scope,
        token_hash=hash_invite_token(token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.invite_ttl_days),
        created_at=datetime.now(UTC),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    notify_invited_user(
        email=invite.email,
        household_name=context.household.name,
        role=invite.role,
        visibility_scope=invite.visibility_scope,
        inviter_name=context.user.display_name,
    )
    return InviteResponse(
        id=invite.id,
        household_id=invite.household_id,
        household_name=context.household.name,
        email=invite.email,
        role=invite.role,
        visibility_scope=invite.visibility_scope,
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
            household_id=invite.household_id,
            household_name=context.household.name,
            email=invite.email,
            role=invite.role,
            visibility_scope=invite.visibility_scope,
            expires_at=invite.expires_at,
            accepted_at=invite.accepted_at,
            invite_token=None,
        )
        for invite in invites
    ]


@router.get("/invites/received", response_model=list[InviteResponse])
def list_received_invites(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[InviteResponse]:
    now = datetime.now(UTC)
    invites = db.scalars(
        select(HouseholdInvite)
        .where(
            HouseholdInvite.email == context.user.email.lower(),
            HouseholdInvite.accepted_at.is_(None),
            HouseholdInvite.expires_at > now,
        )
        .order_by(HouseholdInvite.created_at.desc()),
    )
    results: list[InviteResponse] = []
    for invite in invites:
        household = db.get(Household, invite.household_id)
        if household is None:
            continue
        results.append(
            InviteResponse(
                id=invite.id,
                household_id=invite.household_id,
                household_name=household.name,
                email=invite.email,
                role=invite.role,
                visibility_scope=invite.visibility_scope,
                expires_at=invite.expires_at,
                accepted_at=invite.accepted_at,
                invite_token=None,
            ),
        )
    return results


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


def accept_invite_record(
    db: Session, context: CurrentContext, invite: HouseholdInvite
) -> MemberResponse:
    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.expires_at.replace(tzinfo=UTC) <= datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite expired")
    if invite.email.lower() != context.user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invite belongs to another email"
        )

    inviter = db.get(User, invite.invited_by_user_id)
    household = db.get(Household, invite.household_id)
    if inviter is not None:
        italian = (inviter.locale or "it").lower().startswith("it")
        household_name = household.name if household is not None else "Vinaris"
        member_name = context.user.display_name or context.user.email
        create_user_notification(
            db,
            inviter,
            kind="household_invite_accepted",
            title="Invito accettato" if italian else "Invitation accepted",
            message=(
                f"{member_name} ha accettato l'invito a {household_name}."
                if italian
                else f"{member_name} accepted the invitation to {household_name}."
            ),
            action_url="/settings/sharing",
            fingerprint=f"household-invite-accepted:{invite.id}",
        )

    existing = db.scalar(
        select(Membership).where(
            Membership.user_id == context.user.id,
            Membership.household_id == invite.household_id,
        ),
    )
    if existing is not None:
        invite.accepted_at = datetime.now(UTC)
        db.commit()
        db.refresh(existing)
        return member_response(db, existing)

    membership = Membership(
        user_id=context.user.id,
        household_id=invite.household_id,
        role=invite.role,
        visibility_scope=invite.visibility_scope,
    )
    invite.accepted_at = datetime.now(UTC)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return member_response(db, membership)


@router.post("/invites/accept", response_model=MemberResponse)
def accept_invite(
    payload: InviteAccept,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> MemberResponse:
    invite = db.scalar(
        select(HouseholdInvite).where(
            HouseholdInvite.token_hash == hash_invite_token(payload.token)
        )
    )
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    return accept_invite_record(db, context, invite)


@router.post("/invites/{invite_id}/accept", response_model=MemberResponse)
def accept_received_invite(
    invite_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> MemberResponse:
    invite = db.get(HouseholdInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    return accept_invite_record(db, context, invite)


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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Owner role cannot be changed"
        )
    if payload.role is None and payload.visibility_scope is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No membership changes provided"
        )
    if payload.role is not None:
        membership.role = payload.role
    if payload.visibility_scope is not None:
        membership.visibility_scope = (
            "all" if membership.role in ("owner", "admin") else payload.visibility_scope
        )
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Owner membership cannot be removed"
        )
    db.delete(membership)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
