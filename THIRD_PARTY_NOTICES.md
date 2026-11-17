# Third-party notices

## ascii-sharks — code this plugin builds on

- Source: https://github.com/stackedlol/ascii-sharks
- Author: drewdi (stackedlol)
- License: MIT, added upstream on 2026-10-24. Checked 2026-11-17 at commit `a0074c16a106f0abc665fe9712ca445f8f98ad8e`.
- What comes from it: the overall way the ocean is drawn — creatures as a chain of spine nodes,
  sampled at sub-cell points into a character grid; glyph ramps for skin, fins, ridges and edges;
  coverage-based edge glyphs; and a diffusing wake field behind moving creatures. These ideas and
  the code shaped by them live in `src/ocean/` (`engine.ts`, `shapes.ts`, `render.ts`, `glyphs.ts`).
- Changed here: jellyfish (bell, oral arms, tentacles), manta ray and whale shark outlines, fish
  schools, braille / block / Chinese-character styles, moods, typing ripples and the Obsidian integration.

Its copyright notice is kept in [LICENSE](LICENSE). The full upstream license text:

```
MIT License

Copyright (c) 2026 drewdi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## character-ocean — visual inspiration, no code

- Source: https://github.com/jiezi1234/character-ocean (checked 2026-11-17 at `52068c41c842a4023e07e496ba4767ac1a1ce19e`)
- Its animation files carry no license grant, so no code from them is used. The look of a
  translucent interface over a character ocean, and the idea of adding manta rays, whale sharks
  and a braille style, came from seeing this project. The braille dot layout here is computed from
  the Unicode braille standard, the manta tail is traced with a standard grid traversal
  (Amanatides & Woo, 1987), and the water gradient is our own.

## Cursor-Smith — optional companion plugin, no code

- Source: https://github.com/Sadsnake1/cursor-smith (MIT)
- This plugin only calls Cursor-Smith's methods at runtime (`getUserPresets`, `loadUserPreset`,
  `saveSettings`) when it is installed. `presets/cursor-smith.json` holds three preset values we
  tuned for the moods; it contains settings values only, no Cursor-Smith code.
