"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  YELEN224_OTP_SIMULE,
  YELEN224_PENDING_USER_ID_KEY,
  YELEN224_USER_ID_KEY,
} from "@/lib/auth/constants";

export function VerificationForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const id = sessionStorage.getItem(YELEN224_PENDING_USER_ID_KEY);
    if (!id) {
      router.replace("/inscription");
      return;
    }
    setReady(true);
  }, [router]);

  function setDigit(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = v;
      return next;
    });
    if (v && index < 5) {
      const el = document.getElementById(`otp-${index + 2}`) as HTMLInputElement | null;
      el?.focus();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Saisissez les 6 chiffres.");
      return;
    }
    if (code !== YELEN224_OTP_SIMULE) {
      setError("Code incorrect. (Démo : 123456)");
      return;
    }

    setPending(true);
    try {
      const pendingId = sessionStorage.getItem(YELEN224_PENDING_USER_ID_KEY);
      if (!pendingId) {
        router.replace("/inscription");
        return;
      }
      localStorage.setItem(YELEN224_USER_ID_KEY, pendingId);
      sessionStorage.removeItem(YELEN224_PENDING_USER_ID_KEY);
      router.replace("/profil");
    } finally {
      setPending(false);
    }
  }

  if (!ready) {
    return (
      <p className="mt-6 text-center text-sm text-zinc-500">Chargement…</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <fieldset>
        <legend className="sr-only">Code OTP 6 chiffres</legend>
        <div className="grid grid-cols-6 gap-2 sm:gap-3">
          {digits.map((d, index) => (
            <input
              key={index}
              id={`otp-${index + 1}`}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={d}
              onChange={(ev) => setDigit(index, ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Backspace" && !digits[index] && index > 0) {
                  const el = document.getElementById(`otp-${index}`) as HTMLInputElement | null;
                  el?.focus();
                }
              }}
              className="h-12 w-full rounded-xl border border-white/15 bg-[#1A1A2E] text-center text-lg font-semibold text-white outline-none transition-colors focus:border-[#F5A623]/70"
              aria-label={`Chiffre ${index + 1}`}
            />
          ))}
        </div>
      </fieldset>

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#F5A623] px-6 text-sm font-semibold text-[#1A1A2E] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Verification…" : "Verifier mon code"}
      </button>
    </form>
  );
}
