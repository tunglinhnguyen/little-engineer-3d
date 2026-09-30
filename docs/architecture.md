# Architecture

`main.ts` manages UI, saved state and history. The workbench renders and translates pointer input; geometry does not decide whether a part is installed.

| Layer | Responsibility |
|---|---|
| `layout.ts`, `moduleRegistry.ts` | Native dimensions, axes, bearings, mounting slots, typed connectors and mechanism ratios |
| `ConnectionGraph` | Module instances, occupied ports, connection validation, serialization |
| `assembly.ts` | Parent ownership, exact mounting poses, valid nearby previews, group movement and physical connection reconciliation |
| `SimulationEngine` | Closed supply/return circuit, switch state, RPM, torque loss and rear axle torque split |
| `worldRoutes.ts` | Shared road centreline geometry, physically connected seams and directed routes |
| `VehicleDrive` | Tyre circumference speed, route distance, Ackermann steering, differential rolling and roadside controls |
| `moduleFactory.ts` | Native module shapes, visible rotating groups, shaft axes and readable labels |
| `Workbench` | Selection, protected hold-drag, cancellation rollback, camera, wires and mechanism animation |

## Assembly

Car forward is +X; wheel bearings are on the Z axis. A chassis owns seven fixed parts; the two axles each own two wheels. An axle can receive wheels before it is mounted. Ownership alone is insufficient: the parent, slot, position and orientation must agree. Moving a parent applies the same transform to its physically mounted descendants.

Palette selection never installs a part. Preview has no side effects. Commit reconciles only valid physical connections. Removing the motor opens both circuit and drivetrain. A battery powers a motor only when the return reaches the same battery. The chassis has no rotational port.

## Driving and controls

Build, test and run are separate modes. Test animates powered mechanisms without translating the car. Run places the rear axle reference on a continuous directed road route; chassis and mounted children share the resulting pose. Wheel angle follows travelled distance, and front steering follows curvature. There is no automatic reversal at an open road end.

Controls are associated with their mounted road section. Red holds before the signal; STOP holds for 1.5 seconds once per passage; the speed sign applies a relative half-speed educational rule in that section. Loose signs have no effect. This is not a simulation of legal speed units or traffic priorities at an intersection. Intersections prefer a connected straight exit, otherwise a connected turn.

Stopping commits the currently rendered car and its children back into graph state. Return to start is an explicit action. A switch change during run updates the circuit without rebuilding the route or resetting distance.

## Interaction and rendering

Installed parts and connected roads require a 500 ms stationary hold before dragging. Quick swipes cannot detach them. Pointer cancellation, lost capture and window blur restore the whole dragged group. Orbit controls receive gestures when a part is not being dragged. The canvas occupies the area above the palette; overlays and the palette do not count as usable picking points.

Build mode redraws on changes; test and run redraw continuously. Mesh and line geometry, materials and label textures are disposed on rebuild. Road curve rendering and route sampling share the same mathematical curve.
