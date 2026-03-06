# Quiz App – runtime datový model

## 1. Na co dokument navazuje

Tento dokument navazuje na authoring/runtime boundary, permission matrix, state machine a scoring pravidla.

## 2. Základní princip

Runtime gameplay nesmí číst živě authoring data. Běžící roomka musí pracovat s frozen snapshotem vytvořeným při `start_game`.

## 3. Doporučené runtime entity

### `room`
Účel:
- identita roomky
- lifecycle stav
- vazba na zdrojový quiz a host binding
- aktivní question pointer a efektivní room policy

Doporučená data:
- `room_id`
- `room_code`
- `source_quiz_id`
- `lifecycle_state`
- `current_question_index`
- `host_binding`
- `created_at`, `started_at`, `ended_at`, `expires_at`
- efektivní scoring/join policy pro roomku

### `room_player`
Účel:
- room-scoped identita hráče
- reconnect binding
- agregované průběžné score

Doporučená data:
- `room_player_id`
- `room_id`
- `display_name`
- `status`
- `resume_token_hash` nebo ekvivalentní binding údaj
- `joined_at`, `last_seen_at`
- `score_total`
- `correct_count`
- `join_order`

Poznámka pro MVP:
- `room_player` je interní autoritativní entita, ne veřejný subscription payload
- veřejný leaderboard a roster se mají skládat z úzké public projekce/view bez reconnect binding údajů

### `room_question_snapshot`
Účel:
- immutable snapshot jedné otázky pro danou roomku

Doporučená data:
- `room_id`
- `question_index`
- `source_question_id`
- `prompt`
- `question_type`
- `evaluation_policy`
- `base_points`
- `effective_time_limit_seconds`
- `shuffle_answers`

### `room_question_option_snapshot`
Účel:
- immutable snapshot options otázky

Doporučená data:
- `room_id`
- `question_index`
- `source_option_id`
- `author_position`
- `display_position` (persistovaný explicitní index po serverovém shuffle)
- `text`
- `is_correct`

### `room_question_state`
Účel:
- runtime stav konkrétní otázky v roomce

Doporučená data:
- `room_id`
- `question_index`
- `phase`
- `opened_at`
- `deadline_at`
- `closed_at`
- `revealed_at`
- `leaderboard_shown_at`

### `answer_submission`
Účel:
- jedna accepted submission na hráče a otázku

Doporučená data:
- `room_id`
- `question_index`
- `room_player_id`
- `accepted_at`
- `is_correct`
- `awarded_points`
- `submission_status`

### `answer_selection`
Účel:
- selected option rows pro submission

Doporučená data:
- `room_id`
- `question_index`
- `room_player_id`
- `source_option_id`

## 4. Klíčové vztahy a pravidla

- jedna roomka má mnoho `room_player`
- jedna roomka má snapshot všech otázek použitých v běhu hry
- jeden hráč má maximálně jednu accepted submission na jednu otázku
- multiple-choice se vyhodnocuje nad množinou selected option IDs
- leaderboard pro MVP může být odvozen z agregátů v interním `room_player`, ale tento row typ se klientům neposílá přímo
- ordered collections se v MVP reprezentují explicitními integer pozicemi na jednotlivých rows, ne implicitním pořadím v blobu nebo odděleným mappingem pořadí

## 5. Doporučené agregace a leaderboard policy pro MVP

Držet přímo v `room_player`:
- `score_total`
- `correct_count`
- `join_order`

Rozhodnutí pro MVP:
- samostatná historická entita `leaderboard_snapshot` se nezavádí
- leaderboard se publikuje až po serverovém uzavření kola (`question_closed -> reveal -> leaderboard`), ne při každém player submitu
- pokud UI potřebuje samostatný leaderboard feed, použije se úzká public projekce/view odvozená z již finalizovaných agregátů, ne per-round historie

Tím se zjednoduší leaderboard render a sníží potřeba drahých realtime přepočtů i zbytečného egressu.

## 6. Ordered collections v MVP

Finální rozhodnutí:
- pořadí otázek v runtime snapshotu drží `question_index`
- pořadí options v authoringu drží `author_position`
- pořadí options po shuffle drží přímo `display_position` na každém `room_question_option_snapshot` row
- correctness se vždy vyhodnocuje podle stabilního `source_option_id`, nikdy podle indexu nebo aktuální vizuální pozice
- samostatná order-mapping entita není pro MVP potřeba

Důvod:
- explicitní integer pozice jsou snadno validovatelné i Bun/TypeScript modely
- shuffle se provede jednou při snapshotování a reconnect jen znovu čte stejná data
- přístup lépe sedí na SpacetimeDB subscription model, kde je výhodné držet užší rows podle access patternu

## 7. Subscription strategie pro MVP

Rozhodnutí pro MVP:
- realtime odběr musí být vždy room-scoped a rozdělený podle access patternu, ne postavený na jedné široké room DTO tabulce
- protože SpacetimeDB subscriptions replikují celé rows jedné subscribed table, veřejné payloady mají vycházet z úzkých public tables/views nebo z obdobně úzkých projekcí
- player klient má dostávat jen public room summary, aktivní question public slice, vlastní self/submission slice a leaderboard slice jen v `leaderboard | finished`
- host klient má dostávat stejný shared core plus host-only kontrolní metadata a agregované progress informace o participantech
- `answer_selection`, correctness flags před `reveal`, reconnect binding údaje a plný frozen snapshot se klientům nesubscribují přímo
- leaderboard a roster updaty se mají emitovat po fázových přechodech, ne při každém kliknutí hráče

Tato strategie minimalizuje payload, drží least-privilege boundary a snižuje free-tier egress.

## 8. Snapshot boundary

Do runtime snapshotu patří jen data nutná pro běh hry:
- prompt a typ otázky
- scoring a time limit údaje
- correctness flags
- author/display order options

Do runtime snapshotu nepatří editor metadata ani obecná authoring historie.

## 9. Public/private boundary pro runtime rows

Rozhodnutí pro MVP:
- interní autoritativní rows (`room_player`, `answer_submission`, `answer_selection`) mohou obsahovat neveřejná data a zůstávají private
- player a host UI se napojují na role-specific public projekce nebo DTO assembly vrstvu, ne na raw interní rows
- host je pro MVP privilegovaný jen na řízení roomky a agregovaný přehled; ani host DTO nemá být implicitní dump všech interních runtime polí

## 10. Doporučený přístup

- runtime entity držet úsporné a purpose-built
- oddělit immutable snapshot data od mutable gameplay state
- correctness a awarded points zapisovat až po serverovém uzavření otázky
- submissions identifikovat podle room/player/question, ne podle client session

## 11. Co je vhodné pro MVP

- bez samostatné entity pro historické leaderboard snapshoty
- bez audit trail tabulek
- bez komplikovaného verzování runtime schématu
- bez partial credit rozpadů do více scoring řádků
- explicitní `question_index`, `author_position`, `display_position`
- úzké role-specific public projekce místo jednoho širokého public room payloadu
- bez persistování finálních výsledků mimo runtime vrstvu
- `finished` a `aborted` room zůstává read-only do `expires_at`; poté reconnect vrací `room expired`

## 12. Co může počkat na později

- `room_host_session` jako samostatná entita
- `leaderboard_snapshot` historie po každém kole
- detailní analytics eventy
- moderation a kick/ban evidence
- explicitní replay/recap datová vrstva

## 13. Uzavřené MVP rozhodnutí

- finální výsledky se v MVP neukládají mimo runtime vrstvu
- room lifecycle po skončení zůstává čistě runtime-scoped: `finished` a `aborted` room je čitelný jen do `expires_at`, potom je považovaný za expirovaný

