import { useState } from "react";

interface ToggleBarProps {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void | Promise<void>;
  icon?: React.ReactNode;
  id?: string;
  iconColorEnabled?: string;
  iconColorDisabled?: string;
}

export default function ToggleBar({
  label,
  description,
  enabled,
  onChange,
  icon,
  id = `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`,
  iconColorEnabled = "text-green-400",
  iconColorDisabled = "text-slate-500"
}: ToggleBarProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = async (checked: boolean) => {
    setIsLoading(true);
    try {
      await onChange(checked);
    } catch (error) {
      console.error("Toggle change failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
      <div className="flex items-center gap-3">
        {icon && (
          <div className={enabled ? iconColorEnabled : iconColorDisabled}>
            {icon}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-slate-400">
            {enabled ? "Enabled" : "Disabled"} {description && `• ${description}`}
          </p>
        </div>
      </div>
      <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
        <input
          type="checkbox"
          name="toggle"
          id={id}
          className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          checked={enabled}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={isLoading}
          style={{
            right: enabled ? '0' : 'auto',
            left: enabled ? 'auto' : '0',
            borderColor: enabled ? '#3b82f6' : '#cbd5e1'
          }}
        />
        <label
          htmlFor={id}
          className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${enabled ? 'bg-blue-500' : 'bg-slate-300'} ${isLoading ? 'opacity-50' : ''}`}
        ></label>
      </div>
    </div>
  );
}
