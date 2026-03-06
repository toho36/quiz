# Quiz App – TODO

## Skutečně neuzavřené body

### 1. Auth a runtime identita

- přesný formát host claim bootstrapu mezi Clerk / Next.js / SpacetimeDB
- přesný tvar player resume / reconnect tokenu včetně expirace a rotace
- konflikt dvou současných reconnectů stejné identity
- rozhodnutí, zda player join v MVP půjde přímo přes reducer, nebo přes Next.js bootstrap

### 2. Runtime lifecycle a perzistence

- room TTL / expiry policy
- chování roomky po dokončení hry a při pozdním reconnectu
- zda a kam ukládat finální výsledky persistentně mimo runtime vrstvu

### 3. Scoring a leaderboard detaily

- finální formule `speed_weighted`
- potvrzení stabilního tie-break pravidla
- zda bude finální leaderboard samostatná runtime fáze i po poslední otázce

### 4. Datový model a realtime ergonomie

- finální reprezentace ordered collections v runtime vrstvě
- případná potřeba samostatných leaderboard snapshotů
- subscription strategie kvůli free-tier limitům a egressu
- míra odlišnosti host state DTO oproti player state DTO

### 5. Authoring policy a validační limity

- zda je dlouhodobě potřeba `quiz_revision` entita
- přesné limity pro max počet otázek a max počet options
- zda `multiple_choice` musí mít vždy alespoň dvě správné options
- zda bude možné vytvořit room i z draft quizu pro interní testování

### 6. Deployment a prostředí

- přesná izolace preview a production runtime prostředí
- vhodné credential schéma pro klientský connect do runtime vrstvy bez oslabení bezpečnosti
- minimální observability stack potřebný pro MVP

## Nově doplněná dokumentace

- `docs/api-dto-contracts.md`
- `docs/deployment-env-checklist.md`
- `docs/authoring-policy.md`

## Doporučené další návrhové kroky

1. uzavřít host claim a player resume kontrakty
2. potvrdit finální `speed_weighted` a leaderboard policy
3. rozhodnout ordered collections a realtime subscription strategii
4. potvrdit preview/production runtime izolaci a minimální observability

## Poznámka

Aktuální dokumentace už pokrývá hlavní návrhové oblasti před implementací. Tento `todo.md` teď obsahuje už jen skutečně otevřené otázky a doporučené další uzavírací kroky.
