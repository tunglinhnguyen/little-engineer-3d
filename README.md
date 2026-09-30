# 🚗 Little Engineer 3D — Car Lab

Little Engineer 3D hiện được **thu gọn về một mục tiêu duy nhất**: trẻ ráp một ô tô điện từ các mô-đun chức năng, kiểm tra đúng chuỗi truyền năng lượng, rồi cho xe chạy trên đường thử 3D.

## Phạm vi hiện tại

Bàn lắp chỉ đưa ra 6 mô-đun theo đúng thứ tự học:

1. Pin
2. Công tắc
3. Mô tơ
4. Hộp số
5. Vi sai
6. Khung xe + 4 bánh

Đường thử được tạo sẵn và khóa vị trí. Trẻ không phải quản lý nhà cửa, tàu, nước, địa hình, blueprint, thành tích hay các công cụ phụ trước khi hiểu được chiếc ô tô hoạt động.

## Chuỗi chức năng

```text
Pin → Công tắc → Mô tơ → Hộp số → Vi sai → Khung xe
 điện                chuyển động quay
```

- Cổng điện chỉ nối với cổng điện.
- Cổng quay chỉ nối với cổng quay.
- Mô tơ chỉ quay khi Công tắc đóng.
- Hộp số giảm tốc và tăng lực kéo.
- Vi sai truyền mô-men tới cụm bánh.
- Xe chỉ chạy khi chuỗi truyền động hoàn chỉnh và ở gần đường thử.

## Tương tác đã tối giản

Khi chọn một mô-đun, chỉ còn các thao tác cần thiết:

- **Gắn**: tự tìm và snap vào khớp phù hợp gần nhất.
- **Xoay**: xoay 90°.
- **Tháo**: ngắt các khớp của riêng mô-đun đó.
- **Xóa**: bỏ mô-đun khỏi xe.
- Riêng **Công tắc** có nút **Bật/Tắt** trực tiếp.

Các nút được thiết kế lớn, ít chữ và phù hợp thao tác cảm ứng trên iPad.

## Chạy local

```bash
npm install
npm run dev
```

Kiểm tra:

```bash
npm run check
npm run build
npm run qa:e2e
```

CI chạy unit tests, build production và 5 browser acceptance tests; các ảnh chụp được lưu trong artifact `car-focus-screenshots`.

## Kiến trúc đang dùng

```text
Car UI
  ├─ ConnectionGraph — typed ports + snap
  ├─ SimulationEngine — power + RPM + torque
  ├─ VehicleRules / WorldRoutes — điều kiện chạy + tuyến đường
  └─ Three.js Workbench — render, drag, camera, animation
```

Mục tiêu tiếp theo chỉ mở rộng khi trải nghiệm ráp và chạy ô tô đã ổn định trên iPad.
