# Quiz App – architecture closure summary

## Status

- tento soubor už neslouží jako otevřený MVP architektonický backlog
- uzavřená rozhodnutí jsou zapsaná v tematických dokumentech v `docs/`
- další práce má být implementační a validační, ne návrat k obecnému seznamu otevřených návrhových otázek

## Uzavřený souhrn podle oblastí

### 1. Auth a runtime identita

- uzavřeno v `docs/auth-identity-flow.md`, `docs/api-dto-contracts.md` a `docs/permission-matrix.md`
- host claim v MVP = Next.js-issued, room-scoped, signed, single-use proof s TTL 60 sekund; raw Clerk token se do runtime vrstvy nepředává
- player join v MVP jde přímo přes SpacetimeDB reducer
- player resume token = opaque room-scoped secret, uložený serverově jen jako hash, s explicitní expirací a rotací při každém úspěšném reconnectu

### 2. Runtime lifecycle a perzistence

- uzavřeno v `docs/runtime-state-machine.md` a `docs/runtime-data-model.md`
- room po `finished` nebo `aborted` zůstává 30 minut read-only do `expires_at`, potom přechází do `expired`
- finální výsledky se v MVP neukládají persistentně mimo runtime vrstvu; zůstávají dostupné jen do `expires_at`

### 3. Scoring a leaderboard detaily

- uzavřeno v `docs/scoring-gameplay-rules.md`
- `speed_weighted` používá lineární serverově měřenou škálu 100 % -> 50 % `base_points`
- tie-break pořadí = `score_total` DESC, `correct_count` DESC, `join_order` ASC
- po poslední otázce vždy proběhne samostatná finální `leaderboard` fáze před `finished`

### 4. Datový model a realtime ergonomie

- uzavřeno v `docs/runtime-data-model.md` a `docs/api-dto-contracts.md`
- ordered collections v runtime používají explicitní `question_index`, `author_position` a `display_position` na jednotlivých rows
- samostatná historická `leaderboard_snapshot` entita se v MVP nezavádí; leaderboard feed vychází z finalizovaných agregátů
- subscription strategie je room-scoped, role-specific a postavená na úzkých public projekcích/views kvůli payloadu a egressu

### 5. Authoring policy a validační limity

- uzavřeno v `docs/authoring-policy.md` a `docs/authoring-runtime-boundary.md`
- `quiz_revision` se pro MVP nezavádí; vrátí se až při potřebě rollbacku nebo publish history
- publish vyžaduje 1 až 50 otázek na quiz a maximálně 6 options na otázku
- runtime room z `draft` quizu se v MVP nevytváří; interní testování má použít published quiz a frozen snapshot boundary

### 6. Deployment a prostředí

- uzavřeno v `docs/deployment-env-checklist.md`, s high-level vazbou v `docs/design-overview.md` a `docs/system-boundaries-risk-register.md`
- preview a production jsou pro MVP striktně oddělené na úrovni Clerk konfigurace, runtime projektu/instance i credentials; preview nikdy nepoužívá production runtime
- browser dostává jen veřejný runtime endpoint a room-scoped proof/token materiál pro konkrétní session; privileged runtime credentials a signing secrets zůstávají server-only
- minimum observability pro MVP = searchable strukturované logy bootstrap, join/reconnect, lifecycle přechodů a fatálních chyb bez citlivých dat

## Poznámka k dalším krokům

- implementace má vycházet z `docs/design-overview.md` jako rozcestníku a z tematických dokumentů podle oblasti
- pokud se některé uzavřené rozhodnutí později ukáže jako nevhodné, má se znovu otevřít přímo v příslušném dokumentu místo obnovování obecného `todo.md` backlogu
