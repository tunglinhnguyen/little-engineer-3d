# Module and mounting contract

Instances contain `id`, `type`, world `position`, `rotationY`, optional `parentId`, `slotKey` and `switchOn`. Graph persistence preserves zero height and physical ownership. Port compatibility requires equal signal, matching mechanical/electrical `mate`, complementary direction and free occupancy.

| Module | Physical placement | Functional contract |
|---|---|---|
| Chassis | Ground or road centreline | Seven mounting points; owns the assembly; no RPM |
| Battery | Chassis battery slot | Positive supply and negative return; closed circuit required |
| Switch | Chassis switch slot | Breaks/closes supply; starts off |
| Motor | Chassis motor slot | Closed powered circuit produces 120 RPM; rotor axis X |
| Gearbox | Chassis gearbox slot | 12/24 teeth, ratio −1/2; gears and shafts axis X |
| Differential | Chassis differential slot | Final reduction −1/3, split output torque; input X/output Z |
| Front axle | Chassis front bearing | Passive beam and steering knuckles; no driven RPM |
| Drive axle | Chassis rear bearing | Two Z half-shafts; drives rear wheels |
| Wheel ×4 | Free bearing on either axle | Rotor axis Z; radius 0.33; no attachment without actual axle |
| Straight road | Opposing endpoint of a road | Length 4.8, width 3.3 |
| Curved road | Opposing endpoint of a road | Quarter circle, radius 4.8; shared visible/driving path |
| Intersection | Opposing endpoint of a road | Four approaches; straight preferred when connected |
| Traffic light | Free roadside slot | Red stops; green resumes; switchable during run |
| STOP sign | Free roadside slot | Readable STOP; 1.5-second stop per passage |
| Speed sign | Free roadside slot | Readable 30; half base speed within associated section |

Structural chassis, bearing and road connectors cannot substitute for one another. Supply and return cannot substitute for one another. Each bearing holds one wheel. A wheel remains attached to its axle when that axle is taken off the chassis. Single-instance car parts and the four-wheel limit are enforced by the palette.

Placement tolerances are explicit: part snap distance 0.38, roadside control 0.55, chassis-to-road 0.52. Attachment validation is stricter than preview proximity. Road connections also require coincident endpoints and opposite outward axes before route traversal.
