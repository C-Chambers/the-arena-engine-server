# Jest Testing Implementation Plan
## The Arena Engine Server

### Overview
This document outlines the implementation plan for adding comprehensive unit testing to The Arena Engine server using Jest. The plan focuses on testing game mechanics, damage calculations, skill systems, and service layer functionality.

---

## Phase 1: Initial Setup & Configuration

### 1.1 Install Jest and Dependencies
```bash
npm install --save-dev jest
npm install --save-dev @types/jest  # If using TypeScript
npm install --save-dev jest-environment-node
```

### 1.2 Configure Jest
Create `jest.config.js` in project root:
```javascript
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  restoreMocks: true
};
```

### 1.3 Update package.json Scripts
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:verbose": "jest --verbose",
    "test:ci": "jest --ci --coverage --watchAll=false"
  }
}
```

### 1.4 Create Test Setup File
Create `tests/setup.js`:
```javascript
// Global test setup
global.console = {
  ...console,
  // Uncomment to ignore specific log types during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
```

---

## Phase 2: Core Game Engine Testing

### 2.1 Damage Calculation System Tests
**File**: `tests/game/damageCalculation.test.js`

**Test Categories**:
- Basic damage application
- Vulnerability multiplier effects
- Damage reduction (flat and percentage)
- Shield absorption mechanics
- Damage immunity checks
- Complex damage modifier stacking

**Key Test Scenarios**:
```javascript
describe('Damage Calculation System', () => {
  describe('Basic Damage', () => {
    test('should apply base damage correctly');
    test('should handle zero damage');
    test('should not allow negative damage');
  });

  describe('Damage Modifiers', () => {
    test('should apply vulnerability multiplier');
    test('should apply empower skill bonus');
    test('should apply Sharingan mark bonus for specific skills');
    test('should stack multiple damage bonuses correctly');
  });

  describe('Damage Mitigation', () => {
    test('should apply flat damage reduction');
    test('should apply percentage damage reduction');
    test('should apply both flat and percentage reduction in correct order');
    test('should not reduce damage below zero');
  });

  describe('Shield Mechanics', () => {
    test('should absorb damage with shield');
    test('should break shield when damage exceeds shield value');
    test('should ignore shields when effect.ignores_shield is true');
  });
});
```

### 2.2 Skill System Tests
**File**: `tests/game/skillSystem.test.js`

**Test Categories**:
- Skill cost validation
- Chakra management
- Skill targeting
- Cooldown mechanics
- Action queue management

**Key Test Scenarios**:
```javascript
describe('Skill System', () => {
  describe('Cost Validation', () => {
    test('should validate sufficient chakra for skill cost');
    test('should reject skill when insufficient chakra');
    test('should apply cost reduction status effects');
    test('should handle multiple chakra types in cost');
  });

  describe('Action Queue', () => {
    test('should add valid skill to action queue');
    test('should reject duplicate actions from same character');
    test('should calculate total queue cost correctly');
    test('should clear queue after turn execution');
  });

  describe('Targeting System', () => {
    test('should validate enemy targeting');
    test('should validate ally targeting');
    test('should handle AoE targeting');
    test('should enforce targeting restrictions (Dynamic Air Marking)');
  });
});
```

### 2.3 Status Effect System Tests
**File**: `tests/game/statusEffects.test.js`

**Test Categories**:
- Status application and removal
- Duration management
- Status stacking rules
- Turn-based effect processing

**Key Test Scenarios**:
```javascript
describe('Status Effect System', () => {
  describe('Status Application', () => {
    test('should apply status effects correctly');
    test('should prevent status application with immunity');
    test('should stamp status with caster information');
  });

  describe('Status Duration', () => {
    test('should decrease status duration each turn');
    test('should remove expired status effects');
    test('should handle permanent status effects');
  });

  describe('Special Status Interactions', () => {
    test('should prevent actions with stun status');
    test('should block defensive benefits with Dynamic Air Mark');
    test('should handle targeted stun by skill class');
  });
});
```

### 2.4 Game State Management Tests
**File**: `tests/game/gameState.test.js`

**Test Categories**:
- Turn progression
- Chakra generation
- Game over conditions
- Player state management

---

## Phase 3: Service Layer Testing

### 3.1 Character Service Tests
**File**: `tests/services/characterService.test.js`

**Mock Database Queries**:
```javascript
// Mock the database pool
jest.mock('../src/config/database', () => ({
  pool: {
    query: jest.fn()
  }
}));

describe('Character Service', () => {
  test('should load characters from database');
  test('should handle database errors gracefully');
  test('should cache character data');
  test('should load chakra types');
});
```

### 3.2 Rating Service Tests
**File**: `tests/services/ratingService.test.js`

**Test Categories**:
- Glicko-2 rating calculations
- Database rating updates
- Error handling

**Key Test Scenarios**:
```javascript
describe('Rating Service', () => {
  describe('Rating Updates', () => {
    test('should update winner rating correctly');
    test('should update loser rating correctly');
    test('should handle missing player ratings');
    test('should rollback on database errors');
  });

  describe('Glicko-2 Integration', () => {
    test('should create player objects with correct ratings');
    test('should calculate rating changes correctly');
    test('should handle rating deviation properly');
  });
});
```

### 3.3 Mission Service Tests
**File**: `tests/services/missionService.test.js`

**Test Categories**:
- Game result processing
- Mission progress updates
- Reward granting
- Transaction handling

---

## Phase 4: Test Utilities and Helpers

### 4.1 Test Data Factory
**File**: `tests/helpers/testDataFactory.js`

```javascript
// Factory functions to create test data
const createMockPlayer = (overrides = {}) => ({
  id: 1,
  email: 'test@example.com',
  team: [createMockCharacter()],
  chakra: { Power: 2, Technique: 1 },
  cooldowns: {},
  actionQueue: [],
  ...overrides
});

const createMockCharacter = (overrides = {}) => ({
  instanceId: 'char-1',
  id: '1',
  name: 'Test Character',
  maxHp: 100,
  currentHp: 100,
  isAlive: true,
  statuses: [],
  ...overrides
});

const createMockSkill = (overrides = {}) => ({
  id: '1',
  name: 'Test Skill',
  cost: { Power: 1 },
  effects: [{ type: 'damage', value: 30, target: 'enemy' }],
  ...overrides
});
```

### 4.2 Game Engine Test Helpers
**File**: `tests/helpers/gameTestHelpers.js`

```javascript
const Game = require('../../src/game/engine');

const createTestGame = (player1Data = {}, player2Data = {}) => {
  const player1 = createMockPlayer({ id: 1, ...player1Data });
  const player2 = createMockPlayer({ id: 2, ...player2Data });
  return new Game(player1, player2);
};

const setCharacterStatus = (character, status) => {
  character.statuses.push(status);
};

const simulateSkillUse = (game, skillData, casterId, targetId) => {
  return game.queueSkill({
    skill: createMockSkill(skillData),
    casterId,
    targetId
  });
};
```

### 4.3 Database Mocking Utilities
**File**: `tests/helpers/databaseMocks.js`

```javascript
const createMockDatabaseClient = () => ({
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
  release: jest.fn()
});

const mockSuccessfulQuery = (mockData) => {
  return jest.fn().mockResolvedValue({ rows: mockData });
};

const mockFailedQuery = (error) => {
  return jest.fn().mockRejectedValue(error);
};
```

---

## Phase 5: Integration and End-to-End Game Tests

### 5.1 Complete Game Flow Tests
**File**: `tests/integration/gameFlow.test.js`

**Test Scenarios**:
- Complete game from start to finish
- Multi-turn skill sequences
- Complex status effect interactions
- Game over scenarios

### 5.2 Skill Interaction Tests
**File**: `tests/integration/skillInteractions.test.js`

**Test Scenarios**:
- Skill combos and synergies
- Status effect interactions between multiple skills
- Complex damage calculation scenarios

---

## Phase 6: Performance and Stress Testing

### 6.1 Performance Tests
**File**: `tests/performance/gamePerformance.test.js`

```javascript
describe('Game Performance', () => {
  test('should handle large action queues efficiently');
  test('should process turns within acceptable time limits');
  test('should handle many status effects without performance degradation');
});
```

---

## Phase 7: Continuous Integration Setup

### 7.1 GitHub Actions Workflow
**File**: `.github/workflows/test.yml`

```yaml
name: Run Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - run: npm ci
    - run: npm run test:ci
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
```

---

## Implementation Timeline

### Week 1: Foundation
- [ ] Install Jest and configure project
- [ ] Create test directory structure
- [ ] Set up test utilities and helpers
- [ ] Create first basic test to validate setup

### Week 2: Core Game Logic
- [ ] Implement damage calculation tests
- [ ] Create skill system tests
- [ ] Add status effect system tests
- [ ] Test game state management

### Week 3: Service Layer
- [ ] Test character service
- [ ] Test rating service with mocked database
- [ ] Test mission service
- [ ] Add integration tests for service interactions

### Week 4: Advanced Testing
- [ ] Create complex integration tests
- [ ] Add performance tests
- [ ] Set up CI/CD pipeline
- [ ] Documentation and code coverage analysis

---

## Success Metrics

### Code Coverage Targets
- **Overall**: 80%+ code coverage
- **Game Engine**: 90%+ coverage (critical game logic)
- **Services**: 85%+ coverage
- **Utilities**: 75%+ coverage

### Quality Metrics
- All tests must pass before merge
- No decrease in code coverage for new code
- Tests should run in under 30 seconds
- Zero flaky tests in CI

### Test Categories Distribution
- **Unit Tests**: 70% of total tests
- **Integration Tests**: 25% of total tests
- **Performance Tests**: 5% of total tests

---

## Best Practices Guidelines

### 1. Test Structure
- Use AAA pattern (Arrange, Act, Assert)
- One assertion per test when possible
- Clear, descriptive test names
- Group related tests with describe blocks

### 2. Mocking Strategy
- Mock external dependencies (database, APIs)
- Use Jest's built-in mocking capabilities
- Keep mocks simple and focused
- Reset mocks between tests

### 3. Test Data Management
- Use factory functions for test data creation
- Keep test data minimal and focused
- Use meaningful test data that reflects real scenarios
- Avoid hardcoded values in tests

### 4. Performance Considerations
- Run fast tests first
- Use `test.skip()` for temporarily disabled tests
- Parallel test execution where possible
- Clean up resources after tests

---

## Maintenance and Evolution

### Regular Reviews
- Monthly test suite performance review
- Quarterly coverage analysis
- Annual testing strategy assessment

### Documentation Updates
- Keep test documentation current
- Update implementation plan as needed
- Maintain examples and best practices

### Continuous Improvement
- Monitor test execution times
- Identify and eliminate flaky tests
- Refactor tests as code evolves
- Add new test categories as features develop