using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
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
            using var client = new SmtpClient
            {
                Host = smtp.Host,
                Port = smtp.Port,
                EnableSsl = smtp.EnableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false,
                Timeout = WeaselConstants.Timeouts.SmtpTimeoutMilliseconds
            };

            if (!string.IsNullOrWhiteSpace(smtp.Username) && !string.IsNullOrWhiteSpace(smtp.Password))
            {
                client.Credentials = new NetworkCredential(smtp.Username, smtp.Password);
            }

            using var message = new MailMessage
            {
                From = new MailAddress(smtp.FromAddress, smtp.FromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = false
            };

            foreach (var recipient in recipients)
            {
                if (!string.IsNullOrWhiteSpace(recipient))
                {
                    message.To.Add(recipient);
                }
            }

            await client.SendMailAsync(message, cancellationToken);
            _logger.LogInformation("Sent email to {Count} recipients", recipients.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email");
            throw;
        }
    }
}

