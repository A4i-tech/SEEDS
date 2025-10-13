# Test Coverage Setup Guide

This guide explains how to set up and configure the enhanced test coverage system for the SEEDS monorepo.

## Overview

The enhanced pipeline now includes:

- **Coverage Generation**: All services generate coverage reports during CI/CD
- **Coverage Artifacts**: Coverage reports are uploaded as GitHub Actions artifacts
- **Coverage Badges**: Dynamic badges showing coverage percentages for each service
- **Coverage Summary**: Automated PR comments with aggregated coverage statistics
- **README Integration**: Coverage badges displayed at the top of each service's README

## Prerequisites

Before the coverage system will work properly, you need to set up the following:

### 1. Create a GitHub Gist for Coverage Badges

1. Go to [gist.github.com](https://gist.github.com)
2. Create a new **public** gist with any filename (e.g., `coverage-badges.md`)
3. Add some initial content (it will be overwritten by the badges)
4. Save the gist and copy the gist ID from the URL (e.g., if the URL is `https://gist.github.com/username/abc123def456`, the ID is `abc123def456`)

### 2. Configure Repository Variables

In your GitHub repository, go to **Settings > Secrets and variables > Actions > Variables** and add:

| Variable Name      | Description                                    | Example Value  |
| ------------------ | ---------------------------------------------- | -------------- |
| `COVERAGE_GIST_ID` | The ID of your public gist for coverage badges | `abc123def456` |

### 3. Update README Badge URLs

Replace `[COVERAGE_GIST_ID]` in all README files with your actual gist ID:

**Before:**

```markdown
[![Backend Server Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/A4i-tech/[COVERAGE_GIST_ID]/raw/backend-server-coverage.json)](https://github.com/A4i-tech/SEEDS/actions/workflows/backend-server-main.yml)
```

**After:**

```markdown
[![Backend Server Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/A4i-tech/abc123def456/raw/backend-server-coverage.json)](https://github.com/A4i-tech/SEEDS/actions/workflows/backend-server-main.yml)
```

## How It Works

### 1. Service-Level Coverage

Each service workflow now:

- Runs tests with coverage enabled
- Generates coverage reports in multiple formats (HTML, JSON, LCOV, XML)
- Uploads coverage artifacts to GitHub Actions
- Extracts coverage percentage and updates a dynamic badge
- Stores badge data in the configured GitHub Gist

### 2. Coverage Artifacts

Coverage reports are uploaded as artifacts with 30-day retention:

- **Node.js services**: `coverage/` directory with Jest coverage reports
- **Python services**: HTML reports, XML, JSON, and `.coverage` files

### 3. Dynamic Badges

Badges are generated using the `schneegans/dynamic-badges-action` and stored in a GitHub Gist:

- 🟢 Green: ≥80% coverage
- 🟡 Yellow: 60-79% coverage
- 🔴 Red: <60% coverage

### 4. PR Coverage Summary

The `coverage-summary.yml` workflow:

- Runs on pull requests and after the main workflow completes
- Downloads all coverage artifacts from service workflows
- Aggregates coverage data from all services
- Posts/updates a comment on PRs with detailed coverage statistics
- Shows coverage for each service and overall average

## Service Coverage Configuration

### Node.js Services (Jest)

**Test Command:**

```bash
npm test -- --coverage --coverageReporters=json --coverageReporters=lcov --coverageReporters=text --coverageReporters=html
```

**Coverage Files Generated:**

- `coverage/coverage-summary.json` - Used for badge generation
- `coverage/lcov.info` - LCOV format
- `coverage/index.html` - HTML report

### Python Services (pytest-cov with Poetry)

**Dependency Management:**
Python services use `pyproject.toml` with Poetry for dependency management.

**Test Command:**

```bash
poetry install --with test
poetry run pytest --cov=. --cov-report=html --cov-report=xml --cov-report=json --cov-report=term
```

**Coverage Files Generated:**

- `coverage.json` - Used for badge generation
- `htmlcov/` - HTML report directory
- `coverage.xml` - XML format
- `.coverage` - Raw coverage data

## Troubleshooting

### Badge Not Updating

1. Check that `COVERAGE_GIST_ID` variable is set correctly
2. Ensure the gist is **public**
3. Verify the workflow has completed successfully
4. Check workflow logs for badge generation errors

### Coverage Artifacts Missing

1. Ensure tests are running successfully
2. Check that coverage is being generated (look for coverage files in workflow logs)
3. Verify the upload artifact step is not failing

### PR Comments Not Appearing

1. Check that the bot has write permissions on pull requests
2. Ensure the `coverage-summary.yml` workflow is enabled
3. Verify artifacts are available for download

### No Coverage Data

For services without tests:

- The badge will show "No tests"
- PR comments will show "⚫ No tests" status
- Consider adding basic tests to get coverage metrics

## Coverage Thresholds

Current thresholds for badge colors:

- **Green (🟢)**: ≥80% coverage - Excellent
- **Yellow (🟡)**: 60-79% coverage - Good
- **Red (🔴)**: <60% coverage - Needs improvement

These thresholds can be adjusted in each workflow's badge generation step.

## Accessing Coverage Reports

### Via GitHub Actions Artifacts

1. Go to a completed workflow run
2. Scroll down to "Artifacts" section
3. Download the service-specific coverage artifact
4. Extract and open `index.html` for detailed coverage

### Via PR Comments

- Aggregated coverage statistics appear automatically in PR comments
- Shows coverage for each service and overall percentage
- Updated automatically when new commits are pushed

## Future Enhancements

Potential improvements to consider:

- **Coverage trending**: Track coverage changes over time
- **Coverage requirements**: Fail builds if coverage drops below threshold
- **Differential coverage**: Show coverage only for changed files
- **Integration with code review tools**: Inline coverage comments on changed lines

## Files Modified

The following files were created or modified to implement coverage:

### New Files:

- `.github/workflows/coverage-summary.yml` - Aggregates coverage and posts PR comments

### Modified Files:

- All service workflow files (`.github/workflows/*-main.yml`) - Added coverage generation
- All service README files - Added coverage badges
- `.github/workflows/main.yml` - Added coverage summary step
- `ConferenceV2/pyproject.toml` - Added pytest-cov to test dependencies

**Note:** Python services use `pyproject.toml` with Poetry for dependency management instead of `requirements.txt` files.

This coverage system provides comprehensive visibility into test coverage across the entire monorepo, helping maintain code quality and encouraging better testing practices.
