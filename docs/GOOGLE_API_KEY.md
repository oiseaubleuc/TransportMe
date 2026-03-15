# Optioneel: Google API-sleutel

De app werkt **volledig gratis** zonder Google:

- **Ziekenhuizen zoeken** → OpenStreetMap (Nominatim), geen sleutel
- **Kaart en route** → MapLibre + OpenRouteService (gratis ORS-sleutel)
- **Afstand** → OpenRouteService

Je hebt **geen** Google API-sleutel nodig.

Als je toch Google Maps wilt gebruiken (bijv. als fallback voor afstand als ORS niet beschikbaar is), kun je een sleutel aanmaken in [Google Cloud Console](https://console.cloud.google.com/) (Maps JavaScript API + Places API). Zet die in `.env` als `VITE_GOOGLE_MAPS_API_KEY=...`. Dit is **optioneel** en niet aanbevolen vanwege kosten na het gratis quotum.
