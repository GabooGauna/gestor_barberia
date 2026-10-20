import { useEffect, useState } from "react";
import { currentBusinessDate } from "../utils/businessDate";

// Recheck on resume as browsers can suspend timers in background tabs.
export function useBusinessDate() {
  const [date, setDate] = useState(currentBusinessDate);
  useEffect(() => {
    const update = () => setDate(currentBusinessDate());
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return date;
}
