// The staff-alert chime (new QR order, captain's bill request, kitchen
// rejected an item) - Web Audio, no asset file needed. Browsers allow audio
// only after a user gesture, which a POS screen has almost at once; the
// pop-up still shows if the sound is blocked.
let ctx: AudioContext | null = null;

export function playStaffAlertSound(pattern: "double" | "triple" = "double") {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    // One context for the session: browsers cap how many can exist.
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    const c = ctx;
    const beep = (startAt: number, freq: number) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, c.currentTime + startAt);
      gain.gain.exponentialRampToValueAtTime(0.35, c.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startAt + 0.35);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + startAt);
      osc.stop(c.currentTime + startAt + 0.35);
    };
    beep(0, 880);
    beep(0.45, 880);
    if (pattern === "triple") beep(0.9, 1175);
  } catch {
    // ignore - the pop-up still shows regardless
  }
}
