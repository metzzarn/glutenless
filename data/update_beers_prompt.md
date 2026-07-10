# Prompt: Update the gluten-free beer database

Paste everything below into Claude (with web search / research enabled), and attach or paste your current `gluten_free_beers.json` in the same message.

---

You are maintaining a JSON database of commercially available **gluten-free** and **gluten-removed** beers from around the world. I am giving you the current database as a JSON array. Your job is to research and produce an **updated** version, then return the **full** updated JSON.

## What to do

1. **Find new beers.** Use web search / research to find gluten-free or gluten-removed beers that are **not already in the list**. Search broadly across regions (North America, UK/Ireland, mainland Europe, the Nordics, Australia/NZ, etc.) and across both dedicated gluten-free breweries and mainstream breweries with gluten-removed ranges. Include newly released beers. Prioritise beers that are currently commercially available.
2. **Check existing beers for discontinuation.** For each beer in the list that is **not already** marked discontinued, check whether it is still in production / still offered by the brewery. If it has been discontinued, or the brewery has closed, set that beer's `"discontinued"` field to `true`.
3. **Return the full updated JSON** (every existing beer plus any new ones).

## Hard rules — do not break these

- **The gluten information MUST be correct.** This is critical — people with coeliac disease rely on it. For every new beer, verify against the brewery's own statements whether it is naturally gluten-free or gluten-removed, and set `glutenFree`, `glutenRemoved`, `grains`, and `ppm` accordingly. Do not guess. If you cannot confirm a beer's gluten status from a reliable source, do not add it.
- **NEVER change or reassign the `id` of any existing beer. IDs are permanent.** This is the most important rule.
- **Never remove any beer** from the list, even if it is discontinued or the brewery has closed.
- **Do not modify any field of an existing beer except `discontinued`.** The only permitted change to an existing entry is flipping `discontinued` from `false` to `true`. Leave `name`, `brewery`, `grains`, `note`, `breweryUrl`, and everything else exactly as they are.
- **If a beer is already `"discontinued": true`, skip it completely** — do not research it and do not change anything about it.
- **New beers get new IDs** continuing from the highest existing `id` + 1, incrementing by 1 for each new beer. Never reuse an old ID and never renumber existing ones.
- **Avoid duplicates.** Before adding a beer, confirm it is not already in the list (match on brewery + beer name, case-insensitive). If it is already present, do not add it again.

## Schema (one object per line)

```
{"id":int,"name":str,"brewery":str,"country":str,"style":str,"abv":float,"ibu":int_or_null,"ppm":str,"glutenFree":bool,"glutenRemoved":bool,"discontinued":bool,"grains":[str],"note":str,"breweryUrl":str}
```

## Rules for NEW beers only

**Classification**
- **Naturally gluten-free** — brewed from gluten-free grains (sorghum, millet, rice, buckwheat, corn, quinoa, chestnut, lentil, etc.): `"glutenFree": true, "glutenRemoved": false`.
- **Gluten-removed** — brewed from barley/wheat/etc. then treated with an enzyme (e.g. Brewers Clarex) to break down gluten: `"glutenFree": false, "glutenRemoved": true`.

**Fields**
- `grains`: the actual base grains/ingredients used, e.g. `["barley","maize"]` or `["millet","buckwheat"]`.
- `ppm`: use the brewery's published figure if stated (e.g. `"<5 ppm"`); otherwise `"<20 ppm"`.
- `ibu`: integer if published, otherwise `null`.
- `breweryUrl`: link to the **specific product page** where possible; otherwise the brewery's beer-listing page; only fall back to the homepage if nothing better exists. Verify the link resolves. If a brewery's entire website is down, still use its best URL (it may come back).

**`note` field — include ONLY:**
- taste / aroma
- ingredients other than grains (hops, fruit, spices, etc.)
- where it was brewed
- gluten status, using consistent wording: `"Naturally gluten-free."` / `"Dedicated gluten-free brewery."` / `"Certified gluten-free."` (you may name the certifying body, e.g. `"Certified gluten-free by Coeliac UK."`)
- for **gluten-removed** beers: do **not** state gluten status (the `glutenRemoved` flag covers it); you **may** briefly mention the removal method, e.g. `"…with a process that removes gluten."`

**`note` must EXCLUDE:** awards/medals, ppm figures, discontinued status, "Systembolaget", "Verified product page", "Direct product page", "Likely enzyme-assisted", "Ephemeral/limited series".

## Output

1. First, a short summary: which beers you **added** (name + brewery) and which existing beers you **marked discontinued**.
2. Then the complete updated database as a single JSON array, **one object per line**, in a code block, sorted by `id` ascending. Include every existing beer plus the new ones, and no other commentary inside the code block.
