# Quiz App – authoring datový model a runtime snapshot boundary

## 1. Na co dokument navazuje

Tento návrh navazuje na dříve popsané části architektury Quiz App:

- Next.js 14 App Router pro web a serverovou boundary,
- Clerk pro auth autora/hosta,
- SpacetimeDB pro realtime roomky a serverově autoritativní gameplay,
- oddělení authoring dat a runtime room stavu,
- single-choice a multiple-choice otázky,
- dva režimy bodování,
- stabilní `option_id` a serverový shuffle pořadí odpovědí.

## 2. Co je v této oblasti považováno za rozhodnuté

- Rozehraná roomka nesmí číst živě authoring data.
- Aktivní hra musí běžet nad frozen runtime snapshotem.
- Authoring akce patří do Next.js serverové vrstvy a mají být chráněné přes Clerk.
- Runtime gameplay logika patří do SpacetimeDB reducerů.
- Correctness, timer, scoring a state transitions mají zůstat serverově autoritativní.

## 3. Doporučený authoring model

### 3.1 `quiz`

Účel entity:

- metadata quizu,
- ownership,
- publish/draft stav,
- výchozí herní nastavení.

Doporučená data:

- `quiz_id`
- `owner_user_id`
- `title`
- `description`
- `status` (`draft | published | archived`)
- `default_scoring_mode`
- `default_question_time_limit_seconds`
- `shuffle_answers_default`
- `created_at`
- `updated_at`
- volitelně `published_at`

### 3.2 `question`

Účel entity:

- jedna otázka patřící ke konkrétnímu quizu,
- definice typu otázky a pravidel vyhodnocení,
- pořadí v quizu.

Doporučená data:

- `question_id`
- `quiz_id`
- `position`
- `prompt`
- `question_type` (`single_choice | multiple_choice`)
- `evaluation_policy` (pro MVP `exact_match`)
- `base_points`
- `time_limit_seconds` (volitelný override proti quiz defaultu)
- `shuffle_answers` (volitelný override proti quiz defaultu)
- `created_at`
- `updated_at`

### 3.3 `question_option`

Účel entity:

- text jedné možnosti odpovědi,
- correctness flag,
- autorské pořadí.

Doporučená data:

- `option_id`
- `question_id`
- `position`
- `text`
- `is_correct`

## 4. Doporučená authoring pravidla

### Quiz-level pravidla

- `title` nesmí být prázdný.
- `default_scoring_mode` musí být kompatibilní s runtime scoring mode návrhem.
- `default_question_time_limit_seconds` má mít centrálně omezený rozumný rozsah.
- published quiz musí obsahovat 1 až 50 otázek.

### Question-level pravidla

- `position` musí být unikátní v rámci quizu.
- `prompt` nesmí být prázdný.
- `single_choice` musí mít právě jednu správnou option.
- `multiple_choice` musí mít 3 až 6 options, alespoň dvě správné options a alespoň jednu nesprávnou option.
- `time_limit_seconds`, pokud je vyplněný, musí respektovat definovaný rozsah.

### Option-level pravidla

- `position` musí být unikátní v rámci otázky.
- text options nesmí být prázdný.
- `single_choice` musí mít 2 až 6 options.
- žádná otázka nesmí mít více než 6 options.

## 5. Publish a edit boundary

### Doporučený model

- `draft` quiz lze volně upravovat.
- `published` quiz lze stále editovat, ale změny nesmí rozbít již běžící roomky.
- běžící roomka musí používat snapshot vytvořený při startu hry.
- standardní runtime room bootstrap se v MVP povoluje jen pro `published` quiz.

### Důsledek

Editace po startu roomky:

- může změnit budoucí hry,
- nesmí změnit aktivní roomku.

Rozhodnutí pro MVP:
- `draft` quiz se do runtime roomky nespouští ani pro interní testování
- interní test flow má používat published quiz, protože frozen snapshot už odděluje běžící roomku od pozdějších authoring změn

## 6. Runtime snapshot boundary

### Doporučení

Snapshot vytvářet při `start_game`, ne už při `create_room`.

Finální rozhodnutí pro MVP:
- snapshotuje se celý quiz naráz při `start_game`
- pořadí otázek v runtime drží explicitní `question_index`
- pořadí options drží `author_position` a po shuffle `display_position` přímo na snapshot rows

Výhody:

- autor může quiz do startu ještě upravit,
- roomka v lobby nenese zbytečná snapshot data,
- obsah hry se freeze až v okamžiku spuštění.

## 7. Co se má kopírovat do runtime snapshotu

Pro každou otázku v roomce zkopírovat pouze data potřebná pro běh hry:

- identitu zdrojové otázky a option,
- `prompt`,
- `question_type`,
- `evaluation_policy`,
- efektivní scoring mode,
- `base_points`,
- efektivní `time_limit_seconds`,
- `shuffle_answers`,
- všechny options včetně `is_correct` a autorského pořadí.

## 8. Co se do runtime snapshotu kopírovat nemá

- authoring metadata nepotřebná pro hru,
- auditní nebo editor-specific informace,
- data, která nemají vliv na průběh otázky,
- cokoliv, co by zbytečně zvětšovalo realtime payloady.

## 9. Co po startu hry nesmí změnit běžící roomku

Po vytvoření snapshotu nesmí authoring změna ovlivnit:

- text otázky v aktivní roomce,
- text options v aktivní roomce,
- `is_correct`,
- počet options,
- time limit,
- scoring pravidla,
- shuffle policy pro již připravenou otázku.

## 10. Co je vhodné pro MVP

- `quiz`, `question`, `question_option` jako základní authoring model,
- `draft | published | archived` jako jednoduchý lifecycle quizu,
- snapshot celého quizu při `start_game`,
- `exact_match` pro multiple-choice MVP,
- bez verzování quizu jako samostatné entity,
- bez historie authoring změn.

## 11. Co může počkat na později

- samostatné `quiz_revision`,
- rollback a diff authoring změn,
- pokročilý publish workflow,
- analytics per question,
- soft delete a audit trails,
- pokročilé validační a moderation workflow.

## 12. Uzavřená MVP rozhodnutí

- snapshotuje se celý published quiz při `start_game`
- ordered collections používají explicitní pozice na jednotlivých rows
- samostatná `quiz_revision` entita se pro MVP nezavádí
- runtime room z `draft` quizu se v MVP nevytváří