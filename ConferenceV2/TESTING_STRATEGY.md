# ConferenceV2 Testing Strategy

## 🎯 Overview

The ConferenceV2 system is a complex, multi-layered application with numerous components, external integrations, and real-time features. This document outlines a comprehensive testing strategy to ensure quality, maintainability, and confidence in the system.

## 📊 Testing Pyramid Strategy

```
                    🔺 E2E Tests (5%)
                   /               \
                  /                 \
                 /   Integration     \
                /     Tests (25%)     \
               /                       \
              /                         \
             /        Unit Tests         \
            /          (70%)             \
           /_____________________________ \
```

### **1. Unit Tests (70% of test coverage)**
- **Fast execution** (< 1ms per test)
- **Isolated components** with mocked dependencies
- **High coverage** of business logic
- **Immediate feedback** during development

### **2. Integration Tests (25% of test coverage)**
- **Component interaction** testing
- **Database and external service** integration
- **API endpoint** testing
- **Event flow** validation

### **3. End-to-End Tests (5% of test coverage)**
- **Complete user workflows**
- **Real external services** (staging environment)
- **Cross-system** validation
- **Performance** and load testing

## 🗂️ Component-Based Testing Strategy

### **Phase 1: Foundation Layer Testing (Week 1-2)**

#### **1.1 Models and Schemas Testing**
```python
# Priority: HIGH - Foundation for everything else
tests/unit/models/
├── test_participant.py           # ✅ COMPLETED
├── test_conference_call_state.py
├── test_action_history.py
├── test_audio_content_state.py
├── test_system_audio_messages.py
└── test_webhook_event.py
```

**Testing Focus:**
- Pydantic model validation
- Enum serialization/deserialization
- Model methods and computed properties
- Edge cases and invalid data handling

#### **1.2 Core Service Testing**
```python
# Priority: HIGH - Heart of the system
tests/unit/services/
└── test_conference_call.py      # ✅ COMPLETED (100% coverage)
```

### **Phase 2: Service Layer Testing (Week 3-4)**

#### **2.1 Communication API Layer**
```python
tests/unit/services/communication_api/
├── test_base_communication_api.py
├── test_communication_api_factory.py
└── test_vonage_api.py
```

**Testing Strategy:**
```python
# Mock external HTTP calls
@pytest.fixture
def mock_vonage_response():
    with patch('httpx.AsyncClient.post') as mock_post:
        mock_post.return_value.json.return_value = {"conference_id": "test-123"}
        yield mock_post

# Test factory pattern
def test_communication_api_factory():
    factory = CommunicationAPIFactory()
    api = factory.create(CommunicationAPIType.VONAGE)
    assert isinstance(api, VonageAPI)
```

#### **2.2 Storage Layer Testing**
```python
tests/unit/services/storage_manager/
├── test_base_storage_manager.py
├── test_cosmosdb_storage.py
└── test_in_memory_storage.py
```

**Testing Strategy:**
```python
# Use pytest-asyncio for async storage operations
@pytest.mark.asyncio
async def test_save_and_load_state():
    storage = InMemoryStorageManager()
    test_state = {"participants": {}, "is_running": False}
    
    await storage.save_state("conf-123", test_state)
    loaded_state = await storage.load_state("conf-123")
    
    assert loaded_state == test_state
```

#### **2.3 Event System Testing**
```python
tests/unit/services/confevents/
├── test_base_event.py
├── test_add_participant_event.py
├── test_remove_participant_event.py
├── test_mute_participant_event.py
├── test_play_content_event.py
├── test_end_conf_event.py
└── ... (all event types)
```

**Testing Strategy:**
```python
# Event execution testing with mocked dependencies
@pytest.mark.asyncio
async def test_add_participant_event():
    mock_conference = Mock()
    mock_conference.add_participant = AsyncMock()
    
    event = AddParticipantEvent(
        conference=mock_conference,
        phone_number="+1234567890"
    )
    
    await event.execute_event()
    mock_conference.add_participant.assert_called_once_with("+1234567890")
```

### **Phase 3: Singleton and Manager Testing (Week 5)**

#### **3.1 Singleton Services**
```python
tests/unit/services/singletons/
├── test_conference_call_manager.py
├── test_websocket_service.py
└── test_azure_service_bus_service.py
```

**Testing Strategy:**
```python
# Singleton pattern testing
def test_conference_call_manager_singleton():
    manager1 = ConferenceCallManager.get_instance()
    manager2 = ConferenceCallManager.get_instance()
    assert manager1 is manager2

# Multi-conference management
@pytest.mark.asyncio
async def test_multiple_conferences():
    manager = ConferenceCallManager()
    
    conf1_id = manager.create_conference("+teacher1", ["+student1"])
    conf2_id = manager.create_conference("+teacher2", ["+student2"])
    
    assert conf1_id != conf2_id
    assert len(manager.conferences) == 2
```

### **Phase 4: API Layer Testing (Week 6)**

#### **4.1 Router Testing**
```python
tests/unit/routers/
├── test_conference_router.py
├── test_webhooks_router.py
└── test_websocket_router.py
```

**Testing Strategy:**
```python
from fastapi.testclient import TestClient

def test_create_conference():
    client = TestClient(app)
    response = client.post("/conference/create", json={
        "teacher_phone": "+1234567890",
        "student_phones": ["+0987654321"]
    })
    
    assert response.status_code == 200
    assert "id" in response.json()
    assert response.json()["status"] == "CREATED"
```

## 🔧 Integration Testing Strategy

### **Phase 5: Integration Tests (Week 7-8)**

#### **5.1 Service Integration Tests**
```python
tests/integration/
├── test_conference_workflow.py
├── test_event_processing_flow.py
├── test_storage_persistence.py
└── test_websocket_communication.py
```

**Testing Strategy:**
```python
# Full workflow testing with real database
@pytest.mark.integration
@pytest.mark.asyncio
async def test_complete_conference_workflow():
    # Use real CosmosDB testcontainer
    async with CosmosDBContainer() as cosmos:
        storage = CosmosDBStorage(cosmos.connection_string)
        conference = ConferenceCall("test-conf", ..., storage, ...)
        
        # Test complete workflow
        conference.set_participant_state("+teacher", ["+student"])
        await conference.start_conference()
        
        # Verify state persistence
        saved_state = await storage.load_state("test-conf")
        assert saved_state["is_running"] is True
```

#### **5.2 External Service Integration**
```python
tests/integration/external/
├── test_vonage_integration.py
├── test_azure_services.py
└── test_websocket_server.py
```

## 📝 Testing Implementation Guidelines

### **1. Test Organization Structure**

```python
# File naming convention
test_<component_name>.py

# Class naming convention
class Test<ComponentName>:
    
# Method naming convention
def test_<action>_<expected_result>_<condition>():
    # Given - Setup
    # When - Action
    # Then - Assert
```

### **2. Fixture Strategy**

```python
# Shared fixtures in conftest.py
@pytest.fixture
def mock_communication_api():
    """Reusable mock for communication API"""
    mock = AsyncMock()
    mock.start_conf.return_value = "conf-123"
    return mock

# Use fixture scoping for performance
@pytest.fixture(scope="session")
def database_container():
    """Database container for integration tests"""
    # Setup expensive resources once per session
```

### **3. Parameterized Testing**

```python
# Test multiple scenarios efficiently
@pytest.mark.parametrize("role,expected_permissions", [
    (Role.TEACHER, ["mute", "unmute", "add_participant"]),
    (Role.STUDENT, ["raise_hand"]),
])
def test_participant_permissions(role, expected_permissions):
    participant = Participant(role=role)
    assert participant.get_permissions() == expected_permissions
```

### **4. Async Testing Patterns**

```python
# Use pytest-asyncio for async code
@pytest.mark.asyncio
async def test_async_operation():
    result = await some_async_function()
    assert result is not None

# Test timeout scenarios
@pytest.mark.asyncio
async def test_operation_timeout():
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(slow_operation(), timeout=1.0)
```

## 🎛️ Testing Tools and Setup

### **Required Dependencies**

```python
# Add to requirements-test.txt
pytest==7.4.0
pytest-asyncio==0.21.0
pytest-mock==3.10.0
pytest-cov==4.1.0
pytest-xdist==3.3.0  # Parallel test execution
pytest-html==3.2.0   # HTML reports
httpx==0.24.0         # HTTP client testing
testcontainers==3.7.0 # Integration testing
factory-boy==3.2.1    # Test data generation
```

### **Test Configuration (pytest.ini)**

```ini
[tool:pytest]
testpaths = tests
asyncio_mode = auto
addopts = 
    --strict-markers
    --cov=services
    --cov=models
    --cov=routers
    --cov-report=html:htmlcov
    --cov-report=term-missing
    --cov-fail-under=85
markers =
    unit: Unit tests
    integration: Integration tests
    e2e: End-to-end tests
    slow: Slow running tests
```

## 📊 Testing Metrics and Quality Gates

### **Coverage Targets**

| Component          | Target Coverage | Priority |
| ------------------ | --------------- | -------- |
| Models             | 95%             | HIGH     |
| Core Services      | 95%             | HIGH     |
| Event System       | 90%             | HIGH     |
| API Routers        | 85%             | MEDIUM   |
| Singletons         | 85%             | MEDIUM   |
| Communication APIs | 80%             | MEDIUM   |

### **Quality Gates**

```python
# Pre-commit hooks
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: pytest-check
        name: pytest-check
        entry: pytest tests/unit --cov-fail-under=85
        language: system
        pass_filenames: false
        always_run: true
```

## 🚀 Testing Execution Strategy

### **Development Workflow**

```bash
# 1. Run unit tests during development (fast feedback)
pytest tests/unit -v

# 2. Run tests for specific component
pytest tests/unit/services/test_conference_call.py -v

# 3. Run with coverage
pytest tests/unit --cov=services.conference_call --cov-report=term-missing

# 4. Parallel execution for speed
pytest tests/unit -n auto
```

### **CI/CD Pipeline Strategy**

```yaml
# GitHub Actions workflow
name: Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Unit Tests
        run: pytest tests/unit --cov --cov-report=xml
      
  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - name: Run Integration Tests
        run: pytest tests/integration -m "not slow"
      
  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Run E2E Tests
        run: pytest tests/e2e
```

## 🔄 Continuous Improvement

### **Test Maintenance Strategy**

1. **Weekly Test Review**: Identify flaky tests and coverage gaps
2. **Monthly Refactoring**: Update test fixtures and reduce duplication
3. **Quarterly Architecture Review**: Ensure tests align with code changes

### **Performance Monitoring**

```python
# Test execution time monitoring
pytest tests/unit --durations=10  # Show 10 slowest tests

# Memory usage monitoring for large test suites
pytest tests/unit --memray
```

## 📈 Testing Roadmap

### **Phase 1: Foundation (Weeks 1-2)**
- ✅ Core service testing (conference_call.py) - COMPLETED
- 🔄 Model validation testing
- 🔄 Schema testing

### **Phase 2: Service Layer (Weeks 3-4)**
- 🔄 Communication API testing
- 🔄 Storage manager testing
- 🔄 Event system testing

### **Phase 3: Integration (Weeks 5-6)**
- 🔄 Singleton service testing
- 🔄 API router testing
- 🔄 Workflow integration testing

### **Phase 4: Quality & Performance (Weeks 7-8)**
- 🔄 Load testing
- 🔄 Security testing
- 🔄 Performance profiling

## 🎯 Success Criteria

### **Quantitative Metrics**
- **85%+ code coverage** across all components
- **<100ms average** unit test execution time
- **<5 seconds** for full unit test suite
- **Zero flaky tests** in CI/CD pipeline

### **Qualitative Metrics**
- **Confidence in deployments** - No production bugs from untested code
- **Fast feedback loops** - Developers get immediate test results
- **Maintainable test suite** - Easy to update when code changes
- **Documentation value** - Tests serve as component usage examples

This comprehensive testing strategy provides a roadmap for systematically building confidence in the ConferenceV2 system while maintaining development velocity and code quality.