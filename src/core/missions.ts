import { ConnectionGraph } from './connectionGraph';
import { MODULES } from './moduleRegistry';
import { vehicleCanTravel } from './vehicleRules';
import type { Mission, ModuleType, SimulationState } from './types';

function pathsFor(mission: Mission): ModuleType[][] {
  return [mission.requiredPath, ...(mission.requiredPaths ?? [])];
}

export function getMissionFeedback(graph: ConnectionGraph, mission: Mission, state: SimulationState, running: boolean) {
  const paths = pathsFor(mission);
  const first = paths[0];

  if (!graph.modules.size) {
    return { status: 'incomplete', message: 'Chọn ' + MODULES[first[0]].name + ' ở kho để bắt đầu.' };
  }

  for (const required of paths) {
    if (graph.findPathByTypes(required)) continue;

    const missing = required.filter(type => ![...graph.modules.values()].some(m => m.type === type));
    if (missing.length) {
      return { status: 'incomplete', message: 'Cần thêm: ' + [...new Set(missing)].map(type => MODULES[type].name).join(', ') + '.' };
    }

    for (let i = 0; i < required.length - 1; i++) {
      if (!graph.findPathByTypes(required.slice(0, i + 2))) {
        return {
          status: 'incomplete',
          message: 'Chưa nối đủ: ' + MODULES[required[i]].name + ' → ' + MODULES[required[i + 1]].name + '. Kéo đúng hai cổng cùng màu lại gần nhau.',
        };
      }
    }
  }

  const missingRequiredModules = (mission.requiredModules ?? []).filter(type =>
    ![...graph.modules.values()].some(m => m.type === type)
  );
  if (missingRequiredModules.length) {
    return {
      status: 'incomplete',
      message: 'Cần thêm: ' + missingRequiredModules.map(type => MODULES[type].name).join(', ') + '.',
    };
  }

  if (mission.buildOnly) {
    return {
      status: 'complete',
      message: '🏗️ ' + mission.success,
    };
  }

  const controlsOn = paths.every(required =>
    graph.findPathByTypes(required, path =>
      path.every(m => (m.type !== 'switch' && m.type !== 'valve') || m.switchOn !== false)
    )
  );
  if (!controlsOn) {
    return {
      status: 'switch-off',
      message: 'Có công tắc hoặc van đang đóng. Chạm 2 lần trực tiếp vào bộ phận đó để bật/mở.',
    };
  }

  const allPathsActive = paths.every(required =>
    graph.findPathByTypes(required, path => path.every(m => state.active.has(m.id)))
  );

  if (!allPathsActive) {
    if (mission.id === 'pump') {
      return {
        status: 'inactive',
        message: 'Bơm chưa có đủ điều kiện: cần mô tơ quay đúng bơm VÀ nước phải đi từ Bình nước → Ống → Bơm → Vòi phun.',
      };
    }
    return {
      status: 'inactive',
      message: 'Chuỗi đã nối nhưng máy chưa hoạt động. Kiểm tra nguồn, chiều truyền động và các cổng nối.',
    };
  }

  const terminalType = mission.requiredPath[mission.requiredPath.length - 1];
  if (MODULES[terminalType]?.behavior.kind === 'vehicle') {
    const vehicles = [...graph.modules.values()].filter(m => m.type === terminalType);
    const runningVehicle = vehicles.find(v => vehicleCanTravel(graph, v.id, state.rpm).ready);
    if (!runningVehicle) {
      const candidate = vehicles.find(v => state.rpm.has(v.id)) ?? vehicles[0];
      const reason = candidate
        ? vehicleCanTravel(graph, candidate.id, state.rpm).message
        : 'Chưa có phương tiện đúng loại.';
      return {
        status: 'inactive',
        message: 'Phương tiện chưa thể chạy: ' + reason,
      };
    }
  }

  return running
    ? { status: 'complete', message: '🎉 ' + mission.success }
    : { status: 'ready', message: '✅ Ráp đúng rồi! Bấm ▶ Chạy để xem máy hoạt động và nghe âm thanh.' };
}

export const MISSIONS: Mission[] = [
  {
    id: 'light', title: 'Thắp sáng phòng lab', emoji: '💡',
    description: 'Ráp Pin → Công tắc → Đèn rồi bật công tắc.',
    lesson: 'Dòng điện chỉ chạy khi mạch được nối đúng và công tắc đóng.',
    requiredPath: ['battery', 'switch', 'lamp'],
    success: 'Đèn đã sáng. Điện đi từ pin qua công tắc tới bóng đèn.',
  },
  {
    id: 'fan', title: 'Chế tạo quạt mini', emoji: '🌀',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Cánh quạt.',
    lesson: 'Mô tơ đổi điện năng thành chuyển động quay, trục truyền mô-men tới cánh quạt.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'fan'],
    success: 'Quạt đang quay quanh đúng trục và tạo tiếng gió.',
  },
  {
    id: 'drill', title: 'Chế tạo máy khoan', emoji: '🛠️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Mũi khoan.',
    lesson: 'Mũi khoan phải quay quanh trục dọc của chính nó để tạo tác dụng cắt.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'drill'],
    success: 'Mũi khoan đang xoay đúng trục và phát âm thanh máy khoan.',
  },
  {
    id: 'gear', title: 'Khám phá bánh răng', emoji: '⚙️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Bánh răng 12T → Bánh răng 24T → Bánh xe.',
    lesson: '12T truyền sang 24T làm bánh lớn quay ngược chiều và bằng nửa tốc độ.',
    requiredPath: ['battery', 'switch', 'motor', 'gear-small', 'gear-large', 'wheel'],
    success: 'Bộ bánh răng hoạt động đúng tỉ số 12:24.',
  },
  {
    id: 'belt', title: 'Bộ truyền đai', emoji: '⛓️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Bộ truyền đai → Bánh xe.',
    lesson: 'Truyền đai giữ cùng chiều quay và có thể thay đổi tốc độ bằng kích thước puly.',
    requiredPath: ['battery', 'switch', 'motor', 'belt-drive', 'wheel'],
    success: 'Bộ truyền đai đã giảm tốc và truyền chuyển động tới bánh xe.',
  },
  {
    id: 'piston', title: 'Máy pít-tông', emoji: '↔️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Cam lệch tâm → Pít-tông.',
    lesson: 'Cam biến chuyển động quay thành chuyển động tịnh tiến qua lại.',
    requiredPath: ['battery', 'switch', 'motor', 'cam', 'piston'],
    success: 'Pít-tông đang chuyển động qua lại theo vòng quay của cam.',
  },
  {
    id: 'conveyor', title: 'Băng tải mini', emoji: '➿',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Băng tải.',
    lesson: 'Con lăn quay kéo mặt băng chuyển động theo một chiều.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'conveyor'],
    success: 'Các thanh băng tải đang chạy và mô tơ phát âm đúng trạng thái.',
  },
  {
    id: 'winch', title: 'Tời kéo', emoji: '🧵',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Tời cuốn.',
    lesson: 'Tang cuốn biến mô-men quay thành lực kéo trên dây.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'winch'],
    success: 'Tang tời đang quay để cuốn dây.',
  },
  {
    id: 'solar-led', title: 'Đèn năng lượng mặt trời', emoji: '☀️',
    description: 'Ráp Pin mặt trời → Công tắc → Đèn LED.',
    lesson: 'Năng lượng ánh sáng được biến thành điện rồi thành ánh sáng ở LED.',
    requiredPath: ['solar', 'switch', 'led'],
    success: 'Đèn LED đã sáng bằng nguồn pin mặt trời.',
  },
  {
    id: 'propeller', title: 'Động cơ chân vịt', emoji: '✣',
    description: 'Ráp Pin → Công tắc → Mô tơ → Trục → Chân vịt.',
    lesson: 'Chân vịt quay quanh trục để tạo lực đẩy.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'propeller'],
    success: 'Chân vịt đang quay và tạo hiệu ứng âm thanh dòng khí.',
  },
  {
    id: 'pump', title: 'Hệ thống bơm nước', emoji: '💧',
    description: 'Cơ: Pin → Công tắc → Mô tơ → Trục → Bơm. Nước: Bình nước → Ống → Bơm → Vòi phun.',
    lesson: 'Bơm không tự tạo ra nước: nó cần đồng thời nguồn cơ học và nguồn nước ở cửa hút.',
    requiredPath: ['battery', 'switch', 'motor', 'shaft', 'pump'],
    requiredPaths: [['water-tank', 'pipe', 'pump', 'nozzle']],
    success: 'Đúng rồi! Bơm có cả mô-men và nước, vòi đang phun nước.',
  },
  {
    id: 'buzzer', title: 'Chuông báo điện', emoji: '🔔',
    description: 'Ráp Pin → Công tắc → Còi điện.',
    lesson: 'Dòng điện làm phần tử trong còi rung và phát âm.',
    requiredPath: ['battery', 'switch', 'buzzer'],
    success: 'Còi điện đang phát tiếng báo.',
  },
  {
    id: 'car', title: 'Lắp ô tô điện', emoji: '🚗',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Vi sai → Khung ô tô. Đặt thêm một đoạn đường.',
    lesson: 'Hộp số đổi tốc độ, vi sai truyền mô-men tới bánh và giúp xe vào cua.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'differential', 'car-base'],
    requiredModules: ['road-straight'],
    success: 'Ô tô đã nhận truyền động; bốn bánh quay và có hiệu ứng xe chạy.',
  },
  {
    id: 'motorcycle', title: 'Lắp xe máy điện', emoji: '🏍️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Khung xe máy. Đặt đường để tạo đường chạy.',
    lesson: 'Xe hai bánh cần mô-men tới bánh chủ động và hai bánh thẳng hàng.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'motorcycle-base'],
    requiredModules: ['road-straight'],
    success: 'Xe máy đã hoạt động; bánh quay và động cơ phát âm thanh.',
  },
  {
    id: 'train', title: 'Đầu tàu chạy trên ray', emoji: '🚂',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Đầu tàu điện. Đặt Ray thẳng, có thể ghép thêm Toa tàu.',
    lesson: 'Ray dẫn hướng bánh tàu; đầu tàu cung cấp lực kéo cho cả đoàn.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'train-engine'],
    requiredModules: ['rail-straight'],
    success: 'Đầu tàu đã hoạt động trên hệ ray mô phỏng.',
  },
  {
    id: 'house', title: 'Xây ngôi nhà', emoji: '🏠',
    description: 'Dùng Nền nhà, Tường, Tường cửa đi, Tường cửa sổ và Mái nhà để tạo một ngôi nhà.',
    lesson: 'Một công trình có nền chịu tải, tường bao che và mái che nắng mưa.',
    requiredPath: ['foundation'],
    requiredModules: ['wall', 'door-wall', 'window-wall', 'roof'],
    buildOnly: true,
    success: 'Con đã có đủ các bộ phận chính để xây một ngôi nhà.',
  },
  {
    id: 'landscape', title: 'Tạo thế giới thiên nhiên', emoji: '🌍',
    description: 'Ghép Thảm cỏ, Hồ nước hoặc Sông, thêm Cây, Đồi/Núi và Mây.',
    lesson: 'Địa hình, nước và thực vật kết hợp thành một cảnh quan có cấu trúc.',
    requiredPath: ['grass-tile'],
    requiredModules: ['water-tile', 'tree', 'hill', 'cloud'],
    buildOnly: true,
    success: 'Một cảnh quan nhỏ đã hình thành. Con có thể tiếp tục mở rộng sông, núi, đường và nhà.',
  },
  {
    id: 'bridge-world', title: 'Xây cầu qua sông', emoji: '🌉',
    description: 'Đặt Đoạn sông, Cầu và nối Đường thẳng hai phía.',
    lesson: 'Cầu cho tuyến giao thông vượt chướng ngại như sông hoặc thung lũng.',
    requiredPath: ['river-tile'],
    requiredModules: ['bridge', 'road-straight'],
    buildOnly: true,
    success: 'Con đã có đủ mô-đun để tạo một tuyến đường vượt sông.',
  },
  {
    id: 'airplane', title: 'Lắp máy bay cánh quạt', emoji: '✈️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Máy bay và đặt một Đường băng.',
    lesson: 'Mô tơ quay cánh quạt tạo lực đẩy; khi chạy đủ nhanh, cánh máy bay tạo lực nâng.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'airplane'],
    requiredModules: ['runway'],
    success: 'Máy bay đã quay cánh quạt, chạy đà và nâng khỏi đường băng trong mô phỏng.',
  },
  {
    id: 'helicopter', title: 'Lắp trực thăng', emoji: '🚁',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Trực thăng và đặt Bãi đáp.',
    lesson: 'Rô-to chính tạo lực nâng còn rô-to đuôi cân bằng mô-men quay.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'helicopter'],
    requiredModules: ['helipad'],
    success: 'Trực thăng đã quay rô-to chính, rô-to đuôi và bay lên khỏi bãi đáp.',
  },
  {
    id: 'boat', title: 'Lắp tàu thủy', emoji: '🚤',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Tàu thủy. Đặt Biển hoặc Hồ để tàu chạy.',
    lesson: 'Chân vịt đẩy nước về sau để tàu nhận phản lực tiến về trước.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'boat'],
    requiredModules: ['sea-tile'],
    success: 'Tàu đang chạy trên mặt nước, chân vịt quay và để lại vệt nước phía sau.',
  },
  {
    id: 'crane', title: 'Xe cần cẩu', emoji: '🏗️',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Cần cẩu.',
    lesson: 'Động cơ làm việc qua hộp số để quay tời, nâng hạ móc và điều khiển cần.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'crane'],
    success: 'Cần cẩu đang hoạt động: bánh quay, cần nâng và móc tải chuyển động.',
  },
  {
    id: 'excavator', title: 'Máy xúc công trình', emoji: '🚜',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Máy xúc.',
    lesson: 'Cần, tay gầu và gầu phối hợp như các tay đòn để đào và nâng đất.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'excavator'],
    success: 'Máy xúc đang chạy cơ cấu cần, tay gầu và gầu xúc.',
  },
  {
    id: 'bulldozer', title: 'Máy ủi san đất', emoji: '🚜',
    description: 'Ráp Pin → Công tắc → Mô tơ → Hộp số → Máy ủi.',
    lesson: 'Xích tạo lực bám lớn; lưỡi ủi truyền lực kéo vào đất để san phẳng.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'bulldozer'],
    success: 'Máy ủi đang chuyển động và lưỡi ủi có hiệu ứng làm việc.',
  },
  {
    id: 'firetruck', title: 'Xe cứu hỏa phun nước', emoji: '🚒',
    description: 'Cơ: Pin → Công tắc → Mô tơ → Hộp số → Xe cứu hỏa. Nước: Trụ cứu hỏa → Xe cứu hỏa → Vòi phun. Đặt thêm Đường.',
    lesson: 'Xe phải có truyền động để chạy và bơm; nước phải có nguồn rồi mới tới được vòi phun.',
    requiredPath: ['battery', 'switch', 'motor', 'gearbox', 'firetruck'],
    requiredPaths: [['hydrant', 'firetruck', 'nozzle']],
    requiredModules: ['road-straight'],
    success: 'Xe cứu hỏa đang chạy, đèn chớp và hệ nước đã cấp tới vòi phun.',
  },
  {
    id: 'two-storey-house', title: 'Xây nhà hai tầng', emoji: '🏡',
    description: 'Dùng Nền nhà, Tường, Sàn tầng, Cầu thang, Mái và Ban công; dùng nút Nâng/Hạ để xếp tầng.',
    lesson: 'Nhà nhiều tầng cần đường truyền tải liên tục từ sàn và tường/cột xuống nền.',
    requiredPath: ['foundation'],
    requiredModules: ['wall', 'floor-slab', 'stairs', 'roof', 'balcony'],
    buildOnly: true,
    success: 'Con đã có đủ bộ phận chính để dựng một ngôi nhà hai tầng.',
  },
  {
    id: 'furnish-home', title: 'Trang trí ngôi nhà', emoji: '🛋️',
    description: 'Đặt Cửa, Bàn, Ghế, Sofa, Giường, Bếp và Tủ sách vào ngôi nhà.',
    lesson: 'Không gian sống được tổ chức theo chức năng: tiếp khách, ăn uống, nghỉ ngơi và lưu trữ.',
    requiredPath: ['door'],
    requiredModules: ['table', 'chair', 'sofa', 'bed', 'kitchen', 'bookshelf'],
    buildOnly: true,
    success: 'Ngôi nhà đã có các khu nội thất cơ bản.',
  },
  {
    id: 'island-world', title: 'Tạo đảo và bến tàu', emoji: '🏝️',
    description: 'Ghép Biển, Đảo, Cầu tàu, Cây và Tàu thủy để tạo một góc thế giới ven biển.',
    lesson: 'Địa hình, nước và hạ tầng giao thông kết hợp thành một không gian có thể khám phá.',
    requiredPath: ['sea-tile'],
    requiredModules: ['island', 'dock', 'tree', 'boat'],
    buildOnly: true,
    success: 'Một hòn đảo có cầu tàu và tàu thủy đã hình thành.',
  },
  {
    id: 'city', title: 'Xây thành phố của con', emoji: '🏙️',
    description: 'Kết hợp Đường, Nhà, Cây, Đèn đường, Đèn giao thông, Xe và khu nước để tạo thành phố hoàn chỉnh.',
    lesson: 'Thành phố là một hệ thống gồm công trình, giao thông, cây xanh, hạ tầng và dịch vụ.',
    requiredPath: ['road-straight'],
    requiredModules: ['foundation', 'wall', 'roof', 'tree', 'streetlight', 'traffic-light', 'car-base', 'water-tile'],
    buildOnly: true,
    success: 'Con đã đặt đủ các thành phần lõi của một thành phố nhỏ. Bây giờ có thể mở rộng tự do.',
  },
  {
    id: 'adventure-land', title: 'Thế giới khám phá', emoji: '🗺️',
    description: 'Tạo Biển, Đảo, Núi, Hang động, Thác nước, Cây và Hoa thành một bản đồ phiêu lưu.',
    lesson: 'Địa hình khác nhau tạo dòng nước, hệ sinh thái và các tuyến khám phá khác nhau.',
    requiredPath: ['sea-tile'],
    requiredModules: ['island', 'mountain', 'cave', 'waterfall', 'tree', 'flower'],
    buildOnly: true,
    success: 'Một thế giới phiêu lưu với biển, đảo, núi, hang và thác đã sẵn sàng.',
  },
];
