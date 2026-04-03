"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yelen.app";
const GREEN = "#0e6e45";

type Institution = {
  id: string;
  name: string;
  category: string;
  logo: string;
  phone: string;
  email: string;
  adresse: string;
  ville: string;
  statut: string;
  badge_verifie: boolean;
};

// Logo soleil Yelen exact comme screenshot (fond orange, soleil blanc)
function YelenSunIcon({ size = 22 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const rCore = size * 0.25;
  const r1 = size * 0.36;
  const r2 = size * 0.47;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx} cy={cy} r={rCore} fill="white" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={cx + r1 * Math.cos(rad)}
            y1={cy + r1 * Math.sin(rad)}
            x2={cx + r2 * Math.cos(rad)}
            y2={cy + r2 * Math.sin(rad)}
            stroke="white"
            strokeWidth={size * 0.07}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function makeQRWithLogo(inst: Institution, size: number): Promise<string> {
  const url = `${APP_URL}/institution/${inst.id}`;
  return new Promise((resolve) => {
    QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: GREEN, light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then((qrDataUrl) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.onload = () => {
        // Dessine le QR
        ctx.drawImage(img, 0, 0, size, size);

        const logoBox = Math.round(size * 0.22);
        const lx = Math.round((size - logoBox) / 2);
        const ly = Math.round((size - logoBox) / 2);
        const rad = 7;

        // Fond blanc (marge)
        ctx.fillStyle = "#FFFFFF";
        fillRoundRect(ctx, lx - 4, ly - 4, logoBox + 8, logoBox + 8, rad + 2);

        // Fond orange Yelen
        ctx.fillStyle = "#F5A623";
        fillRoundRect(ctx, lx, ly, logoBox, logoBox, rad);

        // Soleil blanc au centre
        const scx = lx + logoBox / 2;
        const scy = ly + logoBox / 2;
        const sr = logoBox * 0.24;

        // Cercle
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(scx, scy, sr, 0, Math.PI * 2);
        ctx.fill();

        // Rayons
        [0, 45, 90, 135, 180, 225, 270, 315].forEach((angle) => {
          const a = (angle * Math.PI) / 180;
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = Math.max(1.5, logoBox * 0.055);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(scx + (sr + logoBox * 0.07) * Math.cos(a), scy + (sr + logoBox * 0.07) * Math.sin(a));
          ctx.lineTo(scx + (sr + logoBox * 0.22) * Math.cos(a), scy + (sr + logoBox * 0.22) * Math.sin(a));
          ctx.stroke();
        });

        resolve(canvas.toDataURL("image/png"));
      };
      img.src = qrDataUrl;
    });
  });
}

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

export default function CodeQRPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [filtered, setFiltered] = useState<Institution[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<Institution | null>(null);
  const [modalQr, setModalQr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const loadInstitutions = useCallback(async () => {
    setLoading(true);
    setQrMap({});
    const { data } = await supabase
      .from("institutions")
      .select("id,name,category,logo,phone,email,adresse,ville,statut,badge_verifie")
      .order("name");
    const list: Institution[] = data || [];
    setInstitutions(list);
    setFiltered(list);
    setCats([...new Set(list.map((i) => i.category).filter(Boolean))].sort() as string[]);
    setLoading(false);
    const map: Record<string, string> = {};
    for (const inst of list) {
      map[inst.id] = await makeQRWithLogo(inst, 220);
    }
    setQrMap(map);
  }, []);

  useEffect(() => { loadInstitutions(); }, [loadInstitutions]);

  useEffect(() => {
    let list = institutions;
    if (search) list = list.filter((i) =>
      i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.ville?.toLowerCase().includes(search.toLowerCase())
    );
    if (catFilter) list = list.filter((i) => i.category === catFilter);
    if (statutFilter) list = list.filter((i) => i.statut === statutFilter);
    setFiltered(list);
  }, [search, catFilter, statutFilter, institutions]);

  async function openModal(inst: Institution) {
    setModal(inst);
    setModalQr("");
    const qr = await makeQRWithLogo(inst, 500);
    setModalQr(qr);
  }

  function downloadQR(inst: Institution) {
    makeQRWithLogo(inst, 800).then((url) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR-Yelen-${inst.name.replace(/\s+/g, "-")}.png`;
      a.click();
    });
  }

  function copyURL(inst: Institution) {
    navigator.clipboard.writeText(`${APP_URL}/institution/${inst.id}`);
    setCopied(inst.id);
    setTimeout(() => setCopied(null), 1600);
  }

  function getInitiales(name: string) {
    const p = (name || "?").trim().split(" ");
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : (name || "??").substring(0, 2).toUpperCase();
  }

  function getCatColor(cat: string) {
    const c = (cat || "").toLowerCase();
    if (c.includes("sant")) return "#1a5c8a";
    if (c.includes("educ") || c.includes("scol") || c.includes("univ")) return "#6a3d9a";
    if (c.includes("just") || c.includes("tribu")) return "#8b1a1a";
    if (c.includes("finan") || c.includes("banq") || c.includes("micro")) return "#2d6b2d";
    if (c.includes("social") || c.includes("aide")) return "#8a6a1a";
    return GREEN;
  }

  const total = institutions.length;
  const actifs = institutions.filter((i) => i.statut === "actif").length;
  const verifie = institutions.filter((i) => i.badge_verifie).length;
  const nbCats = new Set(institutions.map((i) => i.category).filter(Boolean)).size;

  return (
    <div style={{ fontFamily: "sans-serif", background: "#f7f8f6", minHeight: "100vh" }}>

      {/* TOPBAR */}
      <div style={{
        background: GREEN,
        padding: "0 1.25rem",
        height: 54,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: "#F5A623",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <YelenSunIcon size={22} />
          </div>
          <div>
            <div style={{ color: "white", fontSize: 15, fontWeight: 700 }}>Yelen</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>QR Codes Institutions</div>
          </div>
        </div>
        <button
          onClick={loadInstitutions}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "white", padding: "6px 14px",
            borderRadius: 8, fontSize: 12, cursor: "pointer",
          }}
        >
          Actualiser
        </button>
      </div>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "1rem" }}>

        {/* TITRE */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem" }}>
          <div style={{
            width: 40, height: 40, background: "#e6f4ed", borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 28, height: 28, background: "#F5A623", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <YelenSunIcon size={18} />
            </div>
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#1a1f18" }}>QR Codes Institutions</h1>
            <p style={{ fontSize: 11, color: "#6b7a67", margin: 0 }}>
              Scannez pour ouvrir le profil — logo Yelen au centre
            </p>
          </div>
        </div>

        {/* STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: "1rem" }}>
          {[
            { val: total, lab: "Total" },
            { val: actifs, lab: "Actives" },
            { val: verifie, lab: "Verifiees" },
            { val: nbCats, lab: "Categories" },
          ].map((s) => (
            <div key={s.lab} style={{ background: "white", border: "1px solid #e4e8e3", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: GREEN }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "#6b7a67", marginTop: 1 }}>{s.lab}</div>
            </div>
          ))}
        </div>

        {/* TOOLBAR */}
        <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={{
              flex: 1, minWidth: 140,
              padding: "8px 12px",
              border: "1px solid #e4e8e3", borderRadius: 9,
              fontSize: 13, outline: "none",
              background: "white", color: "#1a1f18",
            }}
          />
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            style={{ padding: "8px 8px", border: "1px solid #e4e8e3", borderRadius: 9, fontSize: 11, background: "white", color: "#1a1f18" }}>
            <option value="">Toutes</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)}
            style={{ padding: "8px 8px", border: "1px solid #e4e8e3", borderRadius: 9, fontSize: 11, background: "white", color: "#1a1f18" }}>
            <option value="">Statuts</option>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
            <option value="suspendu">Suspendu</option>
          </select>
          <div style={{ background: "#e6f4ed", color: GREEN, padding: "7px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600 }}>
            {filtered.length}
          </div>
        </div>

        {/* LOADING */}
        {loading && (
          <div className="qr-grid">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} style={{ height: 320, borderRadius: 14, background: "#e8ece7" }} className="skeleton" />
            ))}
          </div>
        )}

        {/* GRILLE */}
        {!loading && (
          <div className="qr-grid">
            {filtered.map((inst) => (
              <div
                key={inst.id}
                style={{
                  background: "white",
                  border: "1px solid #e4e8e3",
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                }}
              >
                {/* HEADER */}
                <div style={{
                  background: getCatColor(inst.category),
                  padding: "11px 11px 8px",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 12,
                    color: getCatColor(inst.category),
                    overflow: "hidden", flexShrink: 0,
                  }}>
                    {inst.logo
                      ? <img src={inst.logo} alt={inst.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : getInitiales(inst.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "white", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {inst.name}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 1 }}>
                      {inst.category}
                    </div>
                  </div>
                  {inst.badge_verifie && (
                    <div style={{
                      width: 17, height: 17, background: "#F5A623",
                      borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, color: "white", flexShrink: 0, fontWeight: 700,
                    }}>V</div>
                  )}
                </div>

                {/* QR */}
                <div style={{ padding: "10px 10px 6px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: "100%",
                    maxWidth: 150,
                    aspectRatio: "1/1",
                    border: "1.5px solid #e4e8e3",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "white",
                  }}>
                    {qrMap[inst.id]
                      ? <img src={qrMap[inst.id]} alt="QR" style={{ width: "100%", height: "100%", display: "block" }} />
                      : <div style={{ width: "100%", height: "100%", background: "#f8f9f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div className="spinner" />
                        </div>
                    }
                  </div>
                  <div style={{ fontSize: 7.5, color: "#b0bba9", marginTop: 4, textAlign: "center", wordBreak: "break-all" }}>
                    yelen.app/institution/{inst.id.substring(0, 8)}...
                  </div>
                </div>

                {/* INFOS */}
                <div style={{ padding: "0 10px 6px" }}>
                  {inst.ville && (
                    <div style={{ fontSize: 9.5, color: "#6b7a67", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inst.ville}{inst.adresse ? " · " + inst.adresse : ""}
                    </div>
                  )}
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 8px", borderRadius: 20, fontSize: 9.5, fontWeight: 600,
                    background: inst.statut === "actif" ? "#e6f4ed" : "#fde8e8",
                    color: inst.statut === "actif" ? GREEN : "#c0392b",
                  }}>
                    {inst.statut || "inconnu"}
                  </span>
                </div>

                {/* ACTIONS */}
                <div style={{ display: "flex", gap: 4, padding: "6px 8px 10px", borderTop: "1px solid #f0f2ef" }}>
                  <button
                    onClick={() => openModal(inst)}
                    style={{ flex: 1, padding: "7px 2px", background: GREEN, color: "white", border: "none", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >
                    Imprimer
                  </button>
                  <button
                    onClick={() => downloadQR(inst)}
                    style={{ flex: 1, padding: "7px 2px", background: "#e6f4ed", color: GREEN, border: "none", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >
                    PNG
                  </button>
                  <button
                    onClick={() => copyURL(inst)}
                    style={{ flex: 1, padding: "7px 2px", background: "#fffbef", color: "#c8972a", border: "none", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >
                    {copied === inst.id ? "OK!" : "URL"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: "#9aab96" }}>
            <div style={{ width: 50, height: 50, background: "#F5A623", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <YelenSunIcon size={30} />
            </div>
            <p>Aucune institution trouvee</p>
          </div>
        )}
      </div>

      {/* MODAL */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: 18, width: 380, maxWidth: "100%", maxHeight: "90vh", overflow: "auto" }}
          >
            <div style={{ background: GREEN, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, background: "#F5A623", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <YelenSunIcon size={16} />
                </div>
                <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>{modal.name}</span>
              </div>
              <button
                onClick={() => setModal(null)}
                style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
              >
                X
              </button>
            </div>

            <div style={{ padding: 18 }}>
              <div
                id="print-area"
                style={{ border: "2px solid #e4e8e3", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}
              >
                <div style={{ width: 54, height: 54, borderRadius: 12, background: "#e6f4ed", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 20, color: GREEN, marginBottom: 10, overflow: "hidden" }}>
                  {modal.logo
                    ? <img src={modal.logo} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} alt="" />
                    : getInitiales(modal.name)}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, textAlign: "center", marginBottom: 2 }}>{modal.name}</div>
                <div style={{ fontSize: 11, color: "#6b7a67", marginBottom: 14, textAlign: "center" }}>{modal.category}</div>

                <div style={{ width: 220, height: 220, borderRadius: 12, overflow: "hidden", border: "1.5px solid #e4e8e3", marginBottom: 12 }}>
                  {modalQr
                    ? <img src={modalQr} alt="QR" style={{ width: "100%", height: "100%", display: "block" }} />
                    : <div style={{ width: "100%", height: "100%", background: "#f8f9f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div className="spinner" />
                      </div>
                  }
                </div>

                <div style={{ fontSize: 11, color: "#6b7a67", textAlign: "center", lineHeight: 1.6 }}>
                  Scannez pour acceder au profil
                  <br />
                  App Yelen ou site web
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, padding: "5px 12px", background: "#f7f8f6", borderRadius: 20 }}>
                  <div style={{ width: 18, height: 18, background: "#F5A623", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <YelenSunIcon size={11} />
                  </div>
                  <span style={{ fontSize: 10, color: "#6b7a67", fontWeight: 500 }}>Propulse par Yelen224</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => window.print()}
                  style={{ flex: 1, padding: "10px 4px", background: GREEN, color: "white", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Imprimer
                </button>
                <button onClick={() => modal && downloadQR(modal)}
                  style={{ flex: 1, padding: "10px 4px", background: "#e6f4ed", color: GREEN, border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  PNG HD
                </button>
                <button onClick={() => { modal && copyURL(modal); }}
                  style={{ flex: 1, padding: "10px 4px", background: "#fffbef", color: "#c8972a", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Copier URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .qr-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.8rem;
        }
        @media (min-width: 640px) {
          .qr-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 960px) {
          .qr-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .skeleton { animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
        .spinner {
          width: 20px; height: 20px;
          border: 2px solid #e0e0e0;
          border-top-color: #0e6e45;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          body > *:not(#print-area) { display: none !important; }
          #print-area { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; border: none !important; }
        }
      `}</style>
    </div>
  );
}