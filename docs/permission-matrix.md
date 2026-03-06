# Quiz App – permission matrix

## 1. Na co dokument navazuje

Tento dokument navazuje na:

- `docs/architecture-analysis.md`
- `docs/authoring-runtime-boundary.md`
- dosavadní rozhodnutí o serverově autoritativním runtime modelu

Cíl je přesně určit:

- kdo smí provést jakou akci,
- kde se oprávnění ověřuje,
- co nesmí být nikdy řízené klientem.

## 2. Role v systému

### `visitor`
- nepřihlášený uživatel mimo roomku
- může zobrazit veřejné stránky a vstoupit do join flow

### `author`
- Clerk-authenticated vlastník quizů
- spravuje authoring data přes Next.js server vrstvu

### `host`
- runtime operátor konkrétní roomky
- typicky author nebo jím autorizovaná session
- host role musí být navázaná serverově, ne jen klientským flagem

### `player`
- účastník konkrétní roomky
- může být guest bez Clerk účtu
- identita musí být room-scoped

### `system`
- Next.js server vrstva a SpacetimeDB reducer logika
- jediná autorita pro correctness, scoring, deadlines a state transitions

## 3. Vrstvy ověřování

### Clerk
- ověření identity autora
- ochrana dashboard/create/edit route
- podklad pro serverové rozhodnutí, zda smí vzniknout host bootstrap flow

### Next.js server vrstva
- ownership check nad quizzem
- create/update/publish quiz akcí
- create room a host claim bootstrap
- vydání krátkodobého jednorázového host claimu pro runtime

### SpacetimeDB reducers
- runtime autorita pro roomku
- finální kontrola host-only a player-only akcí
- finální kontrola, zda actor patří do roomky
- direct player join bind, player reconnect token rotace a host takeover pravidla
- finální kontrola gameplay state a deadline pravidel

## 4. Permission matrix podle oblasti

### Authoring akce

- vytvořit quiz
  - kdo: `author`
  - kontrola: Clerk + Next.js server
- upravit quiz
  - kdo: `author` vlastník quizu
  - kontrola: Clerk + Next.js server ownership check
- publikovat / archivovat quiz
  - kdo: `author` vlastník quizu
  - kontrola: Clerk + Next.js server ownership check

### Room management akce

- vytvořit room z quizu
  - kdo: `author`
  - kontrola: Clerk + Next.js server
- claimnout host roli pro roomku
  - kdo: autorizovaný `host`
  - kontrola: Next.js server bootstrap + SpacetimeDB reducer bind se short-lived single-use claimem
- ukončit roomku / abort
  - kdo: `host`
  - kontrola: SpacetimeDB reducer
- reconnect hosta
  - kdo: původně navázaný `host`
  - kontrola: nový Next.js-issued host claim + reducer; nejnovější validní rebind přebírá autoritu

### Player akce

- join room
  - kdo: `player`
  - kontrola: přímo SpacetimeDB reducer v MVP
- reconnect player
  - kdo: původní `player`
  - kontrola: room-scoped opaque `resume_token` + reducer bind; při úspěchu se token rotuje
- update display name
  - kdo: v MVP raději jen před startem hry
  - kontrola: reducer + room state check

### Gameplay akce

- start game
  - kdo: `host`
  - kontrola: reducer
- open next question
  - kdo: `host` nebo `system`
  - kontrola: reducer
- close question
  - kdo: `host` nebo `system` po deadline
  - kontrola: reducer
- reveal answer
  - kdo: `host` nebo `system`
  - kontrola: reducer
- show leaderboard / continue dál
  - kdo: `host` nebo `system`
  - kontrola: reducer
- submit answer
  - kdo: `player`
  - kontrola: reducer

## 5. Co musí zůstat vždy server-authoritative

Nikdy nesmí rozhodovat klient:

- zda je odpověď správně,
- kolik bodů bylo uděleno,
- zda deadline už vypršel,
- zda je room ve stavu `lobby / in_progress / finished`,
- zda je hráč host nebo player,
- pořadí leaderboardu,
- zda byl submission přijat nebo odmítnut.

## 6. Hlavní validační pravidla v runtime

- `player` smí submitnout jen do své roomky
- submit je platný jen v `question_open`
- po deadlinu se submit odmítá
- host nesmí provádět gameplay akce mimo platný stavový přechod
- player nesmí měnit cizí submission
- reconnect nesmí vytvořit druhou nezávislou identitu stejného hráče
- po úspěšném host/player rebindu stará connection ztrácí oprávnění pro další commandy

## 7. Doporučený přístup

- authoring práva řešit primárně v Next.js server vrstvě
- runtime práva řešit definitivně v SpacetimeDB reducerech
- client používat jen jako UI vrstvu, ne jako autoritu
- role binding v roomce ukládat explicitně v runtime stavu

## 8. Možné varianty

- host = vždy jen author daného quizu
- host = author nebo sdílený moderator/co-host
- join flow přímo přes reducer
- join flow přes Next.js server bootstrap a následný reducer bind

Pro MVP je zvolený direct join přes reducer a host bootstrap přes Next.js server + reducer bind; finální runtime kontrola zůstává v reducerech.

## 9. Co je vhodné pro MVP

- jeden host pro roomku
- guest players bez povinného Clerk účtu
- create room jen pro `author` přes Next.js server
- host claim jako krátkodobý jednorázový proof
- late join během aktivní hry zakázaný
- answer change po přijetí submission zakázaná
- reconnect přes room-scoped opaque resume token s rotací při úspěšném rebindu

## 10. Co může počkat na později

- co-host / moderator role
- spectator role
- kick / ban / moderation policy
- jemnější RBAC pro team quizy
- audit log všech oprávněných akcí

