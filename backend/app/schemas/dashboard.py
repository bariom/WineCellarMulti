from typing import Literal

from pydantic import BaseModel, ConfigDict


class DashboardWidgetPreference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Literal[
        "overview",
        "ready",
        "regions",
        "maturity",
        "balance",
        "recent",
        "deliveries",
        "taste",
        "news",
        "featured",
        "top_value",
        "value_type",
        "value_region",
        "value_producer",
        "tonight",
        "past_window",
        "to_collect",
        "data_quality",
        "style_balance",
        "collection_value",
        "availability",
        "composition",
    ]
    width: Literal["half", "full"] = "full"
