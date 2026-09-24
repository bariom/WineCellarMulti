from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, SerializerFunctionWrapHandler, model_serializer


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
        "purchase_value",
        "value_changes",
        "value_distribution",
        "styles",
        "vintages",
        "grapes",
        "producers",
        "formats",
        "next_peak",
        "taste_origins",
        "best_tastings",
        "recent_tastings",
        "tasting_rhythm",
        "storage",
        "wishlist",
        "purposes",
    ]
    width: Literal["half", "full"] = "full"

    group_by: Literal["region", "producer", "type"] | None = None

    @model_serializer(mode="wrap")
    def serialize_preference(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        result = handler(self)
        if self.group_by is None:
            result.pop("group_by", None)
        return result
