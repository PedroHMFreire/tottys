import { ReactNode, ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: Variant
  size?: Size
  full?: boolean
}

const variantClass: Record<Variant, string> = {
  primary:   'bg-[#1E40AF] hover:bg-[#1E3A8A] active:bg-[#1E3484] text-white shadow-sm',
  secondary: 'bg-[#EFF6FF] hover:bg-[#DBEAFE] active:bg-[#BFDBFE] text-[#1E40AF]',
  ghost:     'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700',
  danger:    'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-sm',
}

const sizeClass: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg  gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl  gap-2',
  lg: 'px-5 py-3   text-sm rounded-xl  gap-2',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center font-medium transition-colors duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        full ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
