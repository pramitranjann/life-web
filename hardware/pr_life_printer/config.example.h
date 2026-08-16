/*
 * PR LIFE printer — local configuration TEMPLATE.
 *
 * Copy this file to `config.h` (same folder) and fill in real values.
 * `config.h` is gitignored so your Wi-Fi password and device token never get
 * committed.
 */
#pragma once

// ---- Wi-Fi (2.4 GHz only — the ESP32-WROOM-32 has no 5 GHz radio) ----------
#define WIFI_SSID      "your-2.4ghz-ssid"
#define WIFI_PASSWORD  "your-wifi-password"

// ---- PR Life API -----------------------------------------------------------
#define API_BASE       "https://www.pramitranjan.com"  // no trailing slash; use www to avoid redirect
#define DEVICE_TOKEN   "paste-the-PRINTER_DEVICE_TOKEN-here"
#define DEVICE_ID      "desk"  // must match what PR Life queues against

// ---- Printer (BLE) ---------------------------------------------------------
// Advertised name of the printer (from BLE scan). Used as primary identifier.
#define PRINTER_BLE_NAME "BlueTooth Printer"
// MAC fallback (lowercase). Confirmed: 5a:4a:6a:78:4d:0f
#define PRINTER_BLE_MAC  "5a:4a:6a:78:4d:0f"
// BLE service and write characteristic — do not change.
// Service 18F0 / char 2AF1 confirmed working via ESC/POS compat test.

// ---- Polling ---------------------------------------------------------------
#define POLL_INTERVAL_MS  7000
