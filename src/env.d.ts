/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly WXT_DEFAULT_REGISTRY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
