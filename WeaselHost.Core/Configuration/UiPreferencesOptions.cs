namespace WeaselHost.Core.Configuration;

/// <summary>
/// User interface preferences that are persisted and synced across devices.
/// </summary>
public class UiPreferencesOptions
{
    /// <summary>
    /// Expansion state for log panels. Key is the panel name (e.g., "Screenshots", "Terminal", "VNC", "Packages"),
    /// value is whether the panel should be expanded (true) or collapsed (false).
    /// Default: false (collapsed)
    /// </summary>
    public Dictionary<string, bool> LogPanelExpanded { get; set; } = new();
}
