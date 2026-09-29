let enabled = true;
export function setSpeechEnabled(value: boolean) { enabled = value; if (!value && 'speechSynthesis' in window) speechSynthesis.cancel(); }
export function speak(text: string) {
  if (!enabled || !('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'vi-VN'; u.rate = .92; u.pitch = 1.05;
  const voice = speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('vi')); if (voice) u.voice = voice; speechSynthesis.speak(u);
}
