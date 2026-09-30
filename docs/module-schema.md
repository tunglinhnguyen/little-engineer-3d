# Car module schema

Every active car part is a typed module instance.

Example motor definition:

```ts
{
  type: 'motor',
  ports: [
    { id: 'power-in', signal: 'power', direction: 'in', position: [-0.72,0,0], axis: [-1,0,0] },
    { id: 'rotation-out', signal: 'rotation', direction: 'out', position: [0.82,0,0], axis: [1,0,0] }
  ],
  behavior: { kind: 'motor', rpm: 120 }
}
```

## Active connector rules

- Electrical ports connect only to electrical ports.
- Rotation ports connect only to rotation ports.
- Output connects to input.
- Each port can be occupied by only one connection.
- Connections are normalized in energy-flow direction.

## Active modules

```text
battery
switch
motor
gearbox
differential
car-base
road-straight  // fixed test infrastructure
```

The UI intentionally exposes no other module family in the current release.
