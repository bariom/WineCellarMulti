from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Vinaris"
    app_env: str = "development"
    app_debug: bool = True
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5433/winecellarmulti"
    secret_key: str = "change-me"
    session_cookie_name: str = "winecellarmulti_session"
    session_cookie_secure: bool = False
    session_ttl_days: int = 30
    invite_ttl_days: int = 7
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    openai_api_key: str = ""
    openai_responses_url: str = "https://api.openai.com/v1/responses"
    openai_model: str = "gpt-5.4-mini"
    openai_ai_notes_model: str = "gpt-5.4-mini"
    openai_drink_window_model: str = "gpt-5.4"
    openai_value_model: str = "gpt-5.4-mini"
    openai_grape_model: str = "gpt-5.4-nano"
    openai_wishlist_model: str = "gpt-5.4"
    openai_pairing_model: str = "gpt-5.4"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_checkout_url: str = "https://api.stripe.com/v1/checkout/sessions"
    stripe_portal_url: str = "https://api.stripe.com/v1/billing_portal/sessions"
    stripe_price_id: str = ""
    stripe_monthly_price_id: str = ""
    stripe_annual_price_id: str = ""
    stripe_ai_credit_price_id: str = ""
    stripe_ai_credit_amount_usd: str = "5.00"
    stripe_ai_credit_label: str = "Vinaris AI Pack"
    stripe_payment_amount_cents: int = 0
    stripe_payment_currency: str = "chf"
    stripe_payment_label: str = "Vinaris access"
    stripe_entitlement_days: int = 365
    stripe_monthly_entitlement_days: int = 31
    stripe_annual_entitlement_days: int = 365
    stripe_success_url: str = "http://localhost:5173/?stripe_checkout=success"
    stripe_cancel_url: str = "http://localhost:5173/?stripe_checkout=cancelled"
    stripe_portal_return_url: str = "http://localhost:5173/?billing_portal=return"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_from_email: str = ""
    smtp_from_name: str = "Vinaris"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")


settings = Settings()
