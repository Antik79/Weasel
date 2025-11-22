import React from "react";

export interface SubmenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SubmenuNavProps {
  items: SubmenuItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export default function SubmenuNav({ items, activeId, onSelect, className = "" }: SubmenuNavProps) {
  return (
    <div className={`submenu-container ${className}`}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`submenu-tab ${activeId === item.id ? "active" : ""}`}
          onClick={() => onSelect(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

