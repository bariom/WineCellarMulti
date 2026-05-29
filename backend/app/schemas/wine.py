from pydantic import BaseModel


class WineCreate(BaseModel):
    name: str
    producer: str = ""
    vintage: str = ""
    quantity: int = 0
    currency: str = "CHF"
    price: float = 0
    status: str = "Ordered"
    expected_delivery: str | None = None
    notes: str = ""


class WineResponse(BaseModel):
    id: str
    household_id: str
    name: str
    producer: str
    vintage: str
    quantity: int
    currency: str
    price: float
    status: str
    expected_delivery: str | None = None
    notes: str
