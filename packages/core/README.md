# @zubridge/core

> Shared core functionality for Zubridge packages

This package contains the shared implementation code used across all Zubridge packages. It provides common store creation, subscription, and dispatch functionality that works across different cross-platform frameworks.

## Installation

```bash
pnpm install @zubridge/core
```

## Usage

```typescript
import { createStore, useDispatch } from '@zubridge/core';
import type { AnyState } from '@zubridge/types';

// Use core functionality in a framework-specific implementation
```

## Features

- Store creation utilities
- Dispatch function factories
- Common state management patterns
- Framework-agnostic implementation
