# Little Engineer 3D — 30-feature QA matrix

This document maps the 30-point engineering roadmap to automated browser acceptance tests.
Every row has a Playwright scenario and a PNG evidence file generated in `test-results/qa/`.

| # | Area | Acceptance criteria | Browser test | Evidence |
|---:|---|---|---|---|
| 01 | Smart assembly | Compatible ports auto-align/rotate and make the typed connection | Smart snap and typed coupling | 01-smart-snap.png |
| 02 | Drivetrain | 12T→24T reverses direction, halves RPM and increases torque | Drivetrain RPM direction torque | 02-drivetrain.png |
| 03 | Complete car | Powered drivetrain reaches car; nearby road enables actual rendered movement | Complete electric car runs | 03-car-running.png |
| 04 | Road network | Straight/curve/intersection form a continuous route | Road network curves and intersections | 04-road-network.png |
| 05 | Railway | Powered train uses rail route with wagon/station infrastructure | Railway train wagon station | 05-railway.png |
| 06 | Collision | Overlapping solid modules are detected; invalid placement can be rejected | Collision-safe placement model | 06-collision.png |
| 07 | Electrical model | Loads receive voltage/current from source through a closed circuit | Electrical voltage current model | 07-electrical.png |
| 08 | Fluid model | Pump requires both drive and inlet water; flow/pressure reach outlet | Fluid flow pressure pump prerequisites | 08-fluid.png |
| 09 | Energy view | Active power/rotation/fluid paths can be visualized | Visual energy flow | 09-energy-flow.png |
| 10 | Engineer inspector | Live V/A/RPM/Nm/L-min/bar plus faults are visible | Engineer inspector metrics and faults | 10-engineer-inspector.png |
| 11 | iPad camera | Presets, focus, lock and follow controls remain available | iPad camera presets lock and focus | 11-camera.png |
| 12 | Performance | Low-cost iPad mode reduces rendering load/pixel ratio | Adaptive iPad performance mode | 12-performance.png |
| 13 | Multi-project storage | Named project slot persists with metadata/thumbnail | Multi-slot projects with thumbnail | 13-project-slots.png |
| 14 | Undo/Redo | Full graph state can be undone and restored | Undo redo build history | 14-undo-redo.png |
| 15 | Flexible missions | Equivalent engineering solution is accepted | Missions accept alternative engineering solutions | 15-multiple-solutions.png |
| 16 | Interactive tutorial | Tutorial progresses from live graph predicates | Interactive tutorial step tracking | 16-tutorial.png |
| 17 | Sandbox | Mission constraints can be hidden for free building | Free sandbox mode | 17-sandbox.png |
| 18 | Architecture | Multiple vertical levels can be arranged in one building | True multi-storey architecture | 18-architecture.png |
| 19 | Terrain | Land/water/hills/mountains/vegetation/caves can coexist | Terrain world building | 19-terrain.png |
| 20 | Machine animation | Powered conveyor/piston receive RPM and animate mechanisms | Real machine animations | 20-machine-animation.png |
| 21 | Audio | Audio control unlocks by user gesture and follows machine state | Machine audio control | 21-audio.png |
| 22 | Visual effects | Firetruck drive + siren + pressurized water can run together | Functional visual effects firetruck water siren | 22-effects.png |
| 23 | Exploded view | Selected module can be separated into visible components | Exploded construction view | 23-exploded.png |
| 24 | X-ray | Selected object can become translucent to inspect internals | Xray internal mechanism view | 24-xray.png |
| 25 | Blueprints | Reusable engineering template creates a complete editable assembly | Engineering blueprints | 25-blueprint.png |
| 26 | Module creator | Child can choose name, signal type, shape, color, dimensions | Child module creator | 26-module-creator.png |
| 27 | Achievements | Real build conditions unlock competency badges | Achievements unlock from real builds | 27-achievements.png |
| 28 | Learning portfolio | Mission/build/achievement progress is represented in the profile | Learning portfolio records missions and builds | 28-learning-portfolio.png |
| 29 | Deep QA | App exposes module/mission/tutorial/blueprint counts and automated audit | Automated audit coverage | 29-automated-audit.png |
| 30 | Graphics/environment | Night + rain + lighting render together on the world scene | Graphics night rain lighting | 30-graphics-night-rain.png |

## Gate

A release is considered QA-passed only when all of the following succeed in one GitHub Actions run:

1. TypeScript compile/check.
2. Vitest unit/regression suite.
3. Vite production build.
4. Playwright 30-scenario browser suite.
5. The `qa-30-screenshots` artifact is uploaded.
6. GitHub Pages deployment completes successfully.

The screenshots are acceptance evidence, not a substitute for physical iPad testing. Real-device touch, Safari/PWA lifecycle, speaker volume and sustained frame rate should still be spot-checked on the target iPad.
