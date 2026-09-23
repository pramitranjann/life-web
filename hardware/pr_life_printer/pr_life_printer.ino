/*
 * PR LIFE — Print worker firmware (BLE edition)
 * ==============================================
 * Printer: "BlueTooth Printer", BLE, service 18F0, write char 2AF1.
 * Connection: scans by name/MAC, connects using discovered device object.
 *
 * Flow:
 *   1. Connect to Wi-Fi.
 *   2. Scan and connect to the BLE printer (persists connection between jobs).
 *   3. Every POLL_INTERVAL_MS: POST /api/life/printer/claim.
 *   4. If a job is leased, write the payload over BLE in 20-byte chunks.
 *   5. POST /api/life/printer/complete with success or failure.
 *   6. Recover from Wi-Fi / BLE / API / printer / power failures.
 *
 * Dependencies: ArduinoJson v7+.
 * Board: ESP32 Dev Module. Core 3.x. Copy config.example.h -> config.h first.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEClient.h>
#include <BLEAdvertisedDevice.h>
#include <BLERemoteService.h>
#include <BLERemoteCharacteristic.h>
#include "config.h"
#include <esp_mac.h>

#ifndef WIFI_AUTH_ENTERPRISE
#define WIFI_AUTH_ENTERPRISE 0
#endif

#ifndef WIFI_TRY_BOTH_SCAD
#define WIFI_TRY_BOTH_SCAD 0
#endif

#if WIFI_AUTH_ENTERPRISE || WIFI_TRY_BOTH_SCAD
#include "esp_eap_client.h"
#include "esp_err.h"
#ifndef WIFI_EAP_IDENTITY
#define WIFI_EAP_IDENTITY WIFI_USERNAME
#endif
#ifndef WIFI_EAP_CA_CERT
#define WIFI_EAP_CA_CERT ""
#endif
#endif

#define PRINTER_SVC_UUID  "000018f0-0000-1000-8000-00805f9b34fb"
#define PRINTER_CHAR_UUID "00002af1-0000-1000-8000-00805f9b34fb"
#define BLE_SCAN_SECONDS  15
#define CHUNK_SIZE        20
#define CHUNK_DELAY_MS    30
#define INIT_DELAY_MS     120
#define TRAILER_DELAY_MS  250
#define MIN_FLUSH_MS      4000
#define FLUSH_PER_CHUNK_MS 90

static BLEAdvertisedDevice *printerDevice = nullptr;
static BLEClient           *bleClient     = nullptr;
static BLERemoteCharacteristic *writeChar = nullptr;
static bool bleInitialized = false;
static unsigned long lastPoll = 0;
#if WIFI_AUTH_ENTERPRISE || WIFI_TRY_BOTH_SCAD
static bool enterpriseAuthenticationConfigured = false;
#endif
static volatile uint8_t wifiDisconnectReason = 0;
// Guards against reprinting: if /complete fails to land (BLE activity often
// leaves Wi-Fi degraded right after), the job's lease expires server-side and
// gets reclaimed as pending — the same device would otherwise print it again
// every poll until a report finally lands. Remembering only the most recent
// job id is enough since jobs are processed strictly one at a time.
static String lastPrintedJobId = "";
// Keep a printed job's completion report until the API acknowledges it.
// A short TLS failure after BLE printing must not let the next claim race it.
static String pendingCompletionJobId = "";
static String pendingCompletionError = "";
static bool pendingCompletionSuccess = false;
static Preferences printState;
static bool printStateReady = false;

// ---- BLE scanner -----------------------------------------------------------
class ScanCallback : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice dev) {
    String name = dev.haveName() ? dev.getName().c_str() : "";
    String mac  = dev.getAddress().toString().c_str();
    if (name == PRINTER_BLE_NAME || mac == PRINTER_BLE_MAC) {
      Serial.printf("[BLE] Found printer: %s (%s)\n", name.c_str(), mac.c_str());
      printerDevice = new BLEAdvertisedDevice(dev);
      BLEDevice::getScan()->stop();
    }
  }
};
static ScanCallback scanCallback;

// ---- BLE connection --------------------------------------------------------
bool bleScan() {
  if (printerDevice) { delete printerDevice; printerDevice = nullptr; }
  Serial.printf("[BLE] Scanning up to %ds for printer...\n", BLE_SCAN_SECONDS);

  BLEScan *scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(&scanCallback, true);
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(99);
  scan->start(BLE_SCAN_SECONDS, false);
  scan->clearResults();

  if (!printerDevice) {
    Serial.println("[BLE] Printer not found in scan window.");
    return false;
  }
  return true;
}

bool bleConnect() {
  if (!printerDevice && !bleScan()) return false;

  if (bleClient) {
    Serial.println("[BLE] Stale client; waiting for stack reset before reconnecting.");
    return false;
  }
  bleClient = BLEDevice::createClient();

  Serial.printf("[BLE] Connecting to %s...\n",
                printerDevice->getAddress().toString().c_str());
  if (!bleClient->connect(printerDevice)) {
    Serial.println("[BLE] connect() failed.");
    return false;
  }

  BLERemoteService *svc = bleClient->getService(PRINTER_SVC_UUID);
  if (!svc) {
    Serial.println("[BLE] Service 18F0 not found.");
    bleClient->disconnect();
    return false;
  }
  writeChar = svc->getCharacteristic(PRINTER_CHAR_UUID);
  if (!writeChar) {
    Serial.println("[BLE] Characteristic 2AF1 not found.");
    bleClient->disconnect();
    return false;
  }

  Serial.printf("[BLE] Characteristic props: write=%d writeNoResp=%d\n",
                writeChar->canWrite(), writeChar->canWriteNoResponse());
  Serial.println("[BLE] Printer connected and ready.");
  return true;
}

bool ensurePrinter() {
  if (bleClient && bleClient->isConnected() && writeChar) return true;
  Serial.println("[BLE] Not connected; reconnecting...");
  if (bleClient) bleDisconnect();
  if (!bleInitialized) {
    bleInitialized = BLEDevice::init("PR-Life-Bridge");
    if (!bleInitialized) return false;
  }
  // Re-scan so we get a fresh device object with the correct address type.
  if (printerDevice) { delete printerDevice; printerDevice = nullptr; }
  return bleConnect();
}

// ---- BLE write (chunked) ---------------------------------------------------
bool bleWrite(const uint8_t *data, size_t len) {
  if (!writeChar) return false;
  bool useResponse = writeChar->canWrite();
  if (!useResponse && !writeChar->canWriteNoResponse()) {
    Serial.println("[BLE] Characteristic does not support writes.");
    return false;
  }
  size_t offset = 0;
  while (offset < len) {
    size_t chunk = min(len - offset, (size_t)CHUNK_SIZE);
    bool ok = writeChar->writeValue((uint8_t *)(data + offset), chunk, useResponse);
    if (!ok) {
      Serial.printf("[BLE] Chunk write failed at offset %u len %u (response=%d)\n",
                    (unsigned)offset, (unsigned)chunk, useResponse);
      return false;
    }
    offset += chunk;
    delay(CHUNK_DELAY_MS);
  }
  return true;
}

String payloadPreview(const String &payload) {
  String preview;
  preview.reserve(min((size_t)160, payload.length() * 2));

  for (size_t i = 0; i < payload.length() && preview.length() < 160; i++) {
    char c = payload[i];
    if (c == '\n') preview += "\\n";
    else if (c == '\r') preview += "\\r";
    else preview += c;
  }

  if (payload.length() > 160) preview += "...";
  return preview;
}

String sanitizePayload(const String &payload) {
  String clean;
  clean.reserve(payload.length());

  for (size_t i = 0; i < payload.length(); i++) {
    unsigned char c = static_cast<unsigned char>(payload[i]);
    if (c == '\n' || c == '\r' || c == '\t') {
      clean += static_cast<char>(c);
      continue;
    }
    if (c >= 32 && c <= 126) {
      clean += static_cast<char>(c);
      continue;
    }
    clean += '?';
  }

  return clean;
}

void waitForPrinterFlush(size_t payloadLen) {
  size_t chunkCount = (payloadLen + CHUNK_SIZE - 1) / CHUNK_SIZE;
  unsigned long flushMs = max((unsigned long)MIN_FLUSH_MS,
                              (unsigned long)(chunkCount * FLUSH_PER_CHUNK_MS));
  Serial.printf("[BLE] Waiting %lums for printer flush.\n", flushMs);
  delay(flushMs);
}

bool printPayload(const String &payload) {
  if (!ensurePrinter()) return false;
  if (!payload.length()) {
    Serial.println("[JOB] Refusing to print empty payload.");
    return false;
  }
  String cleanPayload = sanitizePayload(payload);

  // A payload starting with this marker prints double-width/double-height
  // (GS ! 0x11) instead of the normal size — used for jar labels that need to
  // be readable at a glance, not 32-col task receipts. Stripped before printing.
  const char *largeMarker = "[[LARGE]]\n";
  bool large = cleanPayload.startsWith(largeMarker);
  if (large) cleanPayload.remove(0, strlen(largeMarker));

  Serial.printf("[JOB] Payload preview: %s\n", payloadPreview(cleanPayload).c_str());

  const uint8_t init[] = { 0x1B, 0x40 };
  if (!bleWrite(init, sizeof(init))) return false;
  delay(INIT_DELAY_MS);

  const char *sentinel = "PR LIFE PRINT START\n";
  if (!bleWrite((const uint8_t *)sentinel, strlen(sentinel))) return false;
  delay(120);

  if (large) {
    const uint8_t bigSize[] = { 0x1D, 0x21, 0x11 };
    if (!bleWrite(bigSize, sizeof(bigSize))) return false;
  }

  if (!bleWrite((const uint8_t *)cleanPayload.c_str(), cleanPayload.length())) return false;

  if (large) {
    const uint8_t normalSize[] = { 0x1D, 0x21, 0x00 };
    if (!bleWrite(normalSize, sizeof(normalSize))) return false;
  }

  const uint8_t nl[] = { '\n', '\n' };
  if (!bleWrite(nl, sizeof(nl))) return false;
  delay(TRAILER_DELAY_MS);

  const uint8_t feed[] = { 0x1B, 0x64, 0x04 };
  if (!bleWrite(feed, sizeof(feed))) return false;
  const uint8_t cut[] = { 0x1D, 0x56, 0x42, 0x00 };
  if (!bleWrite(cut, sizeof(cut))) return false;

  waitForPrinterFlush(strlen(sentinel) + cleanPayload.length() + sizeof(nl) + sizeof(feed) + sizeof(cut));
  return true;
}

// ---- Wi-Fi -----------------------------------------------------------------
void onWifiDisconnected(WiFiEvent_t event, WiFiEventInfo_t info) {
  wifiDisconnectReason = info.wifi_sta_disconnected.reason;
}

#if WIFI_AUTH_ENTERPRISE || WIFI_TRY_BOTH_SCAD
bool configureEnterpriseAuthentication() {
  if (enterpriseAuthenticationConfigured) return true;

  if (strlen(WIFI_USERNAME) == 0 || strlen(WIFI_PASSWORD) == 0 ||
      strlen(WIFI_EAP_CA_CERT) == 0) {
    Serial.println("[WiFi] Enterprise Wi-Fi needs username, password, and a trusted CA certificate.");
    return false;
  }

  const esp_err_t identityResult = esp_eap_client_set_identity(
    reinterpret_cast<const unsigned char *>(WIFI_EAP_IDENTITY), strlen(WIFI_EAP_IDENTITY));
  const esp_err_t usernameResult = esp_eap_client_set_username(
    reinterpret_cast<const unsigned char *>(WIFI_USERNAME), strlen(WIFI_USERNAME));
  const esp_err_t passwordResult = esp_eap_client_set_password(
    reinterpret_cast<const unsigned char *>(WIFI_PASSWORD), strlen(WIFI_PASSWORD));
  const esp_err_t certificateResult = esp_eap_client_set_ca_cert(
    reinterpret_cast<const unsigned char *>(WIFI_EAP_CA_CERT), strlen(WIFI_EAP_CA_CERT));
  const esp_err_t enableResult = esp_wifi_sta_enterprise_enable();

  if (identityResult != ESP_OK || usernameResult != ESP_OK || passwordResult != ESP_OK ||
      certificateResult != ESP_OK || enableResult != ESP_OK) {
    Serial.printf("[WiFi] Enterprise authentication setup failed: identity=%s, username=%s, password=%s, certificate=%s, enable=%s\n",
      esp_err_to_name(identityResult), esp_err_to_name(usernameResult),
      esp_err_to_name(passwordResult), esp_err_to_name(certificateResult),
      esp_err_to_name(enableResult));
    return false;
  }

  enterpriseAuthenticationConfigured = true;
  Serial.println("[WiFi] EAP-PEAP/MSCHAPv2 authentication configured.");
  return true;
}

void disableEnterpriseAuthentication() {
  if (!enterpriseAuthenticationConfigured) return;
  esp_wifi_sta_enterprise_disable();
  enterpriseAuthenticationConfigured = false;
}
#endif

bool tryWifi(const char *ssid, wifi_auth_mode_t authMode, const char *password) {
  Serial.printf("[WiFi] Trying \"%s\" (auth %d)...\n", ssid, static_cast<int>(authMode));
  // Cancel any pending association before changing the station configuration.
  WiFi.disconnect(false, false);
  delay(150);
  wifiDisconnectReason = 0;

  if (authMode == WIFI_AUTH_WPA2_ENTERPRISE) {
#if WIFI_AUTH_ENTERPRISE || WIFI_TRY_BOTH_SCAD
    if (!configureEnterpriseAuthentication()) return false;
    WiFi.setMinSecurity(WIFI_AUTH_WPA2_ENTERPRISE);
    WiFi.begin(ssid);
#else
    Serial.println("[WiFi] Enterprise authentication is not configured in this build.");
    return false;
#endif
  } else {
#if WIFI_AUTH_ENTERPRISE || WIFI_TRY_BOTH_SCAD
    disableEnterpriseAuthentication();
#endif
    WiFi.setMinSecurity(authMode == WIFI_AUTH_OPEN ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK);
    if (authMode == WIFI_AUTH_OPEN) {
      WiFi.begin(ssid);
    } else {
      WiFi.begin(ssid, password);
    }
  }

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected to \"%s\". IP %s\n", ssid, WiFi.localIP().toString().c_str());
    return true;
  }

  const uint8_t reason = wifiDisconnectReason;
  if (reason != 0) {
    Serial.printf("[WiFi] \"%s\" failed: %s (%u), status %d\n", ssid,
                  WiFi.disconnectReasonName(static_cast<wifi_err_reason_t>(reason)),
                  reason, static_cast<int>(WiFi.status()));
  } else {
    Serial.printf("[WiFi] \"%s\" timed out; status %d\n", ssid, static_cast<int>(WiFi.status()));
  }
  return false;
}

#if WIFI_TRY_BOTH_SCAD
void scanScadNetworks(wifi_auth_mode_t &deviceAuth, wifi_auth_mode_t &secureAuth) {
  const int16_t count = WiFi.scanNetworks();
  if (count < 0) {
    Serial.printf("[WiFi] Scan failed (%d); trying both SSIDs anyway.\n", count);
    return;
  }
  int32_t deviceRssi = -1000;
  int32_t secureRssi = -1000;
  for (int16_t i = 0; i < count; ++i) {
    const String ssid = WiFi.SSID(i);
    if (ssid == "SCAD Wireless" && WiFi.RSSI(i) > deviceRssi) {
      deviceRssi = WiFi.RSSI(i);
      deviceAuth = WiFi.encryptionType(i);
    } else if (ssid == "SCAD_Secure_Wireless" && WiFi.RSSI(i) > secureRssi) {
      secureRssi = WiFi.RSSI(i);
      secureAuth = WiFi.encryptionType(i);
    }
  }
  WiFi.scanDelete();
  if (deviceRssi > -1000) {
    Serial.printf("[WiFi] Found \"SCAD Wireless\": RSSI %ld dBm, auth %d%s\n",
                  static_cast<long>(deviceRssi), static_cast<int>(deviceAuth),
                  deviceAuth == WIFI_AUTH_OPEN ? " (open)" : " (protected)");
  } else {
    Serial.println("[WiFi] \"SCAD Wireless\" not visible in scan; still trying it.");
  }
  if (secureRssi > -1000) {
    Serial.printf("[WiFi] Found \"SCAD_Secure_Wireless\": RSSI %ld dBm, auth %d%s\n",
                  static_cast<long>(secureRssi), static_cast<int>(secureAuth),
                  secureAuth == WIFI_AUTH_WPA2_ENTERPRISE ? " (enterprise)" : " (other)");
  } else {
    Serial.println("[WiFi] \"SCAD_Secure_Wireless\" not visible in scan; still trying it.");
  }
}
#endif

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
#if WIFI_TRY_BOTH_SCAD
  wifi_auth_mode_t deviceAuth = WIFI_AUTH_OPEN;
  wifi_auth_mode_t secureAuth = WIFI_AUTH_WPA2_ENTERPRISE;
  scanScadNetworks(deviceAuth, secureAuth);
  if (tryWifi("SCAD Wireless", deviceAuth, WIFI_PASSWORD)) return;
  if (tryWifi("SCAD_Secure_Wireless", secureAuth, WIFI_PASSWORD)) return;
  Serial.println("[WiFi] Both SCAD networks failed; retrying next loop.");
#else
  const wifi_auth_mode_t authMode = WIFI_AUTH_ENTERPRISE ? WIFI_AUTH_WPA2_ENTERPRISE :
    (strlen(WIFI_PASSWORD) == 0 ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK);
  if (!tryWifi(WIFI_SSID, authMode, WIFI_PASSWORD)) {
    Serial.println("[WiFi] FAILED — will retry next loop.");
  }
#endif
}

// ---- API -------------------------------------------------------------------
String apiPost(const String &path, const String &body, int &outCode) {
  Serial.printf("[API] Free heap: %u bytes; largest block: %u bytes\n",
                ESP.getFreeHeap(), ESP.getMaxAllocHeap());
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);
  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  String url = String(API_BASE) + path;
  Serial.printf("[API] POST %s\n", url.c_str());
  if (!http.begin(client, url)) { outCode = -1; Serial.println("[API] http.begin() failed"); return ""; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  outCode = http.POST((uint8_t *)body.c_str(), body.length());
  if (outCode <= 0) {
    Serial.printf("[API] POST failed: %s\n", HTTPClient::errorToString(outCode).c_str());
  }
  String resp = (outCode > 0) ? http.getString() : "";
  http.end();
  return resp;
}

bool reportResult(const String &jobId, bool success, const String &errorMsg, bool &applied) {
  applied = false;
  StaticJsonDocument<256> doc;
  doc["jobId"]    = jobId;
  doc["deviceId"] = DEVICE_ID;
  doc["success"]  = success;
  if (!success) doc["error"] = errorMsg;
  String body;
  serializeJson(doc, body);

  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) return false;
  int code = 0;
  const String response = apiPost("/api/life/printer/complete", body, code);
  Serial.printf("[API] complete (success=%d) -> HTTP %d\n", success, code);
  if (code != 200) return false;
  StaticJsonDocument<128> acknowledgement;
  if (!deserializeJson(acknowledgement, response)) {
    applied = acknowledgement["applied"] == true;
  }
  return true;
}

void queueCompletion(const String &jobId, bool success, const String &errorMsg) {
  pendingCompletionJobId = jobId;
  pendingCompletionSuccess = success;
  pendingCompletionError = errorMsg;
  if (!printStateReady) return;

  StaticJsonDocument<256> saved;
  saved["jobId"] = jobId;
  saved["success"] = success;
  saved["error"] = errorMsg;
  String serialized;
  serializeJson(saved, serialized);
  if (printState.putString("pending", serialized) == 0) {
    Serial.println("[JOB] Could not save pending completion to flash.");
  }
}

// Shut down the BLE stack between jobs so TLS gets its heap back. Passing false
// preserves the ability to initialize BLE again for the next print.
void bleDisconnect() {
  if (!bleInitialized) return;
  if (bleClient && bleClient->isConnected()) {
    bleClient->disconnect();
    delay(200);
  }
  BLEDevice::deinit(false);
  bleInitialized = false;
  bleClient = nullptr;
  writeChar = nullptr;
  if (printerDevice) { delete printerDevice; printerDevice = nullptr; }
  delay(300);
  Serial.printf("[BLE] Released before API. Free heap: %u bytes\n", ESP.getFreeHeap());
}

bool flushPendingCompletion() {
  if (pendingCompletionJobId.isEmpty()) return true;
  bool applied = false;
  if (!reportResult(pendingCompletionJobId, pendingCompletionSuccess, pendingCompletionError, applied)) {
    Serial.println("[API] Completion still pending; will retry before claiming another job.");
    return false;
  }
  if (applied) {
    Serial.println("[API] Completion recorded by server.");
  } else {
    Serial.println("[API] Completion response received but not applied; check Print Management.");
  }
  if (printStateReady) printState.remove("pending");
  pendingCompletionJobId = "";
  pendingCompletionError = "";
  return true;
}

void pollOnce() {
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) return;

  // Free BLE heap before TLS handshake.
  bleDisconnect();
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) return;
  if (!flushPendingCompletion()) return;

  String body = String("{\"deviceId\":\"") + DEVICE_ID + "\"}";
  int code = 0;
  String resp = apiPost("/api/life/printer/claim", body, code);

  if (code != 200) {
    Serial.printf("[API] claim -> HTTP %d\n", code);
    return;
  }

  StaticJsonDocument<2048> doc;
  auto parseError = deserializeJson(doc, resp);
  if (parseError) {
    Serial.printf("[API] claim JSON parse failed: %s\n", parseError.c_str());
    return;
  }
  if (doc["job"].isNull()) {
    Serial.println("[JOB] No pending job.");
    return;  // idle
  }

  String jobId   = doc["job"]["id"].as<String>();
  String payload = doc["job"]["payload"].as<String>();

  if (jobId == lastPrintedJobId) {
    // Already printed this exact job this session — the prior success report
    // just never landed. Retry the report only; do not print again.
    Serial.printf("[JOB] %s already printed; re-reporting success only.\n", jobId.c_str());
    queueCompletion(jobId, true, "");
    flushPendingCompletion();
    return;
  }

  Serial.printf("[JOB] Leased %s (%d bytes)\n", jobId.c_str(), payload.length());

  // Reconnect BLE to print.
  if (printPayload(payload)) {
    Serial.println("[JOB] Printed OK.");
    lastPrintedJobId = jobId;
    if (printStateReady && printState.putString("lastPrint", jobId) == 0) {
      Serial.println("[JOB] Could not save last printed job to flash.");
    }
    bleDisconnect();  // free heap before reporting
    queueCompletion(jobId, true, "");
    flushPendingCompletion();
  } else {
    Serial.println("[JOB] Print failed.");
    bleDisconnect();
    queueCompletion(jobId, false, "BLE write failed");
    flushPendingCompletion();
  }
}

// ---- setup / loop ----------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("==== PR LIFE print worker (BLE) ====");
  uint8_t wifiMac[6];
  esp_read_mac(wifiMac, ESP_MAC_WIFI_STA);
  Serial.printf(
    "[WiFi] ESP32 Wi-Fi MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
    wifiMac[0], wifiMac[1], wifiMac[2],
    wifiMac[3], wifiMac[4], wifiMac[5]
  );
  printStateReady = printState.begin("prlifeprint", false);
  if (printStateReady) {
    lastPrintedJobId = printState.getString("lastPrint", "");
    const String savedCompletion = printState.getString("pending", "");
    if (!savedCompletion.isEmpty()) {
      StaticJsonDocument<256> saved;
      if (!deserializeJson(saved, savedCompletion)) {
        pendingCompletionJobId = saved["jobId"].as<String>();
        pendingCompletionSuccess = saved["success"] == true;
        pendingCompletionError = saved["error"].as<String>();
        if (!pendingCompletionJobId.isEmpty()) {
          Serial.println("[JOB] Restored a completion report to retry.");
        }
      }
    }
  }
  WiFi.onEvent(onWifiDisconnected, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  bleInitialized = BLEDevice::init("PR-Life-Bridge");
  ensureWifi();
  if (bleInitialized) bleConnect();  // best-effort; will retry on first job if needed
}

void loop() {
  if (millis() - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = millis();
    pollOnce();
  }
  delay(50);
}
