# Prompt: Update the gluten-free beer database

Paste everything below into Claude (with web search / research enabled), and attach or paste your current `gluten_free_beers.json` in the same message.

---

You are maintaining a JSON database of commercially available **gluten-free** and **gluten-removed** beers from around the world. I am giving you the current database as a JSON array. Your job is to research and produce an **updated** version, then return the **full** updated JSON.

## What to do

1. **Find new beers.** Use web search / research to find gluten-free or gluten-removed beers that are **not already in the list**. Search broadly across regions (North America, UK/Ireland, mainland Europe, the Nordics, Australia/NZ, etc.) and across both dedicated gluten-free breweries and mainstream breweries with gluten-removed ranges. Include newly released beers. Prioritise beers that are currently commercially available.
2. **Check existing beers for discontinuation.** For each beer in the list that is **not already** marked discontinued, check whether it is still in production / still offered by the brewery. If it has been discontinued, or the brewery has closed, set that beer's `"discontinued"` field to `true`.
3. **Return the full updated JSON** (every existing beer plus any new ones).

## Where to look — be exhaustive

Do not stop after a few general searches. Past updates missed widely sold beers (Stella Artois Gluten Free, Magic Rock Fantasma, Cobra Gluten Free, Two Brothers Prairie Path) because the search was too shallow. Work country by country and use these sources, which have turned up many beers:

- **National coeliac society lists** (most reliable; they list certified products):
  - Finland: Keliakialiitto beer list — https://www.keliakialiitto.fi/kuluttajat/reseptit-ja-tuotteet/gluteenittomia-tuotteita-listauksia-tuoteryhmittain/oluet/
  - Spain: FACE "Espiga Barrada" certified beers — https://celiacos.org/cervezas-sin-gluten/
  - UK: Coeliac UK Crossed Grain products (Food and Drink Guide)
  - Also check the equivalents for Italy (AIC, "spiga barrata"), France (AFDIAG), Sweden, Norway, Denmark, Germany (DZG), Australia (Coeliac Australia endorsement), etc.
- **Curated guides and directories:**
  - Italy/EU: https://www.beverfood.com/birre-gluten-free-tutte/ (long list of industrial and craft brands)
  - UK: https://thegftable.co.uk/2025/11/09/best-gluten-free-beer-brands-a-complete-uk-guide/ (UK breweries whose whole range is gluten-free)
  - UK blogs such as https://www.theglutenfreeblogger.com/gluten-free-beers-uk/
  - US/Canada dedicated GF breweries: https://gluten.guide/post/gluten-free-beer-breweries/
- **Supermarket "free from" ranges:** Tesco, Sainsbury's, Asda, Morrisons, Ocado, Systembolaget, Alko, Vinmonopolet, Dan Murphy's, etc.
- **Big brewers' gluten-free variants:** mainstream brands often have a GF version (e.g. Stella Artois, Old Speckled Hen, Greene King IPA, BrewDog Punk IPA, Tennent's Light, Cruzcampo, Ámbar, Celia). Check each major brand.
- **Breweries that made their whole range gluten-free:** many UK craft breweries (Bristol Beer Factory, Williams Bros, Little Ox, Purity, Siren…) add new GF beers regularly, so recheck their current core range every time.
- **Brewery web shops:** many run on Shopify; `https://<domain>/products.json` lists every product with its description, which usually includes ABV and the gluten statement.

## Pitfalls seen before

- **"Low gluten" is not gluten-free.** Some beers are marketed as low gluten (up to 100 ppm), e.g. Original Small Beer lager. Do not add them.
- **No ppm or gluten-free claim means don't add it.** An ingredient list without barley or wheat (e.g. Japanese malt-free "third beers") is not enough.
- **Recalls:** check for gluten recalls before adding (e.g. Riedenburger's gluten-free beer was recalled after gluten was found).
- **Batch-dependent beers:** skip beers where only some batches are certified (e.g. Siren The Pilot), and skip one-off seasonals.
- **Renamed products:** check whether a "new" beer is an existing one under a new name (e.g. Hahn SuperDry GF became Hahn Ultra Crisp).
- **Same name, different brewery:** generic names like "Lager", "Pale Ale" or "Craft Lager" exist for several breweries. Match on brewery + name, not name alone.
- **Brewer no longer lists it:** if the brewery's own site has dropped a beer, check retailers; mark it discontinued rather than adding it as current.
- **Missing ABV:** if the brewer doesn't publish an ABV, find it on a reliable retailer listing or leave the beer out. Don't guess.

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
