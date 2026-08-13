
import { useEffect, RefObject } from 'react';

/**
 * A hook that forces vertical scrolling on an element using the wheel event.
 * This is useful when the default overflow behavior is blocked or inconsistent.
 * 
 * @param ref - The ref to the scrollable element
 * @param active - Whether the hook should be active (default true)
 */
export function useWheelScroll(
    ref: RefObject<HTMLElement>,
    active: boolean = true
) {
    useEffect(() => {
        if (!active || !ref.current) return;

        const element = ref.current;

        const handleWheel = (e: WheelEvent) => {
            // If the element is not scrollable, do nothing
            if (element.scrollHeight <= element.clientHeight) return;

            const { deltaY } = e;
            const { scrollTop, scrollHeight, clientHeight } = element;

            // Check if we are at the boundaries
            const isAtTop = scrollTop === 0;
            const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;

            // If scrolling up and at top, or scrolling down and at bottom,
            // allow default behavior (page scroll) 
            if ((isAtTop && deltaY < 0) || (isAtBottom && deltaY > 0)) {
                return;
            }

            // Otherwise, scroll the element and prevent page scroll propagation
            e.preventDefault();
            e.stopPropagation();
            element.scrollTop += deltaY;
        };

        // Add event listener with passive: false to allow preventDefault
        element.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            element.removeEventListener('wheel', handleWheel);
        };
    }, [ref, active]);
}
