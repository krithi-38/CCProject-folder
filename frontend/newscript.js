document.addEventListener('DOMContentLoaded', () => {
    // --- Backend URL ---
    const backendURL =
    window.location.hostname === "localhost"
      ? "http://cc_backend:5001"
      : "https://cc-backend-app.azurewebsites.net";
  


    // --- Element references ---
    const certType = document.getElementById('certType');
    const customTitleDiv = document.getElementById('customTitleDiv');
    const achievementFields = document.getElementById('achievementFields');
    const positionType = document.getElementById('positionType');
    const positionValue = document.getElementById('positionValue');

    const nameInput = document.getElementById('name');
    const courseInput = document.getElementById('course');
    const dateInput = document.getElementById('date');
    const customTitleInput = document.getElementById('customTitle');
    const logoInput = document.getElementById('logo');
    const signatureInput = document.getElementById('signature');

    const previewTitle = document.getElementById('previewTitle');
    const previewName = document.getElementById('previewName');
    const previewDetails = document.getElementById('previewDetails');
    const previewDate = document.getElementById('previewDate');
    const previewLogo = document.getElementById('previewLogo');
    const previewSignature = document.getElementById('previewSignature');
    const previewAchievement = document.getElementById('previewAchievement');

    // --- Certificate type changes ---
    if (certType) {
        certType.addEventListener('change', () => {
            const type = certType.value;
            achievementFields.style.display = (type === "Achievement") ? "block" : "none";
            customTitleDiv.style.display = (type === "Custom") ? "block" : "none";

            if(type === "Custom") previewTitle.textContent = "[Custom Title]";
            else if(type === "Course Completion") previewTitle.textContent = "Certificate of Completion";
            else if(type === "Participation") previewTitle.textContent = "Certificate of Participation";
            else if(type === "Achievement") previewTitle.textContent = "Certificate of Achievement";
        });
    }

    // --- Live preview updates ---
    if (nameInput) nameInput.addEventListener('input', () => previewName.textContent = nameInput.value || "[Student Name]");
    if (courseInput) courseInput.addEventListener('input', () => previewDetails.textContent = courseInput.value || "[Course/Event]");
    if (dateInput) dateInput.addEventListener('input', () => previewDate.textContent = dateInput.value || "[Date]");
    if (customTitleInput) customTitleInput.addEventListener('input', () => previewTitle.textContent = customTitleInput.value || "[Custom Title]");

    if (logoInput) logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file){
            previewLogo.src = URL.createObjectURL(file);
            previewLogo.style.display = "block";
        }
    });

    if (signatureInput) signatureInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file){
            previewSignature.src = URL.createObjectURL(file);
            previewSignature.style.display = "block";
        }
    });

    if (positionType) positionType.addEventListener('change', updateAchievementPreview);
    if (positionValue) positionValue.addEventListener('input', updateAchievementPreview);

    function updateAchievementPreview() {
        const type = positionType.value;
        const value = positionValue.value;
        previewAchievement.textContent = (type && value) ? `${type}: ${value}` : "";
    }

    // --- Generate Certificate ---
    const generateForm = document.getElementById('generateForm');
    if (generateForm) {
        generateForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData();
            formData.append('name', nameInput.value);
            formData.append('course', courseInput.value);
            formData.append('date', dateInput.value);
            formData.append('certType', certType.value);
            formData.append('customTitle', customTitleInput.value);
            if(logoInput.files[0]) formData.append('logo', logoInput.files[0]);
            if(signatureInput.files[0]) formData.append('signature', signatureInput.files[0]);
            formData.append('positionType', positionType.value);
            formData.append('positionValue', positionValue.value);

            try {
                const response = await fetch(`${backendURL}/generate-certificate`, {
                    method: 'POST',
                    body: formData
                });

                if(response.ok){
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'certificate.pdf';
                    a.click();
                    window.URL.revokeObjectURL(url);
                } else {
                    const errorText = await response.text();
                    alert("Error generating certificate: " + errorText);
                }
            } catch (err) {
                alert("Server error. Make sure backend is running.");
                console.error(err);
            }
        });
    }

    // --- Verify Certificate ---
    const verifyForm = document.getElementById('verifyForm');
    if (verifyForm) {
        verifyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const certId = document.getElementById('certId').value;

            try {
                const response = await fetch(`${backendURL}/verify-certificate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ certId })
                });

                const result = await response.json();
                const display = document.getElementById('verifyResult');

                if (result.status === "valid") {
                    display.innerHTML = `<span style="color:green;font-weight:bold;">Valid Certificate</span><br>
                                         Name: ${result.certificate.name}<br>
                                         Course: ${result.certificate.course}<br>
                                         Date: ${result.certificate.date}`;
                } else if (result.status === "invalid") {
                    display.innerHTML = `<span style="color:red;font-weight:bold;">Invalid Certificate</span>`;
                } else {
                    display.innerHTML = `<span style="color:red;">Error: ${result.message}</span>`;
                }
            } catch(err) {
                console.error(err);
                alert("Server error. Make sure backend is running.");
            }
        });
    }

    // --- Chatbot ---
    const chatButton = document.getElementById('chatButton');
    const chatBox = document.getElementById('chatBox');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendMessage');

    if (chatButton && chatBox) {
        chatButton.addEventListener('click', () => {
            chatBox.style.display = (chatBox.style.display === 'none' || chatBox.style.display === '') ? 'flex' : 'none';
        });
    }

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        addMessage('You', message, 'user');
        chatInput.value = '';

        const existingTyping = document.getElementById('typing-indicator');
        if (existingTyping) existingTyping.remove();
        const typingIndicator = addMessage('Assistant', 'Typing...', 'assistant', true);

        try {
            const response = await fetch(`${backendURL}/chatbot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            typingIndicator.remove();

            if (data.response) addMessage('Assistant', data.response, 'assistant');
            else addMessage('Assistant', 'Sorry, I encountered an error.', 'assistant');
        } catch (error) {
            typingIndicator.remove();
            addMessage('Assistant', 'Connection error. Try again.', 'assistant');
        }
    }

    function addMessage(sender, text, type, isTyping = false) {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            background: ${type === 'user' ? '#007bff' : '#f1f1f1'};
            color: ${type === 'user' ? 'white' : 'black'};
            padding: 10px;
            border-radius: 10px;
            margin-bottom: 10px;
            max-width: 80%;
            align-self: ${type === 'user' ? 'flex-end' : 'flex-start'};
        `;
        messageDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
        if (isTyping) messageDiv.id = 'typing-indicator';
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
    }

    if (sendButton) sendButton.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
});
