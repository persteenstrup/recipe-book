# Recipe file format

Each recipe is one YAML file in `recipes/`, listed in `recipes/index.yaml`.
Amounts are written once, in the units the original recipe uses (metric or US).
The site scales, converts and rounds them in the browser.

```yaml
title: Pancakes
serves: 4                 # base yield; can also be e.g. "makes: 12"
tags: [breakfast, quick]
source: Grandma           # optional
notes: Optional free text.

ingredients:
  # id: amount unit name    (id is what steps refer to)
  flour:  250 g plain flour
  milk:   500 ml whole milk
  eggs:   2 eggs                 # unitless counts round to whole numbers
  salt:   1 pinch salt !fixed    # !fixed = never scales
  butter: 2 tbsp butter, for frying

equipment:
  - 24 cm frying pan !warn       # !warn = shown as a warning when scaled a lot

steps:
  - Whisk {flour} with {milk} and {salt} until smooth.
  - Beat in {eggs}; rest the batter 20 minutes.
  - Fry in {butter}, using {butter:half} per batch.   # {id:half} / {id:third} / {id:quarter} = portion of the amount
```

Ingredient groups (e.g. "For the sauce") use a nested map:

```yaml
ingredients:
  For the dough:
    flour: 500 g bread flour
  For the topping:
    cheese: 200 g mozzarella
```
