# Quiz App – API a DTO kontrakty

## 1. Účel dokumentu

Tento dokument popisuje boundary mezi Next.js server vrstvou a SpacetimeDB runtime vrstvou.
Cíl:

- ujasnit, které akce patří do server authoring části a které do realtime runtime části
- určit minimální odpovědnost DTO payloadů
- sepsat validační a bezpečnostní pravidla pro jednotlivé typy akcí
  Nenahrazuje detailní auth, runtime a scoring dokumenty; navazuje na ně.

## 2. Co je už rozhodnuté

- authoring mutace patří do Next.js server vrstvy
- Clerk řeší author identitu a host bootstrap
- SpacetimeDB runtime je finální autorita pro room state, role binding, submissions, scoring a state transitions
- klient posílá záměr, ne autoritativní pravdu o hře
- aktivní roomka běží nad frozen snapshotem vytvořeným při `start_game`
- correctness, deadlines a awarded points nesmí být určovány klientem

## 3. Doporučené rozdělení boundary

### Přes Next.js server vrstvu

- create/update/publish/archive quiz
- načtení authoring dashboard dat
- create room bootstrap
- host claim bootstrap
- případné vydání player join bootstrapu, pokud join nepůjde přímo přes reducer
- případné uložení finálních výsledků mimo runtime vrstvu

### Přes SpacetimeDB runtime

- host claim bind do roomky
- player join bind do roomky
- player reconnect/rebind
- start game
- open/close/reveal/leaderboard/finish přechody
- answer submission
- realtime odběr room state a aktuální phase

## 4. Základní DTO principy

- DTO mají nést jen data nutná pro konkrétní akci
- klient nikdy neposílá `is_correct`, `awarded_points`, `score_total` ani autoritativní deadline truth
- command DTO mají být idempotentní tam, kde hrozí retry nebo dvojklik
- identity-sensitive payloady mají být room-scoped
- bootstrap payloady mají být krátkodobé a omezeně znovu použitelné
- runtime state payloady mají být úsporné kvůli realtime ergonomii

## 5. Doporučené typy kontraktů

### Server authoring request/response DTO

- použití: authoring CRUD a publish workflow
- odpovědnost: persistentní authoring data, ownership check, vrácení validovaných authoring dat

### Server bootstrap DTO

- použití: create room, host claim bootstrap, případný player join bootstrap
- odpovědnost: ověřit authoring/ownership policy a předat minimální podklad pro bezpečný vstup do runtime vrstvy

### Runtime command DTO

- použití: host a player akce v roomce
- odpovědnost: reprezentovat konkrétní uživatelský záměr bez odvozené pravdy o výsledku

### Runtime state/event DTO

- použití: synchronizace klienta s room state
- odpovědnost: dodat autoritativní stav, minimalizovat payload a případně oddělit player view od host view

## 6. Doporučené server DTO oblasti

### Quiz authoring DTO

Pole podle akce: `quiz_id`, `title`, `description`, `default_scoring_mode`, `default_question_time_limit_seconds`, `shuffle_answers_default`, `status` jen u explicitního publish/archive flow.
Validační pravidla: ownership check na serveru, prázdné texty odmítat, scoring mode jen z povolené množiny, time limit jen v centrálně povoleném rozsahu.

### Question authoring DTO

Pole: `question_id`, `quiz_id`, `position`, `prompt`, `question_type`, `evaluation_policy`, `base_points`, `time_limit_seconds`, `shuffle_answers`, `options[]`.
Validační pravidla: `single_choice` právě jedna correct option, `multiple_choice` podle authoring policy, unikátní option pozice v otázce, stabilní `option_id` při editaci existujících options.

### Room bootstrap DTO

Pole odpovědi: `room_id`, `room_code`, `source_quiz_id`, efektivní room policy přehled pro UI, host claim bootstrap podklad, pokud je součástí flow.
Otevřená otázka: není zatím finálně rozhodnuto, zda `create_room` rovnou vrací host claim podklad, nebo zda půjde o samostatný krok.

## 7. Doporučené runtime command DTO oblasti

### Host claim / rebind DTO

- `room_id` nebo `room_code`
- krátkodobý server bootstrap proof
- pomocný transport/session údaj, ne důkaz identity

### Player join DTO

- `room_code`
- `display_name`
- případně join bootstrap proof

### Player reconnect DTO

- `room_id`
- `room_player_id` nebo ekvivalentní room-scoped identifikátor
- `resume_token` nebo ekvivalentní rebind proof

### Answer submission DTO

- `room_id`
- `question_index`
- `selected_option_ids[]`
- volitelně `client_request_id` pro idempotenci
  Validační pravidla v reduceru: actor patří do roomky, room je v `in_progress`, question phase je `question_open`, selected IDs patří do snapshotu aktivní otázky, payload neobsahuje duplicate option IDs a po deadlinu se command odmítá.

## 8. Doporučené runtime state DTO oblasti

### Public room state pro player view

- `room_id`, `room_code`, `lifecycle_state`
- `question_index`, `question_phase`, deadline metadata
- prompt a display options pro aktuální otázku
- player-specific submission status
- leaderboard až po serverově finalizovaném kole

### Host room state

- vše z player view plus počty joined players, agregované stavy kola a host-only ovládací metadata
  Doporučení: correctness flags a neveřejná data neodesílat před `reveal`; neposílat celý runtime snapshot opakovaně, pokud stačí aktivní výřez stavu.

## 9. Vazba na ostatní dokumenty

- auth a identity: `docs/auth-identity-flow.md`
- role a oprávnění: `docs/permission-matrix.md`
- lifecycle a přechody: `docs/runtime-state-machine.md`
- runtime entity: `docs/runtime-data-model.md`
- scoring pravidla: `docs/scoring-gameplay-rules.md`

## 10. Co je vhodné pro MVP

- authoring API jen přes Next.js server vrstvu
- runtime commandy přímo do SpacetimeDB reducerů
- jednoduché request/response DTO pro authoring
- jednoduchý host bootstrap a player resume mechanismus
- bez širokého veřejného API pro třetí strany

## 11. Co může počkat na později

- verzované veřejné API kontrakty
- externí admin API
- webhooky a audit event feed
- jemnější rozlišení host/admin view DTO
- delta-stream optimalizace nad rámec základního realtime modelu

## 12. Otevřené otázky

- Není zatím finálně rozhodnuto, zda player join v MVP půjde přímo přes reducer, nebo přes Next.js bootstrap.
- Není zatím finálně ověřen přesný formát host claim bootstrap proofu.
- Není zatím uzavřeno, jak silnou idempotenci budou potřebovat host gameplay commandy při retry a reconnectu.
- Není zatím finálně rozhodnuto, jak moc odlišný bude host state DTO od player state DTO.
