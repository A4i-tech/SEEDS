const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SEEDS Backend API",
      version: "1.0.0",
      description: "API documentation for SEEDS Backend Server",
      contact: {
        name: "SEEDS Team",
      },
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Development server",
      },
    ],
    components: {
      schemas: {
        CallLog: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Unique identifier for the call log",
              example: "507f1f77bcf86cd799439011",
            },
            callId: {
              type: "string",
              description: "Unique identifier for the call",
            },
            from: {
              type: "string",
              description: "Caller's phone number",
            },
            to: {
              type: "string",
              description: "Recipient's phone number",
            },
            startTime: {
              type: "string",
              format: "date-time",
              description: "When the call started",
            },
            endTime: {
              type: "string",
              format: "date-time",
              description: "When the call ended",
              nullable: true,
            },
            status: {
              type: "string",
              enum: ["initiated", "in-progress", "completed", "failed"],
              description: "Call status",
            },
            duration: {
              type: "number",
              description: "Call duration in seconds",
              minimum: 0,
            },
            metadata: {
              type: "object",
              additionalProperties: true,
              description: "Additional call metadata",
            },
          },
          required: ["callId", "from", "startTime", "status"],
        },
        FsmContext: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Unique identifier for the FSM context",
              example: "507f1f77bcf86cd799439012",
            },
            contextId: {
              type: "string",
              description: "Unique identifier for the context",
            },
            callId: {
              type: "string",
              description: "Associated call ID",
            },
            currentState: {
              type: "string",
              description: "Current state of the FSM",
            },
            history: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  state: { type: "string" },
                  timestamp: { type: "string", format: "date-time" },
                  event: { type: "string" },
                  data: { type: "object" },
                },
              },
              description: "History of state transitions",
            },
            data: {
              type: "object",
              additionalProperties: true,
              description: "Additional context data",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "When the context was created",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "When the context was last updated",
            },
          },
          required: ["contextId", "currentState"],
        },
        ClassRoom: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Unique identifier for the class",
              example: "507f1f77bcf86cd799439011",
            },
            name: {
              type: "string",
              description: "Name of the class",
              example: "Math 101",
            },
            teacher: {
              type: "string",
              description: "ID of the teacher who owns this class",
              example: "507f1f77bcf86cd799439012",
            },
            students: {
              type: "array",
              description: "Array of student IDs enrolled in the class",
              items: {
                type: "string",
              },
              example: ["507f1f77bcf86cd799439013", "507f1f77bcf86cd799439014"],
            },
            leaders: {
              type: "array",
              description: "Array of leader/assistant IDs for the class",
              items: {
                type: "string",
              },
              example: ["507f1f77bcf86cd799439015"],
            },
            contentIds: {
              type: "array",
              description: "Array of content IDs associated with the class",
              items: {
                type: "string",
              },
              example: ["507f1f77bcf86cd799439016", "507f1f77bcf86cd799439017"],
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "When the class was created",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "When the class was last updated",
            },
          },
          required: ["name", "teacher"],
        },
        UserInfo: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Unique identifier for the user",
              example: "507f1f77bcf86cd799439011",
            },
            email: {
              type: "string",
              format: "email",
              description: "Email address of the user",
              example: "user@example.com",
            },
            phoneNumber: {
              type: "string",
              description: "Encrypted phone number of the user",
              example: "encrypted:1234567890",
            },
            name: {
              type: "string",
              description: "Full name of the user",
              example: "John Doe",
            },
            role: {
              type: "string",
              enum: ["student", "teacher", "admin"],
              description: "Role of the user in the system",
            },
            classes: {
              type: "array",
              description: "Array of class IDs the user is associated with",
              items: {
                type: "string",
              },
              example: ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"],
            },
            lastLogin: {
              type: "string",
              format: "date-time",
              description: "When the user last logged in",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "When the user account was created",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "When the user account was last updated",
            },
          },
          required: ["email"],
        },
        Teacher: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Unique identifier for the teacher",
              example: "507f1f77bcf86cd799439011",
            },
            phoneNumber: {
              type: "string",
              description: "Phone number of the teacher/content creator account",
              example: "9876543210",
            },
            name: {
              type: "string",
              description: "Full name of the teacher",
              example: "John Doe",
            },
            role: {
              type: "string",
              enum: ["teacher", "content_creator"],
              description: "Role attached to this user record",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "When the teacher record was created",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "When the teacher record was last updated",
            },
          },
          required: ["phoneNumber", "name", "role"],
        },
        LogEntry: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Unique identifier for the log entry",
              example: "507f1f77bcf86cd799439011",
            },
            userId: {
              type: "string",
              description: "ID of the user associated with this log entry",
              example: "507f1f77bcf86cd799439012",
            },
            action: {
              type: "string",
              description: "Action that was performed",
              example: "login",
            },
            details: {
              type: "object",
              additionalProperties: true,
              description: "Additional details about the log entry",
            },
            ipAddress: {
              type: "string",
              description: "IP address of the client",
              example: "192.168.1.1",
            },
            userAgent: {
              type: "string",
              description: "User agent string of the client",
              example:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
            timestamp: {
              type: "string",
              format: "date-time",
              description: "When the log entry was created",
            },
            status: {
              type: "string",
              enum: ["success", "error", "warning", "info"],
              description: "Status of the logged action",
            },
            error: {
              type: "object",
              description: "Error details if the action failed",
              properties: {
                message: { type: "string" },
                code: { type: "string" },
                stack: { type: "string" },
              },
            },
          },
          required: ["userId", "action", "timestamp"],
        },
        ClassRoomInput: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Required when updating an existing class",
              example: "507f1f77bcf86cd799439011",
            },
            name: {
              type: "string",
              description: "Name of the class",
              example: "Math 101",
            },
            students: {
              type: "array",
              description: "Array of student IDs to enroll in the class",
              items: {
                type: "string",
              },
              example: ["507f1f77bcf86cd799439013", "507f1f77bcf86cd799439014"],
            },
            leaders: {
              type: "array",
              description: "Array of leader/assistant IDs for the class",
              items: {
                type: "string",
              },
              example: ["507f1f77bcf86cd799439015"],
            },
            contentIds: {
              type: "array",
              description: "Array of content IDs to associate with the class",
              items: {
                type: "string",
              },
              example: ["507f1f77bcf86cd799439016", "507f1f77bcf86cd799439017"],
            },
          },
          required: ["name"],
        },
        ContentV3: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Unique identifier for the content",
              example: "507f1f77bcf86cd799439011",
            },
            title: {
              type: "object",
              properties: {
                english: { type: "string" },
                local: { type: "string" },
              },
              required: ["english"],
            },
            theme: {
              type: "object",
              properties: {
                english: { type: "string" },
                local: { type: "string" },
                audioUrl: { type: "string" },
              },
            },
            language: {
              type: "string",
              description: "Language code (e.g., en, hi)",
              example: "en",
            },
            type: {
              type: "string",
              description: "Content type",
              example: "quiz",
            },
            isPullModel: {
              type: "boolean",
              description: "Whether the content is part of the pull model",
              default: false,
            },
            isTeacherApp: {
              type: "boolean",
              description: "Whether the content is for the teacher app",
              default: false,
            },
            creation_time: {
              type: "integer",
              description: "Unix timestamp of when the content was created",
            },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                  },
                  correctOption: { type: "number" },
                  explanation: { type: "string" },
                  audioUrl: { type: "string" },
                },
              },
            },
            audioUrl: {
              type: "string",
              description: "URL to the main audio file for this content",
            },
            thumbnailUrl: {
              type: "string",
              description: "URL to the thumbnail image for this content",
            },
            duration: {
              type: "number",
              description: "Duration of the content in seconds",
            },
            metadata: {
              type: "object",
              additionalProperties: true,
            },
          },
          required: ["title", "language", "type"],
        },
        QuizCreateRequest: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier for the quiz",
              example: "quiz-123",
            },
            title: {
              type: "object",
              properties: {
                english: { type: "string" },
                local: { type: "string" },
              },
              required: ["english"],
            },
            language: {
              type: "string",
              description: "Language code (e.g., en, hi)",
              example: "en",
            },
            theme: {
              type: "string",
              description: "Theme of the quiz",
            },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                  },
                  correctOption: { type: "number" },
                  explanation: { type: "string" },
                },
                required: ["question", "options", "correctOption"],
              },
            },
            isPullModel: {
              type: "boolean",
              default: false,
              description: "Whether the quiz is part of the pull model",
            },
          },
          required: ["id", "title", "language", "questions"],
        },
        Job: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Job ID",
            },
            name: {
              type: "string",
              description: "Job name",
            },
            data: {
              type: "object",
              properties: {
                content: {
                  type: "object",
                  properties: {
                    title: {
                      type: "object",
                      properties: {
                        english: { type: "string" },
                        local: { type: "string" },
                      },
                    },
                    language: { type: "string" },
                  },
                },
                startedAt: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            type: {
              type: "string",
              description: "Job type",
            },
            priority: {
              type: "number",
              description: "Job priority",
            },
            nextRunAt: {
              type: "string",
              format: "date-time",
              description: "Next run time",
            },
            lastModifiedBy: {
              type: "string",
              description: "Last modified by",
            },
            lockedAt: {
              type: "string",
              format: "date-time",
              description: "When the job was locked",
            },
            lastRunAt: {
              type: "string",
              format: "date-time",
              description: "Last run time",
            },
            failedAt: {
              type: "string",
              format: "date-time",
              description: "When the job failed",
              nullable: true,
            },
            failCount: {
              type: "number",
              description: "Number of times the job has failed",
            },
            failReason: {
              type: "string",
              description: "Reason for failure",
              nullable: true,
            },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js"], // Path to the API routes
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  // Swagger page
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

  // Docs in JSON format
  app.get("/docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(specs);
  });
};
