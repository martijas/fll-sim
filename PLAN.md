# FLL Sim: plan for a FIRST LEGO League simulator

## Context
FLL Challenge teams only get limited time with the physical robot and field. The goal is a desktop app for Debian-based Linux that lets a team work away from the table. In the app they can:
- **Build** the robot and the mission models from accurately sized LEGO parts.
- **Program** the robot in SPIKE Prime Python (`docs.txt`) or Word Blocks (`docs_wordblock.txt`), and import/export `.llsp3` files.
- **Run** those programs on a correctly scaled FLL table. The table has the current **2026-27 season** mat and mission models in their proper positions, with realistic physics, sensors and scoring.

`/home/jason/project` currently holds only the two API reference files, so this is a new project. Decisions made so far:
- **Stack:** Electron + TypeScript + Three.js.
- **Season:** 2026-27 first, loaded as a data pack.
- **First milestone:** drive and code. A pre-built drive base runs real programs before the builder exists.

## Tech stack
| Concern | Choice | Why |
|---|---|---|
| Shell / packaging | Electron + electron-builder → `.deb` + AppImage | Runs on Debian 12+ and Ubuntu 22.04+, with one codebase |
| UI | React + Vite, dockable panels (`dockview`) | Field, code, console and telemetry panels side by side |
| 3D | Three.js with `LDrawLoader` (in three/examples) | Loads the official LDraw part geometry directly |
| Physics | Rapier3D (`@dimforge/rapier3d`, WASM) | Deterministic. Has multibody joints with motors, CCD and a fixed timestep |
| Python | Official MicroPython `ports/webassembly` build, run in a Web Worker | Runs the same MicroPython as the hub, including asyncio, ints and error messages |
| Blocks | `scratch-blocks`, the same base as the SPIKE App's Word Blocks | Blocks look and behave like the real app |
| Text editor | Monaco, with SPIKE API autocomplete generated from `docs.txt` | |
| Tests | Vitest (unit tests), Playwright (UI), a headless sim CLI (behaviour) | |

## Architecture (pnpm monorepo)
```
fll-sim/
  apps/desktop/            Electron main + preload, file dialogs, .llsp3 open/save
  packages/
    units/                 LDU⇄mm⇄stud conversions (1 LDU = 0.4 mm, stud = 8 mm, plate = 3.2 mm, brick = 9.6 mm)
    parts/                 LDraw library loader, curated SPIKE catalog, colliders, mass table, connection points
    assembly/              connectivity graph → rigid clusters + joints (shared by robot and mission models)
    physics/               Rapier world, fixed 1 kHz step, sim clock, contacts/friction materials
    devices/               virtual hardware: hub (IMU, light matrix, buttons, speaker, lights), motors, color/distance/force sensors
    runtime-python/        MicroPython-WASM worker + frozen SPIKE modules (motor, motor_pair, hub.*, runloop, color_sensor, …)
    runtime-blocks/        SPIKE block definitions (opcodes such as flippermotor_motorTurnForDirection), Blocks→Python compiler, blocks runtime helpers
    llsp3/                 .llsp3 zip read/write (manifest.json, projectbody.json / scratch.sb3 project.json, icon.svg)
    field/                 table geometry, mat texture, season-pack loader, mission placement, scoring engine, match timer
    builder/               building UI: catalog, snap placement, submodels, instructions-step view
    ui/                    React app shell, panels, run controls, telemetry graphs
  seasons/2026-27/         season.json, scoring.ts, models/*.ldr (mission models), placement.json. Mat art is imported by the user, not bundled
  tools/sim-cli/           headless runner: `sim-cli run program.llsp3 --robot robot.ldr --season 2026-27 --trace out.json`
```

### Core design points

**1. Units and scale.** Everything in the app is in millimetres, and LDraw coordinates are converted once at load time. The mat is 2362 × 1143 mm (93″×45″). Table surface size, border wall size and height, and the mat's placement (flush to the south wall, centred left to right) all come from the season's official Field Setup Guide. They are parameters in `season.json`, not hard-coded values.

**2. Parts.**
- **Geometry:** the LDraw official library. There is a curated catalog of the SPIKE Prime Core (45678) and Expansion (45681) parts, plus common Technic parts.
- **Connection points:** from LDCad's open "shadow library" SNAP metadata (studs, pin holes, axle holes, axles, pins). It supplies the snapping positions and the joint types.
- **Collision:** a simplified collider for each part (boxes and cylinders from bounding-box and primitive analysis), never the full triangle mesh.
- **Mass:** a hand-measured table for electronics and common parts (hub, motors, sensors, tyres). Other parts fall back to mesh volume × ABS density (1.05 g/cm³).

**3. Assembly → physics** (same code for the robot and the mission models). A connection graph is built from the snapped connection points:
- **Rigid links** join parts into clusters. These are studs, friction pins in pairs, axles in axle holes, and multiple non-collinear pins.
- **Revolute joints** are created where parts can turn: an axle in a round hole, a frictionless pin, turntables.
- **Motor outputs** become motorized revolute joints.
- Gears are detected from part IDs and centre distance, and become gear-ratio constraints.

Each rigid cluster is one Rapier body with a compound collider. This keeps a 400-part robot down to about 5–20 bodies.

**4. Device models** (`devices/`), with parameters in `devices/specs.json`:
- **Motors (Large, Medium and Small angular).** Maximum speeds come from `docs.txt` (1050, 1110 and 660 °/s). Each motor has a DC torque–speed curve with a stall torque. A velocity/position PID mimics LEGO's: trapezoidal acceleration and deceleration (1–10000 °/s²) and stop modes COAST/BRAKE/HOLD/CONTINUE/SMART_*. The model also covers stall detection (returns `motor.STALLED`), absolute position 0–359 vs relative position, and `get_duty_cycle`.
- **motor_pair.** Steering math for -100..100: 0 is straight and ±100 is a pivot turn. Covers `move_tank*` and three pair slots.
- **Color sensor.** Samples the mat texture (and any mission model surfaces) under the sensor spot, found by raycast. The sample is blended across a spot size that depends on height, and the sensor's own LED illumination is modelled. It returns `reflection` 0–100, `rgbi`, and `color()` classified into the documented set of colors (−1 for unknown). There is a per-team calibration table, because printed mats differ.
- **Distance sensor.** A narrow-cone raycast. Range 0–2000 mm, returns −1 when nothing valid is seen. Has 4 lights.
- **Force sensor.** Contact force on the plunger collider, 0–100 dN. `pressed` returns true above a threshold.
- **Hub IMU.** Built from the rigid body state: yaw/pitch/roll in decidegrees, angular velocity, acceleration in milli-g, and the quaternion. Also covers the `up_face` and yaw-face mapping, gestures, and optional drift and noise.
- **Hub.** 5×5 light matrix with all 67 images, text scrolling and orientation. Power/connect lights, left/right buttons (clickable in the UI), and a speaker (beep ADSR via Web Audio).

**5. Python runtime (the key part for accuracy).**
- MicroPython-WASM runs in a Worker and moves in lockstep with the sim clock, not the wall clock. This keeps runs deterministic and lets them go faster or slower than real time.
- Device calls are synchronous RPCs to the sim, using SharedArrayBuffer + Atomics. A sensor read returns the value at the current sim time.
- **Frozen modules** are written in Python on top of a small `_simbridge` JS module: `motor`, `motor_pair`, `hub` (`port`, `light_matrix`, `light`, `button`, `sound`, `motion_sensor`), `runloop`, `color`, `color_sensor`, `color_matrix`, `distance_sensor`, `force_sensor`, `device`, `orientation`, and `app.*` (`sound`, `music`, `display`, `linegraph` and `bargraph` shown in UI panels). All constants match `docs.txt`.

Hub behaviours that must be reproduced exactly:
- An awaitable motor command **starts when it is called**, even without `await`. `await` only waits for it to finish. It returns a status (READY, STALLED, CANCELLED…), and a new command on the same port cancels the running one.
- `runloop.run(*coros)` runs coroutines concurrently. `runloop.sleep_ms` and `runloop.until(fn, timeout)` yield to the other coroutines.
- `time.sleep_ms` **blocks the whole program**: sim time advances and no other coroutine is scheduled.
- A tight loop with no await also blocks. An instruction budget per sim tick stops runaway loops from freezing the UI.
- Error text and line numbers appear in the Console, for example when reading a port with nothing connected.

**6. Word Blocks.**
- **Editor:** `scratch-blocks` with a SPIKE-style toolbox and a block for every opcode in `docs_wordblock.txt`. Weather blocks are stubbed with an offline notice.
- **Compiler:** blocks compile to Python that uses a `blocks_rt` helper module. Each hat stack becomes a coroutine. Edge-triggered hats (When Color Is, When Closer Than, When pressed, When Timer, When condition) become watcher coroutines.
- **Semantics:** broadcast and broadcast-and-wait, and stop-other-stacks. Default speeds are 75% for motors and 50% for movement, with % converted to °/s for each motor type. `setDistance` calibration is supported. Values are converted from cm/in/rotations/seconds.
- **One runtime:** blocks and Python both run on the same MicroPython path, so the physics behaves identically for both. There is a "View as Python" toggle.

**7. `.llsp3` import/export.** A `.llsp3` file is a zip containing `manifest.json`, `projectbody.json` (Python source) or `scratch.sb3` (a Word Blocks `project.json`), and `icon.svg`. The format will be checked against real files saved by the SPIKE App 3. Real `.llsp3` samples are needed as round-trip test fixtures.

**8. Field and season pack (2026-27).**
- **`season.json`:** table dimensions, launch (home) areas as mat polygons, and the robot size/height limits used for an inspection check. It also lists each mission model: its `.ldr` file, its placement (x, y, rotation from the mat's placement marks), whether it is Dual-Lock fixed or loose, and its initial joint states.
- **Mat:** the user imports the official mat PDF or print file. It is rasterized to at least 2 px/mm and snapped to the physical 2362×1143 mm frame.
- **Placement tool:** a calibration tool drags each model onto its printed placement mark. The resulting coordinates are saved.
- **Mission models:** built in the in-app builder from the official build instructions, or imported from community `.ldr` files. Their moving parts behave through ordinary physics joints; there are no scripted animations.
- **`scoring.ts`:** one pure function per mission. Each reads the model state (joint angles, whether a part sits inside a mat zone, contact with the mat) and returns points. It also covers the 2:30 match timer, precision tokens and the end-of-match score sheet.
- **Licensing:** FIRST and LEGO artwork and instructions are not redistributed. The repo ships geometry data authored by the team, and users import their own copy of the mat file.

**9. Builder.**
- **Workspace:** a part catalog with search and category filters by colour and part. Snap-to-connection placement with a 3D gizmo, plus rotation around the snap axis, and undo/redo.
- **Organisation:** submodels, and a "step" mode for following instructions.
- **Validation:** a live check for rigid clusters and unconnected parts, and an overlap check between parts.
- **Robot setup:** "Port assignment" maps hub ports A–F to the attached motors and sensors.
- **Files:** saves as `.ldr`/`.mpd`, so models open in LDCad, LeoCAD and Studio (Studio via export).

**10. GUI.**
- **Panels:** Field view (orbit/ortho top-down, following camera), Code (Python/Blocks tabs), Console, a virtual Hub (light matrix, buttons, lights), Telemetry (plots of motor angles, speeds, sensor values and yaw), and Builder.
- **Run controls:** play, pause, single-step, speed 0.25×–8× and reset.
- **Robot placement:** drag the robot inside the launch area, with optional alignment-jig snapping.
- **Replay:** scrub a recorded run and show the robot's path, overlaid with ghost runs to compare them.

## Milestones (drive + code first)
1. **M0 Foundation.** Monorepo, Electron shell, React layout, Three.js viewport, the `units` package, and CI. `.deb` build works.
2. **M1 Table.** Parametric table and walls. Mat import and scaling, cameras, and a placeholder season.json.
3. **M2 Drive base.** A hard-coded LDraw model of the SPIKE Prime drive base (hub, 2 medium motors, 56 mm wheels, caster) loaded through `parts` + `assembly`. It drives on Rapier with the motor model; friction materials are tuned.
4. **M3 Python.** MicroPython-WASM worker, sim-clock lockstep, `motor`, `motor_pair`, `runloop`, `hub.*`, Console and virtual hub. The `docs.txt` examples run.
5. **M4 Sensors.** Color, distance and force sensors, the IMU, and the calibration table. Telemetry panel.
6. **M5 Word Blocks + `.llsp3`.** Toolbox, compiler, `blocks_rt`, import/export and the Python view.
7. **M6 Builder.** Catalog, snapping, connectivity validation and port assignment. User-built robots replace the hard-coded one.
8. **M7 Season 2026-27.** Mission models built/imported and placed, scoring functions, match mode and inspection check.
9. **M8 Accuracy and polish.** A real-robot calibration workflow (see Verification), replay and ghosts, performance tuning and packaging.

## Verification
- **Unit tests (Vitest):**
  - unit conversions and LDraw coordinate conversion;
  - `.llsp3` round-trip on real files saved by the SPIKE App;
  - the blocks compiler: golden Python output for each opcode;
  - scoring functions on staged model states.
- **API conformance:** every example program in `docs.txt` runs in `sim-cli` with asserted results. Examples:
  - `motor.run_for_degrees(port.A, 360, 720)` ends at 360° ±2° after about 0.5 s plus the acceleration ramps;
  - two un-awaited commands run at the same time and awaited ones run one after the other;
  - `time.sleep_ms` blocks the other coroutines.
- **Physics accuracy harness:**
  - Run the same short programs on the real robot: drive 50 cm, turn 90° with the gyro, follow a line.
  - Log telemetry through `print`, import the log, and compare it to the sim trace.
  - Target: distance error under 2% and heading error under 2°. Tune friction and motor parameters until the target is met.
- **Scale check:** measure the table and mat in the app (there is a ruler tool) against the Field Setup Guide dimensions. Check that each placed mission model sits within 2 mm of its printed mark.
- **End-to-end (Playwright):**
  - open an `.llsp3`, place the robot, run a match and read the score;
  - build a small robot in the builder and drive it.
- **Packaging:** install the `.deb` on a clean Debian 12 VM and launch it; it needs WebGL2 and a GPU driver.

## Inputs needed from the team
- The official 2026-27 mat file, the Field Setup Guide, and the mission model build instructions.
- A few `.llsp3` files saved by the SPIKE App: one Python and one Word Blocks project.
- Access to a real robot and table for the calibration runs in M8.
