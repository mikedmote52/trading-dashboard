// Simple Dialog component for thesis drawer
export const Dialog = ({ open, onOpenChange, children }) => {
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/80" 
        onClick={() => onOpenChange(false)}
      ></div>
      <div className="relative bg-background border rounded-lg shadow-lg max-w-3xl w-full m-4 max-h-[90vh] overflow-auto">
        {children}
      </div>
    </div>
  );
};

export const DialogContent = ({ children, className = "" }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

export const DialogHeader = ({ children }) => (
  <div className="mb-4 pb-4 border-b">{children}</div>
);

export const DialogTitle = ({ children, className = "" }) => (
  <h2 className={`text-xl font-semibold ${className}`}>{children}</h2>
);