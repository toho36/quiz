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
- oddělené testovací Clerk a runtime credentials
- žádné produkční secrets

### Preview
- každá změna má mít izolované preview nasazení web vrstvy
- preview nemá používat produkční authoring ani produkční runtime secrets
- pokud preview sdílí runtime infrastrukturu, musí být jasně oddělené jmenné prostory nebo projekty

### Production
- samostatné produkční credentials
- přísnější ochrana secrets
- konzistentní mapping na produkční Clerk a runtime instanci

## 4. Rozdělení env proměnných

### Public env proměnné
Smí nést jen data bezpečná pro browser:
- veřejné URL
- veřejné Clerk publishable klíče
- veřejné identifikátory prostředí, pokud samy o sobě neumožní privilegovaný přístup

### Server-only env proměnné
Musí zůstat jen na serveru:
- Clerk secret key
- server credentials pro authoring backend operace
- případné privileged credentials pro bootstrap nebo admin operace vůči runtime vrstvě
- jakékoliv signing secrets pro claim nebo resume mechanizmy

Doporučení:
- nic citlivého neexportovat do `NEXT_PUBLIC_*`
- browser bundle brát jako veřejný prostor bez důvěry

## 5. Boundary podle systému

### Browser
- zná jen public konfiguraci
- připojuje se jen přes schválené veřejné kontrakty

### Next.js server vrstva
- pracuje se server-only secrets
- dělá auth, ownership a bootstrap akce
- nesmí neřízeně propouštět privileged tokeny do klienta

### SpacetimeDB runtime
- je oddělená runtime autorita
- přístupové údaje musí být navržené podle toho, co je bezpečné pro klientský connect a co je jen pro server bootstrap

## 6. Provozní checklist před implementací

### Auth a identita
- rozhodnout oddělené Clerk projekty / konfigurace pro local, preview a production
- potvrdit, které hodnoty jsou public a které secret
- potvrdit, jak se budou vydávat host claim a player resume podklady

### Runtime infrastruktura
- potvrdit, zda preview poběží proti samostatné runtime instanci
- potvrdit naming a izolaci room/projekt namespace
- potvrdit, jak se bude řešit expiry a cleanup roomek

### Web vrstva
- potvrdit, které route handlery nebo server actions budou pracovat se server secrets
- potvrdit, že žádný privileged token nevstoupí do klientských komponent
- potvrdit environment-specific callback a base URL konfiguraci

### Observability
- rozhodnout minimální logování chyb pro server bootstrap a runtime join flow
- potvrdit, že logy nebudou obsahovat raw secrets ani raw reconnect proofy
- určit minimální telemetry scope pro MVP

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
- jednoduché, ale oddělené secrets pro host bootstrap a player reconnect
- základní logování bootstrap a runtime chyb bez citlivých dat

## 9. Co může počkat na později

- detailní CI/CD policy
- automatizovaná secret rotation
- auditní integrace a bezpečnostní alerting
- více regionů a sofistikovanější failover
- pokročilý cost monitoring nad rámec základních limitů

## 10. Otevřené otázky

- Není zatím finálně rozhodnuto, jak přesně budou oddělené preview a production runtime instance.
- Není zatím ověřeno, jaké klientské connect credential schéma je pro SpacetimeDB vhodné bez oslabení bezpečnosti.
- Není zatím uzavřeno, jak moc bude potřeba centralizovaný cleanup/expiry job mimo základní runtime lifecycle.
- Není zatím finálně rozhodnuto, jaký minimální observability stack je pro MVP nezbytný.

## 11. Doporučená vazba na ostatní dokumenty

- systémové boundary a rizika: `docs/system-boundaries-risk-register.md`
- auth flow: `docs/auth-identity-flow.md`
- permission matrix: `docs/permission-matrix.md`
- API/DTO kontrakty: `docs/api-dto-contracts.md`

Tento dokument je určen jako návrhový checklist před implementací a před finálním nastavením Vercel/Clerk/runtime prostředí.

