// Simple Card components
export const Card = ({ children, className = "" }) => (
  <div className={`bg-white border rounded-lg shadow-sm ${className}`}>
    {children}
  </div>
);

export const CardContent = ({ children, className = "" }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);