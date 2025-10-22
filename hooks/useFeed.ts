import { useEffect, useRef, useState, useCallback } from "react";

export function useFeed(els: any[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Maintain refs
  useEffect(() => {
    refs.current = refs.current.slice(0, els.length);
  }, [els.length]);

  // Intersection observer logic
  useEffect(() => {
    if (!containerRef.current || els.length === 0) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const idx = refs.current.findIndex(ref => ref === entry.target);
            if (idx !== -1) setActiveIndex(idx);
          }
        }
      },
      { root: containerRef.current, threshold: [0.5, 0.75, 1.0] }
    );
    refs.current.forEach(ref => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, [els.length]);

  // Smooth scroll to target index
  const scrollTo = useCallback((index: number) => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    requestAnimationFrame(() => {
      el.scrollTo({ top: index * el.clientHeight, behavior: "auto" });
    });
  }, []);

  return { containerRef, refs, activeIndex, scrollTo };
}