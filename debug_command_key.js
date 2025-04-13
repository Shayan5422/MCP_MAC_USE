const robot = require('robotjs');

// Give the user time to focus on a text editor window
console.log('Starting command key test - make sure you have a text editor open');
console.log('Testing will begin in 5 seconds...');

// Try different key combinations for copy/paste
setTimeout(() => {
  console.log('\n--- Testing copy (Command+C) ---');
  try {
    robot.keyTap('c', ['command']);
    console.log('Command+C executed successfully');
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Wait before pasting
  setTimeout(() => {
    console.log('\n--- Testing paste (Command+V) ---');
    try {
      robot.keyTap('v', ['command']);
      console.log('Command+V executed successfully');
    } catch (e) {
      console.log('Error:', e.message);
    }
    
    // Test command with shift modifier
    setTimeout(() => {
      console.log('\n--- Testing Command+Shift+3 (screenshot) ---');
      try {
        robot.keyTap('3', ['command', 'shift']);
        console.log('Command+Shift+3 executed successfully');
      } catch (e) {
        console.log('Error:', e.message);
      }
      
      // Test a standard keyboard shortcut in a browser
      setTimeout(() => {
        console.log('\n--- Testing Command+F (find) ---');
        try {
          robot.keyTap('f', ['command']);
          console.log('Command+F executed successfully');
        } catch (e) {
          console.log('Error:', e.message);
        }
        
        console.log('\nTest completed - check if the commands worked in your application');
      }, 1000);
    }, 1000);
  }, 1000);
}, 5000); 