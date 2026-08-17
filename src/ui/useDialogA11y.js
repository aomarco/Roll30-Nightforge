import { useEffect, useRef } from "react";

const dialogStack = [];
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

const focusableElements = (dialog) => [...(dialog?.querySelectorAll?.(FOCUSABLE) || [])]
  .filter((element) => element.getAttribute("aria-hidden") !== "true");

/**
 * Gives every Nightforge modal one shared keyboard contract: focus enters the
 * dialog, Tab cannot escape it, only the topmost dialog consumes Escape, and
 * focus returns to the control that opened it.
 */
export function useDialogA11y({ open = true, onClose } = {}) {
  const dialogRef = useRef(null);
  const identityRef = useRef(Symbol("nightforge-dialog"));
  const invokerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    invokerRef.current = document.activeElement;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const identity = identityRef.current;
    const invoker = invokerRef.current;
    dialogStack.push(identity);

    const isTopmost = () => dialogStack.at(-1) === identity;
    const focusFirst = () => {
      const dialog = dialogRef.current;
      if (dialog?.contains?.(document.activeElement)) return;
      const preferred = dialog?.querySelector?.("[autofocus]");
      const target = preferred || focusableElements(dialog)[0] || dialog;
      target?.focus?.({ preventScroll: true });
    };
    const focusTimer = setTimeout(focusFirst, 0);

    const onKeyDown = (event) => {
      if (!isTopmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus?.({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const onFocusIn = (event) => {
      if (isTopmost() && dialogRef.current && !dialogRef.current.contains(event.target)) focusFirst();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      const index = dialogStack.lastIndexOf(identity);
      if (index >= 0) dialogStack.splice(index, 1);
      setTimeout(() => {
        if (invoker?.isConnected) invoker.focus?.({ preventScroll: true });
      }, 0);
    };
  }, [open]);

  return dialogRef;
}
