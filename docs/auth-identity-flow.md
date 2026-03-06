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

- Clerk používat pro authoring identitu a serverové ověření hosta
- Next.js server po ověření Clerk session vydává runtime-specific host claim proof; raw Clerk token se do runtime vrstvy nepředává
- runtime role držet v room-scoped datech
- SpacetimeDB connection identity / private access token je transportní credential, ne automatický důkaz host/player role v roomce
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
- Next.js server přes Clerk `auth()` ověří user session i ownership quizu a vytvoří room bootstrap
- odpověď `create_room` v MVP rovnou vrací initial host claim proof a jeho krátkou expiraci
- runtime room zatím nebere host roli jen z klientského stavu

### Claim host role
- klient získá krátkodobý jednorázový host claim proof vydaný Next.js serverem
- proof má pro MVP logicky nést `purpose=host_claim`, `room_id`, `clerk_user_id`, `clerk_session_id`, `jti`, `iat`, `exp`, `v`
- proof je podepsaný app-specific runtime bootstrap key, ne raw Clerk credentialem; doporučený TTL pro MVP je 60 sekund
- klient se připojí do realtime vrstvy a předá proof reduceru spolu s pomocným transport/session údajem, který ale není důkaz identity
- reducer ověří podpis, expiraci, `purpose`, správnou roomku a dosud nespotřebované `jti`; teprve pak bindne aktuální SpacetimeDB identity/connection jako jediného hosta roomky
- po úspěchu se uloží `host_binding_version`, aby šlo odlišit starý a nový aktivní bind

### Reconnect hosta
- host reconnect si v MVP vyžádá nový short-lived host claim z Next.js serveru; nepoužívá se žádný dlouhodobý host resume token
- reducer musí rebindnout existující host roli, ne založit novou
- při validním rebindu stejného `clerk_user_id` se zvýší `host_binding_version` a nová connection převezme autoritu
- commandy přicházející ze starého host spojení se po takeoveru odmítají; pokud je stejný claim použit dvakrát, první commit vyhraje a další použití se odmítne jako replay / stale proof

## 6. Doporučený player flow

### Join room
- hráč zadá room code a display name
- MVP join jde přímo přes SpacetimeDB reducer, ne přes Next.js bootstrap
- reducer ověří, že room existuje, je joinable a že `display_name` splňuje room policy
- vytvoří se room-scoped `room_player_id`
- hráč dostane `resume_token`, `resume_expires_at` a room-scoped identifikátory pro další připojení

### Player resume credential
- `resume_token` je pro MVP opaque náhodný secret s vysokou entropií (preferovaně 256 bitů, minimálně 128 bitů)
- token je room-scoped a server/reducer drží jen jeho hash společně s `room_player_id`, `resume_version`, `issued_at` a `expires_at`
- klient si lokálně drží jen aktuální trojici `room_id`, `room_player_id`, `resume_token`; display name sám o sobě nestačí k obnově identity

### Submit answer
- player submission musí být vázaná na runtime player identitu
- reducer ověřuje room, fázi otázky i deadline

### Reconnect player
- reconnect payload nese `room_id`, `room_player_id` a aktuální `resume_token`
- reducer přijme reconnect jen pokud hash tokenu sedí na aktivní verzi, token neexpiruje a room state je ještě reconnectable podle lifecycle policy
- při úspěšném reconnectu se token okamžitě rotuje, zvýší se `resume_version` a klient dostane nový `resume_token` + nové `resume_expires_at`
- při souběhu dvou reconnectů se stejným tokenem vyhraje první commit; druhý request se odmítne jako `stale_resume_token` / replay
- staré aktivní spojení po takeoveru ztrácí autoritu a další commandy se odmítají; pokud to SDK/UI dovolí, má dostat explicitní `session_replaced` signal
- nesmí vzniknout nová identita se stejným display name
- při reconnectu se mají vrátit správná runtime data včetně aktuální fáze a player score

## 7. Kde se co ověřuje

### Clerk
- kdo je author
- zda existuje ověřená user session

### Next.js server vrstva
- ownership quizu
- vytvoření room bootstrapu
- vydání jednorázového host claim proofu z ověřené Clerk session
- pro MVP nevydává player join bootstrap; player join validuje přímo reducer

### SpacetimeDB reducer
- finální bind host role po validaci a spotřebování host claim proofu
- finální bind player role při direct join flow
- reconnect/rebind kontrola včetně token hash match, rotace tokenu a takeoveru aktivní connection
- runtime akce podle room state a role

## 8. Bezpečnostní pravidla

- žádný server secret, signing key ani raw Clerk credential nesmí být v klientu
- SpacetimeDB private access token ani player `resume_token` samy o sobě nesmí povyšovat session na host/player roli bez room-scoped reducer bindu
- display name není identita
- reconnect secret musí být room-scoped a serverově uložený jen jako hash
- reconnect secret má být rotovatelný nebo verzovatelný
- reconnect secret musí mít explicitní expiraci; pro MVP nejpozději po 12 hodinách od vydání a vždy dřív, pokud room přestane být reconnectable
- host claim nesmí být znovu použitelný bez omezení a má mít jednorázové `jti`
- role binding nesmí být odvozen jen z UI routy nebo client stavu

## 9. Doporučený přístup pro MVP

- jeden host na roomku
- player bez povinného účtu
- player join přímo přes reducer
- `create_room` rovnou vrací initial host claim proof
- host claim přes Next.js server bootstrap + reducer bind
- player `resume_token` je opaque room-scoped secret, ukládá se serverově jen jako hash a rotuje se při každém úspěšném reconnectu
- při souběžném reconnectu vyhraje nejnovější úspěšný rebind a stará session ztrácí autoritu
- pozdní join během aktivní hry zakázat

## 10. Co může počkat na později

- co-host / moderator
- více host session s koordinací
- account-linked players
- cross-device player merge
- audit log identity bindingů

## 11. Uzavřená MVP rozhodnutí

- player join v MVP jde přímo přes SpacetimeDB reducer
- host claim mezi Clerk / Next.js / SpacetimeDB je app-issued, room-scoped, signed, single-use proof s TTL 60 sekund
- player reconnect používá opaque rotate-on-use token s explicitní expirací a serverovým hash storage
- při konfliktu dvou současných reconnectů stejné identity vyhraje první úspěšný commit a starý bind ztrácí autoritu

Pro MVP zůstává nejbezpečnější směr držet authoring auth v Clerk + Next.js a runtime identity finálně vázat až v reducerech.

