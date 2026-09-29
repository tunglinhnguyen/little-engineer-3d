# Architecture

## 1. Design goals

1. **Child-first**: thao tác ít bước, phản hồi ngay, tránh giao diện CAD.
2. **Causal simulation**: trẻ phải thấy được “điện vào đâu, chuyển động ra đâu”.
3. **Typed assembly**: connector không chỉ là tọa độ snap mà còn mang ngữ nghĩa.
4. **Deterministic first**: các bài học điện/cơ bản chạy bằng graph simulation trước; physics đầy đủ chỉ dùng khi thật sự cần.
5. **Extensible modules**: thêm module mới không làm thay đổi engine lõi.

## 2. Layers

### Module Registry
Nguồn chân lý cho type, tên, mô tả, kích thước, ports và behavior.

### Three.js Workbench
Render, camera, selection, drag, rotation, snap feedback và animation. Không quyết định dòng điện hay tốc độ truyền.

### Connection Graph
Lưu module instances và edges. Edge được chuẩn hóa theo hướng `out -> in`.

### Simulation Engine
Chạy hai propagation passes:
- Power pass từ source qua switch.
- Rotation pass từ motor đã có điện qua shaft/gear tới output.

### Mission Engine
Đối chiếu topology của graph với chuỗi module yêu cầu. Bài học không phụ thuộc vào vị trí tuyệt đối.

## 3. Why not full physics in v1?

Một simulator giáo dục cho trẻ cần snap ổn định và kết quả dễ hiểu hơn là mọi va chạm đều vật lý chính xác. Full rigid-body physics sớm sẽ tạo jitter, joint instability và tăng tải trên iPad. Vì vậy v1 dùng deterministic simulation graph. Rapier được dành cho các bài cần trọng lực, xe chạy, cần cẩu, khớp động hoặc va chạm.

## 4. Future physics boundary

Khi bổ sung Rapier, giữ boundary:

```text
Module Graph / Mission State
          │
          ▼
Physics Adapter
          │
          ▼
Rapier World  ── transform snapshots ──> Three.js
```

Engine bài học không nên phụ thuộc trực tiếp vào object Rapier.
