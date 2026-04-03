const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/recherche", label: "Recherche" },
  { href: "/mes-rdv", label: "Mes RDV" },
];

export default function CitoyenHomePage() {
  return (
    <div className="min-h-screen bg-[#1A1A2E] px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-[#16162a] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#F5A623]">
          Espace citoyen
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">YELEN224</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Acces reserve aux citoyens connectes.
        </p>
        <ul className="mt-6 space-y-2">
          {links.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="block rounded-xl border border-white/15 bg-[#1A1A2E] px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:border-[#F5A623]/50 hover:text-[#F5A623]"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
