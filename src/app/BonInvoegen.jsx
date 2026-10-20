import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PR, CA, ui, isN, RitMap, tmVergoeding } from "../TransportMe.jsx";
import { chauffeurNaam, euro, lijnVar } from "./team.js";
import { recognizeBonImage, terminateBonOcrWorker } from "../js/bonFotoOcr.js";
import { voorstelUitBonTekst, voorstelIsKlaar, tripUitVoorstel } from "../js/transportBon.js";

const MAX_BESTANDEN = 12;
const MAX_MB = 14;

function extraUitData(D) {
  const extraKm = [];
  const extraPlaatsen = [];
  const seen = new Set();
  const addP = (name, lat, lng) => {
    const n = String(name || "").trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    extraPlaatsen.push({ name: n, lat, lng });
  };
  for (const r of D?.xr || []) {
    extraKm.push({ f: r.f, t: r.t, k: r.k });
    addP(r.f, r.la1, r.lo1);
    addP(r.t, r.la2, r.lo2);
  }
  return { extraKm, extraPlaatsen };
}

function RijEditor({ v, onChange, i }) {
  const kInt = Math.max(0, Math.round(Number(String(v.k).replace(",", ".")) || 0));
  const bedrag = v.f && v.t && kInt >= 1 ? tmVergoeding(v.f, v.t, kInt, v.ti) : 0;
  const kaart = v.coords;
  return (
    <article className="tm-bon-rij">
      <header className="tm-bon-rij-h">
        <span className="tm-num">{v.bon || "Bon " + (i + 1)}</span>
        {v.kmBron === "lijst" ? <span className="tm-muted">Km uit de prijslijst</span> : null}
        {v.kmBron === "weg" ? <span className="tm-muted">Km over de weg</span> : null}
      </header>
      {kaart ? (
        <div className="tm-sheet-map">
          <RitMap
            la1={kaart.a.lat}
            lo1={kaart.a.lng}
            la2={kaart.b.lat}
            lo2={kaart.b.lng}
            labelF={v.f}
            labelT={v.t}
          />
        </div>
      ) : null}
      <div className="tm-g3">
        <div className="tm-fg">
          <label className="fl" htmlFor={"bon-f-" + i}>
            Vertrek
          </label>
          <input
            id={"bon-f-" + i}
            type="text"
            value={v.f}
            onChange={e => onChange({ ...v, f: e.target.value })}
          />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"bon-t-" + i}>
            Bestemming
          </label>
          <input
            id={"bon-t-" + i}
            type="text"
            value={v.t}
            onChange={e => onChange({ ...v, t: e.target.value })}
          />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"bon-k-" + i}>
            Km
          </label>
          <input
            id={"bon-k-" + i}
            type="number"
            min="1"
            step="1"
            value={v.k ?? ""}
            onChange={e => onChange({ ...v, k: e.target.value, kmBron: "" })}
          />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"bon-d-" + i}>
            Datum
          </label>
          <input
            id={"bon-d-" + i}
            type="date"
            value={v.d}
            onChange={e => onChange({ ...v, d: e.target.value })}
          />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"bon-ti-" + i}>
            Vertrekuur
          </label>
          <input
            id={"bon-ti-" + i}
            type="time"
            value={v.ti}
            onChange={e => onChange({ ...v, ti: e.target.value })}
          />
        </div>
        <div className="tm-fg">
          <label className="fl" htmlFor={"bon-b-" + i}>
            Bonnummer
          </label>
          <input
            id={"bon-b-" + i}
            type="text"
            autoCapitalize="characters"
            spellCheck={false}
            value={v.bon}
            onChange={e => onChange({ ...v, bon: e.target.value })}
          />
        </div>
      </div>
      <p className="tm-hint" aria-live="polite">
        {kInt >= 1 && v.f && v.t
          ? `${euro(bedrag)}${isN(v.ti) ? ", nachttarief" : ""}`
          : "Vul vertrek, bestemming, datum en km aan als iets ontbreekt."}
      </p>
    </article>
  );
}

export default function BonInvoegenSheet({ all, startPid, onClose, onSave }) {
  const [pid, setPid] = useState(startPid);
  const [fase, setFase] = useState("kies");
  const [fout, setFout] = useState("");
  const [voortgang, setVoortgang] = useState(null);
  const [rijen, setRijen] = useState([]);
  const inp = useRef(null);
  const D = all[pid] || { xr: [] };
  const extra = useMemo(() => extraUitData(D), [D]);

  useEffect(() => {
    const f = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);

  useEffect(() => () => terminateBonOcrWorker().catch(() => {}), []);

  const leesBestanden = useCallback(
    async fileList => {
      const arr = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
      if (!arr.length) return;
      const teGroot = arr.filter(f => f.size > MAX_MB * 1024 * 1024);
      const ok = arr.filter(f => f.size <= MAX_MB * 1024 * 1024).slice(0, MAX_BESTANDEN);
      if (teGroot.length) setFout(`Een bestand is groter dan ${MAX_MB} MB.`);
      if (!ok.length) return;
      setFout("");
      setFase("lezen");
      setVoortgang(0);
      const extraKm = extra.extraKm;
      const extraPlaatsen = extra.extraPlaatsen;
      const next = [];
      try {
        for (let i = 0; i < ok.length; i++) {
          setVoortgang((i + 0.4) / ok.length);
          const { text } = await recognizeBonImage(ok[i], {
            logger: m => {
              if (m.status === "recognizing text" && typeof m.progress === "number") {
                setVoortgang((i + m.progress) / ok.length);
              }
            },
          });
          const voorstel = await voorstelUitBonTekst(text || "", { extraKm, extraPlaatsen });
          next.push({ ...voorstel, id: ui() });
          setVoortgang((i + 1) / ok.length);
        }
        setRijen(next);
        setFase("check");
      } catch (e) {
        console.error(e);
        setFout("De bon kon niet worden gelezen. Probeer een scherpere foto, of vul de rit zelf in.");
        setFase("kies");
      } finally {
        setVoortgang(null);
      }
    },
    [extra]
  );

  const klaar = rijen.filter(voorstelIsKlaar);
  const bewaar = () => {
    if (!klaar.length) return;
    const trips = klaar.map(v =>
      tripUitVoorstel(
        { ...v, k: Math.max(1, Math.round(Number(String(v.k).replace(",", ".")) || 0)) },
        { id: ui(), chauffeur: chauffeurNaam(pid), voertuig: CA[0] }
      )
    );
    onSave(pid, trips);
  };

  return (
    <div className="tm-ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tm-mo tm-sheet" role="dialog" aria-modal="true" aria-labelledby="bon-in-t" style={{ "--lijn": lijnVar(pid) }}>
        <div className="tm-mh">
          <h2 id="bon-in-t">Transportbon</h2>
          <button type="button" className="btn btn-gh" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="tm-mb tm-sheet-body">
          {PR.length > 1 ? (
            <fieldset className="tm-fs">
              <legend>Chauffeur</legend>
              <div className="tm-chips">
                {PR.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={"tm-chip" + (pid === p.id ? " on" : "")}
                    onClick={() => setPid(p.id)}
                  >
                    {p.n}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {fase === "kies" || fase === "lezen" ? (
            <fieldset className="tm-fs">
              <legend>Bon</legend>
              <p className="tm-card-p" style={{ marginTop: 0 }}>
                Foto of bestand van de transportbon. We lezen vertrek, bestemming, uur en bonnummer, rekenen de rit en zetten hem in de lijst.
              </p>
              <label
                className={"btn btn-p btn-full" + (fase === "lezen" ? " tm-btn-busy" : "")}
                onDragOver={e => {
                  e.preventDefault();
                }}
                onDrop={e => {
                  e.preventDefault();
                  if (fase !== "lezen") leesBestanden(e.dataTransfer.files);
                }}
              >
                {fase === "lezen"
                  ? voortgang != null
                    ? `Lezen… ${Math.round(voortgang * 100)}%`
                    : "Bon lezen…"
                  : "Foto of bestand kiezen"}
                <input
                  ref={inp}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={fase === "lezen"}
                  className="tm-file-hidden"
                  onChange={e => {
                    leesBestanden(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {fout ? <p className="tm-warn">{fout}</p> : null}
            </fieldset>
          ) : (
            <fieldset className="tm-fs">
              <legend>{rijen.length === 1 ? "Rit uit de bon" : `${rijen.length} ritten uit de bonnen`}</legend>
              {rijen.map((v, i) => (
                <RijEditor
                  key={v.id}
                  i={i}
                  v={v}
                  onChange={nv => setRijen(cur => cur.map(x => (x.id === v.id ? nv : x)))}
                />
              ))}
              <button type="button" className="btn btn-o" onClick={() => { setRijen([]); setFase("kies"); }}>
                Andere foto
              </button>
            </fieldset>
          )}
        </div>
        <div className="tm-sheet-foot">
          <div className="tm-sheet-sum">
            {fase === "check" && klaar.length ? (
              <>
                <b className="tm-num">
                  {klaar.length === 1 ? euro(tmVergoeding(klaar[0].f, klaar[0].t, klaar[0].k, klaar[0].ti)) : `${klaar.length} ritten`}
                </b>
                <span>Komt in de lijst en in de berekening.</span>
              </>
            ) : (
              <span>Kies een transportbon</span>
            )}
          </div>
          <button type="button" className="btn btn-p" disabled={!klaar.length} onClick={bewaar}>
            {klaar.length > 1 ? "Ritten toevoegen" : "Rit toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
