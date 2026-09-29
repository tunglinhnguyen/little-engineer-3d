# ⚙️ Little Engineer 3D

**Little Engineer 3D** là phòng thí nghiệm STEAM 3D chạy trực tiếp trong trình duyệt. Trẻ chọn linh kiện, kéo để ráp vào nhau bằng các cổng có kiểu, rồi bấm **Chạy** để quan sát điện năng và chuyển động truyền qua hệ thống.

> Mục tiêu của dự án là dạy quan hệ **nguyên nhân → kết quả** trong cơ khí, điện và robot bằng thao tác lắp ráp trực quan, không biến trải nghiệm thành phần mềm CAD phức tạp.

## MVP hiện tại

- Three.js 3D workbench tối ưu cho desktop và iPad/iPhone.
- 12 mô-đun procedural: Pin, Công tắc, Mô tơ, Trục, 2 bánh răng, Bánh xe, Cánh quạt, Đầu khoan, Đèn, Cảm biến, Khung máy.
- **Typed ports**: điện và chuyển động quay không thể nối nhầm loại.
- Kéo/thả và tự **snap** khi hai cổng tương thích ở gần nhau.
- Đồ thị kết nối độc lập với phần render 3D.
- Simulation engine truyền:
  - `power`: Pin → Công tắc → tải điện / Mô tơ.
  - `rotation`: Mô tơ → Trục / Bánh răng → đầu ra.
- Hoạt ảnh thời gian thực cho mô tơ, trục, bánh răng, quạt, bánh xe, đầu khoan và đèn.
- 4 nhiệm vụ STEAM: mạch đèn, quạt mini, máy khoan, hộp số.
- Hướng dẫn giọng nói tiếng Việt bằng Web Speech API.
- Lưu tự động dự án bằng `localStorage`.
- 3 góc camera cố định.
- Unit tests cho connector rules và simulation graph.
- GitHub Pages workflow.

## Chạy local

```bash
npm install
npm run dev
```

Kiểm tra chất lượng:

```bash
npm run check
npm run build
```

## Kiến trúc

```text
UI / Missions
   │
   ├── Module Registry ── định nghĩa hình học logic, cổng, behavior
   │
   ├── Snap / Connection Graph ── ai nối với ai
   │
   ├── Simulation Engine ── truyền power / rotation
   │
   └── Three.js Workbench ── render, camera, pointer, animation
```

Render 3D và simulation graph được tách rời. Vì vậy sau này có thể thêm Rapier cho trọng lực/va chạm/khớp mà không phải viết lại logic bài học.

## Nguyên tắc module

Mỗi module có:

- `ports`: loại tín hiệu, hướng vào/ra, vị trí và trục snap.
- `behavior`: source, switch, motor, gear, pass-through hoặc output.
- `science`: câu giải thích ngắn để trẻ hiểu hiện tượng.
- procedural Three.js model hoặc GLB model trong tương lai.

Xem [docs/module-schema.md](docs/module-schema.md).

## Roadmap

Xem [ROADMAP.md](ROADMAP.md). Hướng phát triển chính: physics selective bằng Rapier, dây điện linh hoạt, 2 mô tơ + chassis thành xe robot, sensor/controller, Blockly và thư viện bài học theo độ tuổi.

## License

MIT. Các thương hiệu và bộ đồ chơi bên thứ ba không liên quan tới dự án này.
