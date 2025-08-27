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

function startSearch() {
    socket.emit('start_search');
}

function stopSearch() {
    socket.emit('stop_search');
    showScreen('login-screen');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
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
        alert('Ошибка доступа к камере/микрофону');
        stopSearch();
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
    };
}

async function handleOffer(offer) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        document.getElementById('local-video').srcObject = localStream;

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

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    socket.emit('end_call');
    showScreen('login-screen');
}

function toggleMute() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = !track.enabled;
        });
        isMuted = !isMuted;
        document.getElementById('mute-btn').textContent = isMuted ? '🔊' : '🔇';
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(track => {
            track.enabled = !track.enabled;
        });
        isVideoEnabled = !isVideoEnabled;
        document.getElementById('video-btn').textContent = isVideoEnabled ? '📹' : '📵';
    }
}

// Обработка нажатия Enter в поле ввода имени
document.getElementById('username').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        setUsername();
    }
});
