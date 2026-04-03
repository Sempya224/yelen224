"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";

export function CitoyenGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem(YELEN224_USER_ID_KEY);
    if (!id) {
      router.replace("/inscription");
      return;
    }
    setOk(true);
  }, [router]);

  if (!ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#1A1A2E] px-4 text-sm text-zinc-400">
        Chargement…
      </div>
    );
  }

  return <>{children}</>;
}
