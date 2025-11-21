# Weasel Developer Guide

This guide provides information for developers working on the Weasel project.

## Project Overview

Weasel is a remote system administration tool consisting of:
- **WeaselHost**: A .NET 8 Windows tray application that hosts an ASP.NET Core web server.
- **webui**: A React + TypeScript Single Page Application (SPA) that serves as the user interface.

## Architecture

The solution follows a Clean Architecture pattern:

### Backend (.NET)

- **WeaselHost**: The entry point. It manages the system tray icon, application lifecycle, and hosts the web server.
- **WeaselHost.Core**: Contains the domain entities, interfaces (Abstractions), and configuration models. This project has no dependencies on infrastructure.
- **WeaselHost.Infrastructure**: Implements the interfaces defined in Core. This includes file system operations, system info retrieval, and Windows service management.
- **WeaselHost.Web**: The ASP.NET Core web application. It defines the API endpoints and serves the static frontend files.

### Frontend (React)

- Located in the `webui` directory.
- Built with Vite, React, TypeScript, and Tailwind CSS.
- Uses SWR for data fetching.
- Uses Monaco Editor for file editing.

## Development Environment Setup

### Prerequisites

- **.NET 8.0 SDK**: [Download here](https://dotnet.microsoft.com/download/dotnet/8.0)
- **Node.js**: [Download here](https://nodejs.org/) (LTS recommended)
- **Visual Studio 2022** or **VS Code**

### Running Locally

1.  **Start the Backend**:
    ```powershell
    dotnet run --project WeaselHost
    ```
    - This starts the tray application.
    - The web server will listen on `http://localhost:7780` (default).
    - Configuration is loaded from `appsettings.json` or `config/appsettings.json`.

2.  **Start the Frontend**:
    ```powershell
    cd webui
    npm install
    npm run dev
    ```
    - The development server runs on `http://localhost:5173`.
    - It proxies API requests to `http://localhost:7780`.

## Project Structure

```
Weasel/
├── WeaselHost/                 # Tray application entry point
├── WeaselHost.Core/            # Interfaces and Models
│   ├── Abstractions/           # Service interfaces
│   ├── Configuration/          # Configuration classes (WeaselHostOptions)
│   └── Models/                 # DTOs
├── WeaselHost.Infrastructure/  # Service implementations
├── WeaselHost.Web/             # API and Web Server
│   └── Program.cs              # API Endpoint definitions
├── webui/                      # React Frontend
└── docs/                       # Documentation
```

## API Endpoints

The API is defined in `WeaselHost.Web/Program.cs`. Key groups include:

- `/api/fs`: File system operations (browse, read, write, upload, bulk actions).
- `/api/system`: System information, event logs, screenshots.
- `/api/processes`: Process management.
- `/api/services`: Windows service management.
- `/api/power`: Power control (shutdown, restart, lock).
- `/api/packages`: Winget package management.
- `/api/disk-monitoring`: Disk usage monitoring and configuration.
- `/api/settings`: Application configuration.

## Key Components

### Disk Monitoring
Implemented in `DiskMonitorService.cs`. It runs as a hosted service (`IHostedService`), periodically checking disk space based on `DiskMonitoringOptions`. It sends email alerts via SMTP if thresholds are breached.

### Authentication
Implemented via middleware in `Program.cs`. If `Security.RequireAuthentication` is true, requests must include the `X-Weasel-Token` header matching the configured password.

## Building for Release

See [DEPLOYMENT.md](DEPLOYMENT.md) for build instructions.

## Contributing

1.  Follow the Clean Architecture separation of concerns.
2.  Define interfaces in `Core` before implementing in `Infrastructure`.
3.  Keep the `Web` project focused on API definition and request handling.
