# Module and feature verification

The revised assembly uses 12 physical car parts and 15 module types. Automated checks are in `tests/core.test.ts` and `tests/e2e/car-focus.spec.ts`. Browser scenarios use actual palette clicks and pointer drags for manual assembly; prepared graph fixtures isolate drivetrain, traffic and history scenarios. Fixtures are available only with `?qa=1`.

## Per-module coverage

| Module | Shape / connector checks | Behaviour / browser checks |
|---|---|---|
| Chassis | Bare frame, no hidden wheels; seven slots; native bounds | Selection; full assembly movement; road placement; stop/return |
| Battery | Terminals, dimensions, supply vs return | Correct/wrong drag; closed circuit; current zero when open |
| Switch | Native housing and lever, supply ports | Starts off; deliberate detach; test/run toggle holds position |
| Motor | Rotor axis X; adjacent body clearance | Return required; 120 RPM; visible rotation; switch stops rotor |
| Gearbox | X axes; actual 12/24 teeth | −60 RPM; torque loss; individual mounting/hold protection |
| Differential | X input/Z output; native clearance | 20 RPM; torque split; inner/outer wheel speeds in a turn |
| Front axle | Real bearing positions and steering knuckles | Passive RPM; individual assembly; steering follows body turn |
| Drive axle | Two Z half-shafts, exact rear mounts | Removal carries wheels; undo/cancel restores group; half-shaft speeds differ in turn |
| Wheel | Z rotor; radius, ground contact, actual tread/spokes | No axle means no mount; four occupied bearings; no slip; inside/outside rolling |
| Straight road | Native width/length, actual endpoints | Pointer snap; connected hold protection; open end stops |
| Curved road | Visible curve and path share centreline/tangents | Pointer snap keeps intended orientation; smooth turn; four-curve loop over multiple laps |
| Intersection | Four endpoints; tangent turn path | Pointer snap; connected straight preferred; side-only route turns continuously |
| Traffic light | Readable bulbs, native bounds | Roadside mounting; red bumper stop; green resumes; live toggle does not reset route |
| STOP | Octagonal face and readable STOP | Roadside hold protection; 1.5 second stop, once per passage; loose sign ignored |
| Speed sign | Round rim and readable 30 | Roadside hold protection; section-relative half speed; loose sign ignored |

Every module has a separate browser test for palette selection, recognisable name, a visible pickable point and absence of automatic attachment, plus a screenshot. Rendered screenshots are visually inspected in addition to geometry assertions.

## Cross-feature coverage

- Typed mating, direction, occupancy, missing ports and self-link rejection; visible gearbox/final-drive shafts align with connector heights and chassis ports coincide with installed mounts.
- Arbitrary palette order; all 12 parts installed by manual drags; duplicate limits.
- Far drops stay loose. Each of the seven chassis parts attaches at its own slot, resists quick swipes, detaches after a hold and can reattach.
- Axle/wheel subassemblies; whole-car transforms; cancellation rolls back all members. Roadside controls stand on the ground, reject invalid poses and move with their road; undo restores both.
- Closed positive/negative circuit; reduction ratios and torque; no RPM on chassis/front axle.
- Test mode spins at rest. Run translates all children together. Stopping commits current positions; return is explicit.
- Tyre circumference speed, rolling angle, Ackermann steering, distinct half-shaft motion, continuous road seams, intersections, loops and open ends.
- Native Chromium touch events: safe tap, hold-drag detach, touch cancellation rollback.
- Save/reload, undo/redo, storing loose parts, clear/undo.
- Layouts 1180×820, 1024×768 and 820×1180; canvas above palette and usable controls.

## Validation environment and limits

Local validation: TypeScript check, **86 core tests**, production build and **32 Playwright browser tests**. GitHub Actions repeats the checks before Pages deployment. Module screenshots, feature screenshots and the HTML browser report are retained in the `car-focus-screenshots` workflow artifact for 30 days.

The browser tests use Chromium/WebGL with tablet-sized viewports and native synthetic touch events. They do not establish compatibility on physical iPad/Safari. The driving model is a deterministic educational mechanism simulation; it does not model rigid-body collision, suspension loads, tyre grip or right-of-way among multiple vehicles. The 30 sign applies a relative speed reduction, not real-world km/h units.
