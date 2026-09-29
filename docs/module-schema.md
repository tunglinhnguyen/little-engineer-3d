# Module schema

Ví dụ một mô tơ:

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

## Connector invariants

- Hai port chỉ snap nếu `signal` giống nhau.
- `out` chỉ nối `in`; `bi` có thể nối cả hai.
- Một port chỉ có một connection trong MVP.
- Connection được lưu theo hướng dữ liệu/năng lượng, không theo thứ tự người dùng kéo.

## Signal types

- `power`: điện năng.
- `rotation`: tốc độ quay (RPM).
- `structural`: dự kiến cho khung/pin ở giai đoạn physics.

## Adding a module

1. Thêm `ModuleType`.
2. Thêm definition trong `moduleRegistry.ts`.
3. Thêm procedural mesh hoặc GLB loader trong `moduleFactory.ts`.
4. Nếu behavior mới, bổ sung propagation rule trong `simulation.ts`.
5. Thêm unit test và ít nhất một mission hoặc sandbox use case.
