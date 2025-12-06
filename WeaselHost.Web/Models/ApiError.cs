namespace WeaselHost.Web.Models;

/// <summary>
/// Standard API error response format.
/// </summary>
public record ApiError(string Message, string? Code = null, Dictionary<string, object>? Details = null);

