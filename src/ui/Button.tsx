
import { ReactNode } from 'react'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}
export default function Button({ children, className='', ...rest }: Props) {
  return (
    <button
      className={`w-full py-3 px-4 rounded-2xl bg-black text-white active:scale-[0.98] disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
