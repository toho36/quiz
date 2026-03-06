# Quiz App – auth a identity flow

## 1. Na co dokument navazuje

Tento návrh navazuje na App Router + Clerk + SpacetimeDB architekturu a na server-authoritative runtime model.

## 2. Základní identity v systému

### `author`
- Clerk-authenticated uživatel
- vlastní quiz a authoring data
- vytváří room a bootstrapuje host session

### `host`
- runtime role pro konkrétní roomku
- nemusí být modelovaná jen jako „je přihlášený“
- musí být explicitně navázaná na roomku serverově

### `player`
- room-scoped guest identita
- display name není bezpečná identita
- reconnect musí používat serverově vydaný resume mechanismus

## 3. Doporučený přístup

- Clerk používat pro authoring identitu a host bootstrap
- runtime role držet v room-scoped datech
- SpacetimeDB reducer musí být finální autorita pro bind host/player role
- klientský nickname ani client flag se nesmí brát jako důkaz identity

## 4. Authoring flow

- uživatel se přihlásí přes Clerk
- Next.js server vrstva získá ověřenou identitu
- ownership check probíhá na serveru
- create/update/publish quiz akce nesmí jít přímo z neověřeného klienta

## 5. Doporučený host flow

### Vytvoření roomky
- `author` vybere quiz
- Next.js server ověří ownership a vytvoří room bootstrap
- runtime room zatím nebere host roli jen z klientského stavu

### Claim host role
- klient získá serverově vydaný podklad pro host claim
- připojí se do realtime vrstvy
- reducer ověří, že claim odpovídá správné roomce a oprávněné identitě
- po úspěchu se host binding uloží do runtime stavu

### Reconnect hosta
- host reconnect nesmí vytvořit druhou nezávislou host identitu
- reducer musí rebindnout existující host roli, ne založit novou
- při konfliktu více session má mít roomka jedno autoritativní host binding rozhodnutí

## 6. Doporučený player flow

### Join room
- hráč zadá room code a display name
- systém ověří, že room existuje a přijímá join
- vytvoří se room-scoped player identita
- hráč dostane resume token / reconnect secret pro další připojení

### Submit answer
- player submission musí být vázaná na runtime player identitu
- reducer ověřuje room, fázi otázky i deadline

### Reconnect player
- reconnect musí obnovit původní player binding
- nesmí vzniknout nová identita se stejným display name
- při reconnectu se mají vrátit správná runtime data včetně aktuální fáze a player score

## 7. Kde se co ověřuje

### Clerk
- kdo je author
- zda existuje ověřená user session

### Next.js server vrstva
- ownership quizu
- vytvoření room bootstrapu
- vydání host claim podkladů
- případně join bootstrap, pokud nepůjde přímo přes reducer

### SpacetimeDB reducer
- finální bind host role
- finální bind player role
- reconnect/rebind kontrola
- runtime akce podle room state a role

## 8. Bezpečnostní pravidla

- žádný privátní token nesmí být v klientu
- display name není identita
- reconnect secret musí být room-scoped
- reconnect secret má být rotovatelný nebo verzovatelný
- host claim nesmí být znovu použitelný bez omezení
- role binding nesmí být odvozen jen z UI routy nebo client stavu

## 9. Doporučený přístup pro MVP

- jeden host na roomku
- player bez povinného účtu
- jednoduchý room-scoped resume token
- host claim přes Next.js server bootstrap + reducer bind
- pozdní join během aktivní hry zakázat

## 10. Co může počkat na později

- co-host / moderator
- více host session s koordinací
- account-linked players
- cross-device player merge
- audit log identity bindingů

## 11. Otevřené otázky

- Není zatím finálně rozhodnuto, zda player join půjde v MVP přímo přes reducer, nebo přes Next.js bootstrap.
- Není zatím finálně ověřen přesný formát claim tokenu mezi Clerk/Next.js a SpacetimeDB.
- Není zatím uzavřeno, jak přesně řešit konflikt dvou současných reconnectů stejného hráče.

Pro MVP je nejbezpečnější směr držet authoring auth v Clerk + Next.js a runtime identity finálně vázat až v reducerech.

