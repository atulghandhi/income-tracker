# App Store marketing assets

## Screenshots (done)

Captured from the iOS Simulator with the web demo ledger (`src/demoData.ts`, salary raised to £3,450 for a healthier month), status bar overridden to 9:41 / full signal / 100% battery, light mode. All PNGs are RGB with no alpha channel.

| Folder | Device | Pixels | App Store Connect slot |
| --- | --- | --- | --- |
| `screenshots/6.9in-1320x2868/` | iPhone 17 Pro Max | 1320×2868 | iPhone with Dynamic Island, large display (6.9") |
| `screenshots/6.3in-1206x2622/` | iPhone 17 Pro | 1206×2622 | iPhone with Dynamic Island, medium display (6.1"/6.3"). **Required.** |

The 6.5" set is only needed when no 6.9" set is supplied, so it is not included. There is no iPad set because `project.yml` targets iPhone only.

Files in each folder: 01-dashboard, 02-ledger, 03-accounts, 04-credit-cards, 05-insights, 06-spending-recurring, 07-goals, 08-import-review. There are no widget screenshots yet.

## App Preview video (done)

`preview/income-tracker-app-preview-886x1920.mp4`

| Property | Value | Apple requirement (iPhone 6.9" / 6.5") |
| --- | --- | --- |
| Resolution | 886×1920 portrait | 886×1920 |
| Duration | 25.1 s | 15–30 s |
| Frame rate | 30 fps constant | 30 fps or lower |
| Video | H.264 High, level 4.0, 11 Mbps CBR, yuv420p | H.264 up to High 4.0, 10–12 Mbps |
| Audio | AAC-LC 256 kbps, 48 kHz, stereo; −14.5 LUFS, peak −3.2 dBFS | Stereo AAC 256 kbps, 44.1/48 kHz |
| Size | 35 MB | under 500 MB |

All app footage is real iOS Simulator recordings (iPhone 17 Pro Max) of the demo ledger. Six shots, each two bars long, are hard-cut on the music's downbeats (134 BPM). Their titles use the app's own colour tokens. The film ends on a card with the real app icon. Apple's default poster frame (5 s) falls on the quick-log shot. If you upload the 886×1920 file in the 6.9" slot, App Store Connect also uses it for 6.5". There is no preview for the 6.1"/6.3" slot; that slot is optional for previews.

Shots: dashboard chart scrub → quick-log ("Pret coffee 3.20" → Logged) → paste import review → accounts net worth → Debt filter → insights → goals → end card.

### Music

"Happy" by Sonatema (Lebrozu), released as **CC0 1.0 (public domain)** on Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Sonatema_-_Happy.wav. It is free for commercial use and needs no attribution. The bed (`preview/source/assets/audio/bed.wav`) is 116.435 s onward of the original, with a 1.2 s fade-out.

### Editing or re-rendering

`preview/source/` is a HyperFrames project. `SPEC.md` has the shot list, and `compositions/` has one file per shot. The simulator footage (`assets/footage/`, plus 30 fps proxies in `assets/clips/`) is gitignored because of its size, so it has to be re-recorded before a re-render. Re-record with `xcrun simctl io <device> recordVideo --codec=h264`, using the demo ledger seeded into the app group defaults key `ledgerState_v8`. After re-recording, make the proxies with `ffmpeg -i in.mp4 -vf fps=30 -c:v libx264 -crf 16 -g 15 assets/clips/<name>.mp4`. Then run `npx hyperframes render -f 30 -q delivery --video-frame-format png` and re-encode with the ffmpeg settings above (CBR 11M, `-level 4.0`, AAC 256k 48 kHz).
