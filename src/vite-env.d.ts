/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USER_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
