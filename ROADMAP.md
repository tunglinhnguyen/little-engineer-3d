# Roadmap — Car Lab only

## Current release — Make one car work

- [x] 6-module car palette only.
- [x] Typed electrical and rotational connectors.
- [x] Smart snap and auto alignment.
- [x] Direct module actions: attach, rotate, detach, delete.
- [x] Direct switch on/off control.
- [x] Battery → switch → motor → gearbox → differential → car simulation.
- [x] Fixed road test track.
- [x] Car moves only when drivetrain and road conditions are valid.
- [x] Undo/redo and clean reset.
- [x] iPad-sized touch controls.
- [x] Focused unit tests and browser screenshot QA.

## Next optimization gate

Do not add a new domain until these are verified on the target iPad:

- Drag/snap feels reliable with a finger.
- All action buttons are reachable in landscape and portrait.
- No accidental detach while tapping.
- Car starts/stops immediately with the switch.
- Camera remains easy to recover with “Toàn xe”.
- Sustained animation is smooth for several minutes.
- PWA refresh always loads the newest build.

## After the car lab is stable

Only then consider one extension at a time, starting with a second car lesson such as gear ratio or steering. No broad world-building feature set is part of the current scope.
