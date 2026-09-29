import os
import asyncio
import logging
from pathlib import Path

import requests as _requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gudang")

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# MASIVI POS pass-through proxy (WEB PREVIEW ONLY).
#
# The PDA app talks directly to the POS on native (Android/iOS); the POS is the
# single source of truth for auth, stock, receiving and transfers. The web
# preview runs on an Emergent origin that the POS CORS policy does not allow,
# so for browser-based testing we forward requests verbatim. Nothing is stored
# or transformed here. The legacy MongoDB-backed API has been retired.
# ---------------------------------------------------------------------------
_POS_ORIGIN = "https://sm3.masivi.id/api/v1"


@api.get("/")
async def root():
    return {"message": "Gudang PDA — POS proxy"}


@api.api_route("/pos-proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def pos_proxy(path: str, request: Request):
    body = await request.body()
    headers = {}
    for h in ("authorization", "x-store-id", "content-type", "accept"):
        v = request.headers.get(h)
        if v:
            headers[h] = v

    def _call():
        return _requests.request(
            request.method,
            f"{_POS_ORIGIN}/{path}",
            params=dict(request.query_params),
            data=body if body else None,
            headers=headers,
            timeout=30,
        )

    resp = await asyncio.to_thread(_call)
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
