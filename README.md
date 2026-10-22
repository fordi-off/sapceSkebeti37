# Orbital Forge — browser space flight simulator

Build rockets from parts, launch them from an Earth-sized planet and fly them to orbit (or blow them up trying).
Pure HTML/JS/canvas — no build step, no dependencies. Open `index.html` in a browser (or serve the folder with any static server).

## Features
- **Vehicle Assembly** — snap-together parts (pods, tanks, engines, SRBs, decouplers, fins, legs, chutes, heat shields), mirror symmetry, undo/redo, staging editor, live mass / Δv / TWR / stability (CoM vs CoP) analysis, save/load/import/export.
- **Rigid-body flight physics (2D)** — inverse-square gravity around a rotating Earth, ISA atmosphere with density/pressure/temperature, per-part aerodynamics (Mach-dependent drag, cross-flow, fin lift, shielding by neighbouring parts), pressure-dependent Isp, thrust vectoring, reaction wheels.
- **Destruction** — Sutton–Graves aerodynamic heating with ablative shields, joint stress analysis (axial/shear/bending) that snaps joints and splits the craft into separate bodies, ground-impact damage, fuel explosions with blast-wave chain reactions, parachutes that tear if deployed too fast.
- **Orbits** — Keplerian elements (Ap/Pe/period/time-to), map view, on-rails universal-variable propagation for time warp up to ×100 000, physics warp ×2/×4.
- **Autopilot** — one-key gravity-turn ascent with auto-staging and circularisation (also handy for testing designs); SAS with hold / prograde / retrograde / radial modes.

## Controls (flight)
`Space` stage · `Shift/Ctrl` throttle · `Z/X` full/cut · `A/D` rotate · `T` SAS · `1-5` SAS modes · `G` auto-ascent · `M` map · `. ,` time warp · `P` arm chutes · `[ ]` switch vessel · wheel = zoom · `Esc` pause

## Development
No build step. The simulation core (`util`, `planet`, `parts`, `craft`, `vessel`, `world`, `presets`) has no DOM dependency, so it runs headlessly under Node:

```
node tests/scenarios.test.js    # staging, crashes, joint failure, heating, rails warp (all PASS/FAIL)
node tests/sweep.js             # flies every example vehicle to orbit with the autopilot
node tests/sim.test.js 1 600    # telemetry trace of example #1 for 600 s
node tests/reentry.test.js      # orbit -> deorbit -> reentry heating -> parachute
node tests/legs.test.js         # landing-leg contact/impact tolerance
```

Source layout: `js/vessel.js` (rigid body, aero, heating, joint loads), `js/world.js` (time warp, explosions, autopilot, craft analysis), `js/planet.js` (atmosphere + Kepler maths), `js/builder.js` (assembly building), `js/flight.js` (HUD/input), `js/render.js` (canvas drawing).

## Ideas for next steps
Moon / second body with patched conics, RCS and docking, fairings and struts, engine clustering, more planets, career/contracts, 3D rendering.
