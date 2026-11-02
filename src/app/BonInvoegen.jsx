import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PR, CA, ui, isN, RitMap, tmVergoeding } from "../TransportMe.jsx";
import { chauffeurNaam, euro, lijnVar, datumKort } from "./team.js";
import { terminateBonOcrWorker } from "../js/bonFotoOcr.js";
import { isPdfBestand, leesBonBestand } from "../js/leesBonBestand.js";
import { zetBonBestand } from "../js/bonArchief.js";
import {
  voorstelUitBonTekst,
  tripUitVoorstel,
  bonInhoudRegels,
  koppelBonAanRit,
  herberekenKoppeling,
  voorstelRijKlaar,
  markeerDubbeleRijen,
  isDubbeleBon,
  dubbeleMelding,
  planBonOpslag,
} from "../js/transportBon.js";
import {
  BESTAND_TIMEOUT_MS,
  geweigerdTekst,
  IMPORT_CONCURRENTIE,
  keurBatch,
  keurBonBestand,
  leesKop,
  mapMetLimiet,
  MAX_BESTANDEN,
  metTimeout,
} from "../js/importGrenzen.js";

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

function statusWoord(s) {
  if (s === "lopend") return "onderweg";
  if (s === "voltooid") return "voltooid";
  return "gepland";
}

function RijEditor({ v, onChange, i, bestaand }) {
  const kInt = Math.max(0, Math.round(Number(String(v.k).replace(",", ".")) || 0));
  const bedrag = v.f && v.t && kInt >= 1 ? tmVergoeding(v.f, v.t, kInt, v.ti) : 0;
  const kaart = v.coords;
  const extra = bonInhoudRegels(v.inhoud);
  const eerder = bestaand || (v.bestaandId ? { id: v.bestaandId, s: v.bestaandStatus, f: v.f, t: v.t, d: v.d } : null);
  return (
    <article className="tm-bon-rij">
      <header className="tm-bon-rij-h">
        <span className="tm-num">{v.bon || "Bon " + (i + 1)}</span>
        {isDubbeleBon(v) || v.vraagVoltooid ? <span className="tm-bon-dubbel-tag">Dubbel</span> : null}
        {v.kmBron === "lijst" ? <span className="tm-muted">Km uit de prijslijst</span> : null}
        {v.kmBron === "weg" ? <span className="tm-muted">Km over de weg</span> : null}
      </header>
      {v.vraagControle && !eerder ? (
        <div className="tm-bon-vraag">
          <p>Controleer IHcT-nummer en tijdstip. Zonder beide kan geen eerdere rit worden herkend.</p>
        </div>
      ) : null}
      {v.dubbelInBatch ? (
        <div className="tm-bon-vraag">
          <p>Dubbel. Staat hierboven.</p>
        </div>
      ) : eerder ? (
        <div className={"tm-bon-vraag" + (v.vraagVoltooid && v.voltooidKeuze == null ? " tm-bon-vraag--wacht" : "")}>
          {v.vraagVoltooid ? (
            <>
              <p>
                Eerdere rit
                {eerder.f && eerder.t ? `: ${eerder.f} → ${eerder.t}` : ""}
                {eerder.d ? `, ${datumKort(eerder.d)}` : ""}. Voltooid?
              </p>
              <div className="tm-chips" role="group" aria-label="Rit voltooid">
                <button
                  type="button"
                  className={"tm-chip" + (v.voltooidKeuze === true ? " on" : "")}
                  onClick={() => onChange({ ...v, voltooidKeuze: true, s: "voltooid" })}
                >
                  Ja, voltooid
                </button>
                <button
                  type="button"
                  className={"tm-chip" + (v.voltooidKeuze === false ? " on" : "")}
                  onClick={() => onChange({ ...v, voltooidKeuze: false, s: eerder.s === "lopend" ? "lopend" : "komend" })}
                >
                  Nee, nog niet
                </button>
              </div>
            </>
          ) : (
            <p>Dubbel. Staat al in de lijst ({statusWoord(eerder.s)}).</p>
          )}
        </div>
      ) : null}
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
            onChange={e => onChange({ ...v, d: e.target.value, _herkoppel: true })}
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
            onChange={e => onChange({ ...v, ti: e.target.value, _herkoppel: true })}
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
            onChange={e => onChange({ ...v, bon: e.target.value, _herkoppel: true })}
          />
        </div>
      </div>
      {extra.length ? (
        <dl className="tm-bon-extra">
          {extra.map(row => (
            <div key={row.l}>
              <dt>{row.l}</dt>
              <dd>{row.v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {kInt >= 1 && v.f && v.t ? (
        <p className="tm-hint" aria-live="polite">
          {euro(bedrag)}
          {isN(v.ti) ? ", nachttarief" : ""}
        </p>
      ) : null}
    </article>
  );
}

export default function BonInvoegenSheet({ all, startPid, onClose, onSave }) {
  const [pid, setPid] = useState(startPid);
  const [fase, setFase] = useState("kies");
  const [fout, setFout] = useState("");
  const [voortgang, setVoortgang] = useState(null);
  const [leesInfo, setLeesInfo] = useState("");
  const [rijen, setRijen] = useState([]);
  const [bewaren, setBewaren] = useState(false);
  const inp = useRef(null);
  const abortRef = useRef(null);
  const D = all[pid] || { xr: [], r: [] };
  const extra = useMemo(() => extraUitData(D), [D]);
  const ritten = D.r || [];

  useEffect(() => {
    const f = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      terminateBonOcrWorker().catch(() => {});
    },
    []
  );

  useEffect(() => {
    setRijen(cur => (cur.length ? markeerDubbeleRijen(cur.map(v => herberekenKoppeling(v, ritten))) : cur));
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps -- alleen opnieuw koppelen bij chauffeurwissel

  const stopLezen = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    terminateBonOcrWorker().catch(() => {});
    setFase("kies");
    setVoortgang(null);
    setLeesInfo("");
    setFout("Inlezen geannuleerd.");
  };

  const leesBestanden = useCallback(
    async fileList => {
      const batch = keurBatch(fileList);
      const meldingen = [];
      if (batch.geweigerd.length) meldingen.push(geweigerdTekst(batch.geweigerd));
      const ok = [];
      for (const file of batch.ok) {
        try {
          const kop = await leesKop(file);
          const keur = keurBonBestand(file, kop);
          if (!keur.ok) {
            meldingen.push(`${file.name}: ${keur.reden}`);
            continue;
          }
          ok.push(file);
        } catch {
          meldingen.push(`${file.name}: kon niet worden gecontroleerd.`);
        }
      }
      if (!ok.length) {
        setFout(meldingen.join(" ") || "Kies een foto of PDF.");
        return;
      }
      setFout(meldingen.join(" "));
      setFase("lezen");
      setVoortgang(0);
      setLeesInfo(ok.length > 1 ? `0 van ${ok.length}` : "");
      const extraKm = extra.extraKm;
      const extraPlaatsen = extra.extraPlaatsen;
      const perBestand = new Array(ok.length).fill(0);
      const klaarBestand = new Array(ok.length).fill(false);
      const meld = () => {
        const som = perBestand.reduce((a, b) => a + b, 0);
        setVoortgang(som / ok.length);
        setLeesInfo(ok.length > 1 ? `${klaarBestand.filter(Boolean).length} van ${ok.length}` : "");
      };
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const groepen = await mapMetLimiet(
          ok,
          IMPORT_CONCURRENTIE,
          async (file, i, signal) => {
            const bestand = { id: ui(), file };
            try {
              const stukken = await metTimeout(
                leesBonBestand(file, {
                  signal,
                  logger: m => {
                    if (m.status === "recognizing text" && typeof m.progress === "number") {
                      perBestand[i] = 0.2 + m.progress * 0.7;
                      meld();
                    }
                  },
                  onVoortgang: p => {
                    perBestand[i] = p;
                    meld();
                  },
                }),
                BESTAND_TIMEOUT_MS,
                signal
              );
              const rows = [];
              const waarschuwingen = [];
              for (const stuk of stukken) {
                if (stuk.waarschuwing) waarschuwingen.push(stuk.waarschuwing);
                const voorstel = await voorstelUitBonTekst(stuk.text || "", { extraKm, extraPlaatsen });
                rows.push(koppelBonAanRit({ ...voorstel, id: ui(), bestand }, ritten));
              }
              perBestand[i] = 1;
              klaarBestand[i] = true;
              meld();
              return { rows, naam: file.name, waarschuwing: waarschuwingen.filter(Boolean)[0] || "" };
            } catch (e) {
              klaarBestand[i] = true;
              perBestand[i] = 1;
              meld();
              if (e?.name === "AbortError") throw e;
              return { rows: [], naam: file.name, fout: e?.message || "kon niet worden gelezen" };
            }
          },
          { signal: ctrl.signal }
        );
        const next = groepen.flatMap(g => g.rows);
        const mislukt = groepen.filter(g => g.fout);
        const extraWarn = groepen.map(g => g.waarschuwing).filter(Boolean);
        if (!next.length) {
          setFout(
            mislukt.length
              ? mislukt.map(g => `${g.naam}: ${g.fout}`).join(" ")
              : "Kon niet worden gelezen. Probeer een scherpere foto of een andere PDF."
          );
          setFase("kies");
          return;
        }
        const stukken = [...meldingen];
        if (mislukt.length) stukken.push(mislukt.map(g => `${g.naam}: ${g.fout}`).join(" "));
        if (extraWarn.length) stukken.push(extraWarn.join(" "));
        setFout(stukken.filter(Boolean).join(" "));
        setRijen(markeerDubbeleRijen(next));
        setFase("check");
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error(e);
        setFout("Kon niet worden gelezen. Probeer een scherpere foto of een andere PDF.");
        setFase("kies");
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setVoortgang(null);
        setLeesInfo("");
      }
    },
    [extra, ritten]
  );

  const klaar = rijen.filter(voorstelRijKlaar);
  const wachtAntwoord = rijen.filter(v => v.vraagVoltooid && v.voltooidKeuze == null).length;

  const wijzigRij = (id, nv) => {
    setRijen(cur =>
      markeerDubbeleRijen(
        cur.map(x => {
          if (x.id !== id) return x;
          const her = nv._herkoppel;
          const { _herkoppel, ...rest } = nv;
          const merged = { ...x, ...rest };
          return her ? herberekenKoppeling(merged, ritten) : merged;
        })
      )
    );
  };

  const bewaar = async () => {
    if (!klaar.length || bewaren) return;
    setBewaren(true);
    const actueel = (all[pid] || { r: [] }).r || [];
    const plan = planBonOpslag(rijen.filter(voorstelRijKlaar), actueel);
    let archiefFout = false;
    let archiefOk = 0;
    const seen = new Set();
    const teArchiveren = [...plan.nieuw, ...plan.updates.map(u => u.voorstel)];
    for (const v of teArchiveren) {
      const b = v.bestand;
      if (!b?.file || seen.has(b.id)) continue;
      seen.add(b.id);
      try {
        const type = b.file.type || (isPdfBestand(b.file) ? "application/pdf" : "image/jpeg");
        await zetBonBestand({
          id: b.id,
          pid,
          naam: b.file.name || "transportbon",
          type,
          blob: b.file.slice(0, b.file.size, type),
          bon: v.bon || "",
          d: v.d || "",
          tripId: v.bestaandId || "",
          toegevoegd: new Date().toISOString(),
        });
        archiefOk++;
      } catch {
        archiefFout = true;
      }
    }
    const nieuw = [];
    const updates = [];
    for (const v of plan.nieuw) {
      const k = Math.max(1, Math.round(Number(String(v.k).replace(",", ".")) || 0));
      const voltooid = v.voltooidKeuze !== false && v.s !== "komend" && v.s !== "lopend";
      nieuw.push(
        tripUitVoorstel(
          { ...v, k, s: voltooid ? "voltooid" : v.s === "lopend" ? "lopend" : "komend" },
          {
            id: ui(),
            chauffeur: chauffeurNaam(pid),
            voertuig: CA[0],
            bestandId: v.bestand?.id,
          }
        )
      );
    }
    for (const u of plan.updates) {
      const v = u.voorstel;
      const k = Math.max(1, Math.round(Number(String(v.k).replace(",", ".")) || 0));
      const voltooid = v.voltooidKeuze !== false && v.s !== "komend" && v.s !== "lopend";
      const trip = tripUitVoorstel(
        { ...v, k, s: voltooid ? "voltooid" : v.s === "lopend" ? "lopend" : "komend" },
        {
          id: ui(),
          chauffeur: chauffeurNaam(pid),
          voertuig: CA[0],
          bestandId: v.bestand?.id,
        }
      );
      const patch = {
        bon: trip.bon || undefined,
        bonInhoud: trip.bonInhoud,
        bonBestandId: trip.bonBestandId,
      };
      if (v.vraagVoltooid) patch.s = trip.s;
      if (!patch.bon) delete patch.bon;
      updates.push({ id: u.id, patch });
    }
    onSave(
      pid,
      { nieuw, updates },
      {
        archiefFout,
        archiefOk,
        overgeslagenDubbel: plan.overgeslagenDubbel,
        volledigGeslaagd: !archiefFout && (nieuw.length > 0 || updates.length > 0),
      }
    );
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
              <legend>Bonnen</legend>
              <p className="tm-card-p" style={{ marginTop: 0 }}>
                Foto of PDF. Max. {MAX_BESTANDEN} bestanden.
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
                    ? `Lezen… ${leesInfo ? leesInfo + " · " : ""}${Math.round(voortgang * 100)}%`
                    : "Bonnen lezen…"
                  : "Foto’s of PDF’s kiezen"}
                <input
                  ref={inp}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  multiple
                  disabled={fase === "lezen"}
                  className="tm-file-hidden"
                  onChange={e => {
                    leesBestanden(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {fase === "lezen" ? (
                <button type="button" className="btn btn-o btn-full" style={{ marginTop: 8 }} onClick={stopLezen}>
                  Annuleren
                </button>
              ) : null}
              {fout ? <p className="tm-warn">{fout}</p> : null}
            </fieldset>
          ) : (
            <fieldset className="tm-fs">
              <legend>{rijen.length === 1 ? "Rit uit de bon" : `${rijen.length} ritten uit de bonnen`}</legend>
              {fout ? <p className="tm-warn">{fout}</p> : null}
              {dubbeleMelding(rijen) ? <p className="tm-warn tm-bon-dubbel-sam">{dubbeleMelding(rijen)}</p> : null}
              {rijen.map((v, i) => (
                <RijEditor
                  key={v.id}
                  i={i}
                  v={v}
                  bestaand={(ritten || []).find(r => r.id === v.bestaandId)}
                  onChange={nv => wijzigRij(v.id, nv)}
                />
              ))}
              <button
                type="button"
                className="btn btn-o"
                onClick={() => {
                  setRijen([]);
                  setFase("kies");
                  setFout("");
                }}
              >
                Andere bestanden
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
                {dubbeleMelding(rijen) ? <span>Dubbele worden overgeslagen.</span> : null}
              </>
            ) : wachtAntwoord ? (
              <span>Zeg bij de eerdere rit of hij voltooid is.</span>
            ) : (
              <span>Kies foto’s of PDF’s</span>
            )}
          </div>
          <button type="button" className="btn btn-p" disabled={!klaar.length || bewaren} onClick={bewaar}>
            {bewaren ? "Bewaren…" : rijen.length > 1 || klaar.length > 1 ? "Alle ritten toevoegen" : "Rit toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
