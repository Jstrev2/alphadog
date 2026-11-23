"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/components/GameProvider";
import { Button, Spinner } from "@/components/ui";
import { friendlyError } from "@/lib/game";

type Step = { mode: "save" | "signin"; stage: "email" | "code"; email: string };

/**
 * Accounts start as anonymous guests, so trying the app takes no sign-up.
 * Adding an email turns the guest into a real account that works on every
 * device. Supabase's built-in emails carry a sign-in link. Once the project
 * has its own email sender (custom SMTP), the templates can add {{ .Token }}
 * and people can type the code instead, which also works inside the
 * installed app. This screen accepts either.
 */
export function AccountSection() {
  const { sb, account, dogs, refresh } = useGame();
  const [step, setStep] = useState<Step | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Coming back from the email link (often in another tab): pick up the change.
  const waiting = step?.stage === "code" ? step : null;
  useEffect(() => {
    if (!sb || !waiting) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (waiting.mode === "save") {
        const { data } = await sb.auth.refreshSession();
        if (data.user && !data.user.is_anonymous) {
          setStep(null);
          setDone("Saved! Sign in with this email on any device.");
          await refresh();
        }
      } else {
        const { data } = await sb.auth.getSession();
        if (data.session && data.session.user.id !== account?.id) window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [sb, waiting, account?.id, refresh]);

  if (!sb) return null;

  const sendCode = async (mode: Step["mode"], email: string) => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "save") {
        const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: window.location.origin });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      }
      setStep({ mode, stage: "code", email });
      setCode("");
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "";
      setError(
        /signups not allowed|user not found/i.test(msg)
          ? "We couldn't find that email. Check it, or save your dog with it first."
          : /already been registered|already registered/i.test(msg)
            ? "That email already has an account. Use Sign in instead."
            : friendlyError(err),
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!step) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await sb.auth.verifyOtp({
        email: step.email,
        token: code.trim(),
        type: step.mode === "save" ? "email_change" : "email",
      });
      if (error) throw error;
      setDone(step.mode === "save" ? "Saved! Sign in with this email on any device." : "Signed in.");
      setStep(null);
      await refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await sb.auth.signOut();
    setDone(null);
  };

  const signedIn = account && !account.isAnonymous;

  return (
    <section className="rounded-2xl p-4 ring-1 ring-zinc-200">
      <h3 className="font-semibold text-zinc-900">Your account</h3>

      {done && <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{done}</p>}
      {error && <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {signedIn && !step && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-zinc-600">Signed in as {account.email}</p>
          <Button kind="secondary" onClick={signOut} className="h-9 shrink-0">
            Sign out
          </Button>
        </div>
      )}

      {!signedIn && !step && (
        <div className="mt-1 space-y-3">
          {account?.isAnonymous && dogs.length > 0 ? (
            <>
              <p className="text-sm text-zinc-600">
                You&apos;re a guest on this device. Add your email to keep {dogs[0].name} safe and use AlphaDog on your
                phone and computer.
              </p>
              <EmailForm busy={busy} label="Save with email" onSubmit={(email) => sendCode("save", email)} />
              <button
                type="button"
                onClick={() => setStep({ mode: "signin", stage: "email", email: "" })}
                className="text-sm font-semibold text-emerald-700"
              >
                Already saved on another device? Sign in
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-600">Already using AlphaDog on another device? Sign in with your email.</p>
              <EmailForm busy={busy} label="Send code" onSubmit={(email) => sendCode("signin", email)} />
            </>
          )}
        </div>
      )}

      {step?.stage === "email" && (
        <div className="mt-2 space-y-2">
          {account?.isAnonymous && dogs.length > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Signing in switches to that account. The guest dog on this device ({dogs.map((d) => d.name).join(", ")})
              stays behind with the guest. Use &quot;Save with email&quot; instead to keep it.
            </p>
          )}
          <EmailForm busy={busy} label="Send code" onSubmit={(email) => sendCode("signin", email)} />
          <button type="button" onClick={() => setStep(null)} className="text-sm font-semibold text-zinc-500">
            Back
          </button>
        </div>
      )}

      {step?.stage === "code" && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p className="text-sm text-zinc-600">
            Check <strong>{step.email}</strong> and tap the link in the email on this device. If the email has a code
            instead, type it here.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="h-12 w-full rounded-xl border border-zinc-300 px-3 text-center text-xl tracking-[0.3em] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <div className="flex gap-2">
            <Button kind="secondary" onClick={() => setStep(null)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={busy || code.length < 6} className="flex-1">
              {busy ? <Spinner className="size-4" /> : "Confirm"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function EmailForm({ busy, label, onSubmit }: { busy: boolean; label: string; onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email.trim());
      }}
    >
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
      <Button type="submit" disabled={busy} className="shrink-0">
        {busy ? <Spinner className="size-4" /> : label}
      </Button>
    </form>
  );
}
