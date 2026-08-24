import { useEffect, useRef, useState } from "react";

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function AnimatedNumber({ value, duration = 700 }) {

  const numericValue = parseFloat(value);
  const suffix = typeof value === "string" ? value.replace(/^-?[\d.]+/, "") : "";
  const isNumeric = !Number.isNaN(numericValue);

  const [displayValue, setDisplayValue] = useState(isNumeric ? 0 : value);
  const frameRef = useRef(null);
  const prevValueRef = useRef(0);

  useEffect(() => {

    if (!isNumeric) {
      setDisplayValue(value);
      return;
    }

    const startValue = prevValueRef.current;
    const startTime = performance.now();

    const tick = (now) => {

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuad(progress);
      const current = startValue + (numericValue - startValue) * eased;

      setDisplayValue(
        Number.isInteger(numericValue)
          ? Math.round(current)
          : Math.round(current * 10) / 10
      );

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = numericValue;
      }

    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericValue, isNumeric]);

  return (
    <>
      {displayValue}{suffix}
    </>
  );

}

export default AnimatedNumber;
