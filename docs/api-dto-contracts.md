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
- u host gameplay commandů v MVP se retry safety řeší hlavně reducer guardy nad lifecycle/question phase, ne povinným durable idempotency key
- identity-sensitive payloady mají být room-scoped
- bootstrap payloady mají být krátkodobé a omezeně znovu použitelné
- raw Clerk token nebo session cookie se nepředává do SpacetimeDB; host bootstrap má být app-issued proof pro runtime boundary
- reconnect credential pro guest player má být opaque secret uložený serverově jen jako hash a rotovaný při úspěšném rebindu
- runtime state payloady mají být úsporné kvůli realtime ergonomii
- runtime state payloady se mají skládat explicitně po rolích; interní runtime rows se nesmí serializovat klientům `as-is`

## 5. Doporučené typy kontraktů

### Server authoring request/response DTO

- použití: authoring CRUD a publish workflow
- odpovědnost: persistentní authoring data, ownership check, vrácení validovaných authoring dat

### Server bootstrap DTO

- použití: create room a host claim bootstrap
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

Pole odpovědi: `room_id`, `room_code`, `source_quiz_id`, efektivní room policy přehled pro UI, `host_claim_token`, `host_claim_expires_at`.
Doporučení pro MVP: `create_room` vrací initial host claim bootstrap rovnou, aby host nemusel dělat další round-trip před prvním bindem. Pozdější host reconnect si ale vyžádá nový short-lived claim přes samostatný Next.js endpoint.

Rozhodnutí pro MVP mimo auth detaily:
- standardní `create_room` bootstrap je jen pro `published` quiz
- runtime room z `draft` quizu se v MVP nevytváří; interní testování má používat published quiz a frozen snapshot boundary

## 7. Doporučené runtime command DTO oblasti

### Host claim / rebind DTO

- `room_id` nebo `room_code`
- `host_claim_token`
- volitelný transport/session údaj pro diagnostiku nebo idempotenci, ne důkaz identity

Logický obsah `host_claim_token`: `purpose=host_claim`, `room_id`, `clerk_user_id`, `clerk_session_id`, `jti`, `iat`, `exp`, `v`. Token je podepsaný app-specific bootstrap key, je jednorázový a pro MVP má TTL 60 sekund.

### Player join DTO

- `room_code`
- `display_name`
- volitelně `client_join_request_id` pro retry-safe UX

Odpověď join flow: `room_id`, `room_player_id`, `resume_token`, `resume_expires_at`. V MVP se player join validuje přímo v reduceru, bez Next.js join bootstrapu.

### Player reconnect DTO

- `room_id`
- `room_player_id` nebo ekvivalentní room-scoped identifikátor
- `resume_token`

`resume_token` je opaque room-scoped secret s vysokou entropií. Runtime drží jen jeho hash a `resume_version`; po každém úspěšném reconnectu vrací nový `resume_token` a starý okamžitě invaliduje.

### Answer submission DTO

- `room_id`
- `question_index`
- `selected_option_ids[]`
- volitelně `client_request_id` pro idempotenci
  Validační pravidla v reduceru: actor patří do roomky, room je v `in_progress`, question phase je `question_open`, selected IDs patří do snapshotu aktivní otázky, payload neobsahuje duplicate option IDs a po deadlinu se command odmítá.

## 8. Doporučené runtime state DTO oblasti

### Shared room core DTO

- `room_id`, `room_code`, `lifecycle_state`
- `question_index`, `question_phase`, deadline metadata
- veřejné policy/feature flags pro aktuální roomku
- pouze metadata aktivní fáze a aktivní otázky, ne opakované posílání celého frozen snapshotu roomky

### Player room state DTO

- shared room core DTO
- prompt a display options pro aktuální otázku
- player-specific submission status a self-scoped outcome metadata
- leaderboard až po serverově finalizovaném kole nebo ve `finished`
- bez jiných hráčů, bez reconnect binding údajů, bez correctness flags před `reveal`
- žádný per-player roster; player view má zůstat self-scoped i při realtime updates

### Host room state DTO

- shared room core DTO
- počty joined/connected players
- agregované stavy kola (např. kolik hráčů už submitnulo)
- host-only ovládací metadata a povolené přechody
- per-player přehled až ve chvíli, kdy to odpovídá fázi a není tím porušen reveal boundary
- během `question_open` preferovat agregované progress metriky před širokým live feedem všech player rows

Rozhodnutí pro MVP:
- host a player používají oddělené DTO kontrakty nad společným core, ne jednu monolitickou DTO s volitelnými poli
- host DTO je úzký operační superset player view, ne raw dump všech interních runtime rows
- pokud SpacetimeDB subscription nemůže bezpečně nebo úsporně vracet požadovaná data přímo, použije se public view/projekce nebo server/client assembly vrstva nad užšími subscribed rows
- correctness flags, `resume_token_hash`, interní identity bindingy a podobné interní property se do klientských DTO vůbec nedostávají

Pravidla pro minimalizaci realtime payloadu v MVP:
- subscription hranice mají sledovat access pattern: shared room core, active-question slice, self slice, host aggregates, leaderboard slice
- phase transition má být hlavní okamžik pro změnu payload shape; neemitovat široké room payloady při každé player akci
- leaderboard a roster feed se mají aktivovat jen tehdy, když je UI skutečně zobrazuje
- pokud stejná data nepotřebují oba role-specific pohledy, neposílat je do obou DTO jen kvůli symetrii kontraktu

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
- player join přímo přes SpacetimeDB reducer
- `create_room` vrací initial host claim bootstrap
- krátkodobý jednorázový host bootstrap a rotate-on-use player resume mechanismus
- bez širokého veřejného API pro třetí strany

## 11. Co může počkat na později

- verzované veřejné API kontrakty
- externí admin API
- webhooky a audit event feed
- jemnější rozlišení host/admin view DTO
- delta-stream optimalizace nad rámec základního realtime modelu

## 12. MVP pravidlo pro host gameplay command idempotenci

- `start_game`, `close_question`, `reveal`, `show_leaderboard`, `next_question` a `finish_game` v MVP nepotřebují durable dedupe storage ani povinný idempotency key pro correctness.
- Retry safety zajišťují reducer guardy a validní phase/lifecycle transition pravidla; opakovaný command nad už aplikovaným přechodem musí skončit jako safe no-op nebo stale-transition rejection, nikdy ne dvojím provedením efektu.
- Volitelný `client_request_id` je přípustný jen pro diagnostiku, korelaci logů nebo UX telemetry; durable dedupe nad rámec těchto guardů je odložené až po MVP.
