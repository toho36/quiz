# Quiz App – system boundaries, rizika a otevřené otázky

## 1. Na co dokument navazuje

Tento dokument navazuje na detailní návrhy v `docs/` a shrnuje cross-cutting témata, která se týkají celé architektury:

- high-level boundary mezi klientem, Next.js server vrstvou a SpacetimeDB runtime vrstvou,
- hlavní bezpečnostní rizika,
- provozní a gameplay edge casy,
- dosud neuzavřené otázky.

## 2. High-level systémové boundary

### Browser / client UI
- renderuje UI, lokální formulářový stav a vizuální timer
- nesmí obsahovat privátní tokeny ani být autoritou pro correctness, scoring a deadlines
- odesílá záměry uživatele, ne finální pravdu o stavu hry

### Next.js 14 App Router server vrstva
- řeší auth a ownership nad authoring částí
- provádí create/update/publish quiz akce
- bootstrapuje room creation a host claim flow
- může vydávat krátkodobé podklady pro host/player bind flow

### SpacetimeDB runtime vrstva
- je finální autorita pro room state, role binding, submissions a scoring
- drží realtime gameplay stav a reducer validace
- rozhoduje o deadline, accepted submission a state transitions

### Platform boundary
- Clerk je autorita pro author identity
- Vercel hostuje Next.js aplikaci
- preview a production používají oddělené Clerk/runtime projekty a oddělené credentials
- realtime room authority nemá být stavěná na Vercel Functions jako náhradě za persistentní realtime server

## 3. Hlavní bezpečnostní a návrhová rizika

### Riziko 1: únik privátních tokenů do klienta
- problém: klientský bundle nesmí nést server secret
- dopad: kompromitace backend přístupu
- doporučení: citlivé operace vést jen přes server vrstvu a držet secrets mimo browser

### Riziko 2: client-authoritative gameplay
- problém: klient by mohl rozhodovat correctness, score nebo deadline
- dopad: cheating, nekonzistentní leaderboard, neférovost
- doporučení: correctness, scoring i state transitions držet pouze v reduceru

### Riziko 3: spoofing role a identity
- problém: host/player role nesmí vznikat jen z client flagu nebo display name
- dopad: převzetí roomky, cizí submissions, spoof reconnectu
- doporučení: explicitní room-scoped binding a serverově ověřovaný claim/reconnect mechanismus

### Riziko 4: promíchání authoring a runtime dat
- problém: běžící roomka by četla živě upravený quiz
- dopad: změna correctness nebo textu během hry
- doporučení: frozen snapshot při `start_game`

### Riziko 5: vyhodnocování podle indexu po shuffle
- problém: pozice odpovědi se po shuffle mění
- dopad: špatná correctness logika
- doporučení: submission i evaluation stavět na stabilním `option_id`

### Riziko 6: reconnect hijack nebo duplikace identity
- problém: reconnect může vytvořit druhého hosta nebo druhého hráče
- dopad: nekonzistence stavu a spor o autoritu
- doporučení: rebind existující identity, ne vytvoření nové identity se stejným jménem

### Riziko 7: přehnaně chatty realtime provoz
- problém: zbytečně časté payloady zvyšují náklady a zatěžují free-tier limity
- dopad: vyšší egress, složitější škálování, horší UX při reconnectu
- doporučení: posílat jen relevantní změny stavu a leaderboard finalizovat po uzavření kola

## 4. Hlavní edge casy

- kolize room code při založení roomky
- `start_game` bez validního snapshotu nebo bez validního host bindu
- dva hráči se stejným `display_name`
- submit přesně na hraně deadline
- host manual close a system auto-close ve stejný okamžik
- reconnect během přechodu `question_open -> question_closed`
- odpojení hosta uprostřed běžící hry
- no-answer do timeoutu
- pozdní join do aktivní hry
- přechod `finished -> expired` během pozdního reconnectu

## 5. Stav uzavření hlavních otázek

### Auth a identity (uzavřeno pro MVP)
- host claim bootstrap = Next.js-issued, room-scoped, signed, single-use proof s `jti` a TTL 60 sekund; raw Clerk token se do runtime vrstvy nepředává
- player resume token = opaque room-scoped secret, uložený serverově jen jako hash, s explicitní expirací a rotací při každém úspěšném reconnectu
- konflikt dvou současných reconnectů = první úspěšný commit vyhrává, další použití stejného proofu se odmítá jako stale/replay a stará session ztrácí autoritu

### Gameplay a scoring
- `speed_weighted` používá pro MVP lineární serverově měřenou škálu 100 % -> 50 % `base_points` pro správné timed odpovědi.
- `reveal` a `leaderboard` zůstávají v MVP oddělené fáze; po poslední otázce proběhne ještě finální leaderboard před `finished`.
- partial credit pro `multiple_choice` nepatří do MVP.

### Data a provoz
- ordered collections v runtime vrstvě jsou pro MVP uzavřené přes explicitní `question_index`, `author_position` a `display_position` na jednotlivých rows.
- finální výsledky se v MVP neukládají persistentně mimo runtime vrstvu; po `finished` nebo `aborted` zůstávají dostupné jen do `expires_at`.
- subscription strategie je pro MVP room-scoped, role-specific a postavená na úzkých public projekcích/views kvůli payloadu a egress limitům.
- `quiz_revision` entita se pro MVP nezavádí; může se vrátit až s rollback/publish history požadavky.

### Deployment a observability (uzavřeno pro MVP)
- preview a production jsou striktně oddělené na úrovni Clerk konfigurace, runtime projektu/instance i credentials.
- browser dostává jen veřejný runtime endpoint a room-scoped proof/token materiál pro konkrétní session; privileged runtime credentials a signing secrets zůstávají server-only.
- minimum observability pro MVP = searchable strukturované logy bootstrap, join/reconnect, lifecycle přechodů a fatálních chyb bez raw secrets nebo raw reconnect proofů.

## 6. Co je vhodné pro MVP

- server-authoritative runtime
- jeden host na roomku
- guest players bez povinného účtu
- `single_choice` a `multiple_choice`
- `exact_match` pro multiple-choice
- `speed_weighted` a `correctness_only`
- jedna accepted submission na hráče a otázku
- late join během aktivní hry zakázaný
- bez co-host, spectator a partial credit
- oddělený non-production runtime pro preview a dedikovaný production runtime
- minimální strukturované logování bootstrap, join/reconnect a lifecycle chyb bez raw secrets nebo raw reconnect proofů

## 7. Co může počkat na později

- co-host / moderator role
- spectator mód
- partial credit
- audit log a moderation workflow
- account-linked players
- analytics a replay/recap vrstva
- detailní persistentní history model

## 8. Jak dokument používat

- pro základ architektury viz `docs/architecture-analysis.md`
- pro authoring/runtime boundary viz `docs/authoring-runtime-boundary.md`
- pro role a oprávnění viz `docs/permission-matrix.md`
- pro auth flow viz `docs/auth-identity-flow.md`
- pro runtime gameplay viz `docs/runtime-state-machine.md`, `docs/runtime-data-model.md` a `docs/scoring-gameplay-rules.md`

Tento dokument není náhrada těchto detailních návrhů; slouží jako centrální risk a boundary souhrn.

