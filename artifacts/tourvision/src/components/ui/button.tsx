import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 uppercase tracking-wide rounded-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-2 border-[#1A1714] shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-[#1A1714] shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]",
        outline:
          "bg-background text-foreground border-2 border-[#1A1714] shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]",
        secondary:
          "bg-secondary text-secondary-foreground border-2 border-[#1A1714] shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]",
        ghost: "border border-transparent hover:bg-accent hover:text-accent-foreground rounded-none",
        link: "text-primary underline-offset-4 hover:underline",
        green:
          "bg-[#00C853] text-[#1A1714] border-2 border-[#1A1714] shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]",
        yellow:
          "bg-[#FFD000] text-[#1A1714] border-2 border-[#1A1714] shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
