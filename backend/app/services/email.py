import logging
import smtplib
import ssl
import json
from email.message import EmailMessage
from email.utils import formataddr
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings


logger = logging.getLogger(__name__)


def build_from_header() -> str:
    return formataddr((settings.effective_from_name, settings.effective_from_email))


def send_via_smtp(*, cleaned_recipients: list[str], subject: str, body: str) -> bool:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = build_from_header()
    message["To"] = ", ".join(cleaned_recipients)
    message.set_content(body)

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
            logger.info("Email delivered", extra={"recipients": cleaned_recipients, "subject": subject, "transport": "smtp_ssl"})
            return True

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.ehlo()
        if settings.smtp_use_tls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
        logger.info("Email delivered", extra={"recipients": cleaned_recipients, "subject": subject, "transport": "smtp_starttls" if settings.smtp_use_tls else "smtp_plain"})
        return True


def send_via_resend(*, cleaned_recipients: list[str], subject: str, body: str) -> bool:
    payload = json.dumps(
        {
            "from": build_from_header(),
            "to": cleaned_recipients,
            "subject": subject,
            "text": body,
        }
    ).encode("utf-8")
    request = Request(
        settings.resend_api_url,
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"{settings.app_name}/1.0",
        },
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        response.read()
    logger.info("Email delivered", extra={"recipients": cleaned_recipients, "subject": subject, "transport": "resend"})
    return True


def send_email(*, recipients: list[str], subject: str, body: str) -> bool:
    cleaned_recipients = [recipient.strip().lower() for recipient in recipients if recipient and recipient.strip()]
    if not cleaned_recipients:
        logger.warning("Skipped email delivery because no recipients were provided")
        return False
    provider = settings.email_provider.strip().lower()
    if not settings.email_enabled:
        logger.warning(
            "Skipped email delivery because email is not enabled",
            extra={
                "email_provider": provider,
                "smtp_host_configured": bool(settings.smtp_host),
                "resend_api_key_configured": bool(settings.resend_api_key),
                "from_email_configured": bool(settings.effective_from_email),
            },
        )
        return False

    try:
        if provider == "resend":
            return send_via_resend(cleaned_recipients=cleaned_recipients, subject=subject, body=body)
        return send_via_smtp(cleaned_recipients=cleaned_recipients, subject=subject, body=body)
    except HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        logger.exception("Failed to send email", extra={"provider": provider, "status_code": exc.code, "response_body": response_body})
        return False
    except URLError:
        logger.exception("Failed to send email", extra={"provider": provider})
        return False
    except Exception:
        logger.exception("Failed to send email", extra={"provider": provider})
        return False
