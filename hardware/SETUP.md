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
> BLE is disconnected before each HTTPS API call to free heap for TLS.

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
   - `WIFI_SSID` / `WIFI_PASSWORD` — **2.4 GHz** network.
   - `API_BASE` — `https://www.pramitranjan.com` (use `www`; bare domain redirects and ESP32 doesn't follow POST redirects).
   - `DEVICE_TOKEN` — value of `PRINTER_DEVICE_TOKEN` in Vercel.
   - `DEVICE_ID` — leave as `desk`.
   - `PRINTER_BLE_NAME` / `PRINTER_BLE_MAC` — already set correctly.

## Step 3 — Flash the worker & power it permanently

1. Upload `hardware/pr_life_printer/pr_life_printer.ino`.
2. Serial Monitor (115200) should show:
   ```
   [WiFi] Connected. IP ...
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

Edit `config.h` with the new SSID/password and re-upload via USB (~30 seconds).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Compat test: printer not found in scan | Printer off/asleep or connected to another device. Power-cycle it; ensure no other device is connected to it. |
| Compat test: connects but nothing prints | Out of paper, or ESC/POS framing issue. |
| `[WiFi] FAILED` | Wrong SSID/password, or a 5 GHz network. |
| `claim -> HTTP 307` | Using bare `pramitranjan.com` — change `API_BASE` to `https://www.pramitranjan.com`. |
| `claim -> HTTP -1` | TLS heap exhaustion (BLE + HTTPS competing). Ensure BLE disconnect before API calls is in the firmware. |
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
