# Little Engineer 3D — Car Lab

Bàn lắp ô tô điện 3D: lấy từng chi tiết, kéo vào khớp đúng, thử máy tại chỗ, rồi đặt cả xe lên đường để chạy.

Xe gồm **12 chi tiết**: khung, pin, công tắc, mô tơ, hộp số, vi sai, trục trước, trục sau và bốn bánh. Khay đường có đường thẳng, đường cong, ngã tư, đèn giao thông, biển STOP và biển 30. Có thể chọn chi tiết theo thứ tự bất kỳ; chọn trong khay chỉ lấy ra bàn.

- Kéo chi tiết rời gần đúng khớp để lắp. Bánh cần trục và ổ bánh thật; mỗi khớp chỉ chứa một chi tiết.
- Giữ 0,5 giây rồi kéo để tháo chi tiết đã lắp. Kéo khung mang cả xe; kéo trục mang theo bánh. Chạm ngắn không tháo.
- Công tắc mặc định tắt. **Thử máy** quay cơ cấu tại chỗ; **Chạy xe** chỉ mở khi đủ chi tiết, có nguồn và xe đặt đúng trên đường.
- Nối hai cực pin qua công tắc và mô tơ thành mạch kín. Tốc độ truyền: mô tơ 120 RPM → hộp số −60 RPM → vi sai/trục sau 20 RPM. Khung và trục trước không nhận RPM truyền động.
- Tốc độ xe tính từ RPM bánh và chu vi lốp. Bánh trước đánh lái, bánh trong/ngoài quay khác nhau ở đường cong. Xe dừng trước cuối đường, đèn đỏ và STOP; bật xanh tiếp tục từ vị trí đang đứng.
- Đường và biển được kéo lắp riêng. Biển rời không điều khiển xe. Có lưu bàn lắp, hoàn tác/làm lại, camera trên/nghiêng và đưa xe về vị trí xuất phát.

## Chạy và kiểm tra

```bash
npm ci
npm run dev
npm run check
npm run build
npm run qa:e2e
```

GitHub Actions chạy kiểm tra lõi, build production và kiểm tra trình duyệt trước khi deploy Pages. Ảnh từng module và các luồng lắp/chạy/cảm ứng nằm trong artifact `car-focus-screenshots`.

Xem [kiến trúc](docs/architecture.md), [module và khớp](docs/module-schema.md), [ma trận kiểm tra](docs/qa-report.md).

Đây là mô hình cơ học giáo dục xác định theo khớp và tuyến đường, chưa phải mô phỏng vật lý vật rắn, va chạm hay lực bám lốp. Kiểm tra cảm ứng tự động dùng Chromium mô phỏng tablet; cần kiểm tra bổ sung trên thiết bị iPad thật.
