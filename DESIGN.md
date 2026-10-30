# Design direction

A quiet utility for chat: the extension should feel like part of the page, not a
marketing surface. Dense but calm, one accent, no decoration that does not carry
state.

## Palette

- Green accent (`#17694e` light, `#6cc79e` dark) marks actions, links and on states.
- Neutral greens tint the frame, sheet, raised and active surfaces so the UI sits
  between light and dark chat themes without turning blue or grey.
- Red and amber are reserved for destructive actions, errors and warnings. No
  fourth hue.

## Type

The system UI stack (`system-ui`, Segoe UI, Roboto) keeps the interface native to
the browser on every platform. Body text is 16px, notes 14px, small labels 13px.
Titles use weight 700 with tight tracking; there is no separate display face.
Mono (ui-monospace, Cascadia Mono, Consolas) is only for IDs, URLs and channel
keys.

The picker panel and the options page use the same stack, so the emote grid
matches the surrounding chat instead of introducing a second type voice.

## Icon

Cream face on the green field: the face is the emote, the field is the tile. The
16px PNG is drawn separately with bolder features, because the 128px geometry
turns into a blob at toolbar size.

## Layout

The settings column caps at 880px and centres inside the sheet, so a label and its
control stay in one glance on a wide screen. The sheet keeps the full width; only
the reading column is capped.

## Controls

Controls are filled surfaces, not outlines: borders and focus outlines are replaced
by tone steps and colour halos. Destructive actions stay neutral at rest and turn
solid negative on hover or keyboard focus, so routine removal never competes with
the primary action. Removals act immediately; removing a plugin or registry asks for
confirmation. In every row the switch is the last control, so enable state always
sits at the right edge.

There are no transient banners or toasts. State changes are shown by the list
itself, validation stays inline at the field, and load failures show a Retry button
in place of the content.

Text fields are filled with `--raised` and step to `--control` on focus. They have
no hover state. Pointer focus changes only the fill; the colour halo is reserved
for keyboard navigation, tracked by input modality, because a text input always
matches `:focus-visible` in Chrome.

The size slider is a 4px track with an accent fill and a 20px accent thumb. No
native control chrome.

## Rhythm

4px spacing scale, 8/16/24px radii, 120ms state transitions. Controls and rows
are at least 40px high, and touch targets grow to 48px. Surfaces carry
hierarchy; borders appear only where a control needs a boundary. Motion is limited
to hover, focus and the picker zoom, and is removed under reduced motion.

Dial: ENERGY 1 / RHYTHM 1 / MOTION 1.
