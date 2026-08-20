
const chatbotFab = document.getElementById('chatbotFab');
const chatbotWindow = document.getElementById('chatbotWindow');
const chatbotClose = document.getElementById('chatbotClose');
const chatbotInput = document.getElementById('chatbotInput');
const chatbotSendBtn = document.getElementById('chatbotSendBtn');
const chatbotMessages = document.getElementById('chatbotMessages');

// Toggle Window
chatbotFab.addEventListener('click', () => {
    chatbotWindow.classList.toggle('open');
    if (chatbotWindow.classList.contains('open')) {
        chatbotInput.focus();
        setTimeout(scrollToBottom, 100);
    }
});

chatbotClose.addEventListener('click', () => {
    chatbotWindow.classList.remove('open');
});

// UI Helpers
function appendMessage(text, sender) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + sender;
    
    // Simple markdown to HTML (bold and line breaks)
    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
        
    div.innerHTML = formattedText;
    chatbotMessages.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function showTyping() {
    const div = document.createElement('div');
    div.className = 'chat-msg ai';
    div.id = 'typingIndicator';
    div.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
    chatbotMessages.appendChild(div);
    scrollToBottom();
}

function hideTyping() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

// Chat History Memory (to keep context in a single session)
let chatHistory = [];

async function sendMessage() {
    const text = chatbotInput.value.trim();
    if (!text) return;

    // Check API Key
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        appendMessage("Veuillez configurer votre clé API Gemini dans les Paramètres avant d'utiliser l'assistant.", 'system');
        return;
    }

    const modelName = localStorage.getItem('geminiModel') || 'gemini-1.5-flash';

    // UI Update
    appendMessage(text, 'user');
    chatbotInput.value = '';
    chatbotInput.disabled = true;
    chatbotSendBtn.disabled = true;
    showTyping();

    try {
        // Fetch Context (Flights)
        const flights = await getAllFlights();
        
        // Prepare payload for Gemini
        // To save tokens, we might map flights to a condensed representation if needed, but Gemini Flash handles 1M tokens easily.
        const flightDataStr = JSON.stringify(flights.map(f => ({
            d: f.date,
            r: f.role,
            p: f.pil_name,
            t: f.aircraft_type,
            n: f.aircraft_num,
            i: f.aircraft_reg,
            j: f.j,
            nuit: f.n,
            rem: f.remarques,
            pannes: f.seance_type
        })));

        const systemPrompt = "Tu es un copilote virtuel expert intégré dans le carnet de vol PWA d'un pilote de l'ALAT. " +
"Ton but est de répondre aux questions du pilote concernant son historique de vol avec précision, concision et professionnalisme.\n" +
"Voici l'intégralité de sa base de données de vols au format JSON (liste de vols) :\n" +
flightDataStr + "\n\n" +
"Instructions:\n" +
"- Tu ne dois répondre qu'à la question posée, de façon courte et directe. Ne récite pas toute la base de données.\n" +
"- Si le pilote demande son dernier vol de panne (souvent indiqué dans 'pannes' ou 'rem'), cherche la date la plus récente.\n" +
"- Exprime-toi en français avec un ton amical et professionnel.";

        const contents = [];
        
        // Push historical context (limit to last 10 messages)
        for (const msg of chatHistory.slice(-10)) {
            contents.push(msg);
        }

        // Push new user message
        const newUserMsg = {
            role: 'user',
            parts: [{ text: text }]
        };
        contents.push(newUserMsg);
        
        const payload = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: contents,
            generationConfig: {
                temperature: 0.2 // Garder factuel
            }
        };

        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + apiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        hideTyping();

        if (data.error) {
            console.error(data.error);
            appendMessage("Erreur API : " + data.error.message, 'system');
        } else if (data.candidates && data.candidates.length > 0) {
            const aiText = data.candidates[0].content.parts[0].text;
            appendMessage(aiText, 'ai');
            
            // Save to history
            chatHistory.push(newUserMsg);
            chatHistory.push({
                role: 'model',
                parts: [{ text: aiText }]
            });
        } else {
            appendMessage("Je n'ai pas pu générer de réponse.", 'system');
        }

    } catch (err) {
        console.error(err);
        hideTyping();
        appendMessage("Une erreur est survenue lors de la communication avec l'assistant.", 'system');
    }

    chatbotInput.disabled = false;
    chatbotSendBtn.disabled = false;
    chatbotInput.focus();
}

chatbotSendBtn.addEventListener('click', sendMessage);
chatbotInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
