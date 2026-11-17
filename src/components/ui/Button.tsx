"use client";

import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "sm" | "md" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", ...props }, ref) => {
        const variants = {
            primary: "bg-primary text-white hover:bg-primary-hover shadow-sm active:scale-[0.98]",
            secondary: "bg-secondary text-white hover:bg-opacity-90 shadow-sm active:scale-[0.98]",
            outline: "border border-gray-300 bg-transparent hover:bg-gray-50 text-gray-700 active:scale-[0.98]",
            ghost: "bg-transparent hover:bg-gray-100 text-gray-700 active:scale-[0.98]",
            danger: "bg-danger text-white hover:bg-opacity-90 shadow-sm active:scale-[0.98]",
        };

        const sizes = {
            sm: "px-3 py-2 text-sm",
            md: "px-4 py-2 text-base min-h-[44px]",
            lg: "px-6 py-3 text-lg min-h-[52px]",
            icon: "h-11 w-11 p-2",
        };

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";
