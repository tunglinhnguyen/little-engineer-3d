# Module and feature verification

The fleet assembly has 20 module types: car (12 parts), truck (16), and tractor with trailer (20). Automated checks are in `tests/core.test.ts`, `tests/fleet.test.ts` and `tests/e2e/*.spec.ts`. Browser scenarios use actual palette clicks, socket taps and pointer drags; prepared graph fixtures isolate drivetrain, traffic and history scenarios. Fixtures are available only with `?qa=1`.

## Per-module coverage

| Module | Shape / connector checks | Behaviour / browser checks |
|---|---|---|
| Chassis | Bare frame, no hidden wheels; seven slots; native bounds | Selection; full assembly movement; road placement; stop/return |
| Battery | Terminals, dimensions, supply vs return | Correct/wrong drag; closed circuit; current zero when open |
| Switch | Native housing and lever, supply ports | Starts off; deliberate detach; test/run toggle holds position |
| Motor | Rotor axis X; adjacent body clearance | Return required; 120 RPM; visible rotation; switch stops rotor |
| Gearbox | X axes; actual 12/24 teeth | −60 RPM; torque loss; individual mounting/whole-car dragging/deliberate detach |
| Differential | X input/Z output; native clearance | 20 RPM; torque split; inner/outer wheel speeds in a turn |
| Front axle | Real bearing positions and steering knuckles | Passive RPM; individual assembly; steering follows body turn |
| Drive axle | Two Z half-shafts, exact rear mounts | Removal carries wheels; undo/cancel restores group; half-shaft speeds differ in turn |
| Wheel | Z rotor; radius, ground contact, actual tread/spokes | No axle means no mount; four occupied bearings; no slip; inside/outside rolling |
| Straight road | Native width/length, actual endpoints | Pointer snap; connected movement lock; open end stops |
| Curved road | Visible curve and path share centreline/tangents | Pointer snap keeps intended orientation; smooth turn; four-curve loop over multiple laps |
| Intersection | Four endpoints; tangent turn path | Pointer snap; connected straight preferred; side-only route turns continuously |
| Traffic light | Readable bulbs, native bounds | Roadside mounting; red bumper stop; green resumes; live toggle does not reset route |
| STOP | Octagonal face and readable STOP | Roadside movement lock; 1.5 second stop, once per passage; loose sign ignored |
| Speed sign | Round rim and readable 30 | Roadside movement lock; section-relative half speed; loose sign ignored |

The original modules and wide curve have separate browser tests for palette selection, recognisable name, a visible pickable point and absence of automatic attachment. Idler axles, cargo beds, hitches and trailers are exercised through complete touch assembly of the truck and tractor, with core assertions for type-specific mounts and wheel counts. Rendered screenshots are visually inspected in addition to geometry assertions.

## Cross-feature coverage

- Typed mating, direction, occupancy, missing ports and self-link rejection; visible gearbox/final-drive shafts align with connector heights and chassis ports coincide with installed mounts.
- Arbitrary palette order; all 12 parts installed by manual drags; duplicate limits.
- Far drops stay loose. Each of the seven chassis parts attaches at its own slot. Taps select the part; quick and long drags move all 12 parts with their joints preserved. Only the detach button separates it; the part can be mounted again.
- Each of the four wheels moves the whole car when grabbed, detaches independently through its button, frees only its own bearing and can be reattached. Undo/redo restores the exact states. Detached parts rest on the ground without overlapping occupied modules.
- Axle/wheel subassemblies; whole-car transforms; cancellation rolls back all members. Roadside controls stand on the ground, reject invalid poses and move with their road; undo restores both.
- Closed positive/negative circuit; reduction ratios and torque; no RPM on chassis/front axle.
- Test mode spins at rest. Run translates all children together. Stopping commits current positions; return is explicit.
- Tyre circumference speed, rolling angle, Ackermann steering, distinct half-shaft motion, continuous road seams, intersections, loops and open ends.
- Native Chromium touch events: taps and small jitter keep the position; a long drag moves the whole car without detaching; touch cancellation restores all members. Whole-car movement can start on a wheel and repeat immediately without a command. An explicitly detached battery moves independently and can be reassembled.
- Repeated taps do not toggle the switch. Test and run modes hide detach controls and refuse editing. Saved loose parts remain loose on reload. Road movement intent is cleared by cancellation, selection, history and leaving build.
- Save/reload, undo/redo, storing loose parts, clear/undo.
- Layouts 1180×820, 1024×768 and 820×1180; canvas above palette and usable controls.

## Validation environment and limits

The validation suite contains **115 core tests** and **43 Playwright browser scenarios**, plus TypeScript and production build. GitHub Actions repeats all checks before Pages deployment. Module screenshots, feature screenshots and the HTML browser report are retained in the `car-focus-screenshots` workflow artifact for 30 days.

### Six-feature regression coverage

- Three complete vehicles assembled entirely using palette and socket taps, including all 18 independent wheels; creating a fourth vehicle; save/reload and independent circuits.
- World socket touch only commits on release; small jitter is accepted; moving beyond the threshold cancels the tap; undo/redo retains ownership.
- Selecting a hidden differential, explicit detach, undo without changing the active vehicle, rename/color, parking/hiding and reopening; per-vehicle palette limits.
- All three vehicles moving simultaneously; turning off one switch leaves the other drives moving; Stop all freezes every module; reload preserves joints.
- Actual 12/48, 12/24 and 12/12 teeth; RPM/torque consistency; loaded vs empty acceleration; overload and recovery in a lower gear; 10-second measurements agree with fleet travel.
- Following a stationary vehicle and crossing an intersection without body overlap; both crossing vehicles eventually pass.
- Mission destinations must be ahead and reachable; explicit side-branch routing; delivery needs attached cargo carrier, unloads once, and stays completed after reload.
- Trailer mission requires its axles and every wheel; articulated wide-curve travel preserves the hitch pin, independent trailer heading, ground height, road coverage and restored attachments.

The browser tests use Chromium/WebGL with tablet-sized viewports and native synthetic touch events. They do not establish compatibility on physical iPad/Safari. The driving model is deterministic and educational: footprint avoidance and intersection reservations, not dynamic crashes, tyre grip or suspension. Opposing vehicles on a narrow road stop rather than automatically reversing or finding a detour. The 30 sign applies a relative speed reduction, not real-world km/h. Long vehicles use wide curves and only straight movements through small intersections.
