"use client";

import { useFormStatus } from "react-dom";
import { YelenLoader } from "@/components/YelenLoader";

export function SubmitWireTransferButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F5A623] px-6 text-sm font-semibold text-[#1A1A2E] transition-opacity hover:opacity-90 disabled:opacity-70"
    >
      {pending ? <><YelenLoader size={16} color="#1A1A2E"/>Envoi…</> : "J'ai effectue le virement"}
    </button>
  );
}
