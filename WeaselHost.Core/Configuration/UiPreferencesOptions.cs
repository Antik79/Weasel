namespace WeaselHost.Core.Configuration;

/// <summary>
/// User interface preferences that are persisted and synced across devices.
/// </summary>
public class UiPreferencesOptions
{
    /// <summary>
    /// Expansion state for log panels. Key is the panel name (e.g., "Screenshots", "Terminal", "VNC", "Packages"),
    /// value is whether the panel should be expanded (true) or collapsed (false).
    /// Special key "default" controls the default state for new panels.
    /// Default: false (collapsed)
    /// </summary>
    public Dictionary<string, bool> LogPanelExpanded { get; set; } = new();

    /// <summary>
    /// Preferred language code (ISO 639-1). Examples: "en", "de", "fr", "nl"
    /// Default: "en"
    /// </summary>
    public string Language { get; set; } = "en";

    /// <summary>
    /// Preferred theme name. Options: "weasel", "dark", "light"
    /// Default: "weasel"
    /// </summary>
    public string? Theme { get; set; } = "weasel";

    /// <summary>
    /// Number of items to display per page in Screenshots folder panel.
    /// Default: 50
    /// </summary>
    public int ScreenshotsFolderPageSize { get; set; } = 50;

    /// <summary>
    /// Number of items to display per page in Files section folder panel.
    /// Default: 50
    /// </summary>
    public int FilesFolderPageSize { get; set; } = 50;

    /// <summary>
    /// Number of items to display per page in Files section files panel.
    /// Default: 100
    /// </summary>
    public int FilesFilesPageSize { get; set; } = 100;

    /// <summary>
    /// Number of items to display per page in Packages section.
    /// Default: 50
    /// </summary>
    public int PackagesPageSize { get; set; } = 50;
}
