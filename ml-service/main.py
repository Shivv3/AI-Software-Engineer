from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from schemas import (
    RequirementsAnalyzeRequest,
    RequirementsAnalyzeResponse,
    ConflictDetectRequest,
    DefectPredictRequest,
    TraceabilityRequest,
    RagIndexRequest,
    RagQueryRequest,
)
from shared.spacy_loader import load_nlp
from shared.model_cache import load_sbert
from nlp.requirements_analyzer import analyze_requirements
from nlp.conflict_detector import detect_conflicts
from code.defect_predictor import predict_defects
from code.traceability import analyze_traceability
from rag.embedding_store import index_project
from rag.retriever import retrieve_context


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_nlp()
    load_sbert()
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/nlp/requirements/analyze", response_model=RequirementsAnalyzeResponse)
def requirements_analyze(req: RequirementsAnalyzeRequest):
    try:
        scores = analyze_requirements(req.requirements)
        return {"scores": scores}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/nlp/conflict/detect")
def conflict_detect(req: ConflictDetectRequest):
    try:
        return detect_conflicts(req.requirements)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/code/defect/predict")
def defect_predict(req: DefectPredictRequest):
    try:
        return predict_defects(req.code, req.language)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/code/traceability/analyze")
def traceability_analyze(req: TraceabilityRequest):
    try:
        return analyze_traceability(req.requirements, [f.model_dump() for f in req.code_functions])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/rag/index")
def rag_index(req: RagIndexRequest):
    try:
        count = index_project(req.project_id, [doc.model_dump() for doc in req.documents], load_sbert())
        return {"status": "ok", "chunks_indexed": count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/rag/query")
def rag_query(req: RagQueryRequest):
    try:
        payload = None
        if req.documents is not None:
            payload = [doc.model_dump() for doc in req.documents]
        return retrieve_context(req.project_id, req.question, req.top_k, payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
