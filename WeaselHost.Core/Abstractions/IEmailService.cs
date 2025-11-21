namespace WeaselHost.Core.Abstractions;

public interface IEmailService
{
    Task SendTestEmailAsync(string recipient, CancellationToken cancellationToken = default);

    Task SendEmailAsync(
        string subject,
        string body,
        List<string> recipients,
        CancellationToken cancellationToken = default);
}

