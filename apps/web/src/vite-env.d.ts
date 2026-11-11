/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public: shown in the privacy dialog. Injected by `define` in `vite.config.ts`. */
  readonly CONTROLLER_NAME?: string;
  /** Public: shown in the privacy dialog. Injected by `define` in `vite.config.ts`. */
  readonly CONTACT_EMAIL?: string;
}
