using System.Net.Sockets;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;

namespace WeaselHost.Infrastructure.Services;

// Windows API interop for input injection
internal static class NativeMethods
{
    [DllImport("user32.dll", SetLastError = true)]
    internal static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    internal static extern bool SetCursorPos(int X, int Y);

    [StructLayout(LayoutKind.Sequential)]
    internal struct INPUT
    {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    internal struct InputUnion
    {
        [FieldOffset(0)]
        public MOUSEINPUT mi;
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    internal const uint INPUT_MOUSE = 0;
    internal const uint INPUT_KEYBOARD = 1;

    internal const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    internal const uint KEYEVENTF_KEYUP = 0x0002;
    internal const uint KEYEVENTF_UNICODE = 0x0004;
    internal const uint KEYEVENTF_SCANCODE = 0x0008;

    internal const uint MOUSEEVENTF_MOVE = 0x0001;
    internal const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    internal const uint MOUSEEVENTF_LEFTUP = 0x0004;
    internal const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    internal const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    internal const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    internal const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    internal const uint MOUSEEVENTF_WHEEL = 0x0800;
    internal const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
}

public class VncConnectionHandler : IDisposable
{
    private readonly TcpClient _client;
    private readonly NetworkStream _stream;
    private readonly string? _password;
    private readonly ILogger<VncService>? _logger;
    private readonly ScreenFramebufferSource _framebufferSource;
    private bool _disposed;
    private byte _lastButtonMask = 0;
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

    public VncConnectionHandler(TcpClient client, string? password, ILoggerFactory? loggerFactory, ILogger<VncService>? logger)
    {
        _client = client;
        _stream = client.GetStream();
        _password = password;
        _logger = logger;
        _framebufferSource = new ScreenFramebufferSource(loggerFactory?.CreateLogger<ScreenFramebufferSource>());
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

                // Blocking read - wait for client messages
                // This will block until data is available or connection is closed
                var bytesRead = await _stream.ReadAsync(buffer, 0, 1, cancellationToken);
                if (bytesRead == 0)
                {
                    _logger?.LogInformation("VNC client closed connection (0 bytes read)");
                    break;
                }

                var messageType = buffer[0];
                
                switch (messageType)
                {
                    case 0: // SetPixelFormat
                        await ReadSetPixelFormat(cancellationToken);
                        break;
                    case 2: // SetEncodings
                        await ReadSetEncodings(cancellationToken);
                        break;
                    case 3: // FramebufferUpdateRequest
                        await HandleFramebufferUpdateRequest(cancellationToken);
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
            catch (IOException ex) when (ex.InnerException is SocketException socketEx &&
                                          (socketEx.ErrorCode == 10053 || socketEx.ErrorCode == 10054 || socketEx.ErrorCode == 995))
            {
                // Connection closed/aborted by client - this is expected during disconnection
                _logger?.LogDebug("Client disconnected during message loop (socket error {ErrorCode})",
                    ((SocketException)ex.InnerException).ErrorCode);
                break;
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Unexpected error in VNC message loop");
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

        _logger?.LogInformation("Client pixel format: {BitsPerPixel}bpp, depth={Depth}, R={RedMax}@{RedShift}, G={GreenMax}@{GreenShift}, B={BlueMax}@{BlueShift}, BigEndian={BigEndian}",
            buffer[3], buffer[4], BitConverter.ToUInt16(buffer.Skip(7).Take(2).Reverse().ToArray(), 0), buffer[13],
            BitConverter.ToUInt16(buffer.Skip(9).Take(2).Reverse().ToArray(), 0), buffer[14],
            BitConverter.ToUInt16(buffer.Skip(11).Take(2).Reverse().ToArray(), 0), buffer[15],
            buffer[5] != 0);
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
        }
        catch (IOException ex) when (ex.InnerException is SocketException socketEx &&
                                      (socketEx.ErrorCode == 10053 || socketEx.ErrorCode == 10054 || socketEx.ErrorCode == 995))
        {
            // Connection closed/aborted by client - this is expected during disconnection
            _logger?.LogDebug("Client disconnected during framebuffer update (socket error {ErrorCode})",
                ((SocketException)ex.InnerException).ErrorCode);
            throw; // Re-throw to exit the message loop
        }
        catch (OperationCanceledException)
        {
            // Cancellation requested - normal shutdown
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Unexpected error sending framebuffer update");
            throw;
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

        // VNC KeyEvent format: [padding:1][down-flag:1][padding:2][key:4]
        var downFlag = buffer[1];
        var keysym = BitConverter.ToUInt32(new byte[] { buffer[7], buffer[6], buffer[5], buffer[4] }, 0);

        // Convert VNC keysym to Windows virtual key code
        var vk = ConvertKeysymToVirtualKey(keysym);
        if (vk == 0)
        {
            _logger?.LogDebug("Unknown keysym: 0x{Keysym:X8}", keysym);
            return;
        }

        // Inject keyboard event
        var input = new NativeMethods.INPUT
        {
            type = NativeMethods.INPUT_KEYBOARD,
            u = new NativeMethods.InputUnion
            {
                ki = new NativeMethods.KEYBDINPUT
                {
                    wVk = vk,
                    wScan = 0,
                    dwFlags = downFlag == 0 ? NativeMethods.KEYEVENTF_KEYUP : 0,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            }
        };

        NativeMethods.SendInput(1, new[] { input }, Marshal.SizeOf(typeof(NativeMethods.INPUT)));
    }

    private async Task ReadPointerEvent(CancellationToken cancellationToken)
    {
        var buffer = new byte[5];
        await _stream.ReadAsync(buffer, 0, 5, cancellationToken);

        // VNC PointerEvent format: [button-mask:1][x:2][y:2]
        var buttonMask = buffer[0];
        var x = (ushort)((buffer[1] << 8) | buffer[2]);
        var y = (ushort)((buffer[3] << 8) | buffer[4]);

        // Move cursor to absolute position
        NativeMethods.SetCursorPos(x, y);

        // Handle button events
        var inputs = new List<NativeMethods.INPUT>();

        // Left button (bit 0)
        if ((buttonMask & 0x01) != (_lastButtonMask & 0x01))
        {
            inputs.Add(new NativeMethods.INPUT
            {
                type = NativeMethods.INPUT_MOUSE,
                u = new NativeMethods.InputUnion
                {
                    mi = new NativeMethods.MOUSEINPUT
                    {
                        dx = 0,
                        dy = 0,
                        mouseData = 0,
                        dwFlags = (buttonMask & 0x01) != 0 ? NativeMethods.MOUSEEVENTF_LEFTDOWN : NativeMethods.MOUSEEVENTF_LEFTUP,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            });
        }

        // Middle button (bit 1)
        if ((buttonMask & 0x02) != (_lastButtonMask & 0x02))
        {
            inputs.Add(new NativeMethods.INPUT
            {
                type = NativeMethods.INPUT_MOUSE,
                u = new NativeMethods.InputUnion
                {
                    mi = new NativeMethods.MOUSEINPUT
                    {
                        dx = 0,
                        dy = 0,
                        mouseData = 0,
                        dwFlags = (buttonMask & 0x02) != 0 ? NativeMethods.MOUSEEVENTF_MIDDLEDOWN : NativeMethods.MOUSEEVENTF_MIDDLEUP,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            });
        }

        // Right button (bit 2)
        if ((buttonMask & 0x04) != (_lastButtonMask & 0x04))
        {
            inputs.Add(new NativeMethods.INPUT
            {
                type = NativeMethods.INPUT_MOUSE,
                u = new NativeMethods.InputUnion
                {
                    mi = new NativeMethods.MOUSEINPUT
                    {
                        dx = 0,
                        dy = 0,
                        mouseData = 0,
                        dwFlags = (buttonMask & 0x04) != 0 ? NativeMethods.MOUSEEVENTF_RIGHTDOWN : NativeMethods.MOUSEEVENTF_RIGHTUP,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            });
        }

        // Mouse wheel (bits 3-4)
        if ((buttonMask & 0x08) != 0) // Scroll up
        {
            inputs.Add(new NativeMethods.INPUT
            {
                type = NativeMethods.INPUT_MOUSE,
                u = new NativeMethods.InputUnion
                {
                    mi = new NativeMethods.MOUSEINPUT
                    {
                        dx = 0,
                        dy = 0,
                        mouseData = 120, // Positive = scroll up
                        dwFlags = NativeMethods.MOUSEEVENTF_WHEEL,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            });
        }
        else if ((buttonMask & 0x10) != 0) // Scroll down
        {
            inputs.Add(new NativeMethods.INPUT
            {
                type = NativeMethods.INPUT_MOUSE,
                u = new NativeMethods.InputUnion
                {
                    mi = new NativeMethods.MOUSEINPUT
                    {
                        dx = 0,
                        dy = 0,
                        mouseData = unchecked((uint)-120), // Negative = scroll down
                        dwFlags = NativeMethods.MOUSEEVENTF_WHEEL,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            });
        }

        if (inputs.Count > 0)
        {
            NativeMethods.SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(NativeMethods.INPUT)));
        }

        _lastButtonMask = buttonMask;
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

    private static ushort ConvertKeysymToVirtualKey(uint keysym)
    {
        // Map VNC keysyms to Windows Virtual Key codes
        // Latin-1 characters (0x0020 - 0x007E) and some extended (0x00A0 - 0x00FF)
        if (keysym >= 0x20 && keysym <= 0x7E)
        {
            // Direct ASCII mapping for printable characters
            return (ushort)keysym;
        }

        // Special keys mapping
        return keysym switch
        {
            // Function keys
            0xFFBE => 0x70, // F1
            0xFFBF => 0x71, // F2
            0xFFC0 => 0x72, // F3
            0xFFC1 => 0x73, // F4
            0xFFC2 => 0x74, // F5
            0xFFC3 => 0x75, // F6
            0xFFC4 => 0x76, // F7
            0xFFC5 => 0x77, // F8
            0xFFC6 => 0x78, // F9
            0xFFC7 => 0x79, // F10
            0xFFC8 => 0x7A, // F11
            0xFFC9 => 0x7B, // F12

            // Cursor control
            0xFF50 => 0x24, // Home
            0xFF51 => 0x25, // Left arrow
            0xFF52 => 0x26, // Up arrow
            0xFF53 => 0x27, // Right arrow
            0xFF54 => 0x28, // Down arrow
            0xFF55 => 0x21, // Page Up
            0xFF56 => 0x22, // Page Down
            0xFF57 => 0x23, // End

            // Editing
            0xFF63 => 0x2D, // Insert
            0xFFFF => 0x2E, // Delete
            0xFF08 => 0x08, // Backspace
            0xFF09 => 0x09, // Tab
            0xFF0D => 0x0D, // Return/Enter
            0xFF1B => 0x1B, // Escape

            // Modifiers
            0xFFE1 => 0xA0, // Left Shift
            0xFFE2 => 0xA1, // Right Shift
            0xFFE3 => 0xA2, // Left Control
            0xFFE4 => 0xA3, // Right Control
            0xFFE5 => 0x12, // Caps Lock
            0xFFE7 => 0x5B, // Left Windows/Meta
            0xFFE8 => 0x5C, // Right Windows/Meta
            0xFFE9 => 0xA4, // Left Alt
            0xFFEA => 0xA5, // Right Alt
            0xFF20 => 0x10, // Shift (generic)

            // Numeric keypad
            0xFF9C => 0x0D, // Keypad Enter
            0xFFAA => 0x6A, // Keypad *
            0xFFAB => 0x6B, // Keypad +
            0xFFAD => 0x6D, // Keypad -
            0xFFAE => 0x6E, // Keypad .
            0xFFAF => 0x6F, // Keypad /
            0xFFB0 => 0x60, // Keypad 0
            0xFFB1 => 0x61, // Keypad 1
            0xFFB2 => 0x62, // Keypad 2
            0xFFB3 => 0x63, // Keypad 3
            0xFFB4 => 0x64, // Keypad 4
            0xFFB5 => 0x65, // Keypad 5
            0xFFB6 => 0x66, // Keypad 6
            0xFFB7 => 0x67, // Keypad 7
            0xFFB8 => 0x68, // Keypad 8
            0xFFB9 => 0x69, // Keypad 9

            // System keys
            0xFF61 => 0x2C, // Print Screen
            0xFF14 => 0x91, // Scroll Lock
            0xFF13 => 0x13, // Pause

            // Space
            0x20 => 0x20,

            _ => 0 // Unknown key
        };
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

