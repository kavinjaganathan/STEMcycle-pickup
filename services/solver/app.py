"""HTTP wrapper for the route solver. Receives only matrices and numbers (no PII)."""

from __future__ import annotations

import hmac
import os

from fastapi import FastAPI, Header, HTTPException

from solver import Problem, Solution, solve

app = FastAPI(title="StemCycle route solver", docs_url=None, redoc_url=None, openapi_url=None)
MAX_NODES = 400


def _check_secret(given: str | None) -> None:
    expected = os.environ.get("SOLVER_SECRET", "")
    if not expected or not given or not hmac.compare_digest(given, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", response_model=Solution)
def solve_endpoint(problem: Problem, x_solver_secret: str | None = Header(default=None)) -> Solution:
    _check_secret(x_solver_secret)
    if len(problem.durations) > MAX_NODES:
        raise HTTPException(status_code=413, detail="problem too large")
    return solve(problem)
