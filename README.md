# Grenadder

A 2D arcade game for **Android and iOS**: you're a neon snake (an adder) with a bag of grenades,
and the bugs keep coming.

- **Drag** anywhere to steer (floating joystick)
- **Tap** (or tap with a second finger while steering) to throw a grenade
- Eat pink orbs to grow, grab green grenades for ammo (max 5)
- Grenades caught in a blast cook off → **chain reactions** and **combo multipliers** (up to x10)
- Your body is a wall: enemies can't cross it, so you can shield yourself and herd them
- Don't hit the walls or bite your own tail

Enemies get faster and more numerous every 22 seconds (waves):

| Enemy | Appears | Behaviour |
|---|---|---|
| Crawler (red beetle) | Wave 1 | Chases your head |
| Dasher (yellow arrow) | Wave 2 | Locks on, telegraphs, then charges |
| Brute (purple hexagon) | Wave 4 | Slow, 3 HP, always drops a grenade |

Desktop browsers work too: Arrows/WASD to steer, Space to throw, P/Esc to pause.

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

## Run in a browser

```bash
npm install
npm start          # http://localhost:8080
```

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
