import { ConnectionGraph } from './connectionGraph';
import { MODULES } from './moduleRegistry';
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
];
