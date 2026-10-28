# App Store marketing assets

## Screenshots (done)

Captured from the iOS Simulator with the web demo ledger (`src/demoData.ts`, salary raised to £3,450 for a healthier month), status bar overridden to 9:41 / full signal / 100% battery, light mode. All PNGs are RGB with no alpha channel.

| Folder | Device | Pixels | App Store Connect slot |
| --- | --- | --- | --- |
| `screenshots/6.9in-1320x2868/` | iPhone 17 Pro Max | 1320×2868 | iPhone with Dynamic Island, large display (6.9") |
| `screenshots/6.3in-1206x2622/` | iPhone 17 Pro | 1206×2622 | iPhone with Dynamic Island, medium display (6.1"/6.3"). **Required.** |

The 6.5" set is only needed when no 6.9" set is supplied, so it is not included. There is no iPad set because `project.yml` targets iPhone only.

Files in each folder: 01-dashboard, 02-ledger, 03-accounts, 04-credit-cards, 05-insights, 06-spending-recurring, 07-goals, 08-import-review. There are no widget screenshots yet.

## App Preview video (not finished)

- Spec: 886×1920 portrait, 15–30 s, 30 fps or lower, H.264 (High, level 4.0 or lower, 10–12 Mbps), stereo AAC 256 kbps.
- HyperFrames project: `preview/source/`. It has the music bed and beat grid (134 BPM; bars every 1.79 s). The composition is not built yet.
- Music: "Happy" by Sonatema (Lebrozu), released as **CC0** on Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Sonatema_-_Happy.wav). It is free for commercial use and needs no attribution. The bed is trimmed to 116.435–145.095 s of the original.
- Raw simulator takes (gitignored, re-recordable) were saved in `preview/source/assets/footage/`: dashboard, accounts, insights, goals, quicklog and import.
