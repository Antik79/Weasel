import React from "react";

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageLayout({ children, className = "" }: PageLayoutProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {children}
    </div>
  );
}

