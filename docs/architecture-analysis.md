# Quiz App – analýza architektury a doporučení

## 1. Aktuální stav repozitáře

- Workspace `quiz` je aktuálně prázdný.
- Ve složce nejsou žádné zdrojové soubory, konfigurace ani existující Next.js projekt.
- Z toho důvodu nyní není možné opravovat konkrétní chyby v implementaci, build procesu ani typechecku.

## 2. Cíl projektu

Navržený stack dává smysl pro realtime quiz aplikaci:

- **Frontend:** Next.js 14 (App Router)
- **Auth:** Clerk
- **Realtime / DB:** SpacetimeDB
- **Styly:** Tailwind CSS
- **Hosting:** Vercel

Silné stránky návrhu:

- dobré oddělení landing/auth/dashboard/create/play flow,
- vhodné použití realtime databáze pro lobby, hráče a leaderboard,
- App Router je vhodný pro kombinaci SSR, client komponent a auth vrstvy.

## 3. Hlavní problémy v návrhu

### 3.1 Bezpečnost – token databáze v klientovi

Ukázka v zadání používá:

- `NEXT_PUBLIC_SPACETIME_DB_URL`
- `SPACETIME_DB_TOKEN`

Současně ale vytváří klienta v souboru určeném pro import do klientských komponent.

To je problém:

- vše, co běží v browseru, nesmí dostat privátní token,
- pokud by byl `SPACETIME_DB_TOKEN` použit v klientské části aplikace, hrozí únik tajného klíče.

### Doporučení

- veřejný klient používat jen s bezpečnými public credentials, pokud je SpacetimeDB podporuje,
- citlivé operace (create quiz, ownership checks, admin/host akce) vést přes serverovou vrstvu,
- server-side operace řešit přes **Route Handlers** nebo **Server Actions**.

---

### 3.2 Duplicitní model otázek

V návrhu existuje zároveň:

- `quiz.questions` jako JSON string,
- samostatná tabulka `question`.

To vytváří dva zdroje pravdy a vede ke komplikacím:

- riziko nesouladu mezi JSON a tabulkou,
- složitější editace, verzování a validace,
- složitější realtime flow při načítání quizu.

### Doporučení

Vybrat **jeden** model:

1. **Preferovaná varianta:** samostatná tabulka `question`.
   - `quiz` obsahuje metadata,
   - otázky jsou normalizované v `question`.

2. JSON pole v `quiz.questions` používat pouze tehdy, pokud chceš extrémně jednoduché MVP bez samostatné správy otázek.

Pro škálovatelnější řešení je lepší **tabulka `question`**.

---

### 3.3 Auth a ownership nejsou dotažené

Ukázka používá placeholder `owner_id: 'user_id_z_clerk'`.

Chybí definice:

- jak se získá uživatel v App Routeru,
- jak se ochrání `/dashboard`, `/create` a host akce,
- jak se ověřuje, že quiz patří přihlášenému uživateli.

### Doporučení

- chráněné stránky postavit na Clerk middleware + server auth kontrole,
- perzistentní zápisy dělat na serveru,
- `owner_id` vždy plnit z ověřené session, ne z klientského inputu.

---

### 3.4 Room code potřebuje kolizní a lifecycle logiku

Generátor `ABCD-1234` je v pořádku jako UX formát, ale musí řešit:

- kolize kódů,
- expiraci neaktivních místností,
- reconnect hráče,
- chování při opuštění hosta.

### Doporučení

- při tvorbě room opakovaně generovat kód do chvíle, než je unikátní,
- přidat `created_at`, případně `ended_at` / `expires_at`,
- definovat stav při reconnectu a při odpojení hosta.

---

### 3.5 Chybí validační vrstva

V návrhu nejsou popsané validace pro:

- title/description,
- délku textu otázek,
- počet možností,
- rozsah `correct_index`,
- rozsah `time_limit`,
- join přes `room_code` a `player_name`.

### Doporučení

- přidat centrální validační schémata pro formuláře a payloady,
- stejné business limity vynucovat na klientu i serveru.

---

### 3.6 Nejasná hranice mezi persistentní a realtime částí

Rozdělení `Quiz` a `GameSession` je správné, ale je potřeba jasně určit:

- co je dlouhodobě uložené,
- co je transientní session data,
- co se uloží po skončení hry.

### Doporučení

- persistentní: `quiz`, `question`, případně `game_result`,
- realtime/transientní: `room`, `player`, `answer`,
- po skončení hry volitelně uložit agregované výsledky pro historii.

## 4. Doporučená cílová architektura

### Persistentní data

- `quiz`
- `question`
- volitelně `game_result` / `quiz_play_history`

### Realtime data

- `room`
- `player`
- `answer`

### Aplikační vrstvy

- **Server:** auth, ownership checks, create/update quiz, start room
- **Client:** lobby UI, timer, realtime subscriptions, leaderboard render
- **Shared types:** DTO, quiz/question typy, room status enumy

## 5. Doporučená struktura projektu

Navržená struktura je dobrý základ. Doplnil bych:

- `app/api/...` nebo server actions pro citlivé operace,
- `lib/validators/...` pro validační schémata,
- `lib/auth/...` pro helpery kolem Clerk,
- `types/...` pro sdílené doménové typy,
- `docs/...` pro architekturu a provozní dokumentaci.

## 6. Doporučené pořadí implementace

1. Inicializace Next.js + Tailwind + TypeScript
2. Integrace Clerk a ochrana rout
3. Návrh SpacetimeDB schématu bez duplicity otázek
4. Serverová vrstva pro create/edit quiz
5. Dashboard a create flow
6. Room creation a join flow
7. Realtime gameplay
8. Leaderboard + history výsledků
9. Testy a deploy na Vercel

## 7. Co je potřeba upravit ještě před implementací

Nejdůležitější změny oproti původnímu návrhu:

- **nepoužívat privátní DB token v klientu**,
- **zrušit duplicitu `quiz.questions` vs `question`**,
- **serverově vynucovat ownership a auth**,
- **doplnit validace a lifecycle logiku roomky**.

## 8. Závěr

Návrh je funkčně dobrý jako MVP koncept, ale před implementací je potřeba upravit hlavně:

1. bezpečnost databázového přístupu,
2. datový model otázek,
3. auth/authorization hranici,
4. validační a lifecycle pravidla.

Aktuálně nebyly provedeny opravy aplikačního kódu, protože v repozitáři zatím žádný kód není.
Navazující detailnější návrhy jsou postupně rozpracované v samostatných dokumentech v `docs/`, aby se architektura upřesnila ještě před implementací.
