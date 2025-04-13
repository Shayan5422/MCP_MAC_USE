const applescript = require('applescript');
const robot = require('robotjs');
const readline = require('readline');

// Read configuration from environment variables
const enableMouseControl = process.env.ENABLE_MOUSE_CONTROL !== 'false';
const enableKeyboardControl = process.env.ENABLE_KEYBOARD_CONTROL !== 'false';
const enableAppleScript = process.env.ENABLE_APPLESCRIPT !== 'false';

// Execute AppleScript asynchronously
function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    applescript.execString(script, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Define tools
const tools = [];

// Register AppleScript tools
if (enableAppleScript) {
  tools.push({
    name: 'run_applescript',
    description: 'Execute an AppleScript command',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'The AppleScript code to execute'
        }
      },
      required: ['script']
    }
  });

  tools.push({
    name: 'open_application',
    description: 'Open a macOS application',
    parameters: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description: 'Name of the application to open'
        }
      },
      required: ['app_name']
    }
  });

  tools.push({
    name: 'get_system_info',
    description: 'Get macOS system information',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  });
}

// Register keyboard tools
if (enableKeyboardControl) {
  tools.push({
    name: 'type_text',
    description: 'Type text via keyboard',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to type'
        }
      },
      required: ['text']
    }
  });

  tools.push({
    name: 'key_press',
    description: 'Press a keyboard key',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key to press (e.g., "enter", "escape", "f1")'
        },
        modifier: {
          type: 'string',
          description: 'Modifier key (e.g., "command", "control", "shift", "alt")',
          enum: ['', 'command', 'control', 'shift', 'alt'],
          default: ''
        }
      },
      required: ['key']
    }
  });
}

// Register mouse tools
if (enableMouseControl) {
  tools.push({
    name: 'mouse_click',
    description: 'Perform a mouse click',
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate'
        },
        y: {
          type: 'number',
          description: 'Y coordinate'
        },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          default: 'left',
          description: 'Mouse button to click'
        }
      },
      required: ['x', 'y']
    }
  });

  tools.push({
    name: 'mouse_move',
    description: 'Move the mouse to a position',
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate'
        },
        y: {
          type: 'number',
          description: 'Y coordinate'
        }
      },
      required: ['x', 'y']
    }
  });
}

// Handle tool execution
async function executeTool(toolName, params) {
  try {
    if (toolName === 'run_applescript' && enableAppleScript) {
      const result = await runAppleScript(params.script);
      return { result };
    } 
    else if (toolName === 'open_application' && enableAppleScript) {
      await runAppleScript(`tell application "${params.app_name}" to activate`);
      return { success: true, message: `Opened ${params.app_name}` };
    }
    else if (toolName === 'get_system_info' && enableAppleScript) {
      const macOSVersion = await runAppleScript('return system version of (system info)');
      const computerName = await runAppleScript('return computer name of (system info)');
      const memory = await runAppleScript('return physical memory of (system info)');
      
      return {
        macOSVersion,
        computerName,
        memory
      };
    }
    else if (toolName === 'type_text' && enableKeyboardControl) {
      robot.typeString(params.text);
      return { success: true };
    }
    else if (toolName === 'key_press' && enableKeyboardControl) {
      if (params.modifier) {
        robot.keyToggle(params.modifier, 'down');
      }
      robot.keyTap(params.key);
      if (params.modifier) {
        robot.keyToggle(params.modifier, 'up');
      }
      return { success: true };
    }
    else if (toolName === 'mouse_click' && enableMouseControl) {
      robot.moveMouse(params.x, params.y);
      robot.mouseClick(params.button || 'left');
      return { success: true };
    }
    else if (toolName === 'mouse_move' && enableMouseControl) {
      robot.moveMouse(params.x, params.y);
      return { success: true };
    }
    else {
      return { error: `Tool ${toolName} not found or disabled` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// Send server info on startup
const serverInfo = {
  name: 'Mac Control',
  description: 'Control macOS via AppleScript and keyboard/mouse automation',
  version: '1.0.0',
  tools: tools
};

console.log(JSON.stringify({
  type: 'server_info',
  data: serverInfo
}));

// Process incoming commands
rl.on('line', async (line) => {
  try {
    const message = JSON.parse(line);
    
    if (message.type === 'tool_call') {
      const { id, name, params } = message.data;
      
      const result = await executeTool(name, params);
      
      console.log(JSON.stringify({
        type: 'tool_result',
        data: {
          id,
          result
        }
      }));
    }
  } catch (error) {
    console.log(JSON.stringify({
      type: 'error',
      data: {
        message: error.message
      }
    }));
  }
});

console.log('Mac Control MCP server started with the following settings:', { 
  mouseControl: enableMouseControl,
  keyboardControl: enableKeyboardControl,
  appleScript: enableAppleScript
}); 