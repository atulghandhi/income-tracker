import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { LedgerState } from "./types";

const projectUrl = import.meta.env.VITE_SUPABASE_URL || "https://hgzacqveqrccnvjwumkz.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export type AuthSession = Session;
export type AuthUser = User;

export type CloudLedgerRow = {
  user_id: string;
  state: LedgerState;
  schema_version: number;
  created_at: string;
  updated_at: string;
};

export const supabase: SupabaseClient | null = publishableKey
  ? createClient(projectUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function upsertUserProfile(user: User) {
  if (!supabase) return;

  const { error } = await supabase.from("ledgerlite_profiles").upsert({
    id: user.id,
    email: user.email ?? null,
    full_name: typeof user.user_metadata.name === "string" ? user.user_metadata.name : null,
    avatar_url: typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function loadCloudLedgerState() {
  if (!supabase) return null;

  const { data, error } = await supabase.from("ledgerlite_states").select("state").maybeSingle();
  if (error) throw error;

  return (data?.state as LedgerState | undefined) ?? null;
}

export async function saveCloudLedgerState(userId: string, state: LedgerState) {
  if (!supabase) return;

  const { error } = await supabase.from("ledgerlite_states").upsert({
    user_id: userId,
    state,
    schema_version: state.schemaVersion,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export type FeedbackType = "bug" | "feature" | "general";

export interface FeedbackPayload {
  type: FeedbackType;
  subject: string;
  description: string;
  email?: string;
  userId?: string;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase.from("ledgerlite_feedback").insert({
    type: payload.type,
    subject: payload.subject,
    description: payload.description,
    email: payload.email ?? null,
    user_id: payload.userId ?? null,
    user_agent: navigator.userAgent,
  });

  if (error) throw error;
}
