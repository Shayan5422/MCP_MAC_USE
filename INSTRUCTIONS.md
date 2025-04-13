# LLM Mac Control System User Guide

This system allows you to control your macOS using natural language commands and large language models (LLMs).

## Installation and Setup

1. First, make sure Node.js is installed on your system.
2. Install the required packages:
   ```
   npm install
   ```
3. Set your language model API key:
   ```
   export LLM_API_KEY=your-api-key-here
   ```
   
   (On Windows, use `set LLM_API_KEY=your-api-key-here`)

4. Run the server:
   ```
   npm run serve
   ```

5. Open your browser and go to `http://localhost:3000`.

## How to Use

1. On the web page, enter your request in natural language:
   - "Open the Notes application"
   - "Click at coordinates x=500 and y=300"
   - "Type hello world"
   - "Show system information"
   - "Turn off Bluetooth"

2. Click the "Send to LLM" button.

3. The language model analyzes your request and selects the appropriate tool to execute it.

4. The MCP server executes the command and displays the result.

## Chained Commands (New)

This system supports executing chained commands, allowing you to perform multiple operations in a single request:

- "Open Settings and turn off Bluetooth"
- "Open Finder and create a new folder"
- "Open Notes and type 'Important note'"

The system executes these commands step by step and sends the result of each step to the LLM to properly execute the next step.

## User Sessions

The system supports user sessions that allow you to maintain state between requests:

- Each user receives a unique session ID
- The history of past actions is stored in each session
- You can start a new session by clicking the "Clear Session" button

## Available Tools

The system supports the following tools:

### AppleScript Execution
- **run_applescript**: Execute AppleScript commands
- **open_application**: Open an application
- **get_system_info**: Get system information
- **check_macos_version**: Check macOS version for compatibility with System Preferences/Settings
- **toggle_bluetooth**: Turn Bluetooth on or off

### Keyboard Control
- **type_text**: Type text
- **key_press**: Press a key

### Mouse Control
- **mouse_click**: Click at a specific position
- **mouse_move**: Move the mouse to a specific position

## Compatibility with Different macOS Versions

The system automatically detects your macOS version and selects the appropriate methods to work with it:

- In macOS Ventura (13) and later: Uses "System Settings"
- In older versions: Uses "System Preferences"

This automatic detection capability ensures that commands like Bluetooth control work across all macOS versions.

## Security Notes

- This system allows language models to control your system, so use it with caution.
- Never enter sensitive information in your requests.
- If you don't need them, disable keyboard or mouse control capabilities.

## Troubleshooting

- If you receive a "MCP server not ready" error, restart the server.
- If you encounter an LLM-related error, check your API key.
- For more information, check the server logs.
- If your chained command executes incompletely, break it into smaller parts or state the command more clearly.
- If you have trouble controlling system settings, use the `check_macos_version` tool to check compatibility. 