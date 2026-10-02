# Grenadder

A 2D arcade game for **Android and iOS**: you're a neon snake (an adder) with a bag of grenades,
and the bugs keep coming.

- **Drag** anywhere to steer (floating joystick)
- **Tap** any spot to lob a grenade there, whichever way you're heading (or tap with a second finger while steering)
- Eat pink orbs to grow, grab green grenades for ammo
- Grenades caught in a blast cook off → **chain reactions** and **combo multipliers** (up to x10)
- Your body is a wall: enemies can't cross it, so you can shield yourself and herd them
- Don't hit the walls or bite your own tail

### Modes

- **Classic**: open arena.
- **Walls**: one of four wall layouts (Pillars, Bars, Rooms, Corners) plus breakable crates.
  Walls kill the snake and block bugs, which path around them. Blow up crates for points,
  gems and grenades. More crates appear each wave.

### Difficulty

| | Easy | Normal | Hard |
|---|---|---|---|
| Grenades at start / max | 5 / 8 | 3 / 5 | 2 / 4 |
| Grenade refill every | 3-4.5 s | 4.5-7 s | 7-10 s |
| Refills on the map at once | 3 | 2 | 1 |
| Bug count / spawn rate / speed | 0.6x / 0.65x / 0.8x | 1x | 1.4x / 1.45x / 1.2x |
| Blast radius | 3.8 | 3.2 | 2.8 |
| Wave length | 28 s | 22 s | 18 s |
| Dashers / Brutes from wave | 3 / 6 | 2 / 4 | 1 / 3 |
| Brute HP | 2 | 3 | 4 |
| Score multiplier | x0.5 | x1 | x2 |

Each mode + difficulty keeps its own best score. All values live in `DIFFICULTY` in `www/js/game.js`.

Enemies get faster and more numerous every wave:

| Enemy | Appears | Behaviour |
|---|---|---|
| Crawler (red beetle) | Wave 1 | Chases your head |
| Dasher (yellow arrow) | Wave 1-3 | Locks on, telegraphs, then charges |
| Brute (purple hexagon) | Wave 3-6 | Slow, tough, always drops a grenade |

Desktop browsers work too: Arrows/WASD to steer, click to throw at the cursor (Space throws straight ahead), P/Esc to pause.

## Tech

Plain HTML5 Canvas + ES modules, no engine and no build step. It's wrapped as native apps with
[Capacitor](https://capacitorjs.com/).

```
www/
  index.html, style.css   UI overlays (menu, HUD, pause, game over)
  js/main.js              loop, layout/safe areas, screens, native back button
  js/game.js              gameplay + rendering (world in resolution-independent units)
  js/input.js             touch joystick / tap / keyboard
  js/audio.js             synthesized WebAudio SFX + haptics
assets/                   source icon & splash for @capacitor/assets
```

- Fixed 120 Hz simulation steps, HiDPI canvas, notch/safe-area aware, portrait and landscape
- Pre-rendered glow sprites (no `shadowBlur`), so it stays smooth on mid-range phones
- Native haptics via `@capacitor/haptics`; Android back button and app pause via `@capacitor/app`
- High score and mute setting persisted locally

## Play online

https://irfanmpmk.github.io/grenadder/ (deployed from `www/` by `.github/workflows/pages.yml`
on every push; requires Settings → Pages → Source: **GitHub Actions**).

## Run in a browser

```bash
npm install
npm start          # http://localhost:8080
```

## Download the Android APK

https://github.com/irfanmpmk/grenadder/releases/latest/download/Grenadder.apk

Built by `.github/workflows/android-apk.yml` on every push. It's a debug-signed APK for sharing
directly (not the Play Store). `android-config/debug.keystore` is a throwaway debug key (password
`android`), so every build has the same signature and installs as an update over the previous one.
Use a separate, private release key if you later publish to the Play Store.

## Build for Android

Requires Android Studio (JDK 21 + Android SDK).

```bash
npm install
npm run add:android    # first time only: creates android/
npm run assets         # generate icons + splash screens
npm run android        # sync and run on a connected device/emulator
# or: npm run open:android, then Build > Generate Signed Bundle for Play Store
```

## Build for iOS

Requires macOS with Xcode.

```bash
npm install
npm run add:ios        # first time only: creates ios/
npm run assets
npm run ios            # or: npm run open:ios, then archive in Xcode for the App Store
```

After changing anything in `www/`, run `npm run sync` to copy it into the native projects.

The `android/` and `ios/` folders are generated and currently git-ignored. Remove them from
`.gitignore` once you start customizing native settings (signing, orientation, etc.).
Change `appId` in `capacitor.config.json` to your own reverse-domain ID before publishing.
