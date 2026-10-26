import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { chauffeurNaam, ritSortKey } from "./team.js";
import { toonLopendeMelding, wisLopendeMelding } from "../js/lopendeMelding.js";

function useNu(ms = 15000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setN(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

function minutenOnderweg(r, nu) {
  const d = String(r?.d || "").slice(0, 10);
  const ti = String(r?.ti || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(ti)) return null;
  const start = new Date(`${d}T${ti.padStart(5, "0")}:00`);
  if (Number.isNaN(start.getTime())) return null;
  const m = Math.floor((nu.getTime() - start.getTime()) / 60000);
  return m >= 0 ? m : 0;
}

function duurTekst(min) {
  if (min == null) return "";
  if (min < 60) return `${min} min`;
  const u = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${u} u ${String(rest).padStart(2, "0")}` : `${u} u`;
}

export default function LopendeEiland({ ritten, ritActie }) {
  const nu = useNu();
  const lopend = (ritten || [])
    .filter(r => r.s === "lopend")
    .sort((a, b) => ritSortKey(b).localeCompare(ritSortKey(a)));
  const rit = lopend[0] || null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!rit) setOpen(false);
  }, [rit?.id, rit?._pid]);

  useEffect(() => {
    if (!open) return;
    const sluit = e => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", sluit);
    return () => window.removeEventListener("keydown", sluit);
  }, [open]);

  useEffect(() => {
    document.documentElement.classList.toggle("tm-eiland-aan", !!rit);
    if (rit) toonLopendeMelding(rit);
    else wisLopendeMelding();
    return () => {
      document.documentElement.classList.remove("tm-eiland-aan");
    };
  }, [rit?.id, rit?._pid, rit?.f, rit?.t]);

  useEffect(() => {
    if (!rit) return;
    const op = () => {
      if (document.visibilityState === "hidden") toonLopendeMelding(rit);
    };
    document.addEventListener("visibilitychange", op);
    window.addEventListener("pagehide", op);
    return () => {
      document.removeEventListener("visibilitychange", op);
      window.removeEventListener("pagehide", op);
    };
  }, [rit?.id, rit?._pid, rit?.f, rit?.t]);

  if (!rit || typeof document === "undefined") return null;

  const min = minutenOnderweg(rit, nu);
  const extra = lopend.length - 1;

  return createPortal(
    <div className={"tm-eiland" + (open ? " is-open" : "")} role="status" aria-live="polite">
      <button
        type="button"
        className="tm-eiland-kern"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className="tm-eiland-dot" aria-hidden="true" />
        <span className="tm-eiland-kort">
          <b>Onderweg</b>
          <span>
            {rit.t || "rit"}
            {extra > 0 ? ` · +${extra}` : ""}
          </span>
        </span>
        {min != null ? <span className="tm-eiland-tijd">{duurTekst(min)}</span> : null}
      </button>
      {open ? (
        <div className="tm-eiland-meer">
          <p>
            {rit.f} → {rit.t}
          </p>
          <small>
            {chauffeurNaam(rit._pid)}
            {rit.ti ? ` · ${rit.ti}` : ""}
            {rit.k ? ` · ${rit.k} km` : ""}
          </small>
          <button type="button" className="btn btn-p btn-sm" onClick={() => ritActie(rit._pid, rit.id, "ok")}>
            Voltooien
          </button>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
