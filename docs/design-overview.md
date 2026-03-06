# Quiz App – design overview

## 1. Účel dokumentu

Tento dokument je rozcestník nad návrhovou dokumentací Quiz App. Nezavádí novou architekturu; shrnuje, co je už dohodnuté, co je zdokumentované a co ještě zůstává otevřené.

## 2. Aktuálně zdokumentované oblasti

- `docs/architecture-analysis.md`
  - původní architektonická analýza, hlavní rizika, server/client boundary
- `docs/authoring-runtime-boundary.md`
  - authoring datový model a freeze boundary do runtime
- `docs/permission-matrix.md`
  - role, oprávnění a rozdělení kontrol mezi Clerk / Next.js / SpacetimeDB
- `docs/auth-identity-flow.md`
  - host/player identita, join, reconnect a claim flow
- `docs/runtime-state-machine.md`
  - room lifecycle, question phases a přechody
- `docs/runtime-data-model.md`
  - runtime entity, snapshoty, submissions a leaderboard data
- `docs/scoring-gameplay-rules.md`
  - scoring modes, evaluation policy, shuffle, fairness a leaderboard pravidla
- `docs/system-boundaries-risk-register.md`
  - high-level boundary mezi klientem, Next.js server vrstvou a realtime vrstvou
  - hlavní bezpečnostní rizika, edge casy a stav uzavření hlavních otázek
- `docs/api-dto-contracts.md`
  - API boundary mezi Next.js server vrstvou a SpacetimeDB runtime vrstvou
  - DTO payloady, command/state kontrakty a validační pravidla
- `docs/deployment-env-checklist.md`
  - uzavřený MVP policy pro prostředí, secrets, runtime connect credential boundary a minimum observability
- `docs/authoring-policy.md`
  - publish workflow, validační policy a authoring lifecycle

## 3. Jádro dohodnuté architektury

- **Next.js 14 App Router** = webová a serverová boundary
- **Clerk** = auth autora a host bootstrap
- **SpacetimeDB** = realtime roomky a serverově autoritativní gameplay stav
- **Tailwind CSS** = UI vrstva
- **Vercel** = hosting Next.js aplikace

## 4. High-level systémové boundary

- **Browser / client UI**
  - renderuje UI a odesílá uživatelské záměry
  - nesmí být autoritou pro correctness, scoring, deadlines ani role binding
- **Next.js server vrstva**
  - řeší auth, ownership, authoring mutace a bootstrap runtime akcí
- **SpacetimeDB runtime vrstva**
  - je autorita pro room state, role binding, submissions, scoring a state transitions
- **Vercel boundary**
  - hostuje Next.js aplikaci, ale nemá suplovat persistentní realtime autoritu roomky

## 5. Klíčová návrhová rozhodnutí

- klient nesmí být autoritou pro correctness, scoring, timer ani state transitions
- aktivní roomka musí běžet nad frozen runtime snapshotem
- authoring a runtime se mají striktně oddělit
- preview a production musí mít oddělené runtime prostředí, Clerk konfiguraci a credentials
- `option_id` musí být stabilní a correctness se vyhodnocuje podle ID, ne pozice
- shuffle pořadí odpovědí se má dělat serverově jednou na room-question
- multiple-choice v MVP má používat `exact_match`
- leaderboard se má měnit až na základě serverově uzavřeného kola
- late join během aktivní hry je pro MVP doporučeno zakázat

## 6. Dokumentační mapa podle témat

### Architektura a hranice

- `docs/architecture-analysis.md`
- `docs/design-overview.md`

### Authoring vrstva

- `docs/authoring-runtime-boundary.md`
- `docs/authoring-policy.md`

### Auth a oprávnění

- `docs/permission-matrix.md`
- `docs/auth-identity-flow.md`

### API boundary a kontrakty

- `docs/api-dto-contracts.md`

### Runtime gameplay

- `docs/runtime-state-machine.md`
- `docs/runtime-data-model.md`
- `docs/scoring-gameplay-rules.md`

### Cross-cutting boundary a rizika

- `docs/system-boundaries-risk-register.md`

### Provoz a deployment

- `docs/deployment-env-checklist.md`

## 7. Co je považováno za uzavřený směr pro MVP

- server-authoritative runtime
- jeden host na roomku
- guest players bez povinného Clerk účtu
- `single_choice` a `multiple_choice`
- scoring modes `speed_weighted` a `correctness_only`
- `exact_match` pro multiple-choice
- snapshot quizu při `start_game`
- bez co-host a spectator role v MVP
- browser nedostává privileged runtime credentials; jen room-scoped proof/token materiál pro vlastní session
- minimum observability pro MVP = strukturované logy bootstrap, join/reconnect a lifecycle chyb bez citlivých dat

## 8. Co ještě není definitivně uzavřené

- pro MVP už v aktuální dokumentaci nezůstává žádná blokující otevřená architektonická otázka
- případné budoucí změny se mají otevírat přímo v tematickém dokumentu, ne vracením obecného backlogu do `todo.md`

## 9. Doporučené čtení před implementací

1. `docs/design-overview.md`
2. `docs/architecture-analysis.md`
3. `docs/authoring-runtime-boundary.md`
4. `docs/permission-matrix.md`
5. `docs/auth-identity-flow.md`
6. `docs/runtime-state-machine.md`
7. `docs/runtime-data-model.md`
8. `docs/scoring-gameplay-rules.md`
9. `docs/system-boundaries-risk-register.md`
10. `docs/api-dto-contracts.md`
11. `docs/authoring-policy.md`
12. `docs/deployment-env-checklist.md`

## 10. Poznámka k nejistotám

Pokud je někde uvedeno, že něco není finálně rozhodnuto nebo ověřeno, má to být bráno jako otevřená návrhová otázka, ne jako hotový fakt.
