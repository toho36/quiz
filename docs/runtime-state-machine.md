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
- room může zobrazovat finální leaderboard

### `aborted`
- hra byla ukončena hostem nebo systémově přerušena

### `expired`
- room už není aktivní kvůli TTL / lifecycle policy

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
- zobrazí se průběžné pořadí po kole

## 5. Doporučené přechody

### Room lifecycle přechody
- `lobby -> in_progress` při `start_game`
- `in_progress -> finished` po posledním leaderboard kroku
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

### Host reconnect
- má obnovit kontrolu nad roomkou jen přes validní rebind
- reconnect nesmí vytvořit druhého hosta

## 9. Edge casy

- submit přesně na hraně deadline
- host klikne na close otázky současně s auto-close
- reconnect v okamžiku přechodu `question_open -> question_closed`
- host se odpojí uprostřed hry
- room expire během neaktivní nebo rozbité session

## 10. Doporučený přístup

- client timer brát jen jako UI indikaci
- server time a reducer rozhodují o deadline a přijetí submission
- každá akce se validuje vůči room lifecycle i question phase
- auto-close a host manual close musí končit ve stejném autoritativním stavu

## 11. Co je vhodné pro MVP

- `lobby`, `in_progress`, `finished`, `aborted`, `expired`
- `question_open`, `question_closed`, `reveal`, `leaderboard`
- late join do `in_progress` zakázaný
- žádné větvení flow podle typu otázky
- jednoduché ruční řízení hostem + serverový deadline enforcement

## 12. Co může počkat na později

- pause/resume hry
- warmup / countdown phase
- spectator-only states
- host transfer mezi více moderátory
- jemnější recovery stavy po výpadku infrastruktury

## 13. Otevřené otázky

- Není zatím finálně rozhodnuto, zda `reveal` a `leaderboard` budou vždy oddělené fáze, nebo někdy splývat v jednom UI kroku.
- Není zatím finálně ověřeno, jak bude v praxi řešen auto-close trigger bez zbytečně chatty synchronizace.
- Není zatím uzavřeno, jak dlouho má room zůstat v `finished` před přechodem do `expired`.

