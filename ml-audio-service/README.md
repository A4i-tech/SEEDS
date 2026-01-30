# ML Audio Service

A FastAPI-based microservice for real-time audio analysis using OpenAI's Whisper and Embeddings APIs.

## Features
- **Streaming Transcription**: Transcribes audio chunks in near real-time using OpenAI Whisper API.
- **Hold Detection**: Analyzes transcripts to detect "hold" messages (e.g., "Please hold", "The number you have called...") using semantic similarity via OpenAI Embeddings API.
- **WebSocket Interface**: Accepts audio streams via WebSocket.

## Prerequisites
- Python 3.12+
- OpenAI API Key

## Installation

1.  Navigate to the directory:
    ```bash
    cd ml-audio-service
    ```

2.  Create and activate a virtual environment:
    ```bash
    uv venv
    source .venv/bin/activate
    ```

3.  Install dependencies:
    ```bash
    uv pip install -r requirements.txt
    ```

4.  Set up environment variables:
    Create a `.env` file or export the variable:
    ```bash
    export OPENAI_API_KEY="sk-..."
    ```

## Usage

Start the server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## WebSocket Endpoint
`ws://localhost:8000/stream/{client_id}`

### Output Format (JSON)
```json
{
  "text": "The number you have called has put you on hold.",
  "duration": 8.0,
  "is_hold": true,
  "hold_score": 0.92
}
```

## Validation Logs
Tested with a real call recording containing the phrase: *"The number you have called has put you on hold. Please wait."*

**Log Output:**
```text
INFO:ml-audio-service:TRANSCRIPTION [Duration: 8.0s]: The number you have called has put you on hold. Please wait.
DEBUG:ml-audio-service:Hold score: 0.85 for text: 'The number you have called has put you on hold. Please wait.'
WARNING:ml-audio-service:HOLD DETECTED for test_real_audio_client | Score: 0.85 | Text: The number you have called has put you on hold. Please wait.
```

## Integration Details
The service sends a JSON string over the WebSocket connection for every processed audio chunk.

**Example Response:**
```json
{
    "text": "The number you have called has put you on hold.",
    "duration": 8.0,
    "is_hold": true,
    "hold_score": 0.90
}
```
Client applications should parse this JSON and check the `is_hold` boolean flag to trigger downstream actions.
