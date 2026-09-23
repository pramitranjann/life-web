# PR Life desk printer — setup & troubleshooting

A wall-powered ESP32 sits at your desk, polls PR Life over Wi-Fi for queued
receipts, and prints them on the 58 mm Bluetooth thermal printer.

```
Task queued in PR Life ─▶ ESP32 polls /printer/claim (HTTPS, every ~7s)
   ─▶ ESP32 leases ONE job ─▶ prints payload over BLE (ESC/POS, service 18F0)
   ─▶ ESP32 reports /printer/complete ─▶ PR Life records final state
```

## Hardware profile (this printer)

| | |
|---|---|
| Printer | 58 mm BLE thermal, controller YICHIP YC3121 |
| Bluetooth | **BLE only** (not Classic SPP) |
| BLE name | `BlueTooth Printer` |
| BLE MAC | `5a:4a:6a:78:4d:0f` |
| BLE service | `000018f0-0000-1000-8000-00805f9b34fb` (18F0) |
| Write char | `00002af1-0000-1000-8000-00805f9b34fb` (2AF1) |
| Data | raw **ESC/POS** |
| ESP32 | ESP32-DevKitC (ESP32-WROOM-32) |

> The printer does NOT support Bluetooth Classic SPP. It is BLE-only.
> Connection must use scan-then-connect (direct connect by MAC fails).
> BLE is shut down before each HTTPS API call to free heap for TLS, then
> restarted when a job needs to print.

## One-time: Arduino IDE setup

1. Install the **Arduino IDE**.
2. **Boards Manager** → install **esp32 by Espressif** (core 3.x).
3. **Library Manager** → install **ArduinoJson** (v7+).
4. Board: **ESP32 Dev Module**.
5. **Tools → Partition Scheme → Huge APP (3MB No OTA/1MB SPIFFS)** — required,
   the default partition is too small for BLE + WiFi + HTTPS together.
6. Select the serial port for your DevKitC (`/dev/cu.usbserial-...` on Mac).

## Step 1 — Prove the printer works (compatibility test)

1. Charge the printer, load paper, power it on.
2. Open `hardware/printer_compat_test/printer_compat_test.ino`, upload it.
3. Open Serial Monitor at **115200 baud**, press **EN** to reboot.
4. The sketch scans for "BlueTooth Printer", connects, and sends a test receipt.
5. **Look at the paper.** It must print `PR LIFE - Printer connected.` and cut. ✅

Type `r` in Serial Monitor to reprint the test line.

## Step 2 — Configure the worker

1. Copy `hardware/pr_life_printer/config.example.h` → `hardware/pr_life_printer/config.h`.
   (`config.h` is gitignored — your secrets stay local.)
2. Fill in:
   - For a normal **2.4 GHz** WPA2/WPA3 network, leave `WIFI_AUTH_ENTERPRISE`
     at `0` and fill in `WIFI_SSID` / `WIFI_PASSWORD`.
   - For an open or MAC-authorized device network, leave
     `WIFI_AUTH_ENTERPRISE` at `0` and set `WIFI_PASSWORD` to an empty string.
   - To try both SCAD networks automatically, set `WIFI_TRY_BOTH_SCAD` to `1`.
     The worker scans and tries `SCAD Wireless` first, then
     `SCAD_Secure_Wireless`. It uses the scanned security mode for each SSID.
     An open `SCAD Wireless` ignores the value of `WIFI_PASSWORD`; the secure
     network uses `WIFI_USERNAME`, `WIFI_PASSWORD`, and `WIFI_EAP_CA_CERT`.
   - For `SCAD_Secure_Wireless`, set `WIFI_AUTH_ENTERPRISE` to `1`. It is
     802.1X **EAP-PEAP (MSCHAPv2)**, so fill in `WIFI_SSID`, `WIFI_USERNAME`,
     and `WIFI_PASSWORD`. Set `WIFI_EAP_IDENTITY` to the username unless SCAD
     gives a separate identity.
   - For enterprise Wi-Fi, paste the trusted RADIUS/802.1X CA certificate that
     SCAD IT provides into `WIFI_EAP_CA_CERT` as a PEM raw string. The firmware
     will not submit your credentials until that certificate is present.
   - `API_BASE` — `https://www.pramitranjan.com` (use `www`; bare domain redirects and ESP32 doesn't follow POST redirects).
   - `DEVICE_TOKEN` — value of `PRINTER_DEVICE_TOKEN` in Vercel.
   - `DEVICE_ID` — leave as `desk`.
   - `PRINTER_BLE_NAME` / `PRINTER_BLE_MAC` — already set correctly.

## Step 3 — Flash the worker & power it permanently

1. Upload `hardware/pr_life_printer/pr_life_printer.ino`.
2. Serial Monitor (115200) should show:
   ```
   [WiFi] Connected to "...". IP ...
   [BLE] Found printer: BlueTooth Printer (5a:4a:6a:78:4d:0f)
   [BLE] Printer connected and ready.
   [API] claim -> HTTP 200   ← after first poll (idle = no further output)
   ```
3. Once happy, power the ESP32 from a **wall USB charger** and leave it on.
   The printer keeps its own battery/charger.

## Step 4 — Queue something to print

In PR Life → **Tasks**:

- **Per task:** the **🖨 Print** button on any task row queues a receipt.
- **Print Management tab:** oversight + recovery. Multi-select tasks to queue,
  watch the **Queue**, see **Printed** history, and **Retry** anything under
  **Needs Attention**.

Within ~7 seconds of queuing, the ESP32 leases the job and prints it.

## Re-flashing after Wi-Fi change

Edit `config.h` and re-upload via USB (~30 seconds). For a normal network,
change its SSID/password. For EAP-PEAP/MSCHAPv2 enterprise Wi-Fi, also set the
username and CA certificate described above.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Compat test: printer not found in scan | Printer off/asleep or connected to another device. Power-cycle it; ensure no other device is connected to it. |
| Compat test: connects but nothing prints | Out of paper, or ESC/POS framing issue. |
| `"SCAD Wireless" not visible in scan` | Check the exact SSID and whether a 2.4 GHz access point is in range. The worker still attempts to connect in case the SSID is hidden. |
| `auth 0 (open)` then disconnect | The ESP32 attempted open association; check that its registered Wi-Fi MAC is allowed on that network. The disconnect reason narrows down the failure. |
| `auth 3 (protected)` or another protected auth mode | The scanned network requires a Wi-Fi password; the worker uses `WIFI_PASSWORD`. |
| `[WiFi] ... failed: ...` | The named disconnect reason identifies a missing AP, rejected authentication, or another Wi-Fi failure. |
| `Enterprise Wi-Fi needs username, password, and a trusted CA certificate` | Add all three values to `config.h`; request the network's RADIUS CA certificate from SCAD IT. |
| `[WiFi] EAP-PEAP/MSCHAPv2 authentication configured` then `[WiFi] FAILED` | Confirm the SCAD username/password, EAP identity, and CA certificate with SCAD IT. |
| `claim -> HTTP 307` | Using bare `pramitranjan.com` — change `API_BASE` to `https://www.pramitranjan.com`. |
| `claim -> HTTP -1` | Check the free heap and largest block in the API log, Wi-Fi status, and API reachability. BLE must be shut down before HTTPS. |
| `complete -> HTTP -1` after paper prints | The worker keeps the completion report in flash and retries it before claiming another job. Wait for `[API] Completion recorded by server.`; do not manually retry the printed job while its report is pending. |
| `claim -> HTTP 401` | `DEVICE_TOKEN` doesn't match `PRINTER_DEVICE_TOKEN` in Vercel. |
| `claim -> HTTP 200` but nothing prints | Nothing queued, or jobs target a different `DEVICE_ID`. Check Print Management tab. |
| Job stuck in **Queue** then reappears | ESP32 lost power mid-job; lease expired and job was re-offered. It'll reprint when ESP32 returns. |
| Job in **Needs Attention** | Print failed. Fix the printer, then **Retry**. |

## What lives where

- `printer_compat_test/` — standalone BLE/ESC/POS proof (Step 1).
- `pr_life_printer/` — the always-on worker (`config.h` is yours, gitignored).
- Backend: `lib/life/print-jobs.ts`, `lib/life/receipt.ts`,
  `app/api/life/printer/*`, `app/api/life/print-jobs/*`,
  migration `supabase/migrations/007_print_jobs.sql`.
