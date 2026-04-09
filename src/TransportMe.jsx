import { useState, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import "./transportme-theme.css";

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);
ChartJS.defaults.font.family = "'DM Sans', -apple-system, sans-serif";
ChartJS.defaults.color = "#9a9a92";

const TM_CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        color: "#9a9a92",
        boxWidth: 10,
        padding: 10,
        font: { size: 11 },
      },
    },
    tooltip: {
      backgroundColor: "#1c1c1c",
      titleColor: "#eeede8",
      bodyColor: "#b8b8b0",
      borderColor: "#2c2c2a",
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
    },
  },
};

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
/** Vaste routes (km + coördinaten, zelfde lijst als voorheen — geen handmatige route) */
const ROUTES = [
  { f: "UZ Brussel", t: "UZ Leuven", k: 26, la1: 50.8824, lo1: 4.2745, la2: 50.8814, lo2: 4.671 },
  { f: "UZ Brussel", t: "UZA Edegem", k: 48, la1: 50.8824, lo1: 4.2745, la2: 51.1552, lo2: 4.4452 },
  { f: "UZ Brussel", t: "AZ Deurne", k: 52, la1: 50.8824, lo1: 4.2745, la2: 51.2192, lo2: 4.4653 },
  { f: "UZ Brussel", t: "AZ Herentals", k: 60, la1: 50.8824, lo1: 4.2745, la2: 51.1766, lo2: 4.8325 },
  { f: "UZ Brussel", t: "RKV Mechelen", k: 33, la1: 50.8824, lo1: 4.2745, la2: 51.0257, lo2: 4.4776 },
  { f: "UZ Brussel", t: "AZ Gent", k: 60, la1: 50.8824, lo1: 4.2745, la2: 51.0225, lo2: 3.7108 },
  { f: "UZ Brussel", t: "ZOL Genk", k: 85, la1: 50.8824, lo1: 4.2745, la2: 50.9656, lo2: 5.5001 },
  { f: "UZ Brussel", t: "AZ Turnhout", k: 72, la1: 50.8824, lo1: 4.2745, la2: 51.3245, lo2: 4.9486 },
  { f: "UZ Brussel", t: "Virga Jesse", k: 72, la1: 50.8824, lo1: 4.2745, la2: 50.9307, lo2: 5.3378 },
  { f: "RKV Mechelen", t: "AZ Gent", k: 65, la1: 51.0257, lo1: 4.4776, la2: 51.0225, lo2: 3.7108 },
  { f: "RKV Mechelen", t: "ZOL Genk", k: 60, la1: 51.0257, lo1: 4.4776, la2: 50.9656, lo2: 5.5001 },
  { f: "RKV Mechelen", t: "UZ Leuven", k: 30, la1: 51.0257, lo1: 4.4776, la2: 50.8814, lo2: 4.671 },
  { f: "RKV Mechelen", t: "UZ Brussel", k: 33, la1: 51.0257, lo1: 4.4776, la2: 50.8824, lo2: 4.2745 },
  { f: "RKV Mechelen", t: "Jessa Hasselt", k: 52, la1: 51.0257, lo1: 4.4776, la2: 50.9307, lo2: 5.3378 },
  { f: "UZ Leuven", t: "UZ Brussel", k: 26, la1: 50.8814, lo1: 4.671, la2: 50.8824, lo2: 4.2745 },
  { f: "UZ Leuven", t: "UZA Edegem", k: 65, la1: 50.8814, lo1: 4.671, la2: 51.1552, lo2: 4.4452 },
  { f: "UZ Leuven", t: "AZ Diest", k: 28, la1: 50.8814, lo1: 4.671, la2: 50.9894, lo2: 5.0506 },
];

const td = () => new Date().toISOString().slice(0, 10);
const nt = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
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

function RitMap({ la1, lo1, la2, lo2, labelF, labelT }) {
  const el = useRef(null);
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    L.polyline(
      [
        [la1, lo1],
        [la2, lo2],
      ],
      { color: "#7d8550", weight: 4, opacity: 0.92 }
    ).addTo(map);
    const pin = (lat, lng, letter, tip) =>
      L.circleMarker([lat, lng], {
        radius: 9,
        fillColor: "#7d8550",
        color: "#141414",
        weight: 2,
        fillOpacity: 1,
      })
        .bindTooltip(`${letter}: ${tip}`, { permanent: true, direction: "top", className: "tm-leaf-tooltip" })
        .addTo(map);
    pin(la1, lo1, "A", labelF || "Start");
    pin(la2, lo2, "B", labelT || "Einde");
    map.fitBounds(
      [
        [la1, lo1],
        [la2, lo2],
      ],
      { padding: [36, 36], maxZoom: 11 }
    );
    return () => {
      map.remove();
    };
  }, [la1, lo1, la2, lo2, labelF, labelT]);
  return <div className="tm-rit-map" ref={el} role="presentation" />;
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
        {r.ti && " · " + r.ti}
        {r.bon && " · Bon " + r.bon} · {r.k} km · <strong className="acc">{E(r.v)}</strong>
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

function ritWeekBuckets(rides) {
  const voltooid = rides.filter(r => r.s === "voltooid");
  const labels = [];
  const counts = [];
  const kms = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const wkLbl = ["≈ 6 wk geleden", "≈ 5 wk", "≈ 4 wk", "≈ 3 wk", "≈ 2 wk", "Deze week"];
  for (let w = 5; w >= 0; w--) {
    const periodEnd = new Date(today);
    periodEnd.setDate(periodEnd.getDate() - w * 7);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 6);
    const s = periodStart.toISOString().slice(0, 10);
    const e = periodEnd.toISOString().slice(0, 10);
    let c = 0,
      k = 0;
    voltooid.forEach(r => {
      if (r.d >= s && r.d <= e) {
        c++;
        k += Number(r.k) || 0;
      }
    });
    labels.push(wkLbl[5 - w]);
    counts.push(c);
    kms.push(k);
  }
  return { labels, counts, kms };
}

function RittenOverzichtCharts({ rides, cnt, onDrill }) {
  const week = useMemo(() => ritWeekBuckets(rides), [rides]);
  const donut = useMemo(
    () => ({
      labels: ["Gepland", "Onderweg", "Voltooid", "Geannuleerd"],
      datasets: [
        {
          data: [cnt.komend, cnt.lopend, cnt.voltooid, cnt.geannuleerd],
          backgroundColor: [
            "rgba(125, 133, 80, 0.9)",
            "rgba(154, 171, 110, 0.88)",
            "rgba(120, 124, 112, 0.95)",
            "rgba(239, 68, 68, 0.72)",
          ],
          borderColor: "#141414",
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    }),
    [cnt]
  );
  const barWeek = useMemo(
    () => ({
      labels: week.labels,
      datasets: [
        {
          label: "Voltooid",
          data: week.counts,
          backgroundColor: "rgba(125, 133, 80, 0.5)",
          borderColor: "#7d8550",
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    }),
    [week]
  );
  const barWeekOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      scales: {
        x: {
          ticks: { color: "#6f6f68", maxRotation: 40, font: { size: 10 } },
          grid: { color: "rgba(40,40,40,0.45)" },
        },
        y: {
          ticks: { color: "#6f6f68", stepSize: 1 },
          grid: { color: "rgba(40,40,40,0.5)" },
          beginAtZero: true,
        },
      },
      plugins: {
        ...TM_CHART_BASE.plugins,
        tooltip: {
          ...TM_CHART_BASE.plugins.tooltip,
          callbacks: {
            afterBody: items => {
              const i = items[0]?.dataIndex;
              if (i == null) return "";
              return `${week.kms[i]} km in deze periode`;
            },
          },
        },
      },
    }),
    [week]
  );
  const topRoutes = useMemo(() => {
    const m = {};
    rides
      .filter(r => r.s === "voltooid")
      .forEach(r => {
        const key = `${r.f} → ${r.t}`;
        m[key] = (m[key] || 0) + 1;
      });
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [rides]);
  const barTop = useMemo(
    () => ({
      labels: topRoutes.map(([k]) => (k.length > 32 ? k.slice(0, 30) + "…" : k)),
      datasets: [
        {
          label: "Ritten",
          data: topRoutes.map(([, v]) => v),
          backgroundColor: "rgba(125, 133, 80, 0.42)",
          borderColor: "#5c6340",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    }),
    [topRoutes]
  );
  const barTopOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      indexAxis: "y",
      scales: {
        x: {
          ticks: { color: "#6f6f68", stepSize: 1 },
          grid: { color: "rgba(40,40,40,0.45)" },
          beginAtZero: true,
        },
        y: {
          ticks: { color: "#9a9a92", font: { size: 9 } },
          grid: { display: false },
        },
      },
    }),
    []
  );
  const donutOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      cutout: "62%",
      plugins: {
        ...TM_CHART_BASE.plugins,
        legend: { ...TM_CHART_BASE.plugins.legend, position: "bottom" },
      },
    }),
    []
  );

  if (rides.length === 0) {
    return (
      <p className="tm-em" style={{ marginTop: 8 }}>
        Nog geen ritten — plan er een of schakel naar de lijst.
      </p>
    );
  }

  return (
    <div className="tm-ritten-charts">
      <p className="tm-chart-lead">
        <strong>{rides.length}</strong> ritten in totaal. Grafieken tonen al je data; kies hieronder een filter om de
        lijst te openen.
      </p>
      <div className="tm-chart-grid">
        <div className="tm-chart-card tm-chart-card--donut">
          <div className="tm-chart-hd">Verdeling status</div>
          <div className="tm-chart-body tm-chart-body--donut">
            <Doughnut data={donut} options={donutOpts} />
          </div>
        </div>
        <div className="tm-chart-card">
          <div className="tm-chart-hd">Voltooide ritten (per week)</div>
          <div className="tm-chart-body tm-chart-body--bar">
            <Bar data={barWeek} options={barWeekOpts} />
          </div>
        </div>
        {topRoutes.length > 0 && (
          <div className="tm-chart-card tm-chart-card--wide">
            <div className="tm-chart-hd">Toproutes (voltooid)</div>
            <div className="tm-chart-body tm-chart-body--hbar">
              <Bar data={barTop} options={barTopOpts} />
            </div>
          </div>
        )}
      </div>
      <div className="tm-ritten-drill">
        <div className="fl" style={{ marginBottom: 8 }}>
          Open lijst met filter
        </div>
        <div className="tm-cg">
          {[
            ["alle", "Alle"],
            ["komend", "Gepland"],
            ["lopend", "Onderweg"],
            ["voltooid", "Voltooid"],
            ["geannuleerd", "Geannuleerd"],
          ].map(([k, l]) => (
            <button key={k} type="button" className="tm-ci" onClick={() => onDrill(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ritten({ D, sD, pid }) {
  const [fl, sF] = useState("alle");
  const [pane, sPane] = useState("overzicht");
  const [sh, sSh] = useState(false);
  const mkIni = () => ({
    ri: -1,
    f: "",
    t: "",
    k: "",
    bon: "",
    d: td(),
    ti: nt(),
    dr: DR[0],
    ca: CA[0],
    s: "komend",
  });
  const [fm, sM] = useState(mkIni);
  const pk = i => {
    const r = ROUTES[i];
    sM(m => ({ ...m, ri: i, f: r.f, t: r.t, k: String(r.k) }));
  };
  const svR = () => {
    if (fm.ri < 0 || !fm.f || !fm.t || !fm.k) return;
    const k = +fm.k;
    if (k <= 0) return;
    const trip = {
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
    };
    const b = String(fm.bon || "").trim();
    if (b) trip.bon = b;
    const nd = { ...D, r: [...D.r, trip] };
    sD(nd);
    sv(pid, nd);
    sM(mkIni());
    sSh(false);
  };
  const canBevestig = fm.ri >= 0 && !!(fm.f && fm.t && fm.k && +fm.k > 0);
  const openNieuw = () => {
    sM(mkIni());
    sSh(true);
  };
  const sel = fm.ri >= 0 ? ROUTES[fm.ri] : null;
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

  const drill = k => {
    sF(k);
    sPane("lijst");
  };

  return (
    <div>
      <div className="tm-bar">
        <h1>Mijn ritten</h1>
        <button type="button" className="btn btn-p btn-pill" onClick={openNieuw}>
          + Nieuw
        </button>
      </div>
      <div className="tm-view-toggle" role="tablist" aria-label="Weergave ritten">
        <button
          type="button"
          role="tab"
          aria-selected={pane === "overzicht"}
          className={"tm-view-tab" + (pane === "overzicht" ? " on" : "")}
          onClick={() => sPane("overzicht")}
        >
          Overzicht
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "lijst"}
          className={"tm-view-tab" + (pane === "lijst" ? " on" : "")}
          onClick={() => sPane("lijst")}
        >
          Lijst
        </button>
      </div>
      {pane === "overzicht" ? (
        <RittenOverzichtCharts rides={D.r} cnt={cnt} onDrill={drill} />
      ) : (
        <>
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
        </>
      )}

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
              <div className="tm-rit-map-slot">
                {sel ? (
                  <RitMap
                    la1={sel.la1}
                    lo1={sel.lo1}
                    la2={sel.la2}
                    lo2={sel.lo2}
                    labelF={sel.f}
                    labelT={sel.t}
                  />
                ) : (
                  <div className="tm-rit-map-ph">Kies een vaste route hieronder om de kaart te tonen.</div>
                )}
              </div>
              <div className="fl">Vaste route</div>
              <div className="tm-prs">
                {ROUTES.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    className={"tm-pr" + (fm.ri === i ? " on" : "")}
                    onClick={() => pk(i)}
                  >
                    <span>
                      {r.f} → {r.t}
                    </span>
                    <b className="tm-pk">{r.k} km</b>
                  </button>
                ))}
              </div>
              <div className="tm-fg" style={{ marginTop: 10 }}>
                <label className="fl">Bonnummer</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Optioneel"
                  value={fm.bon}
                  onChange={e => sM(m => ({ ...m, bon: e.target.value }))}
                />
              </div>
              <div className="tm-g2">
                <div className="tm-fg">
                  <label className="fl">Datum</label>
                  <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
                </div>
                <div className="tm-fg">
                  <label className="fl">Tijd</label>
                  <input type="time" value={fm.ti} onChange={e => sM(m => ({ ...m, ti: e.target.value }))} />
                </div>
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
              {sel && (
                <div className="card tm-rit-sum">
                  <div className="tm-rvi">
                    <span>Route</span>
                    <b>
                      {fm.f} → {fm.t}
                    </b>
                  </div>
                  <div className="tm-rvi">
                    <span>Afstand</span>
                    <b>{fm.k} km</b>
                  </div>
                  <div className="tm-rvi">
                    <span>Vergoeding</span>
                    <b>
                      {E(VG(+fm.k, fm.ti))}
                      {isN(fm.ti) && <span style={{ fontSize: 12, color: "var(--am)", fontWeight: 500 }}> +30% nacht</span>}
                    </b>
                  </div>
                </div>
              )}
              <div className="tm-mfa tm-mfa-single">
                <button type="button" className="btn btn-p btn-full" onClick={svR} disabled={!canBevestig}>
                  Rit bevestigen
                </button>
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

  const finBarData = useMemo(
    () => ({
      labels: ["Omzet", "Kosten", "Netto"],
      datasets: [
        {
          label: "€",
          data: [omzet, kosten, winst],
          backgroundColor: ["rgba(125, 133, 80, 0.62)", "rgba(239, 68, 68, 0.5)", "rgba(154, 171, 110, 0.55)"],
          borderColor: ["#7d8550", "#ef4444", winst >= 0 ? "#9aab6e" : "#ef4444"],
          borderWidth: 1,
          borderRadius: 8,
        },
      ],
    }),
    [omzet, kosten, winst]
  );
  const finBarOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      plugins: {
        ...TM_CHART_BASE.plugins,
        legend: { display: false },
        tooltip: {
          ...TM_CHART_BASE.plugins.tooltip,
          callbacks: {
            label: ctx => (ctx.dataset.label ? `${ctx.dataset.label} ` : "") + E(Number(ctx.raw) || 0),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#6f6f68", font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: "#6f6f68",
            font: { size: 10 },
            callback: v => "€" + v,
          },
          grid: { color: "rgba(40,40,40,0.45)" },
          beginAtZero: true,
        },
      },
    }),
    []
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Financieel overzicht</h1>
      <PP v={p} set={sP} />

      <div className="tm-chart-card tm-fin-chart">
        <div className="tm-chart-hd">Grafiek — geselecteerde periode</div>
        <div className="tm-chart-body tm-chart-body--bar tm-chart-body--fin">
          <Bar data={finBarData} options={finBarOpts} />
        </div>
      </div>

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

function IconNavHome() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6H9.5v6H5a1 1 0 0 1-1-1v-9.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconNavRitten() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 16.5l4-9 4 5 4-8 4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="16.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12.5" r="1.6" fill="currentColor" />
      <circle cx="16" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="20" cy="16.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconNavFin() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 18V6h12v4H8v8H4zm12-8h4l2 2v10h-6V10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path d="M8 14h4M8 10h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconNavKosten() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v3M8 6h8l1 12H7L8 6zM10 10h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconNavMeer() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.75" fill="currentColor" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" />
      <circle cx="18" cy="12" r="1.75" fill="currentColor" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: "home", label: "Home", Icon: IconNavHome },
  { id: "ritten", label: "Ritten", Icon: IconNavRitten },
  { id: "fin", label: "Financieel", Icon: IconNavFin },
  { id: "kosten", label: "Kosten", Icon: IconNavKosten },
  { id: "meer", label: "Meer", Icon: IconNavMeer },
];

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
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={"tm-nav-i" + (tab === id ? " on" : "")}
            onClick={() => sT(id)}
            aria-label={label}
            aria-current={tab === id ? "page" : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
