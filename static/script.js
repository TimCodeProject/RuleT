let socket;
let localStream;
let remoteStream;
let peerConnection;
let isMuted = false;
let isVideoEnabled = true;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function setUsername() {
    const username = document.getElementById('username').value.trim();
    if (!username) {
        alert('Пожалуйста, введите имя');
        return;
    }

    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('connection_established', () => {
        console.log('Socket connection established');
    });

    socket.on('username_set', (data) => {
        startSearch();
    });

    socket.on('waiting_for_partner', () => {
        showScreen('waiting-screen');
    });

    socket.on('call_started', async (data) => {
        showScreen('call-screen');
        document.getElementById('partner-name').textContent = data.partner_username;
        await startCall();
    });

    socket.on('partner_left', () => {
        endCall();
        alert('Собеседник покинул разговор');
        showScreen('login-screen');
    });

    socket.on('webrtc_offer', async (data) => {
        await handleOffer(data.offer);
    });

    socket.on('webrtc_answer', async (data) => {
        await handleAnswer(data.answer);
    });

    socket.on('ice_candidate', async (data) => {
        await handleIceCandidate(data.candidate);
    });

    socket.emit('set_username', { username: username });
}

async function startCall() {
    try {
        // Запрашиваем разрешение на доступ к медиаустройствам
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        document.getElementById('local-video').srcObject = localStream;

        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('webrtc_offer', { offer: offer });

    } catch (error) {
        console.error('Error starting call:', error);
        
        if (error.name === 'NotAllowedError') {
            alert('Доступ к камере/микрофону запрещен. Разрешите доступ в настройках браузера.');
        } else if (error.name === 'NotFoundError') {
            alert('Камера или микрофон не найдены.');
        } else if (error.name === 'NotReadableError') {
            alert('Не удалось получить доступ к камере/микрофону. Возможно, они уже используются другим приложением.');
        } else {
            alert('Ошибка доступа к камере/микрофону: ' + error.message);
        }
        
        stopSearch();
        showScreen('login-screen');
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', { candidate: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        document.getElementById('remote-video').srcObject = remoteStream;
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            console.log('Peer connection established successfully');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
    };
}

async function handleOffer(offer) {
    try {
        // Сначала получаем доступ к медиаустройствам
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            document.getElementById('local-video').srcObject = localStream;
        } catch (mediaError) {
            console.error('Media access error:', mediaError);
            socket.emit('end_call');
            alert('Не удалось получить доступ к камере/микрофону');
            showScreen('login-screen');
            return;
        }

        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('webrtc_answer', { answer: answer });

    } catch (error) {
        console.error('Error handling offer:', error);
        socket.emit('end_call');
    }
}

async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(answer);
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

function startSearch() {
    socket.emit('start_search');
}

function stopSearch() {
    if (socket) {
        socket.emit('stop_search');
    }
    showScreen('login-screen');
}

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (socket) {
        socket.emit('end_call');
    }
    showScreen('login-screen');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

function toggleMute() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            audioTracks[0].enabled = !audioTracks[0].enabled;
            isMuted = !isMuted;
            document.getElementById('mute-btn').textContent = isMuted ? '🔊' : '🔇';
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            videoTracks[0].enabled = !videoTracks[0].enabled;
            isVideoEnabled = !isVideoEnabled;
            document.getElementById('video-btn').textContent = isVideoEnabled ? '📹' : '📵';
        }
    }
}

// Обработка нажатия Enter
document.getElementById('username').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        setUsername();
    }
});

// Проверка поддержки WebRTC
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Ваш браузер не поддерживает WebRTC или доступ к камере/микрофону');
}

// Обработка изменения видимости страницы
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden');
    } else {
        console.log('Page visible');
    }
});
