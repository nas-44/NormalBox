// --- GLOBAL CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCeW2AWVvTa2LTwvoXH0fx4lmfWb-_83zE",
    authDomain: "normalbox-f21b1.firebaseapp.com",
    // 👇 THIS LINE WAS MISSING!
    databaseURL: "https://normalbox-f21b1-default-rtdb.firebaseio.com",
    projectId: "normalbox-f21b1",
    storageBucket: "normalbox-f21b1.firebasestorage.app",
    messagingSenderId: "1021299597254",
    appId: "1:1021299597254:web:0eab183e11c963f1e9dcc7",
    measurementId: "G-1WPYZ1WDND"
};

// INITIALIZE FIREBASE
let dbCloud = null;
try {
    firebase.initializeApp(firebaseConfig);
    dbCloud = firebase.database();
    console.log("Firebase initialized successfully");
} catch (e) {
    console.error("Firebase Init Error:", e);
    alert("Database Connection Failed. See Console.");
}
// --- GLOBAL CONFIGURATION ---
const DB_KEY = 'normalbox_db_v1';
const SESSION_KEY = 'normalbox_session_v1'; 
const PROCESS_DELAY = 300; 
const OWNER_CRED = { id: 'owner', pass: 'admin123' }; 

let currentUser = null; 
let currentEditType = null; 
let currentEditId = null;
let currentResultId = null; 
let cropper = null;
let currentProfileImageData = null; 

// --- UI HELPERS ---
function setButtonLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
        btn.classList.add('btn-loading');
        btn.innerHTML = `<span class="spinner"></span>`;
    } else {
        btn.classList.remove('btn-loading');
        btn.innerHTML = btn.dataset.originalText || 'Submit';
    }
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `toast-enter mb-3 p-4 rounded-lg shadow-lg text-white font-semibold flex items-center gap-3 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`;
    div.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
    container.appendChild(div);
    setTimeout(() => div.classList.add('toast-enter-active'), 10);
    setTimeout(() => div.remove(), 3500);
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function closeModal() { 
    const m1 = document.getElementById('modal-overlay'); if(m1) m1.classList.add('hidden');
    const m2 = document.getElementById('modal-cropper'); if(m2) m2.classList.add('hidden');
}

// --- DATABASE & SESSION ---
function getDB() {
    const db = localStorage.getItem(DB_KEY);
    // Initialize with all required arrays to prevent read errors
    let data = db ? JSON.parse(db) : { institutions: [], classes: [], subjects: [], students: [], exams: [], results: [] };
    if (!data.institutions) data.institutions = [];
    if (!data.students) data.students = [];
    if (!data.results) data.results = [];
    return data;
}

function saveDB(data) { 
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(data)); 
    } catch (e) {
        showToast("Storage Full! Image too large.", "error");
        console.error("Save DB Error:", e);
    }
}

function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }

function saveSession(user, role) { 
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, role, timestamp: Date.now() })); 
}

function clearSession() { 
    localStorage.removeItem(SESSION_KEY); 
    window.location.href = 'index.html'; // Redirect to landing
}

function restoreSession() {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!session) return;
    
    const db = getDB();
    const isOwnerPage = window.location.pathname.includes('owner.html');

    if (session.role === 'owner' && isOwnerPage) {
        document.getElementById('view-owner-login').classList.add('hidden');
        document.getElementById('view-owner-dash').classList.remove('hidden');
        renderOwnerStats();
        return;
    }

    // Prevent non-owners from accessing owner page logic
    if (isOwnerPage && session.role !== 'owner') return;

    if (!isOwnerPage) {
        if (session.role === 'inst') {
            const user = db.institutions.find(u => u.id === session.id);
            if (user && user.isActive !== false) {
                currentUser = user;
                showLogin('inst'); 
                document.getElementById('view-login').classList.add('hidden');
                document.getElementById('view-inst').classList.remove('hidden');
                showInstTab('home');
            } else { clearSession(); }
        } else if (session.role === 'student') {
            const user = db.students.find(u => u.id === session.id);
            if (user) {
                const inst = db.institutions.find(i => i.id === user.institutionId);
                currentUser = { ...user, role: 'student', instName: inst ? inst.name : 'Unknown' };
                showLogin('student');
                document.getElementById('view-login').classList.add('hidden');
                document.getElementById('view-student').classList.remove('hidden');
                updateStudentSidebar();
                showStudentTab('results');
            } else { clearSession(); }
        }
    }
}

// --- PAGE INITIALIZATION ---
const urlParams = new URLSearchParams(window.location.search);
const portalInstId = urlParams.get('id');
const isOwnerPage = window.location.pathname.includes('owner.html');

window.onload = () => {
    const db = getDB();
    restoreSession();

    if (!isOwnerPage) {
        // Populate Institution Dropdown
        const select = document.getElementById('student-inst-select');
        if (select) {
            select.innerHTML = '<option value="">Select Institution</option>';
            db.institutions.filter(i => i.isActive !== false).forEach(i => { 
                select.innerHTML += `<option value="${i.id}">${i.name}</option>`; 
            });
            // Trigger auth check if institutions exist
            if(select.options.length > 1) checkInstAuthMethod();
        }

        // Handle Direct Link Login
        if (portalInstId) {
            const inst = db.institutions.find(i => i.id === portalInstId);
            if (inst) {
                document.getElementById('view-landing').classList.add('hidden');
                showLogin('student');
                select.value = inst.id;
                select.disabled = true;
                checkInstAuthMethod();
            }
        }

        // Set Dates
        safeSetText('current-date-display', new Date().toLocaleDateString());
        safeSetText('student-date-display', new Date().toLocaleDateString());
    }
};

// --- NAVIGATION ---
function showLogin(role) {
    document.getElementById('view-landing').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
    ['inst', 'student'].forEach(r => {
        const el = document.getElementById(`login-form-${r}`);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(`login-form-${role}`).classList.remove('hidden');
}

function goBackToLanding() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-landing').classList.remove('hidden');
}

function toggleRegister(role) {
    if (role === 'inst') {
        const login = document.getElementById('login-form-inst');
        const reg = document.getElementById('form-inst-register');
        if (login.classList.contains('hidden')) {
            login.classList.remove('hidden'); reg.classList.add('hidden');
        } else {
            login.classList.add('hidden'); reg.classList.remove('hidden');
        }
    }
}

function updateSidebarActive(tabName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById(`nav-${tabName}`) || document.getElementById(`st-nav-${tabName}`);
    if (btn) btn.classList.add('active');
}

function updateStudentSidebar() {
    const db = getDB();
    const s = db.students.find(stu => stu.id === currentUser.id);
    if(!s) return;
    safeSetText('st-sidebar-name', s.name);
    safeSetText('st-sidebar-adm', `ADM: ${s.admissionNo}`);
    safeSetText('st-institution-name', currentUser.instName);
    
    // Updated selector for new HTML structure
    const container = document.getElementById('sidebar-avatar-container');
    if(container) {
        container.innerHTML = s.profileImage 
            ? `<img src="${s.profileImage}" class="w-full h-full object-cover">` 
            : `<i class="fas fa-user"></i>`;
    }
}

// --- DYNAMIC LOGIN UI ---
function checkInstAuthMethod() {
    const select = document.getElementById('student-inst-select');
    const instId = select.value;
    if (!instId) return;

    const db = getDB();
    const inst = db.institutions.find(i => i.id === instId);
    const label = document.getElementById('lbl-student-cred');
    const input = document.getElementById('student-cred');

    if (inst && inst.authMethod === 'password') {
        label.innerText = 'Password';
        input.type = 'password';
        input.placeholder = 'Enter Password';
    } else {
        label.innerText = 'Date of Birth';
        input.type = 'date';
        input.placeholder = '';
    }
}

// --- AUTH HANDLERS ---
function handleInstLogin(e) { 
    e.preventDefault(); 
    setButtonLoading('btn-inst-login', true); 
    const email = document.getElementById('inst-email').value; 
    const pass = document.getElementById('inst-pass').value; 
    setTimeout(() => { 
        const user = getDB().institutions.find(i => i.email === email && i.pass === pass); 
        if (user) { 
            if (user.isActive === false) { 
                setButtonLoading('btn-inst-login', false); return showToast('Account Deactivated', 'error'); 
            } 
            currentUser = user; 
            saveSession(user, 'inst'); 
            document.getElementById('view-login').classList.add('hidden'); 
            document.getElementById('view-inst').classList.remove('hidden'); 
            showInstTab('home'); 
        } else { 
            showToast('Invalid Credentials', 'error'); 
        } 
        setButtonLoading('btn-inst-login', false); 
    }, PROCESS_DELAY); 
}

function handleStudentLogin(e) { 
    e.preventDefault(); 
    setButtonLoading('btn-student-login', true); 
    const instId = document.getElementById('student-inst-select').value; 
    const adm = document.getElementById('student-adm').value; 
    const cred = document.getElementById('student-cred').value; 
    
    setTimeout(() => { 
        if (!instId) { setButtonLoading('btn-student-login', false); return showToast('Select Inst', 'error'); } 
        const db = getDB(); 
        const inst = db.institutions.find(i => i.id === instId);
        const user = db.students.find(s => s.institutionId === instId && s.admissionNo === adm);
        
        let authorized = false;
        if (user) {
            if (inst.authMethod === 'password') {
                // Default password is admission number if not set
                const pwd = user.password || user.admissionNo; 
                if (cred === pwd) authorized = true;
            } else {
                if (user.dob === cred) authorized = true;
            }
        }

        if (authorized) { 
            currentUser = { ...user, role: 'student', instName: inst.name }; 
            saveSession(user, 'student'); 
            document.getElementById('view-login').classList.add('hidden'); 
            document.getElementById('view-student').classList.remove('hidden'); 
            updateStudentSidebar(); 
            showStudentTab('results'); 
        } else { 
            showToast('Student Not Found or Wrong Credentials', 'error'); 
        } 
        setButtonLoading('btn-student-login', false); 
    }, PROCESS_DELAY); 
}

// ... (Previous code remains unchanged)

// --- STUDENT DASHBOARD ENHANCED ---
function showStudentTab(tabName) {
    const content = document.getElementById('student-content-area');
    const title = document.getElementById('st-page-title');
    const db = getDB();
    updateSidebarActive(tabName);

    if (tabName === 'results') {
        if(title) title.innerText = 'Dashboard Overview';
        
        const myResults = db.results.filter(r => r.studentId === currentUser.id);
        const totalExams = myResults.length;

        // UPDATED: Removed Passed Count and Avg Percentage Cards
        let html = `
            <div class="mb-8 fade-in">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 max-w-sm">
                    <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl"><i class="fas fa-book-open"></i></div>
                    <div><p class="text-xs text-gray-400 font-bold uppercase tracking-wider">Exams Taken</p><p class="text-2xl font-black text-gray-800">${totalExams}</p></div>
                </div>
            </div>
            
            <h3 class="font-bold text-gray-800 mb-4 text-lg flex items-center gap-2"><i class="fas fa-history text-blue-500"></i> Recent Results</h3>
        `;

        if (myResults.length === 0) { 
            html += `
            <div class="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500 fade-in">
                <div class="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 text-3xl"><i class="fas fa-box-open"></i></div>
                <h4 class="text-lg font-bold text-gray-700">No results found</h4>
                <p class="text-sm">Your exam results will appear here once published by the institution.</p>
            </div>`; 
        } else {
            html += `<div class="grid gap-5 md:grid-cols-2 lg:grid-cols-2 fade-in">`;
            
            myResults.reverse().forEach(res => {
                const exam = db.exams.find(e => e.id === res.examId) || { name: 'Unknown Exam' };
                const isPass = res.status === 'PASS';

                // UPDATED: Removed Status Badge and Score/Percentage Text
                html += `
                <div class="bg-white rounded-2xl p-0 shadow-sm border border-gray-100 hover:shadow-md transition group overflow-hidden relative">
                    <div class="absolute top-0 left-0 w-1.5 h-full ${isPass ? 'bg-green-500' : 'bg-red-500'}"></div>
                    <div class="p-6">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <h4 class="font-bold text-lg text-gray-800 group-hover:text-blue-600 transition">${exam.name}</h4>
                                <p class="text-xs text-gray-400 font-medium mt-1">ID: ${res.id.substr(0,8)}</p>
                            </div>
                        </div>
                        
                        <div class="flex items-center justify-end mt-4 pt-4 border-t border-gray-50">
                            <button onclick="viewMarksheet('${res.id}')" class="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-blue-600 transition shadow-lg shadow-gray-200 flex items-center gap-2">
                                Marksheet <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
            });
            html += `</div>`;
        }
        content.innerHTML = html;

    } else if (tabName === 'certificates') {
        // ... (Keep existing Certificates logic)
        if(title) title.innerText = 'My Certificates';
        const myResults = db.results.filter(r => r.studentId === currentUser.id && r.status === 'PASS');
        let html = `<div class="bg-blue-600 text-white p-6 rounded-2xl shadow-lg mb-8 bg-gradient-to-r from-blue-600 to-indigo-600 relative overflow-hidden"><div class="absolute right-0 top-0 opacity-10 transform translate-x-10 -translate-y-10"><i class="fas fa-certificate text-9xl"></i></div><h3 class="font-bold text-2xl mb-1 relative z-10">Achievements</h3><p class="text-blue-100 text-sm relative z-10">Official certificates for passed examinations.</p></div>`;
        if (myResults.length === 0) {
            html += `<div class="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500"><i class="fas fa-award text-4xl mb-3 text-gray-300"></i><p>No certificates earned yet.</p></div>`; 
        } else {
            html += `<div class="grid gap-4 md:grid-cols-2 fade-in">`;
            myResults.forEach(res => {
                const exam = db.exams.find(e => e.id === res.examId) || { name: 'Unknown' };
                html += `<div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 group hover:border-yellow-400 transition cursor-pointer" onclick="viewCertificate('${res.id}')"><div class="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-lg flex items-center justify-center text-2xl border border-yellow-100 shadow-inner group-hover:scale-110 transition"><i class="fas fa-trophy"></i></div><div class="flex-1"><h4 class="font-bold text-gray-800 group-hover:text-yellow-700 transition">${exam.name}</h4><p class="text-xs text-gray-400 mt-1">Tap to view certificate</p></div><button class="w-10 h-10 rounded-full bg-gray-50 text-gray-400 hover:bg-yellow-500 hover:text-white transition flex items-center justify-center"><i class="fas fa-chevron-right"></i></button></div>`;
            });
            html += `</div>`;
        }
        content.innerHTML = html;

    } else if (tabName === 'profile') {
        // ... (Keep existing Profile logic)
        if(title) title.innerText = 'My Profile';
        const s = db.students.find(stu => stu.id === currentUser.id); 
        const photoHTML = s.profileImage ? `<img src="${s.profileImage}" class="w-full h-full object-cover rounded-xl" id="pf-img-preview">` : `<div class="w-full h-full bg-gray-50 flex items-center justify-center text-gray-300 rounded-xl" id="pf-img-preview"><i class="fas fa-user text-3xl"></i></div>`;
        content.innerHTML = `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden fade-in"><div class="h-32 bg-gradient-to-r from-purple-600 to-blue-600"></div><div class="px-8 pb-8"><div class="relative flex justify-between items-end -mt-12 mb-8"><div class="w-24 h-24 bg-white p-1 rounded-2xl shadow-lg cursor-pointer" onclick="document.getElementById('pf-img-file').click()">${photoHTML}<div class="absolute bottom-0 right-0 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center border-2 border-white text-xs hover:bg-blue-700 transition"><i class="fas fa-camera"></i></div></div><input type="file" id="pf-img-file" accept="image/*" class="hidden" onchange="handleProfileImageSelect(this)"><button onclick="saveStudentProfile()" id="btn-save-profile" class="bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 transition">Save Changes</button></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="col-span-1 md:col-span-2"><h4 class="font-bold text-gray-800 border-b pb-2 mb-2">Personal Details</h4></div><div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Father's Name</label><input id="pf-father" value="${s.fatherName||''}" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition"></div><div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Mother's Name</label><input id="pf-mother" value="${s.motherName||''}" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition"></div><div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Mobile</label><input id="pf-mobile" value="${s.mobile||''}" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition"></div><div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">ID Marks</label><input id="pf-idmark" value="${s.idMark||''}" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition"></div><div class="col-span-1 md:col-span-2"><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Address</label><textarea id="pf-address" rows="3" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition">${s.address||''}</textarea></div></div></div></div>`;
    } else if (tabName === 'security') {
        // ... (Keep existing Security logic)
        if(title) title.innerText = 'Security Settings';
        content.innerHTML = `<div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-xl fade-in"><h4 class="font-bold text-gray-800 border-b pb-4 mb-6">Login Credentials</h4><div class="mb-6"><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Admission Number (Login ID)</label><input id="sec-adm" value="${currentUser.admissionNo}" disabled class="w-full p-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"><p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle"></i> Cannot be changed manually.</p></div><div class="mb-8"><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Date of Birth (Password)</label><input id="sec-dob" type="date" value="${currentUser.dob}" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 outline-none transition"></div><button onclick="saveStudentSecurity()" id="btn-save-sec" class="w-full bg-red-50 text-red-600 border border-red-100 hover:bg-red-600 hover:text-white px-6 py-3 rounded-xl font-bold transition">Update Credentials</button></div>`;
    }
}

// ... (Rest of the file remains unchanged)

async function handleInstRegister(e) { 
    e.preventDefault(); 
    
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;

    if(!name || !email || !pass) return showToast("Please fill all fields", "error");

    setButtonLoading('btn-inst-reg', true); 
    
    // Use async logic instead of setTimeout for better reliability
    setTimeout(async () => { 
        try {
            const db = getDB(); 
            
            // 1. Check if email exists
            if (db.institutions.find(i => i.email === email)) { 
                setButtonLoading('btn-inst-reg', false); 
                return showToast('Email already registered', 'error'); 
            } 

            // 2. Create new institution
            const newInst = { 
                id: generateId(), 
                name: name, 
                email: email, 
                pass: pass, 
                isActive: true, 
                authMethod: 'dob' 
            };
            
            db.institutions.push(newInst); 
            
            // 3. Save to Cloud (Wait for it to finish)
            await saveDB(db); 
            
            showToast('Registration Successful!'); 
            toggleRegister('inst'); 
            
        } catch (error) {
            console.error(error);
            showToast("Error saving to cloud: " + error.message, "error");
        } finally {
            // 4. Always stop loading, even if there is an error
            setButtonLoading('btn-inst-reg', false); 
        }
    }, 100); 
}

function logout() { clearSession(); }

// --- CROPPER & IMAGES ---
function handleProfileImageSelect(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById('cropper-img');
            img.src = e.target.result;
            document.getElementById('modal-cropper').classList.remove('hidden');
            if (cropper) cropper.destroy();
            cropper = new Cropper(img, { aspectRatio: 1, viewMode: 1, autoCropArea: 1 });
        };
        reader.readAsDataURL(file);
    }
    input.value = "";
}

function cropAndSave() {
    if (!cropper) return;
    // Optimize image size
    const canvas = cropper.getCroppedCanvas({ width: 300, height: 300 });
    currentProfileImageData = canvas.toDataURL('image/jpeg', 0.7);
    
    const preview = document.getElementById('pf-img-preview');
    if(preview) {
        // Dynamic element replacement
        const newImg = document.createElement('img');
        newImg.src = currentProfileImageData;
        newImg.className = "w-full h-full object-cover rounded";
        newImg.id = "pf-img-preview";
        preview.replaceWith(newImg);
    }
    
    document.getElementById('modal-cropper').classList.add('hidden');
    cropper.destroy(); cropper = null;
}

// --- SAVE STUDENT PROFILE (FIXED) ---
function saveStudentProfile() {
    setButtonLoading('btn-save-profile', true);
    setTimeout(() => {
        const db = getDB();
        const idx = db.students.findIndex(s => s.id === currentUser.id);
        if(idx > -1) {
            db.students[idx].fatherName = document.getElementById('pf-father').value;
            db.students[idx].motherName = document.getElementById('pf-mother').value;
            db.students[idx].mobile = document.getElementById('pf-mobile').value;
            db.students[idx].idMark = document.getElementById('pf-idmark').value;
            db.students[idx].address = document.getElementById('pf-address').value;
            
            if(currentProfileImageData) {
                db.students[idx].profileImage = currentProfileImageData;
            }
            
            saveDB(db);
            currentUser = db.students[idx]; // Update session user
            
            updateStudentSidebar();
            showToast('Profile Updated Successfully');
        } else {
            showToast('Session Error', 'error');
        }
        setButtonLoading('btn-save-profile', false);
    }, 500);
}

// --- OWNER LOGIC ---
function handleOwnerLogin(e) { 
    e.preventDefault(); setButtonLoading('btn-owner-login', true); 
    setTimeout(() => { 
        if (document.getElementById('owner-id').value === OWNER_CRED.id && document.getElementById('owner-pass').value === OWNER_CRED.pass) { 
            saveSession({ id: 'owner' }, 'owner'); 
            document.getElementById('view-owner-login').classList.add('hidden'); 
            document.getElementById('view-owner-dash').classList.remove('hidden'); 
            renderOwnerStats(); 
        } else { showToast('Invalid', 'error'); } 
        setButtonLoading('btn-owner-login', false); 
    }, PROCESS_DELAY); 
}
function logoutOwner() { clearSession(); }
function renderOwnerStats() { 
    const db = getDB(); 
    document.getElementById('owner-page-title').innerText = "System Overview"; 
    document.getElementById('owner-content-area').innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg"><div class="text-4xl font-bold text-blue-400 mb-1">${db.institutions.length}</div><div class="text-gray-400 text-xs uppercase">Institutions</div></div><div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg"><div class="text-4xl font-bold text-green-400 mb-1">${db.institutions.filter(i=>i.isActive!==false).length}</div><div class="text-gray-400 text-xs uppercase">Active</div></div><div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg"><div class="text-4xl font-bold text-purple-400 mb-1">${db.students.length}</div><div class="text-gray-400 text-xs uppercase">Students</div></div></div>`; 
}
function renderOwnerInstList() { 
    const db = getDB(); document.getElementById('owner-page-title').innerText = "Manage Institutions"; 
    let html = `<div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg"><table class="w-full text-sm text-left text-gray-300"><thead class="bg-gray-900 text-gray-400 uppercase text-xs"><tr><th class="p-4">Name</th><th class="p-4">Email</th><th class="p-4">Status</th><th class="p-4 text-right">Action</th></tr></thead><tbody class="divide-y divide-gray-700">`; 
    db.institutions.forEach(inst => { 
        const isActive = inst.isActive !== false; 
        const btn = isActive ? `<button onclick="toggleInstStatus('${inst.id}', false)" class="bg-red-600 text-white px-3 py-1 rounded text-xs">Deactivate</button>` : `<button onclick="toggleInstStatus('${inst.id}', true)" class="bg-green-600 text-white px-3 py-1 rounded text-xs">Activate</button>`; 
        html += `<tr class="hover:bg-gray-750"><td class="p-4 font-bold text-white">${inst.name}</td><td class="p-4">${inst.email}</td><td class="p-4">${isActive?'Active':'Inactive'}</td><td class="p-4 text-right">${btn}<button onclick="deleteInstitutionAccount('${inst.id}')" class="bg-gray-700 text-white px-3 py-1 rounded text-xs ml-2"><i class="fas fa-trash"></i></button></td></tr>`; 
    }); 
    document.getElementById('owner-content-area').innerHTML = html + '</tbody></table></div>'; 
}
function toggleInstStatus(id, status) { const db = getDB(); const inst = db.institutions.find(i => i.id === id); if (inst) { inst.isActive = status; saveDB(db); renderOwnerInstList(); } }
function deleteInstitutionAccount(instId = null) { if(!confirm('Delete?')) return; const db = getDB(); const targetId = instId || currentUser.id; db.results = db.results.filter(r => db.exams.find(e => e.id === r.examId)?.institutionId !== targetId); db.exams = db.exams.filter(e => e.institutionId !== targetId); db.students = db.students.filter(s => s.institutionId !== targetId); db.classes = db.classes.filter(c => c.institutionId !== targetId); db.institutions = db.institutions.filter(i => i.id !== targetId); saveDB(db); if(instId) renderOwnerInstList(); else { clearSession(); alert("Deleted"); } }

// --- INSTITUTION DASHBOARD ---
function showInstTab(tabName) {
    const content = document.getElementById('inst-content-area');
    const db = getDB();
    safeSetText('inst-page-title', tabName.charAt(0).toUpperCase() + tabName.slice(1));
    updateSidebarActive(tabName);

    if (tabName === 'home') {
        const cCount = db.classes.filter(c => c.institutionId === currentUser.id).length;
        const sCount = db.students.filter(s => s.institutionId === currentUser.id).length;
        const eCount = db.exams.filter(e => e.institutionId === currentUser.id).length;
        content.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 fade-in"><div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg"><div class="text-5xl font-bold mb-1">${cCount}</div><div class="text-blue-100 text-sm font-medium uppercase">Classes</div></div><div class="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg"><div class="text-5xl font-bold mb-1">${sCount}</div><div class="text-purple-100 text-sm font-medium uppercase">Students</div></div><div class="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg"><div class="text-5xl font-bold mb-1">${eCount}</div><div class="text-green-100 text-sm font-medium uppercase">Exams</div></div></div><div class="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center fade-in"><h3 class="text-xl text-gray-800 font-bold mb-2">Welcome back, ${currentUser.name}</h3><p class="text-gray-500 text-sm">Use the sidebar to manage your institution.</p></div>`;
    } else if (tabName === 'classes') {
        let html = `<div class="bg-white p-6 rounded-lg shadow mb-6 border-t-4 border-blue-500"><h3 class="font-bold mb-4">Create Class</h3><div class="flex gap-2"><input id="new-class-name" placeholder="Class Name" class="border p-2 rounded flex-1 outline-none"><input id="new-class-att" type="number" placeholder="Days" class="border p-2 rounded w-24 outline-none"><button onclick="addClass()" class="bg-blue-600 text-white px-4 rounded">Add</button></div></div><div class="bg-white p-6 rounded-lg shadow"><ul class="divide-y">`;
        db.classes.filter(c => c.institutionId === currentUser.id).forEach(c => { html += `<li class="py-3 flex justify-between items-center"><span>${c.name} <small class="text-gray-500">(${c.totalAttendance} days)</small></span><div><button onclick="manageSubjects('${c.id}')" class="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded mr-2">Subjects</button><button onclick="openEditModal('class', '${c.id}')" class="text-gray-400 hover:text-yellow-500 px-2"><i class="fas fa-pen"></i></button><button onclick="deleteItem('class', '${c.id}')" class="text-gray-400 hover:text-red-500 px-2"><i class="fas fa-trash"></i></button></div></li>`; });
        content.innerHTML = html + '</ul></div>';
    } else if (tabName === 'students') {
        const myClasses = db.classes.filter(c => c.institutionId === currentUser.id).sort((a, b) => a.name.localeCompare(b.name));
        let classOptions = myClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        let filterOptions = `<option value="">All Classes</option>` + myClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        let html = `<div class="grid md:grid-cols-2 gap-6 mb-6"><div class="bg-white p-6 rounded-lg shadow border-t-4 border-blue-500"><h3 class="font-bold mb-4">Add Student</h3><div class="grid grid-cols-1 gap-3 mb-3"><input id="st-name" placeholder="Name" class="border p-2 rounded outline-none"><input id="st-adm" placeholder="Adm No" class="border p-2 rounded outline-none"><input id="st-dob" type="date" class="border p-2 rounded outline-none"><select id="st-class" class="border p-2 rounded bg-white outline-none">${classOptions}</select><input id="st-mobile" placeholder="Mobile" class="border p-2 rounded outline-none"></div><button onclick="addStudent()" id="btn-add-st" class="w-full btn-master btn-primary py-2 rounded">Add</button></div><div class="bg-white p-6 rounded-lg shadow border-t-4 border-green-500"><h3 class="font-bold mb-4">Bulk Import</h3><p class="text-xs text-gray-500 mb-3">Upload Excel/CSV (Cols: Name, Adm, DOB, Mobile)</p><div class="mb-3"><select id="bulk-st-class" class="w-full border p-2 rounded bg-white outline-none mb-2"><option value="">Select Class for Import</option>${classOptions}</select><input type="file" id="bulk-st-file" accept=".xlsx, .xls, .csv" class="w-full border p-2 rounded text-sm"></div><button onclick="processBulkStudentUpload()" class="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">Import</button></div></div><div class="bg-white p-6 rounded-lg shadow"><div class="flex justify-between items-center mb-4"><h3 class="font-bold">Student List</h3><div class="flex gap-2"><button onclick="deleteSelectedStudents()" class="bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white px-3 py-1 rounded text-xs font-bold transition"><i class="fas fa-trash"></i> Delete Selected</button><select id="filter-class" onchange="filterStudents()" class="border p-2 rounded text-sm bg-white outline-none">${filterOptions}</select><button onclick="downloadStudents('pdf')" class="bg-red-500 text-white px-3 py-1 rounded text-xs">PDF</button><button onclick="downloadStudents('excel')" class="bg-green-600 text-white px-3 py-1 rounded text-xs">Excel</button></div></div><input type="text" id="search-student" onkeyup="filterTable('search-student', 'table-students')" placeholder="Search..." class="border p-2 rounded text-sm w-full mb-2 outline-none"><div class="overflow-x-auto"><table id="table-students" class="w-full text-sm text-left border-collapse table-striped"><thead class="bg-gray-50 text-gray-600"><tr><th class="p-3 border-b w-10 text-center"><input type="checkbox" id="select-all-students" onclick="toggleSelectAll()" class="w-4 h-4 accent-blue-600 rounded cursor-pointer"></th><th class="p-3 border-b">Adm</th><th class="p-3 border-b">Photo</th><th class="p-3 border-b">Name</th><th class="p-3 border-b">Class</th><th class="p-3 border-b text-right">Actions</th></tr></thead><tbody id="student-tbody"></tbody></table></div></div>`;
        content.innerHTML = html; filterStudents();
    } else if (tabName === 'exams') {
         let html = `<div class="bg-white p-6 rounded-lg shadow mb-6 border-t-4 border-blue-500"><h3 class="font-bold mb-4">Create Exam</h3><div class="flex gap-2"><input id="new-exam-name" placeholder="Exam Name" class="border p-2 rounded flex-1 outline-none"><button onclick="addExam()" class="bg-blue-600 text-white px-4 rounded hover:bg-blue-700">Create</button></div></div><div class="bg-white p-6 rounded-lg shadow"><ul class="divide-y">`;
         db.exams.filter(e => e.institutionId === currentUser.id).forEach(e => { html += `<li class="py-3 flex justify-between items-center"><span>${e.name}</span><div class="flex gap-2"><button onclick="openEditModal('exam', '${e.id}')" class="text-gray-400 hover:text-yellow-500 px-2"><i class="fas fa-pen"></i></button><button onclick="deleteItem('exam', '${e.id}')" class="text-gray-400 hover:text-red-500 px-2"><i class="fas fa-trash"></i></button></div></li>`; });
         content.innerHTML = html + '</ul></div>';
    } else if (tabName === 'publish') {
        const myExams = db.exams.filter(e => e.institutionId === currentUser.id).map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        const myClasses = db.classes.filter(c => c.institutionId === currentUser.id).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        content.innerHTML = `<div class="bg-white p-6 rounded-lg shadow mb-6 border-t-4 border-blue-500"><h3 class="font-bold mb-4">Select Context</h3><div class="flex gap-3 mb-4"><select id="pub-exam" class="border p-2 rounded flex-1 bg-gray-50 outline-none"><option value="">Select Exam</option>${myExams}</select><select id="pub-class" class="border p-2 rounded flex-1 bg-gray-50 outline-none"><option value="">Select Class</option>${myClasses}</select><button onclick="loadPublishTable()" class="bg-blue-600 text-white px-6 rounded hover:bg-blue-700 transition shadow">Load</button></div></div><div id="publish-table-container" class="overflow-x-auto"></div>`;
    } else if (tabName === 'profile') {
         const link = `${window.location.origin}${window.location.pathname}?id=${currentUser.id}`;
         const inst = currentUser;
         const logo = inst.profileImage ? `<img src="${inst.profileImage}" class="w-20 h-20 rounded-full object-cover border mx-auto">` : `<div class="w-20 h-20 bg-gray-200 rounded-full mx-auto flex items-center justify-center text-2xl text-gray-400"><i class="fas fa-university"></i></div>`;
         const currentMethod = inst.authMethod || 'dob';
         
         content.innerHTML = `
         <div class="bg-white p-8 rounded-xl shadow mb-6">
            <h3 class="font-bold mb-6 text-lg">Institution Profile</h3>
            ${logo}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div><label class="text-xs font-bold">Name</label><input id="set-name" value="${inst.name}" class="w-full p-3 border rounded"></div>
                <div><label class="text-xs font-bold">Logo</label><input type="file" id="set-img-file" accept="image/*" class="w-full p-2 border rounded"></div>
                <div><label class="text-xs font-bold">Email</label><input id="set-email" value="${inst.email}" class="w-full p-3 border rounded"></div>
                <div><label class="text-xs font-bold">Password</label><input id="set-pass" type="text" value="${inst.pass}" class="w-full p-3 border rounded"></div>
                <div><label class="text-xs font-bold">Principal Signature</label><input type="file" id="set-sig-file" accept="image/*" class="w-full p-2 border rounded"></div>
                <div><label class="text-xs font-bold">Certificate Template</label><input type="file" id="set-cert-file" accept="image/*" class="w-full p-2 border rounded"></div>
                <div class="col-span-2 p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <label class="text-xs font-bold text-blue-600 uppercase mb-2 block">Student Login Method</label>
                    <select id="set-auth-method" class="w-full p-3 border rounded bg-white">
                        <option value="dob" ${currentMethod==='dob'?'selected':''}>Date of Birth (Default)</option>
                        <option value="password" ${currentMethod==='password'?'selected':''}>Password (Default: Adm No)</option>
                    </select>
                </div>
            </div>
            <div class="mt-6 flex justify-between items-center"><button id="btn-save-settings" onclick="saveInstSettings()" class="btn-master btn-primary py-3 px-8 rounded-lg">Save Changes</button></div>
            <div class="mt-12 border-t pt-6"><button onclick="deleteInstitutionAccount()" class="text-red-600 text-sm font-bold hover:underline">Delete Account</button></div>
         </div>
         <div class="bg-white p-6 rounded-lg shadow"><h3 class="font-bold mb-2">Student Link</h3><div class="bg-gray-50 p-4 rounded flex justify-between items-center border"><code class="text-sm text-blue-600">${link}</code><button onclick="navigator.clipboard.writeText('${link}');showToast('Copied!')" class="text-gray-600 font-bold ml-4">Copy</button></div></div>`;
    }
}

// --- HELPERS ---
function filterTable(inputId, tableId) { const input = document.getElementById(inputId); const filter = input.value.toUpperCase(); const table = document.getElementById(tableId); if(!table) return; const tr = table.getElementsByTagName("tr"); for (let i = 1; i < tr.length; i++) { let visible = false; const tds = tr[i].getElementsByTagName("td"); for (let j = 0; j < tds.length; j++) { if (tds[j] && tds[j].textContent.toUpperCase().indexOf(filter) > -1) { visible = true; break; } } tr[i].style.display = visible ? "" : "none"; } }
function processBulkStudentUpload() { const fileInput = document.getElementById('bulk-st-file'); const classId = document.getElementById('bulk-st-class').value; if(!classId) return showToast('Select Class', 'error'); if(!fileInput.files.length) return showToast('Select File', 'error'); const file = fileInput.files[0]; const reader = new FileReader(); reader.onload = function(e) { const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, {type: 'array'}); const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1}); if(rows.length < 2) return showToast('Invalid File', 'error'); const db = getDB(); let added = 0; for(let i=1; i<rows.length; i++) { const row = rows[i]; if(!row || row.length < 2) continue; if(db.students.some(s => s.institutionId === currentUser.id && s.admissionNo == row[1])) continue; db.students.push({ id: generateId(), institutionId: currentUser.id, classId: classId, name: String(row[0]), admissionNo: String(row[1]), dob: String(row[2]), mobile: String(row[3]||'') }); added++; } saveDB(db); showToast(`Imported ${added} students.`); filterStudents(); }; reader.readAsArrayBuffer(file); }
function toggleSelectAll() { const master = document.getElementById('select-all-students'); const cbs = document.querySelectorAll('.student-select-cb'); cbs.forEach(cb => cb.checked = master.checked); }
function deleteSelectedStudents() { const selected = Array.from(document.querySelectorAll('.student-select-cb:checked')).map(cb => cb.value); if (selected.length === 0) return showToast('No students selected', 'error'); if (!confirm(`Delete ${selected.length} students?`)) return; const db = getDB(); db.students = db.students.filter(s => !selected.includes(s.id)); db.results = db.results.filter(r => !selected.includes(r.studentId)); saveDB(db); showToast('Students Deleted'); filterStudents(); }
function filterStudents() { 
    const filterClassId = document.getElementById('filter-class') ? document.getElementById('filter-class').value : ''; const db = getDB(); let students = db.students.filter(s => s.institutionId === currentUser.id); if (filterClassId) students = students.filter(s => s.classId === filterClassId); 
    students.sort((a, b) => { const cA = db.classes.find(c => c.id === a.classId)?.name || ''; const cB = db.classes.find(c => c.id === b.classId)?.name || ''; return cA.localeCompare(cB) || a.admissionNo.localeCompare(b.admissionNo, undefined, {numeric: true}); }); 
    const tbody = document.getElementById('student-tbody'); if (!tbody) return; tbody.innerHTML = ''; 
    const master = document.getElementById('select-all-students'); if(master) master.checked = false;
    if(students.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">No students found.</td></tr>'; return; } 
    students.forEach(s => { const cName = db.classes.find(c => c.id === s.classId)?.name || '-'; const avatar = s.profileImage ? `<img src="${s.profileImage}" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs"><i class="fas fa-user"></i></div>`; tbody.innerHTML += `<tr class="border-b hover:bg-blue-50/30 transition group"><td class="p-3 text-center"><input type="checkbox" class="student-select-cb w-4 h-4 accent-blue-600 rounded cursor-pointer" value="${s.id}"></td><td class="p-3 font-mono text-gray-600">${s.admissionNo}</td><td class="p-3">${avatar}</td><td class="p-3 font-bold text-gray-800">${s.name}</td><td class="p-3"><span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-bold border border-blue-100">${cName}</span></td><td class="p-3 text-right opacity-0 group-hover:opacity-100 transition"><button onclick="openEditModal('student', '${s.id}')" class="text-gray-400 hover:text-yellow-500 mr-3 transition"><i class="fas fa-pen"></i></button><button onclick="deleteItem('student', '${s.id}')" class="text-gray-400 hover:text-red-500 transition"><i class="fas fa-trash"></i></button></td></tr>`; }); }
function downloadStudents(format) { const db = getDB(); const filterClassId = document.getElementById('filter-class').value; let students = db.students.filter(s => s.institutionId === currentUser.id); if (filterClassId) students = students.filter(s => s.classId === filterClassId); students.sort((a, b) => { const cA = db.classes.find(c => c.id === a.classId)?.name || ''; const cB = db.classes.find(c => c.id === b.classId)?.name || ''; return cA.localeCompare(cB) || a.admissionNo.localeCompare(b.admissionNo, undefined, {numeric: true}); }); const data = students.map(s => ({ "Admission": s.admissionNo, "Name": s.name, "Class": db.classes.find(c => c.id === s.classId)?.name || "-", "DOB": s.dob, "Mobile": s.mobile })); if (format === 'excel') { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Students"); XLSX.writeFile(wb, "Student_List.xlsx"); } else { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.text("Student List", 14, 15); doc.autoTable({ head: [Object.keys(data[0])], body: data.map(Object.values), startY: 20 }); doc.save("Student_List.pdf"); } }
function downloadResults(format) {
    const table = document.querySelector('#publish-table-container table');
    if(!table) return showToast('Load a sheet first', 'error');
    const headers = [];
    table.querySelectorAll('thead th').forEach(th => headers.push(th.innerText.trim()));
    const data = [];
    table.querySelectorAll('tbody tr').forEach(row => {
        const rowData = [];
        const cells = row.querySelectorAll('td');
        rowData.push(cells[0].innerText.replace(/\n/g, ' ').trim());
        for (let i = 1; i < cells.length - 3; i++) { const input = cells[i].querySelector('input'); rowData.push(input ? input.value : ''); }
        const lastInput = cells[cells.length - 3].querySelector('input'); rowData.push(lastInput ? lastInput.value : '');
        data.push(rowData);
    });
    if(format === 'excel') { const ws = XLSX.utils.aoa_to_sheet([headers, ...data]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Results"); XLSX.writeFile(wb, "Result_Sheet.xlsx"); } 
    else { const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', 'a4'); doc.text("Result Sheet", 14, 15); doc.autoTable({ head: [headers], body: data, startY: 20 }); doc.save("Result_Sheet.pdf"); }
}
function downloadMarksTemplate(classId) { try { const db = getDB(); const cls = db.classes.find(c => c.id === classId); const students = db.students.filter(s => s.classId === classId); const subjects = db.subjects.filter(s => s.classId === classId); if (students.length === 0) return showToast("No students", "error"); const headers = ["Admission No", "Name", ...subjects.map(s => s.name), "Attendance"]; const data = students.map(s => { let row = { "Admission No": s.admissionNo, "Name": s.name }; subjects.forEach(sub => { row[sub.name] = ""; }); row["Attendance"] = ""; return row; }); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(data, { header: headers }); XLSX.utils.book_append_sheet(wb, ws, "Marks"); XLSX.writeFile(wb, `Marks_Template_${cls.name}.xlsx`); } catch (e) { console.error(e); showToast("Export error", "error"); } }
function processMarksUpload(input, classId) {
    try {
        const file = input.files[0]; if (!file) return; 
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            // Use Array of Arrays for robustness
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
            const db = getDB();
            const subjects = db.subjects.filter(s => s.classId === classId);
            let updatedCount = 0;

            // Row 0 is header, start loop from 1
            for(let i=1; i<rows.length; i++) {
                const row = rows[i];
                if(!row || row.length < 2) continue;
                // Column 0 is Adm No in Template
                const admNo = row[0]; 
                const student = db.students.find(s => s.classId === classId && s.admissionNo == admNo);
                
                if (student) {
                    updatedCount++;
                    // Subjects start from Col 2
                    subjects.forEach((sub, idx) => {
                        const val = row[2 + idx]; 
                        if (val !== undefined) {
                            const inputEl = document.querySelector(`input[data-student="${student.id}"][data-subject="${sub.id}"]`);
                            if (inputEl) {
                                inputEl.value = val;
                                validateAndColor(inputEl, sub.passMarks);
                            }
                        }
                    });
                    // Attendance is after subjects
                    const attVal = row[2 + subjects.length];
                    if (attVal !== undefined) {
                        const attInput = document.querySelector(`input.input-att[data-student="${student.id}"]`);
                        if (attInput) attInput.value = attVal;
                    }
                    calculateRowTotal(student.id);
                }
            }
            showToast(`Populated ${updatedCount} students`);
            input.value = "";
        };
        reader.readAsArrayBuffer(file);
    } catch (e) { console.error(e); showToast("Import error", "error"); }
}

// --- ACTIONS ---
function previewImage(input) { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = function(e) { document.getElementById('settings-logo-preview').innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`; }; reader.readAsDataURL(input.files[0]); } }
// --- SAVE INSTITUTION SETTINGS (FIXED) ---
function saveInstSettings() { 
    const name = document.getElementById('set-name').value; 
    const email = document.getElementById('set-email').value; 
    const pass = document.getElementById('set-pass').value; 
    const authMethod = document.getElementById('set-auth-method').value; 
    
    const logoInput = document.getElementById('set-img-file'); 
    const sigInput = document.getElementById('set-sig-file');
    const certInput = document.getElementById('set-cert-file');
    
    if(!name || !email || !pass) return showToast('Fields empty', 'error'); 
    
    setButtonLoading('btn-save-settings', true);

    const db = getDB();
    const idx = db.institutions.findIndex(i => i.id === currentUser.id);

    if(idx > -1) {
        db.institutions[idx].name = name;
        db.institutions[idx].email = email;
        db.institutions[idx].pass = pass;
        db.institutions[idx].authMethod = authMethod;

        // Use Helper
        const readFile = (file) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });

        const promises = [];
        if(logoInput.files[0]) promises.push(readFile(logoInput.files[0]).then(d => db.institutions[idx].profileImage = d));
        if(sigInput.files[0]) promises.push(readFile(sigInput.files[0]).then(d => db.institutions[idx].signatureImage = d));
        if(certInput.files[0]) promises.push(readFile(certInput.files[0]).then(d => db.institutions[idx].certTemplate = d));

        Promise.all(promises).then(() => {
            saveDB(db);
            currentUser = db.institutions[idx];
            saveSession(currentUser, 'inst');
            showToast('Saved');
            showInstTab('profile'); 
            setButtonLoading('btn-save-settings', false);
        }).catch(err => {
            console.error(err);
            showToast("Error saving images", "error");
            setButtonLoading('btn-save-settings', false);
        });
    }
}

function addClass() { const name = document.getElementById('new-class-name').value; const att = document.getElementById('new-class-att').value; if(!name) return; const db = getDB(); db.classes.push({ id: generateId(), institutionId: currentUser.id, name, totalAttendance: att }); saveDB(db); showToast('Added'); showInstTab('classes'); }
function manageSubjects(classId) { const db = getDB(); const cls = db.classes.find(c => c.id === classId); const subjects = db.subjects.filter(s => s.classId === classId); const lf = localStorage.getItem('last_full_marks')||''; const lp = localStorage.getItem('last_pass_marks')||''; let html = `<div class="p-4 bg-white rounded shadow"><h3 class="font-bold text-lg mb-4">Subjects for ${cls.name}</h3><div class="flex gap-2 mb-4"><input id="sub-name" placeholder="Name" class="border p-2 rounded flex-1 outline-none focus:ring-2 focus:ring-blue-200"><input id="sub-full" type="number" placeholder="Full" value="${lf}" class="border p-2 rounded w-24 outline-none focus:ring-2 focus:ring-blue-200"><input id="sub-pass" type="number" placeholder="Pass" value="${lp}" class="border p-2 rounded w-24 outline-none focus:ring-2 focus:ring-blue-200"><button onclick="addSubject('${classId}')" class="bg-green-600 text-white px-3 rounded">Add</button></div><ul class="divide-y">`; subjects.forEach(s => { html += `<li class="p-2 flex justify-between items-center"><span>${s.name} (${s.passMarks}/${s.fullMarks})</span><div><button onclick="openEditModal('subject', '${s.id}')" class="text-gray-400 hover:text-yellow-500 mr-2"><i class="fas fa-pen"></i></button><button onclick="deleteItem('subject', '${s.id}')" class="text-red-500"><i class="fas fa-trash"></i></button></div></li>`; }); document.getElementById('inst-content-area').innerHTML = html + `</ul><button onclick="showInstTab('classes')" class="mt-4 text-blue-600">Back</button></div>`; }
function addSubject(classId) { const name = document.getElementById('sub-name').value; const full = document.getElementById('sub-full').value; const pass = document.getElementById('sub-pass').value; if(!name || !full) return; localStorage.setItem('last_full_marks', full); localStorage.setItem('last_pass_marks', pass); const db = getDB(); db.subjects.push({ id: generateId(), classId, name, fullMarks: parseInt(full), passMarks: parseInt(pass) }); saveDB(db); manageSubjects(classId); }

// --- ADD STUDENT (FIXED) ---
function addStudent() { 
    const name = document.getElementById('st-name').value; 
    const adm = document.getElementById('st-adm').value; 
    const dob = document.getElementById('st-dob').value; 
    const classId = document.getElementById('st-class').value; 
    const mobile = document.getElementById('st-mobile').value; 
    
    if(!name || !adm) return showToast('Name/Adm required', 'error'); 
    // If inst setting is DOB, require it
    if(currentUser.authMethod !== 'password' && !dob) return showToast('DOB required', 'error');

    setButtonLoading('btn-add-st', true); 
    setTimeout(() => { 
        const db = getDB(); 
        if (db.students.some(s => s.institutionId === currentUser.id && s.admissionNo === adm)) { setButtonLoading('btn-add-st', false); return showToast('Exists', 'error'); } 
        localStorage.setItem('last_selected_class_id', classId); 
        db.students.push({ 
            id: generateId(), 
            institutionId: currentUser.id, 
            classId, 
            name, 
            admissionNo: adm, 
            dob: dob || '', 
            mobile, 
            password: adm // Default password
        }); 
        saveDB(db); 
        showToast('Added'); 
        setButtonLoading('btn-add-st', false); 
        showInstTab('students'); 
    }, PROCESS_DELAY); 
}

function addExam() { const name = document.getElementById('new-exam-name').value; if(!name) return; const db = getDB(); db.exams.push({ id: generateId(), institutionId: currentUser.id, name }); saveDB(db); showToast('Created'); showInstTab('exams'); }

// Simple attribute-value escaping to avoid XSS in HTML attributes (single quote delimiter)
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

// --- LOAD PUBLISH TABLE (FIXED CRASH) ---
function loadPublishTable() { 
    const examId = document.getElementById('pub-exam').value; 
    const classId = document.getElementById('pub-class').value; 
    if(!examId || !classId) return showToast('Select Exam', 'error'); 
    
    const db = getDB(); 
    const subjects = db.subjects.filter(s => s.classId === classId); 
    if(subjects.length === 0) return showToast('No subjects', 'error'); 
    
    const students = db.students.filter(s => s.classId === classId); 
    const existingResults = db.results.filter(r => r.examId === examId); 
    
    let html = `<div class="bg-white rounded shadow overflow-x-auto pb-16 border border-gray-200"><div class="flex justify-end gap-2 p-4 bg-gray-50 border-b border-gray-100"><button onclick="downloadMarksTemplate('${classId}')" class="bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded text-xs font-bold hover:bg-indigo-100 flex items-center gap-2"><i class="fas fa-download"></i> Template</button><label class="bg-green-50 text-green-600 border border-green-200 px-3 py-1.5 rounded text-xs font-bold hover:bg-green-100 cursor-pointer flex items-center gap-2"><i class="fas fa-upload"></i> Upload Filled Excel<input type="file" class="hidden" onchange="processMarksUpload(this, '${classId}')" accept=".xlsx, .xls, .csv"></label></div><table class="w-full text-sm whitespace-nowrap"><thead class="bg-blue-50 text-gray-700 table-sticky-header"><tr><th class="p-3 text-left border-r table-sticky-col">Student</th>${subjects.map(s => `<th class="p-3 text-center border-r w-24">${s.name}<br><span class="text-xs opacity-60">(${s.passMarks}/${s.fullMarks})</span></th>`).join('')}<th class="p-3 text-center w-24">Attendance</th><th class="p-3 text-center w-20">Total</th><th class="p-3 text-center w-20">Result</th></tr></thead><tbody>`; 
    
    students.forEach(st => { 
        const res = existingResults.find(r => r.studentId === st.id); 
        const marks = res ? res.subjectMarks : {}; 
        const att = res ? res.attendance : ''; 
        const total = res ? res.total : 0; 
        const status = res ? res.status : '-'; 
        
        html += `<tr class="hover:bg-gray-50" id="row-${st.id}"><td class="p-3 border-b border-r font-medium table-sticky-col">${st.name}<br><span class="text-xs text-gray-500">${st.admissionNo}</span></td>${subjects.map(sub => { 
            const val = marks[sub.id] || ''; 
            const valNum = parseInt(val); 
            let colorClass = (val !== '' && valNum < sub.passMarks) ? 'text-red-500 font-bold' : 'text-green-600 font-bold'; 
            if(val === '') colorClass = ''; 
            return `<td class="p-2 border-b border-r text-center"><input type="number" class="w-16 p-1 border rounded text-center outline-none focus:ring-2 transition input-mark ${colorClass}" data-student="${st.id}" data-subject="${sub.id}" data-max="${sub.fullMarks}" value="${val}" oninput="validateAndColor(this, ${sub.passMarks}); calculateRowTotal('${st.id}')"></td>`; 
        }).join('')}<td class="p-2 border-b text-center"><input type="number" class="w-16 p-1 border rounded text-center outline-none input-att" data-student="${st.id}" value="${att}"></td><td class="p-3 text-center font-bold text-gray-800 border-b border-l bg-gray-50 row-total">${total}</td><td class="p-3 text-center font-bold text-xs border-b row-status ${status==='PASS'?'text-green-600':'text-red-600'}">${status}</td></tr>`; 
    }); 
    
    // Escape examId and classId when interpolating into attributes
    const safeExamId = escapeAttr(examId);
    const safeClassId = escapeAttr(classId);
    html += `</tbody></table></div><div class="fixed bottom-8 right-8 flex gap-2"><button onclick="downloadResults('pdf')" class="bg-red-500 text-white px-4 py-3 rounded-full shadow-xl hover:bg-red-600"><i class="fas fa-file-pdf"></i></button><button onclick="downloadResults('excel')" class="bg-green-600 text-white px-4 py-3 rounded-full shadow-xl hover:bg-green-700"><i class="fas fa-file-excel"></i></button><button id="btn-publish" onclick="saveResults('${safeExamId}', '${safeClassId}')" class="btn-master bg-blue-600 text-white px-8 py-3 rounded-full shadow-xl text-lg flex items-center gap-2 hover:bg-blue-700"><i class="fas fa-save"></i> Publish Results</button></div>`;
    document.getElementById('publish-table-container').innerHTML = html;
}

function validateAndColor(input, passMark) { const max = parseInt(input.getAttribute('data-max')); let val = parseInt(input.value); if (val > max) { input.value = max; val = max; showToast('Max exceeded', 'error'); } if (input.value !== '') { if (val >= passMark) { input.classList.remove('text-red-500'); input.classList.add('text-green-600', 'font-bold'); } else { input.classList.remove('text-green-600'); input.classList.add('text-red-500', 'font-bold'); } } }
function calculateRowTotal(studentId) { const row = document.getElementById(`row-${studentId}`); const inputs = row.querySelectorAll('.input-mark'); let total = 0; let isFail = false; inputs.forEach(inp => { const val = inp.value ? parseInt(inp.value) : 0; const pass = parseInt(inp.getAttribute('oninput').match(/\d+/)[0]); total += val; if(val < pass) isFail = true; }); row.querySelector('.row-total').innerText = total; const statusEl = row.querySelector('.row-status'); statusEl.innerText = isFail ? 'FAIL' : 'PASS'; statusEl.className = `p-3 text-center font-bold text-xs border-b row-status ${isFail?'text-red-600':'text-green-600'}`; }

// --- SAVE RESULTS (FIXED CRASH) ---
function saveResults(examId, classId) { 
    setButtonLoading('btn-publish', true, '<i class="fas fa-save mr-2"></i> Publish Results'); 
    setTimeout(() => { 
        const db = getDB(); 
        const students = db.students.filter(s => s.classId === classId); 
        const subjects = db.subjects.filter(s => s.classId === classId); 
        let tempResults = []; 
        
        students.forEach(st => { 
            let totalMarks = 0; let isFail = false; let subjectMarks = {}; 
            subjects.forEach(sub => { 
                // Added Safety Check for Input Existence
                const input = document.querySelector(`input[data-student="${st.id}"][data-subject="${sub.id}"]`); 
                const val = (input && input.value) ? parseInt(input.value) : 0; 
                subjectMarks[sub.id] = val; totalMarks += val; 
                if (val < sub.passMarks) isFail = true; 
            }); 
            const attInput = document.querySelector(`input.input-att[data-student="${st.id}"]`); 
            const attendance = (attInput && attInput.value) ? parseInt(attInput.value) : 0; 
            tempResults.push({ id: generateId(), examId, studentId: st.id, subjectMarks, attendance, total: totalMarks, status: isFail ? 'FAIL' : 'PASS' }); 
        }); 
        
        tempResults.sort((a, b) => b.total - a.total); 
        tempResults.forEach((r, index) => { r.rank = index + 1; }); 
        const studentIds = students.map(s => s.id); 
        db.results = db.results.filter(r => !(r.examId === examId && studentIds.includes(r.studentId))); 
        db.results.push(...tempResults); 
        saveDB(db); 
        showToast('Results Published Successfully!'); 
        setButtonLoading('btn-publish', false, '<i class="fas fa-save mr-2"></i> Publish Results'); 
    }, PROCESS_DELAY); 
}

function openEditModal(type, id) { currentEditType = type; currentEditId = id; const db = getDB(); const container = document.getElementById('modal-inputs'); document.getElementById('modal-overlay').classList.remove('hidden'); container.innerHTML = ''; setTimeout(() => { const inp = container.querySelector('input'); if(inp) inp.focus(); }, 100); if (type === 'class') { const item = db.classes.find(c => c.id === id); container.innerHTML = `<div><label class="text-xs font-bold text-gray-500">Class Name</label><input id="edit-1" value="${item.name}" class="w-full p-3 border rounded mt-1"></div><div><label class="text-xs font-bold text-gray-500">Total Days</label><input id="edit-2" type="number" value="${item.totalAttendance}" class="w-full p-3 border rounded mt-1"></div>`; } else if (type === 'student') {
        const item = db.students.find(s => s.id === id);
        const imgHTML = item.profileImage ? `<img src="${item.profileImage}" class="w-20 h-20 rounded-full object-cover border mx-auto mb-4">` : `<div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-2xl text-gray-400 mx-auto mb-4 border"><i class="fas fa-user"></i></div>`;
        container.innerHTML = `${imgHTML}<div class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="text-xs font-bold text-gray-500">Full Name</label><input id="edit-1" value="${item.name}" class="w-full p-2 border rounded"></div><div><label class="text-xs font-bold text-gray-500">Adm No</label><input id="edit-2" value="${item.admissionNo}" class="w-full p-2 border rounded"></div><div><label class="text-xs font-bold text-gray-500">DOB</label><input id="edit-3" type="date" value="${item.dob}" class="w-full p-2 border rounded"></div><div><label class="text-xs font-bold text-gray-500">Father's Name</label><input id="edit-father" value="${item.fatherName || ''}" class="w-full p-2 border rounded"></div><div><label class="text-xs font-bold text-gray-500">Mother's Name</label><input id="edit-mother" value="${item.motherName || ''}" class="w-full p-2 border rounded"></div><div><label class="text-xs font-bold text-gray-500">Mobile</label><input id="edit-4" value="${item.mobile || ''}" class="w-full p-2 border rounded"></div><div><label class="text-xs font-bold text-gray-500">ID Marks</label><input id="edit-idmark" value="${item.idMark || ''}" class="w-full p-2 border rounded"></div><div class="col-span-2"><label class="text-xs font-bold text-gray-500">Address</label><textarea id="edit-address" rows="2" class="w-full p-2 border rounded">${item.address || ''}</textarea></div>
        <div class="col-span-2 mt-4 pt-4 border-t">
             <label class="text-xs font-bold text-gray-500">Reset Login Password</label>
             <div class="flex gap-2 mt-1">
                 <input id="edit-reset-pass" placeholder="New Password" class="w-full p-2 border rounded">
                 <button onclick="adminResetPassword()" class="bg-red-50 text-red-600 px-4 rounded border border-red-200 text-sm font-bold">Reset</button>
             </div>
        </div></div>`;
} else if (type === 'exam') { const item = db.exams.find(e => e.id === id); container.innerHTML = `<div><label class="text-xs font-bold text-gray-500">Name</label><input id="edit-1" value="${item.name}" class="w-full p-3 border rounded mt-1"></div>`; } else if (type === 'subject') { const item = db.subjects.find(s => s.id === id); container.innerHTML = `<div><label class="text-xs font-bold text-gray-500">Name</label><input id="edit-1" value="${item.name}" class="w-full p-3 border rounded mt-1"></div><div><label class="text-xs font-bold text-gray-500">Full Marks</label><input id="edit-2" type="number" value="${item.fullMarks}" class="w-full p-3 border rounded mt-1"></div><div><label class="text-xs font-bold text-gray-500">Pass Marks</label><input id="edit-3" type="number" value="${item.passMarks}" class="w-full p-3 border rounded mt-1"></div>`; } }

function adminResetPassword() {
    const newPass = document.getElementById('edit-reset-pass').value;
    if(!newPass) return showToast('Enter a password', 'error');
    const db = getDB();
    const s = db.students.find(s => s.id === currentEditId);
    if(s) {
        s.password = newPass;
        saveDB(db);
        showToast('Password Reset');
    }
}

function saveEdit() { const db = getDB(); setButtonLoading('btn-modal-save', true); setTimeout(() => { if (currentEditType === 'class') { const x = db.classes.find(c => c.id === currentEditId); x.name = document.getElementById('edit-1').value; x.totalAttendance = document.getElementById('edit-2').value; showInstTab('classes'); } else if (currentEditType === 'student') { 
            const x = db.students.find(s => s.id === currentEditId);
            const newAdm = document.getElementById('edit-2').value;
            if (db.students.some(s => s.institutionId === currentUser.id && s.admissionNo === newAdm && s.id !== currentEditId)) { setButtonLoading('btn-modal-save', false); return showToast('Admission Exists', 'error'); }
            x.name = document.getElementById('edit-1').value;
            x.admissionNo = newAdm;
            x.dob = document.getElementById('edit-3').value;
            x.mobile = document.getElementById('edit-4').value;
            x.fatherName = document.getElementById('edit-father').value;
            x.motherName = document.getElementById('edit-mother').value;
            x.idMark = document.getElementById('edit-idmark').value;
            x.address = document.getElementById('edit-address').value;
            showInstTab('students'); 
        } else if (currentEditType === 'exam') { db.exams.find(e => e.id === currentEditId).name = document.getElementById('edit-1').value; showInstTab('exams'); } else if (currentEditType === 'subject') { const s = db.subjects.find(x => x.id === currentEditId); s.name = document.getElementById('edit-1').value; s.fullMarks = parseInt(document.getElementById('edit-2').value); s.passMarks = parseInt(document.getElementById('edit-3').value); saveDB(db); showToast('Subject Updated'); setButtonLoading('btn-modal-save', false); closeModal(); manageSubjects(s.classId); return; } saveDB(db); showToast('Saved'); setButtonLoading('btn-modal-save', false); closeModal(); }, PROCESS_DELAY); }
function deleteItem(type, id) { if(!confirm('Delete?')) return; const db = getDB(); if (type === 'class') { db.classes = db.classes.filter(x => x.id !== id); db.subjects = db.subjects.filter(s => s.classId !== id); } else if (type === 'student') { db.students = db.students.filter(x => x.id !== id); db.results = db.results.filter(r => r.studentId !== id); } else if (type === 'exam') { db.exams = db.exams.filter(x => x.id !== id); } else if (type === 'subject') { const sub = db.subjects.find(s => s.id === id); db.subjects = db.subjects.filter(x => x.id !== id); if(sub) { saveDB(db); manageSubjects(sub.classId); return; } } saveDB(db); showToast('Deleted'); showInstTab(type === 'class' ? 'classes' : type + 's'); }
function deleteInstitutionAccount(instId = null) { if(!confirm('Delete Account?')) return; const db = getDB(); const targetId = instId || currentUser.id; db.results = db.results.filter(r => { const exam = db.exams.find(e => e.id === r.examId); return exam ? exam.institutionId !== targetId : true; }); db.exams = db.exams.filter(e => e.institutionId !== targetId); db.students = db.students.filter(s => s.institutionId !== targetId); db.teachers = db.teachers.filter(t => t.institutionId !== targetId); db.classes = db.classes.filter(c => c.institutionId !== targetId); db.institutions = db.institutions.filter(i => i.id !== targetId); saveDB(db); if(instId) { showToast('Deleted'); renderOwnerInstList(); } else { clearSession(); alert("Deleted"); } }
function calculateGrade(percentage) { if (percentage >= 90) return { grade: 'A+', css: 'grade-A' }; if (percentage >= 80) return { grade: 'A', css: 'grade-A' }; if (percentage >= 70) return { grade: 'B', css: 'grade-B' }; if (percentage >= 60) return { grade: 'C', css: 'grade-C' }; if (percentage >= 50) return { grade: 'D', css: 'grade-D' }; return { grade: 'F', css: 'grade-F' }; }
function viewMarksheet(resultId) {
    currentResultId = resultId;
    const db = getDB();
    const res = db.results.find(r => r.id === resultId);
    if(!res) return showToast("Result not found", "error");

    const exam = db.exams.find(e => e.id === res.examId);
    const cls = db.classes.find(c => c.id === currentUser.classId);
    const className = cls ? cls.name : 'Unknown Class';

    const subjects = db.subjects.filter(s => s.classId === currentUser.classId);
    const inst = db.institutions.find(i => i.id === currentUser.institutionId);
    const student = db.students.find(s => s.id === currentUser.id);

    safeSetText('mk-inst-name', inst.name);
    safeSetText('mk-name', currentUser.name);
    safeSetText('mk-adm', currentUser.admissionNo);
    safeSetText('mk-dob', currentUser.dob);
    safeSetText('mk-class', className);
    safeSetText('mk-exam', exam.name);
    
    const photoBox = document.getElementById('mk-photo-container');
    if (photoBox) {
        photoBox.innerHTML = currentUser.profileImage 
            ? `<img src="${currentUser.profileImage}" class="w-full h-full object-cover">`
            : `<i class="fas fa-user text-gray-300 text-4xl"></i>`;
    }

    let attText = "N/A";
    if (res.attendance !== undefined && res.attendance !== "") {
        const totalDays = cls ? cls.totalAttendance : 0;
        if (totalDays > 0) {
            const percent = Math.round((res.attendance / totalDays) * 100);
            attText = `${res.attendance} / ${totalDays} (${percent}%)`;
        } else {
            attText = `${res.attendance} Days`;
        }
    }
    safeSetText('mk-attendance', attText);
    
    safeSetText('mk-date', new Date().toLocaleDateString());

    const tbody = document.getElementById('mk-tbody');
    tbody.innerHTML = '';
    let totalObtained = 0;
    let totalMax = 0;

    const resultSubjects = Object.keys(res.subjectMarks).map(subId => {
        return db.subjects.find(s => s.id === subId) || { name: 'Deleted Subject', fullMarks: 100, passMarks: 35, id: subId };
    });
    const displaySubjects = subjects.length > 0 ? subjects : resultSubjects;

    displaySubjects.forEach(sub => {
        const obtained = parseInt(res.subjectMarks ? (res.subjectMarks[sub.id] || 0) : 0);
        const full = sub.fullMarks || 100;
        const pass = sub.passMarks || 35;
        
        totalObtained += obtained;
        totalMax += full;
        
        const status = obtained >= pass ? 'PASS' : 'FAIL';
        const statusColor = obtained >= pass ? 'text-green-600' : 'text-red-600 font-bold';
        const gradeObj = calculateGrade((obtained/full)*100);
        
        tbody.innerHTML += `
            <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td class="p-3 text-gray-800 font-medium border-r border-gray-100">${sub.name}</td>
                <td class="p-3 text-center text-gray-600 border-r border-gray-100">${full}</td>
                <td class="p-3 text-center font-bold text-gray-900 border-r border-gray-100">${obtained}</td>
                <td class="p-3 text-center"><span class="grade-badge ${gradeObj.css}">${gradeObj.grade}</span></td>
            </tr>
        `;
    });

    const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(2) : 0;
    safeSetText('mk-total-max', totalMax);
    safeSetText('mk-total-obt', totalObtained);
    safeSetText('mk-percentage', `${percentage}%`);
    safeSetText('mk-rank', getOrdinal(res.rank));
    
    const finalStatusEl = document.getElementById('mk-final-status');
    const messageEl = document.getElementById('mk-message-text');
    if(finalStatusEl) {
        finalStatusEl.innerText = res.status;
        if (res.status === 'PASS') {
            finalStatusEl.className = 'text-3xl font-black text-green-500';
            if(messageEl) {
                messageEl.innerText = "Congratulations! Your hard work and dedication have paid off. Keep striving for excellence!";
                messageEl.className = "text-sm text-green-800 italic";
                messageEl.parentElement.className = "bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg mb-4 relative z-10";
            }
        } else {
            finalStatusEl.className = 'text-3xl font-black text-red-500';
            if(messageEl) {
                messageEl.innerText = "Don't be discouraged. Success is not final, failure is not fatal: it is the courage to continue that counts.";
                messageEl.className = "text-sm text-red-800 italic";
                messageEl.parentElement.className = "bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg mb-4 relative z-10";
            }
        }
    }

    document.getElementById('view-student').classList.add('hidden');
    document.getElementById('view-marksheet').classList.remove('hidden');
}
function closeMarksheet() { document.getElementById('view-marksheet').classList.add('hidden'); document.getElementById('view-student').classList.remove('hidden'); }
function getOrdinal(n) { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// --- CERTIFICATE LOGIC ---
function viewCertificate(resultId = null) {
    if(resultId) currentResultId = resultId;
    const db = getDB();
    const res = db.results.find(r => r.id === currentResultId);
    if(!res) return;
    const exam = db.exams.find(e => e.id === res.examId);
    const cls = db.classes.find(c => c.id === currentUser.classId);
    const inst = db.institutions.find(i => i.id === currentUser.institutionId);
    const student = db.students.find(s => s.id === currentUser.id);
    
    if(res.status === 'FAIL') return showToast("Certificate only for Passed students", "error");

    safeSetText('cert-name', student.name);
    safeSetText('cert-exam', exam.name);
    safeSetText('cert-class', cls ? cls.name : '');
    safeSetText('cert-inst', inst.name);
    
    const subjects = db.subjects.filter(s => s.classId === currentUser.classId);
    const totalMax = subjects.reduce((sum, sub) => sum + sub.fullMarks, 0);
    const percent = totalMax > 0 ? ((res.total / totalMax) * 100).toFixed(2) : 0;
    
    safeSetText('cert-percent', percent + '%');
    const gradeObj = calculateGrade(percent);
    safeSetText('cert-grade', gradeObj.grade);
    safeSetText('cert-date', new Date().toLocaleDateString());

    const sigContainer = document.getElementById('cert-sig-container');
    if(inst.signatureImage) {
        sigContainer.innerHTML = `<img src="${inst.signatureImage}" class="h-full object-contain">`;
    } else {
        sigContainer.innerHTML = `<p class="text-xs text-gray-300 italic self-end">Digital Signature</p>`;
    }
    
    const templateContainer = document.getElementById('cert-printable');
    const defaultLayer = document.getElementById('cert-default-layer');
    
    if(inst.certTemplate) {
        templateContainer.style.backgroundImage = `url(${inst.certTemplate})`;
        templateContainer.style.backgroundSize = 'cover';
        templateContainer.style.backgroundPosition = 'center';
        defaultLayer.classList.add('hidden');
    } else {
        templateContainer.style.backgroundImage = '';
        defaultLayer.classList.remove('hidden');
    }

    document.getElementById('view-certificate').classList.remove('hidden');
}

async function downloadCertPDF() {
    const element = document.getElementById('cert-printable');
    if (!element) return;
    try {
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save("Certificate.pdf");
    } catch (err) {
        console.error(err);
        showToast("Download failed", "error");
    }
}
async function shareResult(type) { const element = document.getElementById('mk-printable'); if (!element) return showToast("Error", "error"); try { const canvas = await html2canvas(element, { scale: 2, useCORS: true }); if (type === 'image') { canvas.toBlob(async (blob) => { const file = new File([blob], "result.png", { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ title: 'Result', files: [file] }); } else { const link = document.createElement('a'); link.download = 'result.png'; link.href = canvas.toDataURL(); link.click(); } }); } else if (type === 'pdf') { const imgData = canvas.toDataURL('image/png'); const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4'); const pdfWidth = pdf.internal.pageSize.getWidth(); const pdfHeight = (canvas.height * pdfWidth) / canvas.width; pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight); const pdfBlob = pdf.output('blob'); const file = new File([pdfBlob], "result.pdf", { type: "application/pdf" }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ title: 'Result PDF', files: [file] }); } else { pdf.save("result.pdf"); } } } catch (err) { console.error(err); showToast("Sharing failed", "error"); } }