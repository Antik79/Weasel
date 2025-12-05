using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using WeaselHost.Core;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class EmailService : IEmailService
{
    private readonly IOptionsMonitor<WeaselHostOptions> _optionsMonitor;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IOptionsMonitor<WeaselHostOptions> optionsMonitor, ILogger<EmailService> logger)
    {
        _optionsMonitor = optionsMonitor;
        _logger = logger;
    }

    public async Task SendTestEmailAsync(string recipient, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(recipient))
        {
            throw new ArgumentException("Recipient email address is required.", nameof(recipient));
        }

        var smtp = _optionsMonitor.CurrentValue.Smtp;
        if (string.IsNullOrWhiteSpace(smtp.Host))
        {
            throw new InvalidOperationException("SMTP host is not configured. Please configure SMTP settings first.");
        }

        if (string.IsNullOrWhiteSpace(smtp.FromAddress))
        {
            throw new InvalidOperationException("SMTP from address is not configured. Please configure SMTP settings first.");
        }

        var subject = "Weasel Test Email";
        var body = $"This is a test email from Weasel running on {Environment.MachineName}.\n\n" +
                   $"Time: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}\n\n" +
                   "If you received this email, your SMTP configuration is working correctly!";

        await SendEmailAsync(subject, body, new List<string> { recipient }, cancellationToken);
    }

    public async Task SendEmailAsync(
        string subject,
        string body,
        List<string> recipients,
        CancellationToken cancellationToken = default)
    {
        var smtp = _optionsMonitor.CurrentValue.Smtp;
        if (string.IsNullOrWhiteSpace(smtp.Host) || string.IsNullOrWhiteSpace(smtp.FromAddress))
        {
            throw new InvalidOperationException("SMTP is not configured.");
        }

        try
        {
            // Build the message using MimeKit
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(smtp.FromName ?? "Weasel", smtp.FromAddress));

            foreach (var recipient in recipients)
            {
                if (!string.IsNullOrWhiteSpace(recipient))
                {
                    message.To.Add(MailboxAddress.Parse(recipient));
                }
            }

            message.Subject = subject;
            message.Body = new TextPart("plain") { Text = body };

            // Determine the secure socket option based on port and SSL setting
            // Port 465 = Implicit SSL (SslOnConnect)
            // Port 587 = STARTTLS (StartTls or StartTlsWhenAvailable)
            // Port 25 = Plain or STARTTLS (StartTlsWhenAvailable)
            var secureSocketOptions = DetermineSecureSocketOptions(smtp.Port, smtp.EnableSsl);

            using var client = new SmtpClient();

            // Set timeout
            client.Timeout = WeaselConstants.Timeouts.SmtpTimeoutMilliseconds;

            _logger.LogDebug(
                "Connecting to SMTP server {Host}:{Port} with security: {Security}",
                smtp.Host, smtp.Port, secureSocketOptions);

            // Connect to the server
            await client.ConnectAsync(smtp.Host, smtp.Port, secureSocketOptions, cancellationToken);

            // Authenticate if credentials are provided
            if (!string.IsNullOrWhiteSpace(smtp.Username) && !string.IsNullOrWhiteSpace(smtp.Password))
            {
                await client.AuthenticateAsync(smtp.Username, smtp.Password, cancellationToken);
            }

            // Send the message
            await client.SendAsync(message, cancellationToken);

            // Disconnect cleanly
            await client.DisconnectAsync(true, cancellationToken);

            _logger.LogInformation("Sent email to {Count} recipients", recipients.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email");
            throw;
        }
    }

    /// <summary>
    /// Determines the appropriate secure socket options based on port and SSL setting.
    /// </summary>
    private static SecureSocketOptions DetermineSecureSocketOptions(int port, bool enableSsl)
    {
        // Port 465 is the implicit SSL port - connection is encrypted from the start
        if (port == 465)
        {
            return SecureSocketOptions.SslOnConnect;
        }

        // Port 587 is the submission port - typically uses STARTTLS
        if (port == 587)
        {
            return enableSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.StartTlsWhenAvailable;
        }

        // Port 25 is the traditional SMTP port
        if (port == 25)
        {
            return enableSsl ? SecureSocketOptions.StartTlsWhenAvailable : SecureSocketOptions.None;
        }

        // For any other port, use the EnableSsl setting to decide
        // If SSL is enabled and it's not a known STARTTLS port, assume implicit SSL
        return enableSsl ? SecureSocketOptions.Auto : SecureSocketOptions.None;
    }
}
