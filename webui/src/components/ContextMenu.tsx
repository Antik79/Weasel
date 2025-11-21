import { useEffect, useRef } from 'react';

interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Adjust position if it goes off screen
    const style: React.CSSProperties = {
        top: y,
        left: x,
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={style}
        >
            {items.map((item, index) => (
                <button
                    key={index}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-700 ${item.danger ? 'text-red-400 hover:text-red-300' : 'text-slate-200 hover:text-white'
                        }`}
                    onClick={() => {
                        item.onClick();
                        onClose();
                    }}
                >
                    {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                    {item.label}
                </button>
            ))}
        </div>
    );
}
