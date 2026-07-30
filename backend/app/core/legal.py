LEGAL_DOCUMENT_VERSION = "2026-07-30"
SUPPORTED_LEGAL_LOCALES = {"it", "en"}


def legal_acceptance_is_current(user: object) -> bool:
    return bool(
        getattr(user, "privacy_policy_accepted_at", None)
        and getattr(user, "privacy_policy_version", "") == LEGAL_DOCUMENT_VERSION
        and getattr(user, "terms_accepted_at", None)
        and getattr(user, "terms_version", "") == LEGAL_DOCUMENT_VERSION
    )
