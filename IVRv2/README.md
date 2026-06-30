# IVR v2 System

[![IVR v2 Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/a4i-architect/dcc3788d90884aed5ef3bfc393978480/raw/ivr-v2-coverage.json)](https://github.com/A4i-tech/SEEDS/actions/workflows/ivr-v2-main.yml)

A modern Interactive Voice Response (IVR) system built with FastAPI and Vonage, designed to handle voice calls and provide interactive voice responses.

## Features

- Interactive Voice Response (IVR) system
- Integration with Vonage Voice API
- State management using Finite State Machine (FSM)
- Azure Cosmos DB for data persistence
- Modular action system for flexible call flows

## Prerequisites

- Python 3.8 or higher
- Vonage API credentials (API Key and Secret)
- Azure Cosmos DB connection string
- Azure Storage Account (for audio storage)
- MongoDB (optional, for local development)

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd SEEDS/IVRv2
   ```

2. Create and activate a virtual environment:

   ```bash
   python -m venv ivr-env
   # On Windows:
   .\ivr-env\Scripts\activate
   # On Unix or MacOS:
   source ivr-env/bin/activate
   ```

3. Install the required dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your Vonage and Azure credentials

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
VONAGE_API_KEY=your_vonage_api_key
VONAGE_API_SECRET=your_vonage_api_secret
VONAGE_APPLICATION_ID=your_vonage_app_id
VONAGE_PRIVATE_KEY_PATH=your_private_key_path
VONAGE_NUMBER=your_vonage_number

AZURE_COSMOS_ENDPOINT=your_cosmos_endpoint
AZURE_COSMOS_KEY=your_cosmos_key
AZURE_STORAGE_CONNECTION_STRING=your_storage_connection_string
STORAGE_ACCOUNT_NAME=your_storage_account_name
AZURE_STORAGE_ENABLED=true/false
AZURE_STORAGE_ACCOUNT_KEY=your_azure_account_key


MONGO_DB_CONNECTION_STRING=your_mongo_db_connection_string
BASE_URL=your_base_url
```

## Running the Application

1. Start the development server:

   ```bash
   uvicorn main:app --reload
   ```

2. The application will be available at `http://localhost:8000`

3. For production, use a production WSGI server like Gunicorn:
   ```bash
   gunicorn -k uvicorn.workers.UvicornWorker main:app
   ```

## Project Structure

- `/actions` - Contains action handlers for different IVR operations
- `/base_classes` - Base classes for actions and state management
- `/fsm` - Finite State Machine configurations and states
- `/utils` - Utility functions and helpers
- `main.py` - Main application entry point
- `ivr.py` - Core IVR functionality

## Development

- Format code with Black:

  ```bash
  black .
  ```

- Run tests:
  ```bash
  python -m pytest
  ```

## Deployment

Use the provided `deploy.sh` script for deployment:

```bash
chmod +x deploy.sh
./deploy.sh
```

## License

[Your License Here]

## Support

For support, please contact [Your Support Email] or open an issue in the repository.
