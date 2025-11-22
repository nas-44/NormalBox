// --- GLOBAL CONFIG ---
const DB_KEY = 'normalbox_db_v1';
const SESSION_KEY = 'normalbox_session_v1'; 
const PROCESS_DELAY = 300; 
const OWNER_CRED = { id: 'owner', pass: 'admin123' }; 

let currentUser = null; 
let currentEditType = null; 
let currentEditId = null;
let currentResultId = null; // To track result for certificate

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
}

// --- DATABASE & SESSION ---
function getDB() {
    const db = localStorage.getItem(DB_KEY);
    return db ? JSON.parse(db) : { institutions: [], classes: [], subjects: [], students: [], exams: [], results: [] };
}
function saveDB(data) { 
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(data)); 
    } catch (e) {
        showToast("Storage Full! Images too large.", "error");
        console.error(e);
    }
}
function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }
function saveSession(user, role) { localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, role, timestamp: Date.now() })); }
function clearSession() { localStorage.removeItem(SESSION_KEY); window.location.reload(); }

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

// --- PAGE INIT ---
const urlParams = new URLSearchParams(window.location.search);
const portalInstId = urlParams.get('id');
const isOwnerPage = window.location.pathname.includes('owner.html');

window.onload = () => {
    const db = getDB();
    restoreSession();
    if (!isOwnerPage) {
        const select = document.getElementById('student-inst-select');
        if (select) {
            select.innerHTML = '<option value="">Select Institution</option>';
            db.institutions.filter(i => i.isActive !== false).forEach(i => { select.innerHTML += `<option value="${i.id}">${i.name}</option>`; });
        }
        if (portalInstId) {
            const inst = db.institutions.find(i => i.id === portalInstId);
            if (inst) {
                document.getElementById('view-landing').classList.add('hidden');
                showLogin('student');
                select.value = inst.id;
                select.disabled = true;
            }
        }
        safeSetText('current-date-display', new Date().toLocaleDateString());
        safeSetText('student-date-display', new Date().toLocaleDateString());
    }
};

// --- NAV ---
function showLogin(role) {
    document.getElementById('view-landing').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
    ['inst', 'student'].forEach(r => document.getElementById(`login-form-${r}`).classList.add('hidden'));
    document.getElementById(`login-form-${role}`).classList.remove('hidden');
}
function goBackToLanding() { document.getElementById('view-login').classList.add('hidden'); document.getElementById('view-landing').classList.remove('hidden'); }
function toggleRegister(role) { if (role === 'inst') { document.getElementById('login-form-inst').classList.toggle('hidden'); document.getElementById('form-inst-register').classList.toggle('hidden'); } }
function updateSidebarActive(tabName) { document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); const btn = document.getElementById(`nav-${tabName}`) || document.getElementById(`st-nav-${tabName}`); if (btn) btn.classList.add('active'); }

function updateStudentSidebar() {
    const db = getDB();
    const s = db.students.find(stu => stu.id === currentUser.id);
    if(!s) return;
    safeSetText('st-sidebar-name', s.name);
    safeSetText('st-sidebar-adm', `ADM: ${s.admissionNo}`);
    safeSetText('st-institution-name', currentUser.instName);
    
    const av = document.querySelector('#view-student aside .w-12');
    if(av) av.innerHTML = s.profileImage ? `<img src="${s.profileImage}" class="w-full h-full rounded-full object-cover">` : `<i class="fas fa-user"></i>`;
}

// --- INST SETTINGS (Updated for 3 Images) ---
function saveInstSettings() { 
    const name = document.getElementById('set-name').value; 
    const email = document.getElementById('set-email').value; 
    const pass = document.getElementById('set-pass').value; 
    
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

        // Helper to read file
        const readFile = (file) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });

        const promises = [];
        // We only update if a new file is selected
        if(logoInput.files[0]) promises.push(readFile(logoInput.files[0]).then(d => db.institutions[idx].profileImage = d));
        if(sigInput.files[0]) promises.push(readFile(sigInput.files[0]).then(d => db.institutions[idx].signatureImage = d));
        if(certInput.files[0]) promises.push(readFile(certInput.files[0]).then(d => db.institutions[idx].certTemplate = d));

        Promise.all(promises).then(() => {
            saveDB(db);
            currentUser = db.institutions[idx];
            saveSession(currentUser, 'inst');
            showToast('Profile Saved');
            showInstTab('profile'); // Refresh
            setButtonLoading('btn-save-settings', false);
        }).catch(err => {
            console.error(err);
            showToast("Error saving images", "error");
            setButtonLoading('btn-save-settings', false);
        });
    }
}

// --- STUDENT PROFILE SAVE ---
function saveStudentProfile() {
    setButtonLoading('btn-save-profile', true);
    const fileInput = document.getElementById('pf-img-file');
    
    const commitSave = (imgData) => {
        setTimeout(() => {
            const db = getDB();
            const idx = db.students.findIndex(s => s.id === currentUser.id);
            if(idx > -1) {
                db.students[idx].fatherName = document.getElementById('pf-father').value;
                db.students[idx].motherName = document.getElementById('pf-mother').value;
                db.students[idx].mobile = document.getElementById('pf-mobile').value;
                db.students[idx].idMark = document.getElementById('pf-idmark').value;
                db.students[idx].address = document.getElementById('pf-address').value;
                if(imgData) db.students[idx].profileImage = imgData;
                
                saveDB(db);
                currentUser = db.students[idx]; 
                updateStudentSidebar();
                showToast('Profile Updated');
            }
            setButtonLoading('btn-save-profile', false);
        }, 500);
    };

    if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        if (file.size > 500 * 1024) {
            setButtonLoading('btn-save-profile', false);
            return showToast('Image too large (>500KB)', 'error');
        }
        const reader = new FileReader();
        reader.onload = (e) => commitSave(e.target.result);
        reader.readAsDataURL(file);
    } else {
        commitSave(null);
    }
}

// --- AUTH HANDLERS ---
function handleInstLogin(e) { e.preventDefault(); setButtonLoading('btn-inst-login', true); const email = document.getElementById('inst-email').value; const pass = document.getElementById('inst-pass').value; setTimeout(() => { const user = getDB().institutions.find(i => i.email === email && i.pass === pass); if (user) { if (user.isActive === false) { setButtonLoading('btn-inst-login', false); return showToast('Deactivated', 'error'); } currentUser = user; saveSession(user, 'inst'); document.getElementById('view-login').classList.add('hidden'); document.getElementById('view-inst').classList.remove('hidden'); showInstTab('home'); } else { showToast('Invalid Credentials', 'error'); } setButtonLoading('btn-inst-login', false); }, PROCESS_DELAY); }
function handleStudentLogin(e) { e.preventDefault(); setButtonLoading('btn-student-login', true); const instId = document.getElementById('student-inst-select').value; const adm = document.getElementById('student-adm').value; const dob = document.getElementById('student-dob').value; setTimeout(() => { if (!instId) { setButtonLoading('btn-student-login', false); return showToast('Select Inst', 'error'); } const db = getDB(); const user = db.students.find(s => s.institutionId === instId && s.admissionNo === adm && s.dob === dob); if (user) { const inst = db.institutions.find(i => i.id === instId); currentUser = { ...user, role: 'student', instName: inst.name }; saveSession(user, 'student'); document.getElementById('view-login').classList.add('hidden'); document.getElementById('view-student').classList.remove('hidden'); updateStudentSidebar(); showStudentTab('results'); } else { showToast('Not Found', 'error'); } setButtonLoading('btn-student-login', false); }, PROCESS_DELAY); }
function handleInstRegister(e) { e.preventDefault(); setButtonLoading('btn-inst-reg', true); setTimeout(() => { const db = getDB(); const email = document.getElementById('reg-email').value; if (db.institutions.find(i => i.email === email)) { setButtonLoading('btn-inst-reg', false); return showToast('Email exists', 'error'); } db.institutions.push({ id: generateId(), name: document.getElementById('reg-name').value, email, pass: document.getElementById('reg-pass').value, isActive: true }); saveDB(db); showToast('Registered!'); toggleRegister('inst'); setButtonLoading('btn-inst-reg', false); }, PROCESS_DELAY); }
function logout() { clearSession(); }

// --- OWNER ---
function handleOwnerLogin(e) { e.preventDefault(); setButtonLoading('btn-owner-login', true); setTimeout(() => { if (document.getElementById('owner-id').value === OWNER_CRED.id && document.getElementById('owner-pass').value === OWNER_CRED.pass) { saveSession({ id: 'owner' }, 'owner'); document.getElementById('view-owner-login').classList.add('hidden'); document.getElementById('view-owner-dash').classList.remove('hidden'); renderOwnerStats(); } else { showToast('Invalid', 'error'); } setButtonLoading('btn-owner-login', false); }, PROCESS_DELAY); }
function logoutOwner() { clearSession(); }
function renderOwnerStats() { const db = getDB(); document.getElementById('owner-page-title').innerText = "System Overview"; document.getElementById('owner-content-area').innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg"><div class="text-4xl font-bold text-blue-400 mb-1">${db.institutions.length}</div><div class="text-gray-400 text-xs uppercase">Institutions</div></div><div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg"><div class="text-4xl font-bold text-green-400 mb-1">${db.institutions.filter(i=>i.isActive!==false).length}</div><div class="text-gray-400 text-xs uppercase">Active</div></div><div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg"><div class="text-4xl font-bold text-purple-400 mb-1">${db.students.length}</div><div class="text-gray-400 text-xs uppercase">Students</div></div></div>`; }
function renderOwnerInstList() { const db = getDB(); document.getElementById('owner-page-title').innerText = "Manage Institutions"; let html = `<div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg"><table class="w-full text-sm text-left text-gray-300"><thead class="bg-gray-900 text-gray-400 uppercase text-xs"><tr><th class="p-4">Name</th><th class="p-4">Email</th><th class="p-4">Status</th><th class="p-4 text-right">Action</th></tr></thead><tbody class="divide-y divide-gray-700">`; db.institutions.forEach(inst => { const isActive = inst.isActive !== false; const btn = isActive ? `<button onclick="toggleInstStatus('${inst.id}', false)" class="bg-red-600 text-white px-3 py-1 rounded text-xs">Deactivate</button>` : `<button onclick="toggleInstStatus('${inst.id}', true)" class="bg-green-600 text-white px-3 py-1 rounded text-xs">Activate</button>`; html += `<tr class="hover:bg-gray-750"><td class="p-4 font-bold text-white">${inst.name}</td><td class="p-4">${inst.email}</td><td class="p-4">${isActive?'Active':'Inactive'}</td><td class="p-4 text-right">${btn}<button onclick="deleteInstitutionAccount('${inst.id}')" class="bg-gray-700 text-white px-3 py-1 rounded text-xs ml-2"><i class="fas fa-trash"></i></button></td></tr>`; }); document.getElementById('owner-content-area').innerHTML = html + '</tbody></table></div>'; }
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
        let html = `<div class="grid md:grid-cols-2 gap-6 mb-6"><div class="bg-white p-6 rounded-lg shadow border-t-4 border-blue-500"><h3 class="font-bold mb-4">Add Student</h3><div class="grid grid-cols-1 gap-3 mb-3"><input id="st-name" placeholder="Name" class="border p-2 rounded outline-none"><input id="st-adm" placeholder="Adm No" class="border p-2 rounded outline-none"><input id="st-dob" type="date" class="border p-2 rounded outline-none"><select id="st-class" class="border p-2 rounded bg-white outline-none">${classOptions}</select><input id="st-mobile" placeholder="Mobile" class="border p-2 rounded outline-none"></div><button onclick="addStudent()" class="w-full btn-master btn-primary py-2 rounded">Add</button></div><div class="bg-white p-6 rounded-lg shadow border-t-4 border-green-500"><h3 class="font-bold mb-4">Bulk Import</h3><p class="text-xs text-gray-500 mb-3">Upload Excel/CSV (Cols: Name, Adm, DOB, Mobile)</p><div class="mb-3"><select id="bulk-st-class" class="w-full border p-2 rounded bg-white outline-none mb-2"><option value="">Select Class for Import</option>${classOptions}</select><input type="file" id="bulk-st-file" accept=".xlsx, .xls, .csv" class="w-full border p-2 rounded text-sm"></div><button onclick="processBulkStudentUpload()" class="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">Import</button></div></div><div class="bg-white p-6 rounded-lg shadow"><div class="flex justify-between items-center mb-4"><h3 class="font-bold">Student List</h3><div class="flex gap-2"><select id="filter-class" onchange="filterStudents()" class="border p-2 rounded text-sm bg-white outline-none">${filterOptions}</select><button onclick="downloadStudents('pdf')" class="bg-red-500 text-white px-3 py-1 rounded text-xs">PDF</button><button onclick="downloadStudents('excel')" class="bg-green-600 text-white px-3 py-1 rounded text-xs">Excel</button></div></div><input type="text" id="search-student" onkeyup="filterTable('search-student', 'table-students')" placeholder="Search..." class="border p-2 rounded text-sm w-full mb-2 outline-none"><div class="overflow-x-auto"><table id="table-students" class="w-full text-sm text-left border-collapse table-striped"><thead class="bg-gray-50 text-gray-600"><tr><th class="p-3 border-b">Adm</th><th class="p-3 border-b">Photo</th><th class="p-3 border-b">Name</th><th class="p-3 border-b">Class</th><th class="p-3 border-b text-right">Actions</th></tr></thead><tbody id="student-tbody"></tbody></table></div></div>`;
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
         const inst = currentUser;
         // Profile Image
         const logo = inst.profileImage ? `<img src="${inst.profileImage}" class="w-20 h-20 rounded-full object-cover border mx-auto">` : `<div class="w-20 h-20 bg-gray-200 rounded-full mx-auto flex items-center justify-center text-2xl text-gray-400"><i class="fas fa-university"></i></div>`;
         
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
            </div>
            <div class="mt-6 flex justify-between items-center"><button id="btn-save-settings" onclick="saveInstSettings()" class="btn-master btn-primary py-3 px-8 rounded-lg">Save Changes</button></div>
            <div class="mt-12 border-t pt-6"><button onclick="deleteInstitutionAccount()" class="text-red-600 text-sm font-bold hover:underline">Delete Account</button></div>
         </div>`;
    }
}

// --- STUDENT DASHBOARD ---
function showStudentTab(tabName) {
    const content = document.getElementById('student-content-area');
    const title = document.getElementById('st-page-title');
    const db = getDB();
    updateSidebarActive(tabName);

    if (tabName === 'results') {
        if(title) title.innerText = 'Academic Performance';
        const myResults = db.results.filter(r => r.studentId === currentUser.id);
        let html = `<h3 class="font-bold text-gray-800 mb-4 text-lg">Exam History</h3>`;
        if (myResults.length === 0) { html += `<div class="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500"><i class="fas fa-box-open text-4xl mb-3 text-gray-300"></i><p>No results published yet.</p></div>`; } 
        else {
            html += `<div class="grid gap-4 md:grid-cols-2 fade-in">`;
            myResults.forEach(res => {
                const exam = db.exams.find(e => e.id === res.examId) || { name: 'Unknown' };
                html += `<div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center"><div><h4 class="font-bold text-lg text-gray-800">${exam.name}</h4></div><button onclick="viewMarksheet('${res.id}')" class="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-200">Check Result <i class="fas fa-arrow-right"></i></button></div>`;
            });
            html += `</div>`;
        }
        content.innerHTML = html;
    } else if (tabName === 'profile') {
        if(title) title.innerText = 'My Profile';
        const s = db.students.find(stu => stu.id === currentUser.id); 
        const photoHTML = s.profileImage ? `<img src="${s.profileImage}" class="w-full h-full object-cover rounded">` : `<div class="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400"><i class="fas fa-user text-2xl"></i></div>`;

        content.innerHTML = `
            <div class="bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-3xl fade-in">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Profile Photo</label>
                        <div class="flex items-center gap-4">
                            <div class="w-20 h-20 border rounded overflow-hidden">${photoHTML}</div>
                            <div><input type="file" id="pf-img-file" accept="image/*" class="text-sm"></div>
                        </div>
                    </div>
                    <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Father's Name</label><input id="pf-father" value="${s.fatherName||''}" class="w-full p-3 border rounded-lg"></div>
                    <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Mother's Name</label><input id="pf-mother" value="${s.motherName||''}" class="w-full p-3 border rounded-lg"></div>
                    <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Mobile</label><input id="pf-mobile" value="${s.mobile||''}" class="w-full p-3 border rounded-lg"></div>
                    <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">ID Marks</label><input id="pf-idmark" value="${s.idMark||''}" class="w-full p-3 border rounded-lg"></div>
                </div>
                <div class="mb-6"><label class="block text-xs font-bold text-gray-400">Address</label><textarea id="pf-address" rows="3" class="w-full p-3 border rounded-lg">${s.address||''}</textarea></div>
                <div class="text-right"><button onclick="saveStudentProfile()" id="btn-save-profile" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold">Save Changes</button></div>
            </div>`;
    } else if (tabName === 'security') {
        if(title) title.innerText = 'Security';
        content.innerHTML = `<div class="bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-xl fade-in"><div class="mb-6"><label class="block text-xs font-bold text-gray-400">Login ID</label><input id="sec-adm" value="${currentUser.admissionNo}" class="w-full p-3 border rounded"><p class="text-xs text-gray-400">Unique ID.</p></div><div class="mb-8"><label class="text-xs font-bold text-gray-400">Password</label><input id="sec-dob" type="date" value="${currentUser.dob}" class="w-full p-3 border rounded"></div><button onclick="saveStudentSecurity()" id="btn-save-sec" class="w-full bg-red-50 text-red-600 border border-red-100 px-6 py-3 rounded">Update</button></div>`;
    }
}

// --- HELPERS ---
function filterTable(inputId, tableId) { const input = document.getElementById(inputId); const filter = input.value.toUpperCase(); const table = document.getElementById(tableId); if(!table) return; const tr = table.getElementsByTagName("tr"); for (let i = 1; i < tr.length; i++) { let visible = false; const tds = tr[i].getElementsByTagName("td"); for (let j = 0; j < tds.length; j++) { if (tds[j] && tds[j].textContent.toUpperCase().indexOf(filter) > -1) { visible = true; break; } } tr[i].style.display = visible ? "" : "none"; } }
function processBulkStudentUpload() { const fileInput = document.getElementById('bulk-st-file'); const classId = document.getElementById('bulk-st-class').value; if(!classId) return showToast('Select Class', 'error'); if(!fileInput.files.length) return showToast('Select File', 'error'); const file = fileInput.files[0]; const reader = new FileReader(); reader.onload = function(e) { const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, {type: 'array'}); const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1}); if(rows.length < 2) return showToast('Invalid File', 'error'); const db = getDB(); let added = 0; for(let i=1; i<rows.length; i++) { const row = rows[i]; if(!row || row.length < 2) continue; if(db.students.some(s => s.institutionId === currentUser.id && s.admissionNo == row[1])) continue; db.students.push({ id: generateId(), institutionId: currentUser.id, classId: classId, name: String(row[0]), admissionNo: String(row[1]), dob: String(row[2]), mobile: String(row[3]||'') }); added++; } saveDB(db); showToast(`Imported ${added} students.`); filterStudents(); }; reader.readAsArrayBuffer(file); }
function filterStudents() { 
    const filterClassId = document.getElementById('filter-class') ? document.getElementById('filter-class').value : ''; 
    const db = getDB(); 
    let students = db.students.filter(s => s.institutionId === currentUser.id); 
    if (filterClassId) students = students.filter(s => s.classId === filterClassId); 
    students.sort((a, b) => { const cA = db.classes.find(c => c.id === a.classId)?.name || ''; const cB = db.classes.find(c => c.id === b.classId)?.name || ''; return cA.localeCompare(cB) || a.admissionNo.localeCompare(b.admissionNo, undefined, {numeric: true}); }); 
    const tbody = document.getElementById('student-tbody'); 
    if (!tbody) return;
    tbody.innerHTML = ''; 
    if(students.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400">No students found.</td></tr>'; return; } 
    let lastClass = null; 
    students.forEach(s => { 
        const cName = db.classes.find(c => c.id === s.classId)?.name || '-'; 
        if(lastClass !== null && lastClass !== s.classId) tbody.innerHTML += `<tr class="bg-blue-50"><td colspan="5" class="h-2 p-0 border-t border-b border-blue-100"></td></tr>`; 
        lastClass = s.classId; 
        const avatar = s.profileImage ? `<img src="${s.profileImage}" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs"><i class="fas fa-user"></i></div>`;
        tbody.innerHTML += `<tr class="border-b hover:bg-blue-50/30 transition group"><td class="p-3 font-mono text-gray-600">${s.admissionNo}</td><td class="p-3">${avatar}</td><td class="p-3 font-bold text-gray-800">${s.name}</td><td class="p-3"><span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-bold border border-blue-100">${cName}</span></td><td class="p-3 text-right opacity-0 group-hover:opacity-100 transition"><button onclick="openEditModal('student', '${s.id}')" class="text-gray-400 hover:text-yellow-500 mr-3 transition"><i class="fas fa-pen"></i></button><button onclick="deleteItem('student', '${s.id}')" class="text-gray-400 hover:text-red-500 transition"><i class="fas fa-trash"></i></button></td></tr>`; 
    }); 
}
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
function processMarksUpload(input, classId) { try { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function(e) { const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, {type: 'array'}); const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); const db = getDB(); const subjects = db.subjects.filter(s => s.classId === classId); let updatedCount = 0; rows.forEach(row => { const cleanRow = {}; Object.keys(row).forEach(k => cleanRow[k.trim()] = row[k]); const admNo = cleanRow["Admission No"]; const student = db.students.find(s => s.classId === classId && s.admissionNo == admNo); if (student) { updatedCount++; subjects.forEach(sub => { const val = cleanRow[sub.name]; if (val !== undefined) { const inputEl = document.querySelector(`input[data-student="${student.id}"][data-subject="${sub.id}"]`); if (inputEl) { inputEl.value = val; validateAndColor(inputEl, sub.passMarks); } } }); const attVal = cleanRow["Attendance"]; if (attVal !== undefined) { const attInput = document.querySelector(`input.input-att[data-student="${student.id}"]`); if (attInput) attInput.value = attVal; } calculateRowTotal(student.id); } }); showToast(`Populated ${updatedCount}`); input.value = ""; }; reader.readAsArrayBuffer(file); } catch (e) { console.error(e); showToast("Import error", "error"); } }

// --- CERTIFICATE & RESULTS ---
function calculateGrade(percentage) { if (percentage >= 90) return { grade: 'A+', css: 'grade-A' }; if (percentage >= 80) return { grade: 'A', css: 'grade-A' }; if (percentage >= 70) return { grade: 'B', css: 'grade-B' }; if (percentage >= 60) return { grade: 'C', css: 'grade-C' }; if (percentage >= 50) return { grade: 'D', css: 'grade-D' }; return { grade: 'F', css: 'grade-F' }; }
function viewMarksheet(resultId) {
    currentResultId = resultId;
    const db = getDB();
    const res = db.results.find(r => r.id === resultId);
    const exam = db.exams.find(e => e.id === res.examId);
    const cls = db.classes.find(c => c.id === currentUser.classId);
    const className = cls ? cls.name : 'Unknown Class';
    const subjects = db.subjects.filter(s => s.classId === currentUser.classId);
    const inst = db.institutions.find(i => i.id === currentUser.institutionId);
    const student = db.students.find(s => s.id === currentUser.id);

    safeSetText('mk-inst-name', inst.name);
    safeSetText('mk-name', student.name);
    safeSetText('mk-adm', student.admissionNo);
    safeSetText('mk-dob', student.dob);
    safeSetText('mk-class', className);
    safeSetText('mk-exam', exam.name);
    
    const photoBox = document.getElementById('mk-photo-container');
    if (photoBox) {
        photoBox.innerHTML = student.profileImage ? `<img src="${student.profileImage}" class="w-full h-full object-cover">` : `<i class="fas fa-user text-gray-300 text-4xl"></i>`;
    }

    // Attendance logic
    let attText = "N/A";
    const present = parseInt(res.attendance || 0);
    if (!isNaN(present)) {
        const totalDays = cls && cls.totalAttendance ? parseInt(cls.totalAttendance) : 0;
        if (totalDays > 0) {
            const percent = Math.round((present / totalDays) * 100);
            attText = `${present} / ${totalDays} (${percent}%)`;
        } else {
            attText = `${present} Days`;
        }
    }
    safeSetText('mk-attendance', attText);
    safeSetText('mk-date', new Date().toLocaleDateString());

    const tbody = document.getElementById('mk-tbody');
    tbody.innerHTML = '';
    let totalObtained = 0;
    let totalMax = 0;
    const displaySubjects = subjects.length > 0 ? subjects : Object.keys(res.subjectMarks).map(k => ({id: k, name: 'Subject', fullMarks: 100, passMarks: 35}));

    displaySubjects.forEach(sub => {
        const obtained = parseInt(res.subjectMarks ? (res.subjectMarks[sub.id] || 0) : 0);
        const full = sub.fullMarks || 100;
        totalObtained += obtained;
        totalMax += full;
        const gradeObj = calculateGrade((obtained/full)*100);
        
        tbody.innerHTML += `<tr><td>${sub.name}</td><td>${full}</td><td>${obtained}</td><td><span class="grade-badge ${gradeObj.css}">${gradeObj.grade}</span></td></tr>`;
    });

    const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(2) : 0;
    safeSetText('mk-total-max', totalMax);
    safeSetText('mk-total-obt', totalObtained);
    safeSetText('mk-percentage', `${percentage}%`);
    safeSetText('mk-rank', getOrdinal(res.rank));
    
    const finalStatusEl = document.getElementById('mk-final-status');
    if(finalStatusEl) {
        finalStatusEl.innerText = res.status;
        finalStatusEl.className = res.status === 'PASS' ? 'text-3xl font-black text-green-500' : 'text-3xl font-black text-red-500';
    }

    document.getElementById('view-student').classList.add('hidden');
    document.getElementById('view-marksheet').classList.remove('hidden');
}
function closeMarksheet() { document.getElementById('view-marksheet').classList.add('hidden'); document.getElementById('view-student').classList.remove('hidden'); }
function getOrdinal(n) { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// --- CERTIFICATE LOGIC ---
function viewCertificate() {
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