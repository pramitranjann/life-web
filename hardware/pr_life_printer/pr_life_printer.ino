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
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEClient.h>
#include <BLEAdvertisedDevice.h>
#include <BLERemoteService.h>
#include <BLERemoteCharacteristic.h>
#include "config.h"

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
static unsigned long lastPoll = 0;
// Guards against reprinting: if /complete fails to land (BLE activity often
// leaves Wi-Fi degraded right after), the job's lease expires server-side and
// gets reclaimed as pending — the same device would otherwise print it again
// every poll until a report finally lands. Remembering only the most recent
// job id is enough since jobs are processed strictly one at a time.
static String lastPrintedJobId = "";

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

// ---- BLE connection --------------------------------------------------------
bool bleScan() {
  if (printerDevice) { delete printerDevice; printerDevice = nullptr; }
  Serial.printf("[BLE] Scanning up to %ds for printer...\n", BLE_SCAN_SECONDS);

  BLEScan *scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCallback(), true);
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(99);
  scan->start(BLE_SCAN_SECONDS, false);

  if (!printerDevice) {
    Serial.println("[BLE] Printer not found in scan window.");
    return false;
  }
  return true;
}

bool bleConnect() {
  if (!printerDevice && !bleScan()) return false;

  if (bleClient) { delete bleClient; bleClient = nullptr; writeChar = nullptr; }
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
  // Re-scan so we get a fresh device object with the correct address type.
  printerDevice = nullptr;
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
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[WiFi] Connecting to %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("[WiFi] Connected. IP %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("[WiFi] FAILED — will retry next loop.");
}

// ---- API -------------------------------------------------------------------
String apiPost(const String &path, const String &body, int &outCode) {
  Serial.printf("[API] Free heap: %d bytes\n", ESP.getFreeHeap());
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

void reportResult(const String &jobId, bool success, const String &errorMsg) {
  StaticJsonDocument<256> doc;
  doc["jobId"]    = jobId;
  doc["deviceId"] = DEVICE_ID;
  doc["success"]  = success;
  if (!success) doc["error"] = errorMsg;
  String body;
  serializeJson(doc, body);

  const int maxAttempts = 3;
  for (int attempt = 1; attempt <= maxAttempts; attempt++) {
    ensureWifi();
    int code = 0;
    apiPost("/api/life/printer/complete", body, code);
    Serial.printf("[API] complete (success=%d) attempt %d/%d -> HTTP %d\n",
                  success, attempt, maxAttempts, code);
    if (code == 200) return;
    delay(800 * attempt);
  }
}

// Temporarily drop the BLE connection so TLS has enough heap.
void bleDisconnect() {
  if (bleClient && bleClient->isConnected()) {
    bleClient->disconnect();
    delay(200);
  }
}

void pollOnce() {
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) return;

  // Free BLE heap before TLS handshake.
  bleDisconnect();

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
    reportResult(jobId, true, "");
    return;
  }

  Serial.printf("[JOB] Leased %s (%d bytes)\n", jobId.c_str(), payload.length());

  // Reconnect BLE to print.
  if (printPayload(payload)) {
    Serial.println("[JOB] Printed OK.");
    lastPrintedJobId = jobId;
    bleDisconnect();  // free heap before reporting
    reportResult(jobId, true, "");
  } else {
    Serial.println("[JOB] Print failed.");
    bleDisconnect();
    reportResult(jobId, false, "BLE write failed");
  }
}

// ---- setup / loop ----------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("==== PR LIFE print worker (BLE) ====");
  BLEDevice::init("PR-Life-Bridge");
  ensureWifi();
  bleConnect();  // best-effort; will retry on first job if needed
}

void loop() {
  if (millis() - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = millis();
    pollOnce();
  }
  delay(50);
}
