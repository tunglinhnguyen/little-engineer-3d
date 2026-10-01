# Architecture

`main.ts` manages UI, saved state and history. The workbench renders and translates pointer input; geometry does not decide whether a part is installed.

| Layer | Responsibility |
|---|---|
| `layout.ts`, `moduleRegistry.ts` | Native dimensions, axes, bearings, mounting slots, typed connectors and mechanism ratios |
| `ConnectionGraph` | Module instances, occupied ports, connection validation, serialization |
| `vehicles.ts` | Independent ownership, variant mounting slots, per-vehicle inventory limits and profiles |
| `experiments.ts` | Shared gear/load/acceleration model and deterministic 10-second measurements |
| `missions.ts` | Destination validation, assembly missions and one-time delivery completion |
| `FleetSimulation` | Independent drives, swept footprint checks, intersection reservations, graph pose updates |
| `assembly.ts` | Parent ownership, exact mounting poses, valid nearby previews, group movement and physical connection reconciliation |
| `SimulationEngine` | Closed supply/return circuit, switch state, RPM, torque loss and rear axle torque split |
| `worldRoutes.ts` | Shared road centreline geometry, physically connected seams and directed routes |
| `VehicleDrive` | Tyre circumference speed, route distance, Ackermann steering, differential rolling and roadside controls |
| `moduleFactory.ts` | Native module shapes, visible rotating groups, shaft axes and readable labels |
| `Workbench` | Part selection, assembly dragging, safe staging, road movement intent, cancellation rollback, camera, wires and mechanism animation |

## Assembly

Car forward is +X; wheel bearings are on the Z axis. A chassis owns seven fixed parts; the two axles each own two wheels. An axle can receive wheels before it is mounted. Ownership alone is insufficient: the parent, slot, position and orientation must agree. Moving a parent applies the same transform to its physically mounted descendants.

Palette selection never installs a part. Preview has no side effects. Commit reconciles only valid physical connections. Removing the motor opens both circuit and drivetrain. A battery powers a motor only when the return reaches the same battery. The chassis has no rotational port.

## Driving and controls

Build, test and run are separate modes. Test animates powered mechanisms without translating the car. Run places the rear axle reference on a continuous directed road route; chassis and mounted children share the resulting pose. Wheel angle follows travelled distance, and front steering follows curvature. There is no automatic reversal at an open road end.

Controls are associated with their mounted road section. Red holds before the signal; STOP holds for 1.5 seconds once per passage; the speed sign applies a relative half-speed educational rule in that section. Loose signs have no effect. Intersections prefer a connected straight exit unless a mission chooses another reachable exit. Intersection reservations and padded oriented bounding boxes prevent crossing/following vehicles from intersecting; they are educational coordination, not a full traffic-law model.

Fleet stepping updates graph poses and then the renderer mirrors them. A trailer retains a distinct heading while its pin coincides with the hitch; all trailer descendants move together. Stopping saves current poses. Return to start is explicit and moves the current assembly without reattaching parts detached after driving. A switch change during run updates the circuit without rebuilding the route or resetting distance.

Version 2 persistence stores vehicle profiles, active identity, gear choices, cargo, missions and at most six experiment records per vehicle. Legacy single-car saves migrate to a profile. Ownership filters isolate all physical/electrical reconciliation; a part cannot be committed to another vehicle's socket. Parked vehicles remain saved but are hidden and excluded from driving/collisions.

## Interaction and rendering

A tap selects the actual hit part; movement starts only after a 7-pixel threshold. `movementRoot` follows valid car-part ownership up to the chassis, stopping before a road. Dragging any mounted car part therefore moves the entire car without a separate command. Wheels on a loose axle move that axle group. Gesture duration never detaches a part, and repeated taps never toggle power.

The explicit **Tháo ra** action stages the selected mounted part on the ground in a vacant area, clears only its own parent/slot, preserves its descendants and reconciles physical connections. Staging uses the rendered bounding box of the complete subassembly and excludes occupied boxes with a margin. Detaching a rear axle keeps its two wheels; detaching one wheel frees only its bearing. History stores detach and subsequent movement separately. Reload preserves loose parts. Build is the only editing mode.

Connected roads and mounted roadside controls remain protected. A road movement command carries its attached controls, never a parked car. Drop, cancellation, another selection, history restoration and leaving build clear this road intent. Pointer cancellation, lost capture and window blur restore every dragged member. Orbit controls receive gestures when a part is not being dragged. The canvas occupies the area above the palette; overlays and the palette do not count as usable picking points.

Build mode redraws on changes; test and run redraw continuously. Mesh and line geometry, materials and label textures are disposed on rebuild. Road curve rendering and route sampling share the same mathematical curve.
