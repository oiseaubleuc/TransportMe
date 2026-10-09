# TransportMe

Planning, ritten en facturen voor ziekenhuisvervoer in België. De app is bedoeld voor de **beheerder**: je ziet alle chauffeurs samen, plant ritten, volgt de dagkaart en maakt facturen en een rittenlijst.

Werkt op **telefoon en computer**. Licht/donker volgt de instelling van je toestel.

## Starten

```bash
npm install
npm run dev
```

Open in de browser: `http://localhost:5173`.

Productiebuild: `npm run build` → map `dist/`.

## Vijf schermen

Onderaan op de telefoon (bovenaan links op groot scherm):

1. **Overzicht** — dagkaart per chauffeur, ritten onderweg, deze week, en ritten die nog afgewerkt moeten worden.
2. **Planning** — alle ritten, gegroepeerd per dag. Zoeken, filteren, starten, voltooien en aanpassen.
3. **Chauffeurs** — status en cijfers van de maand per chauffeur.
4. **Financieel** — omzet, kosten en netto van het team of van één chauffeur. Factuur (PDF), rittenlijst (Excel) en kosten.
5. **Instellingen** — factuurgegevens en logo, back-up, vaste routes, bonnen inlezen, tarieven.

**Nieuwe rit** staat als knop boven de navigatie (telefoon) of onderaan de linkerbalk (computer).

Op groot scherm (vanaf 1024px) staat de navigatie links (232px). De inhoud is max. 1160px breed.

## Rittenlijst (Excel)

In **Financieel → Ritten en factuur** en in het teamoverzicht:

- **Rittenlijst downloaden (Excel)** — één blad *Rittenregistratie* (of één blad per chauffeur voor het team), in hetzelfde formaat als het klantsjabloon.
- **Factuur downloaden (PDF)**
- **CSV voor boekhouder**

De Excel heeft parameters bovenaan (prijs per schijf, opstart, nacht, btw), één regel per bonnummer, en formules voor totaal excl. btw, btw en totaal incl. btw.

## Vergoeding

- **€15** per rit (opstart)
- **€25** per begonnen 20 km
- Nachtrit (20:00–05:00): +30% op het aantal schijven
- Forfait Sango / RKV Mechelen ↔ UZA Edegem: **€35**, zonder nachttoeslag

Voorbeeld: 45 km overdag = €15 + 3×€25 = **€90**. ’s Nachts wordt dat **€115**.

## Gegevens

Alles blijft op het toestel. Bestaande gegevens blijven werken zonder extra stappen. Een volledige back-up (en terugzetten) vind je onder Instellingen.

## Kaart en afstand

De kaart toont vertrek en bestemming. Afstanden worden over de weg gemeten. Zonder extra instelling werkt de gratis routedienst; met een Google-sleutel kan de app Google Maps gebruiken.

**Ziekenhuizen zoeken** werkt via OpenStreetMap (Nominatim).

Lijst van Vlaamse ziekenhuizen vernieuwen:

```bash
npm run data:ziekenhuizen
```
