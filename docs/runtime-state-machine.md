# Quiz App – runtime state machine

## 1. Na co dokument navazuje

Tento návrh navazuje na permission matrix, auth flow a server-authoritative gameplay model.

## 2. Doporučený model stavů

Doporučený je dvouvrstvý model:

- **room lifecycle**
- **question phase**

Tím se oddělí celkový stav roomky od stavu právě hrané otázky.

## 3. Room lifecycle

### `lobby`
- room existuje
- hráči se mohou připojovat
- hra ještě nezačala

### `in_progress`
- hra běží
- aktivní otázky se řídí question phases

### `finished`
- poslední otázka už doběhla
- finální `leaderboard` fáze už proběhla
- room zůstává read-only do `expires_at` a zobrazuje finální leaderboard

### `aborted`
- hra byla ukončena hostem nebo systémově přerušena
- room zůstává read-only do `expires_at`, ale nepovoluje další gameplay akce

### `expired`
- room už není aktivní kvůli TTL / lifecycle policy
- reconnect po `expires_at` se odmítá jako `room_expired`

## 4. Question phase během `in_progress`

### `question_open`
- přijímají se submissions
- deadline běží serverově

### `question_closed`
- submissions už se nepřijímají
- correctness a scoring se finalizují serverově

### `reveal`
- zobrazí se správná odpověď a výsledek kola

### `leaderboard`
- zobrazí se průběžné nebo finální pořadí po kole

## 5. Doporučené přechody

### Room lifecycle přechody
- `lobby -> in_progress` při `start_game`
- `in_progress -> finished` po doběhu samostatné finální `leaderboard` fáze poslední otázky
- `lobby | in_progress -> aborted` při host abortu nebo závažném systémovém ukončení
- `lobby | finished | aborted -> expired` podle expiry policy

### Question phase přechody
- `question_open -> question_closed`
  - host ručně nebo systém po deadline
- `question_closed -> reveal`
  - po serverovém vyhodnocení kola
- `reveal -> leaderboard`
  - po zobrazení výsledku otázky
- `leaderboard -> question_open`
  - pokud existuje další otázka
- `leaderboard -> finished`
  - pokud další otázka neexistuje

### Expiry policy pro MVP
- při `create_room` nastavit `expires_at = created_at + 24h`
- při `start_game` nastavit `expires_at = started_at + 2h` jako fail-safe deadline pro běžící roomku
- pokud roomka tohoto limitu dosáhne bez normálního dohrání, systém provede `in_progress -> aborted` a hned poté přepíše `expires_at = ended_at + 30m`
- při `finish_game` nebo `abort_game` přepsat `expires_at = ended_at + 30m`
- cleanup může proběhnout asynchronně, ale po `expires_at` už reducer nesmí přijmout reconnect ani další gameplay akce

## 6. Kdo smí přechody spouštět

- `start_game`: `host`
- `close_question`: `host` nebo `system`
- `reveal`: `host` nebo `system`
- `show_leaderboard`: `host` nebo `system`
- `next_question`: `host` nebo `system`
- `finish_game`: `system` nebo `host` přes validní přechod

Finální validace musí být vždy v reduceru.

## 7. Guard pravidla

- player může submitovat jen v `question_open`
- po `question_closed` už submission nesmí být přijata
- host nesmí přeskočit required fázi
- `start_game` nesmí proběhnout bez validního snapshotu otázek
- `next_question` nesmí otevřít neexistující otázku
- reconnect nesmí měnit room state

## 8. Reconnect chování

### Player reconnect
- v `lobby`: vrátí se do waiting state
- v `question_open`: vrátí se do aktuální otázky se serverovým deadlinem
- v `question_closed | reveal | leaderboard`: vrátí se do právě aktivní fáze bez možnosti dodatečné změny submission
- v `finished`: do `expires_at` dostane read-only finální leaderboard a svůj finální výsledek
- v `aborted`: do `expires_at` dostane read-only informaci, že hra byla ukončena
- v `expired`: reconnect se odmítne

### Host reconnect
- má obnovit kontrolu nad roomkou jen přes validní rebind
- reconnect nesmí vytvořit druhého hosta
- v `finished` může do `expires_at` zobrazit finální výsledky, ale nesmí znovu otevřít tutéž roomku pro nový běh

## 9. MVP persistence policy

- finální výsledky se v MVP neukládají persistentně mimo runtime vrstvu
- po `finished` nebo `aborted` zůstávají dostupné jen z runtime dat roomky do `expires_at`
- pokud se později doplní history výsledků, má se zapisovat přes serverovou boundary, ne přímo z klienta

## 10. Edge casy

- submit přesně na hraně deadline
- host klikne na close otázky současně s auto-close
- reconnect v okamžiku přechodu `question_open -> question_closed`
- host se odpojí uprostřed hry
- room expire během neaktivní nebo rozbité session

## 11. Doporučený přístup

- client timer brát jen jako UI indikaci
- server time a reducer rozhodují o deadline a přijetí submission
- každá akce se validuje vůči room lifecycle i question phase
- auto-close a host manual close musí končit ve stejném autoritativním stavu

## 12. Co je vhodné pro MVP

- `lobby`, `in_progress`, `finished`, `aborted`, `expired`
- `question_open`, `question_closed`, `reveal`, `leaderboard`
- late join do `in_progress` zakázaný
- samostatná finální `leaderboard` fáze i po poslední otázce
- read-only reconnect po `finished` nebo `aborted` jen do `expires_at`
- žádná persistentní history výsledků mimo runtime vrstvu
- žádné větvení flow podle typu otázky
- jednoduché ruční řízení hostem + serverový deadline enforcement

## 13. Co může počkat na později

- pause/resume hry
- warmup / countdown phase
- spectator-only states
- host transfer mezi více moderátory
- jemnější recovery stavy po výpadku infrastruktury
- persistentní result history a replay recap

## 14. Uzavřená MVP rozhodnutí

- `reveal` a `leaderboard` zůstávají v MVP oddělené fáze.
- auto-close trigger musí končit stejným reducer přechodem jako host manual close; zdroj triggeru nesmí měnit výsledný stav.
- room zůstává po `finished` nebo `aborted` 30 minut v read-only režimu a pak přechází do `expired`.

