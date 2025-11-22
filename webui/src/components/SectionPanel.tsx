import React from "react";

interface SectionPanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}

export default function SectionPanel({ 
  title, 
  children, 
  className = "", 
  headerClassName = "",
  bodyClassName = "" 
}: SectionPanelProps) {
  return (
    <div className={`panel ${className}`}>
      {title && (
        <div className={`panel-title ${headerClassName}`}>
          {title}
        </div>
      )}
      <div className={bodyClassName}>
        {children}
      </div>
    </div>
  );
}

