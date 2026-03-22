# Transporteur Dashboard

Dashboard voor **zelfstandig** ziekenhuisvervoer: slim ritbeheer, vergoeding/winst, vaste ritten, kaart en ziekenhuizen. Werkt op **desktop en mobiel**.

**Weergave:** licht/donker volgt automatisch de instelling van je telefoon of computer (geen aparte themaknop).

## Starten

```bash
npm install
npm run dev
```

Open in de browser (of op je telefoon in hetzelfde netwerk): `http://localhost:5173`.

Productiebuild: `npm run build` → map `dist/`.

## Gratis API-sleutel (kaart en afstand)

De **kaart** gebruikt **MapLibre** met **OpenStreetMap**-tegels en werkt zonder sleutel. Voor de **route-lijn** en **automatische afstand** via het wegennet kun je een **gratis** OpenRouteService-sleutel gebruiken:

1. Ga naar [OpenRouteService](https://openrouteservice.org/dev/#/signup) en maak een gratis account.
2. Kopieer je API-sleutel.
3. Maak in de projectmap een bestand `.env`:

```env
VITE_OPENROUTE_API_KEY=jouw_gratis_sleutel_hier
```

4. Herstart `npm run dev`.

Zonder sleutel: de kaart toont vertrek en bestemming; je kunt nog steeds **Rit vandaag toevoegen** als de vaste rit een vaste km-waarde heeft. De links naar **Waze** en **Google Maps** voor navigatie werken altijd.

**Ziekenhuizen zoeken** werkt **gratis** via OpenStreetMap (Nominatim) – geen API-sleutel nodig.

### Ziekenhuizenlijst (Vlaanderen)

De app bevat **alle ziekenhuizen / zorglocaties** uit **OpenStreetMap** binnen het **Vlaams Gewest** (plus vaste ankertjes voor de Excel-preset-routes). Gegevens: © [OpenStreetMap](https://www.openstreetmap.org/copyright)-bijdragers, ODbL.

Lijst vernieuwen (vereist internet):

```bash
npm run data:ziekenhuizen
```

Dit schrijft `src/data/ziekenhuizen-vlaanderen.json` opnieuw via de Overpass API.

## Gebruik

### Navigatie (mobiel)

Onderaan het scherm: **Dashboard** | **Ritten** | **Brandstof** | **Kaart** | **Meer**.

### Dashboard

- Financieel overzicht: omzet, benzinekosten, winst (vandaag / week / maand).
- Kilometers: vandaag, week, maand.

### Ritten

- **Vaste ritten**: standaard o.a. **UZ Brussel → UZ Leuven** en **UZ Brussel → Virga Jesse Hasselt**. Klik op een rit om de afstand in te vullen (eventueel via OpenRouteService als je een sleutel hebt).
- Vul eventueel datum en km handmatig aan, zie direct vergoeding en geschatte winst.
- **Rit opslaan**.
- **Meerdere ritten tegelijk** (achterstand): op dezelfde pagina kun je regels **plakken uit Excel** (tab-scheiding) of scheiden met **puntkomma** of **komma**. Standaardchauffeur (en optioneel voertuig) kies je boven het tekstveld als een regel geen chauffeurkolom heeft. Ritten worden als **voltooid** opgeslagen (geschikt voor nadien invoeren). Optioneel eerste regel met koppen: `Datum`, `Tijd`, `km`, `Chauffeur`, `Voertuig`. Datums ook als `DD/MM/YYYY`.

### Groot scherm (computer)

- Vanaf ca. **1024px** breed: **navigatie links** als kolom, inhoud rechts met meer breedte (max. ~1320px).
- Op de rittenpagina staan **één rit** en **bulkimport** naast elkaar vanaf ca. **960px**.
- Tab **Financieel**: op brede schermen staan **KPI-kaarten** en de **weekgrafiek** naast elkaar.

### Brandstof

- Optioneel: foto van tankbon uploaden → automatische invulling (OCR).
- Of handmatig: datum, liter, prijs.

### Kaart

- **Kies een rit** in de dropdown → kaart toont vertrek en bestemming (OpenStreetMap).
- **Rit vandaag toevoegen**: voeg de gekozen rit in één klik toe aan vandaag; hij komt in **Mijn ritten** (per week gerangschikt).
- Met een gratis OpenRouteService-sleutel: route-lijn op de kaart en automatische afstand.
- Links naar **Waze** en **Google Maps** voor navigatie.

### Meer

- **Ziekenhuizen zoeken**: zoek een ziekenhuis of adres (gratis, OpenStreetMap) en voeg toe aan je lijst.
- **Nieuwe vaste rit**: kies “Van” en “Naar” uit je ziekenhuizen; afstand wordt opgehaald via OpenRouteService (gratis) en opgeslagen.
- **Overige kosten** en **Gegevens**: tabellen ritten, brandstof, overige. **Mijn ritten** is per week gerangschikt (nieuwste week eerst).

## Vergoeding

- **€15** per rit (opstart)
- **€25** per 20 km

Voorbeeld: 45 km → €15 + 3×€25 = **€90**.

Gegevens worden lokaal opgeslagen (**localStorage**). **Ritten, brandstof en overige kosten** ouder dan ca. **twee maanden** (62 dagen) worden automatisch verwijderd om de browser licht te houden. Ziekenhuizen, vaste routes en voertuigen blijven bewaard.
