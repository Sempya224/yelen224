"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerCitoyenPhone } from "./actions";
import { YELEN224_PENDING_USER_ID_KEY } from "@/lib/auth/constants";

export function InscriptionForm() {
  const router = useRouter();
  const [phoneLocal, setPhoneLocal] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("phone", phoneLocal);
      const result = await registerCitoyenPhone(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem(YELEN224_PENDING_USER_ID_KEY, result.userId);
      }
      router.push("/verification");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      <label htmlFor="phone" className="block text-sm font-medium text-zinc-200">
        Numéro de téléphone
      </label>
      <div className="flex h-12 overflow-hidden rounded-xl border border-white/15 bg-[#1A1A2E] focus-within:border-[#F5A623]/60">
        <span className="inline-flex items-center border-r border-white/10 px-3 text-sm font-medium text-zinc-300">
          +224
        </span>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel-national"
          inputMode="numeric"
          placeholder="ex. 624000000"
          required
          maxLength={15}
          value={phoneLocal}
          onChange={(e) => setPhoneLocal(e.target.value.replace(/[^\d]/g, ""))}
          disabled={pending}
          className="w-full bg-transparent px-3 text-sm text-white placeholder:text-zinc-500 outline-none disabled:opacity-70"
        />
      </div>

      {pending ? (
        <p className="text-sm text-[#F5A623]" aria-live="polite">
          Envoi en cours, veuillez patienter…
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#F5A623] px-6 text-sm font-semibold text-[#1A1A2E] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Recevoir mon code SMS"}
      </button>
    </form>
  );
}
