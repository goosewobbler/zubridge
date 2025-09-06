# Developer Guide

This guide provides technical documentation for developers working on the Zubridge project.

## Repository Structure

### Package Organization

The Zubridge monorepo is organized using Turborepo with the following packages:

```
packages/
├── electron/          # Main Electron package (`@zubridge/electron`)
├── types/             # Shared TypeScript types (`@zubridge/types`)
├── core/              # Core utilities and debug system (`@zubridge/core`)
├── middleware/        # Rust-based middleware (`@zubridge/middleware` - optional, not yet released)
├── ui/                # Shared UI components for test applications
└── apps-shared/       # Shared logic and utilities for example apps
└── tauri/             # Main Tauri package (`@zubridge/tauri`)

apps/
├── electron-example/  # Example Electron application
├── minimal-zustand/   # Minimal Zustand example
├── minimal-custom/    # Minimal custom state manager example
└── e2e-tauri/         # End-to-end testing with Tauri
└── e2e-tauri-v1/      # End-to-end testing with Tauri V1
```

### Development Workflow

The project uses:
- **Turborepo** for monorepo management with remote caching enabled
- **Biome** for linting and formatting
- **Vitest** for testing across all packages
- **TypeScript** for type safety
- **Rust** for optional high-performance middleware

### Shared Packages

#### `apps-shared` Package
Contains common logic shared between example applications:
- State management utilities
- Common action creators and reducers
- Testing helpers
- Configuration utilities

#### `ui` Package
Provides reusable UI components for example applications:
- Common React components
- Shared styling and theming
- Form components and validators
- Testing utilities for components

## Architecture

### Core Bridge System

The Zubridge architecture separates concerns between different layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                         │
├─────────────────────────────────────────────────────────────┤
│  React Components / UI Framework                            │
│  └── useDispatch() / useStore()                             │
│      └── Zubridge Renderer Handlers                         │
│          └── IPC Communication                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Electron IPC
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Main Process                            │
├─────────────────────────────────────────────────────────────┤
│  Bridge Factory (createZustandBridge/createReduxBridge)     │
│  ├── IPC Handler (manages communication)                    │
│  ├── Resource Manager (cleanup & lifecycle)                 │
│  ├── Subscription Handler (window management)               │
│  └── Action Queue (sequencing & thunk coordination)         │
│                              │                              │
│  Thunk Manager ──────────────┼──────────── State Manager    │
│  (coordination)              │              (Zustand/Redux) │
└─────────────────────────────────────────────────────────────┘
```

### Thunk Manager Architecture

The Thunk Manager system coordinates thunk execution across processes:

#### Key Components

**ThunkManager**
- Thunk registration and lifecycle management
- State transitions (pending → executing → completed/failed)
- Thunk hierarchy tracking (parent-child relationships)
- Locking mechanism to ensure only one root thunk executes at a time
- Event emission for thunk state changes

**Thunk Class**
- Unique ID and optional parent ID
- Current state (pending, executing, completed, failed)
- Source window ID and process information
- Child thunk IDs for hierarchy tracking
- Timestamps for performance monitoring

**ActionQueueManager**
- Manages queue of actions from all renderer processes
- Consults ThunkManager to determine action processing eligibility
- Ensures actions from same thunk tree are processed sequentially
- Prevents concurrent execution of actions from different thunk trees

**MainThunkProcessor**
- Executes thunks dispatched from the main process
- Manages thunk execution state and error handling
- Coordinates with ThunkManager for registration and state updates

#### Thunk Lifecycle

```
┌─────────────┐    register()    ┌─────────────┐
│ Thunk       │ ──────────────►  │ Registered  │
│ Created     │                  │ (Pending)   │
└─────────────┘                  └─────────────┘
                                       │ start()
                                       ▼
┌─────────────┐                  ┌─────────────┐
│ Completed/  │ ◄─────────────── │ Executing   │
│ Failed      │    complete()    │ (Active)    │
└─────────────┘    or fail()     └─────────────┘
       │                               │
       │ cleanup()                     │ spawn child
       ▼                               ▼
┌─────────────┐                 ┌─────────────┐
│ Lock        │                 │ Child       │
│ Released    │                 │ Thunks      │
└─────────────┘                 └─────────────┘
```

#### Concurrency Control

The ThunkManager implements a locking mechanism:

1. **Lock Acquisition**: Only one root thunk can execute at a time
2. **Hierarchical Execution**: Child thunks execute within parent's context
3. **Action Deferral**: Non-thunk actions are deferred during thunk execution
4. **Lock Release**: Released when root thunk and all descendants complete
5. **Queue Processing**: Deferred actions are processed after lock release

#### Event System

ThunkManager extends EventEmitter with these events:

- `THUNK_REGISTERED`: New thunk registered in system
- `THUNK_STARTED`: Thunk begins execution
- `THUNK_COMPLETED`: Thunk completes successfully
- `THUNK_FAILED`: Thunk fails with error
- `ROOT_THUNK_CHANGED`: New root thunk acquires lock
- `ROOT_THUNK_COMPLETED`: Root thunk and descendants complete

### Action Sequencing Flow

```
Renderer A          Main Process           Renderer B
    │                      │                       │
    │── dispatch(thunk) ──►│                       │
    │                      │ (lock acquired)       │
    │                      │                       │
    │                      │◄── dispatch(action) ──│
    │                      │   (deferred)          │
    │                      │                       │
    │◄─── state update ─── │                       │
    │                      │                       │
    │── acknowledge ─────► │                       │
    │                      │ (lock released)       │
    │                      │                       │
    │                      │── process deferred ──►│
    │                      │                       │
```

### IPC Communication Flow

```
Renderer                 Preload               Main Process
    │                        │                       │
    │ dispatch('ACTION') ───►│                       │
    │                        │ ipc.invoke() ────────►│
    │                        │                       │ processAction()
    │                        │                       │ └── State Update
    │                        │                       │ └── Notify Windows
    │                        │◄───── ipc.handle ──── │
    │◄─── Promise resolve ── │                       │
    │                        │                       │
    │                        │◄─ 'state-update' ──── │
    │ callback(newState) ◄── │                       │
    │                        │ 'state-ack' ────────► │
    │                        │                       │
```

## Development Setup

### Prerequisites

- Node.js 18+ with pnpm
- Rust (optional, for Tauri / middleware development)
- Electron development dependencies

### Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Format code
pnpm format

# Run example applications
pnpm --filter electron-example dev
pnpm --filter minimal-zustand dev
```

### Testing Strategy

The project uses comprehensive testing across multiple levels:

**Unit Tests**
- Individual component and utility testing
- Mock-based testing for IPC interactions
- State management logic verification
- Error handling and edge case coverage

**Integration Tests**
- Bridge creation and configuration testing
- Multi-window communication testing
- Thunk execution and coordination testing
- Error propagation testing

**End-to-End Tests**
- Full application workflow testing
- Cross-process communication validation
- Performance and memory leak testing
- Real Electron environment testing

### Performance Monitoring

Key metrics tracked in development:

- **Action Processing Time**: Time from dispatch to state update
- **IPC Latency**: Communication overhead between processes
- **Memory Usage**: Tracking for resource leaks
- **Thunk Execution Time**: End-to-end thunk performance
- **State Serialization Cost**: Size and time for state transmission

## Contributing Guidelines

### Code Style

The project enforces consistent code style through:
- **Biome** for linting and formatting
- **TypeScript** strict mode enabled
- **ESLint** rules for React and Node.js
- **Conventional Commits** for commit messages

### Pull Request Process

1. **Branch Strategy**: Feature branches from `main`
2. **Testing**: All tests must pass, coverage requirements met
3. **Documentation**: Update relevant documentation
4. **Review**: Code review required before merge
5. **CI/CD**: Automated testing and building on all PRs

### Release Process

The project uses semantic versioning with automated releases:
- `feat:` commits trigger minor version bumps
- `fix:` commits trigger patch version bumps
- `BREAKING CHANGE:` triggers major version bumps
- All packages are released together for consistency

## Architecture Decisions

### Why Separate Thunk and Action Processing?

Thunks and actions have different execution patterns:
- **Actions**: Immediate state updates, synchronous processing
- **Thunks**: Asynchronous execution, can dispatch multiple actions
- **Separation**: Allows different optimization strategies for each

### Why Deferred Action Processing?

Action deferral during thunk execution provides:
- **Consistency**: Prevents race conditions in state updates
- **Predictability**: Ensures deterministic execution order
- **Debugging**: Easier to reason about state changes

### Why Rust Middleware?

Optional Rust middleware provides:
- **Performance**: 10-100x faster action processing
- **Memory Safety**: Prevents memory leaks in long-running applications
- **Concurrency**: Better handling of concurrent operations
- **Future-Proofing**: Foundation for advanced features

## Future Roadmap

### Short Term (Next 6 months)
- Enhanced TypeScript integration
- Improved debugging tools
- Performance optimizations
- Additional example applications

### Medium Term (6-12 months)
- Rust middleware as default option
- Advanced caching strategies
- Plugin architecture for extensibility
- Cross-platform testing improvements

### Long Term (12+ months)
- WebAssembly integration for performance
- Advanced state diffing algorithms
- Distributed state management
- Integration with other Electron frameworks
