interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
  width?: string | number;
  height?: string | number;
}

export default function Skeleton({ className = '', variant = 'rect', width, height }: SkeletonProps) {
  const baseStyles = "bg-slate-200 overflow-hidden relative";
  const variantStyles = {
    rect: "rounded-lg",
    circle: "rounded-full",
    text: "rounded h-4 w-full"
  };

  return (
    <div 
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={{ width, height }}
    >
      <div className="skeleton-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent shadow-inner" />
    </div>
  );
}
