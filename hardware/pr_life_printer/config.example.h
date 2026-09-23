/*
 * PR LIFE printer — local configuration TEMPLATE.
 *
 * Copy this file to `config.h` (same folder) and fill in real values.
 * `config.h` is gitignored so your Wi-Fi password and device token never get
 * committed.
 */
#pragma once

// ---- Wi-Fi (2.4 GHz only — the ESP32-WROOM-32 has no 5 GHz radio) ----------
// Set to 0 for normal WPA2/WPA3 Personal Wi-Fi, or 1 for 802.1X enterprise
// Wi-Fi. SCAD_Secure_Wireless uses EAP-PEAP with MSCHAPv2, so use 1 there.
#define WIFI_AUTH_ENTERPRISE  0
// Try both SCAD SSIDs in order, using each network's scanned security mode.
// The open SCAD Wireless connection ignores WIFI_PASSWORD; the secure network
// uses WIFI_USERNAME, WIFI_PASSWORD, and WIFI_EAP_CA_CERT.
#define WIFI_TRY_BOTH_SCAD    0
#define WIFI_SSID             "your-2.4ghz-ssid"
// Use an empty value only for an open or MAC-authorized device network.
#define WIFI_PASSWORD         "your-wifi-password"

#if WIFI_AUTH_ENTERPRISE || WIFI_TRY_BOTH_SCAD
// EAP-PEAP / MSCHAPv2 credentials. Identity is normally the same as username.
#define WIFI_USERNAME      "your-network-username"
#define WIFI_EAP_IDENTITY  WIFI_USERNAME

// Paste the trusted RADIUS/802.1X CA certificate from the network administrator
// as a PEM raw string. Leave it blank only while preparing the file: firmware
// refuses to join enterprise Wi-Fi without certificate validation.
//
// #define WIFI_EAP_CA_CERT R"PEM(
// -----BEGIN CERTIFICATE-----
// ...
// -----END CERTIFICATE-----
// )PEM"
#define WIFI_EAP_CA_CERT ""
#endif

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
