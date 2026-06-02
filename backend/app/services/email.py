import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings


logger = logging.getLogger(__name__)


def send_email(*, recipients: list[str], subject: str, body: str) -> bool:
    cleaned_recipients = [recipient.strip().lower() for recipient in recipients if recipient and recipient.strip()]
    if not cleaned_recipients or not settings.smtp_enabled:
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    message["To"] = ", ".join(cleaned_recipients)
    message.set_content(body)

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
                return True

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.ehlo()
            if settings.smtp_use_tls:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
            return True
    except Exception:
        logger.exception("Failed to send email")
        return False
