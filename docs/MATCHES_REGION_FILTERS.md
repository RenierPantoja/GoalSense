# Matches Region Filters

Region classification for the `/app/matches` filters (Brasil / Europa / etc.).
Implemented in `src/features/matches/matchRegionClassifier.ts`.

A match can belong to multiple regions (the result is a set). A region is added
from any of: the match country (`area.name`), the competition name, or the club
names. No mocks, no invented data, no API calls — pure classification over the
data the providers already return.

## Why token matching (not substring)

Earlier versions matched club keywords as substrings (`name.includes('sport')`).
That produced false positives: any club containing the letters `sport` —
**Sporting** JAX, **Sportivo** Italiano, **Sporting** CP/Kansas City/Cristal,
**Sports** Academy — was wrongly classified as Brazil because of Sport (Recife).

V2 matches by **tokens**:

- The name is normalized (lowercase, no accents, punctuation → spaces) and split
  into tokens.
- A **single-word** alias must equal a whole token (`'sport'` matches the token
  `sport`, but NOT `sporting` or `sportivo`).
- A **multi-word** alias must appear as a contiguous token sequence
  (`'sport recife'` matches `... sport recife ...`).

Helper: `matchesClubAlias(name, alias)`.

## Ambiguous club names

Some single words are not unique enough to identify a Brazilian club on their own:

| Token | Risk | Handling |
|-------|------|----------|
| `sport` | Sport Boys (PE), Sportivo, Sporting | **weak** — needs Brazilian context; `sporting/sportivo/sports` never count |
| `vitoria` | Vitória Guimarães / Setúbal (PT) | **weak** — needs Brazilian context |
| `america` | Club América (MX), América de Cali (CO) | not a single alias; only via `america mineiro` / `america mg` |
| `atletico` | Atlético Madrid (ES), Atlético Nacional (CO) | not a single alias; only via `atletico mineiro` / `atletico mg` / `atletico goianiense` |
| `nacional`, `racing`, `independiente` | foreign clubs | **not** treated as Brazilian at all |

### Strong vs weak evidence

`classifyBrazilClub(name)` returns `'strong' | 'weak' | null`:

- **strong** — a safe single-word club (e.g. `corinthians`, `fortaleza`,
  `botafogo`) or a strong multi-word alias (e.g. `sao paulo`, `atletico mineiro`,
  `sport recife`, `red bull bragantino`).
- **weak** — only an ambiguous token (`sport`, `vitoria`).
- **null** — no Brazilian signal.

A match is classified **Brazil** only when there is **strong evidence**:
`country = Brazil`, a Brazilian competition, or at least one strong Brazilian
club. Weak evidence rides along only when strong evidence already exists.

Examples:

- `Sport x Fortaleza` → `Fortaleza` is strong ⇒ **Brazil** (Sport added "por contexto").
- `ABC x Vitória` → `ABC` is strong ⇒ **Brazil** (Vitória added "por contexto").
- `Sporting JAX x San Antonio FC` → no `sport` token, no context ⇒ **not Brazil**.
- `Sportivo Italiano x San Martín` → no `sport` token, no context ⇒ **not Brazil**.
- `Sport Boys x ...` (PE) → `sport` is weak, no Brazilian context ⇒ **not Brazil**.

### Safe Sport Recife aliases (strong)

`sport recife`, `sport club recife`, `sport club do recife`,
`sport clube do recife`, `sport c recife`, `sc recife`. A bare `Sport` from a
provider is only Brazil when the match has other strong Brazilian evidence.

## Known false positives (now blocked)

`sporting`, `sportivo`, `sports`, `sporting jax`, `sporting kansas city`,
`sporting cp`, `sporting cristal`, `sportivo italiano`, `sports academy`.

These are blocked primarily by token matching; `SPORT_LIKE_BLOCK_TOKENS` is a
defensive second layer (and emits a `console.debug` in DEV when it skips a
sport-like name).

## Europe

The same token approach applies. Generic single words are intentionally NOT used
as standalone aliases: `real` (Real Madrid/Sociedad/Betis are multi-word),
`city` / `united` (Manchester City/United are multi-word), `sporting`
(`sporting cp` / `sporting lisbon` are multi-word). This keeps Europe accurate
without absurd false positives.

## Debug (DEV / advanced mode)

In DEV the classifier emits `console.debug('[GoalSense][Region] ...')` for:
- ambiguous sport-like names that are ignored;
- weak Brazil evidence that lacked context and was not classified as Brazil.

Region `reasons` are human-readable, e.g. `Clube brasileiro: Corinthians`,
`Clube brasileiro por contexto: Sport`, `Competição brasileira: Brasileirão`.

## Scope

This logic only affects `/app/matches` region filters. It does not touch
`/app/live`, Match Detail, Command Center, PWA/notifications, or create any
matches.
