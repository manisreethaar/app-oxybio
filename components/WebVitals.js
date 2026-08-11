"use client";
import { useReportWebVitals } from 'next/web-vitals';

export default function WebVitals() {
  useReportWebVitals((metric) => {
    if (metric.name === 'INP') {
      const color = metric.value <= 200 ? 'green' : metric.value <= 500 ? 'orange' : 'red';
      console.log(
        `%cINP (Interaction to Next Paint): ${Math.round(metric.value)}ms`,
        `color: ${color}; font-weight: bold; font-size: 14px;`
      );
    }
  });
  return null;
}
