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
- `display_position` nebo equivalent order mapping
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
- leaderboard pro MVP může být odvozen z agregátů v `room_player`

## 5. Doporučené agregace pro MVP

Držet přímo v `room_player`:
- `score_total`
- `correct_count`
- `join_order`

Tím se zjednoduší leaderboard render a sníží potřeba drahých realtime přepočtů.

## 6. Snapshot boundary

Do runtime snapshotu patří jen data nutná pro běh hry:
- prompt a typ otázky
- scoring a time limit údaje
- correctness flags
- author/display order options

Do runtime snapshotu nepatří editor metadata ani obecná authoring historie.

## 7. Doporučený přístup

- runtime entity držet úsporné a purpose-built
- oddělit immutable snapshot data od mutable gameplay state
- correctness a awarded points zapisovat až po serverovém uzavření otázky
- submissions identifikovat podle room/player/question, ne podle client session

## 8. Co je vhodné pro MVP

- bez samostatné entity pro historické leaderboard snapshoty
- bez audit trail tabulek
- bez komplikovaného verzování runtime schématu
- bez partial credit rozpadů do více scoring řádků

## 9. Co může počkat na později

- `room_host_session` jako samostatná entita
- `leaderboard_snapshot` historie po každém kole
- detailní analytics eventy
- moderation a kick/ban evidence
- explicitní replay/recap datová vrstva

## 10. Otevřené otázky

- Není zatím finálně rozhodnuto, zda držet `display_position` přímo na option snapshotu, nebo odděleně jako order mapping.
- Není zatím finálně ověřeno, jak ergonomicky bude SpacetimeDB podporovat zvolenou ordered reprezentaci.
- Není zatím uzavřeno, zda se část výsledků po skončení hry bude ukládat i mimo runtime vrstvu.

