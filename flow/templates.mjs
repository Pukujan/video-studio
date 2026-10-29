// Prompt templates. Each one records why it exists; ledger stats show its real pass rate.
// Add a new template instead of editing one in place, so old ledger rows keep meaning something.
export const TEMPLATES = {
  // Round 1 on 2026-10-29: 1 of 5 clean. Failures: object popping in/out, hair change, jump cuts,
  // laptop screen morphing. Kept for comparison only.
  'loose-v1': {
    vars: ['action'],
    text: 'Animate this exact image as the first frame of an 8 second 16:9 video. {action}',
  },
  // Round 2: lock the camera, forbid appear/disappear, pin hair/clothes, keep motion small,
  // and say which held objects must stay put.
  'still-relief': {
    vars: ['action', 'keep'],
    text: 'Animate this exact image as the first frame. {action} {keep} One continuous 8 second shot with a ' +
      'locked-off static camera: no cuts, no zoom, no camera movement. Keep the same person, face, hairstyle, ' +
      'clothing and every object exactly as in the image; nothing appears, disappears, moves on its own or ' +
      'changes shape. Only small natural body movements. No text, no logos.',
  },
};

export function render(name, vars) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`unknown template ${name}; have ${Object.keys(TEMPLATES).join(', ')}`);
  return t.text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '').replace(/\s+/g, ' ').trim();
}
