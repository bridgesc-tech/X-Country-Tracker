class XCountryTracker {
    constructor() {
        this.mode = this.getMode(); // 'student' or 'coach'
        // Don't validate team code in constructor - do it after mode is confirmed
        const rawCode = localStorage.getItem('xcountryTeamCode');
        this.teamCode = rawCode; // Store raw value initially (player code - 6 digits)
        this.coachCode = localStorage.getItem('xcountryCoachCode'); // Coach code - 6 letters
        this.studentId = this.getOrCreateStudentId();
        this.runs = this.loadRuns();
        this.scoreChart = null;
        this.paceChart = null;
        this.studentScoreChart = null;
        this.studentPaceChart = null;
        this.db = null;
        this.firebaseInitialized = false;
        this.currentStudentsMap = null;
        
        this.initializeApp();
    }

    initializeApp() {
        // Wait a bit for DOM to be fully ready
        setTimeout(() => {
            // Validate team code format (only clear if invalid, don't clear if null)
            if (this.teamCode && !/^\d{6}$/.test(this.teamCode)) {
                // Old format detected - clear it
                console.log('Old team code format detected, clearing:', this.teamCode);
                localStorage.removeItem('xcountryTeamCode');
                this.teamCode = null;
            }

            // Check if setup is complete
            const hasValidPlayerCode = this.teamCode && /^\d{6}$/.test(this.teamCode);
            const hasValidCoachCode = this.getCoachCode() && /^[A-Za-z]{6}$/.test(this.getCoachCode());
            const isStudentWithName = this.mode === 'student' && this.getStudentName();
            
            // Show mode selection if:
            // 1. No mode is set, OR
            // 2. Coach mode but no valid coach code, OR
            // 3. Student mode but no player code or no name
            if (!this.mode || 
                (this.mode === 'coach' && !hasValidCoachCode) ||
                (this.mode === 'student' && (!hasValidPlayerCode || !isStudentWithName))) {
                this.showModeSelection();
                return;
            }

            // Setup is complete, proceed to app
            // Initialize Firebase if available
            this.initializeFirebase(async () => {
                this.setupEventListeners();
                
                // If student mode and has name + team code, try to load runs from Firebase
                if (this.mode === 'student' && this.getStudentName() && this.teamCode) {
                    // Ensure we have the correct studentId (check Firebase for existing profile)
                    const firstName = this.getStudentFirstName();
                    const lastName = this.getStudentLastName();
                    if (firstName && lastName) {
                        // This will check Firebase and load runs if profile exists
                        await this.setStudentName(firstName, lastName);
                    }
                }
                
                // Show appropriate view
                this.showAppropriateView();
                
                // Check if student needs to enter name (shouldn't happen if we got here, but just in case)
                this.checkStudentNameOnLoad();
            });
        }, 100);
    }

    getMode() {
        return localStorage.getItem('xcountryMode'); // 'student' or 'coach'
    }

    setMode(mode) {
        localStorage.setItem('xcountryMode', mode);
        this.mode = mode;
    }

    getTeamCode() {
        const code = localStorage.getItem('xcountryTeamCode');
        // Validate that code is 6 digits (migrate from old format if needed)
        if (code && !/^\d{6}$/.test(code)) {
            // Old format detected - clear it
            console.log('Old team code format detected, clearing:', code);
            localStorage.removeItem('xcountryTeamCode');
            return null;
        }
        return code;
    }

    setTeamCode(code) {
        // Validate code is 6 digits before storing (player code)
        if (code && /^\d{6}$/.test(code)) {
            localStorage.setItem('xcountryTeamCode', code);
            this.teamCode = code;
        } else {
            console.error('Invalid team code format. Must be 6 digits.');
        }
    }
    
    setCoachCode(code) {
        // Validate code is 6 letters before storing
        if (code && /^[A-Za-z]{6}$/.test(code)) {
            localStorage.setItem('xcountryCoachCode', code);
            this.coachCode = code;
        } else {
            console.error('Invalid coach code format. Must be 6 letters.');
        }
    }
    
    getCoachCode() {
        return this.coachCode || localStorage.getItem('xcountryCoachCode');
    }
    
    generateCoachCode() {
        // Generate a 6-letter alphabetic code
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        return code;
    }

    getOrCreateStudentId() {
        let studentId = localStorage.getItem('xcountryStudentId');
        if (!studentId) {
            // Generate a unique student ID
            studentId = 'student_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('xcountryStudentId', studentId);
        }
        return studentId;
    }

    getStudentName() {
        const firstName = localStorage.getItem('xcountryStudentFirstName') || '';
        const lastName = localStorage.getItem('xcountryStudentLastName') || '';
        if (firstName && lastName) {
            return `${firstName} ${lastName}`;
        }
        // Fallback for old single-name format
        const oldName = localStorage.getItem('xcountryStudentName');
        if (oldName) {
            return oldName;
        }
        return '';
    }

    getStudentFirstName() {
        return localStorage.getItem('xcountryStudentFirstName') || '';
    }

    getStudentLastName() {
        return localStorage.getItem('xcountryStudentLastName') || '';
    }

    async setStudentName(firstName, lastName) {
        if (!firstName || !lastName || !this.teamCode) {
            return false;
        }
        
        const firstNameTrimmed = firstName.trim();
        const lastNameTrimmed = lastName.trim();
        
        // Store name in localStorage
        localStorage.setItem('xcountryStudentFirstName', firstNameTrimmed);
        localStorage.setItem('xcountryStudentLastName', lastNameTrimmed);
        // Remove old single-name format if it exists
        localStorage.removeItem('xcountryStudentName');
        
        // Check Firebase for existing student with same name and team code
        if (this.db) {
            try {
                const querySnapshot = await this.db.collection('students')
                    .where('firstName', '==', firstNameTrimmed)
                    .where('lastName', '==', lastNameTrimmed)
                    .where('teamCode', '==', String(this.teamCode))
                    .limit(1)
                    .get();
                
                if (!querySnapshot.empty) {
                    // Found existing student - use their studentId
                    const studentDoc = querySnapshot.docs[0];
                    const studentData = studentDoc.data();
                    const existingStudentId = studentData.studentId;
                    
                    console.log('Found existing student profile:', existingStudentId);
                    
                    // Update studentId
                    this.studentId = existingStudentId;
                    localStorage.setItem('xcountryStudentId', existingStudentId);
                    
                    // Load runs from Firebase for this student
                    await this.loadRunsFromFirebase();
                    
                    return true;
                } else {
                    // No existing student found - create new one
                    const newStudentId = this.getOrCreateStudentId();
                    
                    // Store student in Firebase for future lookups
                    try {
                        await this.db.collection('students').doc(newStudentId).set({
                            studentId: newStudentId,
                            firstName: firstNameTrimmed,
                            lastName: lastNameTrimmed,
                            teamCode: String(this.teamCode),
                            createdAt: new Date().toISOString()
                        });
                        console.log('Created new student profile:', newStudentId);
                    } catch (error) {
                        console.error('Error saving student to Firebase:', error);
                        // Continue anyway - studentId is already set
                    }
                    
                    return true;
                }
            } catch (error) {
                console.error('Error checking for existing student:', error);
                // If Firebase fails, just use local studentId
                this.getOrCreateStudentId();
                return true;
            }
        } else {
            // Firebase not available - just use local studentId
            this.getOrCreateStudentId();
            return true;
        }
    }
    
    async loadRunsFromFirebase() {
        if (!this.db || !this.studentId) return;
        
        try {
            const runsSnapshot = await this.db.collection('runs')
                .where('studentId', '==', this.studentId)
                .orderBy('date', 'desc')
                .get();
            
            const firebaseRuns = [];
            runsSnapshot.forEach(doc => {
                const runData = doc.data();
                // Convert Firebase data to run object format
                firebaseRuns.push({
                    id: runData.id || doc.id,
                    date: runData.date,
                    distance: runData.distance,
                    timeInMinutes: runData.timeInMinutes,
                    minutes: runData.minutes || 0,
                    seconds: runData.seconds || 0,
                    score: runData.score,
                    pace: runData.pace,
                    studentId: runData.studentId,
                    studentName: runData.studentName,
                    teamCode: runData.teamCode
                });
            });
            
            // Merge with local runs (avoid duplicates by ID)
            const localRuns = this.loadRuns();
            const runIds = new Set(firebaseRuns.map(r => r.id));
            
            // Add local runs that aren't in Firebase
            localRuns.forEach(localRun => {
                if (!runIds.has(localRun.id)) {
                    firebaseRuns.push(localRun);
                }
            });
            
            // Update runs and save
            this.runs = firebaseRuns;
            this.runs.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.saveRuns();
            
            console.log(`Loaded ${firebaseRuns.length} runs for student ${this.studentId}`);
        } catch (error) {
            console.error('Error loading runs from Firebase:', error);
            // If error, just use local runs
        }
    }

    showModeSelection() {
        const modal = document.getElementById('modeSelectionModal');
        if (!modal) {
            console.error('Mode selection modal not found');
            return;
        }
        
        // Show the modal
        modal.style.display = 'block';
        
        // Wait a moment for display to take effect
        setTimeout(() => {
            const studentBtn = document.getElementById('studentModeBtn');
            const coachBtn = document.getElementById('coachModeBtn');
            
            if (!studentBtn || !coachBtn) {
                console.error('Mode selection buttons not found', { studentBtn, coachBtn });
                return;
            }
            
            // Remove any existing listeners by cloning and replacing
            const newStudentBtn = studentBtn.cloneNode(true);
            studentBtn.parentNode.replaceChild(newStudentBtn, studentBtn);
            
            const newCoachBtn = coachBtn.cloneNode(true);
            coachBtn.parentNode.replaceChild(newCoachBtn, coachBtn);
            
            // Add fresh event listeners
            newStudentBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Student mode clicked');
                this.setMode('student');
                modal.style.display = 'none';
                this.showTeamCodeEntry();
            });
            
            newCoachBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Coach mode clicked');
                this.setMode('coach');
                modal.style.display = 'none';
                
                // Check if coach code already exists and is valid
                const existingCoachCode = this.getCoachCode();
                if (existingCoachCode && /^[A-Za-z]{6}$/.test(existingCoachCode)) {
                    // Coach code exists, go directly to dashboard
                    this.initializeFirebase(() => {
                        this.setupEventListeners();
                        this.showAppropriateView();
                    });
                } else {
                    // No valid coach code, show coach team setup modal
                    this.showCoachTeamSetup();
                }
            });
        }, 50);
    }

    showTeamCodeEntry() {
        const modal = document.getElementById('teamCodeModal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        // Remove existing listeners and add new one
        const joinBtn = document.getElementById('joinTeamBtn');
        if (joinBtn) {
            const newJoinBtn = joinBtn.cloneNode(true);
            joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
            newJoinBtn.addEventListener('click', () => {
                const code = document.getElementById('teamCodeInput').value.trim();
                // Validate 6-digit numeric code
                if (code && /^\d{6}$/.test(code)) {
                    this.setTeamCode(code);
                    modal.style.display = 'none';
                    
                    // Check if student name is set, if not show name input
                    if (!this.getStudentName()) {
                        this.showStudentNameInput();
                    } else {
                        this.initializeFirebase(() => {
                            this.setupEventListeners();
                            this.showAppropriateView();
                        });
                    }
                } else {
                    alert('Please enter a valid 6-digit team code');
                }
            });
        }
    }

    showStudentNameInput() {
        const modal = document.getElementById('studentNameModal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        // Get input fields
        let firstNameInput = document.getElementById('studentFirstNameInput');
        let lastNameInput = document.getElementById('studentLastNameInput');
        
        // Pre-fill with existing names if changing
        if (firstNameInput) {
            const currentFirstName = this.getStudentFirstName();
            firstNameInput.value = currentFirstName || '';
        }
        if (lastNameInput) {
            const currentLastName = this.getStudentLastName();
            lastNameInput.value = currentLastName || '';
        }
        
        // Focus on first name field
        if (firstNameInput) {
            setTimeout(() => firstNameInput.focus(), 100);
        }
        
        // Remove existing listeners and add new one
        const saveBtn = document.getElementById('saveStudentNameBtn');
        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            const handleSave = async () => {
                // Get fresh references to the actual DOM elements
                const firstNameField = document.getElementById('studentFirstNameInput');
                const lastNameField = document.getElementById('studentLastNameInput');
                
                const firstName = firstNameField ? firstNameField.value.trim() : '';
                const lastName = lastNameField ? lastNameField.value.trim() : '';
                
                if (!firstName) {
                    alert('Please enter your first name');
                    if (firstNameField) firstNameField.focus();
                    return;
                }
                
                if (!lastName) {
                    alert('Please enter your last name');
                    if (lastNameField) lastNameField.focus();
                    return;
                }
                
                // Ensure Firebase is initialized before checking for existing student
                if (!this.db && this.teamCode) {
                    await new Promise((resolve) => {
                        this.initializeFirebase(() => {
                            resolve();
                        });
                    });
                }
                
                // Set student name (this will check for existing profile and load runs)
                const success = await this.setStudentName(firstName, lastName);
                
                if (success) {
                    modal.style.display = 'none';
                    
                    // If already initialized, just refresh the view
                    if (this.mode && this.teamCode) {
                        this.showAppropriateView();
                        // Update settings display if open
                        const settingsModal = document.getElementById('settingsModal');
                        if (settingsModal && settingsModal.style.display === 'block') {
                            this.openSettings();
                        }
                    } else {
                        this.initializeFirebase(() => {
                            this.setupEventListeners();
                            this.showAppropriateView();
                        });
                    }
                }
            };
            
            newSaveBtn.addEventListener('click', handleSave);
            
            // Also allow Enter key to submit from either field
            if (firstNameInput) {
                const firstNameClone = firstNameInput.cloneNode(true);
                firstNameInput.parentNode.replaceChild(firstNameClone, firstNameInput);
                firstNameClone.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const lastNameField = document.getElementById('studentLastNameInput');
                        if (lastNameField) lastNameField.focus();
                    }
                });
            }
            
            if (lastNameInput) {
                const lastNameClone = lastNameInput.cloneNode(true);
                lastNameInput.parentNode.replaceChild(lastNameClone, lastNameInput);
                lastNameClone.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSave();
                    }
                });
            }
        }
    }

    showCoachTeamSetup() {
        const modal = document.getElementById('coachTeamSetupModal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        // Remove existing listeners and add new ones
        const createNewBtn = document.getElementById('createNewTeamOptionBtn');
        const joinExistingBtn = document.getElementById('joinExistingTeamOptionBtn');
        
        if (createNewBtn) {
            const newCreateNewBtn = createNewBtn.cloneNode(true);
            createNewBtn.parentNode.replaceChild(newCreateNewBtn, createNewBtn);
            newCreateNewBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                this.showCreateTeam();
            });
        }
        
        if (joinExistingBtn) {
            const newJoinExistingBtn = joinExistingBtn.cloneNode(true);
            joinExistingBtn.parentNode.replaceChild(newJoinExistingBtn, joinExistingBtn);
            newJoinExistingBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                this.showJoinExistingTeam();
            });
        }
    }

    showCreateTeam() {
        const modal = document.getElementById('createTeamModal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        // Remove existing listeners and add new one
        const createBtn = document.getElementById('createTeamBtn');
        if (createBtn) {
            const newCreateBtn = createBtn.cloneNode(true);
            createBtn.parentNode.replaceChild(newCreateBtn, createBtn);
            newCreateBtn.addEventListener('click', () => {
                const teamName = document.getElementById('teamNameInput').value.trim();
                if (teamName) {
                    this.createTeam(teamName);
                } else {
                    alert('Please enter a team name.');
                }
            });
        }
        
        // Back button
        const backBtn = document.getElementById('backToCoachSetupBtn');
        if (backBtn) {
            const newBackBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBackBtn, backBtn);
            newBackBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                this.showCoachTeamSetup();
            });
        }
    }

    showJoinExistingTeam() {
        const modal = document.getElementById('joinExistingTeamModal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        // Clear input and set up uppercase conversion
        const teamCodeInput = document.getElementById('coachTeamCodeInput');
        if (teamCodeInput) {
            teamCodeInput.value = '';
            // Convert to uppercase as user types
            teamCodeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
            });
        }
        
        // Remove existing listeners and add new one
        const joinBtn = document.getElementById('joinExistingTeamBtn');
        if (joinBtn) {
            const newJoinBtn = joinBtn.cloneNode(true);
            joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
            newJoinBtn.addEventListener('click', () => {
                this.joinExistingTeam();
            });
        }
        
        // Back button
        const backBtn = document.getElementById('backToCoachSetupBtn2');
        if (backBtn) {
            const newBackBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBackBtn, backBtn);
            newBackBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                this.showCoachTeamSetup();
            });
        }
        
        // Allow Enter key to submit
        if (teamCodeInput) {
            teamCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.joinExistingTeam();
                }
            });
        }
    }

    async joinExistingTeam() {
        const teamCodeInput = document.getElementById('coachTeamCodeInput');
        if (!teamCodeInput) return;
        
        const coachCode = teamCodeInput.value.trim().toUpperCase();
        
        if (!coachCode || !/^[A-Z]{6}$/.test(coachCode)) {
            alert('Please enter a valid 6-letter coach code.');
            return;
        }
        
        // Check if team exists by coach code
        let teamExists = false;
        let teamName = null;
        let playerCode = null;
        
        if (this.db) {
            try {
                const querySnapshot = await this.db.collection('teams')
                    .where('coachCode', '==', coachCode)
                    .limit(1)
                    .get();
                
                if (!querySnapshot.empty) {
                    const teamDoc = querySnapshot.docs[0];
                    const teamData = teamDoc.data();
                    teamExists = true;
                    teamName = teamData.teamName || 'Unknown Team';
                    playerCode = teamData.playerCode || teamDoc.id;
                    // Store team name and codes in localStorage
                    localStorage.setItem(`xcountryTeamName_${playerCode}`, teamName);
                    this.setTeamCode(playerCode);
                    this.setCoachCode(coachCode);
                }
            } catch (error) {
                console.error('Error checking team:', error);
                alert('Error checking team. Please try again.');
                return;
            }
        } else {
            // If Firebase not available, can't verify coach code
            alert('Cannot verify coach code offline. Please check your connection.');
            return;
        }
        
        if (!teamExists) {
            alert('Coach code not found. Please check the code and try again.');
            return;
        }
        
        // Codes are already set above, proceed to dashboard
        document.getElementById('joinExistingTeamModal').style.display = 'none';
        
        // Initialize Firebase and show dashboard
        this.initializeFirebase(() => {
            this.setupEventListeners();
            this.showAppropriateView();
        });
    }

    checkStudentNameOnLoad() {
        // If student mode and no name set, show name input
        if (this.mode === 'student' && this.teamCode && !this.getStudentName()) {
            this.showStudentNameInput();
        }
    }

    async createTeam(teamName) {
        // Generate a unique 6-digit numeric player code
        // This ensures it's always exactly 6 digits (100000 to 999999)
        const playerCode = String(Math.floor(100000 + Math.random() * 900000));
        
        // Generate a unique 6-letter coach code
        let coachCode = this.generateCoachCode();
        
        // Ensure coach code uniqueness (check Firebase if available)
        if (this.db) {
            let isUnique = false;
            let attempts = 0;
            while (!isUnique && attempts < 10) {
                const querySnapshot = await this.db.collection('teams')
                    .where('coachCode', '==', coachCode)
                    .get();
                if (querySnapshot.empty) {
                    isUnique = true;
                } else {
                    coachCode = this.generateCoachCode();
                    attempts++;
                }
            }
        }
        
        this.setTeamCode(playerCode);
        this.setCoachCode(coachCode);
        
        // Store team name in localStorage as fallback
        localStorage.setItem(`xcountryTeamName_${playerCode}`, teamName);
        
        if (this.db) {
            try {
                await this.db.collection('teams').doc(playerCode).set({
                    teamName: teamName,
                    playerCode: playerCode,
                    coachCode: coachCode,
                    createdAt: new Date().toISOString(),
                    coachId: 'coach_' + Date.now()
                });
                console.log('Team created with Player Code:', playerCode, 'Coach Code:', coachCode);
            } catch (error) {
                console.error('Error creating team:', error);
            }
        }
        
        document.getElementById('createTeamModal').style.display = 'none';
        this.initializeFirebase(() => {
            this.setupEventListeners();
            this.showAppropriateView();
        });
    }
    
    getTeamName() {
        if (!this.teamCode) return null;
        // Try to get from localStorage first (fastest)
        const cachedName = localStorage.getItem(`xcountryTeamName_${this.teamCode}`);
        if (cachedName) return cachedName;
        return null;
    }

    initializeFirebase(callback) {
        if (window.location.protocol === 'file:') {
            // No Firebase for file:// protocol
            if (callback) callback();
            return;
        }

        const checkFirebase = (attempts = 0) => {
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                try {
                    this.db = firebase.firestore();
                    this.firebaseInitialized = true;
                    if (callback) callback();
                } catch (error) {
                    console.error('Firebase initialization error:', error);
                    if (callback) callback();
                }
            } else if (attempts < 50) {
                setTimeout(() => checkFirebase(attempts + 1), 100);
            } else {
                console.log('Firebase not available');
                if (callback) callback();
            }
        };
        checkFirebase();
    }

    showAppropriateView() {
        if (this.mode === 'coach') {
            const studentView = document.getElementById('studentView');
            const coachView = document.getElementById('coachView');
            if (studentView) studentView.style.display = 'none';
            if (coachView) coachView.style.display = 'block';
            this.renderCoachDashboard();
        } else {
            const studentView = document.getElementById('studentView');
            const coachView = document.getElementById('coachView');
            if (studentView) studentView.style.display = 'block';
            if (coachView) coachView.style.display = 'none';
            this.render();
        }
    }

    setupEventListeners() {
        // Student view event listeners
        const addRunBtn = document.getElementById('addRunBtn');
        if (addRunBtn) {
            // Add both click and touchstart for better mobile support
            addRunBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.addRun();
            });
            addRunBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.addRun();
            });
        }
        
        // Set today's date as default
        const runDateInput = document.getElementById('runDate');
        if (runDateInput) {
            const today = new Date().toISOString().split('T')[0];
            runDateInput.value = today;
        }
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });

        // Settings buttons
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        const coachSettingsBtn = document.getElementById('coachSettingsBtn');
        if (coachSettingsBtn) {
            coachSettingsBtn.addEventListener('click', () => this.openSettings());
        }
        const closeSettingsBtn = document.getElementById('closeSettingsModal');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        }
        // Removed switchModeBtn - mode selection is permanent
        // Removed changeTeamCodeBtn and changeStudentNameBtn - students can't change these
        // Removed generateTestDataBtn - production mode
        const backToStudentsBtn = document.getElementById('backToStudentsBtn');
        if (backToStudentsBtn) {
            backToStudentsBtn.addEventListener('click', () => this.showStudentsList());
        }
        const toggleRunsBtn = document.getElementById('toggleRunsBtn');
        if (toggleRunsBtn) {
            toggleRunsBtn.addEventListener('click', () => this.toggleRunsList());
        }
        const toggleStudentRunsBtn = document.getElementById('toggleStudentRunsBtn');
        if (toggleStudentRunsBtn) {
            toggleStudentRunsBtn.addEventListener('click', () => this.toggleStudentRunsList());
        }
        const createNewTeamBtn = document.getElementById('createNewTeamBtn');
        if (createNewTeamBtn) {
            createNewTeamBtn.addEventListener('click', () => {
                this.closeSettings();
                this.showCoachTeamSetup();
            });
        }
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            }
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeTab = document.getElementById(`${tabName}-tab`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Re-render charts if switching to stats tab (in case window was resized)
        if (tabName === 'stats') {
            setTimeout(() => {
                this.renderCharts();
            }, 100);
        }
    }

    loadRuns() {
        const stored = localStorage.getItem('xcountryRuns');
        if (stored) {
            return JSON.parse(stored);
        }
        return [];
    }

    saveRuns() {
        localStorage.setItem('xcountryRuns', JSON.stringify(this.runs));
    }

    calculateScore(distance, timeInMinutes) {
        // Score = (Distance / Time) * 1000
        // This rewards both distance and speed
        // Higher score = better performance
        if (timeInMinutes === 0) return 0;
        return Math.round((distance / timeInMinutes) * 1000);
    }

    calculatePace(timeInMinutes, distance) {
        // Pace in minutes per mile
        if (distance === 0) return 0;
        return timeInMinutes / distance;
    }

    formatTime(minutes) {
        const mins = Math.floor(minutes);
        const secs = Math.round((minutes - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatPace(pace) {
        const mins = Math.floor(pace);
        const secs = Math.round((pace - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async addRun() {
        const date = document.getElementById('runDate').value;
        const distance = parseFloat(document.getElementById('runDistance').value);
        const minutes = parseInt(document.getElementById('runMinutes').value) || 0;
        const seconds = parseInt(document.getElementById('runSeconds').value) || 0;
        
        if (!date || !distance || distance <= 0) {
            alert('Please fill in all fields with valid values.');
            return;
        }

        const timeInMinutes = minutes + (seconds / 60);
        const score = this.calculateScore(distance, timeInMinutes);
        const pace = this.calculatePace(timeInMinutes, distance);

        const run = {
            id: Date.now(),
            date: date,
            distance: distance,
            timeInMinutes: timeInMinutes,
            minutes: minutes,
            seconds: seconds,
            score: score,
            pace: pace,
            studentId: this.studentId,
            studentName: this.getStudentName(),
            teamCode: String(this.teamCode) // Ensure teamCode is always a string
        };

        this.runs.push(run);
        this.runs.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date, newest first
        this.saveRuns();
        
        // Sync to Firebase
        if (this.db && this.teamCode) {
            try {
                await this.db.collection('runs').add({
                    ...run,
                    createdAt: new Date().toISOString()
                });
            } catch (error) {
                console.error('Error saving run to Firebase:', error);
            }
        }
        
        this.render();

        // Reset form
        document.getElementById('runDistance').value = '';
        document.getElementById('runMinutes').value = '';
        document.getElementById('runSeconds').value = '';
        
        // Show confirmation message
        this.showRunConfirmation();
    }
    
    showRunConfirmation() {
        const confirmationMsg = document.getElementById('runConfirmationMessage');
        if (confirmationMsg) {
            confirmationMsg.style.display = 'flex';
            confirmationMsg.classList.add('show');
            
            // Hide after 2 seconds
            setTimeout(() => {
                confirmationMsg.classList.remove('show');
                setTimeout(() => {
                    confirmationMsg.style.display = 'none';
                }, 300); // Wait for fade-out animation
            }, 2000);
        }
    }

    async deleteRun(id) {
        if (confirm('Are you sure you want to delete this run?')) {
            this.runs = this.runs.filter(run => run.id !== id);
            this.saveRuns();
            
            // Delete from Firebase if available
            if (this.db) {
                try {
                    const runsSnapshot = await this.db.collection('runs')
                        .where('id', '==', id)
                        .where('studentId', '==', this.studentId)
                        .get();
                    
                    runsSnapshot.forEach(doc => {
                        doc.ref.delete();
                    });
                } catch (error) {
                    console.error('Error deleting run from Firebase:', error);
                }
            }
            
            this.render();
        }
    }

    calculateStats() {
        if (this.runs.length === 0) {
            return {
                totalRuns: 0,
                totalDistance: 0,
                averagePace: 0,
                bestScore: 0,
                averageScore: 0
            };
        }

        const totalDistance = this.runs.reduce((sum, run) => sum + run.distance, 0);
        const totalTime = this.runs.reduce((sum, run) => sum + run.timeInMinutes, 0);
        const averagePace = totalDistance > 0 ? totalTime / totalDistance : 0;
        const bestScore = Math.max(...this.runs.map(run => run.score));
        const averageScore = this.runs.reduce((sum, run) => sum + run.score, 0) / this.runs.length;

        return {
            totalRuns: this.runs.length,
            totalDistance: totalDistance,
            averagePace: averagePace,
            bestScore: bestScore,
            averageScore: Math.round(averageScore)
        };
    }

    renderStats() {
        const stats = this.calculateStats();
        const statsGrid = document.getElementById('statsGrid');
        
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.totalRuns}</div>
                <div class="stat-label">Total Runs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalDistance.toFixed(1)}</div>
                <div class="stat-label">Total Miles</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.averagePace > 0 ? this.formatPace(stats.averagePace) : '--'}</div>
                <div class="stat-label">Avg Pace</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.bestScore}</div>
                <div class="stat-label">Best Score</div>
            </div>
        `;
    }

    renderRuns() {
        const runsList = document.getElementById('runsList');
        const emptyState = document.getElementById('emptyState');
        const toggleText = document.getElementById('toggleStudentRunsText');
        const toggleIcon = document.getElementById('toggleStudentRunsIcon');
        const runsContainer = document.getElementById('studentRunsContainer');

        if (this.runs.length === 0) {
            if (runsList) runsList.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            if (toggleText) toggleText.textContent = 'No Runs';
            if (toggleIcon) toggleIcon.textContent = '';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        
        // Update toggle button text to show count
        if (toggleText) {
            toggleText.textContent = `Show Runs (${this.runs.length})`;
        }
        if (toggleIcon) {
            toggleIcon.textContent = '▼';
        }

        if (runsList) {
            runsList.innerHTML = this.runs.map(run => `
                <div class="run-card">
                    <div class="run-header">
                        <span class="run-date">${new Date(run.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <div class="run-header-middle">
                            <span class="run-score-above-time">Score: ${run.score}</span>
                        </div>
                        <div class="run-header-spacer"></div>
                    </div>
                    <div class="run-details">
                        <div class="run-detail">
                            <div class="run-detail-label">Distance</div>
                            <div class="run-detail-value">${run.distance.toFixed(2)} mi</div>
                        </div>
                        <div class="run-detail">
                            <div class="run-detail-label">Time</div>
                            <div class="run-detail-value">${this.formatTime(run.timeInMinutes)}</div>
                        </div>
                        <div class="run-detail">
                            <div class="run-detail-label">Pace</div>
                            <div class="run-detail-value">${this.formatPace(run.pace)}/mi</div>
                        </div>
                    </div>
                    <button class="delete-btn" onclick="tracker.deleteRun(${run.id})" title="Delete run">×</button>
                </div>
            `).join('');
        }

        // Keep runs hidden by default
        if (runsContainer) {
            runsContainer.style.display = 'none';
        }
    }

    toggleStudentRunsList() {
        const runsContainer = document.getElementById('studentRunsContainer');
        const toggleText = document.getElementById('toggleStudentRunsText');
        const toggleIcon = document.getElementById('toggleStudentRunsIcon');
        
        if (!runsContainer || !toggleText || !toggleIcon) return;

        if (runsContainer.style.display === 'none') {
            runsContainer.style.display = 'block';
            toggleText.textContent = toggleText.textContent.replace('Show', 'Hide');
            toggleIcon.textContent = '▲';
        } else {
            runsContainer.style.display = 'none';
            toggleText.textContent = toggleText.textContent.replace('Hide', 'Show');
            toggleIcon.textContent = '▼';
        }
    }

    renderCharts() {
        if (this.runs.length === 0) {
            return;
        }

        // Sort runs by date for charts
        const sortedRuns = [...this.runs].sort((a, b) => new Date(a.date) - new Date(b.date));
        const labels = sortedRuns.map(run => new Date(run.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const scores = sortedRuns.map(run => run.score);
        const paces = sortedRuns.map(run => run.pace);

        // Score Chart
        const scoreCtx = document.getElementById('scoreChart').getContext('2d');
        if (this.scoreChart) {
            this.scoreChart.destroy();
        }
        this.scoreChart = new Chart(scoreCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Score',
                    data: scores,
                    borderColor: '#DC143C',
                    backgroundColor: 'rgba(220, 20, 60, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Score Over Time (Higher is Better)'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });

        // Pace Chart
        const paceCtx = document.getElementById('paceChart').getContext('2d');
        if (this.paceChart) {
            this.paceChart.destroy();
        }
        this.paceChart = new Chart(paceCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Pace (min/mi)',
                    data: paces,
                    borderColor: '#FF4444',
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Pace Over Time (Lower is Better)'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }

    render() {
        this.renderStats();
        this.renderRuns();
        this.renderCharts();
        this.updateTeamCodeDisplay();
    }

    updateTeamCodeDisplay() {
        // Update student name display
        const nameDisplay = document.getElementById('studentNameDisplay');
        if (nameDisplay) {
            const name = this.getStudentName();
            if (name) {
                nameDisplay.textContent = name;
            } else {
                nameDisplay.textContent = '';
            }
        }
        
        // Update team code display
        if (this.teamCode) {
            const display = document.getElementById('teamCodeDisplay');
            if (display) {
                display.textContent = `Team: ${this.teamCode}`;
            }
        }
    }

    async renderCoachDashboard() {
        if (!this.teamCode) {
            const teamNameEl = document.getElementById('coachTeamName');
            if (teamNameEl) teamNameEl.textContent = 'Team: No team code';
            return;
        }

        // Get team name - try localStorage first, then Firebase
        let teamName = this.getTeamName();
        const teamNameEl = document.getElementById('coachTeamName');
        
        // Get data from Firebase
        let studentsMap = new Map();
        
        if (this.db) {
            try {
                // Get team info from Firebase
                const teamDoc = await this.db.collection('teams').doc(this.teamCode).get();
                if (teamDoc.exists) {
                    const teamData = teamDoc.data();
                    teamName = teamData.teamName || teamName || this.teamCode;
                    // Update localStorage with Firebase data
                    if (teamData.teamName) {
                        localStorage.setItem(`xcountryTeamName_${this.teamCode}`, teamData.teamName);
                    }
                    // Load coach code if available
                    if (teamData.coachCode && /^[A-Za-z]{6}$/.test(teamData.coachCode)) {
                        this.setCoachCode(teamData.coachCode);
                    }
                } else if (!teamName) {
                    // Team doesn't exist in Firebase, use code as fallback
                    teamName = this.teamCode;
                }
            } catch (error) {
                console.error('Error loading team from Firebase:', error);
                // Use cached name or code as fallback
                if (!teamName) teamName = this.teamCode;
            }
        } else {
            // Firebase not available, use cached name or code
            if (!teamName) teamName = this.teamCode;
        }
        
        // Update team name display
        if (teamNameEl) {
            teamNameEl.textContent = `Team: ${teamName}`;
        }

        if (this.db) {
            try {
                // Ensure teamCode is a string for query
                const teamCodeStr = String(this.teamCode);
                console.log('Loading runs for team code:', teamCodeStr);
                
                // Get all runs for this team from Firebase
                const runsSnapshot = await this.db.collection('runs')
                    .where('teamCode', '==', teamCodeStr)
                    .orderBy('date', 'desc')
                    .get();
                
                console.log(`Found ${runsSnapshot.size} runs for team ${teamCodeStr}`);

                // Group runs by student
                runsSnapshot.forEach(doc => {
                    const run = doc.data();
                    const studentId = run.studentId || 'unknown';
                    const studentName = run.studentName || 'Unknown Student';
                    
                    if (!studentsMap.has(studentId)) {
                        studentsMap.set(studentId, {
                            studentId: studentId,
                            studentName: studentName,
                            runs: [],
                            totalRuns: 0,
                            totalDistance: 0,
                            totalScore: 0,
                            bestScore: 0,
                            averagePace: 0
                        });
                    }
                    
                    const student = studentsMap.get(studentId);
                    student.runs.push(run);
                    student.totalRuns++;
                    student.totalDistance += run.distance || 0;
                    student.totalScore += run.score || 0;
                    if (run.score > student.bestScore) {
                        student.bestScore = run.score;
                    }
                    // Update student name if it's in the run data
                    if (run.studentName && !student.studentName) {
                        student.studentName = run.studentName;
                    }
                });
            } catch (error) {
                console.error('Error loading runs from Firebase:', error);
                // If the error is about missing index, log it but continue
                if (error.message && error.message.includes('index')) {
                    console.warn('Firestore index may need to be created. Check Firebase console.');
                }
            }
        }

        // Calculate averages
        studentsMap.forEach(student => {
            if (student.totalRuns > 0) {
                student.averageScore = student.totalScore / student.totalRuns;
                const totalTime = student.runs.reduce((sum, run) => sum + (run.timeInMinutes || 0), 0);
                student.averagePace = this.calculatePace(totalTime, student.totalDistance);
            }
        });

        // Render team stats
        this.renderTeamStats(studentsMap);

        // Render students list
        this.renderStudentsList(studentsMap);

        // Set up real-time listener (only if Firebase is available)
        if (this.db) {
            this.setupCoachListener();
        }
    }

    // Removed loadLocalTestData - production mode

    renderTeamStats(studentsMap) {
        const statsGrid = document.getElementById('teamStatsGrid');
        if (!statsGrid) return;

        const students = Array.from(studentsMap.values());
        const totalStudents = students.length;
        const totalRuns = students.reduce((sum, s) => sum + s.totalRuns, 0);
        const totalDistance = students.reduce((sum, s) => sum + s.totalDistance, 0);
        const avgScore = students.length > 0 
            ? students.reduce((sum, s) => sum + s.averageScore, 0) / students.length 
            : 0;

        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Total Students</div>
                <div class="stat-value">${totalStudents}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Runs</div>
                <div class="stat-value">${totalRuns}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Distance</div>
                <div class="stat-value">${totalDistance.toFixed(1)} mi</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Score</div>
                <div class="stat-value">${avgScore.toFixed(1)}</div>
            </div>
        `;
    }

    renderStudentsList(studentsMap) {
        const studentsList = document.getElementById('studentsList');
        const emptyState = document.getElementById('studentsEmptyState');
        
        if (!studentsList) return;

        const students = Array.from(studentsMap.values());
        
        if (students.length === 0) {
            studentsList.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        // Store students map for detail view
        this.currentStudentsMap = studentsMap;

        // Sort alphabetically by last name
        students.sort((a, b) => {
            // Get student names
            let nameA = 'Student';
            let nameB = 'Student';
            
            if (a.runs && a.runs.length > 0) {
                for (const run of a.runs) {
                    if (run.studentName) {
                        nameA = run.studentName;
                        break;
                    }
                }
            }
            
            if (b.runs && b.runs.length > 0) {
                for (const run of b.runs) {
                    if (run.studentName) {
                        nameB = run.studentName;
                        break;
                    }
                }
            }
            
            // Extract last names (assume format "FirstName LastName")
            const lastNameA = nameA.split(' ').pop() || nameA;
            const lastNameB = nameB.split(' ').pop() || nameB;
            
            // Compare last names alphabetically
            return lastNameA.localeCompare(lastNameB);
        });

        studentsList.innerHTML = students.map((student) => {
            // Try to get student name from runs, fallback to generic name
            let studentName = 'Student';
            if (student.runs && student.runs.length > 0) {
                // Check all runs for a name
                for (const run of student.runs) {
                    if (run.studentName) {
                        studentName = run.studentName;
                        break;
                    }
                }
            }
            
            return `
            <div class="student-card" data-student-id="${student.studentId}" style="cursor: pointer;">
                <div class="student-header">
                    <span class="student-name">${studentName}</span>
                </div>
                <div class="student-stats">
                    <div class="student-stat">
                        <div class="student-stat-label">Runs</div>
                        <div class="student-stat-value">${student.totalRuns}</div>
                    </div>
                    <div class="student-stat">
                        <div class="student-stat-label">Distance</div>
                        <div class="student-stat-value">${student.totalDistance.toFixed(1)} mi</div>
                    </div>
                    <div class="student-stat">
                        <div class="student-stat-label">Best Score</div>
                        <div class="student-stat-value">${student.bestScore.toFixed(1)}</div>
                    </div>
                    <div class="student-stat">
                        <div class="student-stat-label">Avg Pace</div>
                        <div class="student-stat-value">${this.formatPace(student.averagePace)}</div>
                    </div>
                </div>
            </div>
        `;
        }).join('');

        // Add click listeners to student cards
        document.querySelectorAll('.student-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const studentId = card.getAttribute('data-student-id');
                this.showStudentDetail(studentId);
            });
        });
    }

    showStudentDetail(studentId) {
        if (!this.currentStudentsMap || !this.currentStudentsMap.has(studentId)) {
            return;
        }

        const student = this.currentStudentsMap.get(studentId);
        // Try to get student name from runs
        let studentName = 'Student';
        if (student.runs && student.runs.length > 0) {
            for (const run of student.runs) {
                if (run.studentName) {
                    studentName = run.studentName;
                    break;
                }
            }
        }

        // Hide students list, show detail view
        const studentsSection = document.getElementById('studentsListSection');
        const studentDetailView = document.getElementById('studentDetailView');
        
        if (studentsSection) studentsSection.style.display = 'none';
        if (studentDetailView) studentDetailView.style.display = 'block';

        // Update student name
        const nameElement = document.getElementById('studentDetailName');
        if (nameElement) nameElement.textContent = studentName;

        // Render student stats
        this.renderStudentDetailStats(student);

        // Render student runs
        this.renderStudentDetailRuns(student.runs);

        // Render student charts
        this.renderStudentDetailCharts(student.runs);
    }

    showStudentsList() {
        const studentsSection = document.getElementById('studentsListSection');
        const studentDetailView = document.getElementById('studentDetailView');
        
        if (studentsSection) studentsSection.style.display = 'block';
        if (studentDetailView) studentDetailView.style.display = 'none';

        // Destroy charts when hiding detail view
        if (this.studentScoreChart) {
            this.studentScoreChart.destroy();
            this.studentScoreChart = null;
        }
        if (this.studentPaceChart) {
            this.studentPaceChart.destroy();
            this.studentPaceChart = null;
        }
    }

    renderStudentDetailStats(student) {
        const statsGrid = document.getElementById('studentDetailStats');
        if (!statsGrid) return;

        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Total Runs</div>
                <div class="stat-value">${student.totalRuns}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Distance</div>
                <div class="stat-value">${student.totalDistance.toFixed(1)} mi</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Average Pace</div>
                <div class="stat-value">${this.formatPace(student.averagePace)}/mi</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Best Score</div>
                <div class="stat-value">${student.bestScore.toFixed(1)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Average Score</div>
                <div class="stat-value">${student.averageScore.toFixed(1)}</div>
            </div>
        `;
    }

    toggleRunsList() {
        const runsContainer = document.getElementById('studentDetailRunsContainer');
        const toggleText = document.getElementById('toggleRunsText');
        const toggleIcon = document.getElementById('toggleRunsIcon');
        
        if (!runsContainer || !toggleText || !toggleIcon) return;

        if (runsContainer.style.display === 'none') {
            runsContainer.style.display = 'block';
            toggleText.textContent = 'Hide Runs';
            toggleIcon.textContent = '▲';
        } else {
            runsContainer.style.display = 'none';
            toggleText.textContent = 'Show Runs';
            toggleIcon.textContent = '▼';
        }
    }

    renderStudentDetailRuns(runs) {
        const runsList = document.getElementById('studentDetailRuns');
        const toggleText = document.getElementById('toggleRunsText');
        const toggleIcon = document.getElementById('toggleRunsIcon');
        
        if (!runsList) return;

        if (!runs || runs.length === 0) {
            runsList.innerHTML = '<div class="empty-state"><p>No runs recorded yet.</p></div>';
            if (toggleText) toggleText.textContent = 'No Runs';
            if (toggleIcon) toggleIcon.textContent = '';
            return;
        }

        // Update toggle button text to show count
        if (toggleText) {
            toggleText.textContent = `Show Runs (${runs.length})`;
        }
        if (toggleIcon) {
            toggleIcon.textContent = '▼';
        }

        // Sort runs by date (newest first)
        const sortedRuns = [...runs].sort((a, b) => new Date(b.date) - new Date(a.date));

        runsList.innerHTML = sortedRuns.map(run => `
            <div class="run-card">
                <div class="run-header">
                    <span class="run-date">${new Date(run.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <div class="run-header-middle">
                        <span class="run-score-above-time">Score: ${run.score.toFixed(1)}</span>
                    </div>
                    <div class="run-header-spacer"></div>
                </div>
                <div class="run-details">
                    <div class="run-detail">
                        <div class="run-detail-label">Distance</div>
                        <div class="run-detail-value">${run.distance.toFixed(2)} mi</div>
                    </div>
                    <div class="run-detail">
                        <div class="run-detail-label">Time</div>
                        <div class="run-detail-value">${this.formatTime(run.timeInMinutes)}</div>
                    </div>
                    <div class="run-detail">
                        <div class="run-detail-label">Pace</div>
                        <div class="run-detail-value">${this.formatPace(run.pace)}/mi</div>
                    </div>
                </div>
            </div>
        `).join('');

        // Keep runs hidden by default
        const runsContainer = document.getElementById('studentDetailRunsContainer');
        if (runsContainer) {
            runsContainer.style.display = 'none';
        }
    }

    renderStudentDetailCharts(runs) {
        if (!runs || runs.length === 0) return;

        // Sort runs by date (oldest first for charts)
        const sortedRuns = [...runs].sort((a, b) => new Date(a.date) - new Date(b.date));

        const labels = sortedRuns.map(run => {
            const date = new Date(run.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        const scores = sortedRuns.map(run => run.score);
        const paces = sortedRuns.map(run => run.pace);

        // Score Chart
        const scoreCtx = document.getElementById('studentScoreChart');
        if (scoreCtx) {
            if (this.studentScoreChart) {
                this.studentScoreChart.destroy();
            }
            this.studentScoreChart = new Chart(scoreCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Score',
                        data: scores,
                        borderColor: '#FF4444',
                        backgroundColor: 'rgba(255, 68, 68, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Score Over Time (Higher is Better)'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false
                        }
                    }
                }
            });
        }

        // Pace Chart
        const paceCtx = document.getElementById('studentPaceChart');
        if (paceCtx) {
            if (this.studentPaceChart) {
                this.studentPaceChart.destroy();
            }
            this.studentPaceChart = new Chart(paceCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Pace (min/mi)',
                        data: paces,
                        borderColor: '#FF4444',
                        backgroundColor: 'rgba(255, 68, 68, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Pace Over Time (Lower is Better)'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            reverse: true
                        }
                    }
                }
            });
        }
    }

    setupCoachListener() {
        if (!this.db || !this.teamCode) return;

        // Ensure teamCode is a string
        const teamCodeStr = String(this.teamCode);

        // Listen for new runs in real-time
        this.db.collection('runs')
            .where('teamCode', '==', teamCodeStr)
            .orderBy('date', 'desc')
            .limit(1)
            .onSnapshot(() => {
                // Refresh dashboard when new runs are added
                this.renderCoachDashboard();
            }, (error) => {
                console.error('Error in coach listener:', error);
                if (error.message && error.message.includes('index')) {
                    console.warn('Firestore index may need to be created for teamCode and date fields.');
                }
            });
    }

    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (!modal) return;

        // Load version when opening settings
        if (window.updateManager) {
            window.updateManager.loadVersion();
        }

        // Update current mode display
        const modeDisplay = document.getElementById('currentModeDisplay');
        if (modeDisplay) {
            modeDisplay.textContent = `Mode: ${this.mode === 'coach' ? 'Coach' : 'Student'} (permanent)`;
        }

        // Show/hide relevant settings sections
        const studentSettings = document.getElementById('studentSettings');
        const coachSettings = document.getElementById('coachSettings');
        
        if (this.mode === 'student') {
            if (studentSettings) studentSettings.style.display = 'block';
            if (coachSettings) coachSettings.style.display = 'none';
            
            const studentNameDisplay = document.getElementById('currentStudentNameDisplay');
            if (studentNameDisplay) {
                const name = this.getStudentName();
                studentNameDisplay.textContent = `Name: ${name || 'Not set'}`;
            }
            
            const teamCodeDisplay = document.getElementById('currentTeamCodeDisplay');
            if (teamCodeDisplay) {
                // Validate team code format (should be 6 digits)
                if (this.teamCode && /^\d{6}$/.test(this.teamCode)) {
                    teamCodeDisplay.textContent = `Team Code: ${this.teamCode}`;
                } else {
                    teamCodeDisplay.textContent = `Team Code: Not set`;
                    // Clear invalid team code if it exists
                    if (this.teamCode) {
                        localStorage.removeItem('xcountryTeamCode');
                        this.teamCode = null;
                    }
                }
            }
        } else {
            if (studentSettings) studentSettings.style.display = 'none';
            if (coachSettings) coachSettings.style.display = 'block';
            
            const coachTeamCode = document.getElementById('coachTeamCodeSettings');
            const playerCodeDisplay = document.getElementById('playerCodeDisplay');
            const coachCodeDisplay = document.getElementById('coachCodeDisplay');
            
            // Display team name
            if (coachTeamCode) {
                const teamName = this.getTeamName();
                if (teamName) {
                    coachTeamCode.textContent = `Team: ${teamName}`;
                } else {
                    coachTeamCode.textContent = `Team: Not set`;
                }
            }
            
            // Display player code (for sharing with students)
            if (playerCodeDisplay) {
                if (this.teamCode && /^\d{6}$/.test(this.teamCode)) {
                    playerCodeDisplay.textContent = `Player Code: ${this.teamCode}`;
                } else {
                    playerCodeDisplay.textContent = `Player Code: Not set`;
                }
            }
            
            // Display coach code (for sharing with other coaches)
            if (coachCodeDisplay) {
                const coachCode = this.getCoachCode();
                if (coachCode && /^[A-Za-z]{6}$/.test(coachCode)) {
                    coachCodeDisplay.textContent = `Coach Code: ${coachCode.toUpperCase()}`;
                } else {
                    coachCodeDisplay.textContent = `Coach Code: Not set`;
                }
            }
        }

        modal.style.display = 'block';
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'none';
    }

    // Removed switchMode() - mode selection is permanent

    // Removed changeTeamCode() and changeStudentName() - students can't change these

    // Removed generateTestData - production mode
}

// Update Manager Class
class UpdateManager {
    constructor() {
        this.registration = null;
        this.updateAvailable = false;
        this.checkingForUpdate = false;
        this.setupUI();
    }
    
    setupUI() {
        // Setup update banner buttons (use event delegation since elements are created dynamically)
        document.body.addEventListener('click', (e) => {
            if (e.target.id === 'updateNowBtn') {
                this.applyUpdate();
            } else if (e.target.id === 'updateLaterBtn') {
                this.hideUpdateBanner();
            }
        });
        
        // Setup check for updates button in settings
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => this.checkForUpdate());
        }
    }
    
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
            console.log('Service Workers not supported or file protocol');
            return;
        }
        
        try {
            this.registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
            console.log('Service Worker registered:', this.registration);
            
            // Check for updates immediately
            await this.checkForUpdate();
            
            // Listen for service worker updates
            this.registration.addEventListener('updatefound', () => {
                console.log('Service Worker update found');
                this.handleUpdateFound();
            });
            
            // Check for updates periodically (every 5 minutes)
            setInterval(() => this.checkForUpdate(), 5 * 60 * 1000);
            
            // Also check when page becomes visible or comes online
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    this.checkForUpdate();
                }
            });
            window.addEventListener('online', () => {
                this.checkForUpdate();
            });
            
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
    
    async checkForUpdate() {
        if (this.checkingForUpdate || !this.registration) return;
        
        this.checkingForUpdate = true;
        const checkBtn = document.getElementById('checkUpdateBtn');
        const updateBtnText = document.getElementById('updateBtnText');
        const updateStatusText = document.getElementById('updateStatusText');
        
        if (checkBtn) {
            checkBtn.disabled = true;
        }
        if (updateBtnText) {
            updateBtnText.textContent = 'Checking...';
        }
        if (updateStatusText) {
            updateStatusText.textContent = '';
        }
        
        try {
            // Force update check
            await this.registration.update();
            
            // Check if there's a waiting service worker
            if (this.registration.waiting) {
                this.updateAvailable = true;
                this.showUpdateBanner();
                if (updateStatusText) {
                    updateStatusText.textContent = 'Update available! See banner at top.';
                    updateStatusText.style.color = 'var(--button-red)';
                }
            } else {
                // Check if there's an installing service worker
                if (this.registration.installing) {
                    this.handleUpdateFound();
                } else {
                    console.log('No updates available');
                    if (updateBtnText) {
                        updateBtnText.textContent = 'Up to date';
                    }
                    if (updateStatusText) {
                        updateStatusText.textContent = 'You have the latest version.';
                        updateStatusText.style.color = 'var(--text-secondary)';
                    }
                    setTimeout(() => {
                        if (updateBtnText) {
                            updateBtnText.textContent = 'Check for Updates';
                        }
                        if (checkBtn) {
                            checkBtn.disabled = false;
                        }
                        if (updateStatusText) {
                            updateStatusText.textContent = '';
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            if (updateBtnText) {
                updateBtnText.textContent = 'Error';
            }
            if (updateStatusText) {
                updateStatusText.textContent = 'Failed to check for updates.';
                updateStatusText.style.color = 'var(--button-red)';
            }
            setTimeout(() => {
                if (updateBtnText) {
                    updateBtnText.textContent = 'Check for Updates';
                }
                if (checkBtn) {
                    checkBtn.disabled = false;
                }
                if (updateStatusText) {
                    updateStatusText.textContent = '';
                }
            }, 2000);
        } finally {
            this.checkingForUpdate = false;
        }
    }
    
    handleUpdateFound() {
        const installingWorker = this.registration.installing;
        if (!installingWorker) return;
        
        installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                    // New service worker is waiting
                    this.updateAvailable = true;
                    this.showUpdateBanner();
                } else {
                    // First time install
                    console.log('Service Worker installed for the first time');
                }
            }
        });
    }
    
    showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
        const updateBtnText = document.getElementById('updateBtnText');
        if (updateBtnText) {
            updateBtnText.textContent = 'Update Available';
        }
        const checkBtn = document.getElementById('checkUpdateBtn');
        if (checkBtn) {
            checkBtn.disabled = false;
        }
    }
    
    hideUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
    
    async applyUpdate() {
        try {
            // Clear all caches first to ensure fresh files are loaded
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
            
            // Unregister all service workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registrations.map(registration => {
                    console.log('Unregistering service worker');
                    return registration.unregister();
                })
            );
            
            // If there's a waiting worker, tell it to skip waiting
            if (this.registration && this.registration.waiting) {
                this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Force reload with cache bypass (use timestamp to bust cache)
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        } catch (error) {
            console.error('Error applying update:', error);
            // Fallback: reload with cache bypass
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }
    }
    
    async loadVersion() {
        const versionText = document.getElementById('versionText');
        if (!versionText) return;
        
        try {
            // Get version from cache name (most reliable method)
            const cacheNames = await caches.keys();
            const currentCache = cacheNames.find(name => name.startsWith('xcountry-tracker-'));
            if (currentCache) {
                const version = currentCache.replace('xcountry-tracker-', '');
                versionText.textContent = `App Version: ${version}`;
            } else {
                // Try to get from service worker if available
                if (this.registration && this.registration.active) {
                    // Fetch the service worker script and extract version
                    try {
                        const swResponse = await fetch('./service-worker.js?t=' + Date.now());
                        const swText = await swResponse.text();
                        const versionMatch = swText.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
                        if (versionMatch) {
                            versionText.textContent = `App Version: ${versionMatch[1]}`;
                        } else {
                            versionText.textContent = 'App Version: Unknown';
                        }
                    } catch (e) {
                        versionText.textContent = 'App Version: Not installed';
                    }
                } else {
                    versionText.textContent = 'App Version: Not installed';
                }
            }
        } catch (error) {
            console.error('Error loading version:', error);
            versionText.textContent = 'App Version: Error';
        }
    }
}

// Initialize the tracker
let tracker;
let updateManager = null;

window.addEventListener('load', () => {
    tracker = new XCountryTracker();
    window.tracker = tracker; // Make it globally accessible for delete buttons
    
    // Initialize Update Manager for PWA updates
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
        updateManager = new UpdateManager();
        window.updateManager = updateManager; // Make it globally accessible
        updateManager.registerServiceWorker();
    }
});

// Suppress harmless browser extension errors in console
window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('message channel closed')) {
        event.preventDefault();
        return false;
    }
}, true);

