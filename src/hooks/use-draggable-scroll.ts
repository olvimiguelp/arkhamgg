import { useRef, useState, useEffect, RefObject } from 'react';

interface DraggableScrollOptions {
    /**
     * Optional CSS selector to find the actual scrollable child element
     * within the ref container. Useful when a component (like Table) wraps
     * content in its own overflow container.
     */
    childSelector?: string;
}

/**
 * A hook that enables drag-to-scroll functionality on a container element.
 * Returns a ref to be attached to the scrollable container and the current dragging state.
 */
export function useDraggableScroll<T extends HTMLElement>(
    options?: DraggableScrollOptions
): {
    ref: RefObject<T>;
    isDragging: boolean;
} {
    const ref = useRef<T>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Use refs for mutable values that event listeners need to read synchronously.
    const isDraggingRef = useRef(false);
    const startXRef = useRef(0);
    const scrollLeftRef = useRef(0);

    useEffect(() => {
        const container = ref.current;
        if (!container) return;

        // If a childSelector is provided, find the actual scrollable element inside.
        // Otherwise, use the container itself.
        const element = options?.childSelector
            ? (container.querySelector<HTMLElement>(options.childSelector) ?? container)
            : container;

        const onMouseDown = (e: MouseEvent) => {
            isDraggingRef.current = true;
            setIsDragging(true);
            startXRef.current = e.pageX - element.offsetLeft;
            scrollLeftRef.current = element.scrollLeft;
            element.style.cursor = 'grabbing';
            element.style.userSelect = 'none';
        };

        const stopDragging = () => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            setIsDragging(false);
            element.style.cursor = 'grab';
            element.style.removeProperty('user-select');
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            e.preventDefault();
            const x = e.pageX - element.offsetLeft;
            const walk = (x - startXRef.current) * 2; // Scroll-fast multiplier
            element.scrollLeft = scrollLeftRef.current - walk;
        };

        // Initial cursor style
        element.style.cursor = 'grab';

        element.addEventListener('mousedown', onMouseDown);
        element.addEventListener('mouseleave', stopDragging);
        element.addEventListener('mouseup', stopDragging);
        element.addEventListener('mousemove', onMouseMove);
        // Also listen on window mouseup in case the mouse leaves the element while dragging
        window.addEventListener('mouseup', stopDragging);

        return () => {
            element.removeEventListener('mousedown', onMouseDown);
            element.removeEventListener('mouseleave', stopDragging);
            element.removeEventListener('mouseup', stopDragging);
            element.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', stopDragging);
            element.style.removeProperty('cursor');
            element.style.removeProperty('user-select');
        };
    }, [options?.childSelector]);

    return { ref, isDragging };
}
