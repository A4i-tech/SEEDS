# main.py

import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from app.core.telemetry import configure_telemetry, get_tracer

load_dotenv()
configure_telemetry()
tracer = get_tracer(__name__)

from app.conf_logger import logger_instance
from app.services.singletons.websocket_service import WebsocketService
from app.services.singletons.conference_call_manager import conference_manager
from app.services.storage_manager.mongodb_client import close_mongodb_manager
from app.routers import conference, webhooks, websocket

# Read the version from version.txt
version_file = Path("version.txt")
if version_file.exists():
    app_version = version_file.read_text().strip()
else:
    app_version = "Unknown"
    
logger_instance.info(os.environ.get("WS_SERVER_EP", "<NO WS_SERVER_EP FOUND>"))
logger_instance.info(os.environ.get("EVENTS_WEBHOOK_EP", "<NO EVENTS_WEBHOOK_EP FOUND>"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background task to listen for messages from Node.js
    ws = WebsocketService()
    await ws.initialize()
    yield
    ws.cancel_bg_processes()
    await close_mongodb_manager()
    await conference_manager.close()

app = FastAPI(title=f"SEEDS Conference Call System", lifespan=lifespan)
FastAPIInstrumentor.instrument_app(app)

# Store the original OpenAPI function
original_openapi = app.openapi

# Customize the OpenAPI docs to display the version
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = original_openapi()  # Call the original OpenAPI function
    openapi_schema["info"]["version"] = app_version  # Set version in the docs
    app.openapi_schema = openapi_schema
    return app.openapi_schema

# Override the default OpenAPI method with the custom one
app.openapi = custom_openapi

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conference.router, prefix="/conference", tags=["Conference"])
app.include_router(webhooks.router, prefix="/webhooks",  tags=["Webhooks"])
app.include_router(websocket.router, prefix="/websocket", tags=["Websocket for Comm API"])

# SAVE LOGS TO TXT FILE: uvicorn main:app 2>&1 | tee logs.txt

