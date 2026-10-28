import { createClient, type RealtimeChannel, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { LedgerRow, PushOutcome, PushStatus, SyncTransport } from "./sync/engine";
import type { LedgerState } from "./types";

const projectUrl = import.meta.env.VITE_SUPABASE_URL || "https://hgzacqveqrccnvjwumkz.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export type AuthSession = Session;
export type AuthUser = User;

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

export async function signInWithApple() {
  if (!supabase) throw new Error("Supabase is not configured");
  // Same Apple identity as the iOS app's native sign-in, so the same account and data.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// "signed-in" when the project lets new accounts in straight away, "confirm" when
// Supabase has emailed a confirmation link first.
export async function signUpWithEmail(email: string, password: string): Promise<"signed-in" | "confirm"> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data.session ? "signed-in" : "confirm";
}

export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.updateUser({ password });
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

// ─── Ledger sync (Sync v2, docs/ANDROID_APP_SPEC.md §4) ──────────────────────
// Writes go through ledgerlite_push_state, a compare-and-swap on the row's revision,
// so a device can never overwrite changes it has not seen. Every write pokes the
// owner's private realtime topic; devices then fetch the row themselves.

type PushRow = { status: PushStatus; revision: number | string; state: LedgerState | null; updated_by: string | null };

export async function pushLedgerState(state: LedgerState, baseRevision: number, deviceId: string): Promise<PushOutcome> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("ledgerlite_push_state", {
    p_state: state,
    p_base_revision: baseRevision,
    p_device_id: deviceId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as PushRow | undefined;
  if (!row) throw new Error("Empty response from ledgerlite_push_state");
  return { status: row.status, revision: Number(row.revision), state: row.state, updatedBy: row.updated_by };
}

export async function fetchLedgerRow(): Promise<LedgerRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("ledgerlite_states").select("state, revision, updated_by").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { state: data.state as LedgerState, revision: Number(data.revision), updatedBy: (data.updated_by as string | null) ?? null };
}

export async function fetchLedgerRevision(): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("ledgerlite_states").select("revision").maybeSingle();
  if (error) throw error;
  return data ? Number(data.revision) : null;
}

export const ledgerTransport: SyncTransport = {
  push: pushLedgerState,
  fetchRow: fetchLedgerRow,
  fetchRevision: fetchLedgerRevision,
};

// Listens on the user's private topic. `onJoined(true)` once the channel is live (fetch
// then, to catch anything missed while it was down); `onJoined(false)` if it drops.
export function subscribeLedgerChanges(
  userId: string,
  onPoke: (payload: { revision?: unknown; updated_by?: unknown; schema_version?: unknown }) => void,
  onJoined: (joined: boolean) => void,
): () => void {
  const client = supabase;
  if (!client) return () => undefined;
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void (async () => {
    try {
      // Private channels authorise with the user's JWT.
      await client.realtime.setAuth();
    } catch {
      onJoined(false);
      return;
    }
    if (cancelled) return;
    channel = client
      .channel(`ledger:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "state_changed" }, (message) => onPoke((message.payload ?? {}) as Record<string, unknown>))
      .subscribe((status) => onJoined(status === "SUBSCRIBED"));
  })();

  return () => {
    cancelled = true;
    if (channel) void client.removeChannel(channel);
  };
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
