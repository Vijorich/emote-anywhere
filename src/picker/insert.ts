export function insertIntoComposer(
  composer: HTMLElement,
  text: string,
  savedRange?: Range | null,
): boolean {
  composer.focus();

  if (
    composer instanceof HTMLTextAreaElement ||
    composer instanceof HTMLInputElement
  ) {
    const start = composer.selectionStart ?? composer.value.length;
    const end = composer.selectionEnd ?? start;
    composer.setRangeText(text, start, end, 'end');
    composer.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
    );
    return true;
  }

  if (!composer.isContentEditable) return false;

  const selection = window.getSelection();
  if (!selection) return false;
  let restoredRange = false;
  if (
    savedRange &&
    composer.contains(savedRange.startContainer) &&
    composer.contains(savedRange.endContainer)
  ) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
    restoredRange = true;
  }
  if (
    (savedRange !== undefined && !restoredRange) ||
    (savedRange === undefined &&
      (selection.rangeCount === 0 ||
        !selection.anchorNode ||
        !composer.contains(selection.anchorNode)))
  ) {
    const range = document.createRange();
    range.selectNodeContents(composer);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }
  if (inserted) return true;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  composer.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
  );
  return true;
}
