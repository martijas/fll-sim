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
| M5 Word Blocks + `.llsp3` | 🟡 `.llsp3` Python open/save done; blocks pending |
| M6 LEGO builder (LDraw parts, snapping, connectivity) | ⏳ |
| M7 BIOGLOW mission models + scoring | ⏳ |
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
```

## Season materials and the mat

FIRST's season documents (rulebook, mission model instructions, mat wireframe) are copyrighted
and are **not** in this repository. Download them from the FIRST season materials page into
`resources/2026-27-bioglow/` (git-ignored). To make a mat texture:

```sh
python3 tools/mat-import/import_mat.py resources/2026-27-bioglow/field/wireframe-grid.pdf \
  --page 2 --mat-mm 2000x1140 --out resources/2026-27-bioglow/derived/mat-wireframe.png
```

In the app, **Mat image…** loads a scan/photo of your printed mat (cropped exactly to the mat edges);
it is remembered per season. The colour sensor reads this image, so a colour-accurate scan gives
the most realistic line-following.

## The simulated robot

Default drive base: drive motors **A** (left) and **B** (right, both medium motors, 56 mm wheels,
120 mm track), colour sensors **C** and **D** pointing down at the front, distance sensor **E**
facing forward. Start pose is set with X / Y (mm on the mat, origin at the south-west corner)
and heading (degrees, 0 = facing north/away from the south wall).

## Known differences from a real hub (to be calibrated — see plan M8)

- Motor torque/friction and wheel grip are estimates; yaw sign convention and IMU axes need
  confirming on a real hub.
- `time.sleep_ms` and every hub call advance simulated time; pure-Python loops that never call
  the hub don't (use Stop).
- Colour-sensor reflection values depend on your mat image; calibrate against real readings.
