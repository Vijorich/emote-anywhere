/// <reference types="wxt/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly WXT_DEFAULT_REGISTRY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
