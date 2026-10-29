import { createContext, useCallback, useEffect, useState } from "react";
import "../transportme-theme.css";
import "./app.css";
import { apiLogin, apiLogout, loginFoutTekst, magLokaleToegang } from "../js/sessie.js";
import { kluisFlush, openKluis, sluitKluis } from "../js/veiligeOpslag.js";
import { startKluisSync, stopKluisSync, stuurKluisSync, syncNaLogin } from "../js/kluisSync.js";
import { migreerBonArchief, ruimVerlopenBonnenOp } from "../js/bonArchief.js";
import { wisLopendeMelding } from "../js/lopendeMelding.js";

export const UitlogContext = createContext(async () => {});

export default function Toegang({ children }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  const uitloggen = useCallback(async () => {
    stopKluisSync();
    try {
      await stuurKluisSync();
    } catch {
      /* lokaal uitloggen gaat voor */
    }
    await kluisFlush();
    sluitKluis();
    await wisLopendeMelding();
    await apiLogout();
    setOpen(false);
    setPin("");
    setFout("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const op = () => {
      kluisFlush();
    };
    window.addEventListener("pagehide", op);
    document.addEventListener("visibilitychange", op);
    return () => {
      window.removeEventListener("pagehide", op);
      document.removeEventListener("visibilitychange", op);
    };
  }, [open]);

  if (open) {
    return <UitlogContext.Provider value={uitloggen}>{children}</UitlogContext.Provider>;
  }

  const stuur = async e => {
    e.preventDefault();
    if (bezig || pin.length < 4) return;
    setBezig(true);
    setFout("");
    try {
      try {
        await apiLogin(pin);
      } catch (err) {
        if (!magLokaleToegang(err)) throw err;
      }
      const uit = await openKluis(pin);
      if (uit.migratie?.fout) {
        setFout("Niet alle lokale gegevens konden worden versleuteld. De rest blijft staan.");
      }
      try {
        await migreerBonArchief();
        await ruimVerlopenBonnenOp();
      } catch {
        /* archief is optioneel t.o.v. de ritlijst */
      }
      try {
        await syncNaLogin(pin);
      } catch {
        /* toestel blijft bruikbaar zonder serverkluis */
      }
      startKluisSync();
      setPin("");
      setOpen(true);
    } catch (err) {
      sluitKluis();
      if (String(err?.message || "").includes("decrypt") || String(err?.name || "") === "OperationError") {
        setFout("Deze code opent de lokale kluis niet. Gegevens blijven bewaard.");
      } else setFout(loginFoutTekst(err));
      setPin("");
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="tm-app tm-pin">
      <form className="tm-pin-kaart" onSubmit={stuur}>
        <h1>TransportMe</h1>
        <label className="fl" htmlFor="tm-pin">
          Toegangscode
        </label>
        <input
          id="tm-pin"
          className="tm-pin-in"
          type="password"
          autoComplete="current-password"
          autoFocus
          maxLength={64}
          value={pin}
          disabled={bezig}
          onChange={e => {
            setPin(e.target.value.slice(0, 64));
            setFout("");
          }}
        />
        {fout ? <p className="tm-warn">{fout}</p> : null}
        <button type="submit" className="btn btn-p btn-full" disabled={bezig || pin.length < 4}>
          {bezig ? "Controleren…" : "Openen"}
        </button>
      </form>
    </div>
  );
}
