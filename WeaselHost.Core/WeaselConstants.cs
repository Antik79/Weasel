namespace WeaselHost.Core;

/// <summary>
/// Centralized constants for the Weasel application.
/// For user-configurable values, use WeaselHostOptions instead.
/// </summary>
public static class WeaselConstants
{
    /// <summary>
    /// Timeout constants for various operations.
    /// </summary>
    public static class Timeouts
    {
        /// <summary>Time to wait for a hosted service to stop gracefully.</summary>
        public static readonly TimeSpan ServiceStopGracePeriod = TimeSpan.FromSeconds(3);

        /// <summary>Timeout for SMTP operations.</summary>
        public const int SmtpTimeoutMilliseconds = 30000;

        /// <summary>Timeout for package search operations.</summary>
        public static readonly TimeSpan PackageSearchTimeout = TimeSpan.FromSeconds(90);

        /// <summary>Delay after writing config file for filesystem sync.</summary>
        public static readonly TimeSpan ConfigWriteDelay = TimeSpan.FromMilliseconds(500);

        /// <summary>Delay for CPU counter sampling.</summary>
        public static readonly TimeSpan CpuSampleDelay = TimeSpan.FromMilliseconds(250);
    }

    /// <summary>
    /// Interval constants for monitoring and polling.
    /// </summary>
    public static class Intervals
    {
        /// <summary>Base interval for disk monitoring loop.</summary>
        public static readonly TimeSpan DiskMonitorLoop = TimeSpan.FromMinutes(1);

        /// <summary>Base interval for application monitoring loop.</summary>
        public static readonly TimeSpan AppMonitorLoop = TimeSpan.FromSeconds(10);

        /// <summary>Delay after an error before retrying in monitoring loops.</summary>
        public static readonly TimeSpan ErrorRetryDelay = TimeSpan.FromMinutes(1);

        /// <summary>Minimum allowed check interval for monitoring items.</summary>
        public static readonly TimeSpan MinCheckInterval = TimeSpan.FromSeconds(1);
    }

    /// <summary>
    /// Alert throttling constants.
    /// </summary>
    public static class Alerts
    {
        /// <summary>Minimum time between alerts for the same item.</summary>
        public static readonly TimeSpan ThrottleInterval = TimeSpan.FromHours(1);

        /// <summary>Maximum event log entries to process per cycle.</summary>
        public const int MaxEventLogEntries = 500;

        /// <summary>Time window for recent event log entries.</summary>
        public static readonly TimeSpan EventLogWindow = TimeSpan.FromMinutes(10);
    }

    /// <summary>
    /// File and path constants.
    /// </summary>
    public static class Paths
    {
        /// <summary>Default configuration file name.</summary>
        public const string ConfigFileName = "appsettings.json";

        /// <summary>Configuration subdirectory.</summary>
        public const string ConfigDirectory = "config";

        /// <summary>Default logs directory name.</summary>
        public const string LogsDirectory = "Logs";

        /// <summary>Archive subdirectory for rotated logs.</summary>
        public const string ArchiveDirectory = "Archive";
    }

    /// <summary>
    /// Default limits and thresholds.
    /// </summary>
    public static class Defaults
    {
        /// <summary>Default log retention in days.</summary>
        public const int LogRetentionDays = 30;

        /// <summary>Maximum log file size before rotation (10 MB).</summary>
        public const long MaxLogFileSizeBytes = 10 * 1024 * 1024;

        /// <summary>Maximum rotated log files to keep per day.</summary>
        public const int MaxLogFilesPerDay = 5;

        /// <summary>Default web server port.</summary>
        public const int WebServerPort = 7780;

        /// <summary>Default VNC server port.</summary>
        public const int VncPort = 5900;

        /// <summary>Default check interval for disk monitoring in minutes.</summary>
        public const int DiskCheckIntervalMinutes = 15;

        /// <summary>Default check interval for application monitoring in seconds.</summary>
        public const int AppCheckIntervalSeconds = 60;

        /// <summary>Default restart delay for application monitoring in seconds.</summary>
        public const int AppRestartDelaySeconds = 5;
    }

    /// <summary>
    /// HTTP header and API constants.
    /// </summary>
    public static class Api
    {
        /// <summary>CSRF token header name.</summary>
        public const string CsrfHeader = "X-Weasel-Csrf";

        /// <summary>Authentication token header name.</summary>
        public const string AuthHeader = "X-Weasel-Token";

        /// <summary>Authentication token query parameter name.</summary>
        public const string AuthQueryParam = "token";

        /// <summary>Rate limit requests per minute.</summary>
        public const int DefaultRateLimitPerMinute = 120;

        /// <summary>Rate limit queue size.</summary>
        public const int DefaultRateLimitQueueSize = 20;
    }
}
