const { spawn } = require('child_process');
const readline = require('readline');

// Spawn the MCP server as a child process
const serverProcess = spawn('node', ['index.js']);

// Create interface to read from server's stdout
const rl = readline.createInterface({
  input: serverProcess.stdout,
  terminal: false
});

// Track received messages
let serverInfo = null;
const results = {};

// Parse server responses
rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);
    
    if (message.type === 'server_info') {
      serverInfo = message.data;
      console.log('Server info received:');
      console.log(`- Name: ${serverInfo.name}`);
      console.log(`- Version: ${serverInfo.version}`);
      console.log(`- Available tools: ${serverInfo.tools.map(t => t.name).join(', ')}`);
      
      // Once we have server info, send test commands
      sendTestCommands();
    } 
    else if (message.type === 'tool_result') {
      const { id, result } = message.data;
      results[id] = result;
      console.log(`\nResult for call ${id}:`);
      console.log(JSON.stringify(result, null, 2));
      
      // Exit after all test commands complete
      if (Object.keys(results).length === testCommands.length) {
        console.log('\nAll test commands completed.');
        serverProcess.kill();
        process.exit(0);
      }
    }
    else if (message.type === 'error') {
      console.error('Server error:', message.data.message);
    }
  } catch (error) {
    console.log('Raw output:', line);
    console.error('Error parsing server message:', error.message);
  }
});

// Listen for server errors
serverProcess.stderr.on('data', (data) => {
  console.error(`Server error: ${data}`);
});

// Test commands to send
const testCommands = [
  {
    id: 'test-1',
    name: 'get_system_info',
    params: {}
  },
  {
    id: 'test-2',
    name: 'open_application',
    params: {
      app_name: 'Notes'
    }
  },
  {
    id: 'test-3',
    name: 'run_applescript',
    params: {
      script: 'display notification "Hello from MCP Server" with title "MCP Test"'
    }
  },
  {
    id: 'test-4',
    name: 'key_press',
    params: {
      key: 'v',
      modifier: 'command'
    }
  }
];

// Function to send test commands
function sendTestCommands() {
  console.log('\nSending test commands...');
  
  testCommands.forEach((cmd, index) => {
    // Add slight delay between commands
    setTimeout(() => {
      console.log(`\nSending command ${index + 1}/${testCommands.length}: ${cmd.name}`);
      
      serverProcess.stdin.write(JSON.stringify({
        type: 'tool_call',
        data: cmd
      }) + '\n');
    }, index * 1000); // 1 second delay between commands
  });
}

console.log('Starting test with MCP Mac Control server...'); 