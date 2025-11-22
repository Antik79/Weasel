using System.Net.Sockets;
using System.Text;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;

namespace WeaselHost.Infrastructure.Services;

public class VncConnectionHandler : IDisposable
{
    private readonly TcpClient _client;
    private readonly NetworkStream _stream;
    private readonly string? _password;
    private readonly ILogger<VncService>? _logger;
    private readonly ScreenFramebufferSource _framebufferSource;
    private bool _disposed;
    private PixelFormat _clientPixelFormat = new PixelFormat
    {
        BitsPerPixel = 32,
        Depth = 24,
        BigEndian = false,
        TrueColor = true,
        RedMax = 255,
        GreenMax = 255,
        BlueMax = 255,
        RedShift = 16,
        GreenShift = 8,
        BlueShift = 0
    };

    public VncConnectionHandler(TcpClient client, string? password, ILogger<VncService>? logger)
    {
        _client = client;
        _stream = client.GetStream();
        _password = password;
        _logger = logger;
        _framebufferSource = new ScreenFramebufferSource();
    }

    public async Task HandleAsync(CancellationToken cancellationToken)
    {
        try
        {
            // RFB Protocol Version Handshake
            var version = "RFB 003.008\n";
            var versionBytes = Encoding.ASCII.GetBytes(version);
            await _stream.WriteAsync(versionBytes, cancellationToken);
            await _stream.FlushAsync(cancellationToken);

            // Read client version
            var buffer = new byte[12];
            var bytesRead = await _stream.ReadAsync(buffer, 0, 12, cancellationToken);
            if (bytesRead < 12)
            {
                _logger?.LogWarning("Invalid RFB version handshake from client");
                return;
            }

            var clientVersion = Encoding.ASCII.GetString(buffer, 0, 12);
            _logger?.LogDebug("Client RFB version: {Version}", clientVersion.Trim());

            // Security Handshake - RFB Protocol requires:
            // 1. Server sends number of security types (1 byte), followed by security types (1 byte each)
            // 2. Client selects a security type (1 byte)
            // 3. Authentication happens based on selected type
            
            byte securityType;
            if (!string.IsNullOrEmpty(_password))
            {
                // Send security types: 1 = number of types, 2 = VNC Authentication
                await _stream.WriteAsync(new byte[] { 0x01, 0x02 }, cancellationToken);
                await _stream.FlushAsync(cancellationToken);
                
                // Read client's security type selection
                bytesRead = await _stream.ReadAsync(buffer, 0, 1, cancellationToken);
                if (bytesRead < 1)
                {
                    _logger?.LogWarning("Client did not select security type");
                    return;
                }
                securityType = buffer[0];
                
                if (securityType != 0x02) // VNC Authentication
                {
                    _logger?.LogWarning("Client selected unsupported security type: {Type}", securityType);
                    return;
                }

                // VNC Authentication: Send 16-byte challenge
                var challenge = new byte[16];
                var random = new Random();
                random.NextBytes(challenge);
                await _stream.WriteAsync(challenge, cancellationToken);
                await _stream.FlushAsync(cancellationToken);

                // Read 16-byte encrypted response from client
                var response = new byte[16];
                bytesRead = await _stream.ReadAsync(response, 0, 16, cancellationToken);
                if (bytesRead < 16)
                {
                    _logger?.LogWarning("Invalid authentication response from client (expected 16 bytes, got {Bytes})", bytesRead);
                    // Send authentication failure
                    await _stream.WriteAsync(new byte[] { 0x00, 0x00, 0x00, 0x01 }, cancellationToken);
                    await _stream.FlushAsync(cancellationToken);
                    return;
                }

                // VNC uses DES encryption for password
                // Password is padded/truncated to 8 bytes, then used as DES key
                // Challenge is encrypted with this key
                var passwordBytes = Encoding.UTF8.GetBytes(_password!);
                var key = new byte[8];
                Array.Copy(passwordBytes, key, Math.Min(8, passwordBytes.Length));
                
                // Reverse bits in each byte (VNC DES key preparation)
                for (int i = 0; i < 8; i++)
                {
                    key[i] = ReverseBits(key[i]);
                }

                // Encrypt challenge with DES
                byte[] expectedResponse;
                try
                {
                    using (var des = DES.Create())
                    {
                        des.Mode = CipherMode.ECB;
                        des.Padding = PaddingMode.None;
                        des.Key = key;
                        
                        using (var encryptor = des.CreateEncryptor())
                        {
                            // Encrypt first 8 bytes of challenge
                            var encrypted1 = encryptor.TransformFinalBlock(challenge, 0, 8);
                            // Encrypt second 8 bytes of challenge
                            var encrypted2 = encryptor.TransformFinalBlock(challenge, 8, 8);
                            expectedResponse = new byte[16];
                            Array.Copy(encrypted1, 0, expectedResponse, 0, 8);
                            Array.Copy(encrypted2, 0, expectedResponse, 8, 8);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "Error during VNC DES encryption");
                    // Send authentication failure
                    await _stream.WriteAsync(new byte[] { 0x00, 0x00, 0x00, 0x01 }, cancellationToken);
                    await _stream.FlushAsync(cancellationToken);
                    return;
                }

                // Compare response with expected
                bool authenticated = true;
                for (int i = 0; i < 16; i++)
                {
                    if (response[i] != expectedResponse[i])
                    {
                        authenticated = false;
                        break;
                    }
                }

                if (!authenticated)
                {
                    _logger?.LogWarning("VNC authentication failed - password mismatch");
                    // Send authentication failure: 0x00000001
                    await _stream.WriteAsync(new byte[] { 0x00, 0x00, 0x00, 0x01 }, cancellationToken);
                    await _stream.FlushAsync(cancellationToken);
                    return;
                }

                _logger?.LogDebug("VNC authentication successful");
                
                // Send security result: 0x00000000 = success
                await _stream.WriteAsync(new byte[] { 0x00, 0x00, 0x00, 0x00 }, cancellationToken);
                await _stream.FlushAsync(cancellationToken);
            }
            else
            {
                // No authentication: Send security types: 1 = number of types, 1 = None
                await _stream.WriteAsync(new byte[] { 0x01, 0x01 }, cancellationToken);
                await _stream.FlushAsync(cancellationToken);
                
                // Read client's security type selection
                bytesRead = await _stream.ReadAsync(buffer, 0, 1, cancellationToken);
                if (bytesRead < 1)
                {
                    _logger?.LogWarning("Client did not select security type");
                    return;
                }
                securityType = buffer[0];
                
                if (securityType != 0x01) // None
                {
                    _logger?.LogWarning("Client selected unsupported security type: {Type}", securityType);
                    return;
                }
                
                // Send security result: 0x00000000 = success
                await _stream.WriteAsync(new byte[] { 0x00, 0x00, 0x00, 0x00 }, cancellationToken);
                await _stream.FlushAsync(cancellationToken);
            }

            // ClientInit - read shared flag
            bytesRead = await _stream.ReadAsync(buffer, 0, 1, cancellationToken);
            if (bytesRead < 1)
            {
                return;
            }

            // ServerInit - send desktop name and dimensions
            var primaryScreen = System.Windows.Forms.Screen.PrimaryScreen;
            if (primaryScreen == null)
            {
                _logger?.LogError("Primary screen is not available");
                return;
            }
            var screen = primaryScreen.Bounds;
            var desktopName = Encoding.UTF8.GetBytes("Weasel VNC Server");
            var nameLength = (uint)desktopName.Length; // RFB protocol uses 4 bytes (uint32) for name length

            var initData = new List<byte>();
            // Framebuffer width (2 bytes, big-endian)
            initData.AddRange(BitConverter.GetBytes((ushort)screen.Width).Reverse());
            // Framebuffer height (2 bytes, big-endian)
            initData.AddRange(BitConverter.GetBytes((ushort)screen.Height).Reverse());
            
            // Pixel format (16 bytes): bits-per-pixel, depth, big-endian, true-color, red-max, green-max, blue-max, red-shift, green-shift, blue-shift, padding
            // Format: 32 bits per pixel, 24 depth, big-endian=0, true-color=1
            // RGB888: red-max=255, green-max=255, blue-max=255, red-shift=16, green-shift=8, blue-shift=0
            initData.AddRange(new byte[] { 
                32,        // bits-per-pixel
                24,        // depth
                0,         // big-endian (0 = little-endian)
                1,         // true-color (1 = true)
                0, 255,    // red-max (high byte, low byte)
                0, 255,    // green-max (high byte, low byte)
                0, 255,    // blue-max (high byte, low byte)
                16,        // red-shift
                8,         // green-shift
                0,         // blue-shift
                0, 0, 0    // padding (3 bytes)
            });
            
            // Name length (4 bytes, big-endian) - RFB protocol requires uint32
            initData.AddRange(BitConverter.GetBytes(nameLength).Reverse());
            // Name string (variable length)
            initData.AddRange(desktopName);

            var initBytes = initData.ToArray();
            await _stream.WriteAsync(initBytes, cancellationToken);
            await _stream.FlushAsync(cancellationToken);

            // Log first bytes of ServerInit for debugging
            var hexPreview = BitConverter.ToString(initBytes, 0, Math.Min(initBytes.Length, 30));
            _logger?.LogInformation("VNC ServerInit sent: {Width}x{Height}, name length: {NameLength}, total bytes: {Bytes}, hex: {Hex}...", 
                screen.Width, screen.Height, nameLength, initBytes.Length, hexPreview);
            _logger?.LogInformation("VNC client authenticated and initialized, entering message loop");

            // Main message loop - handle SetPixelFormat, SetEncodings, and FramebufferUpdateRequest
            // The client will send these messages, and we'll handle them in the message loop
            await HandleMessagesAsync(cancellationToken);
            
            _logger?.LogInformation("VNC message loop exited");
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error in VNC connection handler");
        }
    }

    private async Task HandleMessagesAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[1];
        _logger?.LogInformation("Starting VNC message loop, waiting for client messages...");
        
        while (!cancellationToken.IsCancellationRequested && _client.Connected)
        {
            try
            {
                _logger?.LogDebug("Waiting for VNC message from client...");
                
                // Blocking read - wait for client messages
                // This will block until data is available or connection is closed
                var bytesRead = await _stream.ReadAsync(buffer, 0, 1, cancellationToken);
                if (bytesRead == 0)
                {
                    _logger?.LogInformation("VNC client closed connection (0 bytes read)");
                    break;
                }

                var messageType = buffer[0];
                _logger?.LogInformation("Received VNC message type: {Type} (0x{TypeHex:X2})", messageType, messageType);
                
                switch (messageType)
                {
                    case 0: // SetPixelFormat
                        await ReadSetPixelFormat(cancellationToken);
                        _logger?.LogInformation("Processed SetPixelFormat");
                        break;
                    case 2: // SetEncodings
                        await ReadSetEncodings(cancellationToken);
                        _logger?.LogInformation("Processed SetEncodings");
                        break;
                    case 3: // FramebufferUpdateRequest
                        await HandleFramebufferUpdateRequest(cancellationToken);
                        _logger?.LogInformation("Processed FramebufferUpdateRequest and sent update");
                        break;
                    case 4: // KeyEvent
                        await ReadKeyEvent(cancellationToken);
                        break;
                    case 5: // PointerEvent
                        await ReadPointerEvent(cancellationToken);
                        break;
                    case 6: // ClientCutText
                        await ReadClientCutText(cancellationToken);
                        break;
                    default:
                        _logger?.LogWarning("Unknown VNC message type: {Type}", messageType);
                        // Can't skip unknown messages without knowing their length
                        // Just break the loop to avoid getting stuck
                        _logger?.LogWarning("Breaking message loop due to unknown message type");
                        return;
                }
            }
            catch (OperationCanceledException)
            {
                _logger?.LogInformation("VNC message loop cancelled");
                break;
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Error in VNC message loop");
                break;
            }
        }
    }

    private async Task ReadSetPixelFormat(CancellationToken cancellationToken)
    {
        var buffer = new byte[19];
        await _stream.ReadAsync(buffer, 0, 19, cancellationToken);
        
        // Parse pixel format: padding (3 bytes) + pixel format (16 bytes)
        // RFB protocol: padding (3 bytes), bits-per-pixel (1), depth (1), big-endian (1), true-color (1),
        // red-max (2), green-max (2), blue-max (2), red-shift (1), green-shift (1), blue-shift (1), padding (3)
        _clientPixelFormat = new PixelFormat
        {
            BitsPerPixel = buffer[3],
            Depth = buffer[4],
            BigEndian = buffer[5] != 0,
            TrueColor = buffer[6] != 0,
            RedMax = BitConverter.ToUInt16(buffer.Skip(7).Take(2).Reverse().ToArray(), 0),
            GreenMax = BitConverter.ToUInt16(buffer.Skip(9).Take(2).Reverse().ToArray(), 0),
            BlueMax = BitConverter.ToUInt16(buffer.Skip(11).Take(2).Reverse().ToArray(), 0),
            RedShift = buffer[13],
            GreenShift = buffer[14],
            BlueShift = buffer[15]
        };
        
        _logger?.LogInformation("Client pixel format: {BitsPerPixel} bpp, depth {Depth}, big-endian={BigEndian}, true-color={TrueColor}, RGB max: R={RedMax} G={GreenMax} B={BlueMax}, RGB shifts: R={RedShift} G={GreenShift} B={BlueShift}", 
            _clientPixelFormat.BitsPerPixel, _clientPixelFormat.Depth, _clientPixelFormat.BigEndian, _clientPixelFormat.TrueColor,
            _clientPixelFormat.RedMax, _clientPixelFormat.GreenMax, _clientPixelFormat.BlueMax,
            _clientPixelFormat.RedShift, _clientPixelFormat.GreenShift, _clientPixelFormat.BlueShift);
    }
    
    private class PixelFormat
    {
        public byte BitsPerPixel { get; set; }
        public byte Depth { get; set; }
        public bool BigEndian { get; set; }
        public bool TrueColor { get; set; }
        public ushort RedMax { get; set; }
        public ushort GreenMax { get; set; }
        public ushort BlueMax { get; set; }
        public byte RedShift { get; set; }
        public byte GreenShift { get; set; }
        public byte BlueShift { get; set; }
    }

    private async Task ReadSetEncodings(CancellationToken cancellationToken)
    {
        var buffer = new byte[3];
        await _stream.ReadAsync(buffer, 0, 3, cancellationToken);
        var numEncodings = BitConverter.ToUInt16(buffer.Skip(1).Reverse().ToArray(), 0);
        var encodingBuffer = new byte[numEncodings * 4];
        await _stream.ReadAsync(encodingBuffer, 0, encodingBuffer.Length, cancellationToken);
    }

    private async Task HandleFramebufferUpdateRequest(CancellationToken cancellationToken)
    {
        var buffer = new byte[9];
        await _stream.ReadAsync(buffer, 0, 9, cancellationToken);
        await SendFramebufferUpdate(cancellationToken);
    }

    private async Task SendFramebufferUpdate(CancellationToken cancellationToken)
    {
        try
        {
            var framebuffer = _framebufferSource.Capture();
            var primaryScreen = System.Windows.Forms.Screen.PrimaryScreen;
            if (primaryScreen == null)
            {
                _logger?.LogError("Primary screen is not available");
                return;
            }
            var screen = primaryScreen.Bounds;

            var response = new List<byte>();
            response.Add(0); // Message type: FramebufferUpdate
            
            response.Add(0); // Padding
            response.Add(0); // Number of rectangles (high byte)
            response.Add(1); // Number of rectangles (low byte) - sending one rectangle

            // Rectangle header
            response.Add(0); // X position (high)
            response.Add(0); // X position (low)
            response.Add(0); // Y position (high)
            response.Add(0); // Y position (low)
            response.AddRange(BitConverter.GetBytes((ushort)screen.Width).Reverse());
            response.AddRange(BitConverter.GetBytes((ushort)screen.Height).Reverse());
            
            // Encoding type: Raw (0)
            response.Add(0);
            response.Add(0);
            response.Add(0);
            response.Add(0);

            // Convert pixel data to client's requested format
            var pixelData = ConvertPixelData(framebuffer, screen.Width, screen.Height);
            
            // Calculate expected pixel data size
            var bitsPerPixel = _clientPixelFormat.BitsPerPixel;
            var bytesPerPixel = (bitsPerPixel + 7) / 8;
            var expectedPixelDataSize = screen.Width * screen.Height * bytesPerPixel;
            
            if (pixelData.Length != expectedPixelDataSize)
            {
                _logger?.LogError("Pixel data size mismatch: expected {Expected}, got {Actual}", expectedPixelDataSize, pixelData.Length);
            }
            
            // Send header first
            var responseArray = response.ToArray();
            _logger?.LogDebug("Sending framebuffer update header: {HeaderSize} bytes, pixel data: {PixelSize} bytes (expected: {ExpectedSize})", 
                responseArray.Length, pixelData.Length, expectedPixelDataSize);
            
            // Log first few bytes of header for debugging
            var headerHex = string.Join("-", responseArray.Take(Math.Min(20, responseArray.Length)).Select(b => b.ToString("X2")));
            _logger?.LogDebug("Framebuffer update header (first 20 bytes): {Hex}", headerHex);
            
            await _stream.WriteAsync(responseArray, cancellationToken);
            
            // Send pixel data in chunks (64KB at a time)
            const int chunkSize = 64 * 1024; // 64KB chunks
            var totalSent = 0;
            for (int offset = 0; offset < pixelData.Length; offset += chunkSize)
            {
                var remaining = Math.Min(chunkSize, pixelData.Length - offset);
                await _stream.WriteAsync(new ArraySegment<byte>(pixelData, offset, remaining), cancellationToken);
                totalSent += remaining;
            }
            
            await _stream.FlushAsync(cancellationToken);
            _logger?.LogInformation("Sent framebuffer update: {Width}x{Height}, header: {HeaderSize} bytes, pixel data: {PixelSize} bytes (sent: {Sent})", 
                screen.Width, screen.Height, responseArray.Length, pixelData.Length, totalSent);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error sending framebuffer update");
        }
    }
    
    private byte[] ConvertPixelData(VncFramebuffer framebuffer, int width, int height)
    {
        var rgbData = framebuffer.PixelData; // Source is RGB (3 bytes per pixel)
        var bitsPerPixel = _clientPixelFormat.BitsPerPixel;
        var bytesPerPixel = (bitsPerPixel + 7) / 8; // Round up to nearest byte
        var pixelCount = width * height;
        
        // Validate input data size
        var expectedRgbSize = pixelCount * 3;
        if (rgbData.Length != expectedRgbSize)
        {
            _logger?.LogError("RGB data size mismatch: expected {Expected}, got {Actual}", expectedRgbSize, rgbData.Length);
            throw new InvalidOperationException($"RGB data size mismatch: expected {expectedRgbSize}, got {rgbData.Length}");
        }
        
        var output = new byte[pixelCount * bytesPerPixel];
        
        for (int i = 0; i < pixelCount; i++)
        {
            var r = rgbData[i * 3];
            var g = rgbData[i * 3 + 1];
            var b = rgbData[i * 3 + 2];
            
            // Scale colors based on max values (usually 255, but could be different)
            var rScaled = (ushort)((r * _clientPixelFormat.RedMax) / 255);
            var gScaled = (ushort)((g * _clientPixelFormat.GreenMax) / 255);
            var bScaled = (ushort)((b * _clientPixelFormat.BlueMax) / 255);
            
            if (bitsPerPixel == 32 && bytesPerPixel == 4)
            {
                // Pack into 32-bit based on shifts
                uint pixel = 0;
                pixel |= (uint)(rScaled << _clientPixelFormat.RedShift);
                pixel |= (uint)(gScaled << _clientPixelFormat.GreenShift);
                pixel |= (uint)(bScaled << _clientPixelFormat.BlueShift);
                
                var pixelBytes = BitConverter.GetBytes(pixel);
                if (_clientPixelFormat.BigEndian)
                {
                    Array.Reverse(pixelBytes);
                }
                
                var offset = i * 4;
                output[offset] = pixelBytes[0];
                output[offset + 1] = pixelBytes[1];
                output[offset + 2] = pixelBytes[2];
                output[offset + 3] = pixelBytes[3];
            }
            else if (bitsPerPixel == 24 && bytesPerPixel == 3)
            {
                // Client wants RGB - return as-is (but ensure correct byte order)
                var offset = i * 3;
                output[offset] = r;
                output[offset + 1] = g;
                output[offset + 2] = b;
            }
            else if (bitsPerPixel == 16 && bytesPerPixel == 2)
            {
                // Pack into 16-bit (5-6-5 format is common)
                ushort pixel = 0;
                pixel |= (ushort)((rScaled >> 3) << 11); // 5 bits red
                pixel |= (ushort)((gScaled >> 2) << 5);   // 6 bits green
                pixel |= (ushort)(bScaled >> 3);        // 5 bits blue
                
                var pixelBytes = BitConverter.GetBytes(pixel);
                if (_clientPixelFormat.BigEndian)
                {
                    Array.Reverse(pixelBytes);
                }
                
                var offset = i * 2;
                output[offset] = pixelBytes[0];
                output[offset + 1] = pixelBytes[1];
            }
            else if (bitsPerPixel == 8 && bytesPerPixel == 1)
            {
                // Convert RGB to 8-bit using client's color format
                // rScaled, gScaled, bScaled are already in the range 0-RedMax, 0-GreenMax, 0-BlueMax
                // We just need to mask them to ensure they fit and pack them according to shifts
                var redMask = (byte)_clientPixelFormat.RedMax;
                var greenMask = (byte)_clientPixelFormat.GreenMax;
                var blueMask = (byte)_clientPixelFormat.BlueMax;
                
                var rQuantized = (byte)(rScaled & redMask);
                var gQuantized = (byte)(gScaled & greenMask);
                var bQuantized = (byte)(bScaled & blueMask);
                
                output[i] = (byte)((rQuantized << _clientPixelFormat.RedShift) |
                                   (gQuantized << _clientPixelFormat.GreenShift) |
                                   (bQuantized << _clientPixelFormat.BlueShift));
            }
            else
            {
                // For unsupported formats, reject the connection or use a supported format
                _logger?.LogError("Unsupported pixel format: {BitsPerPixel} bpp, depth {Depth}. Cannot convert pixel data.", 
                    bitsPerPixel, _clientPixelFormat.Depth);
                throw new NotSupportedException($"Unsupported pixel format: {bitsPerPixel} bpp");
            }
        }
        
        // Validate output size
        var expectedOutputSize = pixelCount * bytesPerPixel;
        if (output.Length != expectedOutputSize)
        {
            _logger?.LogError("Output pixel data size mismatch: expected {Expected}, got {Actual}", expectedOutputSize, output.Length);
            throw new InvalidOperationException($"Output pixel data size mismatch: expected {expectedOutputSize}, got {output.Length}");
        }
        
        return output;
    }

    private async Task ReadKeyEvent(CancellationToken cancellationToken)
    {
        var buffer = new byte[7];
        await _stream.ReadAsync(buffer, 0, 7, cancellationToken);
        // Handle keyboard input (simplified - implement actual key injection)
    }

    private async Task ReadPointerEvent(CancellationToken cancellationToken)
    {
        var buffer = new byte[5];
        await _stream.ReadAsync(buffer, 0, 5, cancellationToken);
        // Handle mouse input (simplified - implement actual mouse injection)
    }

    private async Task ReadClientCutText(CancellationToken cancellationToken)
    {
        var buffer = new byte[7];
        await _stream.ReadAsync(buffer, 0, 7, cancellationToken);
        var length = BitConverter.ToInt32(buffer.Skip(3).Reverse().ToArray(), 0);
        if (length > 0)
        {
            var textBuffer = new byte[length];
            await _stream.ReadAsync(textBuffer, 0, length, cancellationToken);
        }
    }

    private static byte ReverseBits(byte value)
    {
        // Reverse bits in a byte (VNC DES key preparation)
        byte result = 0;
        for (int i = 0; i < 8; i++)
        {
            result |= (byte)(((value >> i) & 1) << (7 - i));
        }
        return result;
    }

    public void Dispose()
    {
        if (_disposed) return;
        
        _framebufferSource.Dispose();
        _stream?.Close();
        _client?.Close();
        _disposed = true;
    }
}

