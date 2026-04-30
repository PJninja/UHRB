---
name: new-monster-data
description: Add new lore entries to bioData.js, appearanceData.js, or nameData.js following the stat-letter encoding rules
disable-model-invocation: true
---

## Stat-Letter Encoding Rules

Every catalog entry is `{ text, letter }` where `letter` encodes the stat the entry contributes to:

| Letter | Stat | RichText Tag | Visual Style |
|--------|------|--------------|--------------|
| A | Speed | `<glow>` or `<spectral>` | glowing/luminous |
| C | Endurance | `<ancient>` or `<hex>` | ancient/worn/timeless |
| G | Madness | `<madness>` or `<cosmic>` | chaotic/unknowable |
| T | Strength | `<blood>` or `<infernal>` | brutal/physical |

## Corresponding Files and Arrays
| Data Type | File | Array Name |
|-----------|------|------------|
| Bio | `bioData.js` | `descriptions`, `blurbs`, `racingStyles` |
| Appearance | `appearanceData.js` | `bodyTypes`, `distinctiveFeatures`, `temperaments` |
| Names | `nameData.js` | `firstNames` (no letter encoding), `lastNames` |

## Requirements Checklist

Before adding any entry, verify:
- [ ] The `letter` value is one of: `A`, `C`, `G`, `T`
- [ ] The chosen letter's corresponding RichText tag appears at least once in the `text`
- [ ] The tag wraps a word or phrase that thematically matches the stat (e.g. `<glow>` around speed-related imagery)
- [ ] The entry is appended to the correct array in the correct file for its data type
- [ ] No stat numbers or digits appear in the text (stats are never shown to players)
- [ ] The prose generally fits the dark eldritch tone (can break from tone for humor or flavor, but should still feel cohesive with the overall style)

## Example Entry

```js
// Speed (A) entry — glow tag wraps speed-related imagery
{ text: "Moves with a <glow>blinding, unnatural swiftness</glow> that leaves afterimages burned into the air.", letter: "A" }

// Endurance (C) entry — ancient tag wraps timeless/worn imagery
{ text: "Its hide bears <ancient>the patient scarring of a thousand forgotten races</ancient>, each mark a testament to survival.", letter: "C" }

// Madness (G) entry — madness tag wraps chaotic imagery
{ text: "Observers report that watching it move induces <madness>a creeping sense that direction itself has become optional</madness>.", letter: "G" }

// Strength (T) entry — blood tag wraps brutal/physical imagery
{ text: "The ground cracks beneath each step, <blood>bones and stone yielding equally</blood> to its passing.", letter: "T" }
```

## Steps

1. Identify which file and array the entry belongs to
2. Choose the stat (`letter`) the entry should reinforce
3. Write prose in dark eldritch tone — no numbers, no stat names, but thematically appropriate to the chosen stat
4. Wrap the thematically appropriate phrase in the matching RichText tag
5. Append the `{ text, letter }` object to the array
6. Verify the checklist above before finishing
