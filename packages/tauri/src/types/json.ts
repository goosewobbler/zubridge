/**
 * Lightweight JSON value type used by the Tauri wire protocol. Mirrors
 * `serde_json::Value` on the Rust side.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
