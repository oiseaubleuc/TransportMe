import { useState, useEffect, useMemo } from "react";
import "./transportme-theme.css";

const O = 15,
  P2 = 25,
  S = 20;
const PR = [
  { id: "houdaifa", n: "Houdaifa", i: "H" },
  { id: "amine", n: "Amine", i: "A" },
  { id: "frederik", n: "Frederik", i: "F" },
];
const DR = ["Houdaifa", "Amine", "Frederik", "Student 1"],
  CA = ["Audi A3 (2-HKN-136)", "BMW Serie 1 (2-GGW-635)"];
const RT = [
  ["UZ Brussel", "UZ Leuven", 26],
  ["UZ Brussel", "UZA Edegem", 48],
  ["UZ Brussel", "AZ Deurne", 52],
  ["UZ Brussel", "AZ Herentals", 60],
  ["UZ Brussel", "RKV Mechelen", 33],
  ["UZ Brussel", "AZ Gent", 60],
  ["UZ Brussel", "ZOL Genk", 85],
  ["UZ Brussel", "AZ Turnhout", 72],
  ["UZ Brussel", "Virga Jesse", 72],
  ["RKV Mechelen", "AZ Gent", 65],
  ["RKV Mechelen", "ZOL Genk", 60],
  ["RKV Mechelen", "UZ Leuven", 30],
  ["RKV Mechelen", "UZ Brussel", 33],
  ["RKV Mechelen", "Jessa Hasselt", 52],
  ["UZ Leuven", "UZ Brussel", 26],
  ["UZ Leuven", "UZA Edegem", 65],
  ["UZ Leuven", "AZ Diest", 28],
];

const td = () => new Date().toISOString().slice(0, 10);
const ui = () => Date.now() + "" + Math.random().toString(36).slice(2, 5);
const E = n => "€" + Number(n).toFixed(2).replace(".", ",");
const isN = t => {
  if (!t) return false;
  const h = +String(t).split(":")[0];
  return h >= 20 || h < 6;
};
const VG = (k, t) => {
  const s = Math.ceil(k / S) * P2;
  return Math.round((O + (isN(t) ? s * 1.3 : s)) * 100) / 100;
};
const wk = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const y = d.getDay();
  d.setDate(d.getDate() - (y === 0 ? 6 : y - 1));
  const e = new Date(d);
  e.setDate(d.getDate() + 6);
  return [d.toISOString().slice(0, 10), e.toISOString().slice(0, 10)];
};
const mo = () => {
  const d = new Date();
  return [
    new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10),
    new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10),
  ];
};
const iR = (d, s, e) => d >= s && d <= e;
const gr = p => (p === "day" ? [td(), td()] : p === "week" ? wk() : mo());

function normData(x) {
  const o = x && typeof x === "object" ? x : {};
  return { r: o.r || [], b: o.b || [], o: o.o || [] };
}
const ld = p => {
  try {
    return normData(JSON.parse(localStorage.getItem("t_" + p) || "null"));
  } catch {
    return { r: [], b: [], o: [] };
  }
};
const sv = (p, d) => localStorage.setItem("t_" + p, JSON.stringify(d));

function Badge({ s }) {
  const m = {
    komend: ["Gepland", "b-k"],
    lopend: ["Onderweg", "b-l"],
    voltooid: ["Voltooid", "b-v"],
    geannuleerd: ["Geannuleerd", "b-g"],
  };
  const [l, c] = m[s] || m.voltooid;
  return <span className={"badge " + c}>{l}</span>;
}

function PP({ v, set }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
      {[
        ["day", "Dag"],
        ["week", "Week"],
        ["month", "Maand"],
      ].map(([k, l]) => (
        <button key={k} type="button" className={"btn " + (v === k ? "btn-p" : "btn-o")} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function statCard(label, value, color, sub) {
  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <div className="sc-l">{label}</div>
      <div className="sc-v" style={{ color }}>
        {value}
      </div>
      {sub && <div className="sc-s">{sub}</div>}
    </div>
  );
}

function TripCard({ r, onAct }) {
  const bc = r.s === "komend" ? "cl-a" : r.s === "lopend" ? "cl-g" : r.s === "geannuleerd" ? "cl-r" : "cl-v";
  return (
    <div className={"card card-l " + bc} style={{ opacity: r.s === "geannuleerd" ? 0.45 : 1, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {r.f} → {r.t}
        </span>
        <Badge s={r.s} />
      </div>
      <div className="tm-trip-meta">
        {r.d}
        {r.ti && " · " + r.ti} · {r.k} km · <strong className="acc">{E(r.v)}</strong>
      </div>
      {isN(r.ti) && r.s !== "geannuleerd" && (
        <div style={{ fontSize: 11, color: "var(--am)", marginBottom: 2 }}>Nachttarief +30%</div>
      )}
      {r.dr && (
        <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 6 }}>
          {r.dr} · {r.ca}
        </div>
      )}
      {(r.pr || r.wc || r.deur || r.bag) && (
        <div className="tm-rdw">
          {r.pr && (
            <span className="tm-rd">
              {r.pr === "kritiek" ? "Kritiek" : r.pr === "dringend" ? "Dringend" : "Normaal"}
            </span>
          )}
          {r.wc && <span className="tm-rd">Rolstoel</span>}
          {r.deur && <span className="tm-rd">Deur</span>}
          {r.bag && <span className="tm-rd">Bagage</span>}
        </div>
      )}
      {(r.pc || r.tel || r.nt) && (
        <div className="tm-rnt">
          {r.pc && <small>Contact: {r.pc}</small>}
          {r.tel && <small>Tel: {r.tel}</small>}
          {r.nt && <small>Notitie: {r.nt}</small>}
        </div>
      )}
      {onAct && (
        <div className="tm-trip-actions">
          {r.s === "komend" && (
            <>
              <button type="button" className="btn btn-p" onClick={() => onAct(r.id, "go")}>
                ▶ Start
              </button>
              <button type="button" className="btn btn-s" onClick={() => onAct(r.id, "ok")}>
                ✓ Klaar
              </button>
              <button type="button" className="btn btn-gh" onClick={() => onAct(r.id, "no")}>
                Annuleer
              </button>
            </>
          )}
          {r.s === "lopend" && (
            <>
              <button type="button" className="btn btn-g" onClick={() => onAct(r.id, "ok")}>
                ✓ Klaar
              </button>
              <button type="button" className="btn btn-gh" onClick={() => onAct(r.id, "no")}>
                Annuleer
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-gh"
            style={{ color: "var(--rd)", marginLeft: "auto" }}
            onClick={() => onAct(r.id, "x")}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function Home({ D, pr, onPlanRit }) {
  const [p, sP] = useState("week");
  const [s, e] = gr(p);
  const vl = D.r.filter(r => r.s === "voltooid" && iR(r.d, s, e));
  const om = vl.reduce((a, r) => a + r.v, 0);
  const km = vl.reduce((a, r) => a + r.k, 0);
  const fc = D.b.filter(b => iR(b.d, s, e)).reduce((a, b) => a + b.a, 0);
  const oc = (D.o || []).filter(x => iR(x.d, s, e)).reduce((a, x) => a + x.a, 0);
  const kosten = fc + oc;
  const up = D.r
    .filter(r => r.s === "komend" || r.s === "lopend")
    .sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || "")));

  return (
    <div>
      <div className="tm-welcome-sub">Welkom terug,</div>
      <div className="tm-welcome-name">{pr.n}</div>
      <PP v={p} set={sP} />
      <div className="tm-kpi-row">
        <div className="kpi">
          <div className="kpi-l">Omzet</div>
          <div className="kpi-v" style={{ color: "var(--acc)" }}>
            {E(om)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Netto</div>
          <div className="kpi-v" style={{ color: "var(--gn)" }}>
            {E(om - kosten)}
          </div>
        </div>
      </div>
      <div className="tm-kpi-row" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-l">Kosten</div>
          <div className="kpi-v" style={{ color: "var(--rd)" }}>
            {E(kosten)}
          </div>
          <div className="kpi-s">Brandstof: {E(fc)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Ritten</div>
          <div className="kpi-v">{vl.length}</div>
          <div className="kpi-s">{km} km totaal</div>
        </div>
      </div>
      <button type="button" className="btn btn-p btn-full" style={{ marginBottom: 20 }} onClick={onPlanRit}>
        Rit plannen
      </button>
      {up.length > 0 && (
        <>
          <div className="sh">
            Komende ritten <span className="sh-c">{up.length}</span>
          </div>
          {up.slice(0, 5).map(r => (
            <TripCard key={r.id} r={r} />
          ))}
        </>
      )}
    </div>
  );
}

function Ritten({ D, sD, pid }) {
  const [fl, sF] = useState("alle");
  const [sh, sSh] = useState(false);
  const [st, sSt] = useState(1);
  const ini = {
    ri: -1,
    f: "",
    t: "",
    k: "",
    d: td(),
    ti: "",
    dr: DR[0],
    ca: CA[0],
    s: "komend",
    pr: "normaal",
    pc: "",
    tel: "",
    wc: false,
    deur: false,
    bag: false,
    nt: "",
  };
  const [fm, sM] = useState(ini);
  const pk = (f, t, k, i) => sM(m => ({ ...m, ri: i, f, t, k: "" + k }));
  const svR = () => {
    if (!fm.f || !fm.t || !fm.k) return;
    const k = +fm.k;
    const nd = {
      ...D,
      r: [
        ...D.r,
        {
          id: ui(),
          d: fm.d,
          ti: fm.ti,
          f: fm.f,
          t: fm.t,
          k,
          dr: fm.dr,
          ca: fm.ca,
          s: fm.s,
          v: VG(k, fm.ti),
          pr: fm.pr,
          pc: fm.pc,
          tel: fm.tel,
          wc: fm.wc,
          deur: fm.deur,
          bag: fm.bag,
          nt: fm.nt,
        },
      ],
    };
    sD(nd);
    sv(pid, nd);
    sM(ini);
    sSh(false);
  };
  const canStep1 = !!(fm.f && fm.t && fm.k && +fm.k > 0);
  const openNieuw = () => {
    sM(ini);
    sSt(1);
    sSh(true);
  };
  const act = (id, a) => {
    const rr = [...D.r];
    const i = rr.findIndex(x => x.id === id);
    if (i < 0) return;
    if (a === "go") rr[i] = { ...rr[i], s: "lopend" };
    else if (a === "ok") rr[i] = { ...rr[i], s: "voltooid" };
    else if (a === "no") rr[i] = { ...rr[i], s: "geannuleerd" };
    else rr.splice(i, 1);
    const nd = { ...D, r: rr };
    sD(nd);
    sv(pid, nd);
  };
  const cnt = useMemo(() => {
    const c = { alle: D.r.length, komend: 0, lopend: 0, voltooid: 0, geannuleerd: 0 };
    D.r.forEach(r => {
      if (c[r.s] != null) c[r.s]++;
    });
    return c;
  }, [D.r]);
  const ls = useMemo(() => {
    let r = D.r;
    if (fl !== "alle") r = r.filter(x => x.s === fl);
    return r.sort((a, b) => (b.d + (b.ti || "")).localeCompare(a.d + (a.ti || "")));
  }, [D.r, fl]);

  return (
    <div>
      <div className="tm-bar">
        <h1>Mijn ritten</h1>
        <button type="button" className="btn btn-p btn-pill" onClick={openNieuw}>
          + Nieuw
        </button>
      </div>
      <div className="tm-sg2">
        {[
          ["komend", "Gepland"],
          ["lopend", "Onderweg"],
          ["voltooid", "Voltooid"],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={"tm-si" + (fl === k ? " on" : "")}
            onClick={() => sF(f => (f === k ? "alle" : k))}
          >
            <b>{cnt[k]}</b>
            <small>{l}</small>
          </button>
        ))}
      </div>
      <div className="tm-cg">
        {["alle", "komend", "lopend", "voltooid", "geannuleerd"].map(f => (
          <button key={f} type="button" className={"tm-ci" + (fl === f ? " on" : "")} onClick={() => sF(f)}>
            {f === "alle" ? "Alle" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {ls.length === 0 && <p className="tm-em">Nog geen ritten.</p>}
      {ls.map(r => (
        <TripCard key={r.id} r={r} onAct={act} />
      ))}

      {sh && (
        <div className="tm-ov" onClick={e => e.target === e.currentTarget && sSh(false)}>
          <div className="tm-mo" onClick={e => e.stopPropagation()}>
            <div className="tm-mh">
              <h2>Nieuwe rit</h2>
              <button type="button" className="btn btn-gh" onClick={() => sSh(false)}>
                ✕
              </button>
            </div>
            <div className="tm-mb">
              <div className="tm-sg">
                {[1, 2, 3].map(n => (
                  <button
                    type="button"
                    key={n}
                    className={"tm-stb" + (st === n ? " on" : "") + (st > n ? " done" : "")}
                    onClick={() => sSt(n)}
                  >
                    {n === 1 ? "Route" : n === 2 ? "Details" : "Bevestig"}
                  </button>
                ))}
              </div>
              {st === 1 && (
                <>
                  <div className="fl">Vaste route</div>
                  <div className="tm-prs">
                    {RT.map(([f, t, k], i) => (
                      <button
                        key={i}
                        type="button"
                        className={"tm-pr" + (fm.ri === i ? " on" : "")}
                        onClick={() => pk(f, t, k, i)}
                      >
                        <span>
                          {f} → {t}
                        </span>
                        <b className="tm-pk">{k} km</b>
                      </button>
                    ))}
                  </div>
                  <div className="fl" style={{ marginTop: 10 }}>
                    Of handmatig
                  </div>
                  <div className="tm-g2">
                    <div className="tm-fg">
                      <label className="fl">Van</label>
                      <input value={fm.f} onChange={e => sM(m => ({ ...m, f: e.target.value }))} />
                    </div>
                    <div className="tm-fg">
                      <label className="fl">Naar</label>
                      <input value={fm.t} onChange={e => sM(m => ({ ...m, t: e.target.value }))} />
                    </div>
                  </div>
                  <div className="tm-g3">
                    <div className="tm-fg">
                      <label className="fl">Datum</label>
                      <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
                    </div>
                    <div className="tm-fg">
                      <label className="fl">Tijd</label>
                      <input type="time" value={fm.ti} onChange={e => sM(m => ({ ...m, ti: e.target.value }))} />
                    </div>
                    <div className="tm-fg">
                      <label className="fl">Km</label>
                      <input type="number" value={fm.k} onChange={e => sM(m => ({ ...m, k: e.target.value }))} />
                    </div>
                  </div>
                  {fm.k && +fm.k > 0 && (
                    <div
                      className="card"
                      style={{ marginTop: 10, padding: 12, background: "var(--s2)", marginBottom: 10 }}
                    >
                      Vergoeding:{" "}
                      <b style={{ fontSize: 18, color: "var(--acc)" }}>{E(VG(+fm.k, fm.ti))}</b>
                      {isN(fm.ti) && <span style={{ fontSize: 12, color: "var(--am)" }}> +30% nacht</span>}
                    </div>
                  )}
                </>
              )}
              {st === 2 && (
                <>
                  <div className="tm-g2">
                    <div className="tm-fg">
                      <label className="fl">Contactpersoon (pickup)</label>
                      <input value={fm.pc} placeholder="Naam" onChange={e => sM(m => ({ ...m, pc: e.target.value }))} />
                    </div>
                    <div className="tm-fg">
                      <label className="fl">Telefoon</label>
                      <input value={fm.tel} placeholder="+32…" onChange={e => sM(m => ({ ...m, tel: e.target.value }))} />
                    </div>
                  </div>
                  <div className="tm-fg">
                    <label className="fl">Prioriteit</label>
                    <div className="tm-cg">
                      {["normaal", "dringend", "kritiek"].map(x => (
                        <button
                          type="button"
                          key={x}
                          className={"tm-ci" + (fm.pr === x ? " on" : "")}
                          onClick={() => sM(m => ({ ...m, pr: x }))}
                        >
                          {x[0].toUpperCase() + x.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="tm-as">
                    <input type="checkbox" checked={fm.wc} onChange={e => sM(m => ({ ...m, wc: e.target.checked }))} />{" "}
                    Rolstoeltoegankelijk
                  </label>
                  <label className="tm-as">
                    <input type="checkbox" checked={fm.deur} onChange={e => sM(m => ({ ...m, deur: e.target.checked }))} />{" "}
                    Deur-tot-deur assistentie
                  </label>
                  <label className="tm-as">
                    <input type="checkbox" checked={fm.bag} onChange={e => sM(m => ({ ...m, bag: e.target.checked }))} />{" "}
                    Extra bagage / materiaal
                  </label>
                  <div className="tm-fg">
                    <label className="fl">Notities voor chauffeur</label>
                    <textarea
                      value={fm.nt}
                      placeholder="Bijv. bel aan hoofdingang…"
                      onChange={e => sM(m => ({ ...m, nt: e.target.value }))}
                    />
                  </div>
                  <div className="tm-g2">
                    <div className="tm-fg">
                      <label className="fl">Chauffeur</label>
                      <select value={fm.dr} onChange={e => sM(m => ({ ...m, dr: e.target.value }))}>
                        {DR.map(d => (
                          <option key={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="tm-fg">
                      <label className="fl">Voertuig</label>
                      <select value={fm.ca} onChange={e => sM(m => ({ ...m, ca: e.target.value }))}>
                        {CA.map(c => (
                          <option key={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}
              {st === 3 && (
                <div className="tm-rv">
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Controleer je rit</div>
                  <div className="tm-rvi">
                    <span>Route</span>
                    <b>
                      {fm.f || "—"} → {fm.t || "—"}
                    </b>
                  </div>
                  <div className="tm-rvi">
                    <span>Datum/tijd</span>
                    <b>
                      {fm.d || "—"}
                      {fm.ti ? " · " + fm.ti : ""}
                    </b>
                  </div>
                  <div className="tm-rvi">
                    <span>Afstand</span>
                    <b>{fm.k || "0"} km</b>
                  </div>
                  <div className="tm-rvi">
                    <span>Vergoeding</span>
                    <b>{fm.k && +fm.k > 0 ? E(VG(+fm.k, fm.ti)) : "—"}</b>
                  </div>
                  <div className="tm-rvi">
                    <span>Prioriteit</span>
                    <b>{fm.pr}</b>
                  </div>
                  <div className="tm-rvi">
                    <span>Contact</span>
                    <b>
                      {fm.pc || "—"}
                      {fm.tel ? " · " + fm.tel : ""}
                    </b>
                  </div>
                  <div className="tm-rvi">
                    <span>Assistentie</span>
                    <b>{[fm.wc && "Rolstoel", fm.deur && "Deur", fm.bag && "Bagage"].filter(Boolean).join(", ") || "Geen"}</b>
                  </div>
                  {fm.nt && (
                    <div className="tm-rvi">
                      <span>Notitie</span>
                      <b>{fm.nt}</b>
                    </div>
                  )}
                </div>
              )}
              <div className="tm-mfa">
                {st > 1 && (
                  <button type="button" className="btn btn-o" onClick={() => sSt(st - 1)}>
                    ← Vorige
                  </button>
                )}
                {st < 3 ? (
                  <button type="button" className="btn btn-p" onClick={() => sSt(st + 1)} disabled={st === 1 && !canStep1}>
                    Volgende →
                  </button>
                ) : (
                  <button type="button" className="btn btn-p" onClick={svR} disabled={!canStep1}>
                    Rit bevestigen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Financieel({ D }) {
  const [p, sP] = useState("month");
  const [s, e] = gr(p);
  const all = D.r;
  const done = all.filter(r => r.s === "voltooid" && iR(r.d, s, e));
  const cancelled = all.filter(r => r.s === "geannuleerd" && iR(r.d, s, e));
  const omzet = done.reduce((a, r) => a + r.v, 0);
  const totKm = done.reduce((a, r) => a + r.k, 0);
  const brandstof = D.b.filter(b => iR(b.d, s, e)).reduce((a, b) => a + b.a, 0);
  const overig = (D.o || []).filter(x => iR(x.d, s, e)).reduce((a, x) => a + x.a, 0);
  const kosten = brandstof + overig;
  const winst = omzet - kosten;
  const verlies = cancelled.reduce((a, r) => a + (r.v || 0), 0);
  const nachtRitten = done.filter(r => isN(r.ti));
  const nachtOmzet = nachtRitten.reduce((a, r) => a + r.v, 0);
  const gemPerRit = done.length > 0 ? Math.round((omzet / done.length) * 100) / 100 : 0;
  const gemKmPerRit = done.length > 0 ? Math.round(totKm / done.length) : 0;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Financieel overzicht</h1>
      <PP v={p} set={sP} />

      <div className="sh">Resultaat</div>
      <div className="stat-grid">
        {statCard("Totale omzet", E(omzet), "var(--acc)", done.length + " voltooide ritten")}
        {statCard("Totale kosten", "− " + E(kosten), "var(--rd)", "Brandstof + overig")}
        {statCard("Netto winst", E(winst), winst >= 0 ? "var(--gn)" : "var(--rd)", omzet > 0 ? Math.round((winst / omzet) * 100) + "% marge" : "")}
        {statCard("Gemist (annulering)", E(verlies), "var(--am)", cancelled.length + " geannuleerde ritten")}
      </div>

      <div className="sh" style={{ marginTop: 8 }}>
        Ritten analyse
      </div>
      <div className="stat-grid">
        {statCard("Voltooide ritten", "" + done.length, "var(--acc)", totKm + " km totaal")}
        {statCard("Gemiddeld per rit", E(gemPerRit), "var(--tx)", gemKmPerRit + " km gemiddeld")}
        {statCard(
          "Nachtpremies",
          "" + nachtRitten.length,
          "var(--am)",
          nachtRitten.length > 0 ? E(nachtOmzet) + " nachttarief" : "Geen nachtritten"
        )}
        {statCard("Totale kilometers", totKm + " km", "var(--tx2)", done.length > 0 ? gemKmPerRit + " km/rit" : "")}
      </div>

      <div className="sh" style={{ marginTop: 8 }}>
        Kosten details
      </div>
      <div className="stat-grid">
        {statCard("Brandstof", "− " + E(brandstof), "var(--rd)", D.b.length + " tankbeurten")}
        {statCard("Overige kosten", "− " + E(overig), "var(--rd)", (D.o || []).length + " posten")}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="sh">Laatste ritten</div>
          {[...done].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 10).map(r => (
            <div key={r.id} className="tm-f-row">
              <span className="tm-f-date">{r.d}</span>
              <span className="tm-f-route">
                {r.f} → {r.t}
              </span>
              {isN(r.ti) && (
                <span style={{ fontSize: 11, color: "var(--am)", marginRight: 8 }}>
                  NACHT
                </span>
              )}
              <span className="tm-f-km">{r.k} km</span>
              <span className="tm-f-eur">{E(r.v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kosten({ D, sD, pid }) {
  const [type, sT] = useState("brandstof");
  const [fm, sM] = useState({ d: td(), l: "", p: "", a: "", desc: "" });
  useEffect(() => {
    if (fm.l && fm.p) sM(m => ({ ...m, a: (parseFloat(fm.l) * parseFloat(fm.p)).toFixed(2) }));
  }, [fm.l, fm.p]);

  const saveFuel = () => {
    if (!fm.a) return;
    const nd = { ...D, b: [...D.b, { id: ui(), d: fm.d, l: +fm.l || 0, p: +fm.p || 0, a: +fm.a || 0 }] };
    sD(nd);
    sv(pid, nd);
    sM({ d: td(), l: "", p: "", a: "", desc: "" });
  };
  const saveOverig = () => {
    if (!fm.a || !fm.desc) return;
    const o = D.o || [];
    const nd = { ...D, o: [...o, { id: ui(), d: fm.d, a: +fm.a || 0, desc: fm.desc.trim() }] };
    sD(nd);
    sv(pid, nd);
    sM({ d: td(), l: "", p: "", a: "", desc: "" });
  };
  const delF = id => {
    const nd = { ...D, b: D.b.filter(f => f.id !== id) };
    sD(nd);
    sv(pid, nd);
  };
  const delO = id => {
    const nd = { ...D, o: (D.o || []).filter(x => x.id !== id) };
    sD(nd);
    sv(pid, nd);
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Kosten registreren</h1>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button type="button" className={"btn " + (type === "brandstof" ? "btn-p" : "btn-o")} onClick={() => sT("brandstof")}>
          Brandstof
        </button>
        <button type="button" className={"btn " + (type === "overig" ? "btn-p" : "btn-o")} onClick={() => sT("overig")}>
          Overige kosten
        </button>
      </div>

      {type === "brandstof" && (
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Tankbeurt registreren</div>
          <div className="tm-g3">
            <div className="tm-fg">
              <label className="fl">Datum</label>
              <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
            </div>
            <div className="tm-fg">
              <label className="fl">Liter</label>
              <input type="number" step="0.01" value={fm.l} onChange={e => sM(m => ({ ...m, l: e.target.value }))} />
            </div>
            <div className="tm-fg">
              <label className="fl">€/L</label>
              <input type="number" step="0.001" value={fm.p} onChange={e => sM(m => ({ ...m, p: e.target.value }))} />
            </div>
          </div>
          <div className="tm-fg">
            <label className="fl">Totaal</label>
            <input type="number" step="0.01" value={fm.a} onChange={e => sM(m => ({ ...m, a: e.target.value }))} />
          </div>
          <button type="button" className="btn btn-p btn-full" disabled={!fm.a} onClick={saveFuel}>
            Opslaan
          </button>
        </div>
      )}

      {type === "overig" && (
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Overige kost registreren</div>
          <div className="tm-g2">
            <div className="tm-fg">
              <label className="fl">Datum</label>
              <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
            </div>
            <div className="tm-fg">
              <label className="fl">Bedrag</label>
              <input type="number" step="0.01" value={fm.a} onChange={e => sM(m => ({ ...m, a: e.target.value }))} />
            </div>
          </div>
          <div className="tm-fg">
            <label className="fl">Omschrijving</label>
            <input
              type="text"
              value={fm.desc}
              placeholder="Bv. verzekering, onderhoud…"
              onChange={e => sM(m => ({ ...m, desc: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-p btn-full" disabled={!fm.a || !fm.desc.trim()} onClick={saveOverig}>
            Opslaan
          </button>
        </div>
      )}

      <div className="sh" style={{ marginTop: 16 }}>
        Brandstof ({D.b.length})
      </div>
      {D.b.length === 0 && <p className="tm-em">Geen tankbeurten</p>}
      {[...D.b].sort((a, b) => b.d.localeCompare(a.d)).map(f => (
        <div key={f.id} className="tm-brow">
          <span style={{ fontWeight: 600, flex: 1 }}>{f.d}</span>
          <span style={{ fontWeight: 600, color: "var(--rd)" }}>{E(f.a)}</span>
          <button type="button" className="btn btn-gh" style={{ marginLeft: 8 }} onClick={() => delF(f.id)}>
            ✕
          </button>
        </div>
      ))}

      <div className="sh" style={{ marginTop: 16 }}>
        Overige kosten ({(D.o || []).length})
      </div>
      {(D.o || []).length === 0 && <p className="tm-em">Geen overige kosten</p>}
      {[...(D.o || [])].sort((a, b) => b.d.localeCompare(a.d)).map(o => (
        <div key={o.id} className="tm-brow">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{o.d}</div>
            <div style={{ fontSize: 12, color: "var(--tx3)" }}>{o.desc}</div>
          </div>
          <span style={{ fontWeight: 600, color: "var(--rd)" }}>{E(o.a)}</span>
          <button type="button" className="btn btn-gh" style={{ marginLeft: 8 }} onClick={() => delO(o.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function Meer({ D, sD, pid, sP, pr }) {
  const [v, sV] = useState("m");
  if (v !== "m")
    return (
      <div>
        <button type="button" className="btn btn-gh" style={{ marginBottom: 12 }} onClick={() => sV("m")}>
          ← Terug
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>{v === "p" ? "Profiel" : "Gegevens"}</h1>
        {v === "p" && (
          <div className="tm-pg">
            {PR.map(p => (
              <button
                key={p.id}
                type="button"
                className={"tm-pc" + (p.id === pid ? " on" : "")}
                onClick={() => sP(p.id)}
              >
                <div className="tm-pav">{p.i}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.id === pid ? "var(--acc)" : "var(--tx2)" }}>{p.n}</div>
                {p.id === pid && <div style={{ fontSize: 10, color: "var(--acc)", marginTop: 3 }}>Actief</div>}
              </button>
            ))}
          </div>
        )}
        {v === "d" && (
          <div>
            <p style={{ marginBottom: 16, color: "var(--tx2)", fontSize: 14 }}>
              {D.r.length} ritten · {D.b.length} tankbeurten · {(D.o || []).length} overige kosten
            </p>
            <button
              type="button"
              className="btn btn-o btn-full"
              style={{ marginBottom: 8 }}
              onClick={() => {
                const b = new Blob([JSON.stringify(D, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "transportme-" + pid + ".json";
                a.click();
              }}
            >
              Exporteren
            </button>
            <button
              type="button"
              className="btn btn-r btn-full"
              onClick={() => {
                if (confirm("Alle gegevens wissen?")) {
                  const n = { r: [], b: [], o: [] };
                  sD(n);
                  sv(pid, n);
                }
              }}
            >
              Alles wissen
            </button>
          </div>
        )}
      </div>
    );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Instellingen</h1>
      {[
        { k: "p", t: "Profiel", s: pr.n + " · Wissel chauffeur" },
        { k: "d", t: "Gegevens", s: "Exporteren & wissen" },
      ].map(m => (
        <button key={m.k} type="button" className="tm-mi" onClick={() => sV(m.k)}>
          <strong>{m.t}</strong>
          <small>{m.s}</small>
        </button>
      ))}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Vergoedingsregels</div>
        {[
          { l: "Opstartpremie", v: "€ 15,00" },
          { l: "Per 20 km", v: "€ 25,00" },
          { l: "Nachttoeslag (20:00–05:59)", v: "+30%" },
        ].map(r => (
          <div key={r.l} className="sep">
            <span className="lbl">{r.l}</span>
            <span className="val">{r.v}</span>
          </div>
        ))}
        <div style={{ fontSize: 14, color: "var(--acc)", fontWeight: 600, marginTop: 12 }}>
          Voorbeeld: 45 km → €15 + 3×€25 = €90
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, sT] = useState("home");
  const [pid, sP] = useState(() => localStorage.getItem("tp") || "houdaifa");
  const [D, sD] = useState(() => ld(pid));
  const pr = PR.find(p => p.id === pid) || PR[0];
  const sw = id => {
    sP(id);
    localStorage.setItem("tp", id);
    sD(ld(id));
  };
  useEffect(() => sD(ld(pid)), [pid]);

  return (
    <div className="tm-app">
      <div className="tm-main">
        {tab === "home" && (
          <Home D={D} pr={pr} onPlanRit={() => sT("ritten")} />
        )}
        {tab === "ritten" && <Ritten D={D} sD={sD} pid={pid} />}
        {tab === "fin" && <Financieel D={D} />}
        {tab === "kosten" && <Kosten D={D} sD={sD} pid={pid} />}
        {tab === "meer" && <Meer D={D} sD={sD} pid={pid} sP={sw} pr={pr} />}
      </div>
      <nav className="tm-nav" aria-label="Hoofdnavigatie">
        {[
          ["home", "Home"],
          ["ritten", "Ritten"],
          ["fin", "Financieel"],
          ["kosten", "Kosten"],
          ["meer", "Meer"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={"tm-nav-i" + (tab === id ? " on" : "")}
            onClick={() => sT(id)}
          >
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
