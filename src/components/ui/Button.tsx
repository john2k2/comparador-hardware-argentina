// ============================================
// Button - Componente de botón
// ============================================

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center border-4 border-border rounded-none uppercase font-bold transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary disabled:opacity-50 disabled:pointer-events-none active:translate-x-1 active:translate-y-1';
    
    const variants = {
      primary: 'bg-primary text-primary-foreground pixel-shadow hover:bg-primary-hover',
      secondary: 'bg-secondary text-secondary-foreground pixel-shadow hover:brightness-95',
      outline: 'bg-card text-foreground hover:bg-muted',
      ghost: 'border-transparent bg-transparent text-foreground hover:border-border hover:bg-muted',
      danger: 'bg-destructive text-white pixel-shadow hover:brightness-95',
    };
    
    const sizes = {
      sm: 'min-h-11 px-3 py-2 text-[9px]',
      md: 'min-h-12 px-4 py-3 text-[10px]',
      lg: 'min-h-14 px-6 py-4 text-[11px]',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
