from typing import Optional
from pydantic import BaseModel, Field, field_validator


class RequirementsAnalyzeRequest(BaseModel):
    requirements: list[str] = Field(..., min_length=1)
    project_id: Optional[str] = None

    @field_validator("requirements")
    @classmethod
    def validate_requirements(cls, v):
        if len(v) > 50:
            raise ValueError("Maximum 50 requirements per call")
        stripped = [item.strip() for item in v if item and item.strip()]
        if not stripped:
            raise ValueError("At least one non-empty requirement required")
        return stripped


class IssueDetail(BaseModel):
    type: str
    description: str


class RequirementScore(BaseModel):
    text: str
    score: int
    label: str
    issues: list[IssueDetail]


class RequirementsAnalyzeResponse(BaseModel):
    scores: list[RequirementScore]


class ConflictDetectRequest(BaseModel):
    requirements: list[str] = Field(..., min_length=1)
    project_id: Optional[str] = None

    @field_validator("requirements")
    @classmethod
    def validate_requirements(cls, v):
        if len(v) > 50:
            raise ValueError("Maximum 50 requirements per call")
        stripped = [item.strip() for item in v if item and item.strip()]
        if not stripped:
            raise ValueError("At least one non-empty requirement required")
        return stripped


class CodeFunction(BaseModel):
    name: str
    signature: Optional[str] = None
    docstring: Optional[str] = None


class TraceabilityRequest(BaseModel):
    requirements: list[str]
    code_functions: list[CodeFunction]


class DefectPredictRequest(BaseModel):
    code: str
    language: str


class RagDocument(BaseModel):
    id: str
    name: Optional[str] = None
    content: str


class RagIndexRequest(BaseModel):
    project_id: str
    documents: list[RagDocument]


class RagQueryRequest(BaseModel):
    project_id: str
    question: str
    top_k: int = 3
    documents: Optional[list[RagDocument]] = None
