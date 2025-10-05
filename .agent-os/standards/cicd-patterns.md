# CI/CD Patterns & Best Practices

**Version:** 1.0.0
**Last Updated:** 2025-10-05

## Workflow Architecture

### Three-Tier Structure

1. **Main Workflows** - Orchestration and triggers
2. **Reusable Workflows** - Shared logic callable from other workflows
3. **Composite Actions** - Reusable step sequences

### File Naming Conventions

- **Main workflows**: `workflow-name.yml` (e.g., `ci.yml`, `release.yml`)
- **Reusable workflows**: `_workflow-name.reusable.yml` (prefix with `_`)
- **Composite actions**: `actions/action-name/action.yml`

## When to Create vs Update

### ❌ Avoid Creating New Workflows When:
- Existing workflow can be extended with a new job
- Logic fits into an existing reusable workflow
- Triggers and secrets match an existing workflow

### ✅ Create New Workflows When:
- Different triggers (e.g., scheduled vs push)
- Different deployment targets
- Completely independent pipelines (e.g., docs vs tests)

### ✅ Create Reusable Workflows When:
- Logic is called from multiple main workflows
- Matrix strategy requires parameterization
- Cross-platform builds with shared logic

### ✅ Create Composite Actions When:
- Steps are repeated across multiple workflows
- Environment setup needs standardization
- Common utilities (like artifact handling)

## Adding New Build/Test Targets

### Pattern: Extend Existing Main Workflow

**Example - Adding Rust Core Validation:**

```yaml
# Update existing ci.yml - add new job
jobs:
  # ... existing jobs ...

  rust-core-validation:
    name: Rust Core Features
    runs-on: ubuntu-latest
    needs: [build-shared-packages]  # Depend on existing jobs if needed
    strategy:
      matrix:
        features: ["", "uniffi", "napi", "tauri"]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Build with feature
        working-directory: ./packages/core
        run: cargo build --features "${{ matrix.features }}"

      - name: Test with feature
        working-directory: ./packages/core
        run: cargo test --features "${{ matrix.features }}"
```

**Then update the final status job:**
```yaml
ci-status:
  needs: [
    build-shared-packages,
    code-quality,
    e2e-tests,
    rust-core-validation  # Add new job to dependencies
  ]
```

## Reusable Workflow Pattern

### Structure

```yaml
name: Reusable Workflow Name

on:
  workflow_call:
    inputs:
      param_name:
        description: "Parameter description"
        required: true
        type: string
    secrets:
      SECRET_NAME:
        required: false
    outputs:
      result:
        description: "Output description"
        value: ${{ jobs.job-name.outputs.result }}

jobs:
  job-name:
    runs-on: ubuntu-latest
    outputs:
      result: ${{ steps.step-id.outputs.value }}
    steps:
      # ...workflow steps
```

### Calling Reusable Workflows

```yaml
jobs:
  call-reusable:
    uses: ./.github/workflows/_reusable-name.reusable.yml
    with:
      param_name: "value"
    secrets:
      SECRET_NAME: ${{ secrets.SECRET_NAME }}
```

## Composite Action Pattern

### Structure

```yaml
# actions/action-name/action.yml
description: 'Action description'
inputs:
  input_name:
    description: 'Input description'
    required: true

runs:
  using: composite
  steps:
    - name: Step name
      shell: bash
      run: |
        # commands
```

### Using Composite Actions

```yaml
steps:
  - name: Setup Environment
    uses: ./.github/workflows/actions/setup-workspace
    with:
      node-version: "20"
```

## Matrix Strategies

### Feature Flag Testing

```yaml
strategy:
  matrix:
    features: ["", "uniffi", "napi", "tauri"]
    # Empty string tests default (no features)
steps:
  - run: cargo build --features "${{ matrix.features }}"
```

### Cross-Platform Testing

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
runs-on: ${{ matrix.os }}
```

### Conditional Matrix Exclusions

```yaml
strategy:
  matrix:
    app: [electron, tauri]
    mode: [basic, handlers, reducers]
    exclude:
      - app: tauri
        mode: handlers
      - app: tauri
        mode: reducers
```

## Artifact Management

### Upload Pattern

```yaml
- name: Upload Artifacts
  uses: actions/upload-artifact@v4
  with:
    name: build-output-${{ github.run_id }}
    path: ./dist
    retention-days: 1
```

### Download Pattern

```yaml
- name: Download Artifacts
  uses: actions/download-artifact@v4
  with:
    name: build-output-${{ github.run_id }}
    path: ./dist
```

### Cross-Job Artifacts

Build jobs upload artifacts, test jobs download them:
```yaml
jobs:
  build:
    steps:
      - uses: actions/upload-artifact@v4
        with:
          name: shared-packages
          path: packages/*/dist

  test:
    needs: [build]
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: shared-packages
          path: packages
```

## Job Dependencies

### Sequential Jobs

```yaml
jobs:
  build:
    # runs first

  test:
    needs: [build]  # waits for build

  deploy:
    needs: [test]  # waits for test
```

### Parallel Jobs with Final Status

```yaml
jobs:
  test-unit:
    # runs in parallel

  test-e2e:
    # runs in parallel

  ci-status:
    needs: [test-unit, test-e2e]
    if: always()  # runs even if dependencies fail
```

## Conditional Job Execution

### Based on Inputs

```yaml
if: inputs.app == 'electron'
```

### Based on Previous Job Success

```yaml
if: needs.build.outputs.success == 'true'
```

### Based on File Changes

```yaml
- uses: dorny/paths-filter@v2
  id: changes
  with:
    filters: |
      rust:
        - 'packages/core/**'
- if: steps.changes.outputs.rust == 'true'
```

## Technical Spec Guidelines

When adding CI/CD changes to technical specs:

### ✅ Good Technical Spec Format

```markdown
### CI/CD Updates

**Update existing `.github/workflows/ci.yml`:**

Add new job `rust-core-validation` after `code-quality` job:

\```yaml
rust-core-validation:
  name: Rust Core Features
  runs-on: ubuntu-latest
  needs: [build-shared-packages]
  strategy:
    matrix:
      features: ["", "uniffi", "napi", "tauri"]
  steps:
    - uses: actions/checkout@v4
    - uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
    - name: Build with feature
      working-directory: ./packages/core
      run: cargo build --features "${{ matrix.features }}"
    - name: Test with feature
      working-directory: ./packages/core
      run: cargo test --features "${{ matrix.features }}"
\```

Update `ci-status` job dependencies to include `rust-core-validation`.
```

### ❌ Avoid This Format

```markdown
### CI/CD Configuration

Create new workflow `.github/workflows/rust-core.yml`:

\```yaml
# entire new workflow file...
\```
```

(Unless it truly needs to be a separate workflow with different triggers)

---

## Changelog

### v1.0.0 (2025-10-05)
- Initial version with CI/CD workflow patterns and best practices
- Added three-tier workflow architecture (main, reusable, composite actions)
- Added file naming conventions for workflows and actions
- Added guidelines for when to create vs update workflows
- Added matrix strategy patterns (feature flags, cross-platform, exclusions)
- Added artifact management patterns
- Added job dependency patterns
- Added technical spec formatting guidelines for CI/CD changes
