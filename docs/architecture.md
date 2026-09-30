# Architecture — Focused Car Lab

The active product has one learning loop: assemble a functional electric car and run it on a fixed test road.

## Runtime layers

```text
Car UI
  │
  ├── ConnectionGraph
  │     typed ports, smart snap, detach
  │
  ├── SimulationEngine
  │     power → motor RPM → transmission RPM/torque
  │
  ├── VehicleRules / WorldRoutes
  │     road proximity + drivable route
  │
  └── Three.js Workbench
        render, drag, selection, camera, vehicle animation
```

## Active car chain

```text
battery → switch → motor → gearbox → differential → car-base
```

Only this chain is exposed in the current UI. The road is infrastructure, created automatically and locked against accidental dragging.

## Interaction policy

- One tap on a palette card adds that module.
- The next module auto-attaches to the previous valid module.
- Drag remains available for correction and exploration.
- Selected modules expose only attach, rotate, detach, delete; the switch also exposes on/off.
- Run is disabled until the entire drivetrain is valid and the car can use the nearby road.

## Performance policy

Deterministic graph simulation is kept separate from rendering. Full rigid-body physics is not required for this release. The priority is reliable touch interaction and stable animation on iPad.
