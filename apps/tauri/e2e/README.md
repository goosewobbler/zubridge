# E2E Tauri

End-to-end testing app for `@zubridge/tauri` and `tauri-plugin-zubridge`.

## Overview

This app mirrors the Electron e2e fixture (`apps/electron/e2e`) but runs on
Tauri. The renderer is shared - same `@zubridge/ui` components, same shared
thunks from `@zubridge/apps-shared` - so the same test scenarios drive both
platforms.

## Modes

The fixture exposes five state-manager implementations selected via the
`ZUBRIDGE_MODE` environment variable. Each Rust module under
`src-tauri/src/modes/` implements `tauri_plugin_zubridge::StateManager` in a
different shape, mirroring the JS fixtures in
`apps/electron/e2e/src/modes/`:

| `ZUBRIDGE_MODE`    | Rust module               | Shape                                                               |
| ------------------ | ------------------------- | ------------------------------------------------------------------- |
| `zustand-basic`    | `modes::zustand_basic`    | `Mutex<BaseState>` with inline match-arm handlers                   |
| `zustand-handlers` | `modes::zustand_handlers` | `Mutex<BaseState>` with a `HashMap` of named handler closures       |
| `zustand-reducers` | `modes::zustand_reducers` | Per-slice pure reducers (`reduce_counter`, `reduce_theme`, ...)     |
| `redux`            | `modes::redux`            | Single `root_reducer(state, action) -> state`                       |
| `custom`           | `modes::custom`           | Hand-written store with a Tokio broadcast channel for change events |

Default is `zustand-basic`.

## Layout

```
apps/tauri/e2e
├── package.json
├── src-tauri
│   ├── Cargo.toml
│   ├── build.rs            # declares the Zubridge plugin commands
│   ├── capabilities/       # main-capability allows zubridge:default + window APIs
│   ├── tauri.conf.json
│   └── src
│       ├── lib.rs          # thin entry point - selects mode + wires plugin
│       ├── main.rs
│       ├── bridge.rs       # builds `TauriPlugin` for the active mode
│       ├── store.rs        # AppAction parser + shared error envelope
│       ├── window.rs       # runtime-window builder + window-info helpers
│       ├── commands.rs     # quit_app / get_mode / get_window_info / ...
│       ├── tray.rs         # system tray reflecting counter + theme
│       ├── features/       # shared state/counter/theme/error logic
│       │   ├── state.rs
│       │   ├── counter.rs
│       │   ├── theme.rs
│       │   └── error.rs
│       └── modes/          # five StateManager flavours
│           ├── zustand_basic.rs
│           ├── zustand_handlers.rs
│           ├── zustand_reducers.rs
│           ├── redux.rs
│           └── custom.rs
└── src
    ├── renderer/
    │   ├── App.tsx         # mirrors apps/electron/e2e/src/renderer/App.tsx
    │   ├── main.tsx
    │   ├── index.html
    │   └── styles/
    ├── types/              # WindowInfo / ModeInfo / BaseState typings
    └── utils/
        └── mode.ts
```

## Development

```bash
# Install dependencies (workspace root)
pnpm install

# Start dev mode in any of the 5 modes
ZUBRIDGE_MODE=zustand-basic pnpm --filter tauri-e2e dev
ZUBRIDGE_MODE=zustand-handlers pnpm --filter tauri-e2e dev
ZUBRIDGE_MODE=zustand-reducers pnpm --filter tauri-e2e dev
ZUBRIDGE_MODE=redux            pnpm --filter tauri-e2e dev
ZUBRIDGE_MODE=custom           pnpm --filter tauri-e2e dev
```

Or use the per-mode shortcuts:

```bash
pnpm --filter tauri-e2e dev:zustand-basic
pnpm --filter tauri-e2e dev:redux
# ...
```

### Linux build dependencies

The Tauri runtime requires GTK 3 and WebKit2GTK 4.1 dev headers to compile.
On Ubuntu 24.04 these are:

```bash
sudo apt-get install \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev
```

If the dev headers are not present, `cargo check` / `cargo test` will fail
during the `gdk-sys` build step. **Running the dev server end-to-end on
headless Linux additionally needs an X server / display** - the Rust /
TypeScript build steps below run without one, but `pnpm tauri dev` does not.

## Validation

```bash
# Rust unit tests for the modes (30 tests, runs in <1s)
cargo test --manifest-path apps/tauri/e2e/src-tauri/Cargo.toml --lib

# Type-check the renderer
pnpm --filter tauri-e2e typecheck

# Vite production build
pnpm --filter tauri-e2e exec vite build
```
