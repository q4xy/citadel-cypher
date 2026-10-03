import { auth, db } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let anonymousSignInPromise = null;

async function ensureFirebaseAuthenticated() {
    await auth.authStateReady();

    if (!auth.currentUser) {
        if (!anonymousSignInPromise) {
            anonymousSignInPromise = signInAnonymously(auth)
                .finally(() => {
                    anonymousSignInPromise = null;
                });
        }
        await anonymousSignInPromise;
    }

    const user = auth.currentUser;
    if (!user) {
        throw new Error("Firebase authentication failed: no current user after anonymous sign-in.");
    }

    console.info("Firebase auth user:", user.uid, "project:", auth.app.options.projectId);
    return user;
}

async function recordSuccessfulLogin(name, role) {
    await ensureFirebaseAuthenticated();

    await Promise.race([
        addDoc(collection(db, "clearance_logs"), {
            name,
            role,
            timestamp: serverTimestamp()
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore write timed out")), 6000))
    ]);
}

function reportLoginLogError(error) {
    console.error("Database Write Error:", error);
    const detail = error?.code || error?.message || "Unknown Firestore error";
    alert(`Login could not be recorded in Firestore: ${detail}`);
}

// --- EMAILJS SETUP ---
// Ensure EmailJS script is loaded in your HTML before this runs
if(typeof emailjs !== 'undefined') {
    emailjs.init("ceClqJFyzptwWHfJb");
} else {
    console.warn("EmailJS not loaded. OTP emails will fail.");
}

// --- STATE VARIABLES ---
let selectedRole = 'citizen';
let currentGeneratedToken = 0;
let countdownInterval = null;
let livenessStage = 'calibrating';
let videoStream = null;
let canvasAnimationId = null;

const dynamicChallenges = [
    "CHALLENGE ISSUED: BLINK BOTH EYES INTERMITTENTLY.",
    "CHALLENGE ISSUED: SLOWLY ROTATE HEAD 30 DEGREES LEFT.",
    "CHALLENGE ISSUED: TILT CHIN UPWARD TO CONFIRM GEOMETRY.",
    "CHALLENGE ISSUED: OPEN MOUTH SLIGHTLY TO AUDIT PROFILE."
];

// ==========================================
// GLOBALLY EXPOSED FUNCTIONS (For HTML Buttons)
// ==========================================

window.switchRole = function(role) {
    selectedRole = role;
   
    // Stop any active camera streams if switching away
    window.stopWebcamStream();
    clearInterval(countdownInterval);
   
    if(document.getElementById('otp-error-msg')) document.getElementById('otp-error-msg').classList.add('hidden');
    if(document.getElementById('admin-error-text')) document.getElementById('admin-error-text').classList.add('hidden');

    // 1. Swap Tailwind Classes for the Tabs
    const structures = ['citizen', 'official', 'worker', 'ngo'];
    structures.forEach(s => {
        const button = document.getElementById(`tab-${s}`);
        if (button) {
            button.className = "flex-1 py-2 text-[10px] font-black uppercase rounded transition-all";
            if (s === role) {
                button.classList.add("bg-white", "dark:bg-slate-700", "shadow", "text-slate-900", "dark:text-white");
            } else {
                button.classList.add("text-slate-500", "hover:text-slate-800", "dark:hover:text-slate-300");
            }
        }
    });

    // 2. Hide all panels initially
    const panels = ['panel-intake', 'panel-otp', 'panel-biometric', 'panel-admin', 'panel-success'];
    panels.forEach(p => {
        const el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });

    // 3. Show Worker Dropdown only for Workers
    const workerContainer = document.getElementById('worker-id-container');
    if (workerContainer) {
        if (role === 'worker') workerContainer.classList.remove('hidden');
        else workerContainer.classList.add('hidden');
    }

    // 4. Show the correct intake panel
    if (role === 'citizen' || role === 'worker') {
        document.getElementById('panel-intake').classList.remove('hidden');
        if (role === 'worker') {
            const nameField = document.getElementById('input-name')?.parentElement;
            const emailField = document.getElementById('input-email')?.parentElement;
            if (nameField) nameField.classList.add('hidden');
            if (emailField) emailField.classList.add('hidden');
            document.getElementById('panel-qr-scanner').classList.remove('hidden');
            document.getElementById('qr-demo-status').innerHTML = '<span class="text-amber-400">DEMO QR LOGIN<br><span class="text-white/70 text-[10px]">Scan Worker ID to continue</span></span>';
        } else {
            const nameField = document.getElementById('input-name')?.parentElement;
            const emailField = document.getElementById('input-email')?.parentElement;
            if (nameField) nameField.classList.remove('hidden');
            if (emailField) emailField.classList.remove('hidden');
            document.getElementById('panel-qr-scanner').classList.add('hidden');
        }
    } else {
        document.getElementById('panel-admin').classList.remove('hidden');
        document.getElementById('input-admin-pass').value = '';
    }
};

window.executeOtpGeneration = function() {
    if (selectedRole === 'worker') {
        window.initQrScanner();
        return;
    }
    const name = document.getElementById('input-name').value.trim();
    const email = document.getElementById('input-email').value.trim();
   
    if (!name || !email) {
        alert('Identity declaration and Email fields required.');
        return;
    }

    document.getElementById('panel-intake').classList.add('hidden');
    document.getElementById('panel-otp').classList.remove('hidden');
    document.getElementById('input-otp-entry').value = '';
    document.getElementById('debug-otp-value').innerText = "TRANSMITTING TO CORE...";

    currentGeneratedToken = Math.floor(100000 + Math.random() * 900000);
   
    if(typeof emailjs !== 'undefined') {
        emailjs.send("service_h23fg3k", "template_7vlbqb8", {
            to_name: name,
            to_email: email,
            otp_code: currentGeneratedToken
        }).then(() => {
            document.getElementById('debug-otp-value').innerText = "SECURELY TRANSMITTED TO MAIL NODE";
        }).catch((err) => {
            document.getElementById('debug-otp-value').innerText = "TRANSMISSION ERROR";
            console.error("Transmission Error:", err);
        });
    } else {
        document.getElementById('debug-otp-value').innerText = `DEV BYPASS CODE: ${currentGeneratedToken}`;
    }
   
    window.startOtpTimerCountdown();
};

window.initQrScanner = function() {
    if (selectedRole !== 'worker') return;

    const panel = document.getElementById('panel-qr-scanner');
    const status = document.getElementById('qr-demo-status');
    panel.classList.remove('hidden');
    status.innerHTML = '<span class="text-cyan-300 animate-pulse">READING WORKER QR...<br><span class="text-white/60 text-[10px]">DEMO QR</span></span>';

    setTimeout(async () => {
        const workerId = document.getElementById('input-worker-id')?.value || '1';
        const unitLabel = String(workerId).padStart(2, '0');
        const workerName = `Worker Unit ${unitLabel}`;
        sessionStorage.setItem('citadel_user_name', workerName);
        sessionStorage.setItem('citadel_user_email', `worker${workerId}@citadel.demo`);
        sessionStorage.setItem('citadel_user_role', 'worker');
        sessionStorage.setItem('citadel_worker_id', workerId);
        status.innerHTML = `<span class="text-emerald-400">WORKER ID VERIFIED<br><span class="text-white">Worker: Unit ${unitLabel}</span><br><span class="text-emerald-300">ACCESS GRANTED</span></span>`;
        try {
            await recordSuccessfulLogin(workerName, 'worker');
        } catch (error) {
            reportLoginLogError(error);
            return;
        }
        setTimeout(() => {
            window.location.href = 'dash-worker.html';
        }, 700);
    }, 900);
};

window.cancelQrScanner = function() {
    if (selectedRole === 'worker') {
        document.getElementById('qr-demo-status').innerHTML = '<span class="text-amber-400">DEMO QR LOGIN<br><span class="text-white/70 text-[10px]">Scan Worker ID to continue</span></span>';
    }
};

window.startOtpTimerCountdown = function() {
    clearInterval(countdownInterval);
    let timeRemaining = 120;
    const display = document.getElementById('otp-timer');
    countdownInterval = setInterval(() => {
        let minutes = Math.floor(timeRemaining / 60);
        let seconds = timeRemaining % 60;
        display.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (--timeRemaining < 0) {
            clearInterval(countdownInterval);
            currentGeneratedToken = 0;
            display.innerText = "EXPIRED";
        }
    }, 1000);
};

window.verifyOtpToken = function() {
    const entered = document.getElementById('input-otp-entry').value.trim();
    if (entered === currentGeneratedToken.toString() && currentGeneratedToken !== 0) {
        clearInterval(countdownInterval);
        document.getElementById('otp-error-msg').classList.add('hidden');
        document.getElementById('panel-otp').classList.add('hidden');
        document.getElementById('panel-biometric').classList.remove('hidden');
        window.initializeHardwareBiometricPipeline();
    } else {
        document.getElementById('otp-error-msg').classList.remove('hidden');
    }
};

window.initializeHardwareBiometricPipeline = async function() {
    livenessStage = 'calibrating';
    document.getElementById('btn-execute-challenge').classList.add('hidden');
    document.getElementById('laser-bar').classList.remove('hidden');
    document.getElementById('camera-error-text').classList.add('hidden');
   
    const txt = document.getElementById('ai-directive-text');
    const tag = document.getElementById('matrix-status-tag');
    txt.innerText = "REQUESTING HARDWARE SENSOR ACCESS...";
    txt.className = "text-xs font-bold text-red-500 animate-pulse text-center uppercase tracking-widest";
    tag.innerText = "CONNECTING";

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 300, height: 300 } });
        const video = document.getElementById('webcam-feed');
        video.srcObject = videoStream;
        document.getElementById('camera-fallback').classList.add('hidden');
       
        txt.innerText = "SENSORS ACTIVE. CALIBRATING DEPTH... STAY STILL.";
        tag.innerText = "CALIBRATING";
        window.beginFacialMatrixMathematicalPlotting();

        setTimeout(() => {
            livenessStage = 'challenge';
            const selectedChallenge = dynamicChallenges[Math.floor(Math.random() * dynamicChallenges.length)];
            txt.innerText = selectedChallenge;
            txt.className = "text-xs font-bold text-white text-center uppercase tracking-widest";
            tag.innerText = "CHALLENGE ISSUED";
            tag.className = "text-[9px] text-amber-500 font-black tracking-widest animate-pulse";
            document.getElementById('btn-execute-challenge').classList.remove('hidden');
        }, 3500);
    } catch (err) {
        console.error("Hardware Blocked:", err);
        document.getElementById('laser-bar').classList.add('hidden');
        txt.innerText = "SYSTEM HALTED: VISUAL SENSOR NOT DETECTED.";
        txt.className = "text-xs font-bold text-zinc-500 text-center uppercase tracking-widest";
        tag.innerText = "ERROR_LOCKED";
        tag.className = "text-[9px] text-red-600 font-black tracking-widest";
        document.getElementById('camera-error-text').classList.remove('hidden');
    }
};

window.beginFacialMatrixMathematicalPlotting = function() {
    const canvas = document.getElementById('matrix-overlay');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 300; canvas.height = 300;
    let points = [];
    for (let i = 0; i < 48; i++) {
        points.push({ baseX: 150 + Math.cos((i / 48) * Math.PI * 2) * 80, baseY: 150 + Math.sin((i / 48) * Math.PI * 2) * 95 });
    }

    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = livenessStage === 'calibrating' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        points.forEach((pt, index) => {
            let offsetPercent = livenessStage === 'calibrating' ? 0.3 : 2.0;
            let cx = pt.baseX + (Math.sin(Date.now() * 0.005 + index) * offsetPercent);
            let cy = pt.baseY + (Math.cos(Date.now() * 0.003 + index) * offsetPercent);
            if (index === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
            ctx.fillStyle = livenessStage === 'calibrating' ? '#ef4444' : '#22c55e';
            ctx.fillRect(cx - 1, cy - 1, 2, 2);
        });
        ctx.closePath(); ctx.stroke();
        canvasAnimationId = requestAnimationFrame(loop);
    }
    loop();
};

window.advanceBiometricChallenge = function() {
    document.getElementById('btn-execute-challenge').classList.add('hidden');
    livenessStage = 'verifying';
    const txt = document.getElementById('ai-directive-text');
    txt.innerText = "GEOMETRY VERIFIED. ESTABLISHING UPLINK...";
    txt.className = "text-xs font-bold text-green-400 text-center uppercase tracking-widest animate-pulse";
   
    setTimeout(async () => {
        window.stopWebcamStream();

        const userName = document.getElementById('input-name').value.trim() || "Authorized Node";
        const userEmail = document.getElementById('input-email').value.trim() || "classified@node.gov";
        const workerId = document.getElementById('input-worker-id') ? document.getElementById('input-worker-id').value : '1';
       
        sessionStorage.setItem('citadel_user_name', userName);
        sessionStorage.setItem('citadel_user_email', userEmail);
        sessionStorage.setItem('citadel_user_role', selectedRole);
        sessionStorage.setItem('citadel_worker_id', workerId);

        try {
            // Race the Firestore write against a timeout so a slow/unreachable
            // database (e.g. Firestore not yet enabled on a new project) can
            // never freeze the login flow on this screen.
            await recordSuccessfulLogin(userName, selectedRole);
        } catch (error) {
            reportLoginLogError(error);
            return;
        }

        if (selectedRole === 'citizen') window.location.href = "dash-citizen.html";
        else if (selectedRole === 'official') window.location.href = "dash-official.html";
        else if (selectedRole === 'worker' || selectedRole === 'labourer') window.location.href = "dash-worker.html";
        else if (selectedRole === 'ngo') window.location.href = "dash-ngo.html";
       
    }, 2000);
};

window.validateAdminClearanceKey = async function() {
    const key = document.getElementById('input-admin-pass').value;
    if (key === 'admin') {
        const adminName = 'System Admin';
        const workerId = document.getElementById('input-worker-id') ? document.getElementById('input-worker-id').value : '1';
       
        sessionStorage.setItem('citadel_user_name', adminName);
        sessionStorage.setItem('citadel_user_role', selectedRole);
        sessionStorage.setItem('citadel_worker_id', workerId);

        try {
            await recordSuccessfulLogin(adminName, selectedRole);
        } catch (error) {
            reportLoginLogError(error);
            return;
        }

        if (selectedRole === 'citizen') window.location.href = "dash-citizen.html";
        else if (selectedRole === 'official') window.location.href = "dash-official.html";
        else if (selectedRole === 'worker' || selectedRole === 'labourer') window.location.href = "dash-worker.html";
        else if (selectedRole === 'ngo') window.location.href = "dash-ngo.html";
    } else {
        document.getElementById('admin-error-text').classList.remove('hidden');
    }
};

window.stopWebcamStream = function() {
    if (videoStream) { videoStream.getTracks().forEach(track => track.stop()); videoStream = null; }
    if (canvasAnimationId) { cancelAnimationFrame(canvasAnimationId); canvasAnimationId = null; }
    const fallback = document.getElementById('camera-fallback');
    if (fallback) fallback.classList.remove('hidden');
};

window.executeDemoBypass = function() {
    const txt = document.getElementById('ai-directive-text');
    txt.innerText = "DEMO BYPASS INITIATED. SIMULATING VIRTUAL GEOMETRY...";
    txt.className = "text-xs font-bold text-amber-500 text-center uppercase tracking-widest animate-pulse";
    
    document.getElementById('btn-demo').classList.add('hidden');
    
    setTimeout(() => {
        window.advanceBiometricChallenge();
    }, 1500);
};