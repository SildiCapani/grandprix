# Apex Rush 🏁

3D-Kart-Racer (three.js) mit Items, Power-Drifts, Boost-Pads, 6 Fahrzeugen (3D-Garage), 9 Strecken und Speed-Klassen 80/100/120 km/h.
Online-Multiplayer läuft über einen **eigenen Node.js-Server** (Raumcodes, bis 8 Fahrer, KI-Auffüllung).

## Voraussetzungen
- [Node.js 20+](https://nodejs.org) (LTS)
- VS Code

## Starten (Entwicklung)
```bash
npm install
npm run dev
```
Dann **http://localhost:5173** öffnen. Änderungen am Code laden sofort neu (Hot Reload).
In VS Code geht es auch über `Strg+Shift+B` (Task „Spiel starten (dev)“).

`npm run dev` startet zwei Dinge gleichzeitig:

| Teil | Port | Aufgabe |
|---|---|---|
| Vite (Client) | 5173 | liefert das Spiel aus, Hot Reload |
| Server | 3001 | Online-Relay unter `/ws` (Vite leitet `/ws` dorthin weiter) |

## Fertige Version (so wie online)
```bash
npm run serve      # baut nach dist/ und startet den Server
```
Dann **http://localhost:3001** öffnen. Ein einziger Prozess liefert Spiel **und** Multiplayer aus.

## Online spielen
- Alle öffnen **dieselbe Server-Adresse**, z. B. `http://localhost:3001`, eure LAN-IP oder die Render-URL.
- So geht ein Rennen:
  1. „Online“ wählen und einen Raum erstellen.
  2. Den Code teilen (er beginnt mit **RS…**).
  3. Freunde treten mit dem Code bei.
- „Über Server spielen“ ist die Standardeinstellung. Das läuft über normales HTTP(S)/WebSocket und funktioniert deshalb auch im **eduroam**.
- Im selben WLAN reicht dein Laptop als Server:
  1. `npm run dev` starten.
  2. Freunde öffnen `http://<deine-IP>:5173`. Die IP zeigt Vite als „Network“ an.
- Im eduroam sind Geräte untereinander oft blockiert. Dann den Cloud-Server unten nehmen.

## Kostenlos ins Internet stellen (Render, Frankfurt)
1. Projekt auf GitHub hochladen.
2. Auf [render.com](https://render.com) *New* → *Blueprint* wählen und das Repo auswählen. Render nutzt dann `render.yaml`.
3. Fertig: die Adresse `https://apex-rush-xxxx.onrender.com` an alle schicken.

Hinweis: Der Gratis-Plan schläft nach 15 Minuten ohne Besucher ein. Der erste Aufruf dauert dann etwa 30 Sekunden.

Alternativ läuft das `Dockerfile` auf Fly.io, Railway o. Ä. Wähle dort die Region Frankfurt, dann ist die Latenz gering.

## Fahrzeuge

| Kart | Stärke | Schwäche |
|---|---|---|
| Apex GT | ausgewogen | – |
| Thunder Bolide | höchster Topspeed | träge in Kurven, langsames Anfahren |
| Pixel Flitzer | wendig, beschleunigt schnell | weniger Topspeed, leicht |
| Iron Brummer | sehr schwer, rammt alle weg | langsames Anfahren |
| Neon Drifter | lädt Mini-Turbos viel schneller | etwas weniger Topspeed |
| Rally Buggy | fast volles Tempo im Gelände | etwas langsamer auf Asphalt |

Wer bei hohem Tempo hart lenkt, verliert Geschwindigkeit („Radieren“). Ein Power-Drift kostet kein Tempo.
Gewählt wird in der **Garage** (Menü → „Zur Garage“): Kart in 3D auf dem Drehteller, alle Werte und die Lackierung.
Die Werte stehen in `client/src/game/karts.js`.

## Strecken
1. Riviera Küstenring
2. Canyon Sunset
3. Neon Boulevard
4. **Vulkan Inferno**: Achterbahn-Viadukt über Lava, eine Brücke über die eigene Strecke und ein Sprung über einen Lavafluss.
5. **Gletscherpass**: Serpentinen den Berg hinauf (über 40 m Höhenunterschied), Gipfelabfahrt mit Sprungschanzen.
6. **Sternenbahn**: eine Regenbogenstraße im All mit Spirale und Sprüngen über Lücken.
7. **Dschungel-Tempel**, 8. **Savannen-Safari**, 9. **Pilzwald**: jeweils zwei Offroad-Abkürzungen (gelbe Schilder, gestrichelt auf der Karte). Ohne Pilz, Stern oder Turbo bist du dort sehr langsam, mit dem Rally Buggy fast so schnell wie auf der Straße.

Alle Strecken sind von Anfang an frei.

## Projektstruktur
```
client/
  index.html          Menü- und HUD-Markup
  src/main.js         UI, Kamera, Rendering, Spiel-Loop
  src/styles.css      Design
  src/game/
    race-core.js      Physik, KI, Items, Drifts, Sprünge, Speed-Klassen
    karts.js          Fahrzeugwerte
    garage.js         3D-Garage zur Fahrzeugwahl
    tracks.js         Streckendaten inkl. Höhen, Brücken, Sprungschanzen
    world.js          Prozedurale 3D-Welten (inkl. Vulkan, Berge, Weltall)
    car-model.js      Auto-Modelle
    multiplayer.js    Lobby- & Rennprotokoll (Host-Autorität)
    room-signaling.js Raumcodes, P2P-/Server-Verbindung
    mqtt-relay.js     Server-Relay (eigener Server + öffentliche Fallbacks)
    progression.js    XP, Level, Bestzeiten
    race-audio.js     Sound
server/server.js      Statische Auslieferung + WebSocket-Relay /ws
```

## Steuerung

| Taste | Aktion |
|---|---|
| WASD / Pfeiltasten | fahren |
| Leertaste | driften (Blau → Orange → Lila) |
| E (tippen) | Item benutzen |
| E (halten) | Banane/Panzer hinten ans Kart hängen: blockt Panzer von hinten. Loslassen wirft nach hinten |
| R | zurücksetzen |
| C | Kamera wechseln |
