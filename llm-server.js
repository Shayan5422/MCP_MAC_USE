const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const readline = require('readline');
const fetch = require('node-fetch');
const path = require('path');

// LLM configuration
const LLM_API_KEY = process.env.LLM_API_KEY || 'API_KEY';
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o';

// Ollama configuration
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const USE_LOCAL_LLM = process.env.USE_LOCAL_LLM === 'true';

// Runtime API key storage (not persisted)
let runtimeApiKey = LLM_API_KEY;

// Available LLM providers and models
const LLM_PROVIDERS = {
    openai: {
        name: 'OpenAI',
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        requiresKey: true,
        apiUrl: LLM_API_URL
    },
    ollama: {
        name: 'Ollama (Local)',
        models: ['llama3', 'mistral', 'codellama', 'gemma', 'phi', 'nous-hermes'],
        requiresKey: false,
        apiUrl: OLLAMA_API_URL
    }
};

// Default to OpenAI if not specified otherwise
let currentLLMProvider = USE_LOCAL_LLM ? 'ollama' : 'openai';
let currentLLMModel = USE_LOCAL_LLM ? OLLAMA_MODEL : LLM_MODEL;

// Create Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors());
app.use(bodyParser.json());

// Serve HTML file
app.use(express.static(path.join(__dirname)));

// Server MCP status
let mcpServer = null;
let serverInfo = null;
let mcpReady = false;
let rl = null;

// Manage user sessions
const sessions = new Map();

// Get or retrieve user session
function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            messages: [],
            activeContexts: [],
            lastCommands: [],
            createdAt: Date.now()
        });
    }
    return sessions.get(sessionId);
}

// Clean up old sessions
function cleanupSessions() {
    const now = Date.now();
    const MAX_SESSION_AGE = 2 * 60 * 60 * 1000; // 2 hours
    
    for (const [id, session] of sessions.entries()) {
        if (now - session.createdAt > MAX_SESSION_AGE) {
            sessions.delete(id);
        }
    }
}

// Run session cleanup every hour
setInterval(cleanupSessions, 60 * 60 * 1000);

// Helper method for executing command in MCP server
function executeToolCall(tool, params) {
    return new Promise((resolve, reject) => {
        if (!mcpServer || !mcpReady) {
            reject(new Error('MCP server is not active'));
            return;
        }

        const callId = `call-${Date.now()}`;
        const toolCall = {
            type: 'tool_call',
            data: {
                id: callId,
                name: tool,
                params: params
            }
        };

        // Set a timer to reject the request if no response is received
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for MCP server response'));
        }, 10000);

        // Define a one-time listener for receiving response
        const responseListener = (line) => {
            try {
                const message = JSON.parse(line);
                if (message.type === 'tool_result' && message.data.id === callId) {
                    clearTimeout(timeout);
                    resolve(message.data.result);
                    return true; // Indicates that response was received and listener should be removed
                }
                return false; // Continue listening
            } catch (error) {
                return false; // Continue listening
            }
        };

        // Add temporary listener
        rl.on('line', function onLine(line) {
            if (responseListener(line)) {
                rl.removeListener('line', onLine);
            }
        });

        // Send request to MCP server
        mcpServer.stdin.write(JSON.stringify(toolCall) + '\n');
    });
}

// Start MCP server
function startMCPServer() {
    if (mcpServer) {
        return; // Server is already running
    }

    mcpServer = spawn('node', ['index.js']);
    mcpReady = false;

    // Create command line interface for reading from MCP server standard output
    rl = readline.createInterface({
        input: mcpServer.stdout,
        terminal: false
    });

    // Get MCP server messages
    rl.on('line', (line) => {
        try {
            // Skip lines that don't start with '{' as they're likely debug messages
            if (!line.trim().startsWith('{')) {
                return;
            }
            
            const message = JSON.parse(line);
            if (message.type === 'server_info') {
                serverInfo = message.data;
                mcpReady = true;
                console.log('MCP server is ready');
                console.log(`Tools available: ${serverInfo.tools.map(t => t.name).join(', ')}`);
            }
        } catch (error) {
            console.error('Error processing MCP server message:', error);
        }
    });

    // Handle errors
    mcpServer.stderr.on('data', (data) => {
        console.error(`MCP server error: ${data}`);
    });

    // Handle server closing
    mcpServer.on('close', (code) => {
        console.log(`MCP server closed with code ${code}`);
        mcpServer = null;
        mcpReady = false;
        serverInfo = null;
    });
}

// Build system message for LLM
function buildSystemMessage(session) {
    if (!serverInfo) {
        return '';
    }

    const toolDescriptions = serverInfo.tools.map(tool => {
        const params = Object.entries(tool.parameters.properties || {})
            .map(([name, prop]) => `${name}: ${prop.description || 'No description'} (${prop.type})`)
            .join(', ');
        
        return `${tool.name}: ${tool.description} | Parameters: ${params || 'None'}`;
    }).join('\n');
    
    // Get the current state information from the MCP server
    let currentStateInfo = 'Unknown';
    
    try {
        // Add explicit state information if available
        if (session.currentState) {
            const activeApp = session.currentState.activeApplication || 'Unknown';
            const mouseX = session.currentState.mousePosition?.x || 'Unknown';
            const mouseY = session.currentState.mousePosition?.y || 'Unknown';
            const lastOp = session.currentState.lastOperation || 'No previous operation';
            
            currentStateInfo = `Active application: ${activeApp}\nCursor position: x=${mouseX}, y=${mouseY}\nLast operation: ${lastOp}`;
            
            // Add window positions if available
            if (session.currentState.windowPositions) {
                const windowInfo = [];
                for (const [app, pos] of Object.entries(session.currentState.windowPositions)) {
                    windowInfo.push(`${app}: position (${pos.x}, ${pos.y}), size (${pos.width}x${pos.height})`);
                }
                
                if (windowInfo.length > 0) {
                    currentStateInfo += '\nWindow positions:\n' + windowInfo.join('\n');
                }
            }
        }
    } catch (error) {
        console.error('Error building state info for LLM:', error);
    }

    return `
You are a smart assistant that can control the macOS operating system using the following tools:

${toolDescriptions}

SAFETY GUIDELINES:
1. Always ensure applications are opened safely, preferably in new windows/tabs when appropriate
2. Verify applications have fully launched before executing commands on them
3. For multi-step operations, make sure each step completes successfully before proceeding
4. Check the current state before taking actions to avoid errors
5. When navigating system settings, verify you are in the right location before making changes

Analyze user command and determine the most suitable tool and parameters for execution.
For multi-step operations (where multiple steps are needed to complete the user request):
1. Set "isCompleted": false in your response
2. Provide a brief explanation of the next step in the "nextStep" field
3. The system will call you again to continue the operation

Current system state:
${currentStateInfo}

Active context from previous operations:
${session.activeContexts.join('\n')}

Return response in JSON format as follows:
{
  "tool": "tool_name",
  "params": {
    "param1": "value1",
    "param2": "value2"
  },
  "explanation": "Short explanation of why this tool was selected",
  "isCompleted": boolean, // Set to false if more steps are needed
  "nextStep": "Explanation of next step if operation is not completed"
}

IMPORTANT: Return ONLY the JSON object without any explanatory text, preamble, or code block formatting.
Do not add explanations or details outside the JSON response. The entire response must be valid JSON.

If you cannot process the request, respond with a JSON error message like:
{
  "error": "Your error message"
}
`;
}

// Call LLM for analyzing user command
async function callLLM(prompt, session) {
    try {
        if (!serverInfo) {
            throw new Error('MCP server information is not available');
        }

        const systemMessage = buildSystemMessage(session);
        
        // Build history messages for LLM
        const messages = [
            { role: 'system', content: systemMessage },
            ...session.messages,
            { role: 'user', content: prompt }
        ];

        let llmResponse = '';
        
        // Choose the appropriate LLM provider
        if (currentLLMProvider === 'ollama') {
            llmResponse = await callOllamaLLM(messages);
        } else {
            llmResponse = await callOpenAILLM(messages);
        }
        
        // Add response to history
        session.messages.push({ role: 'user', content: prompt });
        session.messages.push({ role: 'assistant', content: llmResponse });
        
        // Keep max 10 messages in history
        if (session.messages.length > 20) {
            session.messages = session.messages.slice(-20);
        }

        // Try to extract JSON from response
        try {
            // Improved JSON extraction with more robust handling
            let jsonStr = llmResponse;
            
            // Try to find JSON in code blocks first
            const jsonRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/;
            const match = llmResponse.match(jsonRegex);
            
            if (match && match[1]) {
                // Found JSON in code block
                jsonStr = match[1].trim();
            } else {
                // Try to extract the first JSON object from the text
                const possibleJson = llmResponse.match(/(\{[\s\S]*?\})/);
                if (possibleJson && possibleJson[1]) {
                    jsonStr = possibleJson[1].trim();
                } else {
                    // No JSON object found, clean up markdown formatting as a last resort
                    jsonStr = llmResponse.replace(/```json\n|\n```|```\n|```json|```/g, '').trim();
                }
            }
            
            // Additional cleaning to handle potential invisible characters
            jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
            
            // Check for truncated JSON and try to fix it
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            if (openBraces > closeBraces) {
                // JSON is truncated - add missing closing braces
                const missingBraces = openBraces - closeBraces;
                jsonStr = jsonStr + '}'.repeat(missingBraces);
                console.log(`Fixed truncated JSON by adding ${missingBraces} closing braces`);
            }
            
            // Also check for array brackets
            const openBrackets = (jsonStr.match(/\[/g) || []).length;
            const closeBrackets = (jsonStr.match(/\]/g) || []).length;
            if (openBrackets > closeBrackets) {
                // JSON arrays are truncated - add missing closing brackets
                const missingBrackets = openBrackets - closeBrackets;
                jsonStr = jsonStr + ']'.repeat(missingBrackets);
                console.log(`Fixed truncated JSON by adding ${missingBrackets} closing brackets`);
            }
            
            // Manually fix common JSON issues
            jsonStr = jsonStr
                .replace(/,\s*}/g, '}')  // Remove trailing commas
                .replace(/,\s*\]/g, ']') // Remove trailing commas in arrays
                .replace(/\s+/g, ' ')    // Normalize whitespace
                .replace(/"\s*:\s*"/g, '":"') // Fix spacing in key-value pairs
                .replace(/"\s*,\s*"/g, '","'); // Fix spacing between items
                
            // Fix common issues in "params" objects that often cause parsing errors
            jsonStr = jsonStr.replace(/"params"\s*:\s*"([^"]+)"/g, (match, params) => {
                // If params is a string that should be an object, try to convert it
                if (params.includes(':') || params.includes('=')) {
                    return `"params": {"${params.replace(/:/g, '":"').replace(/=/g, '":"')}"}`; 
                }
                return match;
            });
            
            // Fix missing quotes around property names
            jsonStr = jsonStr.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            
            // Handle the specific case where JSON is truncated inside the params object 
            // e.g. { "tool":"open_application","params": { "app_name":"Safari" }
            const paramsRegex = /"params"\s*:\s*\{([^}]*?)$/;
            const paramsMatch = jsonStr.match(paramsRegex);
            if (paramsMatch && !jsonStr.endsWith('}')) {
                // The JSON is cut off inside the params object
                jsonStr = jsonStr + '}}';
                console.log('Fixed JSON truncated inside params object');
            }
            
            // Debug log for JSON parsing issues
            try {
                return JSON.parse(jsonStr);
            } catch (parseError) {
                console.error('JSON parse error:', parseError.message);
                console.error('Problematic JSON string:', jsonStr);
                console.error('Original response:', llmResponse);
                
                // As a last resort, try to manually construct a valid JSON
                try {
                    // If it starts with { and ends with }, it's likely a JSON object
                    if (jsonStr.trim().startsWith('{') && jsonStr.trim().endsWith('}')) {
                        // Try to use a more tolerant JSON parser or construct a simplified response
                        return { 
                            error: "JSON parsing failed",
                            partial_content: jsonStr.substring(0, 100) + "..." 
                        };
                    }
                } catch (e) {
                    // Ignore secondary errors
                }
                throw parseError;
            }
        } catch (parseError) {
            console.error('Error parsing LLM response:', parseError);
            throw new Error(`LLM response not processable: ${llmResponse}`);
        }
    } catch (error) {
        console.error('Error calling LLM:', error);
        throw error;
    }
}

// Call OpenAI LLM API
async function callOpenAILLM(messages) {
    const response = await fetch(LLM_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${runtimeApiKey}`
        },
        body: JSON.stringify({
            model: currentLLMModel,
            messages: messages,
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Call Ollama local LLM API
async function callOllamaLLM(messages) {
    try {
        const response = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: currentLLMModel,
                messages: messages,
                stream: false,
                options: {
                    temperature: 0.1
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
        }

        const data = await response.json();
        return data.message.content;
    } catch (error) {
        console.error('Error calling Ollama API:', error);
        throw new Error(`Failed to call Ollama: ${error.message}. Make sure Ollama is installed and running locally.`);
    }
}

// Check if Ollama is running
async function checkOllamaAvailability() {
    try {
        const response = await fetch('http://localhost:11434/api/tags', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            // Set a short timeout as we just want to check availability
            signal: AbortSignal.timeout(2000)
        });
        
        if (!response.ok) {
            return { available: false, error: `Server returned ${response.status}` };
        }
        
        const data = await response.json();
        // Extract available models
        const models = data.models || [];
        return { 
            available: true, 
            models: models.map(m => m.name || m),
            message: `Found ${models.length} local models` 
        };
    } catch (error) {
        console.error("Ollama availability check failed:", error);
        return { 
            available: false, 
            error: error.message,
            message: "Ollama is not running or not available at localhost:11434. Make sure Ollama is installed and running." 
        };
    }
}

// Execute one step from chain commands
async function executeStep(session, prompt, initialPrompt = null) {
    try {
        // Send request to LLM
        let llmResult;
        try {
            llmResult = await callLLM(prompt, session);
        } catch (error) {
            console.error('LLM error:', error.message);
            // Create a fallback response for JSON parsing errors
            if (error.message.includes('not processable')) {
                // Extract tool name using regex if possible
                const toolMatch = error.message.match(/"tool"\s*:\s*"([^"]+)"/);
                const paramsMatch = error.message.match(/"params"\s*:\s*(\{[^}]+\})/);
                
                if (toolMatch && toolMatch[1]) {
                    // We can at least extract the tool name
                    let params = {};
                    if (paramsMatch && paramsMatch[1]) {
                        try {
                            params = JSON.parse(paramsMatch[1]);
                        } catch (e) {
                            // Ignore params parsing error
                        }
                    }
                    
                    // Use the extracted tool and params
                    llmResult = {
                        tool: toolMatch[1],
                        params: params,
                        explanation: "Extracted from partial response",
                        isCompleted: false,
                        nextStep: "Continue with the next operation"
                    };
                    
                    console.log('Created fallback response:', llmResult);
                } else {
                    // Cannot extract anything useful, return error
                    return { 
                        result: `Error processing request: ${error.message}`,
                        isCompleted: true
                    };
                }
            } else {
                // Not a JSON parsing error, return the error
                return { 
                    result: `Error calling LLM: ${error.message}`,
                    isCompleted: true
                };
            }
        }
        
        // Check if a suitable tool was found
        if (!llmResult.tool || !serverInfo.tools.some(t => t.name === llmResult.tool)) {
            return { 
                result: `No suitable tool found for this request: ${llmResult.explanation || ''}`,
                isCompleted: true
            };
        }
        
        // Execute tool
        const toolResult = await executeToolCall(llmResult.tool, llmResult.params || {});
        
        // Save tool execution result as context
        const resultContext = `Last executed tool: ${llmResult.tool} with parameters ${JSON.stringify(llmResult.params || {})}\nResult: ${JSON.stringify(toolResult)}`;
        session.activeContexts.push(resultContext);
        
        // Keep max 5 contexts
        if (session.activeContexts.length > 5) {
            session.activeContexts = session.activeContexts.slice(-5);
        }
        
        // Build result
        const stepResult = {
            action: llmResult.explanation || llmResult.tool,
            tool: llmResult.tool,
            params: llmResult.params || {},
            result: toolResult,
            isCompleted: llmResult.isCompleted === true
        };
        
        // For multi-step operations, if this step is not explicitly marked as completed,
        // assume there are more steps and continue with the next operation
        if (llmResult.isCompleted !== true) {
            // Either use provided nextStep or generate a generic one
            const nextStepPrompt = llmResult.nextStep 
                ? `User command: "${initialPrompt || prompt}"\n\nPrevious step completed: ${resultContext}\n\nContinue operation: ${llmResult.nextStep}` 
                : `User command: "${initialPrompt || prompt}"\n\nPrevious step completed: ${resultContext}\n\nWhat is the next step to complete this operation?`;
                
            const nextResult = await executeStep(session, nextStepPrompt, initialPrompt || prompt);
            
            // Combine results
            return {
                currentStep: stepResult,
                nextSteps: nextResult,
                isCompleted: nextResult.isCompleted
            };
        }
        
        return stepResult;
    } catch (error) {
        console.error('Error executing step:', error);
        throw error;
    }
}

// API paths

// Server status with LLM info
app.get('/api/llm-control/status', (req, res) => {
    res.json({ 
        status: mcpReady ? 'active' : 'inactive',
        tools: serverInfo?.tools?.map(t => t.name) || [],
        llm: {
            provider: currentLLMProvider,
            model: currentLLMModel,
            available_providers: LLM_PROVIDERS
        }
    });
});

// LLM provider configuration endpoint
app.post('/api/llm-control/config', async (req, res) => {
    try {
        const { provider, model, apiKey } = req.body;
        
        // Validate provider
        if (provider && !LLM_PROVIDERS[provider]) {
            return res.status(400).json({ error: `Unknown provider: ${provider}` });
        }
        
        // If switching to Ollama, verify it's available
        if (provider === 'ollama') {
            const ollamaStatus = await checkOllamaAvailability();
            if (!ollamaStatus.available) {
                return res.status(400).json({ 
                    error: 'Ollama not available', 
                    message: ollamaStatus.message 
                });
            }
            
            // If Ollama has models available, update our list
            if (ollamaStatus.models && ollamaStatus.models.length > 0) {
                LLM_PROVIDERS.ollama.models = ollamaStatus.models;
            }
        }
        
        // Update provider if specified
        if (provider) {
            currentLLMProvider = provider;
            // Set default model for the provider if not specified
            if (!model) {
                currentLLMModel = LLM_PROVIDERS[provider].models[0];
            }
        }
        
        // Update model if specified and valid for the current provider
        if (model) {
            if (LLM_PROVIDERS[currentLLMProvider].models.includes(model)) {
                currentLLMModel = model;
            } else {
                return res.status(400).json({ 
                    error: `Model ${model} not available for ${LLM_PROVIDERS[currentLLMProvider].name}` 
                });
            }
        }
        
        // Update API key if specified and provider requires key
        if (apiKey && LLM_PROVIDERS[currentLLMProvider].requiresKey) {
            // Only update the key in memory
            runtimeApiKey = apiKey;
        }
        
        // Return updated configuration
        res.json({
            provider: currentLLMProvider,
            model: currentLLMModel,
            available_providers: LLM_PROVIDERS
        });
    } catch (error) {
        console.error('Error updating LLM config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to check Ollama availability
app.get('/api/llm-control/check-ollama', async (req, res) => {
    try {
        const status = await checkOllamaAvailability();
        res.json(status);
    } catch (error) {
        res.status(500).json({ 
            available: false, 
            error: error.message 
        });
    }
});

// Send user request to LLM and execute tool
app.post('/api/llm-control', async (req, res) => {
    try {
        const { prompt, sessionId = 'default' } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Empty request' });
        }
        
        // Ensure MCP server is running
        if (!mcpServer || !mcpReady) {
            startMCPServer();
            // Wait for server to be ready
            let retries = 0;
            while (!mcpReady && retries < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                retries++;
            }
            
            if (!mcpReady) {
                return res.status(500).json({ error: 'MCP server is not ready' });
            }
        }
        
        // Get or create user session
        const session = getSession(sessionId);
        
        // Get current system state before executing command
        try {
            const stateResult = await executeToolCall('get_current_state', {});
            session.currentState = stateResult;
        } catch (error) {
            console.warn('Error getting system state:', error);
        }
        
        // Execute command and follow the chain of operations
        console.log(`Processing user prompt: "${prompt}"`);
        const result = await executeStep(session, prompt, prompt);
        
        // Check if a direct error was returned
        if (typeof result === 'string') {
            return res.json({ result });
        }
        
        // Display results in structured format
        let formattedResult = '';
        
        // Recursive function to display chain results
        function formatResults(stepResult, level = 0) {
            const indent = '  '.repeat(level);
            let output = '';
            
            if (stepResult.action) {
                output += `${indent}🔹 Operation: ${stepResult.action}\n`;
                output += `${indent}  Tool: ${stepResult.tool}\n`;
                output += `${indent}  Parameters: ${JSON.stringify(stepResult.params)}\n`;
                
                // Format the result based on its type
                if (typeof stepResult.result === 'object') {
                    output += `${indent}  Result: ${JSON.stringify(stepResult.result, null, 2)}\n\n`;
                } else {
                    output += `${indent}  Result: ${stepResult.result}\n\n`;
                }
            }
            
            if (stepResult.currentStep) {
                output += formatResults(stepResult.currentStep, level);
                if (stepResult.nextSteps) {
                    output += formatResults(stepResult.nextSteps, level + 1);
                }
            }
            
            return output;
        }
        
        formattedResult = formatResults(result);
        
        // If the result format is empty (possibly unexpected structure)
        if (!formattedResult.trim()) {
            formattedResult = `Result: ${JSON.stringify(result, null, 2)}`;
        }
        
        // Add note about completion status
        if (result.isCompleted) {
            formattedResult += `\n✅ Operation completed successfully.\n`;
        } else {
            formattedResult += `\n⚠️ Operation partially completed or needs further steps.\n`;
        }
        
        // Get updated system state after command execution
        try {
            const stateResult = await executeToolCall('get_current_state', {});
            session.currentState = stateResult;
            
            // Add state info to the result
            formattedResult += `\n\nCurrent state:\n`;
            formattedResult += `- Active application: ${stateResult.activeApplication || 'Unknown'}\n`;
            formattedResult += `- Mouse position: (${stateResult.mousePosition?.x || 0}, ${stateResult.mousePosition?.y || 0})\n`;
            formattedResult += `- Last operation: ${stateResult.lastOperation || 'Unknown'}\n`;
        } catch (error) {
            console.warn('Error getting updated system state:', error);
        }
        
        res.json({
            result: formattedResult,
            isCompleted: result.isCompleted === true,
            hasNextSteps: !!result.nextSteps || result.isCompleted === false
        });
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: error.message });
    }
});

// Main path for providing HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'llm-mac-control.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
    startMCPServer();
}); 