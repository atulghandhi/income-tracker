// Emails the owner when someone submits Ledger Lite feedback.
//
// Called by the `ledgerlite_feedback_notify` trigger (pg_net) with just the new row's id.
// The function re-reads the row with the service role and stamps `notified_at`, so the
// endpoint can only ever send one email per real feedback row: calling it with a made-up
// or already-notified id does nothing. That is why it can run without a JWT.
//
// Secrets: RESEND_API_KEY, FEEDBACK_NOTIFY_EMAIL (where alerts go),
// optional RESEND_FROM_EMAIL (defaults to Resend's onboarding sender).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad id", { status: 400 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Claim the row first so retries or replays never double-send.
  const { data: row, error } = await admin
    .from("ledgerlite_feedback")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id)
    .is("notified_at", null)
    .select("id, created_at, type, subject, description, email, user_id, user_agent")
    .maybeSingle();
  if (error) {
    console.error("claim failed", error);
    return new Response("db error", { status: 500 });
  }
  if (!row) return new Response("nothing to send", { status: 200 });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("FEEDBACK_NOTIFY_EMAIL");
  if (!apiKey || !to) {
    console.error("RESEND_API_KEY or FEEDBACK_NOTIFY_EMAIL missing; feedback", row.id, "not emailed");
    await admin.from("ledgerlite_feedback").update({ notified_at: null }).eq("id", row.id);
    return new Response("not configured", { status: 500 });
  }

  const html = `
    <p><strong>${escapeHtml(row.type)}</strong> feedback on The Income Tracker</p>
    <h2 style="margin:8px 0">${escapeHtml(row.subject)}</h2>
    <p style="white-space:pre-wrap">${escapeHtml(row.description)}</p>
    <hr>
    <p style="color:#666;font-size:13px">
      From: ${row.email ? escapeHtml(row.email) : "(no email given)"}<br>
      Signed in: ${row.user_id ? "yes" : "no"}<br>
      Browser: ${escapeHtml(row.user_agent ?? "unknown")}<br>
      Sent: ${escapeHtml(row.created_at)}<br>
      Row id: ${escapeHtml(row.id)}
    </p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL") || "Income Tracker Feedback <onboarding@resend.dev>",
      to: [to],
      reply_to: row.email || undefined,
      subject: `[Feedback · ${row.type}] ${row.subject}`.slice(0, 200),
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("resend failed", res.status, body);
    await admin.from("ledgerlite_feedback").update({ notified_at: null }).eq("id", row.id);
    return new Response("send failed", { status: 502 });
  }
  return new Response("sent", { status: 200 });
});
