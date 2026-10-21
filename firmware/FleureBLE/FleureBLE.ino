// LED-only bench prototype. No pump or valve outputs.
// ESP32 Arduino core 3.x, built-in BLE library.
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

const int greenButton=18, redButton=19, greenLED=25, redLED=26;
const char* SERVICE="b498a000-8a8a-4b27-a8c5-9d0a214c1000";
const char* COMMAND="b498a001-8a8a-4b27-a8c5-9d0a214c1000";
const char* STATE="b498a002-8a8a-4b27-a8c5-9d0a214c1000";
BLECharacteristic* stateCharacteristic;
portMUX_TYPE mux=portMUX_INITIALIZER_UNLOCKED;
bool connected=false, pendingStart=false, pendingStop=false, lostLink=false, heartbeat=false;
bool deviceOn=false, remoteOn=false, mustReleaseGreen=false;
unsigned long lastHeartbeat=0;
struct Button {
 int pin; bool raw=HIGH, stable=HIGH; unsigned long changed=0;
 bool press(unsigned long now) {
  bool next=digitalRead(pin);
  if(next!=raw){raw=next;changed=now;}
  if(raw!=stable && now-changed>=30){stable=raw;return stable==LOW;}
  return false;
 }
};
Button green{greenButton}, red{redButton};
void apply(bool on,const char* reason){
 bool changed=deviceOn!=on; deviceOn=on;
 digitalWrite(greenLED,on?HIGH:LOW);digitalWrite(redLED,on?LOW:HIGH);
 uint8_t value=on?1:0;stateCharacteristic->setValue(&value,1);
 if(changed){stateCharacteristic->notify();Serial.printf("State %s: %s\n",on?"ON":"OFF",reason);}
}
class ServerCallbacks:public BLEServerCallbacks {
 void onConnect(BLEServer*) override {portENTER_CRITICAL(&mux);connected=true;portEXIT_CRITICAL(&mux);}
 void onDisconnect(BLEServer*) override {
  portENTER_CRITICAL(&mux);connected=false;lostLink=true;pendingStart=false;portEXIT_CRITICAL(&mux);
 }
};
class CommandCallbacks:public BLECharacteristicCallbacks {
 void onWrite(BLECharacteristic* c) override {
  auto value=c->getValue();if(value.length()!=1)return;
  uint8_t command=value[0];
  portENTER_CRITICAL(&mux);
  if(command==0){pendingStop=true;pendingStart=false;}
  else if(command==1 && !pendingStop)pendingStart=true;
  else if(command==2)heartbeat=true;
  portEXIT_CRITICAL(&mux);
 }
};
void setup(){
 Serial.begin(115200);
 pinMode(greenButton,INPUT_PULLUP);pinMode(redButton,INPUT_PULLUP);
 pinMode(greenLED,OUTPUT);pinMode(redLED,OUTPUT);
 digitalWrite(greenLED,LOW);digitalWrite(redLED,HIGH);
 mustReleaseGreen=digitalRead(greenButton)==LOW;
 BLEDevice::init("Fleure-LED");
 auto server=BLEDevice::createServer();server->setCallbacks(new ServerCallbacks());
 auto service=server->createService(SERVICE);
 auto command=service->createCharacteristic(COMMAND,BLECharacteristic::PROPERTY_WRITE);
 command->setCallbacks(new CommandCallbacks());
 stateCharacteristic=service->createCharacteristic(STATE,BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_NOTIFY);
 stateCharacteristic->addDescriptor(new BLE2902());uint8_t off=0;stateCharacteristic->setValue(&off,1);
 service->start();auto advertising=BLEDevice::getAdvertising();advertising->addServiceUUID(SERVICE);advertising->setScanResponse(true);advertising->start();
 Serial.println("Fleure LED prototype ready, OFF");
}
void loop(){
 unsigned long now=millis();bool greenPress=green.press(now);red.press(now);
 bool start,stop,lost,hb,link;
 portENTER_CRITICAL(&mux);
 start=pendingStart;stop=pendingStop;lost=lostLink;hb=heartbeat;link=connected;
 pendingStart=false;pendingStop=false;lostLink=false;heartbeat=false;
 portEXIT_CRITICAL(&mux);
 if(hb)lastHeartbeat=now;
 // Raw red input stops immediately. Debounced state prevents starting during release bounce.
 bool redHeld=digitalRead(redButton)==LOW || red.stable==LOW;
 bool timeout=remoteOn && now-lastHeartbeat>5000;
 if(redHeld || stop || lost || timeout){
  apply(false,redHeld?"physical_stop":stop?"app_stop":lost?"disconnect":"heartbeat_timeout");
  remoteOn=false;mustReleaseGreen=true;
 }else{
  if(green.stable==HIGH && digitalRead(greenButton)==HIGH)mustReleaseGreen=false;
  if(start && link){lastHeartbeat=now;remoteOn=true;apply(true,"app_start");}
  else if(greenPress && !mustReleaseGreen){remoteOn=false;apply(true,"physical_start");}
 }
 if(lost)BLEDevice::startAdvertising();
 delay(5);
}
