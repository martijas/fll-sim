# FLL Sim

A desktop simulator for **FIRST LEGO League Challenge** teams using **LEGO Education SPIKE Prime**.
Write SPIKE Python, run it on a to-scale competition table, and watch the robot drive, turn,
and read its sensors — away from the physical robot. Runs on Debian/Ubuntu (and other Linux).

Current season pack: **2026-27 BIOGLOW**.

## Status

| Milestone | State |
|---|---|
| M0 Foundation — monorepo, Electron app, `.deb` / AppImage packaging, CI | ✅ |
| M1 Table — table + walls to spec, mat to scale, launch areas, mat import | ✅ (mat size to verify with a tape measure) |
| M2 Drive base — Rapier physics, SPIKE motor model (profiles, PID, stop modes, stall) | ✅ |
| M3 Python — real MicroPython (WASM) in lockstep with sim time, SPIKE 3 API | ✅ |
| M4 Sensors — colour (samples the mat), distance, IMU; telemetry panel | 🟡 force sensor + calibration UI pending |
| M5 Word Blocks + `.llsp3` | 🟡 Word Blocks `.llsp3` compile + run (FIRST's BIOGLOW guided mission runs); visual blocks editor pending |
| M6 LEGO builder (LDraw parts, snapping, connectivity) | 🟡 real-part builder, connection → physics (rigid groups, hinges, motor axles), real-parts SPIKE drive base; gears and part thumbnails pending |
| M7 BIOGLOW mission models + scoring | 🟡 official scoresheet + auto total (incl. Challenge Update 01), 2:30 match mode, auto equipment inspection, all 13 mission books built from real LEGO parts and placed on their mat marks (see below); exact orientation of M08/09 still to confirm on a real table |
| M8 Real-robot calibration, replay, polish | ⏳ |

See `PLAN.md` for the full design.

## Running from source

Requires Node.js 22+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev            # launch the app with hot reload
pnpm test           # physics + Python conformance tests
pnpm typecheck
pnpm dist:linux     # build apps/desktop/release/fll-sim_<ver>_amd64.deb and an AppImage
sudo apt install ./apps/desktop/release/fll-sim_0.1.0_amd64.deb
```

Headless runs (CI, batch testing of programs):

```sh
pnpm sim run my_program.llsp3 --start 230,180,0 --trace trace.json
# FIRST's BIOGLOW guided mission (Word Blocks), robot wired like the SPIKE lesson:
pnpm sim run resources/2026-27-bioglow/code/guided-mission-bioglow-11.llsp3 \
  --start 300,350,-90 --drive C,D --color B --distance none --motors E
```

## Word Blocks

Word Blocks `.llsp3` projects from the SPIKE App open directly: they are compiled to Python
(shown read-only in the editor, "View as Python") and run on the same simulated hub, so timing
and physics are identical to Python programs. Edit blocks in the SPIKE App and re-open, or use
**Convert to Python** to continue in Python.

## Building robots with real LEGO parts

The **Build** tab places real parts from the LDraw library — the SPIKE Prime Core and Expansion
sets and the BIOGLOW Challenge Set are in the catalog. Parts snap together at their real
connection points (studs, pin holes, axles). **Check connections** shows how the model will
behave physically: parts held by studs, axles in axle holes, or two or more pins become one rigid
group; a single pin or an axle in a round hole becomes a hinge; SPIKE motors drive their output
hub. **Use as robot** puts the build on the field. Models save as standard `.ldr` files (open
them in LDCad, LeoCAD or Studio); motor/sensor ports are stored as `0 !FLLSIM PORT X` lines.

Part geometry: [LDraw Parts Library](https://library.ldraw.org) (CC BY 4.0). Connection data:
[LDCad Shadow Library](https://github.com/RolandMelkert/LDCadShadowLibrary) (CC BY-SA 4.0).
Inventories: [Rebrickable](https://rebrickable.com). See `apps/desktop/resources/ldraw/ATTRIBUTION.txt`.
Rebuild the bundled pack with `pnpm --filter @fll-sim/ldraw-pack run build-pack` (needs the LDraw
library in `~/.cache/fll-sim/ldraw`, the shadow library in `~/.cache/fll-sim/shadow` and the
Rebrickable CSV dumps in `~/.cache/fll-sim/rebrickable`).

## Missions and scoring (BIOGLOW)

All 13 BIOGLOW mission books ship as real-LEGO models (`apps/desktop/resources/missions/*.ldr`,
poses in `seasons/2026-27/mission-models.json`), scripted part by part from the official building
instructions and placed on the mat by matching their footprint against the wireframe marks.
On the field:

- the heaviest body resting on the mat is held by Dual Lock; hinges, levers and game pieces move
  under physics; parts whose connection isn't in the snap data (flexible hoses, clips, some
  decorations) are glued to what they touch;
- game pieces are tagged in their part labels (`[loose:<piece>]`) so they stay free;
- a model stays frozen exactly as set up until the robot comes near it (fast, and like the
  friction that holds a real model still), then all its parts come alive.

**Mission models: LEGO / blocks** switches to simple blocks (faster). Your own build replaces a
model via **Use as mission model…** in the Build tab (**Reset … to default** restores it). The
Build tab's **Examples…** menu opens every mission model, e.g. to print its instructions.
**⏱ Match** runs your program for 2:30 and stops it; the **Score** tab is the official scoresheet
with the total calculated as you answer.

### Building instructions

**Instructions…** in the Build tab exports any model (your robot, attachments, a mission model)
as a LEGO-style building guide (PDF or HTML): a cover, the parts list with quantities and colours,
and numbered steps with a parts callout and the new parts outlined. Steps come from the builder's
step control (**+ New step**); models without steps get one part per step.

### Maintaining the mission models (`tools/model-build`)

- `models/<id>.ts` rebuild a book: `pnpm --filter @fll-sim/model-build run build-model <id> -- --views`
  (needs the building instructions in `resources/`, see `tools/model-build/MODEL_GUIDE.md`).
- `pnpm exec tsx src/publish.ts [book ...]` (in `tools/model-build`) splits books into field
  models, finds their pose on the mat and writes the app's mission files.
- `pnpm run field-check [id] [--wake] [--render]` checks the models' physics on the field.

## Season materials and the mat

FIRST's season documents (rulebook, mission model instructions, mat wireframe) are copyrighted
and are **not** in this repository. Download them from the FIRST season materials page into
`resources/2026-27-bioglow/` (git-ignored). To make a mat texture:

```sh
python3 tools/mat-import/import_mat.py resources/2026-27-bioglow/field/wireframe-grid.pdf \
  --page 2 --mat-mm 2000x1140 --out resources/2026-27-bioglow/derived/mat-wireframe.png
```

For the colour mat (recommended — the colour sensor reads the real artwork):

```sh
python3 tools/mat-import/compose_color_mat.py --rulebook resources/2026-27-bioglow/rules/robot-game-rulebook.pdf \
  --wireframe resources/2026-27-bioglow/derived/mat-wireframe.png --out resources/2026-27-bioglow/derived/mat-color.png
```

In the app, **Mat image…** loads a scan/photo of your printed mat (cropped exactly to the mat edges);
it is remembered per season. The colour sensor reads this image, so a colour-accurate scan gives
the most realistic line-following.

## The simulated robot

Default drive base: drive motors **A** (left) and **B** (right, both medium motors, 56 mm wheels,
120 mm track), colour sensors **C** and **D** pointing down at the front, distance sensor **E**
facing forward, attachment motor **F**. Use **Robot…** to rewire ports to match your robot
(presets include the SPIKE guided-mission robot: drive C+D, colour B, arm E). Start pose is set with X / Y (mm on the mat, origin at the south-west corner)
and heading (degrees, 0 = facing north/away from the south wall).

## Known differences from a real hub (to be calibrated — see plan M8)

- Motor torque/friction and wheel grip are estimates; yaw sign convention and IMU axes need
  confirming on a real hub.
- `time.sleep_ms` and every hub call advance simulated time; pure-Python loops that never call
  the hub don't (use Stop).
- Colour-sensor reflection values depend on your mat image; calibrate against real readings.
