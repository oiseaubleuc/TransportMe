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
5. **Instellingen** — prijslijst aanvullen of corrigeren, factuurgegevens en logo, back-up, bonnen inlezen, tarieven.

**Nieuwe rit** staat als knop boven de navigatie (telefoon) of onderaan de linkerbalk (computer).

Op groot scherm (vanaf 1024px) staat de navigatie links (232px). De inhoud is max. 1160px breed.

## Rittenlijst (Excel)

In **Financieel → Ritten en factuur** en in het teamoverzicht:

- **Rittenlijst downloaden (Excel)** — één blad *Rittenregistratie* (of één blad per chauffeur voor het team), in hetzelfde formaat als het klantsjabloon.
- **Rittenlijst inlezen (Excel)** — in Planning of bij de factuur: dezelfde klantbestanden (zoals `Ritten_maand_augustus.xlsx`) vullen automatisch de voltooide ritten in.
- **Factuur downloaden (PDF)**
- **CSV voor boekhouder**

De Excel heeft parameters bovenaan (prijs per schijf, opstart, nacht, btw), één regel per bonnummer, en formules voor totaal excl. btw, btw en totaal incl. btw.

## Vergoeding

- **€15** per rit (opstart)
- **€25** per begonnen 20 km
- Nachtrit (20:00–05:00): +30% op het aantal schijven
- Forfait Sango / RKV Mechelen ↔ UZA Edegem: **€35**, zonder nachttoeslag

Voorbeeld: 45 km overdag = €15 + 3×€25 = **€90**. ’s Nachts wordt dat **€115**.

## Toegang

De app vraagt een toegangscode die **op de server** wordt gecontroleerd (HttpOnly-cookie, geen pincode in de frontend).

1. Lokaal: `printf '%s' 'jouw-code' | node scripts/hash-pin.mjs`
2. Plak de vier regels (`SESSION_SECRET`, `AUTH_PIN_SALT`, `AUTH_PIN_HASH`, `AUTH_PEPPER`) in `.env` **en** in Vercel → Settings → Environment Variables.
3. In Vercel: elk van de vier aanzetten voor **Production, Preview en Development**. Geen `VITE_`-prefix, geen aanhalingstekens rond de waarde.
4. Daarna **Redeploy** van de site. Nieuwe variabelen gelden pas na een nieuwe publicatie.
5. De publieke URL (`transport-tawny-xi.vercel.app`) is Production. Zolang deze branch niet naar Production is gepubliceerd, heeft die URL geen `/api/login`. Een Preview-URL moet bovendien Deployment Protection hebben uitgezet, anders blokkeert Vercel de login vóór de app.

Zonder die vier weigert de server de login; er is geen fallback. Er is geen publieke registratie.

## Gegevens

Ritten blijven op het toestel. Na een geslaagde login worden bestaande localStorage- en IndexedDB-gegevens versleuteld (AES-GCM; sleutel in geheugen, afgeleid van de toegangscode; naast de data staat alleen een zout).

**Wat dit wel doet:** iemand met alleen de bestanden op schijf ziet na migratie geen leesbare ritten of originele bonnen.

**Wat dit niet doet:** een login beschermt bestaande plaintext pas ná migratie; XSS in de open sessie kan de geheugensleutel nog gebruiken; de toegangscode gaat bij login naar de server (geen zero-knowledge); back-ups bevatten ciphertext plus kluismeta — zonder code niet leesbaar, mét code wel.

Originele bonnen worden na de ingestelde bewaartermijn (standaard 62 dagen, Instellingen) verwijderd.

De vaste ritten komen uit de **prijslijst van 26 mei**. Ontbreekt een rit of klopt een km niet, dan pas je dat aan onder Instellingen → Prijslijst aanvullen. Jouw wijziging gaat voor op de prijslijst.

## Kaart en afstand

De kaart toont vertrek en bestemming. Afstanden worden over de weg gemeten. Zonder extra instelling werkt de gratis routedienst; met een Google-sleutel kan de app Google Maps gebruiken.

**Ziekenhuizen zoeken** werkt via OpenStreetMap (Nominatim).

Lijst van Vlaamse ziekenhuizen vernieuwen:

```bash
npm run data:ziekenhuizen
```
