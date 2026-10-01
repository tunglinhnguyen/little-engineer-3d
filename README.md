# Little Engineer 3D — Fleet Lab

Bàn lắp ô tô điện 3D: lấy từng chi tiết, chạm khớp xanh hoặc kéo vào khớp đúng, thử máy tại chỗ, rồi đặt cả xe lên đường để chạy.

Gara **＋ Xe** tạo xe con (12 chi tiết/4 bánh), xe tải (16 chi tiết/6 bánh, có thùng hàng), đầu kéo container (20 chi tiết/8 bánh kể cả rơ-moóc). Không giới hạn cứng ba xe; mỗi xe có linh kiện, màu, tên, công tắc và nhiệm vụ riêng. Cất xe chưa dùng vào gara để giảm tải thiết bị. Có thể chọn chi tiết theo thứ tự bất kỳ; chọn trong khay chỉ lấy ra bàn.

## Sáu nhóm tính năng

1. **Ráp bằng chạm:** lấy linh kiện, chạm khớp xanh trên mô hình hoặc nút vị trí trong bảng. Tự căn đúng hướng; vẫn giữ kéo-thả. Thao tác chỉ hoàn tất khi nhấc tay, rê quá ngưỡng thì hủy chạm khớp.
2. **Nhìn bên trong:** danh sách linh kiện có hình minh họa, camera nhìn gần, các phần che khuất mờ đi. Chọn trực tiếp vi sai/hộp số mà không cần tìm xuyên thùng hàng.
3. **Hướng dẫn:** báo chính xác khớp thiếu, công tắc tắt, chưa lên đường, quá tải hoặc đường quá hẹp. Dây điện thể hiện mạch đi/về; điểm sáng chạy khi mô-tơ được cấp điện.
4. **Gara nhiều xe:** tạo, chọn, đổi tên/màu, cất/đưa ra bàn; lưu tự động và hoàn tác. Công tắc một xe không điều khiển xe khác.
5. **Nhiệm vụ và giao thông:** đến gara, giao hàng, ghép rơ-moóc. Chọn cờ đường làm đích; xe chọn nhánh nối tới đích. Chạy một xe hoặc tất cả xe đủ điều kiện; giữ khoảng cách, nhường ngã tư, dừng tất cả.
6. **Thí nghiệm:** ba số khỏe/cân bằng/nhanh dùng bánh răng 12:48, 12:24, 12:12 thật trên mô hình. Xếp/bớt hàng thay đổi lực cản, gia tốc và tốc độ; quá tải có thể không khởi hành. Bảng đo mô phỏng cùng 10 giây trên đường thẳng không vật cản, dùng cùng công thức với xe chạy.

Xe dài dùng **Cua rộng** (bán kính 8, rộng 4,4); ngã tư nhỏ chỉ đi thẳng. Rơ-moóc xoay quanh chốt mâm kéo, bánh lăn theo đường đi riêng. Đây là đầu kéo giáo dục 4 bánh + rơ-moóc 4 bánh, không phải bản sao một mẫu xe thương mại cụ thể.

- Kéo chi tiết rời gần đúng khớp để lắp. Bánh cần trục và ổ bánh thật; mỗi khớp chỉ chứa một chi tiết.
- Chạm chi tiết đã ráp để chọn. Kéo ở khung, pin, mô-tơ hoặc bánh sẽ **di chuyển cả xe**, giữ nguyên mọi khớp; không cần bật chế độ di chuyển. Muốn tháo riêng, chọn chi tiết rồi bấm **Tháo ra**: chi tiết được đặt xuống chỗ trống trên bàn. Tháo trục giữ hai bánh trên trục; kéo bánh của cụm rời sẽ di chuyển cả cụm. **↶** lắp lại khi tháo nhầm. Chạm hoặc giữ lâu không tự tháo hay bật công tắc.
- Công tắc mặc định tắt. **Thử máy** quay cơ cấu tại chỗ; **Chạy xe** chỉ mở khi đủ chi tiết, có nguồn và xe đặt đúng trên đường.
- Nối hai cực pin qua công tắc và mô tơ thành mạch kín. Tốc độ truyền: mô tơ 120 RPM → hộp số −60 RPM → vi sai/trục sau 20 RPM. Khung và trục trước không nhận RPM truyền động.
- Tốc độ không tải tính từ RPM bánh và chu vi lốp, sau đó áp dụng tải và gia tốc. Bánh trước đánh lái, bánh trong/ngoài quay khác nhau ở đường cong. Xe dừng trước cuối đường, đèn đỏ và STOP; bật xanh tiếp tục từ vị trí đang đứng.
- Đường và biển được kéo lắp riêng. Đường đã nối cần bấm **Di chuyển đoạn đường** trước khi kéo; biển đi cùng đường, xe không bị kéo theo đường. Biển rời không điều khiển xe. Có lưu bàn lắp, hoàn tác/làm lại, camera trên/nghiêng và đưa xe về vị trí xuất phát.

## Chạy và kiểm tra

```bash
npm ci
npm run dev
npm run check
npm run build
npx playwright install chromium
npm run qa:e2e
```

GitHub Actions chạy kiểm tra lõi, build production và kiểm tra trình duyệt trước khi deploy Pages. Ảnh từng module và các luồng lắp/chạy/cảm ứng nằm trong artifact `car-focus-screenshots`.

Xem [kiến trúc](docs/architecture.md), [module và khớp](docs/module-schema.md), [ma trận kiểm tra](docs/qa-report.md).

Đây là mô hình cơ học giáo dục xác định theo khớp và tuyến đường. Xe dùng kiểm tra vùng thân xe để tránh xuyên nhau, không mô phỏng va chạm động lực học, giảm xóc hay lực bám lốp. Xe đối đầu trên một đường hẹp có thể dừng chờ, không tự lùi hoặc tìm đường tránh. Các đại lượng lực/tốc độ/tải dùng đơn vị mô phỏng. Kiểm tra cảm ứng tự động dùng Chromium mô phỏng tablet; cần kiểm tra bổ sung trên thiết bị iPad/Safari thật. Dữ liệu tự lưu trên trình duyệt của máy đang dùng, không đồng bộ giữa thiết bị.
