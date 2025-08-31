/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly vitest?: typeof import('vitest'); // Add this line
}

type ImportMetaEnv = {};
