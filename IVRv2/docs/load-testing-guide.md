# Load Testing Guide for IVR v2 API

This guide explains how to use Locust for load and stress testing the IVR v2 API.

## Overview

The `locustfile.py` provides a comprehensive load testing framework that simulates concurrent IVR users interacting with the system. It tests the FSM cloning fix for concurrent DTMF input handling and validates system performance under load.

## Prerequisites

1. **Install Locust** (already in pyproject.toml):

    ```bash
    poetry install
    ```

2. **MongoDB Running**: Ensure MongoDB is accessible at the connection string in your `.env` file

3. **IVR Server Running**: Start the FastAPI server:
    ```bash
    poetry run uvicorn app.main:app --port 9210
    ```

## Quick Start

### 1. Setup Test Data

Create test documents in MongoDB (100 users):

```bash
poetry run python locustfile.py --setup --users 100
```

**What this does:**

-   Loads the latest FSM from MongoDB
-   Creates 100 test documents in `ongoingIVRState` collection
-   Each document has a unique `conversation_id` and `phone_number` (e.g., `load_test_0001`)
-   All documents are marked with `is_test: true` for easy cleanup

### 2. Run Load Test

#### Option A: Web UI (Recommended for Development)

```bash
locust -f locustfile.py --host=http://localhost:9210
```

Then open http://localhost:8089 in your browser and configure:

-   **Number of users**: 100 (total concurrent users)
-   **Spawn rate**: 10 (users spawned per second)
-   **Host**: http://localhost:9210 (pre-filled)

Click **Start swarming** to begin the test.

**Benefits:**

-   Real-time charts and statistics
-   Live request breakdown
-   Easy to adjust user count during test
-   Download detailed reports

#### Option B: Headless (CI/CD or Automated Testing)

Run a 60-second test with 100 users:

```bash
locust -f locustfile.py --host=http://localhost:9210 \
       --users 100 --spawn-rate 10 --run-time 60s --headless
```

**Parameters explained:**

-   `--users 100`: Total concurrent users
-   `--spawn-rate 10`: Add 10 users per second
-   `--run-time 60s`: Test duration (60 seconds)
-   `--headless`: No web UI, outputs to console

### 3. Monitor Results

**Console Output:**

```
Type     Name                      # reqs    # fails  |    Avg   Min   Max  Median  |   req/s failures/s
--------|-------------------------|---------|---------|-------|-----|-----|---------|---------|----------
POST     DTMF: 1                     245        0     |    452   234   892     420  |    4.08     0.00
POST     DTMF: 2                     198        0     |    467   241   901     430  |    3.30     0.00
POST     DTMF: 3                     156        0     |    478   239   920     440  |    2.60     0.00
POST     Quick DTMF                  512        0     |    301   156   678     290  |    8.53     0.00
--------|-------------------------|---------|---------|-------|-----|-----|---------|---------|----------
         Aggregated                 1111        0     |    398   156   920     380  |   18.52     0.00

Response time percentiles (approximated):
Type     Name                         50%    66%    75%    80%    90%    95%    98%    99%  99.9% 99.99%   100%
--------|-------------------------|--------|------|------|------|------|------|------|------|------|------|------|
POST     DTMF: 1                      420    450    470    490    530    580    650    720    890    890    892
```

**Key Metrics:**

-   **# reqs**: Total requests sent
-   **# fails**: Failed requests (should be 0)
-   **Avg**: Average response time (ms)
-   **req/s**: Requests per second (throughput)
-   **Percentiles**: Response time distribution

### 4. Cleanup Test Data

After testing, remove all test documents:

```bash
poetry run python locustfile.py --cleanup
```

**What this does:**

-   Deletes all documents with `is_test: true`
-   Deletes all documents with phone numbers starting with `load_test_`

## User Types

The load test includes two types of users:

### IVRUser (Realistic User Simulation)

**Behavior:**

-   Waits 1-3 seconds between requests (simulates thinking time)
-   Navigates through menu hierarchy
-   Tests various scenarios

**Tasks (weighted by frequency):**

-   `select_language` (weight=5): Most common action
-   `navigate_theme_menu` (weight=3): Browse themes
-   `navigate_exercise_menu` (weight=2): Select exercises
-   `press_invalid_key` (weight=1): Tests error handling
-   `timeout_input` (weight=1): Sends empty input (timeout simulation)
-   `rapid_sequential_inputs` (weight=1): Multiple digits quickly
-   `concurrent_same_conversation` (weight=1): Tests race conditions

### QuickLoadTest (Stress Testing)

**Behavior:**

-   Waits only 0.1-0.5 seconds between requests
-   Hammers the language selection endpoint
-   Tests system under high load

**Task:**

-   `rapid_language_select`: Rapidly selects random languages (1, 2, or 3)

## Test Scenarios

### Scenario 1: Normal Load (50 users)

Simulates typical daily usage:

```bash
locust -f locustfile.py --host=http://localhost:9210 \
       --users 50 --spawn-rate 5 --run-time 300s --headless
```

**Expected Results:**

-   Avg response time: < 500ms
-   95th percentile: < 1000ms
-   0% failure rate

### Scenario 2: Peak Load (200 users)

Simulates peak hours:

```bash
locust -f locustfile.py --host=http://localhost:9210 \
       --users 200 --spawn-rate 20 --run-time 300s --headless
```

**Expected Results:**

-   Avg response time: < 800ms
-   95th percentile: < 1500ms
-   < 1% failure rate

### Scenario 3: Stress Test (500 users)

Tests system limits:

```bash
locust -f locustfile.py --host=http://localhost:9210 \
       --users 500 --spawn-rate 50 --run-time 120s --headless
```

**Expected Results:**

-   Identifies breaking point
-   May show increased latency
-   Reveals bottlenecks

### Scenario 4: Spike Test

Sudden traffic spike:

```bash
locust -f locustfile.py --host=http://localhost:9210 \
       --users 300 --spawn-rate 100 --run-time 60s --headless
```

**Expected Results:**

-   Tests auto-scaling
-   Validates connection pooling
-   Checks error handling under sudden load

## Advanced Usage

### Custom Test Duration

Run for specific time periods:

```bash
# 5 minutes
locust -f locustfile.py --host=http://localhost:9210 \
       --users 100 --spawn-rate 10 --run-time 5m --headless

# 2 hours
locust -f locustfile.py --host=http://localhost:9210 \
       --users 100 --spawn-rate 10 --run-time 2h --headless
```

### Distributed Load Testing

For very high load, run Locust in distributed mode:

**Master:**

```bash
locust -f locustfile.py --master --host=http://localhost:9210
```

**Workers (run on multiple machines):**

```bash
locust -f locustfile.py --worker --master-host=<master-ip>
```

### Export Results

Generate HTML report:

```bash
locust -f locustfile.py --host=http://localhost:9210 \
       --users 100 --spawn-rate 10 --run-time 60s --headless \
       --html=report.html
```

Generate CSV files:

```bash
locust -f locustfile.py --host=http://localhost:9210 \
       --users 100 --spawn-rate 10 --run-time 60s --headless \
       --csv=results
```

This creates:

-   `results_stats.csv`: Request statistics
-   `results_stats_history.csv`: Time-series data
-   `results_failures.csv`: Failure details

## Understanding Results

### Good Performance Indicators

✅ **Low Failure Rate**: < 1%
✅ **Consistent Response Times**: Low standard deviation
✅ **Good Throughput**: > 10 req/s per user
✅ **Stable Under Load**: Metrics don't degrade over time

### Red Flags

⚠️ **High Failure Rate**: > 5% indicates issues
⚠️ **Increasing Response Times**: System struggling
⚠️ **Timeout Errors**: Server overloaded
⚠️ **Connection Errors**: Connection pool exhausted

### Common Metrics Targets

| Metric            | Target      | Excellent   |
| ----------------- | ----------- | ----------- |
| Avg Response Time | < 500ms     | < 200ms     |
| 95th Percentile   | < 1000ms    | < 500ms     |
| 99th Percentile   | < 2000ms    | < 1000ms    |
| Failure Rate      | < 1%        | 0%          |
| Throughput        | > 100 req/s | > 500 req/s |

## FSM-Specific Testing

The load test validates the FSM cloning fix:

### What's Being Tested

1. **Concurrent FSM Access**: Multiple users accessing same FSM
2. **FSM Isolation**: Each request gets independent FSM copy
3. **State Transitions**: Correct state changes under load
4. **Race Conditions**: Concurrent updates to same conversation

### Validation Points

The test tracks:

-   State transition accuracy (via `state_transitions` list)
-   NCCO response structure validation
-   Error action handling (invalid inputs)
-   Empty input timeout behavior

## Troubleshooting

### Issue: All Requests Failing

**Cause**: Server not running or wrong URL

**Solution**:

```bash
# Check server is running
curl http://localhost:9210/docs

# Start server if needed
poetry run uvicorn app.main:app --port 9210
```

### Issue: High Failure Rate

**Cause**: Server overwhelmed or FSM issues

**Solution**:

1. Reduce user count
2. Check server logs for errors
3. Verify MongoDB connection
4. Check FSM ID matches test data

### Issue: Setup Fails

**Cause**: MongoDB not accessible

**Solution**:

```bash
# Check MongoDB connection
mongosh $MONGO_DB_CONNECTION_STRING

# Verify environment variables
echo $MONGO_DB_CONNECTION_STRING
```

### Issue: Inconsistent Results

**Cause**: Server under other load or resource constraints

**Solution**:

1. Run on dedicated environment
2. Ensure no other tests running
3. Check system resources (CPU, memory)
4. Clear MongoDB between runs

## Best Practices

### 1. Always Setup Before Testing

```bash
poetry run python locustfile.py --setup --users 100
```

### 2. Clean Up After Testing

```bash
poetry run python locustfile.py --cleanup
```

### 3. Start Small, Scale Up

```bash
# Start with 10 users
locust -f locustfile.py --host=http://localhost:9210 --users 10 --spawn-rate 2 --run-time 30s --headless

# Then increase
locust -f locustfile.py --host=http://localhost:9210 --users 50 --spawn-rate 5 --run-time 60s --headless

# Finally stress test
locust -f locustfile.py --host=http://localhost:9210 --users 200 --spawn-rate 20 --run-time 120s --headless
```

### 4. Monitor Server During Tests

In separate terminal:

```bash
# Watch server logs
poetry run uvicorn app.main:app --port 9210 --log-level debug

# Monitor system resources
htop  # or Task Manager on Windows
```

### 5. Regular Performance Testing

Run load tests:

-   Before major releases
-   After performance-related changes
-   Weekly on staging environment
-   After infrastructure changes

## CI/CD Integration

For automated testing in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Setup test data
  run: poetry run python locustfile.py --setup --users 50

- name: Start server
  run: poetry run uvicorn app.main:app --port 9210 &

- name: Wait for server
  run: sleep 5

- name: Run load test
  run: |
      locust -f locustfile.py --host=http://localhost:9210 \
             --users 50 --spawn-rate 10 --run-time 60s --headless \
             --csv=results --html=report.html

- name: Cleanup
  run: poetry run python locustfile.py --cleanup

- name: Upload results
  uses: actions/upload-artifact@v3
  with:
      name: load-test-results
      path: |
          results*.csv
          report.html
```

## Performance Baseline

After running initial tests, establish baselines:

| Test Scenario | Users | Duration | Avg Response | 95th % | Throughput | Failure % |
| ------------- | ----- | -------- | ------------ | ------ | ---------- | --------- |
| Light Load    | 10    | 60s      | 245ms        | 450ms  | 15 req/s   | 0%        |
| Normal Load   | 50    | 300s     | 380ms        | 720ms  | 75 req/s   | 0%        |
| Peak Load     | 200   | 300s     | 650ms        | 1200ms | 280 req/s  | 0.5%      |
| Stress Test   | 500   | 120s     | 1100ms       | 2100ms | 450 req/s  | 2%        |

Update these baselines as system improves or requirements change.

## Next Steps

1. **Establish Baselines**: Run tests and record current performance
2. **Set Alerts**: Configure monitoring to alert on degradation
3. **Regular Testing**: Schedule weekly load tests
4. **Performance Budget**: Define acceptable thresholds
5. **Continuous Improvement**: Track metrics over time

## Support

For issues or questions:

-   Check server logs: `app/logs/`
-   Review Locust documentation: https://docs.locust.io/
-   Examine FSM structure: `fsm-visual-refactored.txt`
