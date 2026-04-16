# SEEDS Backend Server

[![Backend Server Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/a4i-architect/dcc3788d90884aed5ef3bfc393978480/raw/backend-server-coverage.json)](https://github.com/A4i-tech/SEEDS/actions/workflows/backend-server-main.yml)

Backend server for the SEEDS (Student Engagement and Educational Development System) platform, providing RESTful APIs for content management, user authentication, class management, and call handling.

## Features

- **User Management**: Handle teacher and student accounts, authentication, and authorization
- **Class Management**: Create and manage classes, enroll students, and assign content
- **Content Management**: Upload, store, and serve educational content
- **Call Management**: Handle voice calls and conference calls
- **Logging**: Comprehensive logging system for debugging and monitoring
- **API Documentation**: Interactive API documentation with Swagger UI

## Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher) or yarn
- MongoDB (v6 or higher)
- Azure Storage Account (for file storage)
- Firebase Admin SDK credentials (for authentication)

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd backend-server
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the environment variables with your configuration

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=4000
NODE_ENV=development

# MongoDB
DB_CONNECTION=mongodb://127.0.0.1:27017/SEEDS-Teacher-Backend
MONGODB_URI=mongodb://127.0.0.1:27017/SEEDS-Teacher-Backend

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string
AZURE_STORAGE_CONTAINER=your_container_name

# Firebase Admin
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=30d

# Phone Number Encryption
PHONE_NUMBER_ENCRYPTION_KEY=your_encryption_key

# IVR Server
IVR_SERVER_URL=your_ivr_server_url
```

## Running Locally

1. Start MongoDB service
2. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```
3. The server will start on `http://localhost:4000`
4. Access the API documentation at `http://localhost:4000/api-docs`

## API Documentation

Interactive API documentation is available at `/api-docs` when the server is running. The documentation includes:

- All available endpoints
- Request/response schemas
- Authentication requirements
- Example requests and responses

## Project Structure

```
backend-server/
├── models/           # Database models
├── routes/           # API route handlers
├── services/         # Business logic
├── middleware/       # Express middleware
├── utils/            # Utility functions
├── jobs/             # Background jobs (Agenda)
├── config/           # Configuration files
├── public/           # Static files
├── .env.example      # Example environment variables
├── package.json      # Project dependencies
├── index.js          # Application entry point
└── README.md         # This file
```

## Testing

To run tests:

```bash
npm test
# or
yarn test
```

## Production Deployment

1. Build the application:

   ```bash
   npm run build
   # or
   yarn build
   ```

2. Start the production server:
   ```bash
   NODE_ENV=production node dist/index.js
   ```

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start dist/index.js --name "seeds-backend"

# Other useful PM2 commands
pm2 logs seeds-backend     # View logs
pm2 restart seeds-backend  # Restart the app
pm2 stop seeds-backend     # Stop the app
pm2 delete seeds-backend   # Remove from PM2
```

## Environment Variables

| Variable                        | Description                          | Required | Default     |
| ------------------------------- | ------------------------------------ | -------- | ----------- |
| PORT                            | Server port                          | No       | 4000        |
| NODE_ENV                        | Environment (development/production) | No       | development |
| DB_CONNECTION                   | Backend MongoDB connection string    | Yes      | -           |
| MONGODB_URI                     | Migration MongoDB connection string  | No       | DB_CONNECTION |
| AZURE_STORAGE_CONNECTION_STRING | Azure Storage connection string      | Yes      | -           |
| AZURE_STORAGE_CONTAINER         | Azure Storage container name         | Yes      | -           |
| FIREBASE_PROJECT_ID             | Firebase project ID                  | Yes      | -           |
| FIREBASE_PRIVATE_KEY            | Firebase private key                 | Yes      | -           |
| FIREBASE_CLIENT_EMAIL           | Firebase client email                | Yes      | -           |
| JWT_SECRET                      | Secret for JWT signing               | Yes      | -           |
| JWT_EXPIRES_IN                  | JWT expiration time                  | No       | 30d         |
| PHONE_NUMBER_ENCRYPTION_KEY     | Key for encrypting phone numbers     | Yes      | -           |
| IVR_SERVER_URL                  | URL of the IVR server                | Yes      | -           |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please contact the development team or open an issue in the repository.
