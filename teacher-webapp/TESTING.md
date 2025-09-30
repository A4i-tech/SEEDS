# Test Guide for Teacher WebApp

This document explains the comprehensive test suite for the Teacher WebApp React application.

## Test Structure

The test suite is organized into the following categories:

### 1. **Unit Tests**
- **App.test.js** - Tests for the main App component
- **components/TeacherList.test.js** - Tests for teacher selection component
- **components/StudentList.test.js** - Tests for student selection component
- **components/AddParticipantModal.test.js** - Tests for add participant modal
- **context/ConferenceContext.test.js** - Tests for React context and state management
- **services/apiService.test.js** - Tests for API service functions
- **state.test.js** - Tests for data models and sample data
- **callPage.test.js** - Tests for the conference details page

### 2. **Integration Tests**
- **integration.test.js** - End-to-end user flow tests

## Test Coverage Areas

### **Component Testing**
- ✅ Rendering with correct props
- ✅ User interactions (clicks, form submissions)
- ✅ Conditional rendering based on state
- ✅ Error handling and loading states
- ✅ Accessibility features

### **State Management Testing**
- ✅ Context provider functionality
- ✅ State updates and side effects
- ✅ Hook behavior and return values
- ✅ SSE event handling

### **API Service Testing**
- ✅ Correct endpoint calls
- ✅ Request payload validation
- ✅ Error handling
- ✅ Environment variable usage

### **Data Model Testing**
- ✅ Class constructors and default values
- ✅ Data validation
- ✅ Sample data integrity

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Specific Test File
```bash
npm test App.test.js
npm test TeacherList.test.js
```

### Run Tests Matching a Pattern
```bash
npm test -- --testNamePattern="teacher selection"
```

## Test Scenarios Covered

### **User Workflows**
1. **Teacher Selection**
   - Select/deselect teacher
   - Single teacher selection (exclusive)
   - Visual feedback for selection

2. **Student Selection**
   - Multiple student selection
   - Toggle selection on/off
   - Visual feedback for selected students

3. **Conference Creation**
   - Form validation (teacher + students required)
   - API call with correct parameters
   - Loading states during submission
   - Error handling for failed requests

4. **Conference Management**
   - Start/stop conference calls
   - Mute/unmute participants
   - Audio playback controls
   - Add participants during call
   - Reconnect disconnected participants

### **Edge Cases**
- Empty data arrays
- Network errors
- Invalid API responses
- Disconnected participants
- Missing environment variables

### **Accessibility**
- Screen reader compatibility
- Keyboard navigation
- ARIA labels and roles

## Mock Setup

The tests use comprehensive mocking for:

- **API Calls**: All fetch requests are mocked
- **Environment Variables**: Test-specific values
- **EventSource**: SSE connection mocking
- **External Dependencies**: React Router, etc.

## Test Environment

The test environment is configured with:
- **Jest** as the test runner
- **React Testing Library** for component testing
- **@testing-library/jest-dom** for additional matchers
- **setupTests.js** for global test configuration

## Best Practices Used

1. **Arrange-Act-Assert Pattern**: Clear test structure
2. **Descriptive Test Names**: Self-documenting test cases
3. **Isolated Tests**: Each test is independent
4. **Mock Cleanup**: Proper cleanup between tests
5. **Error Testing**: Both success and failure scenarios
6. **Async Testing**: Proper handling of async operations

## Adding New Tests

When adding new features, create tests for:

1. **Component Behavior**: How it renders and responds to props
2. **User Interactions**: Click handlers, form submissions
3. **State Changes**: How state updates affect the UI
4. **API Integration**: Calls to backend services
5. **Error Scenarios**: How the component handles failures

### Example Test Structure

```javascript
describe('ComponentName', () => {
  beforeEach(() => {
    // Setup code
  });

  test('renders correctly with default props', () => {
    // Test basic rendering
  });

  test('handles user interaction', async () => {
    // Test user actions
  });

  test('handles errors gracefully', async () => {
    // Test error scenarios
  });
});
```

## Debugging Tests

### Common Issues
1. **Async Operations**: Use `waitFor` for async state updates
2. **Mock Issues**: Ensure mocks are properly cleared between tests
3. **DOM Queries**: Use appropriate queries (getBy*, findBy*, queryBy*)
4. **Event Handling**: Use `fireEvent` for user interactions

### Debug Commands
```bash
# Run tests with debug output
npm test -- --verbose

# Run specific test with debugging
npm test -- --testNamePattern="specific test" --verbose
```

## Performance Considerations

- Tests run in parallel for faster execution
- Mocks prevent actual network calls
- Cleanup functions prevent memory leaks
- Focused tests avoid unnecessary renders

## Continuous Integration

The test suite is designed to run in CI/CD environments with:
- No external dependencies
- Deterministic results
- Fast execution times
- Clear error reporting

## Maintenance

- **Regular Updates**: Keep tests updated with component changes
- **Coverage Monitoring**: Maintain high test coverage
- **Refactoring**: Update tests when refactoring components
- **Documentation**: Keep this guide updated with new test patterns