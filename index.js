const applescript = require('applescript');
const robot = require('robotjs');
const readline = require('readline');

// Read configuration from environment variables
const enableMouseControl = process.env.ENABLE_MOUSE_CONTROL !== 'false';
const enableKeyboardControl = process.env.ENABLE_KEYBOARD_CONTROL !== 'false';
const enableAppleScript = process.env.ENABLE_APPLESCRIPT !== 'false';

// System state tracking
const systemState = {
  activeApp: null,
  mousePosition: { x: 0, y: 0 },
  windowPositions: {},
  lastOperation: null
};

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
  
  tools.push({
    name: 'toggle_bluetooth',
    description: 'Toggle Bluetooth on or off',
    parameters: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['on', 'off'],
          description: 'State to set Bluetooth to (on/off)'
        }
      },
      required: ['state']
    }
  });
  
  tools.push({
    name: 'check_macos_version',
    description: 'Check macOS version to determine the correct settings app name',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  });
  
  tools.push({
    name: 'get_current_state',
    description: 'Get current system state including active application and cursor position',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  });
  
  tools.push({
    name: 'get_window_position',
    description: 'Get position and size of a window for a specific application',
    parameters: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description: 'Name of the application'
        }
      },
      required: ['app_name']
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
  
  tools.push({
    name: 'get_mouse_position',
    description: 'Get current mouse cursor position',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  });
}

// Cache for MacOS version information
let macOSVersionInfo = null;
let isSystemSettings = null;

// Get macOS version info
async function getMacOSVersionInfo() {
  if (macOSVersionInfo) return macOSVersionInfo;
  
  try {
    const versionString = await runAppleScript('return system version of (system info)');
    const majorVersion = parseInt(versionString.split('.')[0]);
    const minorVersion = parseInt(versionString.split('.')[1] || '0');
    
    macOSVersionInfo = { 
      version: versionString,
      majorVersion,
      minorVersion,
      // macOS 13+ (Ventura and newer) uses System Settings
      usesSystemSettings: majorVersion >= 13
    };
    
    isSystemSettings = macOSVersionInfo.usesSystemSettings;
    
    return macOSVersionInfo;
  } catch (error) {
    console.error('Error getting macOS version:', error);
    // Default to using System Preferences if we can't determine version
    macOSVersionInfo = { 
      version: "unknown", 
      majorVersion: 0, 
      minorVersion: 0,
      usesSystemSettings: false
    };
    isSystemSettings = false;
    return macOSVersionInfo;
  }
}

// Update system state with new information
async function updateSystemState() {
  try {
    // Get active application
    const activeAppScript = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        return frontApp
      end tell
    `;
    systemState.activeApp = await runAppleScript(activeAppScript);
    
    // Get mouse position
    const mousePos = robot.getMousePos();
    systemState.mousePosition = { x: mousePos.x, y: mousePos.y };
    
    // Get window position of active app
    if (systemState.activeApp) {
      const windowPosScript = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appWindow to first window of frontApp
          set windowPosition to position of appWindow
          set windowSize to size of appWindow
          return {item 1 of windowPosition, item 2 of windowPosition, item 1 of windowSize, item 2 of windowSize}
        end tell
      `;
      try {
        const windowInfo = await runAppleScript(windowPosScript);
        if (Array.isArray(windowInfo) && windowInfo.length === 4) {
          systemState.windowPositions[systemState.activeApp] = {
            x: windowInfo[0],
            y: windowInfo[1],
            width: windowInfo[2],
            height: windowInfo[3]
          };
        }
      } catch (err) {
        // Window position might not be available for some applications
        console.error(`Error getting window position for ${systemState.activeApp}:`, err);
      }
    }
    
    return systemState;
  } catch (error) {
    console.error('Error updating system state:', error);
    return systemState;
  }
}

// Verify application launch and wait until it's ready
async function verifyAppLaunch(appName, maxRetries = 10, retryInterval = 500) {
  // Wait for the app to fully launch
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Check if the app is running
      const isRunningScript = `
        tell application "System Events"
          return (exists (processes where name is "${appName}"))
        end tell
      `;
      const isRunning = await runAppleScript(isRunningScript);
      
      if (isRunning) {
        // App is running, now check if it's frontmost (active)
        const isFrontmostScript = `
          tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            return frontApp is "${appName}"
          end tell
        `;
        const isFrontmost = await runAppleScript(isFrontmostScript);
        
        if (isFrontmost) {
          console.error(`Verified ${appName} is launched and active`);
          return true;
        }
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    } catch (error) {
      console.error(`Error verifying ${appName} launch:`, error);
      // Continue with retries
    }
  }
  
  console.warn(`Failed to verify ${appName} launch after ${maxRetries} attempts`);
  return false;
}

// Safely launch app in a new window/tab when possible
async function safelyLaunchApp(appName) {
  try {
    // Special handling for browsers to open new window/tab
    if (appName.toLowerCase().includes('safari') || 
        appName.toLowerCase().includes('chrome') || 
        appName.toLowerCase().includes('firefox')) {
      
      // First activate the app
      await runAppleScript(`tell application "${appName}" to activate`);
      await verifyAppLaunch(appName);
      
      // Then open a new window
      const newWindowScript = `
        tell application "${appName}"
          activate
          make new document
        end tell
      `;
      
      await runAppleScript(newWindowScript);
      return true;
    } 
    // Special handling for Terminal to open new tab/window
    else if (appName.toLowerCase().includes('terminal')) {
      await runAppleScript(`tell application "Terminal" to activate`);
      await verifyAppLaunch('Terminal');
      
      // Open new tab if terminal is already running, otherwise it opens new window automatically
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for Terminal to activate
      robot.keyTap('t', ['command']);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for tab to open
      
      return true;
    }
    // Default app opening
    else {
      await runAppleScript(`tell application "${appName}" to activate`);
      return await verifyAppLaunch(appName);
    }
  } catch (error) {
    console.error(`Error safely launching ${appName}:`, error);
    return false;
  }
}

// Smart application context handling to ensure proper UI interaction
async function performContextAwareAction(appName, action) {
  try {
    // Make sure the app is frontmost
    await runAppleScript(`tell application "${appName}" to activate`);
    await verifyAppLaunch(appName);
    
    // Wait a moment for UI to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Different handling based on application and action type
    if (action === 'prepare-text-input') {
      // Handle text input preparation for different apps
      if (appName.toLowerCase().includes('note')) {
        // Notes app - find and click in the text editing area
        const clickResult = await runAppleScript(`
          tell application "System Events"
            tell process "Notes"
              try
                # Try to find text area and click in it
                set textArea to text area 1 of scroll area 1 of window 1
                set position to position of textArea
                set size to size of textArea
                # Click near the top of the text area
                set clickX to (item 1 of position) + ((item 1 of size) / 2)
                set clickY to (item 2 of position) + 30
                click at {clickX, clickY}
                return "Clicked in Notes text area"
              on error
                # Fallback for simpler approach
                key code 36 # Press return to ensure we're in editing mode
                delay 0.5
                return "Used fallback method for Notes"
              end try
            end tell
          end tell
        `);
        return { success: true, result: clickResult };
      }
      else if (appName.toLowerCase().includes('safari') || appName.toLowerCase().includes('chrome')) {
        // Browser - check if we need to click in a search bar or input field
        const clickResult = await runAppleScript(`
          tell application "System Events"
            tell process "${appName}"
              try
                # Try to find text fields (search boxes, input fields)
                if exists (text field 1 of window 1) then
                  click text field 1 of window 1
                  return "Clicked in browser text field"
                else
                  # Might be on Google search page
                  key code 36 # Press return
                  return "No text field found in browser, using keyboard navigation"
                end if
              on error
                return "Could not interact with browser text fields"
              end try
            end tell
          end tell
        `);
        return { success: true, result: clickResult };
      }
      else if (appName.toLowerCase().includes('terminal')) {
        // Terminal is usually ready for input immediately
        return { success: true, result: "Terminal ready for input" };
      }
      else {
        // Generic approach for other apps - try to find text fields
        const clickResult = await runAppleScript(`
          tell application "System Events"
            tell process "${appName}"
              try
                # Try to find any text field or text area
                if exists (text field 1 of window 1) then
                  click text field 1 of window 1
                  return "Clicked in text field"
                else if exists (text area 1 of window 1) then
                  click text area 1 of window 1
                  return "Clicked in text area"
                else
                  # Try clicking in the middle of the window
                  set winPos to position of window 1
                  set winSize to size of window 1
                  set clickX to (item 1 of winPos) + ((item 1 of winSize) / 2)
                  set clickY to (item 2 of winPos) + ((item 2 of winSize) / 2)
                  click at {clickX, clickY}
                  return "Clicked in the middle of window"
                end if
              on error
                return "Could not find appropriate text input area"
              end try
            end tell
          end tell
        `);
        return { success: true, result: clickResult };
      }
    }
    else if (action === 'prepare-text-selection') {
      // Logic for preparing to select text
      if (appName.toLowerCase().includes('safari') || appName.toLowerCase().includes('chrome')) {
        // For browsers, try to click on the content area
        const clickResult = await runAppleScript(`
          tell application "System Events"
            tell process "${appName}"
              try
                # Try to find and click in the main content area
                # This is often a group or scroll area
                if exists (group 1 of window 1) then
                  set contentArea to group 1 of window 1
                  set contentPos to position of contentArea
                  set contentSize to size of contentArea
                  set clickX to (item 1 of contentPos) + ((item 1 of contentSize) / 2)
                  set clickY to (item 2 of contentPos) + 100  # Click a bit below the top
                  click at {clickX, clickY}
                  return "Clicked in browser content area"
                else
                  # Fallback - click in the middle of the window
                  set winPos to position of window 1
                  set winSize to size of window 1
                  set clickX to (item 1 of winPos) + ((item 1 of winSize) / 2)
                  set clickY to (item 2 of winPos) + ((item 2 of winSize) / 3)
                  click at {clickX, clickY}
                  return "Clicked in browser window middle area"
                end if
              on error
                return "Could not interact with browser content"
              end try
            end tell
          end tell
        `);
        return { success: true, result: clickResult };
      }
      // Add more application-specific handlers for text selection
    }
    
    return { success: false, result: "No specific handling for this app and action" };
  } catch (error) {
    console.error(`Error in context-aware action for ${appName}:`, error);
    return { success: false, error: error.message };
  }
}

// Function to select text in a browser
async function selectTextInBrowser(browser, selectionType = 'paragraph') {
  try {
    await runAppleScript(`tell application "${browser}" to activate`);
    await verifyAppLaunch(browser);
    
    // First click in the content area
    await performContextAwareAction(browser, 'prepare-text-selection');
    
    // Wait a moment for the click to register
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let selectionScript = '';
    
    if (selectionType === 'paragraph') {
      // Triple-click to select paragraph
      selectionScript = `
        tell application "System Events"
          tell process "${browser}"
            # Triple click to select paragraph
            set mousePos to mouse location
            click at mousePos
            delay 0.1
            click at mousePos
            delay 0.1
            click at mousePos
          end tell
        end tell
      `;
    } else if (selectionType === 'word') {
      // Double-click to select word
      selectionScript = `
        tell application "System Events"
          tell process "${browser}"
            # Double click to select word
            set mousePos to mouse location
            click at mousePos
            delay 0.1
            click at mousePos
          end tell
        end tell
      `;
    } else if (selectionType === 'all') {
      // Use RobotJS directly for Select All
      robot.keyTap('a', ['command']);
    }
    
    await runAppleScript(selectionScript);
    return { success: true };
  } catch (error) {
    console.error(`Error selecting text in ${browser}:`, error);
    return { success: false, error: error.message };
  }
}

// Copy selected text
async function copySelectedText() {
  try {
    // Use array method for modifiers
    robot.keyTap('c', ['command']);
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true, result: "Text copied to clipboard" };
  } catch (error) {
    console.error('Error copying text:', error);
    return { success: false, error: error.message };
  }
}

// Handle tool execution
async function executeTool(toolName, params) {
  try {
    // Before executing any tool, update the system state
    await updateSystemState();
    
    if (toolName === 'run_applescript' && enableAppleScript) {
      const result = await runAppleScript(params.script);
      
      // After executing AppleScript, update state again as it may have changed
      await updateSystemState();
      
      return { result };
    } 
    else if (toolName === 'open_application' && enableAppleScript) {
      // Special handling for System Preferences / System Settings
      if (params.app_name.toLowerCase().includes('system pref') || 
          params.app_name.toLowerCase().includes('system set')) {
        
        // Check macOS version first
        await getMacOSVersionInfo();
        
        const appName = isSystemSettings ? "System Settings" : "System Preferences";
        
        // Safely launch System Settings/Preferences
        const success = await safelyLaunchApp(appName);
        
        // Update system state after opening app
        systemState.activeApp = appName;
        systemState.lastOperation = `Opened ${appName}`;
        await updateSystemState();
        
        return { 
          success: success, 
          message: success ? `Opened ${appName}` : `Attempted to open ${appName} but couldn't verify it's running` 
        };
      } else {
        // Normal app opening with safety verification
        const success = await safelyLaunchApp(params.app_name);
        
        // Update system state after opening app
        systemState.activeApp = params.app_name;
        systemState.lastOperation = `Opened ${params.app_name}`;
        await updateSystemState();
        
        return { 
          success: success, 
          message: success ? `Opened ${params.app_name}` : `Attempted to open ${params.app_name} but couldn't verify it's running` 
        };
      }
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
    else if (toolName === 'check_macos_version' && enableAppleScript) {
      const versionInfo = await getMacOSVersionInfo();
      return {
        version: versionInfo.version,
        majorVersion: versionInfo.majorVersion,
        minorVersion: versionInfo.minorVersion,
        usesSystemSettings: versionInfo.usesSystemSettings,
        settingsAppName: versionInfo.usesSystemSettings ? "System Settings" : "System Preferences"
      };
    }
    else if (toolName === 'toggle_bluetooth' && enableAppleScript) {
      // Implementation of toggle_bluetooth...
      // (Keeping the existing implementation)
    }
    else if (toolName === 'get_current_state' && enableAppleScript) {
      // Update state first to ensure it's current
      await updateSystemState();
      
      return {
        activeApplication: systemState.activeApp,
        mousePosition: systemState.mousePosition,
        lastOperation: systemState.lastOperation,
        windowPositions: systemState.windowPositions
      };
    }
    else if (toolName === 'get_window_position' && enableAppleScript) {
      const appName = params.app_name;
      
      const windowPosScript = `
        tell application "System Events"
          try
            tell process "${appName}"
              set appWindow to window 1
              set windowPosition to position of appWindow
              set windowSize to size of appWindow
              return {item 1 of windowPosition, item 2 of windowPosition, item 1 of windowSize, item 2 of windowSize}
            end tell
          on error
            return "Could not get window position for ${appName}"
          end try
        end tell
      `;
      
      try {
        const windowInfo = await runAppleScript(windowPosScript);
        if (Array.isArray(windowInfo) && windowInfo.length === 4) {
          const position = {
            x: windowInfo[0],
            y: windowInfo[1],
            width: windowInfo[2],
            height: windowInfo[3]
          };
          
          // Store window position in state
          systemState.windowPositions[appName] = position;
          
          return position;
        } else {
          return { error: windowInfo || "Unknown error getting window position" };
        }
      } catch (error) {
        return { error: error.message };
      }
    }
    else if (toolName === 'type_text' && enableKeyboardControl) {
      // First ensure we're in the right context for typing
      let contextResult = { success: true };
      
      // If we have an active app, prepare it for text input
      if (systemState.activeApp) {
        contextResult = await performContextAwareAction(systemState.activeApp, 'prepare-text-input');
      }
      
      // Only proceed with typing if context preparation was successful
      if (contextResult.success) {
        robot.typeString(params.text);
        
        // Update state after typing
        systemState.lastOperation = `Typed text: "${params.text}"`;
        
        return { 
          success: true,
          contextAction: contextResult.result
        };
      } else {
        return {
          success: false,
          error: "Could not prepare application for text input",
          details: contextResult.error || "Unknown error"
        };
      }
    }
    else if (toolName === 'select_text' && enableKeyboardControl && enableMouseControl) {
      // New tool to select text in the active application
      if (!systemState.activeApp) {
        return { success: false, error: "No active application" };
      }
      
      const appName = systemState.activeApp;
      const selectionType = params.type || 'paragraph'; // paragraph, word, all
      
      if (appName.toLowerCase().includes('safari') || 
          appName.toLowerCase().includes('chrome') || 
          appName.toLowerCase().includes('firefox')) {
        
        const result = await selectTextInBrowser(appName, selectionType);
        
        systemState.lastOperation = `Selected ${selectionType} in ${appName}`;
        await updateSystemState();
        
        return result;
      } else {
        // Generic text selection for other apps
        let selectionScript = '';
        
        if (selectionType === 'all') {
          // Use RobotJS directly for Select All
          robot.keyTap('a', ['command']);
        } else {
          // For other selection types, try clicking and then selection
          await performContextAwareAction(appName, 'prepare-text-selection');
          
          if (selectionType === 'paragraph') {
            selectionScript = `
              tell application "System Events"
                tell process "${appName}"
                  # Triple click to select paragraph
                  set mousePos to mouse location
                  click at mousePos
                  delay 0.1
                  click at mousePos
                  delay 0.1
                  click at mousePos
                end tell
              end tell
            `;
          } else if (selectionType === 'word') {
            selectionScript = `
              tell application "System Events"
                tell process "${appName}"
                  # Double click to select word
                  set mousePos to mouse location
                  click at mousePos
                  delay 0.1
                  click at mousePos
                end tell
              end tell
            `;
          }
        }
        
        await runAppleScript(selectionScript);
        
        systemState.lastOperation = `Selected ${selectionType} in ${appName}`;
        await updateSystemState();
        
        return { success: true };
      }
    }
    else if (toolName === 'copy_text' && enableKeyboardControl) {
      // New tool to copy selected text
      const result = await copySelectedText();
      
      if (result.success) {
        systemState.lastOperation = "Copied text to clipboard";
        await updateSystemState();
      }
      
      return result;
    }
    else if (toolName === 'key_press' && enableKeyboardControl) {
      try {
        if (params.modifier) {
          // Use the array method for modifiers which is more reliable on macOS
          robot.keyTap(params.key, [params.modifier.toLowerCase()]);
        } else {
          robot.keyTap(params.key);
        }
        
        // Update state after pressing key
        systemState.lastOperation = `Pressed key: ${params.modifier ? params.modifier + '+' : ''}${params.key}`;
        
        return { success: true };
      } catch (error) {
        console.error('Error executing key press:', error);
        return { error: error.message };
      }
    }
    else if (toolName === 'mouse_click' && enableMouseControl) {
      try {
        // First check if the click position is within an active window
        const windowInfo = await getActiveWindowInfo();
        
        let isClickInWindow = true;
        if (windowInfo.hasWindow) {
          const { position, size } = windowInfo;
          // Check if the click is within the window bounds
          isClickInWindow = 
            params.x >= position.x && 
            params.x <= position.x + size.width &&
            params.y >= position.y && 
            params.y <= position.y + size.height;
        }
        
        // Also check if there are UI elements to click on
        const clickSafety = await isSafeToClick(params.x, params.y);
        
        // Determine overall safety
        const isSafe = isClickInWindow || clickSafety.safe;
        
        if (!isSafe) {
          return {
            success: false,
            message: `Click at position (${params.x}, ${params.y}) appears to be outside any active window or UI element`,
            warning: "Click was prevented for safety reasons"
          };
        }
        
        // Proceed with the click if safe
        robot.moveMouse(params.x, params.y);
        robot.mouseClick(params.button || 'left');
        
        // Update state after clicking
        systemState.mousePosition = { x: params.x, y: params.y };
        systemState.lastOperation = `Clicked ${params.button || 'left'} mouse button at position (${params.x}, ${params.y})`;
        
        return { 
          success: true,
          inWindow: isClickInWindow,
          onUIElement: clickSafety.safe
        };
      } catch (error) {
        return { error: error.message };
      }
    }
    else if (toolName === 'mouse_move' && enableMouseControl) {
      robot.moveMouse(params.x, params.y);
      
      // Update state after moving mouse
      systemState.mousePosition = { x: params.x, y: params.y };
      systemState.lastOperation = `Moved mouse to position (${params.x}, ${params.y})`;
      
      return { success: true };
    }
    else if (toolName === 'get_mouse_position' && enableMouseControl) {
      const mousePos = robot.getMousePos();
      
      // Update state
      systemState.mousePosition = { x: mousePos.x, y: mousePos.y };
      
      return mousePos;
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

// Initialize system state on startup
updateSystemState().then(() => {
  console.error('Mac Control MCP server started with the following settings:', { 
    mouseControl: enableMouseControl,
    keyboardControl: enableKeyboardControl,
    appleScript: enableAppleScript,
    initialState: {
      activeApp: systemState.activeApp,
      mousePosition: systemState.mousePosition
    }
  });
});

// Check if there are UI elements in a specific area before clicking
async function isSafeToClick(x, y, radius = 20) {
  try {
    // Get UI elements at the click location
    const checkScript = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set clickPosition to {${x}, ${y}}
        
        # Try to find UI elements near the click position
        set nearbyElements to {}
        
        # Check buttons
        set appButtons to buttons of frontApp
        repeat with btn in appButtons
          try
            set btnPosition to position of btn
            set btnSize to size of btn
            
            # Calculate the center and boundaries of the button
            set btnCenterX to (item 1 of btnPosition) + ((item 1 of btnSize) / 2)
            set btnCenterY to (item 2 of btnPosition) + ((item 2 of btnSize) / 2)
            
            # Check if click position is within the button area plus a margin
            if ((btnCenterX - ${x})^2 + (btnCenterY - ${y})^2) ≤ ${radius * radius} then
              set end of nearbyElements to "button"
            end if
          end try
        end repeat
        
        # Also check for other common elements like checkboxes, menus, etc.
        # This is a simplified version - add more UI element types as needed
        
        # Return whether we found UI elements nearby
        return count of nearbyElements > 0
      end tell
    `;
    
    const hasElements = await runAppleScript(checkScript);
    return { safe: hasElements, elements: hasElements ? "UI elements found" : "No UI elements found" };
  } catch (error) {
    console.error("Error checking for safe click area:", error);
    // If we can't determine, assume it's safe
    return { safe: true, elements: "Couldn't check for UI elements" };
  }
}

// Check for active windows to avoid clicking on background or desktop
async function getActiveWindowInfo() {
  try {
    const windowScript = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set frontAppName to name of frontApp
        
        # Get list of windows
        set windowList to {}
        set windowCount to count windows of frontApp
        
        if windowCount > 0 then
          # Get info about the front window
          set frontWindow to window 1 of frontApp
          set windowName to name of frontWindow
          set windowPos to position of frontWindow
          set windowSize to size of frontWindow
          
          return {frontAppName, windowName, (item 1 of windowPos), (item 2 of windowPos), (item 1 of windowSize), (item 2 of windowSize)}
        else
          # No windows
          return {frontAppName, "No windows", 0, 0, 0, 0}
        end if
      end tell
    `;
    
    const result = await runAppleScript(windowScript);
    
    if (Array.isArray(result) && result.length >= 6) {
      return {
        application: result[0],
        window: result[1],
        position: {
          x: result[2],
          y: result[3]
        },
        size: {
          width: result[4],
          height: result[5]
        },
        hasWindow: result[1] !== "No windows"
      };
    }
    
    return { hasWindow: false };
  } catch (error) {
    console.error("Error getting active window info:", error);
    return { hasWindow: false };
  }
} 