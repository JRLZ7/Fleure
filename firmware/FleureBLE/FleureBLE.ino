// Bench prototype: validate pressure accuracy, regulation/overshoot and independent pressure protection before human use.
// ESP32 Arduino core 3.x; built-in BLE + Wire. Driver inputs active HIGH; never connect loads directly to GPIOs.
// Valve HIGH = closed; LOW = vent open. Keep TherapyController.h beside this sketch.
#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "TherapyController.h"
#include "SystolicEstimator.h"
using namespace fleure;

const int greenButton = 18, redButton = 19, pumpPin = 25, solenoidPin = 26;
const int sensorSDA = 21, sensorSCL = 22;
const uint8_t sensorAddress = 0x18;
const char* SERVICE = "b498a000-8a8a-4b27-a8c5-9d0a214c1000";
const char* COMMAND = "b498a001-8a8a-4b27-a8c5-9d0a214c1000";
const char* STATE = "b498a002-8a8a-4b27-a8c5-9d0a214c1000";
BLECharacteristic* stateCharacteristic = nullptr;
Controller therapy;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
bool connected = false, pendingStart = false, pendingStop = false, lostLink = false, heartbeat = false;
bool remoteOn = false, mustReleaseGreen = false, wireReady = false;
uint16_t requestedTarget = 200, requestedDuration = 120, startRequest = 0, stopRequest = 0;
bool requestedAutomated = false;
SystolicEstimator systolicEstimator;
uint16_t ackRequest = 0;
Result ackResult = Result::None;
uint32_t lastHeartbeat = 0;
struct Button {
  int pin; bool raw = HIGH, stable = HIGH; uint32_t changed = 0;
  bool press(uint32_t now) {
    bool next = digitalRead(pin);
    if (next != raw) { raw = next; changed = now; }
    if (raw != stable && uint32_t(now - changed) >= 30) { stable = raw; return stable == LOW; }
    return false;
  }
};
Button green{greenButton}, red{redButton};
uint16_t read16(const uint8_t* b) { return uint16_t(b[0]) | (uint16_t(b[1]) << 8); }
void put16(uint8_t* b, uint16_t v) { b[0] = v & 255; b[1] = v >> 8; }
void applyOutputs() {
  if (therapy.pump) {
    digitalWrite(solenoidPin, HIGH); // Close vent before starting pump.
    digitalWrite(pumpPin, HIGH);
  } else {
    digitalWrite(pumpPin, LOW); // Stop pump before opening vent.
    digitalWrite(solenoidPin, therapy.ventClosed ? HIGH : LOW);
  }
}
void publish(uint32_t now, bool force = false) {
  static uint32_t lastPublish = 0;
  static Phase previousPhase = Phase::Idle;
  static Reason previousReason = Reason::None;
  static uint8_t frameCounter = 0;
  const bool changed = therapy.phase != previousPhase || therapy.reason != previousReason;
  if (!force && !changed && uint32_t(now - lastPublish) < 200) return;
  if (changed) {
    Serial.printf("[controller] phase=%u reason=%u pressure=%.1f valid=%u target=%u pump=%u vent_closed=%u\n",
      unsigned(therapy.phase), unsigned(therapy.reason), therapy.pressure,
      unsigned(therapy.pressureValid), unsigned(therapy.target), unsigned(therapy.pump), unsigned(therapy.ventClosed));
  }
  lastPublish = now; previousPhase = therapy.phase; previousReason = therapy.reason;
  // Protocol v2: exactly 20 bytes, fitting the default BLE notification payload.
  uint8_t b[20] = {2, uint8_t(therapy.phase), uint8_t(therapy.reason), 0};
  b[3] = therapy.telemetryFlags();
  const uint16_t p = therapy.pressureValid ? uint16_t(fminf(6553.4f, therapy.pressure) * 10 + 0.5f) : 0xFFFF;
  put16(b + 4, p); put16(b + 6, therapy.target); put16(b + 8, therapy.remainingSeconds()); put16(b + 10, therapy.duration);
  for (int i = 0; i < 4; ++i) b[12 + i] = uint8_t(therapy.runId >> (8 * i));
  put16(b + 16, ackRequest); b[18] = uint8_t(ackResult); b[19] = ++frameCounter;
  stateCharacteristic->setValue(b, sizeof(b));
  bool link; portENTER_CRITICAL(&mux); link = connected; portEXIT_CRITICAL(&mux);
  if (link) stateCharacteristic->notify();
}
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { portENTER_CRITICAL(&mux); connected = true; portEXIT_CRITICAL(&mux); }
  void onDisconnect(BLEServer*) override {
    portENTER_CRITICAL(&mux); connected = false; lostLink = true; pendingStart = false; portEXIT_CRITICAL(&mux);
  }
};
class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    const auto value = c->getValue();
    const auto* b = reinterpret_cast<const uint8_t*>(value.c_str());
    portENTER_CRITICAL(&mux);
    // v2 START includes settings + request ID. Reject legacy one-byte START.
    if ((value.length() == 7 || (value.length() == 8 && b[7] == 1)) && b[0] == 1 && !pendingStop && connected && !lostLink) {
      requestedTarget = read16(b + 1); requestedDuration = read16(b + 3); startRequest = read16(b + 5); pendingStart = true;
      requestedAutomated = value.length() == 8 && b[7] == 1;
    } else if ((value.length() == 3 || value.length() == 1) && b[0] == 0) {
      stopRequest = value.length() == 3 ? read16(b + 1) : 0; pendingStop = true; pendingStart = false;
    } else if (value.length() == 1 && b[0] == 2) heartbeat = true;
    portEXIT_CRITICAL(&mux);
  }
};

// Non-blocking conversion state. Wire transactions have a bounded timeout.
void pollPressure(uint32_t now) {
  static bool waiting = false;
  static uint32_t requestedAt = 0, lastCycle = 0, lastRead = 0;
  if (!wireReady) { therapy.sensorFailure(); return; }
  if (!waiting) {
    if (uint32_t(now - lastCycle) < 20) return;
    lastCycle = now;
    Wire.beginTransmission(sensorAddress); Wire.write(0xAA); Wire.write(0x00); Wire.write(0x00);
    if (Wire.endTransmission() != 0) { therapy.sensorFailure(); return; }
    requestedAt = now; waiting = true; return;
  }
  if (uint32_t(now - requestedAt) < 5 || uint32_t(now - lastRead) < 2) return;
  lastRead = now;
  if (Wire.requestFrom(sensorAddress, uint8_t(4)) != 4) { waiting = false; therapy.sensorFailure(); return; }
  uint8_t status = Wire.read();
  uint32_t raw = uint32_t(Wire.read()) << 16; raw |= uint32_t(Wire.read()) << 8; raw |= uint32_t(Wire.read());
  if ((status & 0x40) == 0 || (status & 0x05) != 0) { waiting = false; therapy.sensorFailure(); return; }
  if (status & 0x20) {
    if (uint32_t(now - requestedAt) >= 25) { waiting = false; therapy.sensorFailure(); }
    return;
  }
  waiting = false;
  // MPRLS0300YG00001BB: 0..300 mmHg GAUGE, transfer B = 2.5%..22.5% of 2^24.
  // Do not use the common 25 PSI/transfer-A library defaults or subtract atmospheric pressure.
  const float pressure = (float(raw) - 419430.4f) * 300.0f / 3355443.2f;
 
if (raw == 0 || raw == 0xFFFFFF) {
  therapy.sensorFailure();
  applyOutputs();
  return;
}

// First validate the measured pressure against the safety cutoff.
const uint32_t sampleTime = millis();
therapy.sample(pressure, sampleTime);

// A fault must stop actuation before any estimation or
// target changes can occur.
if (therapy.phase == Phase::Fault) {
  applyOutputs();
  return;
}

// Only process estimates during active estimation.
if (therapy.phase == Phase::EstimatingSystolic &&
    therapy.mode == Mode::AutomatedRipc) {

  systolicEstimator.sample(pressure);

  if (systolicEstimator.ready(pressure)) {
    uint16_t systolic = 0;
    const auto result = systolicEstimator.estimateDetailed(systolic);
    Serial.printf("[systolic] pressure=%.1f mmHg samples=%u last_stored=%.1f result=%s estimate=%u\n",
      pressure, systolicEstimator.count,
      systolicEstimator.count ? systolicEstimator.pressures[systolicEstimator.count - 1] : 0.0f,
      SystolicEstimator::statusText(result), systolic);
    if (result != SystolicEstimator::EstimateStatus::Accepted ||
        !therapy.acceptSystolic(systolic, sampleTime)) {
      therapy.fail(Reason::SystolicEstimation);
      applyOutputs();
      return;
    }
    Serial.printf("[systolic] target=%u mmHg phase=%u\n", therapy.target, unsigned(therapy.phase));
  }
}

// Apply the controller's latest state.
therapy.tick(sampleTime);
applyOutputs();
}
void setup() {
  Serial.begin(115200);
  digitalWrite(pumpPin, LOW); digitalWrite(solenoidPin, LOW);
  pinMode(pumpPin, OUTPUT); pinMode(solenoidPin, OUTPUT);
  pinMode(greenButton, INPUT_PULLUP); pinMode(redButton, INPUT_PULLUP);
  mustReleaseGreen = digitalRead(greenButton) == LOW;
  wireReady = Wire.begin(sensorSDA, sensorSCL, 100000);
  Wire.setTimeOut(20);
  BLEDevice::init("Fleure-Pump");
  auto server = BLEDevice::createServer(); server->setCallbacks(new ServerCallbacks());
  auto service = server->createService(SERVICE);
  auto command = service->createCharacteristic(COMMAND, BLECharacteristic::PROPERTY_WRITE);
  command->setCallbacks(new CommandCallbacks());
  stateCharacteristic = service->createCharacteristic(STATE, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  stateCharacteristic->addDescriptor(new BLE2902());
  publish(millis(), true);
  service->start(); auto advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE); advertising->setScanResponse(true); advertising->start();
  Serial.println("Fleure v2 ready: pump OFF, vent OPEN; pressure sensor required to start.");
}
void loop() {
  uint32_t now = millis();
  bool greenPress = green.press(now); red.press(now);
  bool start, stop, lost, hb, link, automated; uint16_t p, seconds, startId, stopId;
  portENTER_CRITICAL(&mux);
  start = pendingStart; stop = pendingStop; lost = lostLink; hb = heartbeat; link = connected;
  p = requestedTarget; seconds = requestedDuration; automated = requestedAutomated; startId = startRequest; stopId = stopRequest;
  pendingStart = pendingStop = lostLink = heartbeat = false;
  portEXIT_CRITICAL(&mux);
  if (hb) lastHeartbeat = now;
  bool redHeld = digitalRead(redButton) == LOW || red.stable == LOW;
  bool heartbeatLost = remoteOn && uint32_t(now - lastHeartbeat) > 5000;
  if (redHeld || stop || lost || heartbeatLost) {
    therapy.stop(redHeld ? Reason::PhysicalStop : stop ? Reason::AppStop : lost ? Reason::Disconnect : Reason::Heartbeat);
    remoteOn = false; mustReleaseGreen = true;
    if (stop) { ackRequest = stopId; ackResult = Result::Accepted; }
    else if (start) { ackRequest = startId; ackResult = Result::Unsafe; }
    applyOutputs(); // Stop before doing any I2C work.
  } else {
    if (green.stable == HIGH && digitalRead(greenButton) == HIGH) mustReleaseGreen = false;
    if (start && link) {
      ackRequest = startId; ackResult = automated ? therapy.startAutomated(seconds, now) : therapy.start(p, seconds, now);
      if (ackResult == Result::Accepted && automated) systolicEstimator.reset();
      if (ackResult == Result::Accepted) { remoteOn = true; lastHeartbeat = now; }
    } else if (greenPress && !mustReleaseGreen) {
      if (therapy.startPhysical(now) == Result::Accepted) {
        if (therapy.mode == Mode::AutomatedRipc) systolicEstimator.reset();
        remoteOn = false;
      }
    }
  }
  applyOutputs();
  pollPressure(millis());
  now = millis(); therapy.tick(now); applyOutputs();
  if (!therapy.active()) remoteOn = false;
  publish(now, start || stop || lost || heartbeatLost);
  if (lost) BLEDevice::startAdvertising();
  delay(2);
}
