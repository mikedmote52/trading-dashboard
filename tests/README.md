# Tests Directory

Test files for system validation and quality assurance.

## Structure

```
tests/
├── unit/           # Unit tests for individual components
├── integration/    # Integration tests for API endpoints
├── e2e/           # End-to-end dashboard tests
└── fixtures/      # Test data and mock responses
```

## Running Tests

```bash
# Install test dependencies
npm install --dev

# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Test Requirements

- All critical functionality must have unit tests
- API endpoints require integration tests
- Dashboard features need E2E validation
- Minimum 80% code coverage target