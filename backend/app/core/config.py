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
    trial_entitlement_days: int = 5
    email_verification_ttl_hours: int = 48
    password_reset_ttl_minutes: int = 30
    coownership_invite_ttl_days: int = 30
    registration_requires_approval: bool = True
    legal_operator_name: str = ""
    legal_operator_address: str = ""
    legal_contact_email: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    rate_limit_enabled: bool = True
    rate_limit_login_ip_attempts: int = 20
    rate_limit_login_account_attempts: int = 10
    rate_limit_login_window_seconds: int = 300
    rate_limit_register_attempts: int = 5
    rate_limit_register_window_seconds: int = 3600
    rate_limit_verify_email_attempts: int = 10
    rate_limit_verify_email_window_seconds: int = 900
    rate_limit_password_reset_attempts: int = 5
    rate_limit_password_reset_window_seconds: int = 900
    rate_limit_coownership_response_attempts: int = 10
    rate_limit_coownership_response_window_seconds: int = 900
    rate_limit_passkey_options_attempts: int = 20
    rate_limit_passkey_verify_attempts: int = 10
    rate_limit_passkey_window_seconds: int = 300
    rate_limit_support_attempts: int = 5
    rate_limit_support_window_seconds: int = 3600
    monitoring_api_token: str = ""
    operations_collector_token: str = ""
    operations_alerts_enabled: bool = True
    operations_alert_reminder_minutes: int = 60
    operations_alert_cpu_warning_percent: float = 80
    operations_alert_cpu_critical_percent: float = 90
    operations_alert_memory_warning_percent: float = 80
    operations_alert_memory_critical_percent: float = 90
    operations_alert_disk_warning_percent: float = 80
    operations_alert_disk_critical_percent: float = 90
    operations_alert_conntrack_warning_percent: float = 80
    operations_alert_conntrack_critical_percent: float = 90
    operations_alert_latency_warning_ms: float = 750
    operations_alert_latency_critical_ms: float = 1500
    operations_alert_latency_min_interactive_requests: int = 20
    # Public browser token for the optional ArcGIS satellite basemap. Protect it
    # with ArcGIS referrer restrictions; it is returned only to authenticated app users.
    arcgis_api_key: str = ""
    map_places_overpass_url: str = "https://overpass-api.de/api/interpreter"
    map_places_nominatim_url: str = "https://nominatim.openstreetmap.org/search"
    openai_api_key: str = ""
    # Organization Admin key used exclusively for the app-admin operational cost summary.
    # It is never returned to the browser and is distinct from the application AI key.
    openai_admin_key: str = ""
    openai_costs_url: str = "https://api.openai.com/v1/organization/costs"
    openai_costs_cache_seconds: int = 300
    openai_responses_url: str = "https://api.openai.com/v1/responses"
    # OPENAI_MODEL and the feature-specific variables remain as compatibility
    # aliases for existing deployments. Model selection is centralized in
    # app.services.ai_models and defaults to GPT-5.5 while GPT-5.6 is disabled.
    openai_model: str = "gpt-5.4-mini"
    openai_ai_notes_model: str = "gpt-5.4-mini"
    openai_drink_window_model: str = "gpt-5.4"
    openai_value_model: str = "gpt-5.4-mini"
    openai_grape_model: str = "gpt-5.4-nano"
    openai_score_model: str = "gpt-5.4-mini"
    openai_wishlist_model: str = "gpt-5.4"
    openai_pairing_model: str = "gpt-5.4"
    openai_default_model: str = "gpt-5.5"
    openai_economy_model: str = "gpt-5.6-luna"
    openai_balanced_model: str = "gpt-5.6-terra"
    openai_advanced_model: str = "gpt-5.6-sol"
    openai_fallback_model: str = "gpt-5.5"
    openai_enable_gpt56: bool = False
    openai_enable_model_routing: bool = False
    openai_legacy_reasoning_effort: str = "low"
    openai_economy_reasoning_effort: str = "low"
    openai_balanced_reasoning_effort: str = "medium"
    openai_advanced_reasoning_effort: str = "high"
    openai_legacy_max_output_tokens: int = 32768
    openai_economy_max_output_tokens: int = 12288
    openai_balanced_max_output_tokens: int = 32768
    openai_advanced_max_output_tokens: int = 32768
    openai_timeout_seconds: float = 60.0
    openai_max_retries: int = 0
    # Optional JSON overrides/additions for the token price book. Keeping it in
    # the environment lets operators update published model prices without a
    # code deployment; invalid entries are rejected when a price is requested.
    openai_model_pricing_usd_per_million_tokens: str = ""
    openai_web_search_tool_cost_usd: str = "0.01"
    wine_recognition_max_input_bytes: int = 16_000_000
    wine_recognition_max_dimension: int = 1600
    wine_recognition_jpeg_quality: int = 88
    wine_recognition_timeout_seconds: int = 45
    wine_photo_storage_dir: str = "data/wine-photos"
    wine_photo_ai_enabled: bool = True
    wine_photo_ai_model: str = "birefnet-general-lite"
    wine_photo_ai_max_input_bytes: int = 12_000_000
    wine_photo_ai_timeout_seconds: int = 90
    wine_photo_ai_worker_idle_seconds: int = 75
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
    signup_ai_credit_usd: str = "0.50"
    ai_pack_markup_percent: str = "15"
    stripe_payment_amount_cents: int = 0
    stripe_payment_currency: str = "chf"
    stripe_payment_label: str = "Vinaris access"
    stripe_entitlement_days: int = 365
    stripe_monthly_entitlement_days: int = 31
    stripe_annual_entitlement_days: int = 365
    stripe_success_url: str = "http://localhost:5173/?stripe_checkout=success"
    stripe_cancel_url: str = "http://localhost:5173/?stripe_checkout=cancelled"
    stripe_portal_return_url: str = "http://localhost:5173/?billing_portal=return"
    email_provider: str = "smtp"
    email_from_email: str = ""
    email_from_name: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_from_email: str = ""
    smtp_from_name: str = "Vinaris"
    resend_api_url: str = "https://api.resend.com/emails"
    resend_api_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.smtp_host and self.effective_from_email)

    @property
    def effective_from_email(self) -> str:
        return (self.email_from_email or self.smtp_from_email).strip()

    @property
    def effective_from_name(self) -> str:
        return (self.email_from_name or self.smtp_from_name or self.app_name).strip()

    @property
    def resend_enabled(self) -> bool:
        return bool(self.resend_api_key and self.effective_from_email)

    @property
    def email_enabled(self) -> bool:
        provider = self.email_provider.strip().lower()
        if provider == "resend":
            return self.resend_enabled
        return self.smtp_enabled

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
