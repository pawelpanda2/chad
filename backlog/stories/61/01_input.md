# Story 61 — Inputs

## Input 1

napraw mi uruchomienie contacts:

To potwierdza dokładnie problem:

MongoServerError: This node was not started with replication enabled.

MongoDB zostało uruchomione bez parametru --replSet rs0, więc nie da się wykonać rs.initiate() na działającym kontenerze.

Ten fragment:

isWritablePrimary: true

nie oznacza tutaj, że replica set działa. W trybie standalone oznacza tylko: „ten pojedynczy serwer może przyjmować zapisy”. Gdyby działał rs0, wynik zawierałby również między innymi:

setName: "rs0"
primary: "localhost:27017"
Sprawdź sposób uruchomienia kontenera
docker inspect mongodb \
  --format 'Image={{.Config.Image}} Cmd={{json .Config.Cmd}} Entrypoint={{json .Config.Entrypoint}}'

Prawdopodobnie w Cmd nie będzie:

--replSet rs0

Sprawdź również wolumen z danymi:

docker inspect mongodb \
  --format '{{range .Mounts}}{{println .Type .Name .Source "->" .Destination}}{{end}}'

Nie usuwaj tego wolumenu.

Co trzeba poprawić

Kontener musi zostać ponownie utworzony tak, aby mongod startował z:

--replSet rs0

Czyli w local_run_mongodb.sh komenda docker run powinna ostatecznie uruchamiać coś w rodzaju:

mongod --replSet rs0 --bind_ip_all

Sprawdź odpowiedni fragment skryptu:

grep -nE 'docker run|mongod|replSet|MONGO_INITDB' local_run_mongodb.sh
Ważne: autoryzacja

Masz włączone uwierzytelnianie, dlatego poprawna konfiguracja replica setu powinna również używać keyFile. Nie wystarczy bezmyślnie dopisać samego:

--replSet rs0

bo przy połączeniu replica setu i autoryzacji Mongo może następnie zgłosić:

security.keyFile is required when authorization is enabled with replica sets

Twój skrypt powinien więc:

Uruchamiać Mongo z --replSet rs0.
Mieć poprawnie zamontowany keyFile.
Poczekać na dostępność Mongo.
Wykonać uwierzytelnione rs.initiate().

Poczekać na:

isWritablePrimary: true
setName: "rs0"
Dopiero wtedy uruchomić synchronizację.
Obecny stan

Teraz jest tak:

MongoDB działa: tak
MongoDB przyjmuje zapis: tak
Uwierzytelnianie działa: tak
Replica set rs0 działa: nie
Synchronizacja działa: nie
beeper-ws działa: nie
beeper-oplog działa: nie

Nie uruchamiaj ponownie local_run_all.sh, dopóki local_run_mongodb.sh nie będzie uruchamiał Mongo z replication enabled. W przeciwnym razie każdy etap z URI zawierającym:

replicaSet=rs0

ponownie skończy się ReplicaSetNoPrimary.

konsola:
~/.zshenv loaded
pawelfluder@Pawes-Air 03_scripts % docker exec mongodb mongosh \
  -u admin \
  -p admin123 \
  --authenticationDatabase admin \
  --eval 'rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "localhost:27017" }
    ]
  })'
MongoServerError: This node was not started with replication enabled.
pawelfluder@Pawes-Air 03_scripts % docker exec mongodb mongosh \
  -u admin \
  -p admin123 \
  --authenticationDatabase admin \
  --eval 'printjson(db.hello())'
{
  isWritablePrimary: true,
  topologyVersion: {
    processId: ObjectId('6a56ec58966a752d2c447c86'),
    counter: Long('0')
  },
  maxBsonObjectSize: 16777216,
  maxMessageSizeBytes: 48000000,
  maxWriteBatchSize: 100000,
  localTime: ISODate('2026-07-15T02:18:23.723Z'),
  logicalSessionTimeoutMinutes: 30,
  connectionId: 41,
  minWireVersion: 0,
  maxWireVersion: 27,
  readOnly: false,
  ok: 1
}
pawelfluder@Pawes-Air 03_scripts %

## Input 2

Tym razem replica set już istnieje, ale klient nie potrafi znaleźć działającego PRIMARY.

Kluczowa różnica względem poprzednio:

wcześniej: replica set w ogóle nie był uruchomiony;
teraz: setName: 'rs0', maxSetVersion: 1 i maxElectionId pokazują, że rs0 został zainicjalizowany;

mimo to sterownik kończy z:

ReplicaSetNoPrimary
servers: Map(0) {}

Najbardziej prawdopodobna przyczyna po przeniesieniu portu na 27018:

aplikacja łączy się z localhost:27018,
ale replica set reklamuje członka jako localhost:27017

Sterownik najpierw trafia na 27018, pobiera konfigurację rs0, a potem próbuje przejść na adres zapisany wewnątrz replica setu. Jeżeli jest tam localhost:27017, trafia do Mongo projektu CHAD albo do niedostępnego portu. Wtedy nie znajduje primary.

Sprawdź zapisany adres członka replica setu
docker exec mongodb mongosh \
  -u admin \
  -p admin123 \
  --authenticationDatabase admin \
  --eval 'printjson(rs.conf())'

Zapewne zobaczysz coś podobnego:

members: [
  {
    _id: 0,
    host: "localhost:27017"
  }
]

A contacts powinno z hosta Maca widzieć tego członka jako:

localhost:27018
Naprawa konfiguracji rs0

Wykonaj:

docker exec mongodb mongosh \
  -u admin \
  -p admin123 \
  --authenticationDatabase admin \
  --eval '
    const cfg = rs.conf();
    cfg.members[0].host = "host.docker.internal:27018";
    rs.reconfig(cfg, { force: true });
  '

Ale tutaj jest pułapka: Mongo działające wewnątrz kontenera musi także umieć rozwiązać ten adres i połączyć się samo ze sobą. Na Docker Desktop host.docker.internal:27018 zwykle przechodzi przez hosta z powrotem do kontenera, ale przed uznaniem tego za właściwe rozwiązanie trzeba to przetestować.

Po kilku sekundach sprawdź z Maca:

mongosh \
  'mongodb://admin:admin123@localhost:27018/admin?authSource=admin&replicaSet=rs0' \
  --eval 'printjson(db.hello())'

Potrzebujesz:

setName: "rs0"
isWritablePrimary: true
primary: "host.docker.internal:27018"
Prostszym rozwiązaniem lokalnym jest directConnection=true

Dla pojedynczego lokalnego noda możesz pozostawić rs0, ale w URI aplikacji dodać:

directConnection=true

Czyli:

mongodb://admin:admin123@localhost:27018/beeper?authSource=admin&replicaSet=rs0&directConnection=true

To mówi sterownikowi:

łącz się dokładnie z localhost:27018 i nie próbuj przełączać się na adres reklamowany przez replica set.

Dla lokalnego jednoelementowego Mongo w Dockerze jest to często najprostsze rozwiązanie. Powinno zostać zastosowane konsekwentnie w:

.env
beeper-sync
beeper-ws
beeper-oplog
dashboard
Google Contacts sync
Co dokładnie padło

Nie tylko krok Google Contacts. Najpewniej wszystkie kroki używające Mongo miały ten sam błąd, ale pipeline doszedł do 7/7 i ponownie wydrukował fałszywy sukces.

Potem:

beeper-ws padł;
beeper-oplog padł;
oba przez ReplicaSetNoPrimary;
dashboard Vite wystartował jako proces, ale nie oznacza to, że ma działające połączenie z bazą.

Czyli naprawiono uruchomienie rs0, ale nie naprawiono adresu odkrywanego przez sterownik po zmianie hostowego portu z 27017 na 27018. Najpierw poleciłbym sprawdzić rs.conf(), a następnie dla lokalnego środowiska dodać directConnection=true.

## Input 3

zapisz w story 61 rozwiazanie tego problemu bug'a
i taski ktore msuiales zrobic zeby przywrocic dzialanie
