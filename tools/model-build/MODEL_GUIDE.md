# Scripting a BIOGLOW mission model from the official building instructions

Goal: a TypeScript script `models/<id>.ts` that rebuilds one mission model part-by-part from real
LDraw parts, connected at real connection points, following FIRST's building instructions as
closely as possible. The result is used in a physics simulator: it matters most that
(1) outer dimensions and shape are right, (2) every moving mechanism (hinges, levers, sliding
parts, loose game pieces) is built the same way as the real model, (3) parts are really connected
(nothing floating), and (4) the parts/colours match the instructions.

## Sources (read-only; never commit or copy them anywhere else)
- Picture instructions: `resources/2026-27-bioglow/building-instructions/english/book-NN.pdf`
- Text instructions (Bricks for the Blind, very precise):
  `resources/2026-27-bioglow/building-instructions/text-based/text-bi-NN.pdf`
  Extract with: `pdftotext -layout <pdf> - | grep -v '^\s*$'`
- Render picture pages to look at them: `pdftoppm -r 110 -f P -l P -png <pdf> <scratch>/prefix`
  then view the PNG with the Read tool. Do this for the final-model page and for tricky steps.
- Book NN ↔ mission: 01 M01 Drone Survey, 02 M02 Exploding Seeds, 03 M03 Flip the Rock,
  04 M04 Lucky Leaves, 05 M05 Reaching Roots, 06 M06+M07 Leafcutter/Humongous Fungus,
  07 M08+M09 Tangled/Research Platform, 08 M10 Fragile Microhabitats, 09 M11 Window to the Past,
  10 M12 Forest Elder, 11 M13 Keystone Species (restoration platform/dock), 12 M14 Seeds of Renewal,
  13 M15 Biocentric Architecture.
- Parts in the Challenge Set with LDraw numbers + colours: `tools/model-build/CHALLENGE_PARTS.txt`.
  Any part in the full LDraw library may be used (look up names with
  `grep -H -m1 "^0 " ~/.cache/fll-sim/ldraw/parts/*.dat | grep -i "<name>"`). Use the exact part the
  instructions show; LDraw colour codes: Black 0, Blue 1, Green 2, Red 4, Dark Pink 5, Yellow 14,
  White 15, Tan 19, Lime 27, Dark Tan 28, Bright Pink 29, Reddish Brown 70, Light Bluish Grey 71,
  Dark Bluish Grey 72, Medium Nougat 84, Bright Green 10, Dark Green 288, Olive Green 330
  (see `~/.cache/fll-sim/ldraw/LDConfig.ldr` for all).

## The tooling (`tools/model-build/src/build.ts`) — DO NOT EDIT files outside your own model file
Run: `cd tools/model-build && PATH=$HOME/.local/node/bin:$PATH pnpm run build-model <id> -- --views`
→ writes `out/<id>.ldr` and renders `out/<id>-{iso,isoBack,front,right,top}.png`, and prints a
physics check (rigid groups, hinges, loose groups). Inspect a part's connection points:
`pnpm exec tsx src/inspect.ts 32316.dat 61332.dat`.

Frame: LDraw units (LDU; 1 stud = 20 LDU = 8 mm, plate height 8 LDU, brick 24 LDU). **-Y is up**,
**-Z is the front (towards the builder)**, **+X is the builder's right**. The model should stand
on y = 0 (its lowest point at y ≈ 0) and its front (as the instructions view it) facing -Z.

API:
- `const b = new Build(lib, "M05 Reaching Roots")`
- `b.place(file, color, orient("+z", "-x", "-y", [x, y, z]), label?)` — free placement of the first
  part (orient = where the part's own X, Y, Z axes point; must be a rotation, it throws otherwise).
  Parts with studs are modelled in LDraw with studs up (-Y) and origin at the top surface centre.
- `b.attach(file, color, { to, where?, own?, accept?, prefer?, offsets?, minConnections?, label? })`
  searches every compatible snap pair (new part × target snaps), all 90° rotations about the
  connection axis, both flips, and slide `offsets` (default ±30 LDU in steps of 10; pass wider,
  e.g. `[-40,-30,...,40]`, when a pin/axle must stick out further). It keeps the placement with the
  most connections to the whole model and no overlap; throws if nothing connects.
  - `to`: part index or indices; `where(s)`: filter target snaps (use `near([x,y,z], tol)`,
    `axisIs("x"|"-y"...)`, `all(...)`); `own(s)`: filter the new part's snaps (its own frame);
  - `accept(m)`: reject placements (m = candidate 3x4 matrix, `m[3],m[7],m[11]` = origin);
  - `prefer(m)`: add score to choose among equally-connected placements (e.g. which way an arm
    points) — use `pt(m, [lx,ly,lz])` / `dir(m, [..])` to get world positions/directions of local
    points of the part.
- Studs: plates/bricks connect stud-to-antistud the same way (their snaps are studs, 20 LDU grid).
  Use `where: near([x,y,z])` on the stud positions you want, and `minConnections` = number of
  studs that should engage.
- Sub-assemblies built separately in the instructions: build them in their own
  `new Build(lib, "...")` (first part with `place(..., IDENTITY)`), then
  `b.attachGroup(sub, { to, where, ownPart: [indices of the sub parts whose snaps connect], ... })`.
- `b.step()` starts the next instruction step (steps are exported to LDraw `0 STEP`; keep them
  matching the book's step numbers where practical).
- `dump(b, partIndex, filter?)` prints a placed part's snaps in model coordinates (debugging).
- `b.snaps(part, filter)` returns `{pos, axis, gender "M"/"F", kind "round"|"axle"|"stud", secs}`.

## Lessons from the first batch (read these!)
- **Prefer exact placement when the instructions pin the position down.** The search is for pins,
  axles and genuinely ambiguous fits. For system bricks/plates (20 LDU stud grid; part origin = top
  surface centre, a brick is 24 LDU tall, a plate 8) use `b.put(file, color, at(x, y, z, rot("y", 90)), minConnections)`:
  it places exactly and verifies the part really connects (throws otherwise). For symmetric
  partners, copy a placed part's matrix and translate it.
- **Hard constraints beat preferences.** If the text says "upright", "3L arm pointing back",
  "flush", or "centred", encode it in `accept` (use `pt(m, localPoint)` to test where a part of the
  piece ends up) rather than `prefer`.
- **Which face the pins go in from matters.** A bent liftarm with pins pushed in from the wrong face
  is the mirror image — no rotation fixes it. Check with `accept` on the pin's side.
- **Hinged sub-assemblies** (one pin/axle through a round hole): pass
  `angles: Array.from({length: 36}, (_, i) => i * 10)` and allow some `maxOverlap` for parts resting
  against something.
- **Known orientation for a sub-assembly:** `b.attachGroup(sub, { to, rotation: orient(...), ... })`
  only searches translations — use it whenever you know how the group is turned (fast and exact).
- **Data gaps you'll hit (don't fight them, note them in your report):** clips/click-hinges/hinge
  fingers (LDCad SNAP_CLP/SNAP_FGR) and bars in axle holes don't register as connections yet;
  flexible hoses/cables are separate segments; some decorative parts have no snap data. Place such
  parts exactly with `put(..., minConnections 0)` at the computed position and list them.
- Fixed in the tooling since the first batch: snap frames from mirrored subfiles no longer give
  mirrored (det < 0) placements, and 3-axis centred snap grids (`grid=1 C 2 1 0 120 0`, the mid-edge
  holes of 7x11 / 11x15 frames) are expanded properly.
- Tag game pieces in their labels in `src/publish.ts` (`loose: [label prefixes]`); everything else
  that doesn't connect is glued to what it touches on the field.
- **Performance:** the whole script should run in well under a minute. `BUILD_TIMING=1` prints slow
  attaches; restrict `where`/`own` snaps or use exact placement for those.
- `attach(..., { debug: true })` prints candidate placements with their connection counts.

Hints learned on M05:
- Pins are single snaps covering both halves; "half inserted" = the default offsets. A 3L pin
  sticking out 2L needs offsets ±20/±30.
- Pick specific holes by position (`near(...)`) after `dump`-ing the target part; "left/right/
  front/back/top" in the text map to -X/+X/-Z/+Z/-Y.
- If an attach fails with 0 connections, loosen `accept`, widen `offsets`, and `dump` both parts.
- Decorative parts that only attach by a stud or clip still must connect; if the snap data for a
  decorative piece is missing, attach it with `b.place()` at the right position computed from the
  neighbouring part (`pt(...)`), and mention it in a comment.
- Render often and compare with the picture pages. Check `check()`: `loose` should be 0 unless the
  model has intentionally loose pieces (game pieces/seeds/leaves that sit in the model); report them.

## Deliverable
1. `tools/model-build/models/<id>.ts` exporting `build(lib)` returning the Build.
2. It runs without errors; `out/<id>-*.png` look like the book's final model.
3. A short report: part count vs the book's count, which mechanisms move (hinges/sliders), loose
   game pieces, anything approximated or uncertain, and the model's footprint (x/z size in mm =
   LDU × 0.4) as seen from the top.
Only create/modify your own `models/<id>.ts` (and scratch files in the scratchpad). Do not edit
anything in `src/`, `packages/`, or other models; if the tooling blocks you, describe the problem
in your report.
