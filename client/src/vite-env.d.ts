/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "owner/repo" of the GitHub repository that receives card flags. Optional. */
  readonly VITE_GITHUB_REPO?: string;
}
