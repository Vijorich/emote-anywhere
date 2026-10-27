/** Pointer-driven focus skips the keyboard ring on text fields. */
export function trackFocusModality(): void {
  const root = document.documentElement;
  document.addEventListener(
    'pointerdown',
    () => {
      root.classList.add('input-pointer');
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab') root.classList.remove('input-pointer');
    },
    true,
  );
}
