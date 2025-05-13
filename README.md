<picture>
  <img alt="zubridge hero image" src="./resources/zubridge-hero.png" onerror="this.style.display='none';document.getElementById('fallback-title').style.display='block'"/>
</picture>

<h1 id="fallback-title" style="display:none">Zubridge</h1>

_Cross-platform state without boundaries: Zustand-inspired simplicity_

<a href="https://www.npmjs.com/package/@zubridge/electron" alt="@zubridge/electron on NPM"><img src="https://img.shields.io/badge/@zubridge/electron-9feaf9" /></a>
<a href="https://www.npmjs.com/package/@zubridge/electron" alt="@zubridge/electron on NPM"><img src="https://img.shields.io/npm/v/@zubridge/electron" /></a>
<a href="https://www.npmjs.com/package/@zubridge/electron" alt="@zubridge/electron on NPM"><img src="https://img.shields.io/npm/dw/@zubridge/electron" /></a> \
<a href="https://www.npmjs.com/package/@zubridge/tauri" alt="@zubridge/tauri on NPM"><img src="https://img.shields.io/badge/@zubridge/tauri-ffc131" /></a>
<a href="https://www.npmjs.com/package/@zubridge/tauri" alt="@zubridge/tauri on NPM"><img src="https://img.shields.io/npm/v/@zubridge/tauri" /></a>
<a href="https://www.npmjs.com/package/@zubridge/tauri" alt="@zubridge/tauri on NPM"><img src="https://img.shields.io/npm/dw/@zubridge/tauri" /></a> \
<a href="https://crates.io/crates/tauri-plugin-zubridge" alt="Tauri-Plugin-Zubridge on Crates.io"><img src="https://img.shields.io/badge/tauri-plugin-ffc131" /></a>
<a href="https://crates.io/crates/tauri-plugin-zubridge" alt="Tauri-Plugin-Zubridge on Crates.io"><img src="https://img.shields.io/crates/v/tauri-plugin-zubridge" /></a>
<a href="https://crates.io/crates/tauri-plugin-zubridge" alt="Tauri-Plugin-Zubridge on Crates.io"><img src="https://img.shields.io/crates/d/tauri-plugin-zubridge" /></a>

### Why

> tldr: I want to seamlessly interact with my backend state using Zustand-inspired hooks.

[Zustand](https://github.com/pmndrs/zustand) is a great state management library that, like [Redux](https://redux.js.org/tutorials/fundamentals/part-4-store#redux-store), [recommends](https://zustand.docs.pmnd.rs/guides/flux-inspired-practice#recommended-patterns) using a single store for your application. However, in cross-platform apps, this approach faces challenges when state needs to be accessed across process boundaries.

Zubridge solves this by enabling a single store workflow, abstracting away the IPC management and state synchronization between processes.

### Features

- **Zustand-like API** for state management across your entire cross-platform app
- **Frontend flexibility** - works with React, other frontend frameworks, or vanilla JavaScript
- **Framework-agnostic backend contract** that works with any state provider implementation
- **Type-safe state management** between processes
- **Automatic state synchronization** across multiple windows

#### Electron-specific features

- Works with the latest security model in Electron
- Supports Zustand and Redux
- Supports various usage patterns when using Zustand for your main process store (store handlers, separate handlers, Redux-style reducers)
- Supports dispatching thunks, action objects and string actions in both processes

#### Tauri-specific features

- Compatible with both Tauri v1 and v2 APIs via dependency injection
- Connect frontend components to Rust backend state using Zustand-like hooks
- Clear separation between frontend state access and backend state logic

### How It Works

Zubridge creates a bridge between your backend store and frontend processes. The backend (main process) store acts as the single source of truth, while frontend (renderer) processes receive synchronized copies of the state.

Actions from the frontend are sent through IPC to the backend, which updates the central store. These updates are then automatically broadcast to all connected frontend processes, ensuring consistent state throughout your application.

### Getting Started

Zubridge is available for both Electron and Tauri apps:

- [Electron documentation](./packages/electron/docs/getting-started.md)
- [Tauri documentation](./packages/tauri/docs/getting-started.md)

### Framework Support

Zubridge is available for multiple cross-platform application frameworks:

#### Electron

Install `@zubridge/electron` for Electron applications.

Uses Electron's built-in IPC system with minimal configuration required.

#### Tauri

Install `@zubridge/tauri` for Tauri applications (supports Tauri v1 and v2).

Uses Tauri's event system and commands, respecting its security model where main process actions must be explicitly allowed.

### Inspiration / Prior Art

- [goosewobbler/zutron](https://github.com/goosewobbler/zutron) (Electron + Zustand)

  - Zustand store in the main process, synced to Zustand in the renderer
  - `@zubridge/electron` started as a rebrand of Zutron and evolved from there

- [vitordino/reduxtron](https://github.com/vitordino/reduxtron) (Electron + Redux + Zustand)

  - Redux store in the main process, optionally synced to Zustand in the renderer
  - Reduxtron is the original inspiration for Zutron (and hence `@zubridge/electron`)

- [klarna/electron-redux](https://github.com/klarna/electron-redux) (Electron + Redux)
  - Bi-directional sync between one Redux store in the main process, and another in the renderer
  - No longer maintained. It was [forked](https://github.com/goosewobbler/electron-redux) to enable support for Electron 14's [security model improvements](https://github.com/klarna/electron-redux/issues/317), but the architectural approach had serious limitations.
