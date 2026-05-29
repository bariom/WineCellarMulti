from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "WineCellarMulti"
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

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")


settings = Settings()
