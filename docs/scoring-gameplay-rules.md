# Quiz App – scoring a gameplay pravidla

## 1. Na co dokument navazuje

Tento dokument navazuje na runtime state machine, runtime data model a authoring/runtime boundary.

## 2. Typy otázek

### `single_choice`
- hráč vybírá právě jednu option
- correctness je odvozena podle jedné správné `option_id`

### `multiple_choice`
- hráč vybírá více options
- correctness se vyhodnocuje nad množinou selected `option_id`

## 3. Evaluation policy

### Doporučení pro MVP: `exact_match`
- odpověď je správně jen tehdy, když selected set přesně odpovídá setu správných options
- partial credit v MVP nedoporučeno

Důvod:
- jednodušší reducer logika
- méně sporů o férovost
- méně edge case kombinací

## 4. Scoring modes

### `speed_weighted`
- správná odpověď dává body podle correctness a rychlosti
- rychlost se měří jen serverově podle acceptance time vůči deadline/open time

### `correctness_only`
- body závisí jen na correctness
- rychlost neovlivňuje score

## 5. Time policy

- otázka může mít `time_limit_seconds`
- deadline je server-authoritative
- client timer je jen UI indikace
- submit po deadline se odmítá

## 6. Submission pravidla

- submission musí používat stabilní `option_id`, ne index odpovědi
- na jednu otázku má být pro MVP jen jedna accepted submission na hráče
- po accepted submission se answer change v MVP nedoporučuje
- bez odpovědi do deadline se kolo hodnotí jako no-answer / zero points

## 7. Shuffle pravidla

- author order a display order se musí oddělit
- shuffle se má dělat serverově jednou pro každou room-question
- stejné display pořadí se má použít pro všechny hráče ve stejné roomce
- reconnect nesmí měnit display order téže otázky
- correctness se vždy posuzuje podle `option_id`, ne podle display position

## 8. Leaderboard pravidla

Doporučené pořadí:
1. `score_total`
2. `correct_count`
3. stabilní tie-break, například `join_order`

Doporučení:
- leaderboard nepřepočítávat klientem jako zdroj pravdy
- pořadí po kole finalizovat až po `question_closed`
- průběžné live rank změny během `question_open` v MVP raději neukazovat

## 9. Férovost a bezpečnost

- latency nesmí rozhodovat o přijetí po deadlinu; rozhoduje server time
- klient nesmí počítat correctness ani awarded points
- client-side shuffle je nedostatečný pro férovost i reconnect konzistenci
- index-based correctness je po shuffle nebezpečný

## 10. Doporučený přístup

- `single_choice` i `multiple_choice` opřít o stejný submission model založený na `option_id`
- scoring mode řešit jako runtime policy roomky nebo otázky
- correctness a score zapisovat až po autoritativním vyhodnocení serverem
- scoreboard updates dávkovat po uzavření kola, ne po každém kliknutí hráče

## 11. Co je vhodné pro MVP

- `single_choice` + `multiple_choice`
- `exact_match` pro multiple-choice
- `speed_weighted` a `correctness_only`
- bez partial credit
- bez live leaderboard turbulence během otevřené otázky
- no-answer = zero points

## 12. Co může počkat na později

- partial credit
- streak bonusy
- difficulty multipliers
- adaptive scoring podle počtu hráčů
- penalizace za špatnou odpověď
- individualizovaný shuffle per player

## 13. Otevřené otázky

- Není zatím finálně uzavřeno, zda `speed_weighted` bude mít lineární nebo pásmový výpočet bodů.
- Není zatím finálně rozhodnuto, zda se u `multiple_choice` připustí v budoucnu partial credit.
- Není zatím uzavřeno, zda leaderboard po poslední otázce bude samostatná fáze, nebo součást finálního reveal.

