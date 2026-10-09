import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import {
  PR,
  CA,
  ld,
  sv,
  normData,
  applyTripAction,
  tmVergoeding,
  tmBuildMergedRoutes,
  parseLooseNumber,
  money,
  ritKmValue,
  isN,
  ui,
  nt,
  initialProfileId,
  RitMap,
  RitVergoedingUitleg,
  VoltooiBonSheet,
  Historiek,
  Kosten,
  Meer,
} from "../TransportMe.jsx";
import { getDrivingRouteKm } from "../js/ors.js";
import { getFactuurGegevens } from "../js/storage.js";
import { downloadRittenExcel, leesRittenExcel, voegExcelRittenToe, meldingExcelInlees } from "../js/rittenExcel.js";
import {
  LIJN_HEX,
  chauffeurIndex,
  lijnVar,
  chauffeurNaam,
  ritSortKey,
  minutenVan,
  geschatteDuur,
  isoPlusDagen,
  vandaagIso,
  weekStart,
  periodeBereik,
  totalen,
  somTotalen,
  euroKort,
  euro,
  dagLabel,
  datumLang,
  datumKort,
  telwoord,
  meervoud,
} from "./team.js";
import "./app.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
ChartJS.defaults.font.family = "'Overpass Variable', 'Overpass', system-ui, sans-serif";

/* ------------------------------------------------------------------ */
/* Kleine hulpmiddelen                                                 */
/* ------------------------------------------------------------------ */

function useDonker() {
  const q = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const [d, setD] = useState(() => !!q?.matches);
  useEffect(() => {
    if (!q) return;
    const f = e => setD(e.matches);
    q.addEventListener?.("change", f);
    return () => q.removeEventListener?.("change", f);
  }, []);
  return d;
}

function useNu(ms = 30000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setN(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

const TABS = [
  { id: "overzicht", label: "Overzicht" },
  { id: "planning", label: "Planning" },
  { id: "chauffeurs", label: "Chauffeurs" },
  { id: "financieel", label: "Financieel" },
  { id: "instellingen", label: "Instellingen" },
];

function tabUitHash() {
  const h = (typeof location !== "undefined" ? location.hash : "").replace("#", "");
  return TABS.some(t => t.id === h) ? h : "overzicht";
}

function Dot({ pid, size = 10 }) {
  return <span className="tm-dot" style={{ background: lijnVar(pid), width: size, height: size }} aria-hidden="true" />;
}

function Seg({ value, onChange, options, label }) {
  return (
    <div className="tm-seg" role="tablist" aria-label={label}>
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          className={"tm-seg-b" + (value === k ? " on" : "")}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ScopeChips({ value, onChange, metIedereen = true }) {
  // Eén chauffeur: kiezen heeft geen zin, behalve tussen het overzicht en zijn eigen gegevens.
  if (PR.length === 1 && !metIedereen) return null;
  return (
    <div className="tm-chips" role="radiogroup" aria-label="Chauffeur">
      {metIedereen && (
        <button
          type="button"
          role="radio"
          aria-checked={value === "team"}
          className={"tm-chip" + (value === "team" ? " on" : "")}
          onClick={() => onChange("team")}
        >
          {PR.length === 1 ? "Overzicht" : "Iedereen"}
        </button>
      )}
      {PR.map(p => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          className={"tm-chip" + (value === p.id ? " on" : "")}
          onClick={() => onChange(p.id)}
        >
          <Dot pid={p.id} />
          {p.n}
        </button>
      ))}
    </div>
  );
}

function StatusWoord({ s }) {
  const m = { komend: "Gepland", lopend: "Onderweg", voltooid: "Voltooid", geannuleerd: "Geannuleerd" };
  return <span className={"tm-st tm-st--" + s}>{m[s] || s}</span>;
}

function Logo() {
  return (
    <svg className="tm-logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="7" cy="23" r="4.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M11 20.5 L21 11.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="25" cy="9" r="4.5" fill="currentColor" />
    </svg>
  );
}

/* Navigatie-iconen (lijnstijl, zelfde dikte) */
const IC = {
  overzicht: (
    <path d="M4 17h3l3-8 4 11 3-7h3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  ),
  planning: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M9 3v4M15 3v4M8 14h3M8 17h6" />
    </g>
  ),
  chauffeurs: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M16.5 14.5c2.2.2 3.6 1.6 4 4" />
    </g>
  ),
  financieel: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M10 20V5M16 20v-7M21 20H3" />
    </g>
  ),
  instellingen: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </g>
  ),
};

/* ------------------------------------------------------------------ */
/* App                                                                  */
/* ------------------------------------------------------------------ */

export default function App() {
  const [tab, setTab] = useState(tabUitHash);
  const [all, setAll] = useState(() => Object.fromEntries(PR.map(p => [p.id, ld(p.id)])));
  const [focus, setFocus] = useState("team");
  const [instPid, setInstPid] = useState(() => initialProfileId());
  const [pending, setPending] = useState(null); // { pid, id } — rit die voltooid wordt (bon vragen)
  const [nieuw, setNieuw] = useState(null); // null | { pid }
  const mainRef = useRef(null);

  useEffect(() => {
    const f = () => setTab(tabUitHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const gaNaar = useCallback((id, scope) => {
    if (scope) setFocus(scope);
    if (location.hash.replace("#", "") !== id) location.hash = id;
    setTab(id);
    mainRef.current?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }, []);

  const setFor = useCallback((pid, upd) => {
    setAll(cur => {
      const prev = cur[pid];
      const next = typeof upd === "function" ? upd(prev) : upd;
      if (!next || next === prev) return cur;
      try {
        sv(pid, next);
      } catch {
        alert("Opslaan mislukt: de opslag van deze browser is vol.");
      }
      return { ...cur, [pid]: next };
    });
  }, []);

  const herlaad = useCallback(() => setAll(Object.fromEntries(PR.map(p => [p.id, ld(p.id)]))), []);

  const ritActie = useCallback(
    (pid, id, a) => {
      const r = all[pid]?.r.find(x => x.id === id);
      if (!r) return;
      if (a === "ok" && (r.s === "lopend" || r.s === "komend")) {
        setPending({ pid, id });
        return;
      }
      if (a === "no" || a === "x") {
        if (!confirm(`Rit ${r.f} naar ${r.t} (${datumKort(r.d)}${r.ti ? " " + r.ti : ""}) verwijderen?`)) return;
      }
      setFor(pid, D => {
        const rr = applyTripAction(D.r, id, a);
        return rr === D.r ? D : { ...D, r: rr };
      });
    },
    [all, setFor]
  );

  const pendingRit = pending ? all[pending.pid]?.r.find(r => r.id === pending.id) : null;

  const team = useMemo(() => PR.map(p => ({ ...p, D: all[p.id] })), [all]);
  const ritten = useMemo(() => team.flatMap(t => t.D.r.map(r => ({ ...r, _pid: t.id }))), [team]);

  const ctx = { all, team, ritten, setFor, ritActie, gaNaar, focus, setFocus, openNieuw: pid => setNieuw({ pid: pid || (focus !== "team" ? focus : PR[0].id) }) };

  let pagina = null;
  if (tab === "overzicht") pagina = <Overzicht {...ctx} />;
  else if (tab === "planning") pagina = <Planning {...ctx} />;
  else if (tab === "chauffeurs") pagina = <Chauffeurs {...ctx} />;
  else if (tab === "financieel") pagina = <Financieel {...ctx} />;
  else
    pagina = (
      <Instellingen
        pid={instPid}
        setPid={setInstPid}
        D={all[instPid]}
        setFor={setFor}
        onBackupImported={herlaad}
      />
    );

  return (
    <div className="tm-app">
      <nav className="tm-nav" aria-label="Hoofdmenu">
        <div className="tm-brand">
          <Logo />
          <span>TransportMe</span>
        </div>
        <div className="tm-nav-items">
          {TABS.map(t => (
            <a
              key={t.id}
              href={"#" + t.id}
              className={"tm-nav-i" + (tab === t.id ? " on" : "")}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={e => {
                e.preventDefault();
                gaNaar(t.id);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {IC[t.id]}
              </svg>
              <span>{t.label}</span>
            </a>
          ))}
        </div>
        <button type="button" className="tm-nav-cta" onClick={() => ctx.openNieuw()}>
          Nieuwe rit
        </button>
      </nav>

      <main className="tm-main" ref={mainRef}>
        <div className="tm-page" key={tab}>
          {pagina}
        </div>
      </main>

      {pendingRit ? (
        <VoltooiBonSheet
          key={pending.id}
          rit={pendingRit}
          onBevestig={bon => {
            const { pid, id } = pending;
            setPending(null);
            setFor(pid, D => {
              const rr = applyTripAction(D.r, id, "ok", { bon });
              return rr === D.r ? D : { ...D, r: rr };
            });
          }}
          onAnnuleer={() => setPending(null)}
        />
      ) : null}

      {nieuw ? (
        <NieuweRitSheet
          all={all}
          startPid={nieuw.pid}
          onClose={() => setNieuw(null)}
          onSave={(pid, trip) => {
            setFor(pid, D => normData({ ...D, r: [...D.r, trip] }));
            setNieuw(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overzicht                                                            */
/* ------------------------------------------------------------------ */

function Overzicht({ team, ritten, ritActie, gaNaar, openNieuw }) {
  const nu = useNu();
  const vandaag = vandaagIso();
  const [dag, setDag] = useState(vandaag);

  const lopend = ritten.filter(r => r.s === "lopend").sort((a, b) => ritSortKey(a).localeCompare(ritSortKey(b)));
  const komendVandaag = ritten.filter(r => r.s === "komend" && r.d === vandaag);
  const straks = ritten
    .filter(r => r.s === "komend" && r.d >= vandaag)
    .sort((a, b) => ritSortKey(a).localeCompare(ritSortKey(b)))
    .slice(0, 5);

  const rijdend = new Set(lopend.filter(r => r.d >= isoPlusDagen(vandaag, -1)).map(r => r._pid)).size;
  const zin =
    PR.length === 1
      ? `${PR[0].n} ${rijdend ? "rijdt nu" : "rijdt nu niet"}, ${
          komendVandaag.length === 0
            ? "er staat vandaag niets meer gepland."
            : `nog ${meervoud(komendVandaag.length, "rit", "ritten")} gepland vandaag.`
        }`
      : rijdend === 0 && komendVandaag.length === 0
      ? "Niemand rijdt nu en er staat vandaag niets meer gepland."
      : `${rijdend === 0 ? "Niemand rijdt nu" : `${cap(telwoord(rijdend))} van ${telwoord(PR.length)} chauffeurs ${rijdend === 1 ? "rijdt" : "rijden"} nu`}, ${
          komendVandaag.length === 0
            ? "er staat vandaag niets meer gepland."
            : `nog ${meervoud(komendVandaag.length, "rit", "ritten")} gepland vandaag.`
        }`;

  const [ws] = periodeBereik("week");
  const we = isoPlusDagen(ws, 6);
  const weekTot = somTotalen(team.map(t => totalen(t.D, ws, we)));

  const verlopen = ritten
    .filter(r => (r.s === "komend" || r.s === "lopend") && r.d < vandaag)
    .sort((a, b) => ritSortKey(a).localeCompare(ritSortKey(b)));
  const [ms, me] = periodeBereik("maand");
  const zonderBon = ritten.filter(r => r.s === "voltooid" && r.d >= ms && r.d <= me && !String(r.bon || "").trim());

  return (
    <>
      <header className="tm-ph">
        <div>
          <h1>{datumLang(vandaag)}</h1>
          <p className="tm-ph-sub">{zin}</p>
        </div>
      </header>

      <Dagkaart team={team} dag={dag} setDag={setDag} nu={nu} ritActie={ritActie} />

      <div className="tm-grid2">
        <section className="tm-sec" aria-labelledby="ov-nu">
          <h2 id="ov-nu" className="tm-h2">
            Nu onderweg
          </h2>
          {lopend.length === 0 ? (
            <p className="tm-empty">Geen ritten onderweg.</p>
          ) : (
            <ul className="tm-list">
              {lopend.map(r => (
                <RitRij key={r._pid + r.id} r={r} ritActie={ritActie} metChauffeur metDatum={r.d !== vandaag} />
              ))}
            </ul>
          )}

          <h2 className="tm-h2 tm-h2--gap">Straks</h2>
          {straks.length === 0 ? (
            <div className="tm-empty">
              Er staan geen ritten gepland.{" "}
              <button type="button" className="tm-link" onClick={() => openNieuw()}>
                Rit inplannen
              </button>
            </div>
          ) : (
            <ul className="tm-list">
              {straks.map(r => (
                <RitRij key={r._pid + r.id} r={r} ritActie={ritActie} metChauffeur metDatum={r.d !== vandaag} />
              ))}
            </ul>
          )}
        </section>

        <div>
          <WeekBlok team={team} ws={ws} tot={weekTot} gaNaar={gaNaar} />

          {(verlopen.length > 0 || zonderBon.length > 0) && (
            <section className="tm-sec" aria-labelledby="ov-aandacht">
              <h2 id="ov-aandacht" className="tm-h2">
                Nog af te werken
              </h2>
              <ul className="tm-todo">
                {verlopen.slice(0, 4).map(r => (
                  <li key={r._pid + r.id}>
                    <Dot pid={r._pid} />
                    <div className="tm-todo-t">
                      <b>
                        {r.f} naar {r.t}
                      </b>
                      <span>
                        {chauffeurNaam(r._pid)}, {r.s === "lopend" ? "gestart" : "gepland"} op {datumKort(r.d)}
                        {r.ti ? " om " + r.ti : ""}, nooit afgesloten.
                      </span>
                    </div>
                    <div className="tm-todo-a">
                      <button type="button" className="btn btn-o btn-sm" onClick={() => ritActie(r._pid, r.id, "ok")}>
                        Voltooien
                      </button>
                      <button
                        type="button"
                        className="btn btn-gh btn-sm"
                        aria-label="Rit verwijderen"
                        onClick={() => ritActie(r._pid, r.id, "x")}
                      >
                        Verwijderen
                      </button>
                    </div>
                  </li>
                ))}
                {verlopen.length > 4 && (
                  <li className="tm-todo-more">
                    <button type="button" className="tm-link" onClick={() => gaNaar("planning")}>
                      Nog {verlopen.length - 4} in Planning
                    </button>
                  </li>
                )}
                {zonderBon.length > 0 && (
                  <li>
                    <span className="tm-dot tm-dot--warn" aria-hidden="true" />
                    <div className="tm-todo-t">
                      <b>{meervoud(zonderBon.length, "voltooide rit", "voltooide ritten")} zonder bonnummer</b>
                      <span>
                        Deze maand, bij{" "}
                        {[...new Set(zonderBon.map(r => r._pid))].map(chauffeurNaam).join(", ")}. Zonder bon staat de rit
                        niet volledig op de factuur.
                      </span>
                    </div>
                    <div className="tm-todo-a">
                      <button type="button" className="btn btn-o btn-sm" onClick={() => gaNaar("instellingen")}>
                        Bonnen inlezen
                      </button>
                    </div>
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** De dagkaart: elke chauffeur is een lijn door de dag, elke rit een stuk van die lijn. */
function Dagkaart({ team, dag, setDag, nu, ritActie }) {
  const scrollRef = useRef(null);
  const [sel, setSel] = useState(null); // `${pid}:${id}`
  const vandaag = vandaagIso();
  const isVandaag = dag === vandaag;
  const nuMin = nu.getHours() * 60 + nu.getMinutes();

  const rijen = team.map(t => ({
    ...t,
    dagRitten: t.D.r
      .filter(r => r.d === dag && minutenVan(r.ti) != null)
      .sort((a, b) => ritSortKey(a).localeCompare(ritSortKey(b))),
  }));
  const alle = rijen.flatMap(r => r.dagRitten);
  let h0 = 6;
  let h1 = 22;
  alle.forEach(r => {
    const m = minutenVan(r.ti);
    h0 = Math.min(h0, Math.floor(m / 60));
    h1 = Math.max(h1, Math.ceil((m + geschatteDuur(r)) / 60));
  });
  if (isVandaag) {
    h0 = Math.min(h0, Math.floor(nuMin / 60));
    h1 = Math.max(h1, Math.ceil(nuMin / 60) + 1);
  }
  h1 = Math.min(24, h1);
  const span = (h1 - h0) * 60;
  const pos = m => ((m - h0 * 60) / span) * 100;
  const uren = [];
  for (let h = h0; h <= h1; h++) uren.push(h);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isVandaag) return;
    const x = (pos(nuMin) / 100) * el.scrollWidth - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, x);
  }, [dag]);

  useEffect(() => setSel(null), [dag]);

  const selRit = sel
    ? (() => {
        const [pid, id] = sel.split(":");
        const r = team.find(t => t.id === pid)?.D.r.find(x => x.id === id);
        return r ? { ...r, _pid: pid } : null;
      })()
    : null;

  const dagOmzet = alle.filter(r => r.s === "voltooid").reduce((a, r) => a + money(r.v), 0);
  const dagGepland = alle.filter(r => r.s !== "voltooid").reduce((a, r) => a + money(r.v), 0);

  return (
    <section className="tm-dk" aria-label={`Dagkaart ${dagLabel(dag)}`}>
      <div className="tm-dk-hd">
        <div className="tm-dk-nav">
          <button type="button" className="tm-icbtn" aria-label="Vorige dag" onClick={() => setDag(isoPlusDagen(dag, -1))}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="tm-dk-t">{dagLabel(dag)}</h2>
          <button type="button" className="tm-icbtn" aria-label="Volgende dag" onClick={() => setDag(isoPlusDagen(dag, 1))}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {!isVandaag && (
            <button type="button" className="tm-link" onClick={() => setDag(vandaag)}>
              Naar vandaag
            </button>
          )}
        </div>
        <p className="tm-dk-sum">
          {alle.length === 0 ? (
            "Geen ritten"
          ) : (
            <>
              {meervoud(alle.length, "rit", "ritten")}, <b className="tm-num">{euroKort(dagOmzet)}</b> verdiend
              {dagGepland > 0 ? (
                <>
                  {" "}
                  en <b className="tm-num">{euroKort(dagGepland)}</b> nog open
                </>
              ) : null}
            </>
          )}
        </p>
      </div>

      <div className="tm-dk-body">
        <div className="tm-dk-names">
          <div className="tm-dk-axis-sp" />
          {rijen.map(t => (
            <div key={t.id} className="tm-dk-name" style={{ "--lijn": lijnVar(t.id) }}>
              <span className="tm-dk-av" aria-hidden="true">
                {t.i}
              </span>
              <span className="tm-dk-nm">{t.n}</span>
            </div>
          ))}
        </div>
        <div className="tm-dk-scroll" ref={scrollRef}>
          <div className="tm-dk-track" style={{ "--uren": h1 - h0 }}>
            <div className="tm-dk-axis" aria-hidden="true">
              {uren.map(h => (
                <span key={h} style={{ left: pos(h * 60) + "%" }}>
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
            {uren.map(h => (
              <div key={h} className="tm-dk-grid" style={{ left: pos(h * 60) + "%" }} aria-hidden="true" />
            ))}
            {rijen.map(t => (
              <div key={t.id} className="tm-dk-row" style={{ "--lijn": lijnVar(t.id) }}>
                <div className="tm-dk-rail" aria-hidden="true" />
                {t.dagRitten.map(r => {
                  const m = minutenVan(r.ti);
                  const l = pos(m);
                  const w = Math.max(1.2, pos(m + geschatteDuur(r)) - l);
                  const key = `${t.id}:${r.id}`;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={"tm-dk-seg tm-dk-seg--" + r.s + (sel === key ? " on" : "")}
                      style={{ left: l + "%", width: w + "%" }}
                      title={`${r.ti} ${r.f} naar ${r.t}`}
                      aria-label={`${t.n}, ${r.ti}, ${r.f} naar ${r.t}, ${r.s === "voltooid" ? "voltooid" : r.s === "lopend" ? "onderweg" : "gepland"}`}
                      aria-pressed={sel === key}
                      onClick={() => setSel(s => (s === key ? null : key))}
                    >
                      <span className="tm-dk-stop" />
                      <span className="tm-dk-lbl">{r.ti}</span>
                      <span className="tm-dk-stop tm-dk-stop--end" />
                    </button>
                  );
                })}
              </div>
            ))}
            {isVandaag && nuMin >= h0 * 60 && nuMin <= h1 * 60 && (
              <div className="tm-dk-now" style={{ left: pos(nuMin) + "%" }} aria-hidden="true">
                <span>{String(nu.getHours()).padStart(2, "0") + ":" + String(nu.getMinutes()).padStart(2, "0")}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {selRit ? (
        <div className="tm-dk-detail" style={{ "--lijn": lijnVar(selRit._pid) }}>
          <ul className="tm-list tm-list--flat">
            <RitRij r={selRit} ritActie={ritActie} metChauffeur />
          </ul>
        </div>
      ) : alle.length > 0 ? (
        <p className="tm-dk-hint">Tik op een rit voor de details.</p>
      ) : null}
    </section>
  );
}

function WeekBlok({ team, ws, tot, gaNaar }) {
  const donker = useDonker();
  const dagen = Array.from({ length: 7 }, (_, i) => isoPlusDagen(ws, i));
  const vandaag = vandaagIso();
  const kleuren = LIJN_HEX[donker ? "dark" : "light"];
  const data = {
    labels: dagen.map(d => {
      const [y, m, dd] = d.split("-").map(Number);
      return new Date(y, m - 1, dd, 12).toLocaleDateString("nl-BE", { weekday: "short" }).replace(".", "");
    }),
    datasets: team.map((t, i) => ({
      label: t.n,
      data: dagen.map(d =>
        t.D.r.filter(r => r.s === "voltooid" && r.d === d).reduce((a, r) => a + money(r.v), 0)
      ),
      backgroundColor: kleuren[i % 4],
      borderRadius: 3,
      borderSkipped: false,
      maxBarThickness: 26,
      stack: "omzet",
    })),
  };
  const as = donker ? "#8691A3" : "#6B7586";
  const grid = donker ? "rgba(134,145,163,.14)" : "rgba(14,23,38,.07)";
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: c => `${c.dataset.label}: ${euro(c.parsed.y)}` },
        backgroundColor: donker ? "#E9EDF4" : "#0E1726",
        titleColor: donker ? "#0E1726" : "#fff",
        bodyColor: donker ? "#0E1726" : "#fff",
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: as, font: { size: 12 } }, border: { display: false } },
      y: {
        stacked: true,
        grid: { color: grid },
        border: { display: false },
        ticks: { color: as, font: { size: 11 }, maxTicksLimit: 4, callback: v => "€" + v },
      },
    },
  };
  return (
    <section className="tm-sec" aria-labelledby="ov-week">
      <div className="tm-h2-row">
        <h2 id="ov-week" className="tm-h2">
          Deze week
        </h2>
        <button type="button" className="tm-link" onClick={() => gaNaar("financieel", "team")}>
          Naar Financieel
        </button>
      </div>
      <dl className="tm-figs">
        <div>
          <dt>Omzet</dt>
          <dd className="tm-num">{euroKort(tot.omzet)}</dd>
        </div>
        <div>
          <dt>Kosten</dt>
          <dd className="tm-num">{euroKort(tot.kosten)}</dd>
        </div>
        <div>
          <dt>Netto</dt>
          <dd className={"tm-num" + (tot.netto < 0 ? " tm-neg" : "")}>{euroKort(tot.netto)}</dd>
        </div>
        <div>
          <dt>Ritten</dt>
          <dd className="tm-num">{tot.ritten}</dd>
        </div>
      </dl>
      <div className="tm-chart tm-chart--week" role="img" aria-label="Omzet per dag deze week, per chauffeur">
        <Bar data={data} options={opts} />
      </div>
      <div className="tm-legend" aria-hidden="true">
        {team.map(t => (
          <span key={t.id}>
            <Dot pid={t.id} size={8} />
            {t.n}
          </span>
        ))}
        <span className="tm-legend-note">{dagen.includes(vandaag) ? "Alleen voltooide ritten" : ""}</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ritrij: gedeeld door Overzicht en Planning                           */
/* ------------------------------------------------------------------ */

function RitRij({ r, ritActie, metChauffeur = false, metDatum = false, open = false, onToggle, children }) {
  const pid = r._pid;
  const nacht = isN(r.ti) && r.s !== "voltooid";
  return (
    <li className={"tm-rit tm-rit--" + r.s + (open ? " open" : "")} style={{ "--lijn": lijnVar(pid) }}>
      <div
        className="tm-rit-main"
        onClick={onToggle}
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        aria-expanded={onToggle ? open : undefined}
        onKeyDown={
          onToggle
            ? e => {
                if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        <div className="tm-rit-time tm-num">
          {r.ti || "--:--"}
          {metDatum ? <small>{datumKort(r.d)}</small> : null}
        </div>
        <div className="tm-rit-body">
          <div className="tm-rit-route">
            <span>{r.f}</span>
            <svg className="tm-rit-arrow" viewBox="0 0 16 8" aria-label="naar">
              <path d="M0 4h14M11 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span>{r.t}</span>
          </div>
          <div className="tm-rit-meta">
            {metChauffeur ? (
              <span className="tm-rit-who">
                <Dot pid={pid} size={8} />
                {chauffeurNaam(pid)}
              </span>
            ) : null}
            <span className="tm-num">{r.k} km</span>
            {r.bon ? <span>Bon {r.bon}</span> : null}
            {nacht ? <span className="tm-warn">Nachttarief</span> : null}
          </div>
        </div>
        <div className="tm-rit-end">
          <span className="tm-rit-eur tm-num">{euro(r.v)}</span>
          <StatusWoord s={r.s} />
        </div>
      </div>
      {ritActie && r.s !== "voltooid" ? (
        <div className="tm-rit-act">
          {r.s === "komend" && (
            <button type="button" className="btn btn-o btn-sm" onClick={() => ritActie(pid, r.id, "go")}>
              Start
            </button>
          )}
          <button type="button" className="btn btn-p btn-sm" onClick={() => ritActie(pid, r.id, "ok")}>
            Voltooien
          </button>
        </div>
      ) : null}
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Planning                                                             */
/* ------------------------------------------------------------------ */

function ExcelInlezenKnop({ pid, setFor, className, label, onKlaar }) {
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const { ritten, overgeslagen } = await leesRittenExcel(buf, {
        bestandsnaam: file.name,
        chauffeur: chauffeurNaam(pid),
        voertuig: CA[0],
        maakId: ui,
      });
      let duplicaten = 0;
      let n = 0;
      setFor(pid, D => {
        const uit = voegExcelRittenToe(D.r, ritten);
        duplicaten = uit.duplicaten;
        n = uit.toegevoegd.length;
        return n === 0 ? D : normData({ ...D, r: uit.ritten });
      });
      alert(meldingExcelInlees({ toegevoegd: n, duplicaten, overgeslagen }));
      if (n > 0) onKlaar?.(n);
    } catch (err) {
      console.error(err);
      alert("Excel inlezen mislukt: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inp}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="tm-file-hidden"
        onChange={onFile}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button type="button" className={className || "btn btn-o"} disabled={busy} onClick={() => inp.current?.click()}>
        {busy ? "Excel wordt ingelezen…" : label || "Rittenlijst inlezen"}
      </button>
    </>
  );
}

function Planning({ all, ritten, ritActie, setFor, focus, setFocus, openNieuw }) {
  const [filter, setFilter] = useState("komend");
  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState(null);
  const [limiet, setLimiet] = useState(40);
  const vandaag = vandaagIso();
  const excelPid = focus !== "team" ? focus : PR[0].id;

  useEffect(() => setLimiet(40), [filter, focus, zoek]);

  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    let rr = ritten.filter(r => focus === "team" || r._pid === focus);
    if (filter === "komend") rr = rr.filter(r => r.s === "komend" || r.s === "lopend");
    else if (filter === "voltooid") rr = rr.filter(r => r.s === "voltooid");
    if (q)
      rr = rr.filter(r =>
        `${r.f} ${r.t} ${r.bon || ""} ${chauffeurNaam(r._pid)} ${r.d}`.toLowerCase().includes(q)
      );
    const asc = filter === "komend";
    return rr.sort((a, b) => (asc ? 1 : -1) * ritSortKey(a).localeCompare(ritSortKey(b)));
  }, [ritten, focus, filter, zoek]);

  const zichtbaar = lijst.slice(0, limiet);
  const groepen = [];
  zichtbaar.forEach(r => {
    const g = groepen[groepen.length - 1];
    if (g && g.d === r.d) g.r.push(r);
    else groepen.push({ d: r.d, r: [r] });
  });

  const tel = useMemo(() => {
    const rr = ritten.filter(r => focus === "team" || r._pid === focus);
    return {
      komend: rr.filter(r => r.s === "komend" || r.s === "lopend").length,
      voltooid: rr.filter(r => r.s === "voltooid").length,
      alles: rr.length,
    };
  }, [ritten, focus]);

  return (
    <>
      <header className="tm-ph">
        <div>
          <h1>Planning</h1>
          <p className="tm-ph-sub">
            {tel.komend === 0
              ? "Er staan geen ritten open."
              : `${meervoud(tel.komend, "rit staat", "ritten staan")} open${focus === "team" ? "" : " voor " + chauffeurNaam(focus)}.`}
          </p>
        </div>
        <button type="button" className="btn btn-p" onClick={() => openNieuw(focus !== "team" ? focus : undefined)}>
          Nieuwe rit
        </button>
      </header>

      <div className="tm-toolbar">
        {PR.length > 1 ? <ScopeChips value={focus} onChange={setFocus} /> : null}
        <div className="tm-toolbar-r">
          <Seg
            label="Welke ritten"
            value={filter}
            onChange={setFilter}
            options={[
              ["komend", `Open (${tel.komend})`],
              ["voltooid", `Voltooid (${tel.voltooid})`],
              ["alles", "Alles"],
            ]}
          />
          <input
            className="tm-search"
            type="search"
            placeholder="Zoek ziekenhuis, bon of datum"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            aria-label="Ritten zoeken"
          />
          <ExcelInlezenKnop
            pid={excelPid}
            setFor={setFor}
            className="btn btn-o btn-sm"
            onKlaar={() => setFilter("voltooid")}
          />
        </div>
      </div>

      {groepen.length === 0 ? (
        <div className="tm-empty tm-empty--big">
          {zoek ? (
            <>Geen ritten gevonden voor “{zoek}”.</>
          ) : filter === "komend" ? (
            <>
              Niets open. Plan een rit in, dan verschijnt ze hier en op de dagkaart.
              <div className="tm-empty-act">
                <button type="button" className="btn btn-p" onClick={() => openNieuw(focus !== "team" ? focus : undefined)}>
                  Nieuwe rit
                </button>
                <ExcelInlezenKnop
                  pid={excelPid}
                  setFor={setFor}
                  className="btn btn-o"
                  onKlaar={() => setFilter("voltooid")}
                />
              </div>
            </>
          ) : (
            <>
              Nog geen ritten.
              <div className="tm-empty-act">
                <ExcelInlezenKnop
                  pid={excelPid}
                  setFor={setFor}
                  className="btn btn-o"
                  onKlaar={() => setFilter("voltooid")}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        groepen.map(g => {
          const som = g.r.reduce((a, r) => a + money(r.v), 0);
          return (
            <section key={g.d} className="tm-day">
              <h2 className={"tm-day-h" + (g.d < vandaag && filter === "komend" ? " tm-day-h--late" : "")}>
                <span>{dagLabel(g.d)}</span>
                <span className="tm-day-s tm-num">
                  {meervoud(g.r.length, "rit", "ritten")}, {euroKort(som)}
                </span>
              </h2>
              <ul className="tm-list">
                {g.r.map(r => {
                  const key = r._pid + ":" + r.id;
                  return (
                    <RitRij
                      key={key}
                      r={r}
                      ritActie={ritActie}
                      metChauffeur={focus === "team"}
                      open={open === key}
                      onToggle={() => setOpen(o => (o === key ? null : key))}
                    >
                      {open === key ? (
                        <RitDetail
                          r={r}
                          all={all}
                          setFor={setFor}
                          onClose={() => setOpen(null)}
                          onVerwijder={() => ritActie(r._pid, r.id, "x")}
                        />
                      ) : null}
                    </RitRij>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      {lijst.length > limiet ? (
        <button type="button" className="btn btn-o btn-full" onClick={() => setLimiet(l => l + 60)}>
          Meer tonen ({lijst.length - limiet})
        </button>
      ) : null}
    </>
  );
}

/** Uitgeklapte rit: bon, km/bedrag, andere chauffeur, verwijderen. */
function RitDetail({ r, all, setFor, onClose, onVerwijder }) {
  const [bon, setBon] = useState(r.bon || "");
  const [km, setKm] = useState(String(r.k ?? ""));
  const [v, setV] = useState(money(r.v).toFixed(2).replace(".", ","));
  const [naar, setNaar] = useState(r._pid);
  const [ti, setTi] = useState(r.ti || "");
  const [d, setD] = useState(r.d);

  const kmN = parseLooseNumber(km);
  const vN = parseLooseNumber(v);
  const kInt = Number.isFinite(kmN) ? Math.max(1, Math.round(kmN)) : null;
  const tarief = kInt ? Math.round(tmVergoeding(r.f, r.t, kInt, ti) * 100) / 100 : null;

  const opslaan = () => {
    if (!kInt) return alert("Vul een geldige afstand in (minstens 1 km).");
    if (!Number.isFinite(vN) || vN < 0) return alert("Vul een geldig bedrag in.");
    const handmatig = Math.abs(vN - (tarief ?? vN)) > 0.004;
    const { _pid, ...rest } = r;
    const next = { ...rest, k: kInt, v: Math.round(vN * 100) / 100, ti, d };
    if (handmatig) next.handmatigKv = true;
    else delete next.handmatigKv;
    const b = bon.trim();
    if (b) next.bon = b;
    else delete next.bon;
    if (naar !== r._pid) {
      next.dr = chauffeurNaam(naar);
      setFor(r._pid, D => normData({ ...D, r: D.r.filter(x => x.id !== r.id) }));
      setFor(naar, D => normData({ ...D, r: [...D.r, next] }));
    } else {
      setFor(r._pid, D => normData({ ...D, r: D.r.map(x => (x.id === r.id ? next : x)) }));
    }
    onClose();
  };

  return (
    <div className="tm-rit-detail" onClick={e => e.stopPropagation()}>
      {r.s !== "geannuleerd" ? <RitVergoedingUitleg r={r} /> : null}
      <div className="tm-detail-grid">
        <div className="tm-fg">
          <label className="fl" htmlFor={"dd-" + r.id}>
            Datum
          </label>
          <input id={"dd-" + r.id} type="date" value={d} onChange={e => setD(e.target.value)} />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"dt-" + r.id}>
            Tijd
          </label>
          <input id={"dt-" + r.id} type="time" value={ti} onChange={e => setTi(e.target.value)} />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"dk-" + r.id}>
            Afstand (km)
          </label>
          <input id={"dk-" + r.id} type="text" inputMode="decimal" value={km} onChange={e => setKm(e.target.value)} />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"dv-" + r.id}>
            Bedrag (€)
          </label>
          <input id={"dv-" + r.id} type="text" inputMode="decimal" value={v} onChange={e => setV(e.target.value)} />
          {tarief != null && Math.abs((Number.isFinite(vN) ? vN : 0) - tarief) > 0.004 ? (
            <button type="button" className="tm-link tm-link--sm" onClick={() => setV(tarief.toFixed(2).replace(".", ","))}>
              Tarief toepassen: {euro(tarief)}
            </button>
          ) : null}
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"db-" + r.id}>
            Bonnummer
          </label>
          <input
            id={"db-" + r.id}
            type="text"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="IHcT…"
            value={bon}
            onChange={e => setBon(e.target.value)}
          />
        </div>
        {PR.length > 1 ? (
          <div className="tm-fg">
            <label className="fl" htmlFor={"dc-" + r.id}>
              Chauffeur
            </label>
            <select id={"dc-" + r.id} value={naar} onChange={e => setNaar(e.target.value)}>
              {PR.map(p => (
                <option key={p.id} value={p.id}>
                  {p.n}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="tm-detail-act">
        <button type="button" className="btn btn-p" onClick={opslaan}>
          Wijzigingen opslaan
        </button>
        <button type="button" className="btn btn-gh" onClick={onClose}>
          Sluiten
        </button>
        <button type="button" className="btn btn-gh tm-danger" onClick={onVerwijder}>
          Rit verwijderen
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nieuwe rit                                                           */
/* ------------------------------------------------------------------ */

function NieuweRitSheet({ all, startPid, onClose, onSave }) {
  const [pid, setPid] = useState(startPid);
  const routes = useMemo(() => tmBuildMergedRoutes(all[pid]), [all, pid]);
  const [zoek, setZoek] = useState("");
  const [fm, setFm] = useState(() => ({
    ri: -1,
    f: "",
    t: "",
    k: "",
    bon: "",
    d: vandaagIso(),
    ti: nt(),
    ca: CA[0],
    s: "komend",
    bron: "",
  }));
  const [meten, setMeten] = useState(false);
  const req = useRef(0);

  useEffect(() => {
    const f = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);

  useEffect(() => setFm(m => ({ ...m, ri: -1 })), [pid]);

  const kies = i => {
    const r = routes[i];
    if (!r) return;
    const token = ++req.current;
    const coords = [r.la1, r.lo1, r.la2, r.lo2].every(x => x != null && Number.isFinite(Number(x)));
    setFm(m => ({ ...m, ri: i, f: r.f, t: r.t, k: String(r.k), bron: coords ? "" : "lijst" }));
    if (!coords) return;
    setMeten(true);
    getDrivingRouteKm({ lat: r.la1, lng: r.lo1 }, { lat: r.la2, lng: r.lo2 })
      .then(({ km, source }) => {
        if (token !== req.current || !(km >= 1)) return;
        setFm(m => (m.ri === i ? { ...m, k: String(km), bron: source || "route" } : m));
      })
      .catch(() => {
        if (token === req.current) setFm(m => (m.ri === i ? { ...m, bron: "lijst" } : m));
      })
      .finally(() => {
        if (token === req.current) setMeten(false);
      });
  };

  const q = zoek.trim().toLowerCase();
  const gefilterd = routes
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !q || `${r.f} ${r.t}`.toLowerCase().includes(q));

  const kInt = Math.max(1, Math.round(Number(String(fm.k).replace(",", ".")) || 0));
  const klaar = !!(fm.f.trim() && fm.t.trim() && Number(String(fm.k).replace(",", ".")) >= 1);
  const bedrag = klaar ? tmVergoeding(fm.f.trim(), fm.t.trim(), kInt, fm.ti) : 0;
  const sel = fm.ri >= 0 ? routes[fm.ri] : null;

  const bewaar = () => {
    if (!klaar) return;
    const trip = {
      id: ui(),
      d: fm.d,
      ti: fm.ti,
      f: fm.f.trim(),
      t: fm.t.trim(),
      k: kInt,
      dr: chauffeurNaam(pid),
      ca: fm.ca,
      s: fm.s,
      v: Math.round(bedrag * 100) / 100,
    };
    const b = fm.bon.trim();
    if (b) trip.bon = b;
    onSave(pid, trip);
  };

  return (
    <div className="tm-ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tm-mo tm-sheet" role="dialog" aria-modal="true" aria-labelledby="nr-t" style={{ "--lijn": lijnVar(pid) }}>
        <div className="tm-mh">
          <h2 id="nr-t">Nieuwe rit</h2>
          <button type="button" className="btn btn-gh" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="tm-mb tm-sheet-body">
          {PR.length > 1 ? (
            <fieldset className="tm-fs">
              <legend>Chauffeur</legend>
              <ScopeChips value={pid} onChange={setPid} metIedereen={false} />
            </fieldset>
          ) : null}

          <fieldset className="tm-fs">
            <legend>Route</legend>
            <input
              type="search"
              className="tm-search"
              placeholder="Zoek in vaste routes"
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              aria-label="Vaste routes zoeken"
            />
            <div className="tm-routes" role="listbox" aria-label="Vaste routes">
              {gefilterd.length === 0 ? (
                <p className="tm-empty">Geen vaste route gevonden. Vul vertrek en bestemming hieronder zelf in.</p>
              ) : (
                gefilterd.map(({ r, i }) => (
                  <button
                    key={(r.__id || r.id || "") + "-" + i}
                    type="button"
                    role="option"
                    aria-selected={fm.ri === i}
                    className={"tm-route" + (fm.ri === i ? " on" : "")}
                    onClick={() => kies(i)}
                  >
                    <span>
                      {r.f} <span className="tm-muted">naar</span> {r.t}
                    </span>
                    <span className="tm-num tm-muted">{r.k} km</span>
                  </button>
                ))
              )}
            </div>
            <div className="tm-g3">
              <div className="tm-fg">
                <label className="fl" htmlFor="nr-f">
                  Vertrek
                </label>
                <input
                  id="nr-f"
                  type="text"
                  placeholder="UZ Brussel"
                  value={fm.f}
                  onChange={e => setFm(m => ({ ...m, f: e.target.value, ri: -1, bron: "" }))}
                />
              </div>
              <div className="tm-fg">
                <label className="fl" htmlFor="nr-t2">
                  Bestemming
                </label>
                <input
                  id="nr-t2"
                  type="text"
                  placeholder="UZ Leuven"
                  value={fm.t}
                  onChange={e => setFm(m => ({ ...m, t: e.target.value, ri: -1, bron: "" }))}
                />
              </div>
              <div className="tm-fg">
                <label className="fl" htmlFor="nr-k">
                  Km
                </label>
                <input
                  id="nr-k"
                  type="number"
                  min="1"
                  step="1"
                  value={fm.k}
                  onChange={e => setFm(m => ({ ...m, k: e.target.value, bron: "" }))}
                />
              </div>
            </div>
            <p className="tm-hint" aria-live="polite">
              {meten
                ? "Afstand over de weg meten…"
                : fm.bron === "google"
                  ? "Afstand gemeten met Google Maps."
                  : fm.bron === "osrm" || fm.bron === "ors" || fm.bron === "route"
                    ? "Afstand over de weg gemeten. Kan enkele km afwijken van Google."
                    : fm.bron === "lijst"
                      ? "Afstand uit de lijst met vaste routes."
                      : ""}
            </p>
            {sel && sel.__map ? (
              <div className="tm-sheet-map">
                <RitMap la1={sel.la1} lo1={sel.lo1} la2={sel.la2} lo2={sel.lo2} labelF={sel.f} labelT={sel.t} />
              </div>
            ) : null}
          </fieldset>

          <fieldset className="tm-fs">
            <legend>Wanneer</legend>
            <div className="tm-g3">
              <div className="tm-fg">
                <label className="fl" htmlFor="nr-d">
                  Datum
                </label>
                <input id="nr-d" type="date" value={fm.d} onChange={e => setFm(m => ({ ...m, d: e.target.value }))} />
              </div>
              <div className="tm-fg">
                <label className="fl" htmlFor="nr-ti">
                  Vertrekuur
                </label>
                <input id="nr-ti" type="time" value={fm.ti} onChange={e => setFm(m => ({ ...m, ti: e.target.value }))} />
              </div>
              <div className="tm-fg">
                <label className="fl" htmlFor="nr-ca">
                  Voertuig
                </label>
                <select id="nr-ca" value={fm.ca} onChange={e => setFm(m => ({ ...m, ca: e.target.value }))}>
                  {CA.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <Seg
              label="Status"
              value={fm.s}
              onChange={s => setFm(m => ({ ...m, s }))}
              options={[
                ["komend", "Nog te rijden"],
                ["voltooid", "Al gereden"],
              ]}
            />
            {fm.s === "voltooid" ? (
              <div className="tm-fg" style={{ marginTop: 12 }}>
                <label className="fl" htmlFor="nr-bon">
                  Bonnummer
                </label>
                <input
                  id="nr-bon"
                  type="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Optioneel"
                  value={fm.bon}
                  onChange={e => setFm(m => ({ ...m, bon: e.target.value }))}
                />
              </div>
            ) : null}
          </fieldset>
        </div>
        <div className="tm-sheet-foot">
          <div className="tm-sheet-sum">
            {klaar ? (
              <>
                <b className="tm-num">{euro(bedrag)}</b>
                <span>
                  {kInt} km{isN(fm.ti) ? ", nachttarief" : ""}
                </span>
              </>
            ) : (
              <span>Kies een route</span>
            )}
          </div>
          <button type="button" className="btn btn-p" disabled={!klaar} onClick={bewaar}>
            {fm.s === "voltooid" ? "Rit opslaan" : "Rit inplannen"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chauffeurs                                                           */
/* ------------------------------------------------------------------ */

function Chauffeurs({ team, gaNaar, openNieuw }) {
  const vandaag = vandaagIso();
  const [ms, me] = periodeBereik("maand");
  const maandNaam = new Date().toLocaleDateString("nl-BE", { month: "long" });

  return (
    <>
      <header className="tm-ph">
        <div>
          <h1>Chauffeurs</h1>
          <p className="tm-ph-sub">Cijfers van {maandNaam}, alleen voltooide ritten.</p>
        </div>
      </header>
      <div className="tm-drivers">
        {team.map(t => {
          const tot = totalen(t.D, ms, me);
          const lopend = t.D.r.filter(r => r.s === "lopend").sort((a, b) => ritSortKey(b).localeCompare(ritSortKey(a)))[0];
          const volgende = t.D.r
            .filter(r => r.s === "komend" && r.d >= vandaag)
            .sort((a, b) => ritSortKey(a).localeCompare(ritSortKey(b)))[0];
          const laatste = t.D.r
            .filter(r => r.s === "voltooid")
            .sort((a, b) => ritSortKey(b).localeCompare(ritSortKey(a)))[0];
          const status = lopend
            ? { k: "on", t: `Onderweg naar ${lopend.t}`, s: `vertrokken om ${lopend.ti || "?"}` }
            : volgende
              ? {
                  k: "plan",
                  t: `Volgende rit ${volgende.d === vandaag ? "om " + volgende.ti : dagLabel(volgende.d).toLowerCase() + " om " + volgende.ti}`,
                  s: `${volgende.f} naar ${volgende.t}`,
                }
              : { k: "vrij", t: "Niets gepland", s: laatste ? `Laatste rit ${dagLabel(laatste.d).toLowerCase()}` : "Nog geen ritten" };
          const marge = tot.omzet > 0 ? Math.round((tot.netto / tot.omzet) * 100) : null;
          return (
            <article key={t.id} className="tm-driver" style={{ "--lijn": lijnVar(t.id) }}>
              <div className="tm-driver-line" aria-hidden="true" />
              <header className="tm-driver-hd">
                <div className="tm-driver-av" aria-hidden="true">
                  {t.i}
                </div>
                <div>
                  <h2>{t.n}</h2>
                  <p className={"tm-driver-st tm-driver-st--" + status.k}>
                    {status.t}
                    <small>{status.s}</small>
                  </p>
                </div>
              </header>
              <dl className="tm-figs tm-figs--sm">
                <div>
                  <dt>Ritten</dt>
                  <dd className="tm-num">{tot.ritten}</dd>
                </div>
                <div>
                  <dt>Km</dt>
                  <dd className="tm-num">{Math.round(tot.km).toLocaleString("nl-BE")}</dd>
                </div>
                <div>
                  <dt>Omzet</dt>
                  <dd className="tm-num">{euroKort(tot.omzet)}</dd>
                </div>
                <div>
                  <dt>Netto</dt>
                  <dd className={"tm-num" + (tot.netto < 0 ? " tm-neg" : "")}>
                    {euroKort(tot.netto)}
                    {marge != null ? <small>{marge}% marge</small> : null}
                  </dd>
                </div>
              </dl>
              <div className="tm-driver-act">
                <button type="button" className="btn btn-o btn-sm" onClick={() => gaNaar("planning", t.id)}>
                  Planning
                </button>
                <button type="button" className="btn btn-o btn-sm" onClick={() => gaNaar("financieel", t.id)}>
                  Financieel
                </button>
                <button type="button" className="btn btn-gh btn-sm" onClick={() => openNieuw(t.id)}>
                  Rit inplannen
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Financieel                                                           */
/* ------------------------------------------------------------------ */

function Financieel({ all, team, setFor, focus, setFocus }) {
  const [sub, setSub] = useState("facturen");
  return (
    <>
      <header className="tm-ph">
        <div>
          <h1>Financieel</h1>
          <p className="tm-ph-sub">
            {focus === "team"
              ? PR.length === 1
                ? `Omzet en kosten. Facturen en kosten vind je onder ${PR[0].n}.`
                : "Omzet en kosten van het hele team. Kies een chauffeur voor facturen en kosten."
              : `Facturen en kosten van ${chauffeurNaam(focus)}.`}
          </p>
        </div>
      </header>
      <div className="tm-toolbar">
        <ScopeChips value={focus} onChange={setFocus} />
        {focus !== "team" ? (
          <div className="tm-toolbar-r">
            <Seg
              label="Onderdeel"
              value={sub}
              onChange={setSub}
              options={[
                ["facturen", "Ritten en factuur"],
                ["kosten", "Kosten"],
              ]}
            />
          </div>
        ) : null}
      </div>
      {focus === "team" ? (
        <FinTeam team={team} setFocus={setFocus} />
      ) : sub === "facturen" ? (
        <div className="tm-legacy" key={"h-" + focus}>
          <Historiek D={all[focus]} pid={focus} sD={upd => setFor(focus, upd)} />
        </div>
      ) : (
        <div className="tm-legacy tm-legacy--narrow" key={"k-" + focus}>
          <Kosten D={all[focus]} pid={focus} sD={upd => setFor(focus, upd)} />
        </div>
      )}
    </>
  );
}

function FinTeam({ team, setFocus }) {
  const donker = useDonker();
  const [p, setP] = useState("maand");
  const [s, e] = periodeBereik(p);
  const per = team.map(t => ({ t, tot: totalen(t.D, s, e) }));
  const som = somTotalen(per.map(x => x.tot));
  const marge = som.omzet > 0 ? Math.round((som.netto / som.omzet) * 100) : null;
  const [xlsBusy, setXlsBusy] = useState(false);
  const periodeTekst = `${datumKort(s)} tot en met ${datumKort(e)}`;
  const excel = async () => {
    setXlsBusy(true);
    try {
      const bladen = team.map(t => ({
        naam: t.n,
        ritten: t.D.r.filter(r => r.s === "voltooid" && r.d >= s && r.d <= e),
        btw: Number(getFactuurGegevens(t.id)?.factuurBtwTarief) || 21,
      }));
      await downloadRittenExcel(bladen, { periode: periodeTekst, bestandsnaam: `Ritten_team_${s}_${e}` });
    } catch (err) {
      console.error(err);
      alert("Excel maken mislukt: " + (err?.message || err));
    } finally {
      setXlsBusy(false);
    }
  };

  // Laatste 10 weken: omzet per chauffeur (gestapeld) + kosten
  const nuWs = weekStart(vandaagIso());
  const weken = Array.from({ length: 10 }, (_, i) => isoPlusDagen(nuWs, -7 * (9 - i)));
  const kleuren = LIJN_HEX[donker ? "dark" : "light"];
  const as = donker ? "#8691A3" : "#6B7586";
  const data = {
    labels: weken.map(w => datumKort(w)),
    datasets: [
      ...team.map((t, i) => ({
        label: t.n,
        data: weken.map(w => totalen(t.D, w, isoPlusDagen(w, 6)).omzet),
        backgroundColor: kleuren[i % 4],
        stack: "omzet",
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 30,
      })),
      {
        label: "Kosten",
        data: weken.map(w => team.reduce((a, t) => a + totalen(t.D, w, isoPlusDagen(w, 6)).kosten, 0)),
        backgroundColor: donker ? "rgba(255,107,94,.55)" : "rgba(200,55,45,.45)",
        stack: "kosten",
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 12,
      },
    ],
  };
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { title: c => "Week van " + c[0].label, label: c => `${c.dataset.label}: ${euro(c.parsed.y)}` },
        backgroundColor: donker ? "#E9EDF4" : "#0E1726",
        titleColor: donker ? "#0E1726" : "#fff",
        bodyColor: donker ? "#0E1726" : "#fff",
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: as, font: { size: 11 } } },
      y: {
        stacked: true,
        border: { display: false },
        grid: { color: donker ? "rgba(134,145,163,.14)" : "rgba(14,23,38,.07)" },
        ticks: { color: as, font: { size: 11 }, maxTicksLimit: 5, callback: v => "€" + v },
      },
    },
  };

  return (
    <>
      <div className="tm-fin-top">
        <Seg
          label="Periode"
          value={p}
          onChange={setP}
          options={[
            ["week", "Deze week"],
            ["maand", "Deze maand"],
            ["vorigemaand", "Vorige maand"],
            ["jaar", "Dit jaar"],
          ]}
        />
        <span className="tm-muted tm-num">
          {datumKort(s)} tot {datumKort(e)}
        </span>
      </div>

      <div className="tm-bigfigs">
        <div>
          <span>Omzet</span>
          <b className="tm-num">{euroKort(som.omzet)}</b>
          <small>{meervoud(som.ritten, "rit", "ritten")}, {Math.round(som.km).toLocaleString("nl-BE")} km</small>
        </div>
        <div>
          <span>Kosten</span>
          <b className="tm-num">{euroKort(som.kosten)}</b>
          <small>
            Brandstof {euroKort(som.brandstof)}, overig {euroKort(som.overig)}
          </small>
        </div>
        <div className="tm-bigfigs-main">
          <span>Netto</span>
          <b className={"tm-num" + (som.netto < 0 ? " tm-neg" : "")}>{euroKort(som.netto)}</b>
          <small>{marge != null ? `${marge}% van de omzet` : "Nog geen omzet"}</small>
        </div>
      </div>

      <section className="tm-sec">
        <div className="tm-h2-row">
          <h2 className="tm-h2">Per chauffeur</h2>
          <button type="button" className="btn btn-o btn-sm" disabled={xlsBusy} onClick={excel}>
            {xlsBusy ? "Excel wordt gemaakt…" : "Rittenlijst Excel"}
          </button>
        </div>
        <div className="tm-table-wrap">
          <table className="tm-table">
            <thead>
              <tr>
                <th scope="col">Chauffeur</th>
                <th scope="col">Ritten</th>
                <th scope="col">Km</th>
                <th scope="col">Omzet</th>
                <th scope="col">Kosten</th>
                <th scope="col">Netto</th>
                <th scope="col">
                  <span className="sr-only">Openen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {per.map(({ t, tot }) => (
                <tr key={t.id}>
                  <th scope="row">
                    <span className="tm-rit-who">
                      <Dot pid={t.id} />
                      {t.n}
                    </span>
                  </th>
                  <td data-label="Ritten" className="tm-num">{tot.ritten}</td>
                  <td data-label="Km" className="tm-num">{Math.round(tot.km).toLocaleString("nl-BE")}</td>
                  <td data-label="Omzet" className="tm-num">{euro(tot.omzet)}</td>
                  <td data-label="Kosten" className="tm-num">{euro(tot.kosten)}</td>
                  <td data-label="Netto" className={"tm-num tm-strong" + (tot.netto < 0 ? " tm-neg" : "")}>{euro(tot.netto)}</td>
                  <td>
                    <button type="button" className="tm-link" onClick={() => setFocus(t.id)}>
                      Factuur
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Totaal</th>
                <td data-label="Ritten" className="tm-num">{som.ritten}</td>
                <td data-label="Km" className="tm-num">{Math.round(som.km).toLocaleString("nl-BE")}</td>
                <td data-label="Omzet" className="tm-num">{euro(som.omzet)}</td>
                <td data-label="Kosten" className="tm-num">{euro(som.kosten)}</td>
                <td data-label="Netto" className={"tm-num tm-strong" + (som.netto < 0 ? " tm-neg" : "")}>{euro(som.netto)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="tm-sec">
        <h2 className="tm-h2">Laatste tien weken</h2>
        <div className="tm-chart tm-chart--tall" role="img" aria-label="Omzet per week per chauffeur, met de kosten ernaast">
          <Bar data={data} options={opts} />
        </div>
        <div className="tm-legend" aria-hidden="true">
          {team.map(t => (
            <span key={t.id}>
              <Dot pid={t.id} size={8} />
              {t.n}
            </span>
          ))}
          <span>
            <span className="tm-dot tm-dot--cost" style={{ width: 8, height: 8 }} />
            Kosten
          </span>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Instellingen                                                         */
/* ------------------------------------------------------------------ */

function Instellingen({ pid, setPid, D, setFor, onBackupImported }) {
  const pr = PR.find(p => p.id === pid) || PR[0];
  return (
    <>
      <header className="tm-ph">
        <div>
          <h1>Instellingen</h1>
          <p className="tm-ph-sub">Factuurgegevens, routes en bonnen zijn per chauffeur.</p>
        </div>
      </header>
      <div className="tm-toolbar">
        <ScopeChips
          value={pid}
          onChange={id => {
            setPid(id);
            try {
              localStorage.setItem("tp", id);
            } catch {
              /* ignore */
            }
          }}
          metIedereen={false}
        />
      </div>
      <div className="tm-legacy tm-legacy--narrow" key={pid}>
        <Meer D={D} sD={upd => setFor(pid, upd)} pid={pid} pr={pr} onBackupImported={onBackupImported} />
      </div>
    </>
  );
}
