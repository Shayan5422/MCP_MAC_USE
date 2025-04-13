# Mac Control MCP Server

This is a Model Context Protocol (MCP) server that allows controlling macOS through an AI interface. It provides tools for executing AppleScript, controlling the mouse and keyboard, and retrieving system information.

## Features

- Execute arbitrary AppleScript commands
- Control mouse movement and clicks
- Simulate keyboard input
- Open applications
- Retrieve system information
- **New**: Control your Mac using natural language with LLM integration

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Run the MCP server:
   ```
   npm start
   ```

3. **For LLM integration**: Set your LLM API key and run the LLM server:
   ```
   export LLM_API_KEY=your-api-key-here
   npm run serve
   ```

## Using the LLM Interface

We've added a web interface that allows you to control your Mac using natural language commands through an LLM. To use it:

1. Run the LLM server:
   ```
   npm run serve
   ```

2. Open your browser and navigate to `http://localhost:3000`

3. Enter natural language commands like:
   - "Open the Notes application"
   - "Type 'Hello World'"
   - "Click at position x=500, y=300"
   - "Show system information"

For more detailed instructions, see the [LLM Integration Guide](INSTRUCTIONS.md).

## Configuration

The server can be configured through environment variables or through the Smithery configuration panel:

- `ENABLE_MOUSE_CONTROL`: Enable or disable mouse control functions (default: true)
- `ENABLE_KEYBOARD_CONTROL`: Enable or disable keyboard input functions (default: true)
- `ENABLE_APPLESCRIPT`: Enable or disable AppleScript execution (default: true)

## Implementation Details

This MCP server follows the standard MCP protocol:
- Uses STDIO for communication (stdin/stdout)
- Expects JSON messages in a specific format
- Returns JSON responses with tool results
- Can be integrated with any LLM or AI system that supports the MCP protocol

## Protocol Format

### Input Format
```json
{
  "type": "tool_call",
  "data": {
    "id": "unique-id",
    "name": "tool_name",
    "params": {
      "param1": "value1"
    }
  }
}
```

### Output Format
```json
{
  "type": "tool_result",
  "data": {
    "id": "unique-id",
    "result": {
      "key": "value"
    }
  }
}
```

## Available Tools

### AppleScript Tools

- **run_applescript**: Execute an arbitrary AppleScript command
- **open_application**: Open a macOS application
- **get_system_info**: Get basic system information

### Keyboard Control Tools

- **type_text**: Type text via keyboard
- **key_press**: Press a keyboard key with optional modifier

### Mouse Control Tools

- **mouse_click**: Perform a mouse click at specific coordinates
- **mouse_move**: Move the mouse to a position

## Deployment on Smithery

This repository includes the necessary configuration files for deployment on Smithery:

- `Dockerfile`: Defines the container build
- `smithery.yaml`: Configuration for the Smithery platform

## Security Considerations

Since this MCP server can control your Mac, it should be used with caution:

- Be careful about allowing arbitrary AppleScript execution in production
- Consider using configuration options to disable features you don't need
- Run in a secure environment with appropriate access controls

## License

MIT 