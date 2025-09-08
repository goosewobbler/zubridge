<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <img alt="zubridge hero image" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png" style="max-height: 415px;">
</picture>

<h1 align="center">Zubridge Tauri</h1>

_Cross-platform state without boundaries: Zustand-inspired simplicity for Tauri_

<a href="https://www.npmjs.com/package/@zubridge/tauri" alt="NPM Version">
  <img src="https://img.shields.io/npm/v/@zubridge/tauri" /></a>
<a href="https://www.npmjs.com/package/@zubridge/tauri" alt="NPM Downloads">
  <img src="https://img.shields.io/npm/dw/@zubridge/tauri" /></a>

## Why Zubridge?

> tldr: I want to seamlessly interact with my Rust backend state using Zustand-inspired hooks.

[Zustand](https://github.com/pmndrs/zustand) provides a simple and effective state management pattern. In Tauri applications, managing state consistently between the Rust backend (where the authoritative state often resides) and multiple frontend windows can be complex.

Zubridge `@zubridge/tauri` simplifies this by providing hooks (`useZubridgeStore`, `useZubridgeDispatch`) that connect your frontend components to your Rust backend state, abstracting away the necessary Tauri command invocations and event listening.

## How It Works

Zubridge creates a bridge between your Rust backend state and your frontend JavaScript. Your Rust backend holds the source of truth, while the frontend uses hooks to access and update this state.

1. **Backend**: Register the `tauri-plugin-zubridge` plugin with your app state
2. **Backend**: Implement the `StateManager` trait to handle state changes
3. **Frontend**: Initialize the bridge with `@zubridge/tauri`
4. **Frontend**: Access state with `useZubridgeStore` and dispatch actions with `useZubridgeDispatch`

## Features

- **Simple State Management**: Connect frontend components to Rust backend state using Zustand-like hooks
- **Standard Interface**: Consistent pattern for dispatching actions and receiving updates
- **Type Safety**: Strong typing for both Rust and TypeScript sides
- **Multi-Window Support**: Automatic state synchronization across multiple windows
- **Minimal Boilerplate**: Reduced code for state management through the official plugin
- **Frontend Flexibility**: Works with React, other frontend frameworks, or vanilla JavaScript
- **Tauri Version Support**: Compatible with both Tauri v1 and v2 APIs via dependency injection

## Installation

### Rust Backend

```toml
# Cargo.toml
[dependencies]
tauri-plugin-zubridge = "0.1.0"
serde = { version = "1.0", features = ["derive"] }
```

### Frontend

```bash
# Using npm
npm install @zubridge/tauri @tauri-apps/api
```

Or use your dependency manager of choice, e.g. `pnpm`, `yarn`.

## Quick Start

1. Define your application state and implement the `StateManager` trait in your Rust backend
2. Register the `tauri-plugin-zubridge` plugin in your Tauri application
3. Initialize the bridge in your frontend with `initializeBridge({ invoke, listen })`
4. Access state with `useZubridgeStore` and dispatch actions with `useZubridgeDispatch`

For detailed implementation examples, see our [Getting Started Guide](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/getting-started.md).

## Documentation

For more detailed documentation, see:

- [Getting Started](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/getting-started.md)
- [Backend Process Guide](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/backend-process.md)
- [Frontend Process Guide](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/frontend-process.md)
- [API Reference](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/api-reference.md)

## Example Applications

Complete example applications demonstrating the use of `@zubridge/tauri`:

- [Tauri Example App](https://github.com/goosewobbler/zubridge/tree/main/apps/tauri/e2e)

## Direct Architecture

<img alt="zubridge tauri direct architecture" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-tauri-direct-architecture.png"/>

## Plugin Architecture

<img alt="zubridge tauri plugin architecture" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-tauri-plugin-architecture.png"/>

## Development

For information about contributing to this project, see the [Developer Guide](https://github.com/goosewobbler/zubridge/blob/main/docs/developer.md).

## License

MIT
