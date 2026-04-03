import { VerificationForm } from "./verification-form";

export default function VerificationPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#1A1A2E] text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#1A1A2E]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-5 sm:py-4">
          <a
            href="/"
            className="font-semibold tracking-tight text-[#F5A623] sm:text-lg"
          >
            YELEN224
          </a>
          <a
            href="/inscription"
            className="text-sm text-zinc-300 transition-colors hover:text-white"
          >
            Retour
          </a>
        </div>
      </header>

      <main className="relative flex flex-1 items-center px-4 py-10 sm:px-5 sm:py-14">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#F5A623]/20 blur-3xl sm:h-80 sm:w-80" />
          <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-[#F5A623]/10 blur-3xl" />
        </div>

        <section className="relative mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#16162a] p-5 shadow-xl sm:p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#F5A623] sm:text-sm">
            Verification OTP
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Entrez le code recu par SMS
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400 sm:text-base">
            Saisissez les 6 chiffres (simulation : <span className="text-zinc-300">123456</span>).
          </p>

          <VerificationForm />

          <p className="mt-6 text-center text-sm text-zinc-400">
            <a
              href="/inscription"
              className="font-medium text-[#F5A623] transition-opacity hover:opacity-90"
            >
              Renvoyer le code
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
