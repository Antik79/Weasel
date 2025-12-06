import { useTranslation } from '../i18n/i18n';
import {
  Monitor,
  HardDrive,
  AppWindow,
  Camera,
  Terminal,
  Video,
  Settings,
  Play,
  Square,
  ExternalLink,
  type LucideIcon
} from 'lucide-react';

type StatusVariant = 'running' | 'enabled' | 'warning' | 'error' | 'disabled';

interface ServiceStatusCardProps {
  title: string;
  icon: LucideIcon;
  status: StatusVariant;
  statusLabel: string;
  metrics: { label: string; value: string | number }[];
  navigateTo?: string;
  onConfigure?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  isRunning?: boolean;
}

export function ServiceStatusCard({
  title,
  icon: Icon,
  status,
  statusLabel,
  metrics,
  navigateTo,
  onConfigure,
  onStart,
  onStop,
  isRunning
}: ServiceStatusCardProps) {
  const { t } = useTranslation();

  // Navigate using hash routing (App.tsx uses hash routing, not react-router)
  const navigate = (path: string) => {
    window.location.hash = path;
  };

  const statusColors: Record<StatusVariant, string> = {
    running: 'bg-[var(--color-success)] text-white',
    enabled: 'bg-[var(--color-accent-primary)] text-white',
    warning: 'bg-[var(--color-warning)] text-black',
    error: 'bg-[var(--color-error)] text-white',
    disabled: 'bg-[var(--color-text-muted)] text-white opacity-60'
  };

  const statusDotColors: Record<StatusVariant, string> = {
    running: 'bg-[var(--color-success)]',
    enabled: 'bg-[var(--color-accent-primary)]',
    warning: 'bg-[var(--color-warning)]',
    error: 'bg-[var(--color-error)]',
    disabled: 'bg-[var(--color-text-muted)]'
  };

  const handleClick = () => {
    if (navigateTo) {
      navigate(navigateTo);
    }
  };

  return (
    <div
      className={`panel transition-all duration-200 ${navigateTo ? 'cursor-pointer hover:border-[var(--color-border-active)] hover:shadow-lg' : ''}`}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" style={{ color: 'var(--color-accent-primary)' }} />
          <h3 className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Status indicator with pulse animation for running */}
          <div className="flex items-center gap-1.5">
            <span
              className={`
                w-2 h-2 rounded-full ${statusDotColors[status]}
                ${status === 'running' ? 'animate-pulse' : ''}
              `}
            />
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[status]}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-1.5 mb-3">
        {metrics.map((metric, index) => (
          <div key={index} className="flex justify-between items-center text-sm">
            <span style={{ color: 'var(--color-text-secondary)' }}>{metric.label}</span>
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{metric.value}</span>
          </div>
        ))}
        {metrics.length === 0 && (
          <p className="text-sm italic" style={{ color: 'var(--color-text-secondary)' }}>
            {t('system.overview.noActivity')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div 
        className="flex gap-2 pt-2 border-t"
        style={{ borderColor: 'var(--color-border-muted)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="icon-btn flex items-center gap-1 text-xs"
            style={{ 
              color: 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)';
              e.currentTarget.style.background = 'var(--color-border-default)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
              e.currentTarget.style.background = 'var(--color-border-muted)';
            }}
          >
            <Settings className="w-3 h-3" />
            {t('system.overview.configure')}
          </button>
        )}
        {onStart && !isRunning && (
          <button
            onClick={onStart}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: 'var(--color-success)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
            }}
          >
            <Play className="w-3 h-3" />
            {t('system.overview.start')}
          </button>
        )}
        {onStop && isRunning && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--color-error)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
          >
            <Square className="w-3 h-3" />
            {t('system.overview.stop')}
          </button>
        )}
        {navigateTo && (
          <button
            onClick={() => navigate(navigateTo)}
            className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
            style={{
              color: 'var(--color-accent-primary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// Export icon mapping for convenience
export const ServiceIcons = {
  vnc: Monitor,
  storage: HardDrive,
  application: AppWindow,
  screenshot: Camera,
  terminal: Terminal,
  recordings: Video
} as const;
