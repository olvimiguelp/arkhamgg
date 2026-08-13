import { useEffect } from 'react';

/**
 * Hook to enable navigation between form inputs using the Enter key.
 * It strictly treats Enter as Tab, moving focus to the next interactive element.
 * 
 * Rules:
 * - Works on inputs and selects.
 * - Textareas are excluded (Enter creates a new line).
 * - Buttons are excluded from *originating* the navigation (Enter on a button clicks it).
 * - Focus moves to the next focusable element (including buttons).
 */
export const useEnterNavigation = () => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Enter') return;

            const target = e.target as HTMLElement;

            // 1. Check if the target is an input/select that we want to control.
            // We explicitly exclude TEXTAREA so users can type multi-line text.
            // We exclude BUTTON so users can activate buttons with Enter.
            const isInput =
                target.tagName === 'INPUT' ||
                target.tagName === 'SELECT' ||
                (target.tagName === 'DIV' && target.getAttribute('role') === 'combobox'); // Radix UI Select often uses div with role=combobox

            const isTextarea = target.tagName === 'TEXTAREA';
            const isButton = target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((target as HTMLInputElement).type));
            const isContentEditable = target.isContentEditable;

            // If it's not a standard input, or if it's a textarea/button/editable, let default behavior happen.
            if (!isInput || isTextarea || isButton || isContentEditable) {
                return;
            }

            // 2. Prevent default to stop form submission or other unwanted side effects
            e.preventDefault();

            // 3. Find the valid focusable elements directly in the DOM.
            // We select purely based on what is typically tab-able.
            const selector = `
        input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"]),
        select:not([disabled]):not([aria-hidden="true"]),
        textarea:not([disabled]):not([aria-hidden="true"]),
        button:not([disabled]):not([aria-hidden="true"]),
        [tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-hidden="true"]),
        [role="combobox"]:not([disabled]):not([aria-hidden="true"])
      `;

            // We search in the current form if it exists, otherwise the whole document.
            // This helps keep navigation scoped if the user is in a modal or specific form,
            // but usually document scope is safer for "global" navigation if forms are nested or implicit.
            // Let's try to verify if the element is inside a form.
            const form = target.closest('form');
            const container = form || document.body;

            const focusableElements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];

            // Filter out invisible elements (basic check)
            const visibleElements = focusableElements.filter(el => {
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            });

            const index = visibleElements.indexOf(target);

            if (index > -1 && index < visibleElements.length - 1) {
                const nextElement = visibleElements[index + 1];
                nextElement.focus();
            } else if (index === visibleElements.length - 1) {
                // If it's the last element, we might want to verify if it's a submit button.
                // If the user presses Enter on the LAST input, and there is no more elements...
                // The default preventDefault() above stopped the submit.
                // So we might need to actively submit if there is no next element?
                // But usually there is a Submit button at the end, which would be in 'visibleElements'.
                // So hitting Enter on the last input focuses the Submit button.
                // Hitting Enter CAUSES the validation/submit on the button.
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
};
