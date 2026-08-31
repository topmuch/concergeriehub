#!/bin/bash
# E2E ÉTAPE 13 — Automatisations & Notifications (curl)
BASE=http://localhost:3000
T=/home/z/my-project/tmp-tests
mkdir -p $T
JAR_S=$T/sofia.jar; JAR_M=$T/marie.jar; JAR_A=$T/alex.jar; JAR_C=$T/sophie.jar; JAR_N=$T/nina.jar
STUDIO=cmthbod6n0001p0emz62ey2go
LOFT=cmthbq68h0001p0hw1vqycblm
BOOKING_PENDING=cmthfe2fm000jp0we26hmb9ec
PROVIDER=cmthbq696002up0hw1hifypi4
PASS=0; FAIL=0

j() { bun -e "const d=JSON.parse(await Bun.stdin.text()); $1"; }

login() { # $1=email $2=password $3=jar
  rm -f "$3"
  local csrf=$(curl -s -c "$3" $BASE/api/auth/csrf | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
  curl -s -b "$3" -c "$3" -X POST $BASE/api/auth/callback/credentials \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "csrfToken=$csrf&email=$1&password=$2" -o /dev/null -w ''
}

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 — attendu: $3, obtenu: $2"; fi }

echo "== 0. Purge préalable des résidus de runs précédents =="
bun -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const HOST=['host_booking','host_cleaning','host_checkin','host_checkout','host_maintenance','host_team'];
  const n1=await p.notification.deleteMany({where:{type:{in:HOST},OR:[{body:{contains:'Test Automations'}},{body:{contains:'Test Marie Flow'}},{body:{contains:'Test Ménage Flow'}},{body:{contains:'fuite'}}]}});
  const sr=await p.serviceRequest.deleteMany({where:{description:{contains:'Test fuite'}}});
  console.log('  🧹 résidus purgés:',n1.count,'notifs,',sr.count,'serviceRequests');
  await p.\$disconnect();
})();
"

echo "== 1. Connexions =="
login sofia@exemple.fr 'Host2024!' $JAR_S
login demo@qrdomotik.roomscan.pro 'Demo2024!' $JAR_M
login alex@qrdomotik.roomscan.pro 'Demo2024!' $JAR_A
login sophie@qrdomotik.roomscan.pro 'Demo2024!' $JAR_C
login nina@qrdomotik.roomscan.pro 'Demo2024!' $JAR_N
code=$(curl -s -b $JAR_S -o /dev/null -w '%{http_code}' $BASE/api/airbnb/automations)
check "auth sofia (GET automations)" "$code" "200"

echo "== 2. GET automations — catalogue déployé =="
PN=$(curl -s -b $JAR_S $BASE/api/airbnb/automations | j 'console.log(d.automations[0].property.name)')
NRULES=$(curl -s -b $JAR_S $BASE/api/airbnb/automations | j 'console.log(d.automations[0].rules.length)')
echo "  bien=$PN règles=$NRULES"
check "1 bien pilotable" "$(curl -s -b $JAR_S $BASE/api/airbnb/automations | j 'console.log(d.automations.length)')" "1"
check "7 règles déployées" "$NRULES" "7"

echo "== 3. PATCH règle (toggle OFF) =="
RULE_ID=$(curl -s -b $JAR_S $BASE/api/airbnb/automations | j 'console.log(d.automations[0].rules.find(r=>r.key==="booking_created_team").id)')
code=$(curl -s -b $JAR_S -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/airbnb/automations?ruleId=$RULE_ID" -H 'Content-Type: application/json' -d '{"isActive":false}')
check "toggle OFF -> 200" "$code" "200"
val=$(curl -s -b $JAR_S $BASE/api/airbnb/automations | j 'console.log(d.automations[0].rules.find(r=>r.key==="booking_created_team").isActive)')
check "règle bien désactivée" "$val" "false"

echo "== 4. Booking avec règle OFF -> PAS de notification =="
code=$(curl -s -b $JAR_S -o $T/booking1.json -w '%{http_code}' -X POST "$BASE/api/airbnb/properties/$STUDIO/bookings" -H 'Content-Type: application/json' \
  -d '{"guestName":"Test Automations OFF","checkIn":"2026-10-05T15:00:00.000Z","checkOut":"2026-10-08T10:00:00.000Z","guests":2,"source":"MANUAL"}')
check "POST booking OFF -> 201" "$code" "201"
B1=$(j 'console.log(d.booking.id)' < $T/booking1.json)
n=$(curl -s -b $JAR_S "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_booking"&&x.body.includes("Test Automations OFF")).length)')
check "0 notif host_booking (règle off)" "$n" "0"

echo "== 5. PATCH règle ON + booking -> notification =="
curl -s -b $JAR_S -o /dev/null -X PATCH "$BASE/api/airbnb/automations?ruleId=$RULE_ID" -H 'Content-Type: application/json' -d '{"isActive":true}'
code=$(curl -s -b $JAR_S -o $T/booking2.json -w '%{http_code}' -X POST "$BASE/api/airbnb/properties/$STUDIO/bookings" -H 'Content-Type: application/json' \
  -d '{"guestName":"Test Automations ON","checkIn":"2026-10-12T15:00:00.000Z","checkOut":"2026-10-15T10:00:00.000Z","guests":3,"source":"AIRBNB"}')
check "POST booking ON -> 201" "$code" "201"
B2=$(j 'console.log(d.booking.id)' < $T/booking2.json)
n=$(curl -s -b $JAR_S "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_booking"&&x.body.includes("Test Automations ON")).length)')
check "1 notif host_booking (règle on)" "$n" "1"

echo "== 6. Tick quotidien idempotent (Julien Rivière, arrivée du jour) =="
n1=$(curl -s -b $JAR_S "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_checkin"&&x.body.includes("Julien Rivière")).length)')
curl -s -b $JAR_S "$BASE/api/airbnb/notifications?limit=50" > /dev/null
n2=$(curl -s -b $JAR_S "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_checkin"&&x.body.includes("Julien Rivière")).length)')
check "host_checkin présent" "$n1" "1"
check "pas de doublon au 2e tick" "$n2" "1"

echo "== 7. Mark read individuel + global =="
first_unread=$(curl -s -b $JAR_S "$BASE/api/airbnb/notifications?limit=50&unreadOnly=1" | j 'console.log(d.notifications[0]?.id ?? "")')
if [ -n "$first_unread" ]; then
  before=$(curl -s -b $JAR_S "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.unreadCount)')
  after=$(curl -s -b $JAR_S -X PATCH "$BASE/api/airbnb/notifications?notificationId=$first_unread" | j 'console.log(d.unreadCount)')
  check "unread diminue (PATCH)" "$((before-after))" "1"
fi
all=$(curl -s -b $JAR_S -X PUT $BASE/api/airbnb/notifications | j 'console.log(d.unreadCount)')
check "PUT mark-all -> unreadCount 0" "$all" "0"

echo "== 8. Flux équipe : booking par Marie -> Alex + Sophie notifiés =="
code=$(curl -s -b $JAR_M -o $T/booking3.json -w '%{http_code}' -X POST "$BASE/api/airbnb/properties/$LOFT/bookings" -H 'Content-Type: application/json' \
  -d '{"guestName":"Test Marie Flow","checkIn":"2026-11-02T15:00:00.000Z","checkOut":"2026-11-05T10:00:00.000Z","guests":2,"source":"MANUAL"}')
check "POST booking Loft -> 201" "$code" "201"
B3=$(j 'console.log(d.booking.id)' < $T/booking3.json)
na=$(curl -s -b $JAR_A "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_booking"&&x.body.includes("Test Marie Flow")).length)')
check "Alex reçoit host_booking (NOTIFY_OWNERS)" "$na" "1"
ns=$(curl -s -b $JAR_C "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_cleaning"&&x.body.includes("Test Marie Flow")).length)')
check "Sophie reçoit host_cleaning (NOTIFY_CLEANERS)" "$ns" "1"

echo "== 9. Guards : Sophie (CLEANER) ne pilote pas les automatisations =="
S_RULE=$(curl -s -b $JAR_M $BASE/api/airbnb/automations | j 'console.log(d.automations[0].rules[0].id)')
code=$(curl -s -b $JAR_C -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/airbnb/automations?ruleId=$S_RULE" -H 'Content-Type: application/json' -d '{"isActive":false}')
check "Sophie PATCH règle -> 403" "$code" "403"
code=$(curl -s -b $JAR_C -o /dev/null -w '%{http_code}' $BASE/api/airbnb/automations)
check "Sophie GET automations -> 200" "$code" "200"
empty=$(curl -s -b $JAR_C $BASE/api/airbnb/automations | j 'console.log(d.automations.length)')
check "liste vide pour CLEANER" "$empty" "0"

echo "== 10. Sophie termine le ménage -> Marie notifiée (CLEANING_DONE) =="
code=$(curl -s -b $JAR_M -o $T/booking4.json -w '%{http_code}' -X POST "$BASE/api/airbnb/properties/$LOFT/bookings" -H 'Content-Type: application/json' \
  -d '{"guestName":"Test Ménage Flow","checkIn":"2026-12-01T15:00:00.000Z","checkOut":"2026-12-04T10:00:00.000Z","guests":2,"source":"MANUAL"}')
check "POST booking ménage Loft -> 201" "$code" "201"
B4=$(j 'console.log(d.booking.id)' < $T/booking4.json)
code=$(curl -s -b $JAR_C -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/airbnb/properties/$LOFT/bookings?bookingId=$B4" -H 'Content-Type: application/json' -d '{"cleaningStatus":"DONE"}')
check "Sophie PATCH cleaning DONE -> 200" "$code" "200"
nm=$(curl -s -b $JAR_M "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_cleaning"&&x.body.includes("Test Ménage Flow")&&x.body.includes("terminé")).length)')
check "Marie reçoit host_cleaning (Ménage terminé)" "$nm" "1"

echo "== 11. Réclamation technique -> Nina (MAINTENANCE) notifiée =="
code=$(curl -s -o $T/sr.json -w '%{http_code}' -X POST $BASE/api/client/service-requests -H 'Content-Type: application/json' \
  -d "{\"propertyId\":\"$LOFT\",\"providerId\":\"$PROVIDER\",\"description\":\"Test fuite sous l\\u00e9vier\",\"urgencyLevel\":\"urgent\"}")
check "POST service-request -> 201" "$code" "201"
nn=$(curl -s -b $JAR_N "$BASE/api/airbnb/notifications?limit=50" | j 'console.log(d.notifications.filter(x=>x.type==="host_maintenance"&&x.body.includes("lévier")).length)')
check "Nina reçoit host_maintenance" "$nn" "1"

echo "== 12. Nettoyage des données de test =="
curl -s -b $JAR_S -o /dev/null -X DELETE "$BASE/api/airbnb/properties/$STUDIO/bookings?bookingId=$B1"
curl -s -b $JAR_S -o /dev/null -X DELETE "$BASE/api/airbnb/properties/$STUDIO/bookings?bookingId=$B2"
curl -s -b $JAR_M -o /dev/null -X DELETE "$BASE/api/airbnb/properties/$LOFT/bookings?bookingId=$B3"
curl -s -b $JAR_M -o /dev/null -X DELETE "$BASE/api/airbnb/properties/$LOFT/bookings?bookingId=$B4"
bun -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const HOST=['host_booking','host_cleaning','host_checkin','host_checkout','host_maintenance','host_team'];
  const n1=await p.notification.deleteMany({where:{type:{in:HOST},OR:[{body:{contains:'Test Automations'}},{body:{contains:'Test Marie Flow'}},{body:{contains:'Test Ménage Flow'}},{body:{contains:'fuite'}}]}});
  const sr=await p.serviceRequest.deleteMany({where:{description:{contains:'Test fuite'}}});
  console.log('  🧹 notifs test supprimées:',n1.count,'| serviceRequests test:',sr.count);
  await p.\$disconnect();
})();
"
echo "  🧹 bookings de test supprimés"

echo ""
echo "=========================================="
echo "RÉSULTAT : $PASS OK / $FAIL ÉCHEC(S)"
echo "=========================================="
exit $FAIL
