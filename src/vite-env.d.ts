/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // "0" stops the dev server seeding fresh browsers with sample data (the test runner sets it).
  readonly VITE_DEV_SAMPLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
