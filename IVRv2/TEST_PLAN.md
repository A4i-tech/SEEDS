# IVRv2 Test Plan

## Overview

This document outlines a comprehensive testing strategy for the IVRv2 (Interactive Voice Response version 2) system. The IVRv2 is a FastAPI-based application that integrates with Vonage Voice API to provide interactive voice response functionality with finite state machine (FSM) based call flows.

## System Architecture Components

The IVRv2 system consists of the following key components:
- **FastAPI Application** (`main.py`) - Main API server
- **Finite State Machine (FSM)** - Call flow management
- **Action System** - Modular IVR actions (Talk, Stream, Input, etc.)
- **Database Integration** - MongoDB for state persistence
- **Vonage Integration** - Voice call handling
- **Azure Services** - Blob storage for audio content

## Testing Strategy

### 1. Test Types

#### 1.1 Unit Tests
- Test individual functions and classes in isolation
- Mock external dependencies
- Focus on business logic and edge cases

#### 1.2 Integration Tests
- Test component interactions
- Test API endpoints with real database connections
- Test FSM state transitions

#### 1.3 End-to-End Tests
- Test complete call flows
- Test webhook integrations
- Test external service integrations

#### 1.4 Performance Tests
- Load testing for concurrent calls
- Memory usage analysis
- Response time optimization

#### 1.5 Security Tests
- Authentication and authorization
- Input validation and sanitization
- API security testing

## 2. Test Coverage Areas

### 2.1 API Endpoints (`main.py`)

#### 2.1.1 Health Check Endpoints
- **GET /**: Basic health check
- **GET /answer**: Default NCCO response
- **GET /ivr_structure**: IVR visualization

#### 2.1.2 Configuration Management
- **POST /updateivr**: FSM configuration updates
- **GET /getFSM**: FSM retrieval by ID

#### 2.1.3 Call Management
- **POST /start_ivr**: Single call initiation
- **POST /start_bulk_calls**: Bulk call initiation
- **POST /input**: DTMF input processing
- **POST /event**: Call event handling
- **POST /conversation_events**: RTC event handling
- **POST /fallback**: Fallback handling

### 2.2 FSM Components

#### 2.2.1 State Management (`fsm/state.py`)
- State initialization and configuration
- Transition management
- Action execution
- Menu handling

#### 2.2.2 FSM Operations (`fsm/fsm.py`)
- FSM instantiation
- State traversal
- Input processing
- Action generation

#### 2.2.3 Transitions (`fsm/transition.py`)
- Transition conditions
- State change logic
- Action chaining

### 2.3 Action System

#### 2.3.1 Base Actions (`actions/base_actions/`)
- **TalkAction**: Text-to-speech functionality
- **StreamAction**: Audio streaming
- **InputAction**: User input collection
- **RecordAction**: Call recording

#### 2.3.2 Vonage Actions (`actions/vonage_actions/`)
- **VonageActionFactory**: Action factory pattern
- **VonageActionAccumulator**: Action combination logic
- Vonage-specific action implementations

### 2.4 Utilities and Support

#### 2.4.1 Model Classes (`utils/model_classes.py`)
- Data validation and serialization
- Database document models
- Request/response models

#### 2.4.2 Database Operations (`utils/mongodb.py`)
- CRUD operations
- Query functionality
- Connection management

#### 2.4.3 Helper Functions (`utils/functions.py`)
- JSON encoding/decoding
- Data formatting
- Utility functions

### 2.5 External Integrations

#### 2.5.1 Vonage API Integration
- Call creation and management
- Webhook handling
- NCCO generation

#### 2.5.2 Azure Services
- Blob storage integration
- SAS token generation
- Content management

#### 2.5.3 MongoDB Integration
- Connection handling
- Document operations
- State persistence

## 3. Test Implementation Plan

### 3.1 Testing Framework Setup

```python
# Required testing dependencies
pytest==7.4.0
pytest-asyncio==0.21.0
pytest-cov==4.1.0
httpx==0.24.1
pytest-mock==3.11.1
mongomock==4.1.2
responses==0.23.1
```

### 3.2 Test Directory Structure

```
tests/
├── conftest.py                    # Test configuration and fixtures
├── test_main.py                   # API endpoint tests
├── unit/
│   ├── test_actions/
│   │   ├── test_base_actions/
│   │   │   ├── test_talk_action.py
│   │   │   ├── test_stream_action.py
│   │   │   ├── test_input_action.py
│   │   │   └── test_record_action.py
│   │   └── test_vonage_actions/
│   │       ├── test_vonage_action_factory.py
│   │       └── test_vonage_action_accumulator.py
│   ├── test_fsm/
│   │   ├── test_state.py
│   │   ├── test_fsm.py
│   │   ├── test_transition.py
│   │   └── test_instantiation.py
│   ├── test_utils/
│   │   ├── test_model_classes.py
│   │   ├── test_functions.py
│   │   ├── test_mongodb.py
│   │   └── test_enums.py
│   └── test_base_classes/
│       ├── test_action.py
│       ├── test_action_factory.py
│       └── test_action_accumulator.py
├── integration/
│   ├── test_api_endpoints.py
│   ├── test_fsm_integration.py
│   ├── test_database_integration.py
│   └── test_vonage_integration.py
├── e2e/
│   ├── test_call_flows.py
│   ├── test_bulk_calls.py
│   └── test_webhook_integration.py
├── performance/
│   ├── test_load.py
│   ├── test_concurrent_calls.py
│   └── test_memory_usage.py
└── utils/
    ├── test_helpers.py
    ├── mock_factories.py
    └── fixtures.py
```

### 3.3 Key Test Cases

#### 3.3.1 API Endpoint Tests

**Test: POST /start_ivr**
```python
@pytest.mark.asyncio
async def test_start_ivr_success():
    # Test successful call initiation
    
@pytest.mark.asyncio
async def test_start_ivr_duplicate_call():
    # Test handling of duplicate calls
    
@pytest.mark.asyncio
async def test_start_ivr_invalid_phone():
    # Test invalid phone number handling
```

**Test: POST /input**
```python
@pytest.mark.asyncio
async def test_dtmf_input_processing():
    # Test DTMF input processing
    
@pytest.mark.asyncio
async def test_dtmf_state_transition():
    # Test state transitions on input
    
@pytest.mark.asyncio
async def test_dtmf_invalid_input():
    # Test invalid input handling
```

#### 3.3.2 FSM Tests

**Test: State Management**
```python
def test_state_initialization():
    # Test state creation and configuration
    
def test_state_add_transition():
    # Test transition addition
    
def test_state_duplicate_transition():
    # Test duplicate transition handling
```

**Test: FSM Operations**
```python
@pytest.mark.asyncio
async def test_fsm_get_next_actions():
    # Test action generation for state transitions
    
@pytest.mark.asyncio
async def test_fsm_invalid_state():
    # Test invalid state handling
```

#### 3.3.3 Action System Tests

**Test: TalkAction**
```python
def test_talk_action_initialization():
    # Test TalkAction creation
    
def test_talk_action_serialization():
    # Test JSON serialization/deserialization
```

**Test: StreamAction**
```python
def test_stream_action_with_url():
    # Test stream action with valid URL
    
def test_stream_action_invalid_url():
    # Test stream action with invalid URL
```

#### 3.3.4 Integration Tests

**Test: Database Integration**
```python
@pytest.mark.asyncio
async def test_mongodb_crud_operations():
    # Test CRUD operations with MongoDB
    
@pytest.mark.asyncio
async def test_ongoing_fsm_state_management():
    # Test IVR state persistence
```

**Test: Vonage Integration**
```python
@pytest.mark.asyncio
async def test_vonage_call_creation():
    # Test call creation with Vonage API
    
@pytest.mark.asyncio
async def test_vonage_webhook_handling():
    # Test webhook processing
```

#### 3.3.5 End-to-End Tests

**Test: Complete Call Flow**
```python
@pytest.mark.asyncio
async def test_complete_ivr_flow():
    # Test complete IVR interaction
    # 1. Start call
    # 2. Process DTMF inputs
    # 3. Navigate through states
    # 4. End call properly
```

**Test: Bulk Call Operations**
```python
@pytest.mark.asyncio
async def test_bulk_call_initiation():
    # Test bulk call functionality
    
@pytest.mark.asyncio
async def test_bulk_call_rate_limiting():
    # Test rate limiting for bulk calls
```

### 3.4 Mock Strategy

#### 3.4.1 External Service Mocking
- **Vonage API**: Mock all Vonage API calls
- **MongoDB**: Use mongomock for database operations
- **Azure Services**: Mock blob storage and SAS generation
- **HTTP Requests**: Use responses library for HTTP mocking

#### 3.4.2 Test Data Management
- **FSM Configurations**: Create test FSM structures
- **Audio Content**: Mock audio file URLs and metadata
- **Phone Numbers**: Use test phone number ranges
- **Call States**: Create realistic call state scenarios

### 3.5 Performance Testing

#### 3.5.1 Load Testing Scenarios
- **Concurrent Calls**: Test system under multiple simultaneous calls
- **DTMF Input Load**: Test rapid input processing
- **Database Load**: Test database performance under load
- **Memory Usage**: Monitor memory consumption patterns

#### 3.5.2 Performance Metrics
- **Response Time**: API endpoint response times
- **Throughput**: Calls processed per second
- **Error Rate**: Percentage of failed operations
- **Resource Usage**: CPU and memory utilization

### 3.6 Security Testing

#### 3.6.1 Input Validation
- **Phone Number Validation**: Test various phone number formats
- **DTMF Input Sanitization**: Prevent injection attacks
- **API Parameter Validation**: Test malformed requests

#### 3.6.2 Authentication and Authorization
- **API Key Security**: Test API key handling
- **Webhook Security**: Verify webhook authenticity
- **Environment Variable Security**: Test secret management

## 4. Test Environment Setup

### 4.1 Local Development Testing
```bash
# Install testing dependencies
pip install -r requirements-test.txt

# Set up test environment variables
cp .env.test.example .env.test

# Run test database (Docker)
docker run -d -p 27017:27017 mongo:latest

# Run tests
pytest tests/ -v --cov=. --cov-report=html
```

### 4.2 CI/CD Integration
```yaml
# GitHub Actions workflow example
name: IVRv2 Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:latest
        ports:
          - 27017:27017
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: pytest tests/ --cov=. --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### 4.3 Test Data Management
- **Fixtures**: Create reusable test data fixtures
- **Factory Functions**: Generate test objects dynamically
- **Database Seeding**: Populate test database with known data
- **Cleanup**: Ensure proper test isolation and cleanup

## 5. Quality Metrics and Goals

### 5.1 Coverage Targets
- **Unit Tests**: 90%+ code coverage
- **Integration Tests**: 80%+ critical path coverage
- **End-to-End Tests**: 100% major user flows

### 5.2 Quality Gates
- **All Tests Pass**: No failing tests in CI/CD
- **Coverage Threshold**: Minimum coverage requirements
- **Performance Benchmarks**: Response time thresholds
- **Security Scans**: No critical security vulnerabilities

### 5.3 Test Maintenance
- **Regular Updates**: Keep tests updated with code changes
- **Flaky Test Management**: Identify and fix unstable tests
- **Test Documentation**: Maintain clear test documentation
- **Performance Monitoring**: Track test execution performance

## 6. Risk Assessment and Mitigation

### 6.1 Testing Risks
- **External Dependencies**: Vonage API availability
- **Database Consistency**: MongoDB state management
- **Network Issues**: Webhook delivery failures
- **Race Conditions**: Concurrent call handling

### 6.2 Mitigation Strategies
- **Comprehensive Mocking**: Reduce external dependencies
- **Transaction Management**: Ensure database consistency
- **Retry Logic**: Handle transient failures
- **Isolation**: Prevent test interference

## 7. Implementation Timeline

### Phase 1: Foundation (Week 1-2)
- Set up testing framework and structure
- Implement basic unit tests for core components
- Create test utilities and mock factories

### Phase 2: Core Testing (Week 3-4)
- Complete unit tests for all major components
- Implement integration tests for API endpoints
- Add database integration tests

### Phase 3: Advanced Testing (Week 5-6)
- Implement end-to-end test scenarios
- Add performance testing suite
- Complete security testing

### Phase 4: Optimization (Week 7-8)
- Optimize test execution performance
- Enhance test coverage and quality
- Document testing procedures and best practices

## 8. Conclusion

This comprehensive test plan ensures the IVRv2 system is thoroughly tested across all components and integration points. The multi-layered testing approach provides confidence in system reliability, performance, and security while supporting continuous integration and deployment practices.

The test plan emphasizes:
- **Comprehensive Coverage**: All system components are tested
- **Realistic Scenarios**: Tests reflect real-world usage patterns
- **Performance Assurance**: System performs under expected loads
- **Security Validation**: Security requirements are verified
- **Maintainability**: Tests are structured for long-term maintenance

Regular execution of this test suite will ensure the IVRv2 system continues to meet quality standards and user expectations as it evolves.