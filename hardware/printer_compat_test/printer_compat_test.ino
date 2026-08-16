/*
 * PR LIFE — Printer BLE compatibility test
 * =========================================
 * Scans for "BlueTooth Printer", connects using the discovered device object
 * (correct address type is preserved), then sends a test ESC/POS receipt.
 *
 * Board: ESP32 Dev Module. Core 3.x.
 */

#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEClient.h>
#include <BLEAdvertisedDevice.h>
#include <BLERemoteService.h>
#include <BLERemoteCharacteristic.h>

// Candidates: service UUID, write char UUID
const char *CANDIDATES[][2] = {
  { "000018f0-0000-1000-8000-00805f9b34fb", "00002af1-0000-1000-8000-00805f9b34fb" },
  { "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
  { "0000ff00-0000-1000-8000-00805f9b34fb", "0000ff02-0000-1000-8000-00805f9b34fb" },
};
const int NUM_CANDIDATES = 3;

#define CHUNK_SIZE  20
#define CHUNK_DELAY 30
#define INIT_DELAY_MS 120
#define TRAILER_DELAY_MS 250
#define FLUSH_DELAY_MS 4000

static BLEAdvertisedDevice *targetDevice = nullptr;
static BLEClient *client = nullptr;
static BLERemoteCharacteristic *writeChar = nullptr;

// ---- Scanner: stop as soon as we find the printer --------------------------
class ScanCallback : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice dev) {
    String name = dev.haveName() ? dev.getName().c_str() : "";
    String mac  = dev.getAddress().toString().c_str();
    Serial.printf("[SCAN] %s  %s\n", mac.c_str(), name.c_str());

    if (name == "BlueTooth Printer" || mac == "5a:4a:6a:78:4d:0f") {
      Serial.println("[SCAN] >>> Found printer. Stopping scan.");
      targetDevice = new BLEAdvertisedDevice(dev);
      BLEDevice::getScan()->stop();
    }
  }
};

// ---- BLE write helpers -----------------------------------------------------
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
    delay(CHUNK_DELAY);
  }
  return true;
}

bool bleWriteStr(const char *str) {
  return bleWrite((const uint8_t *)str, strlen(str));
}

bool printTestReceipt() {
  const uint8_t init[] = { 0x1B, 0x40 };
  if (!bleWrite(init, sizeof(init))) return false;
  delay(INIT_DELAY_MS);
  if (!bleWriteStr("PR LIFE - Printer connected.\n")) return false;
  delay(TRAILER_DELAY_MS);
  const uint8_t feed[] = { 0x1B, 0x64, 0x04 };
  if (!bleWrite(feed, sizeof(feed))) return false;
  const uint8_t cut[] = { 0x1D, 0x56, 0x42, 0x00 };
  if (!bleWrite(cut, sizeof(cut))) return false;
  Serial.printf("[BLE] Waiting %dms for printer flush.\n", FLUSH_DELAY_MS);
  delay(FLUSH_DELAY_MS);
  return true;
}

// ---- Connect using the scanned device object (preserves address type) ------
bool connectAndPrint() {
  client = BLEDevice::createClient();
  Serial.printf("[BLE] Connecting to %s...\n",
                targetDevice->getAddress().toString().c_str());

  if (!client->connect(targetDevice)) {
    Serial.println("[BLE] connect() failed.");
    return false;
  }
  Serial.println("[BLE] Connected. Searching for write characteristic...");

  for (int i = 0; i < NUM_CANDIDATES; i++) {
    BLERemoteService *svc = client->getService(CANDIDATES[i][0]);
    if (!svc) continue;

    BLERemoteCharacteristic *ch = svc->getCharacteristic(CANDIDATES[i][1]);
    if (!ch) continue;

    Serial.printf("[BLE] Using %s / %s\n", CANDIDATES[i][0], CANDIDATES[i][1]);
    writeChar = ch;
    Serial.printf("[BLE] Characteristic props: write=%d writeNoResp=%d\n",
                  writeChar->canWrite(), writeChar->canWriteNoResponse());

    Serial.println("[TX] Sending ESC/POS test receipt...");
    if (!printTestReceipt()) {
      Serial.println("[TX] Test write failed.");
      continue;
    }

    Serial.println();
    Serial.println(">>> RESULT: Connected and bytes written.");
    Serial.println(">>> Did 'PR LIFE - Printer connected.' print on paper?");
    Serial.println(">>>   YES -> ESC/POS over BLE works. Done.");
    Serial.println(">>>   NO  -> Report what happened.");
    Serial.println("[i] Type 'r' to reprint.");
    return true;
  }

  Serial.println("[BLE] No usable write characteristic found.");
  client->disconnect();
  return false;
}

// ---- setup / loop ----------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("==========================================");
  Serial.println(" PR LIFE - BLE Printer compatibility test");
  Serial.println("==========================================");
  Serial.println("[SCAN] Scanning for printer (up to 15s)...");

  BLEDevice::init("PR-Life-Bridge");
  BLEScan *scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCallback());
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(99);
  scan->start(15, false);

  if (!targetDevice) {
    Serial.println("[SCAN] Printer not found in 15 seconds.");
    return;
  }

  connectAndPrint();
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'r' && client && client->isConnected()) {
      Serial.println("[TX] Reprinting...");
      if (!printTestReceipt()) {
        Serial.println("[TX] Reprint failed.");
      }
    }
  }
  delay(50);
}
