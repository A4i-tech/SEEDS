import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'ContentWebApp API',
    version: '1.0.0',
    description: 'API documentation for ContentWebApp',
  },
  servers: [
    {
      url: process.env.REACT_APP_API_BASE_URL,
      description: 'Development server',
    },
  ],
  tags: [
    {
      name: 'Content',
      description: 'Content management endpoints',
    },
    {
      name: 'IVR',
      description: 'IVR management endpoints',
    },
    {
      name: 'Bulk Calls',
      description: 'Bulk call management endpoints',
    },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Content'],
        summary: 'Login page',
        responses: {
          '200': {
            description: 'Login page loaded successfully',
          },
        },
      },
    },
    '/content': {
      get: {
        tags: ['Content'],
        summary: 'Get all content',
        responses: {
          '200': {
            description: 'List of all content items',
          },
        },
      },
    },
    '/content/create': {
      get: {
        tags: ['Content'],
        summary: 'Show create content form',
        responses: {
          '200': {
            description: 'Create content form loaded',
          },
        },
      },
    },
    '/content/detail/{type}/{id}': {
      get: {
        tags: ['Content'],
        summary: 'View content details',
        parameters: [
          {
            name: 'type',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['story', 'quiz', 'riddle'],
            },
            description: 'Type of content',
          },
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Content ID',
          },
        ],
        responses: {
          '200': {
            description: 'Content details loaded successfully',
          },
        },
      },
    },
    '/content/edit/{type}/{id}': {
      get: {
        tags: ['Content'],
        summary: 'Edit content',
        parameters: [
          {
            name: 'type',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['story', 'quiz', 'riddle'],
            },
            description: 'Type of content',
          },
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Content ID',
          },
        ],
        responses: {
          '200': {
            description: 'Edit form loaded successfully',
          },
        },
      },
    },
    '/ivr': {
      get: {
        tags: ['IVR'],
        summary: 'IVR management interface',
        responses: {
          '200': {
            description: 'IVR interface loaded',
          },
        },
      },
    },
    '/viewivr': {
      get: {
        tags: ['IVR'],
        summary: 'View IVR flows',
        responses: {
          '200': {
            description: 'IVR flows loaded',
          },
        },
      },
    },
    '/bulkcall': {
      get: {
        tags: ['Bulk Calls'],
        summary: 'Bulk call initiation interface',
        responses: {
          '200': {
            description: 'Bulk call interface loaded',
          },
        },
      },
    },
  },
};

const ApiDocumentation = () => {
  return (
    <div className="container mt-4">
      <h1>API Documentation</h1>
      <div className="mt-4">
        <SwaggerUI spec={swaggerDocument} />
      </div>
    </div>
  );
};

export default ApiDocumentation;
