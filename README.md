# Transporteur Dashboard

Dashboard voor ziekenhuisvervoer: rendabiliteit, vaste ritten, kaart en ziekenhuizen zoeken. Werkt op **desktop en mobiel**.

## Starten

```bash
npm install
npm run dev
```

Open in de browser (of op je telefoon in hetzelfde netwerk): `http://localhost:5173`.

Productiebuild: `npm run build` → map `dist/`.

## Gratis API-sleutel (kaart en afstand)

De **kaart** gebruikt **OpenStreetMap** (Leaflet) en werkt zonder sleutel. Voor de **route-lijn** en **automatische afstand** kun je een **gratis** sleutel gebruiken:

1. Ga naar [OpenRouteService](https://openrouteservice.org/dev/#/signup) en maak een gratis account.
2. Kopieer je API-sleutel.
3. Maak in de projectmap een bestand `.env`:

```env
VITE_OPENROUTE_API_KEY=jouw_gratis_sleutel_hier
```

4. Herstart `npm run dev`.

Zonder sleutel: de kaart toont vertrek en bestemming; je kunt nog steeds **Rit vandaag toevoegen** als de vaste rit een vaste km-waarde heeft. De links naar **Waze** en **Google Maps** voor navigatie werken altijd.

**Optioneel – Google Maps**: voor **ziekenhuizen zoeken met suggesties** kun je daarnaast `VITE_GOOGLE_MAPS_API_KEY` in `.env` zetten (Maps JavaScript API + Places API).

## Gebruik

### Navigatie (mobiel)

Onderaan het scherm: **Dashboard** | **Ritten** | **Brandstof** | **Kaart** | **Meer**.

### Dashboard

- Financieel overzicht: omzet, benzinekosten, winst (vandaag / week / maand).
- Kilometers: vandaag, week, maand.

### Ritten

- **Vaste ritten**: standaard o.a. **UZ Brussel → UZ Leuven** en **UZ Brussel → Virga Jesse Hasselt**. Klik op een rit om de afstand in te vullen (of op te halen via Google als je een API-sleutel hebt).
- Vul eventueel datum en km handmatig aan, zie direct vergoeding en geschatte winst.
- **Rit opslaan**.

### Brandstof

- Optioneel: foto van tankbon uploaden → automatische invulling (OCR).
- Of handmatig: datum, liter, prijs.

### Kaart

- **Kies een rit** in de dropdown → kaart toont vertrek en bestemming (OpenStreetMap).
- **Rit vandaag toevoegen**: voeg de gekozen rit in één klik toe aan vandaag; hij komt in **Mijn ritten** (per week gerangschikt).
- Met een gratis OpenRouteService-sleutel: route-lijn op de kaart en automatische afstand.
- Links naar **Waze** en **Google Maps** voor navigatie.

### Meer

- **Ziekenhuizen zoeken**: zoek een ziekenhuis (met API-sleutel) en voeg toe aan je lijst.
- **Nieuwe vaste rit**: kies “Van” en “Naar” uit je ziekenhuizen; afstand wordt opgehaald (OpenRouteService of Google) en opgeslagen.
- **Overige kosten** en **Gegevens**: tabellen ritten, brandstof, overige. **Mijn ritten** is per week gerangschikt (nieuwste week eerst).

## Vergoeding

- **€15** per rit (opstart)
- **€25** per 20 km

Voorbeeld: 45 km → €15 + 3×€25 = **€90**.

Gegevens worden lokaal opgeslagen (localStorage).
