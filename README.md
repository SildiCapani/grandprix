# Apex Rush 🏁

3D-Kart-Racer (three.js) mit Items, Power-Drifts, Boost-Pads, 6 Fahrzeugen (3D-Garage), 12 Strecken, Grand-Prix-Cups mit Siegerpodest, Ballon-Battle, Strecken-Editor, optionaler Karriere mit Aufträgen und Speed-Klassen 80/100/120 km/h.
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
10. **Wolkeninseln**: schwebende Straße über einem Wolkenmeer. Eine Acht mit Brücke über die eigene Strecke und zwei Sprünge durch die Wolken.
11. **Kirschblütental**: Torii-Tore, Pagode am See und eine Abkürzung durch den Bambushain.
12. **Mondbasis Luna**: wenig Schwerkraft. Drei lange Kratersprünge, bei denen du höher fliegst und länger in der Luft bleibst.

## Spielmodi
| Modus | Worum es geht |
|---|---|
| Grand Prix | 3 Runden gegen 7 Gegner |
| Cups | 3 Rennen am Stück mit Punkten (15 · 12 · 10 · 8 · 6 · 4 · 2 · 1). Die Top 3 stehen am Ende auf dem 3D-Podest. Pokale werden pro Speed-Klasse gespeichert. |
| Battle | Ballon-Battle, Münzjagd oder Kronenjagd (siehe unten) |
| Zeitfahren | allein auf Bestzeit |
| Online | Raumcode, bis 8 Fahrer |

### Cups
- **Küsten-Cup:** Küste, Canyon, Neon
- **Wildnis-Cup:** Dschungel, Savanne, Pilzwald
- **Gipfel-Cup:** Vulkan, Gletscher, Kirschblüten
- **Sternen-Cup:** Sternenbahn, Wolkeninseln, Mond

Pokal-Bonus: Gold 300 XP, Silber 200 XP, Bronze 100 XP.

### Battles (8 Fahrer, je eigene Arena)
| Battle | Arena | Regeln |
|---|---|---|
| 🎈 Ballon-Battle | Neon-Arena | 3 Ballons; Treffer lassen einen platzen; Pilz-Rammer klauen einen (max. 5). Ohne Ballons bist du raus, der Letzte gewinnt. Nach 2:30 entscheiden die Ballons. |
| 🪙 Münzjagd | Wüsten-Kolosseum | Münzen sammeln; ein Treffer kostet 3 Münzen, die die anderen aufsammeln können. Zwei Sprungschanzen. Nach 2:00 gewinnt, wer die meisten hat. |
| 👑 Kronenjagd | Eis-Arena | Die Krone berühren und halten (ihr Träger ist etwas langsamer). Ein Treffer lässt sie fallen, ein Pilz-Rammer klaut sie. Wer sie insgesamt 20 Sekunden hält, gewinnt. Das Eis ist spiegelglatt. |

### Strecken-Editor
Im Menü auf die Karte **Eigene Strecke bauen** klicken.

- **Bauen:** Punkte verschieben, durch Klick auf die Strecke neue einfügen und mit Rechtsklick oder Entf löschen.
- **Höhe und Sprünge:** Pro Punkt lässt sich die Höhe einstellen; hebst du einen Teil mindestens 6 m an, wird daraus eine Brücke. Sprungschanzen kannst du mit Lücke setzen.
- **Welt:** Eine der 12 Welten wählen.
- **Prüfung:** Der Editor warnt vor Überschneidungen, zu engen Kurven und steilen Rampen.
- **Testfahrt:** Mit Gegnern oder allein.
- **Teilen:** **Code kopieren** erzeugt einen Code wie `APX1-…`. Freunde laden ihn über **Code laden**.
- **Einschränkungen:** Eigene Strecken zählen nicht für XP und Bestzeiten und gibt es bisher nur offline.

## Karriere (optional)
Im Menü unter **Karriere-Fortschritt** lässt sie sich AN- oder AUSschalten.

- **AN:** Dein Fahrerlevel schaltet nach und nach frei:
  - Strecken: Start mit Küste, Canyon und Neon.
  - Karts: Flitzer ab Level 2, Drifter ab 3, Buggy ab 4, Bolide ab 5, Brummer ab 6.
  - Lack-Finishes: Gold ab Level 3, Chrom ab 5, Neon ab 7.
- **Aufträge:** Es sind immer drei offen, z. B. „Überhole 25 Gegner“ oder „Lande 12 Sprünge“. Sie geben Bonus-XP und werden nach dem Abschluss ersetzt. Mit jeder Runde durch alle Aufträge werden sie etwas schwerer. Es gibt keine Timer und keine Tages-Aufgaben.
- **AUS:** Alles ist sofort frei, und es gibt keine Aufträge.

Mit `?alle` in der Adresse ist zum Testen auch alles frei.

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
    progression.js    XP, Level, Bestzeiten, Freischaltungen, Aufträge
    cups.js           Cups, Punkte, Gesamtwertung
  src/editor.js       Strecken-Editor (2D), Strecken-Codes
    race-audio.js     Sound
server/server.js      Statische Auslieferung + WebSocket-Relay /ws
```

## Steuerung

| Taste | Aktion |
|---|---|
| WASD / Pfeiltasten | fahren |
| Leertaste | driften (Blau → Orange → Lila) |
| E | Item benutzen |
| R | zurücksetzen |
| C | Kamera wechseln |
