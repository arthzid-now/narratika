import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'magic';
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  size = 'md',
  ...props 
}) => {
  const baseStyles = "font-sans font-medium transition-all duration-200 focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]";
  
  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-5 py-2.5 text-sm rounded-xl",
    lg: "px-8 py-3 text-base rounded-xl",
  };

  const variants = {
    // Swiss Style: High contrast, solid ink black
    primary: "bg-ink text-white hover:bg-gray-800 shadow-sm hover:shadow-md",
    
    // Swiss Style: Clean borders, muted interaction
    secondary: "bg-white text-ink border border-stone-200 hover:border-stone-400 hover:bg-stone-50",
    
    // Minimalist
    ghost: "text-stone-600 hover:bg-stone-100 hover:text-ink",
    
    // Semantic
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    
    // The "Aurora" Effect for AI features
    magic: "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white bg-[length:200%_200%] animate-aurora shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 border border-transparent",
  };

  return (
    <button 
      className={`${baseStyles} ${sizeStyles[size]} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};