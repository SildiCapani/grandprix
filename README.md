# Apex Rush 🏁

3D-Kart-Racer (three.js) mit Items, Power-Drifts, Boost-Pads, 6 Fahrzeugen (3D-Garage), 18 Strecken, Grand-Prix-Cups mit Siegerpodest, Ballon-Battle, Strecken-Editor, optionaler Karriere mit Aufträgen und Speed-Klassen 80/100/120/150 km/h.
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

## Konten & Admins

Beim Start meldet man sich an oder erstellt ein Konto. Level, XP, Rekorde und alles Freigeschaltete werden **pro Konto auf dem Server** gespeichert
(`server/data/accounts.json`, Passwörter nur als scrypt-Hash). Strecken, Karts und Lacke werden mit dem Level freigeschaltet.

**Admin-Konten** haben alles frei. Sie stehen in `server/admins.json` (wird nicht hochgeladen, Vorlage: `server/admins.example.json`).
Nach einer Änderung den Server neu starten: das Admin-Konto wird angelegt bzw. das Passwort übernommen.

### Konten dauerhaft speichern (Render Gratis-Plan)
Render setzt die Festplatte bei jedem Neustart und Deploy zurück – ohne Cloud-Speicher sind dann alle Konten weg.
Lösung (kostenlos): eine **Upstash-Redis**-Datenbank.
1. Auf [upstash.com](https://upstash.com) anmelden → *Create Database* (Redis, Region Frankfurt, Free).
2. Bei der Datenbank unter *REST API* die Werte `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` kopieren.
3. Bei Render: Service → *Environment* → beide Werte als Environment Variables eintragen. Optional `ADMINS` = `[{"name":"Seyyid","password":"…"}]` für die Admin-Konten (die `admins.json` wird nicht hochgeladen).
4. Speichern → Render startet neu. Im Log steht dann „Cloud-Speicher (Upstash) ist noch leer – die Konten werden ab jetzt dort gesichert.“

Ab dann werden alle Konten (Passwörter nur als Hash) zusätzlich in Upstash gespeichert und beim Start von dort geladen.
Auch die Zeitfahr-Ghosts hängen am Konto: Sie liegen pro Spieler als eigener Eintrag `apex-rush-ghosts:<name>` in Upstash (Feld `<strecke>:<cc>`) und werden nach dem Login mit dem Browser abgeglichen – nur eine schnellere Fahrt ersetzt einen Ghost.
Konten, die vorher auf Render angelegt wurden, sind leider schon gelöscht und müssen einmal neu erstellt werden.

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

### Räder (Garage)
| Räder | Wirkung | ab Level |
|---|---|---|
| Standard | ausgewogen | 1 |
| Slicks | +Topspeed, schlechter im Gelände | 2 |
| Stollen | viel besser im Gelände, minimal langsamer | 2 |
| Drift-Räder | Mini-Turbos laden schneller, etwas weniger Grip | 3 |
| Leichtfelgen | bessere Beschleunigung, leichter | 4 |
| Monster-Räder | schwer und gut im Gelände, langsameres Anfahren | 5 |
| Goldräder | ein bisschen besser in allem | 8 |

Die Räder ändern die Kart-Werte (`WHEELS` in `karts.js`) und sind auch online für alle sichtbar.

### Gleiter
Auf Wolkeninseln, Galaxie, Drachenburg, Neon-Dächer und Piratenbucht gibt es eine blaue **Gleiter-Rampe** mit Tor („▲ GLEITER ▲“).
Wer drüberfährt, klappt einen Gleitschirm in Kartfarbe auf, steigt hoch und segelt 70–80 m über die Lücke. In der Luft lässt sich gut lenken; leuchtende Ringe zeigen die Flugbahn. Bei der Landung gibt es den Trick-Boost.

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
13. **Piratenbucht**: ein langer Holzsteg übers Meer (mit Sprung), eine Hängebrücke ohne Geländer und eine Höhlen-Abkürzung durch die Totenkopf-Insel. Drumherum Galeonen, die Kanonen abfeuern, ein Krake, Delfine und Möwen.
14. **Zuckerland**: ein Schokofluss teilt die Welt, du fährst viermal drüber (einmal über eine kaputte Waffelbrücke mit Sprung). Lollis, Cupcakes, Gummibärchen, Riesenrad und ein Schoko-Wasserfall. Abkürzung durchs Keksfeld.
15. **Drachenburg**: Klippenstraße über dem Abgrund, eine lange Bogenbrücke und ein Zugbrücken-Sprung. Burg, Dorf mit Windmühle, Fackeln, Fledermäuse und ein Drache, der Feuer speit. Abkürzung durch die Kapellen-Ruine.
16. **Polarlicht-Fjord**: Brücken zwischen Eisschollen, Sprung über einen Gletscherspalt, Abkürzung durch die Eishöhle. Polarlicht, Pinguine, springende Orcas, ein Buckelwal, Eisbär, Forschungsstation und Hundeschlitten.
17. **Neon-Dächer**: Die Straße läuft über die Dächer einer Stadt bei Nacht. Zwei Sprünge zwischen Hochhäusern, Brücken ohne Geländer, Abkürzung übers Parkdeck. Fliegende Autos, Verkehr tief unten, Luftschiff, Hubschrauber mit Suchscheinwerfer und Feuerwerk.
18. **Galaxie**: eine leuchtende Glasstraße durchs All, eine Spirale um die Sonne und zwei Sprünge. Außer auf der Startgeraden gibt es **keine einzige Leitplanke**. Drumherum eine sich drehende Spiralgalaxie, Nebel, Planeten mit Ringen, ein Schwarzes Loch, Weltraumwale, Kometen und eine Raumstation.

### Absturz & Rettungsdrohne
Auf den Strecken 13–18 haben manche Stücke **kein Geländer** (dort fehlen die Leitplanken). Fährst du da über den Rand, stürzt du ins Wasser, in die Schokolade oder in den Nebel. Dann holt dich die **Rettungsdrohne** ab und setzt dich kurz vor der Absturzstelle wieder auf die Straße. Das kostet etwa 2,5 Sekunden. Die KI kann auch runterfallen, zum Beispiel nach einem Panzer-Treffer an der Kante. Online sehen alle die Drohne.

## Look & Leben auf der Strecke
- **Karts:** runde Go-Karts mit dicken Reifen, Fahrer mit Armen am Lenkrad, Chrom-Auspuff mit Boost-Flammen; die Karosserie legt sich in die Kurven. Jede Klasse hat ihre eigene Form (Buggy mit Überrollbügel, Brummer als Monster-Kart, Bolide lang mit großem Flügel …).
- **Auf jeder Strecke:** Streckenposten mit Flaggen, jubelnde Fan-Zonen, wehende Fahnen, Konfetti beim Start und im Ziel.
- **Je nach Welt:** Speedboote, Drachen und ein Wasserflugzeug an der Küste, Steppenläufer, Staubteufel und Ballons im Canyon, Lichtshow mit Drohnen in der Stadt, Feuervögel und Lavablasen am Vulkan, Sessellift und Skifahrer am Gletscher, Papageien, Schmetterlinge und Glühwürmchen im Dschungel und Pilzwald, Laternen im Kirschblütental, Raketenstart und Rover auf dem Mond, ein UFO auf der Sternenbahn.

## Startmenü
Das Menü führt Schritt für Schritt durch die Auswahl:
1. **Spielart:** Offline oder Online
2. **Modus:** Grand Prix, Cups, Zeitfahren, Battle oder Strecken-Editor
3. **Fahrer & Kart:** Avatar wählen; Kart, Lack und Skin in der 3D-Garage
4. **Klasse:** 80 / 100 / 120 / 150 km/h
5. **Strecke** (bzw. Cup oder Arena), dann Start

Online geht es nach Schritt 3 direkt in die Lobby. Oben kann man jederzeit auf einen früheren Schritt zurückspringen.

## Fahrer-Avatare
Elf eigene Figuren, die im Kart sitzen und im Menü als Porträt erscheinen: Rennpilot, Flinn (Fuchs), Pia (Panda), Kater Mo, Robo-7, Fridolin (Frosch), Frost (Pinguin), Zorx (Alien), Ritter Rolf, Nova (Astronautin) und Drako (Drache). Drei sind sofort frei, die anderen kommen mit Level, Rennen oder Siegen (Admins haben alle). Online sehen alle deinen Fahrer, die Bots haben ihre eigenen.

## Zeitfahren: Ghost & Platin
- Deine beste Fahrt pro Strecke und Klasse wird gespeichert und fährt beim nächsten Zeitfahren als durchsichtiger **Ghost** mit. Schlägst du sie, wird der Ghost ersetzt. Ghosts liegen in diesem Browser (pro Konto).
- Neu ist die Medaille **Platin** (✦): 8 % schneller als Gold, nur im Zeitfahren.

## Bewegte Hindernisse
Auf Strecken, wo es passt, kommt einem etwas in die Quere. Treffer schleudern dich wie ein Panzer (Stern und Schutzblase schützen, mit der Feder kann man drüberspringen):
| Strecke | Hindernis |
|---|---|
| Vulkan Inferno | Lavabrocken schlagen auf dem Viadukt ein (roter Ring warnt vorher) |
| Canyon Sunset | Felsbrocken rollen über die Straße |
| Gletscherpass, Polarlicht-Fjord | riesige Schneebälle; im Fjord springt ein Orca über die Eisbrücke |
| Dschungel-Tempel | Tempelkugeln aus Stein |
| Savannen-Safari | Nashörner überqueren die Piste |
| Mondbasis, Galaxie | Meteoriten |
| Piratenbucht | Kanonenkugeln auf dem Steg, ein Kraken-Tentakel schlägt auf eine Straßenhälfte |
| Zuckerland | rollende Donuts und ein Riesen-Gummibär |
| Drachenburg | Drachenfeuer auf einer Straßenhälfte (Seite wechselt) |
| Neon-Dächer | Schwebeautos fliegen tief über die Brücken |

Alles läuft nach der Rennuhr ab, online sehen also alle dasselbe.

## Neue Items
| Item | Was es macht |
|---|---|
| Feder | Hoher Sprung aus dem Stand: über Panzer, Bananen und Lücken. Beim Landen gibt es den Trick-Boost. Auf Strecken ohne Geländer kannst du dich damit aber auch selbst runterkatapultieren. |
| Schutzblase | Eine schillernde Blase um dein Kart, die genau einen Treffer abwehrt (auch den blauen Panzer). Hält 12 Sekunden. |
| Tauschwürfel | Du tauschst Platz, Position und Tempo mit dem Fahrer direkt vor dir. Gibt es nur ab Platz 4. Bots tauschen nie mit dir. |
| Tintenklecks | Alle vor dir bekommen 4,5 Sekunden Tintenkleckse auf den Bildschirm. Bots fahren dann langsamer und schlingern. Wirkt auch online. |
| Ballonpumpe | Nur im Ballon-Battle: +1 Ballon (bis 5). |
| Stachelpanzer | Nur für den Letzten (30 % aus der Itembox, höchstens einer gleichzeitig): ein riesiger Panzer mit Stacheln. Rollt wie ein grüner Panzer, prallt 5-mal von den Wänden ab und dreht **jeden** Fahrer, den er berührt. Bananen und kleine Panzer walzt er platt. |
| Bumerang | Fliegt nach vorne (gehalten + Rückwärts: nach hinten), dreht um und kommt zum Werfer zurück. Trifft auf dem Hin- und Rückweg jeden Fahrer einmal. |
| Blitz | Selten, eher hinten im Feld: alle anderen Fahrer schrumpfen 4,5 s, drehen sich kurz und sind langsamer. Stern, Rakete und Schutzblase schützen. |
| 3× Feuerkugel | Drei hüpfende Feuerkugeln nacheinander, prallen bis zu 3-mal von den Wänden ab. |
| Magnet | 7 s lang: zieht dich zum Vordermann (etwas mehr Tempo, solange er bis 28 m vor dir ist), Itemboxen und Münzen werden aus der Ferne eingesammelt. |

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
- **Abenteuer-Cup:** Piratenbucht, Zuckerland, Drachenburg
- **Kosmos-Cup:** Polarlicht-Fjord, Neon-Dächer, Galaxie

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
- **Welt:** Eine der 18 Welten wählen.
- **Prüfung:** Der Editor warnt vor Überschneidungen, zu engen Kurven und steilen Rampen.
- **Testfahrt:** Mit Gegnern oder allein.
- **Teilen:** **Code kopieren** erzeugt einen Code wie `APX1-…`. Freunde laden ihn über **Code laden**.
- **Einschränkungen:** Eigene Strecken zählen nicht für XP und Bestzeiten und gibt es bisher nur offline.

## Karriere
Mit Konto ist die Karriere immer an (Admins haben alles frei).

- **AN:** Dein Fahrerlevel schaltet nach und nach frei:
  - Strecken: Küste und Canyon sofort; Neon + Dschungel + Piratenbucht ab Level 2, Savanne + Pilzwald + Zuckerland + Polarlicht-Fjord ab 3, Vulkan + Kirschblüten + Drachenburg ab 4, Gletscher + Wolkeninseln + Neon-Dächer ab 5, Sternenbahn + Galaxie ab 6, Mond ab 7.
  - Karts: Flitzer ab Level 2, Drifter ab 3, Buggy ab 4, Bolide ab 5, Brummer ab 6.
  - Lack-Finishes: Gold ab Level 3, Chrom ab 5, Neon ab 7.
- **Aufträge:** Es sind immer drei offen, z. B. „Überhole 25 Gegner“ oder „Lande 12 Sprünge“. Sie geben Bonus-XP und werden nach dem Abschluss ersetzt. Mit jeder Runde durch alle Aufträge werden sie etwas schwerer. Es gibt keine Timer und keine Tages-Aufgaben.
- **AUS:** Alles ist sofort frei, und es gibt keine Aufträge.


## Skins
In der Garage unter **SKINS**. Muster für die Karosserie, die man mit der Zeit freischaltet (Admins haben alle):

| Skin | Seltenheit | Freischalten |
|---|---|---|
| Rennstreifen | gewöhnlich | 1 Rennen |
| Zielflagge | gewöhnlich | 5 Rennen |
| Tarnmuster | gewöhnlich | Level 2 |
| Flammen | selten | 1 Sieg |
| Tiger | selten | Level 3 |
| Retro-Pixel | selten | 15 Rennen |
| Eiskristall | episch | Level 4 |
| Zebra | episch | 3× Gold |
| Blitzschlag | episch | 5 Siege |
| Lava | legendär | Level 5 + 8 Siege |
| Neon-Grid | legendär | 8 Strecken beendet |
| Galaxie | legendär | Level 6 |
| Gold-Drache | mythisch | Level 7 + 20 Siege |

Die Skins stehen in `client/src/game/skins.js`. Online sehen alle deinen Skin.

## Projektstruktur
```
client/
  index.html          Menü- und HUD-Markup
  src/main.js         UI, Kamera, Rendering, Spiel-Loop
  src/styles.css      Design
  src/game/
    race-core.js      Physik, KI, Items, Drifts, Sprünge, Speed-Klassen
    karts.js          Fahrzeugwerte
    skins.js          Skins (Muster, Freischaltung)
    garage.js         3D-Garage zur Fahrzeugwahl
    tracks.js         Streckendaten inkl. Höhen, Brücken, Sprungschanzen
    world.js          Prozedurale 3D-Welten (inkl. Vulkan, Berge, Weltall)
    world-adventure.js Piratenbucht, Zuckerland, Drachenburg, Arktis, Neon-Dächer, Galaxie
    rescue-fx.js      Rettungsdrohne und Platscher beim Absturz
    item-fx.js        Schutzblase, Tinte, Tausch-Funken
    obstacles.js      Bewegte Hindernisse (Daten + Zeitablauf)
    obstacle-fx.js    Hindernisse zeichnen
    avatars.js        Fahrer-Avatare (3D-Kopf + Porträt)
    world-life.js     Leben auf allen Strecken (Fans, Streckenposten, Tiere, Fahrzeuge)
    ghost.js          Ghost im Zeitfahren
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
| E (tippen) | Item benutzen |
| E (halten) | Banane/Panzer hinten ans Kart hängen: blockt Panzer von hinten. Loslassen wirft nach hinten |
| R | zurücksetzen |
| C | Kamera wechseln |

## Weltrangliste & Profile
- **Weltrangliste (Zeitfahren):** Jede neue Bestzeit (mit Ghost) landet auf dem Server. Pro Strecke und Klasse gibt es eine Rangliste (Top 50 gespeichert, Top 5 im Menü).
  Mit **„Gegen Weltrekord“** fährt der Geist des Rekordhalters mit. Unrealistische Zeiten (über 35 % schneller als Gold) kommen nicht in die Liste.
- **Profile:** Klick auf deinen Namen oben rechts oder auf einen Namen in der Rangliste. Zeigt Level, Statistiken, Cup-Pokale, Star-Fahrer und Ranglistenplätze; im eigenen Profil kann man andere Spieler suchen.

## Emotes & Controller
- **Emotes:** Tasten **1–4** (👍 GG · 😂 HAHA · 😱 NEIN! · 📣 HUP HUP!) – erscheinen als Sprechblase über dem Kart, online auch bei den anderen.
- **Controller** (Xbox/PlayStation, Standard-Belegung): RT/A Gas · LT/B Bremse & rückwärts · RB/X Drift · LB/Y Item · D-Pad Emotes · Start Pause · Back Kamera.
  In den Menüs: Stick/D-Pad wählt, A bestätigt, B zurück. Bei Treffern vibriert der Controller.

## Spiegelmodus, 200 km/h, Aufgaben & Gleiter
- **Spiegelmodus** (alle 6 Cups Gold auf 120 km/h): Schalter im Schritt „Klasse“. Alle Strecken seitenverkehrt (Bild und Minikarte gespiegelt, Lenkung angepasst), nur offline.
- **200 km/h „Überschall“** (alle 6 Cups Gold auf 150 km/h): neue Klasse, mit eigener Weltrangliste und eigenen Pokalen.
- **Tages- und Wochenaufgaben** im Karriere-Bereich: jeden Tag 3 neue, jede Woche 2 große (für alle gleich), mit Bonus-XP. Werden im Konto gespeichert.
- **Gleiter (Kart-Baukasten):** Karosserie + Räder + Gleiter. Jeder Gleiter hat eine eigene Optik und verändert Flugzeit auf Gleiter-Rampen und leicht die Werte. Schaltet sich mit dem Level frei.

## Online: Cups, Team-Battle, eigene Strecken
- **Online-Cup:** In der Lobby oben „🏆 Cup · 3 Rennen“ und einen Cup wählen. Nach jedem Rennen gibt es Cup-Punkte (15/12/10/8/…), der Gastgeber startet direkt das nächste Rennen. Am Ende zählen die Pokale wie offline (auch für Star-Fahrer).
- **Team-Battle:** Bei einer Arena „Team-Battle“ einschalten. Rot gegen Blau, die Karts sind in Teamfarbe, Teamkollegen können sich nicht treffen, am Ende zählt die Team-Summe.
- **Eigene Strecke online:** Der Gastgeber wählt „✏️ Eigene Strecke“ (vorher im Editor bauen). Der Strecken-Code wird automatisch an alle geschickt.
