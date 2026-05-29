from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "WineCellarMulti"
    app_env: str = "development"
    app_debug: bool = True
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/winecellarmulti"
    secret_key: str = "change-me"
    dev_user_email: str = "owner@winecellar.local"
    dev_user_name: str = "Cellar Owner"
    dev_household_name: str = "Main Cellar"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)


settings = Settings()
