from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import OperationalAlertState, User
from app.services.email import send_email


@dataclass(frozen=True)
class MetricAlert:
    metric: str
    label: str
    value: float
    suffix: str
    severity: str


def _value(data: dict[str, object], *keys: str) -> float | None:
    current: object = data
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    try:
        return float(current)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _severity(value: float | None, warning: float, critical: float) -> str | None:
    if value is None:
        return None
    if value >= critical:
        return "critical"
    if value >= warning:
        return "warning"
    return None


def _as_utc(value: datetime) -> datetime:
    """Normalise SQLite's naive datetimes and PostgreSQL UTC timestamps."""

    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def detected_alerts(system: dict[str, object], application: dict[str, object]) -> list[MetricAlert]:
    conntrack_count = _value(system, "conntrack", "count")
    conntrack_max = _value(system, "conntrack", "max")
    conntrack_percent = (
        (conntrack_count / conntrack_max * 100)
        if conntrack_count is not None and conntrack_max
        else None
    )
    interactive_p95 = _value(application, "interactive_p95_duration_ms")
    metrics = (
        (
            "cpu",
            "CPU",
            _value(system, "host", "cpu_percent"),
            "%",
            settings.operations_alert_cpu_warning_percent,
            settings.operations_alert_cpu_critical_percent,
        ),
        (
            "memory",
            "RAM",
            _value(system, "host", "memory", "percent"),
            "%",
            settings.operations_alert_memory_warning_percent,
            settings.operations_alert_memory_critical_percent,
        ),
        (
            "disk",
            "Disco",
            _value(system, "host", "disk", "percent"),
            "%",
            settings.operations_alert_disk_warning_percent,
            settings.operations_alert_disk_critical_percent,
        ),
        (
            "conntrack",
            "Conntrack",
            conntrack_percent,
            "%",
            settings.operations_alert_conntrack_warning_percent,
            settings.operations_alert_conntrack_critical_percent,
        ),
        (
            "latency",
            "P95 API interattive",
            interactive_p95,
            "ms",
            settings.operations_alert_latency_warning_ms,
            settings.operations_alert_latency_critical_ms,
        ),
    )
    return [
        MetricAlert(metric=metric, label=label, value=value, suffix=suffix, severity=severity)
        for metric, label, value, suffix, warning, critical in metrics
        if (severity := _severity(value, warning, critical)) is not None and value is not None
    ]


def _active_admin_emails(db: Session) -> list[str]:
    return list(
        db.scalars(
            select(User.email)
            .where(
                User.is_app_admin.is_(True), User.is_approved.is_(True), User.is_blocked.is_(False)
            )
            .order_by(User.email.asc())
        )
    )


def _format_alert(alert: MetricAlert) -> str:
    level = "CRITICA" if alert.severity == "critical" else "attenzione"
    return f"- {alert.label}: {alert.value:.0f}{alert.suffix} ({level})"


def evaluate_operational_alerts(
    db: Session,
    *,
    system: dict[str, object],
    application: dict[str, object],
    now: datetime | None = None,
) -> None:
    """Send concise state-change alerts without letting delivery affect collection."""

    if not settings.operations_alerts_enabled:
        return
    now = now or datetime.now(UTC)
    alerts = {alert.metric: alert for alert in detected_alerts(system, application)}
    states = {state.metric: state for state in db.scalars(select(OperationalAlertState)).all()}
    reminder_after = timedelta(minutes=max(settings.operations_alert_reminder_minutes, 1))
    notifications: list[str] = []
    states_to_mark_notified: list[OperationalAlertState] = []

    for metric, alert in alerts.items():
        state = states.pop(metric, None)
        if state is None:
            state = OperationalAlertState(
                metric=metric,
                severity=alert.severity,
                opened_at=now,
                last_notified_at=None,
                last_value=alert.value,
            )
            db.add(state)
            should_notify = True
        else:
            should_notify = (
                state.severity != alert.severity
                or state.last_notified_at is None
                or now - _as_utc(state.last_notified_at) >= reminder_after
            )
            state.severity = alert.severity
            state.last_value = alert.value
        if should_notify:
            notifications.append(_format_alert(alert))
            states_to_mark_notified.append(state)

    recoveries = list(states.values())
    for state in recoveries:
        db.delete(state)

    if not notifications and not recoveries:
        return
    recipients = _active_admin_emails(db)
    if not recipients:
        return
    body_parts: list[str] = []
    if notifications:
        body_parts.extend(
            [
                "Vinaris ha rilevato le seguenti condizioni operative:",
                "",
                *notifications,
            ]
        )
    if recoveries:
        if body_parts:
            body_parts.append("")
        body_parts.extend(
            [
                "Rientrate nella norma:",
                *[f"- {state.metric.replace('_', ' ').title()}" for state in recoveries],
            ]
        )
    body_parts.extend(
        [
            "",
            f"Rilevazione: {now.isoformat()}",
            "Consulta Impostazioni > Operatività per lo storico.",
        ]
    )
    subject = (
        f"[{settings.app_name}] Allerta operativa"
        if notifications
        else f"[{settings.app_name}] Rientro operativo"
    )
    if send_email(recipients=recipients, subject=subject, body="\n".join(body_parts)):
        for state in states_to_mark_notified:
            state.last_notified_at = now
