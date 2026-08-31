import Link from "next/link";
import { submitWireTransferPayment } from "./actions";
import { SubmitWireTransferButton } from "./submit-button";

type PageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

export default async function InstitutionAbonnementPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const showSuccess = sp.success === "1";
  const err = sp.error;

  return (
    <div className="flex min-h-screen flex-col bg-[#1A1A2E] text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#1A1A2E]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 sm:px-5 sm:py-4">
          <Link
            href="/"
            className="font-semibold tracking-tight text-[#F5A623] sm:text-lg"
          >
            YELEN224
          </Link>
          <Link
            href="/institution/dashboard"
            className="text-sm text-zinc-300 transition-colors hover:text-white"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="relative flex-1 px-4 py-8 sm:px-5 sm:py-10">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#F5A623]/20 blur-3xl sm:h-80 sm:w-80" />
          <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-[#F5A623]/10 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-5xl space-y-8">
          <section className="rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#F5A623]">
              Abonnement institution
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Plan actuel
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold text-white sm:text-xl">
                Période d&apos;essai gratuite
              </p>
              <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Actif
              </span>
            </div>
          </section>

          <section aria-labelledby="plans-titre" className="space-y-4">
            <h2 id="plans-titre" className="sr-only">
              Formules disponibles
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* PLAN GRATUIT */}
              <article className="flex flex-col rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6">
                <h3 className="text-lg font-bold text-white sm:text-xl">PLAN GRATUIT</h3>
                <ul className="mt-4 flex flex-1 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
                  <li>Pour les citoyens uniquement</li>
                  <li>Toujours gratuit</li>
                  <li>Accès à la recherche et prise de RDV</li>
                </ul>
              </article>

              {/* PLAN PRO */}
              <article className="flex flex-col rounded-2xl border border-[#F5A623]/35 bg-[#F5A623]/10 p-5 sm:p-6">
                <h3 className="text-lg font-bold text-white sm:text-xl">
                  PLAN PRO — 7$/mois
                </h3>
                <ul className="mt-4 flex flex-1 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-200">
                  <li>2 mois gratuits au lancement</li>
                  <li>Puis 7$/mois</li>
                  <li>
                    Profil + badge + RDV illimités + 1 adresse + stats basiques
                  </li>
                </ul>
              </article>

              {/* PLAN PREMIUM */}
              <article className="flex flex-col rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6">
                <h3 className="text-lg font-bold text-white sm:text-xl">
                  PLAN PREMIUM — 15$/mois
                </h3>
                <ul className="mt-4 flex flex-1 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
                  <li>3 mois gratuits au lancement</li>
                  <li>Puis 15$/mois</li>
                  <li>
                    Tout Pro + plusieurs branches + stats avancées + annonces +
                    messagerie + priorité classement + support prioritaire
                  </li>
                </ul>
              </article>
            </div>
          </section>

          {showSuccess ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              Paiement enregistre : votre virement est en attente de validation.
            </p>
          ) : null}
          {err === "reference" ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Veuillez saisir la reference du virement.
            </p>
          ) : null}
          {err === "supabase" ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Enregistrement impossible pour le moment. Reessayez plus tard.
            </p>
          ) : null}

          {/* BLOC_STRIPE */}
          <section
            aria-labelledby="bloc-stripe-title"
            className="rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6"
          >
            <h2
              id="bloc-stripe-title"
              className="text-lg font-semibold text-white sm:text-xl"
            >
              Payer par carte bancaire
            </h2>
            <button
              type="button"
              disabled
              className="mt-4 inline-flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full bg-[#F5A623]/50 px-6 text-sm font-semibold text-[#1A1A2E] opacity-80"
            >
              Payer par carte
            </button>
            <p className="mt-3 text-sm text-zinc-500">
              Intégration Stripe à venir
            </p>
          </section>

          {/* BLOC_PAYPAL */}
          <section
            aria-labelledby="bloc-paypal-title"
            className="rounded-2xl border border-white/10 bg-[#16162a] p-5 sm:p-6"
          >
            <h2
              id="bloc-paypal-title"
              className="text-lg font-semibold text-white sm:text-xl"
            >
              Payer via PayPal
            </h2>
            <button
              type="button"
              disabled
              className="mt-4 inline-flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full border border-white/25 bg-white/5 px-6 text-sm font-medium text-zinc-400"
            >
              Payer via PayPal
            </button>
            <p className="mt-3 text-sm text-zinc-500">
              Intégration PayPal à venir
            </p>
          </section>

          {/* BLOC_VIREMENT_AFRIQUE */}
          <section
            aria-labelledby="bloc-virement-title"
            className="rounded-2xl border border-[#F5A623]/25 bg-[#16162a] p-5 sm:p-6"
          >
            <h2
              id="bloc-virement-title"
              className="text-lg font-semibold text-white sm:text-xl"
            >
              Virement bancaire
            </h2>
            <div className="mt-4 rounded-xl border border-white/10 bg-[#1A1A2E] p-4 text-sm text-zinc-300">
              <p className="font-medium text-white">Coordonnees bancaires (exemple)</p>
              <ul className="mt-3 space-y-2 text-zinc-400">
                <li>
                  <span className="text-zinc-500">Banque :</span> Banque Regionale Solidarite
                </li>
                <li>
                  <span className="text-zinc-500">IBAN :</span> GN07 0001 0002 0003 0004 0005 06
                </li>
                <li>
                  <span className="text-zinc-500">BIC :</span> YELENGNGN
                </li>
                <li>
                  <span className="text-zinc-500">Beneficiaire :</span> YELEN224 SARL
                </li>
                <li>
                  <span className="text-zinc-500">Motif :</span> Abonnement institution YELEN224
                </li>
              </ul>
            </div>

            <form action={submitWireTransferPayment} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="reference"
                  className="block text-sm font-medium text-zinc-200"
                >
                  Reference du virement
                </label>
                <input
                  id="reference"
                  name="reference"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Ex: VIR-2026-0312-XXXX"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-[#1A1A2E] px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-[#F5A623]/60"
                />
              </div>
              <SubmitWireTransferButton/>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
