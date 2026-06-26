# Kick Discord Rich Presence

Kick Discord Rich Presence is a lightweight desktop application built with **Tauri**, **Rust**, and **React** that automatically updates your Discord Rich Presence based on the live status of a Kick channel.

When a configured channel goes live, the application retrieves stream information from Kick and displays it directly on your Discord profile, including the stream title, category, uptime, and dynamic thumbnail.

## Features

* Automatic Discord Rich Presence updates
* Detects when a Kick channel goes live or offline
* Displays:

  * Stream title
  * Stream category
  * Stream uptime
  * Stream thumbnail
* Dynamic thumbnail refresh to prevent Discord image caching
* Lightweight native desktop application powered by Tauri
* Modern React-based interface
* Easy configuration

## Built With

* Rust
* Tauri
* React
* TypeScript

## Getting Started

### Prerequisites

* Rust
* Node.js or Deno (depending on your setup)
* Tauri prerequisites for your operating system

### Installation

Clone the repository:

```bash
git clone https://github.com/NeisRosver/kick-drp.git
cd kick-drp
```

Install dependencies:

```bash
npm install
```

or

```bash
deno install
```

Start the development environment:

```bash
npm run tauri dev
```

or

```bash
deno task tauri dev
```

## Configuration

Launch the application and configure:

* **Channel** – Your Kick channel name.
* **Discord Client ID** – Your Discord application Client ID.

Save the configuration and start Rich Presence.

## How It Works

1. The application periodically checks the configured Kick channel.
2. When the channel is live, it retrieves stream information.
3. Discord Rich Presence is updated automatically.
4. Stream information refreshes regularly while live.
5. Stream thumbnails are refreshed periodically to avoid Discord cache issues.
6. When the stream ends, Rich Presence returns to an idle state.

## Screenshots

Screenshots will be added soon.

## Roadmap

* Custom Rich Presence themes
* More configurable refresh intervals
* Automatic update notifications
* Multi-channel support
* Localization

## Contributing

Contributions, bug reports, and feature requests are welcome.

Feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
