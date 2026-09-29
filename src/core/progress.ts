import type { Achievement, LearningProfile } from './types';

const KEY = 'le3d-learning-profile-v1';

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-build', title: 'Nhà phát minh đầu tiên', description: 'Đặt ít nhất 3 mô-đun vào thế giới.', icon: '🧑‍🔧' },
  { id: 'electrician', title: 'Kỹ sư điện', description: 'Hoàn thành một mạch điện có nguồn và tải.', icon: '⚡' },
  { id: 'mechanic', title: 'Kỹ sư cơ khí', description: 'Truyền chuyển động qua ít nhất 3 mô-đun cơ khí.', icon: '⚙️' },
  { id: 'water-engineer', title: 'Kỹ sư nước', description: 'Tạo được dòng nước qua bơm tới vòi.', icon: '💧' },
  { id: 'driver', title: 'Kỹ sư giao thông', description: 'Làm một phương tiện chạy đúng hạ tầng.', icon: '🚗' },
  { id: 'rail-master', title: 'Kỹ sư đường sắt', description: 'Làm đầu tàu chạy trên tuyến ray.', icon: '🚂' },
  { id: 'architect', title: 'Kiến trúc sư nhỏ', description: 'Xây công trình có nền, tường, sàn và mái.', icon: '🏠' },
  { id: 'city-builder', title: 'Nhà quy hoạch', description: 'Tạo thế giới có đường, nhà, cây và giao thông.', icon: '🏙️' },
  { id: 'inventor', title: 'Nhà sáng chế', description: 'Lưu ít nhất 5 công trình.', icon: '💡' },
  { id: 'explorer', title: 'Nhà khám phá', description: 'Hoàn thành ít nhất 10 nhiệm vụ khác nhau.', icon: '🗺️' },
];

function blank(): LearningProfile {
  return { missionsCompleted: [], concepts: {}, achievements: {}, buildsSaved: 0, playSessions: 0 };
}

export class ProgressStore {
  load(): LearningProfile {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
    } catch {
      return blank();
    }
  }

  private save(profile: LearningProfile) {
    localStorage.setItem(KEY, JSON.stringify(profile));
    return profile;
  }

  startSession() {
    const p = this.load();
    p.playSessions++;
    return this.save(p);
  }

  concept(name: string, amount = 1) {
    const p = this.load();
    p.concepts[name] = (p.concepts[name] ?? 0) + amount;
    return this.save(p);
  }

  mission(id: string) {
    const p = this.load();
    if (!p.missionsCompleted.includes(id)) p.missionsCompleted.push(id);
    return this.save(p);
  }

  buildSaved() {
    const p = this.load();
    p.buildsSaved++;
    return this.save(p);
  }

  unlock(id: string) {
    const p = this.load();
    if (!p.achievements[id]) p.achievements[id] = Date.now();
    return this.save(p);
  }

  evaluate(args: {
    moduleCount: number;
    electricalActive: boolean;
    mechanicalCount: number;
    waterActive: boolean;
    vehicleActive: boolean;
    trainActive: boolean;
    architecturalCount: number;
    cityLike: boolean;
  }) {
    const before = this.load();
    const newly: Achievement[] = [];
    const unlock = (id: string, condition: boolean) => {
      if (!condition || before.achievements[id]) return;
      before.achievements[id] = Date.now();
      const a = ACHIEVEMENTS.find(x => x.id === id);
      if (a) newly.push({ ...a, unlockedAt: before.achievements[id] });
    };
    unlock('first-build', args.moduleCount >= 3);
    unlock('electrician', args.electricalActive);
    unlock('mechanic', args.mechanicalCount >= 3);
    unlock('water-engineer', args.waterActive);
    unlock('driver', args.vehicleActive);
    unlock('rail-master', args.trainActive);
    unlock('architect', args.architecturalCount >= 4);
    unlock('city-builder', args.cityLike);
    unlock('inventor', before.buildsSaved >= 5);
    unlock('explorer', before.missionsCompleted.length >= 10);
    this.save(before);
    return newly;
  }
}
