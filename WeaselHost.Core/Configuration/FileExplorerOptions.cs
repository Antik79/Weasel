namespace WeaselHost.Core.Configuration;

/// <summary>
/// Configuration options for the File Explorer section
/// </summary>
public class FileExplorerOptions
{
    /// <summary>
    /// Home folder for File Explorer. Defaults to application base directory.
    /// This is the starting location when the File Explorer is opened.
    /// </summary>
    public string HomeFolder { get; set; } = AppContext.BaseDirectory;
}
