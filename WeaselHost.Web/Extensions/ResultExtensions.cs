using Microsoft.AspNetCore.Http.HttpResults;
using WeaselHost.Web.Models;

namespace WeaselHost.Web.Extensions;

/// <summary>
/// Extension methods for consistent API response formatting.
/// </summary>
public static class ResultExtensions
{
    /// <summary>
    /// Returns a 400 Bad Request with standardized error format.
    /// </summary>
    public static IResult BadRequest(string message, string? code = null, Dictionary<string, object>? details = null)
    {
        return Results.BadRequest(new ApiError(message, code, details));
    }

    /// <summary>
    /// Returns a 404 Not Found with standardized error format.
    /// </summary>
    public static IResult NotFound(string? message = null)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return Results.NotFound();
        }
        return Results.NotFound(new ApiError(message));
    }

    /// <summary>
    /// Returns a 500 Internal Server Error with standardized error format.
    /// </summary>
    public static IResult InternalServerError(string message, string? code = null, Dictionary<string, object>? details = null)
    {
        return Results.Problem(
            detail: message,
            statusCode: StatusCodes.Status500InternalServerError,
            title: code ?? "InternalServerError",
            extensions: details
        );
    }

    /// <summary>
    /// Returns a 401 Unauthorized with standardized error format.
    /// </summary>
    public static IResult Unauthorized(string? message = null)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return Results.Unauthorized();
        }
        return Results.Unauthorized();
    }

    /// <summary>
    /// Returns a 403 Forbidden with standardized error format.
    /// </summary>
    public static IResult Forbidden(string? message = null)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return Results.Forbid();
        }
        return Results.Forbid();
    }

    /// <summary>
    /// Returns a 408 Request Timeout with standardized error format.
    /// </summary>
    public static IResult RequestTimeout(string? message = null)
    {
        var error = new ApiError(message ?? "Request timeout", "RequestTimeout");
        return Results.Json(error, statusCode: StatusCodes.Status408RequestTimeout);
    }
}

