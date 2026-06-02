from pydantic import BaseModel, EmailStr, Field


class ContactRequest(BaseModel):
    email: EmailStr
    subject: str = Field(min_length=3, max_length=180)
    message: str = Field(min_length=10, max_length=5000)


class ContactResponse(BaseModel):
    accepted: bool = True
