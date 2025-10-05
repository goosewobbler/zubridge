# Development Best Practices

**Version:** 1.3.0
**Last Updated:** 2025-10-05

## Context

Global development guidelines for Agent OS projects.

<conditional-block context-check="core-principles">
IF this Core Principles section already read in current context:
  SKIP: Re-reading this section
  NOTE: "Using Core Principles already in context"
ELSE:
  READ: The following principles

## Core Principles

### Keep It Simple
- Implement code in the fewest lines possible
- Avoid over-engineering solutions
- Choose straightforward approaches over clever ones

### Optimize for Readability
- Prioritize code clarity over micro-optimizations
- Write self-documenting code with clear variable names
- Add comments for "why" not "what"

### DRY (Don't Repeat Yourself)
- Extract repeated business logic to private methods
- Extract repeated UI markup to reusable components
- Create utility functions for common operations

### File Structure
- Keep files focused on a single responsibility
- Group related functionality together
- Use consistent naming conventions

### Module Organization
- **Avoid barrel files** (index.ts files containing only exports) except at the root of a package
- Import directly from source files for better tree-shaking
- Use barrel files only for package entry points or when creating a public API
- Prefer explicit imports over re-exports

### Code Architecture
- **Never use nested ternary statements** - extract logic into separate functions
- Use `undefined` over `null` unless required otherwise
- Prefer composition over inheritance
- Extract complex business logic into pure functions

### Testing Standards
- **Minimum 80% unit / integration test coverage** required for all packages
- Test files go in `test/` directory at package root (same level as `src/`)
- Test files named `*.spec.ts` or `*.spec.tsx`
- Test business logic, utilities, and component behavior
- Mock external dependencies and API calls
- Write tests that verify expected behavior, not implementation details

### Test Directory Structure
- **Unit tests only**: Mirror `src/` directory structure in `test/` directory
- **With integration tests**: Use `test/unit/` and `test/integration/` subdirectories
  - `test/unit/` mirrors `src/` directory structure exactly
  - `test/integration/` organized by functionality, not source structure
  - **Few integration tests**: Place all files in `test/integration/` root, name by functionality
  - **Many integration tests**: Create subdirectories in `test/integration/` for each functional area

### Testing Pyramid
- **Unit tests**: Many tests, fast execution, test individual functions/components
- **Integration tests**: Fewer tests, test component interactions and API endpoints
- **E2E tests**: Fewest tests, test complete user workflows and critical paths
- Focus on comprehensive unit test coverage, selective integration tests, minimal E2E tests

### E2E Testing Framework
- **Cross-platform apps** (Electron/Tauri/Flutter/Neutralino/Blazor/Wails): Use WebdriverIO latest
- **Web applications**: Use Playwright latest
- E2E tests should cover critical user journeys and business workflows
- Keep E2E tests focused on user-facing functionality, not implementation details

### Rust Testing Standards

#### Test Organization
- **Unit tests**: Use `#[cfg(test)] mod tests { ... }` inline in the same file as the code being tested
- **Integration tests**: Place in `tests/` directory at package root, each `.rs` file is a separate test binary
- **Feature flag tests**: Integration tests in `tests/` that verify conditional compilation works correctly

#### Test File Naming
- Integration test files: Descriptive names like `feature_uniffi.rs`, `middleware_chain.rs`
- No `mod.rs` in `tests/` directory (each file is independent)

#### Rust Testing Pyramid
- **Unit tests** (many): Test individual functions and structs inline
- **Integration tests** (fewer): Test the crate API as a whole, compiled state
- **E2E tests** (fewest): Test actual framework integrations via WebdriverIO
</conditional-block>

<conditional-block context-check="dependencies" task-condition="choosing-external-library">
IF current task involves choosing an external library:
  IF Dependencies section already read in current context:
    SKIP: Re-reading this section
    NOTE: "Using Dependencies guidelines already in context"
  ELSE:
    READ: The following guidelines
ELSE:
  SKIP: Dependencies section not relevant to current task

## Dependencies

### Choose Libraries Wisely
When adding third-party dependencies:
- Select the most popular and actively maintained option
- Check the library's GitHub repository for:
  - Recent commits (within last 6 months)
  - Active issue resolution
  - Number of stars/downloads
  - Clear documentation
</conditional-block>

---

## Changelog

### v1.3.0 (2025-10-05)
- Added Rust testing standards section
- Added Rust test organization (inline unit tests, integration tests in tests/ directory)
- Added Rust test file naming conventions
- Added Rust testing pyramid guidance

### v1.2.0 (2025-10-04)
- Added comprehensive testing standards with 80% coverage requirement
- Added test directory structure guidelines for unit and integration tests
- Added testing pyramid strategy (unit > integration > E2E)
- Added E2E testing framework selection (WebdriverIO for cross-platform, Playwright for web)
- Added module organization guidelines (avoid barrel files except package roots)
- Added code architecture guidelines (no nested ternaries, undefined over null)

### v1.1.0 (2024-12-19)
- Added core principles (Keep It Simple, Optimize for Readability, DRY)
- Added file structure guidelines
- Added dependency selection criteria

### v1.0.0 (2024-12-19)
- Initial version with basic development guidelines
