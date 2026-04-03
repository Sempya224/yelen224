"use client";

import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { deleteCitoyenAccount, updateCitoyenProfile } from "./actions";

type UserRow = {
  id: string;
  phone?: string | null;
  name?: string | null;
  prenom?: string | null;
  nom?: string | null;
  avatar_url?: string | null;
};

function profileIncomplete(u: UserRow | null): boolean {
  if (!u) {
    return true;
  }
  const p = (u.prenom ?? "").trim();
  const n = (u.nom ?? "").trim();
  if (p && n) {
    return false;
  }
  return !(u.name ?? "").trim();
}

function initials(prenom: string, nom: string): string {
  const a = prenom[0]?.toUpperCase() ?? "";
  const b = nom[0]?.toUpperCase() ?? "";
  return (a + b) || "?";
}

function formatPhone(u: UserRow): string {
  const raw = u.phone ?? "";
  if (!raw) {
    return "—";
  }
  return raw.startsWith("+") ? raw : `+${raw}`;
}

export function ProfilClient() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Mode édition : uniquement si profil déjà complet */
  const [editing, setEditing] = useState(false);

  const loadUser = useCallback(async (id: string) => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
      setUser(null);
      return;
    }
    if (!data) {
      setLoadError("Profil introuvable.");
      setUser(null);
      return;
    }

    const row = data as UserRow;
    setUser(row);

    let p = (row.prenom ?? "").trim();
    let n = (row.nom ?? "").trim();
    if (!p && !n && (row.name ?? "").trim()) {
      const parts = String(row.name).trim().split(/\s+/);
      p = parts[0] ?? "";
      n = parts.slice(1).join(" ") || "";
    }
    setPrenom(p);
    setNom(n);
    setPreview(null);
    setFile(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const id = localStorage.getItem(YELEN224_USER_ID_KEY);
    if (!id) {
      router.replace("/inscription");
      return;
    }
    setUserId(id);
    void (async () => {
      setLoading(true);
      await loadUser(id);
      setLoading(false);
    })();
  }, [router, loadUser]);

  useEffect(() => {
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function uploadAvatarIfNeeded(id: string): Promise<string | null> {
    if (!file) {
      return null;
    }
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (error) {
      console.error("[profil] storage upload:", error.message);
      return null;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveProfile(options: { redirectToDashboard: boolean }) {
    if (!userId) {
      return;
    }
    setFormError(null);
    const p = prenom.trim();
    const n = nom.trim();
    if (!p || !n) {
      setFormError("Prénom et nom sont obligatoires.");
      return;
    }

    setSaving(true);
    try {
      let avatarParam: string | null | undefined = undefined;
      if (file) {
        const uploaded = await uploadAvatarIfNeeded(userId);
        if (uploaded) {
          avatarParam = uploaded;
        }
      }

      const result = await updateCitoyenProfile(userId, p, n, avatarParam);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      await loadUser(userId);
      setFile(null);
      setEditing(false);
      if (options.redirectToDashboard) {
        router.push("/dashboard");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitFirst(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile({ redirectToDashboard: true });
  }

  async function onSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile({ redirectToDashboard: false });
  }

  function cancelEdit() {
    if (!userId) {
      return;
    }
    setEditing(false);
    setFormError(null);
    setFile(null);
    void loadUser(userId);
  }

  async function handleDelete() {
    if (!userId) {
      return;
    }
    if (
      !window.confirm(
        "Supprimer définitivement votre compte ? Cette action est irréversible.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setFormError(null);
    try {
      const result = await deleteCitoyenAccount(userId);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      localStorage.removeItem(YELEN224_USER_ID_KEY);
      router.replace("/");
    } finally {
      setDeleting(false);
    }
  }

  function logout() {
    localStorage.removeItem(YELEN224_USER_ID_KEY);
    router.replace("/");
  }

  const displayAvatar =
    preview ?? (user?.avatar_url ? String(user.avatar_url) : null);
  const incomplete = profileIncomplete(user);

  if (loading || !userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#1A1A2E] text-zinc-400">
        Chargement…
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#1A1A2E] px-4 text-center">
        <p className="text-red-300">{loadError ?? "Erreur."}</p>
        <a href="/dashboard" className="mt-4 text-[#F5A623] hover:underline">
          Retour dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#1A1A2E] text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#1A1A2E]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3 sm:px-5 sm:py-4">
          <a href="/" className="font-semibold tracking-tight text-[#F5A623] sm:text-lg">
            YELEN224
          </a>
          <a
            href="/dashboard"
            className="text-sm text-zinc-300 transition-colors hover:text-white"
          >
            Dashboard
          </a>
        </div>
      </header>

      <main className="relative flex-1 px-4 py-8 sm:px-5 sm:py-10">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#F5A623]/20 blur-3xl sm:h-80 sm:w-80" />
          <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-[#F5A623]/10 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-2xl space-y-8">
          {incomplete ? (
            <section className="rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#F5A623]">
                Profil
              </p>
              <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Complétez votre profil
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Renseignez votre identité pour accéder à votre compte.
              </p>

              <form onSubmit={onSubmitFirst} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="prenom" className="text-sm font-medium text-zinc-200">
                      Prénom <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="prenom"
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-white/15 bg-[#1A1A2E] px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5A623]/60"
                    />
                  </div>
                  <div>
                    <label htmlFor="nom" className="text-sm font-medium text-zinc-200">
                      Nom <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="nom"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-white/15 bg-[#1A1A2E] px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5A623]/60"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="photo" className="text-sm font-medium text-zinc-200">
                    Photo de profil (optionnel)
                  </label>
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="mt-2 w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-[#F5A623] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#1A1A2E]"
                  />
                  {displayAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayAvatar}
                      alt="Aperçu"
                      className="mt-3 h-24 w-24 rounded-xl border border-white/15 object-cover"
                    />
                  ) : null}
                </div>

                {formError ? (
                  <p className="text-sm text-red-400" role="alert">
                    {formError}
                  </p>
                ) : null}

                {saving ? (
                  <p className="text-sm text-[#F5A623]">Enregistrement…</p>
                ) : null}

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#F5A623] px-6 text-sm font-semibold text-[#1A1A2E] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  Accéder à mon compte
                </button>
              </form>
            </section>
          ) : editing ? (
            <section className="rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6">
              <h1 className="text-xl font-bold text-white sm:text-2xl">
                Modifier mes informations
              </h1>
              <form onSubmit={onSubmitEdit} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="prenom-edit" className="text-sm font-medium text-zinc-200">
                      Prénom <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="prenom-edit"
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-white/15 bg-[#1A1A2E] px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5A623]/60"
                    />
                  </div>
                  <div>
                    <label htmlFor="nom-edit" className="text-sm font-medium text-zinc-200">
                      Nom <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="nom-edit"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-white/15 bg-[#1A1A2E] px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5A623]/60"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="photo-edit" className="text-sm font-medium text-zinc-200">
                    Photo de profil
                  </label>
                  <input
                    id="photo-edit"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="mt-2 w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200"
                  />
                  {displayAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayAvatar}
                      alt="Aperçu"
                      className="mt-3 h-24 w-24 rounded-xl border border-white/15 object-cover"
                    />
                  ) : null}
                </div>
                {formError ? (
                  <p className="text-sm text-red-400" role="alert">
                    {formError}
                  </p>
                ) : null}
                {saving ? (
                  <p className="text-sm text-[#F5A623]">Enregistrement…</p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-[#F5A623] px-6 text-sm font-semibold text-[#1A1A2E] transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-medium text-zinc-200 hover:border-[#F5A623]/50"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#F5A623]">
                  Mon compte
                </p>
                <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  Mon profil
                </h1>

                <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
                  <div className="relative mx-auto h-32 w-32 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-[#1A1A2E] sm:mx-0">
                    {user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(user.avatar_url)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#F5A623]">
                        {initials(prenom, nom)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2 text-center sm:text-left">
                    <p className="text-xl font-semibold text-white">
                      {prenom} {nom}
                    </p>
                    <p className="text-sm text-zinc-400">
                      <span className="text-zinc-500">Téléphone :</span>{" "}
                      <span className="text-zinc-200">{formatPhone(user)}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setEditing(true);
                  }}
                  className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#F5A623] px-6 text-sm font-semibold text-[#1A1A2E] transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Modifier mes informations
                </button>
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-white">Gérer mon compte</h2>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 px-4 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-60"
                  >
                    {deleting ? "Suppression…" : "Supprimer mon compte"}
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/20 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-[#F5A623]/50 hover:text-[#F5A623]"
                  >
                    Déconnexion
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
