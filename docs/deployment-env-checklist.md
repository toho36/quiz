# Quiz App – deployment a environment checklist

## 1. Účel dokumentu

Tento dokument shrnuje návrhové podklady pro prostředí, secrets, deployment boundary a provozní checklist před implementací.

Neřeší konkrétní CI/CD skripty ani produkční konfiguraci; cílem je ujasnit, co musí být oddělené a co nesmí skončit v klientu.

## 2. Co je už rozhodnuté

- Next.js aplikace poběží na Vercelu
- Clerk je autorita pro author identitu
- SpacetimeDB je autorita pro realtime runtime stav
- Vercel Functions nemají suplovat persistentní realtime room autoritu
- browser nesmí dostat server secrets
- authoring a runtime mají mít oddělené boundary i na úrovni prostředí a credentials

## 3. Doporučené prostředí

### Local development
- lokální vývoj UI a server vrstvy
- oddělené non-production Clerk a runtime credentials
- žádné produkční secrets
- pokud local sdílí runtime infrastrukturu s preview, musí mít odlišný namespace/prefix roomek a nesmí používat credentials určené pro preview automation

### Preview
- každá změna má mít izolované preview nasazení web vrstvy
- preview používá samostatný non-production Clerk projekt/konfiguraci a samostatný non-production runtime projekt/instanci oddělenou od production
- preview nemá používat produkční authoring ani produkční runtime secrets
- preview roomky jsou disposable a musí být oddělené namespace/prefixem od local testování; preview nikdy nesmí zapisovat nebo bindovat session do production runtime prostředí

### Production
- samostatné produkční credentials
- přísnější ochrana secrets
- konzistentní mapping na produkční Clerk a dedikovanou produkční runtime instanci
- pouze production deploymenty smějí číst production runtime credentials a bootstrap signing secrets

## 4. Rozdělení env proměnných

### Aktuálně vynucený kontrakt v repozitáři

Aktuální implementace v `lib/env/public.ts`, `lib/env/server.ts` a `lib/env/shared.ts` má po Wave 1 tento explicitní kontrakt:

| Proměnná | Scope | Stav v aktuálním buildu | Požadavek |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` | public | **povinná** | musí být jedna z hodnot `local`, `preview`, `production` |
| `NEXT_PUBLIC_APP_URL` | public | **povinná** | musí být absolutní URL aktuálního deploymentu |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | public | volitelná | publishable key pro browser-only Clerk klienta |
| `NEXT_PUBLIC_SPACETIME_ENDPOINT` | public | volitelná | pokud je nastavená, musí být absolutní URL veřejného connect endpointu |
| `CLERK_SECRET_KEY` | server-only | volitelná v této vlně | server secret pro backend/SSR operace, nikdy ne do browseru |
| `SPACETIME_ADMIN_TOKEN` | server-only | volitelná v této vlně | privileged runtime/bootstrap credential, nikdy ne do browseru |
| `RUNTIME_BOOTSTRAP_SIGNING_KEY` | server-only | volitelná v této vlně | signing secret pro server-issued bootstrap/claim materiál |

- `bun run build` failne hned, pokud chybí `NEXT_PUBLIC_APP_ENV` nebo `NEXT_PUBLIC_APP_URL`.
- Ověřený safe local build command je: `NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_APP_URL=http://localhost:3000 bun run build`.
- `.env.example` je pouze template; reálné preview/production hodnoty patří do environment managementu platformy (např. Vercel), ne do committovaných `.env*` souborů s tajemstvími.

### Public env proměnné
Smí nést jen data bezpečná pro browser:
- veřejné URL
- veřejné Clerk publishable klíče
- veřejné runtime endpoint URL, pokud jde jen o connect target bez privilegovaného oprávnění
- veřejné identifikátory prostředí, pokud samy o sobě neumožní privilegovaný přístup

### Server-only env proměnné
Musí zůstat jen na serveru:
- Clerk secret key
- server credentials pro authoring backend operace
- privileged runtime credentials pro bootstrap nebo admin operace vůči runtime vrstvě
- jakékoliv signing secrets pro claim nebo resume mechanizmy

### Credential policy pro runtime connect
- browser pro MVP nesmí dostat žádný dlouhodobý privileged runtime credential ani bootstrap signing key
- host client smí dostat jen krátkodobý room-scoped host claim proof vydaný Next.js serverem podle `docs/auth-identity-flow.md`
- player client v MVP joinuje přímo přes reducer a pro reconnect drží jen aktuální room-scoped opaque `resume_token`; nejde o environment credential a nesmí být logovaný ani sdílený mimo konkrétní roomku
- pokud transport vrstva vyžaduje veřejný connect credential, musí být least-privilege, environment-scoped a použitelný jen pro běžný client connect; vše privileged zůstává server-only

Doporučení:
- nic citlivého neexportovat do `NEXT_PUBLIC_*`
- browser bundle brát jako veřejný prostor bez důvěry

### Minimální nastavení podle deployment prostředí

#### Local development
- `NEXT_PUBLIC_APP_ENV=local`
- `NEXT_PUBLIC_APP_URL` nastav na lokální absolutní URL webu (typicky `http://localhost:3000`)
- používej jen non-production Clerk/runtime hodnoty; pokud jsou potřeba secrets, patří do lokálního server-only env souboru nebo shellu, ne do sdíleného template

#### Preview
- `NEXT_PUBLIC_APP_ENV=preview`
- `NEXT_PUBLIC_APP_URL` musí odpovídat skutečné preview deployment URL
- preview používá vlastní non-production publishable key, server secrets a runtime credentials oddělené od production

#### Production
- `NEXT_PUBLIC_APP_ENV=production`
- `NEXT_PUBLIC_APP_URL` musí být kanonická produkční URL aplikace
- production deployment smí číst jen production server secrets a production runtime credentials

## 5. Boundary podle systému

### Browser
- zná jen public konfiguraci
- připojuje se jen přes schválené veřejné kontrakty
- pracuje jen s room-scoped proof/token materiálem určeným pro vlastní session, ne s privileged runtime credentialem

### Next.js server vrstva
- pracuje se server-only secrets
- dělá auth, ownership a bootstrap akce
- nesmí neřízeně propouštět privileged tokeny do klienta
- drží environment-scoped runtime admin/bootstrap credentials a signing keys

### SpacetimeDB runtime
- je oddělená runtime autorita
- validuje room-scoped host claim proofy a player resume tokeny podle auth kontraktů
- transportní connect credential sama o sobě není důkaz host/player role a nesmí obcházet reducer bind pravidla

## 6. Provozní checklist před implementací

### Auth a identita
- local, preview a production používají oddělené Clerk konfigurace; preview a production jsou pro MVP striktně oddělené
- public vs secret boundary je uzavřená: pouze veřejné URL/publishable klíče a případný veřejný runtime endpoint mohou do browseru
- host claim a player resume podklady jsou uzavřené v `docs/auth-identity-flow.md`; deployment policy jen potvrzuje, že signing secret a privileged bootstrap credentials zůstávají server-only

### Runtime infrastruktura
- production běží proti dedikovanému production runtime projektu/instanci s vlastní sadou credentials
- všechny preview deploymenty běží proti oddělenému non-production runtime projektu/instanci; nesdílí production data ani credentials
- cleanup/expiry pro MVP řeší runtime lifecycle politika v `docs/runtime-state-machine.md`; samostatný cron/cleanup job není pro MVP povinný

### Web vrstva
- route handlery a server actions, které dělají create room / host bootstrap / authoring ownership check, smějí pracovat se server-only runtime credentials
- žádný privileged runtime token nesmí vstoupit do klientských komponent ani veřejných API payloadů
- `NEXT_PUBLIC_APP_ENV` a `NEXT_PUBLIC_APP_URL` jsou povinné pro local, preview i production build; každé prostředí musí mít vlastní hodnoty odpovídající reálnému deploymentu

### Observability
- minimum pro MVP = strukturované logy pro `create_room`, host claim issuance/validation failure, player join/reconnect, `start_game`, `close_question`, `finish_game`, `abort_game` a fatální chyby web/runtime vrstvy
- každý log/event má nést alespoň `environment`, `room_id`, request/deployment identifikátor a podle potřeby `clerk_user_id` nebo `room_player_id`, ale nikdy raw secret, raw claim proof ani raw `resume_token`
- pro MVP stačí searchable logs a základní error triage nad Vercel/server a runtime vrstvou; alerting, distributed tracing a pokročilá analytika mohou počkat

## 7. Bezpečnostní pravidla

- produkční a preview secrets se nesmí míchat
- secrets se nesmí logovat do browser console ani veřejných response payloadů
- resume a claim proofy mají být krátkodobé nebo rotovatelné
- privileged server akce mají být vázané na auth a ownership kontroly
- room runtime autoritu nelze přesouvat do klienta jen kvůli jednoduššímu deploymentu

## 8. Co je vhodné pro MVP

- jasné oddělení local / preview / production
- minimum public env proměnných
- všechny authoring mutace přes server vrstvu
- preview a production na oddělených Clerk/runtime projektech a credentials
- jednoduché, ale oddělené secrets pro host bootstrap a player reconnect
- základní strukturované logování bootstrap, join/reconnect a runtime lifecycle chyb bez citlivých dat

## 9. Co může počkat na později

- detailní CI/CD policy
- automatizovaná secret rotation
- auditní integrace a bezpečnostní alerting
- více regionů a sofistikovanější failover
- pokročilý cost monitoring nad rámec základních limitů

## 10. Uzavřená MVP rozhodnutí

- preview a production jsou pro MVP striktně oddělené na úrovni Clerk konfigurace, runtime projektu/instance i credentials; preview nikdy nesmí používat production runtime
- browser runtime connect používá jen veřejný endpoint a room-scoped proof/token materiál potřebný pro konkrétní session; privileged runtime credentials a signing secrets zůstávají server-only
- minimum observability pro MVP = searchable strukturované logy přes web/server a runtime vrstvu pro bootstrap, join/reconnect, lifecycle přechody a fatální chyby, vždy bez citlivých dat
- samostatný centralizovaný cleanup job není pro MVP blokující; autoritativní je runtime expiry policy popsaná v `docs/runtime-state-machine.md`

## 11. Doporučená vazba na ostatní dokumenty

- systémové boundary a rizika: `docs/system-boundaries-risk-register.md`
- auth flow: `docs/auth-identity-flow.md`
- permission matrix: `docs/permission-matrix.md`
- API/DTO kontrakty: `docs/api-dto-contracts.md`

Tento dokument je určen jako návrhový checklist před implementací a před finálním nastavením Vercel/Clerk/runtime prostředí.

