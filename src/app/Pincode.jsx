import { useState } from "react";
import "../transportme-theme.css";
import "./app.css";

const SLEUTEL = "tm_pin_ok";
const PIN = "1869";

function alOpen() {
  try {
    return sessionStorage.getItem(SLEUTEL) === "1";
  } catch {
    return false;
  }
}

export default function Pincode({ children }) {
  const [open, setOpen] = useState(alOpen);
  const [pin, setPin] = useState("");
  const [fout, setFout] = useState(false);

  if (open) return children;

  const stuur = e => {
    e.preventDefault();
    if (pin === PIN) {
      try {
        sessionStorage.setItem(SLEUTEL, "1");
      } catch {
        /* privémodus mag de sessie weigeren; deze tab blijft open */
      }
      setOpen(true);
      return;
    }
    setFout(true);
    setPin("");
  };

  return (
    <div className="tm-app tm-pin">
      <form className="tm-pin-kaart" onSubmit={stuur}>
        <h1>TransportMe</h1>
        <label className="fl" htmlFor="tm-pin">
          Pincode
        </label>
        <input
          id="tm-pin"
          className="tm-pin-in"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={4}
          value={pin}
          onChange={e => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            setFout(false);
          }}
        />
        {fout ? <p className="tm-warn">Verkeerde pincode.</p> : null}
        <button type="submit" className="btn btn-p btn-full" disabled={pin.length < 4}>
          Openen
        </button>
      </form>
    </div>
  );
}
