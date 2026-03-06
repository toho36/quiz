# Quiz App – authoring policy

## 1. Účel dokumentu

Tento dokument doplňuje `docs/authoring-runtime-boundary.md` o explicitní authoring lifecycle, publish policy a validační pravidla.

Cíl je oddělit:
- co je už rozhodnuté,
- co je doporučený přístup,
- co je vhodné pro MVP,
- co může počkat,
- co zůstává otevřená otázka.

## 2. Co je už rozhodnuté

- authoring data spravuje Next.js server vrstva
- authoring akce jsou chráněné přes Clerk a ownership check
- aktivní roomka nesmí číst živě authoring data
- frozen snapshot se doporučuje vytvářet při `start_game`
- základní authoring entity jsou `quiz`, `question`, `question_option`
- `single_choice` a `multiple_choice` jsou podporované typy otázek
- multiple-choice má pro MVP používat `exact_match`

## 3. Doporučený authoring lifecycle

### `draft`
- quiz lze vytvářet a volně upravovat
- není určen pro veřejné použití v běžných roomkách
- validační chyby mohou blokovat publish, ne nutně průběžné ukládání draftu

### `published`
- quiz je považován za použitelný pro create room flow
- další editace jsou možné, ale ovlivňují jen budoucí hry
- běžící roomky zůstávají navázané na svůj snapshot

### `archived`
- quiz není určen pro nové roomky
- historická vazba na již odehrané roomky může zůstat zachovaná
- obnova z archivu může být později podporovaná, ale není nutná pro MVP

## 4. Doporučená publish policy

- publish má být explicitní akce, ne vedlejší efekt běžného autosave
- server při publish zkontroluje minimální konzistenci quizu
- create room flow má pro MVP pracovat jen s `published` quizem
- `draft` quiz se v MVP do runtime roomky nespouští

Rozhodnutí pro MVP:
- interní testování má používat published quiz a běžnou roomku vytvořenou z frozen snapshotu
- protože published quiz lze dál upravovat a změny se projeví jen do budoucích room snapshotů, samostatný draft-room flow není pro MVP nutný

## 5. Validační pravidla

### Quiz
- `title` nesmí být prázdný
- scoring mode musí být z podporované množiny
- default time limit musí být v centrálně povoleném rozsahu
- quiz musí mít při publish 1 až 50 otázek

### Question
- `prompt` nesmí být prázdný
- `position` musí být unikátní v rámci quizu
- `question_type` musí být podporovaný typ
- `base_points` musí být v rozumném kladném rozsahu
- `time_limit_seconds`, pokud je zadaný, musí respektovat centrální limity

### Question options
- každá option musí mít neprázdný text
- `position` musí být unikátní v rámci otázky
- každá otázka může mít maximálně 6 options
- `single_choice` musí mít 2 až 6 options a právě jednu správnou option
- `multiple_choice` musí mít 3 až 6 options, alespoň dvě správné options a alespoň jednu nesprávnou option

Důvod pro `multiple_choice` policy:
- zachovává sémantický rozdíl proti `single_choice`
- drží `exact_match` scoring přehledný pro hráče i implementaci
- omezuje payload i mobilní UI složitost při room snapshotu

## 6. Editační pravidla po publish

Doporučený přístup:
- published quiz lze dál upravovat
- změny se projeví jen do budoucích room snapshotů
- běžící roomka nesmí být dotčena úpravou textu, correctness, options ani scoring policy

Méně vhodná varianta:
- published quiz po publish zcela zamknout

Důvod, proč zamknutí není preferované:
- snižuje ergonomii authoringu
- není nutné, pokud runtime správně používá frozen snapshot

## 7. Přístup k revision modelu

### Doporučený přístup pro MVP
- nezačínat se samostatnou entitou `quiz_revision`
- držet jednoduchý model `quiz` + `question` + `question_option`
- změny po publish nechat působit jen na další roomky

Explicitní rozhodnutí pro MVP:
- `quiz_revision` entita se nezavádí
- publish/re-publish má být jen změna stavu a validační checkpoint, ne tvorba nové persistentní revizní vrstvy
- pokud později vznikne potřeba rollbacku konkrétní publikované verze nebo auditovatelné publish historie, přidá se `quiz_revision` až tehdy

### Co by revision model řešil později
- auditovatelný publish history
- rollback konkrétní publikované verze
- přesná vazba roomky na publikovanou revizi místo obecného source quiz ID

## 8. Vazba na runtime snapshot boundary

- při `start_game` se vezme autoritativní authoring stav použitý pro vytvoření snapshotu
- po tomto bodu se runtime chová nezávisle na dalších authoring změnách
- policy pro publish a editaci se proto nesmí opírat o živé přepisování běžící roomky

## 9. Co je vhodné pro MVP

- `draft | published | archived`
- create room jen z `published`
- bez samostatné `quiz_revision`
- bez komplexního moderation workflow
- explicitní limit 50 otázek na quiz a 6 options na otázku
- `multiple_choice` s minimálně dvěma správnými options
- bez authoring collaboration mezi více editory současně

## 10. Co může počkat na později

- `quiz_revision`
- publish notes a changelog
- rollback konkrétní verze
- spolupráce více editorů
- audit trail authoring změn
- jemnější workflow než jen `draft | published | archived`

## 11. Uzavřená MVP rozhodnutí

- `quiz_revision` se odkládá až na chvíli, kdy bude potřeba rollback nebo publish history
- `multiple_choice` vyžaduje alespoň dvě správné options
- publish vyžaduje explicitní limity 1–50 otázek a max. 6 options na otázku
- room z `draft` quizu se v MVP nevytváří

## 12. Vazba na ostatní dokumenty

- authoring/runtime boundary: `docs/authoring-runtime-boundary.md`
- permission matrix: `docs/permission-matrix.md`
- scoring pravidla: `docs/scoring-gameplay-rules.md`
- API/DTO kontrakty: `docs/api-dto-contracts.md`

Tento dokument zpřesňuje authoring policy, ale nemění základní rozhodnutí o striktním oddělení authoring a runtime vrstvy.

