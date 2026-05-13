import { invoke } from '@tauri-apps/api/core';

if (typeof window !== 'undefined') {
  if (!window.__TAURI__) window.__TAURI__ = {};
  if (!window.__TAURI__.core) window.__TAURI__.core = {};
  window.__TAURI__.core.invoke = invoke as (cmd: string, args?: unknown) => Promise<unknown>;
}
