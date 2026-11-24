# Recipe Book

A small recipe website that scales recipes, switches between US and metric units, and shows the
right amounts inside each step. It's plain HTML and JavaScript hosted on GitHub Pages, with no build step.

- Recipes live in `recipes/` as simple text files. See [FORMAT.md](FORMAT.md).
- Add a new recipe file, then list its name in `recipes/index.yaml`.
- Open the site on your phone and choose "Add to Home Screen" to use it like an app, even offline.

Run it locally with `python3 -m http.server` and open http://localhost:8000.
