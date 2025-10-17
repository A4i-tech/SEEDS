# main.py

import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from routers import conference, webhooks, websocket
from fastapi.middleware.cors import CORSMiddleware
from conf_logger import logger_instance

from services.singletons.websocket_service import WebsocketService

load_dotenv()

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
    # End background task to listen for messages from Node.js
    ws.cancel_bg_processes()

app = FastAPI(title=f"SEEDS Conference Call System", lifespan=lifespan)

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

