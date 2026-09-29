# Research notes

This repository is an original implementation. No source code or model assets were copied from the projects below. They were reviewed only for architectural patterns and product lessons.

## Projects reviewed

### Scraparatus — JonEnstrom/scraparatus
Useful pattern: a builder/simulator split, smart sockets, a part registry, and persistent assemblies. Its scope is a physics game rather than a child-first curriculum.

### GEARS — QuirkyCort/gears
Useful pattern: educational robotics should let learners experiment without owning hardware and should connect simulation to code/robot concepts. GEARS uses a different rendering stack and targets autonomous robotics rather than modular machine construction.

### realvirtual-WEB — game4automation/realvirtual-WEB
Useful pattern: typed snap points, reusable part libraries, signal semantics, and strict separation of editor/rendering from simulation. The community edition is AGPL-3.0; this project does not reuse its code.

### Actuator Explorer — msunbot/actuator-explorer
Useful pattern: procedural Three.js geometry can be effective for teaching the internal structure and motion of motors/gears without shipping manufacturer CAD.

### Sim Studio — WorketeWorks/SimStudio-LEGO-Technic-Physics-Simulator
Useful pattern: connection maps, runtime mechanical links, simplified colliders, and keeping visual geometry separate from physics representation. Its problem is much more CAD/Technic-oriented than Little Engineer 3D.

## Product decision

Little Engineer 3D deliberately starts with a deterministic **functional graph** instead of full rigid-body physics. A six-year-old should be able to understand why a machine works before dealing with unstable joints, friction parameters, or CAD-like constraints.

The progression is:

1. **Snap correctly** — learn compatible interfaces.
2. **Trace energy** — see power become motion/light.
3. **Swap outputs** — discover that one motor can make a fan, drill, or wheel turn.
4. **Add mechanisms** — gears and transmission.
5. **Add physics** — chassis motion, gravity, collision, joints.
6. **Add code** — sensors and Blockly-style robot behavior.

## Clean-room and licensing rule

- Do not copy code from GPL/AGPL/no-license repositories into this MIT project.
- Do not ship branded toy/CAD assets unless redistribution rights are explicit.
- Keep procedural shapes original or use properly licensed GLB assets with attribution.
