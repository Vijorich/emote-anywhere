# Design direction

A quiet utility for chat: the extension should feel like part of the page, not a
marketing surface. Dense but calm, one accent, no decoration that does not carry
state.

## Palette

- Green accent (`#17694e` light, `#6cc79e` dark) marks actions, links and on states.
- Neutral greens tint the frame, sheet, raised and active surfaces so the UI sits
  between light and dark chat themes without turning blue or grey.
- Red and amber are reserved for errors and warnings. No fourth hue.

## Type

Arial and Arial Black are the system-safe display and body pair. The heavy display
face gives the product name and page titles a compact, chat-adjacent voice; Arial
keeps controls legible at 12–14px. Mono (Consolas) is only for IDs, URLs and
channel keys.

Arial Black is absent on Linux and Android. The chain falls back to Arial at
weight 900: still legible, slightly less dense.

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
by tone steps and colour halos. Destructive actions use a negative-soft fill at
rest, solid negative on hover and while armed. The fill is what stops Remove and
Clear binding from reading as labels. In every row the switch is the last control,
so enable state always sits at the right edge.

Text fields are filled with `--raised` and step to `--control` on focus. They have
no hover state. Pointer focus changes only the fill; the colour halo is reserved
for keyboard navigation, tracked by input modality, because a text input always
matches `:focus-visible` in Chrome.

The size slider is a 4px track with an accent fill and a 16px accent thumb. No
native control chrome.

## Rhythm

4px spacing scale, 5/8/10/16px radii, 120ms state transitions. Surfaces carry
hierarchy; borders appear only where a control needs a boundary. Motion is limited
to hover, focus and the picker zoom, and is removed under reduced motion.

Dial: ENERGY 1 / RHYTHM 1 / MOTION 1.
