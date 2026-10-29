import { useCallback, useEffect, useState } from "react";
import { haalBonBestand, lijstBonBestanden, openBonBlob, verwijderBonBestand } from "../js/bonArchief.js";

function bytesLabel(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${Math.round(x / 1024)} kB`;
  return `${(x / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function datumLabel(iso) {
  const d = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const [y, m, da] = d.split("-");
  return `${da}/${m}/${y}`;
}

export default function BewaardeBonnen({ pid }) {
  const [lijst, setLijst] = useState([]);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    setFout("");
    try {
      setLijst(await lijstBonBestanden(pid));
    } catch {
      setFout("De bewaarde bonnen konden niet worden geopend.");
    }
  }, [pid]);

  useEffect(() => {
    laad();
  }, [laad]);

  const open = async rec => {
    setFout("");
    try {
      const vol = await haalBonBestand(rec.id);
      if (!vol?.blob) {
        setFout("Dit bestand staat niet meer op dit toestel.");
        return;
      }
      openBonBlob(vol);
    } catch {
      setFout("Het bestand kon niet worden geopend.");
    }
  };

  const verwijder = async rec => {
    if (!confirm("Bestand verwijderen? De rit blijft staan.")) return;
    setBezig(true);
    try {
      await verwijderBonBestand(rec.id);
      await laad();
    } catch {
      setFout("Verwijderen is niet gelukt.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <section className="tm-meer-sec">
      <h2 className="tm-meer-sec-h">Bewaarde transportbonnen</h2>
      <div className="card">
        {fout ? <p className="tm-warn">{fout}</p> : null}
        {!lijst.length ? (
          <p className="tm-muted">Nog geen bonnen.</p>
        ) : (
          <ul className="tm-bon-archief">
            {lijst.map(rec => (
              <li key={rec.id} className="tm-bon-archief-rij">
                <div>
                  <strong>{rec.bon || rec.naam || "Transportbon"}</strong>
                  <small>
                    {[rec.naam, datumLabel(rec.d) || datumLabel(rec.toegevoegd), bytesLabel(rec.bytes)]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <div className="tm-bon-archief-act">
                  <button type="button" className="btn btn-o btn-sm" onClick={() => open(rec)} disabled={bezig}>
                    Openen
                  </button>
                  <button type="button" className="btn btn-gh btn-sm" onClick={() => verwijder(rec)} disabled={bezig}>
                    Weg
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
