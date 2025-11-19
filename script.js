class XCountryTracker {
    constructor() {
        this.mode = this.getMode(); // 'student' or 'coach'
        this.teamCode = this.getTeamCode();
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
            // Check if mode is set, if not show mode selection
            if (!this.mode) {
                this.showModeSelection();
                return;
            }

            // Initialize Firebase if available
            this.initializeFirebase(() => {
                this.setupEventListeners();
                this.showAppropriateView();
                // Check if student needs to enter name
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
        return localStorage.getItem('xcountryTeamCode');
    }

    setTeamCode(code) {
        localStorage.setItem('xcountryTeamCode', code);
        this.teamCode = code;
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

    setStudentName(firstName, lastName) {
        if (firstName && lastName) {
            localStorage.setItem('xcountryStudentFirstName', firstName.trim());
            localStorage.setItem('xcountryStudentLastName', lastName.trim());
            // Remove old single-name format if it exists
            localStorage.removeItem('xcountryStudentName');
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
                this.showCreateTeam();
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
                const code = document.getElementById('teamCodeInput').value.trim().toUpperCase();
                if (code) {
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
            
            const handleSave = () => {
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
                
                this.setStudentName(firstName, lastName);
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
                }
            });
        }
    }

    checkStudentNameOnLoad() {
        // If student mode and no name set, show name input
        if (this.mode === 'student' && this.teamCode && !this.getStudentName()) {
            this.showStudentNameInput();
        }
    }

    async createTeam(teamName) {
        // Generate a unique team code
        const teamCode = teamName.toUpperCase().replace(/\s+/g, '') + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
        this.setTeamCode(teamCode);
        
        if (this.db) {
            try {
                await this.db.collection('teams').doc(teamCode).set({
                    teamName: teamName,
                    createdAt: new Date().toISOString(),
                    coachId: 'coach_' + Date.now()
                });
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
            addRunBtn.addEventListener('click', () => this.addRun());
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
        const switchModeBtn = document.getElementById('switchModeBtn');
        if (switchModeBtn) {
            switchModeBtn.addEventListener('click', () => this.switchMode());
        }
        // Removed changeTeamCodeBtn and changeStudentNameBtn - students can't change these
        const generateTestDataBtn = document.getElementById('generateTestDataBtn');
        if (generateTestDataBtn) {
            generateTestDataBtn.addEventListener('click', () => this.generateTestData());
        }
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
            teamCode: this.teamCode
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
            document.getElementById('coachTeamName').textContent = 'Team: No team code';
            return;
        }

        // Try Firebase first, fall back to local test data
        let studentsMap = new Map();
        
        if (this.db) {
            try {
                // Get team info
                const teamDoc = await this.db.collection('teams').doc(this.teamCode).get();
                if (teamDoc.exists) {
                    const teamData = teamDoc.data();
                    document.getElementById('coachTeamName').textContent = `Team: ${teamData.teamName || this.teamCode}`;
                } else {
                    document.getElementById('coachTeamName').textContent = `Team: ${this.teamCode}`;
                }

                // Get all runs for this team from Firebase
                const runsSnapshot = await this.db.collection('runs')
                    .where('teamCode', '==', this.teamCode)
                    .orderBy('date', 'desc')
                    .get();

                // Group runs by student
                runsSnapshot.forEach(doc => {
                    const run = doc.data();
                    const studentId = run.studentId || 'unknown';
                    
                    if (!studentsMap.has(studentId)) {
                        studentsMap.set(studentId, {
                            studentId: studentId,
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
                });
            } catch (error) {
                console.error('Error loading from Firebase:', error);
                // Fall through to local test data
            }
        }

        // If no Firebase data, try local test data
        if (studentsMap.size === 0) {
            studentsMap = this.loadLocalTestData();
            document.getElementById('coachTeamName').textContent = `Team: ${this.teamCode} (Test Mode)`;
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

    loadLocalTestData() {
        // Check if test data exists in localStorage
        const testDataKey = `xcountry_test_data_${this.teamCode}`;
        const storedTestData = localStorage.getItem(testDataKey);
        
        if (storedTestData) {
            try {
                const studentsMap = new Map();
                const testRuns = JSON.parse(storedTestData);
                
                testRuns.forEach(run => {
                    const studentId = run.studentId || 'unknown';
                    
                    if (!studentsMap.has(studentId)) {
                        studentsMap.set(studentId, {
                            studentId: studentId,
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
                });
                
                return studentsMap;
            } catch (error) {
                console.error('Error loading test data:', error);
            }
        }
        
        return new Map();
    }

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

        // Listen for new runs in real-time
        this.db.collection('runs')
            .where('teamCode', '==', this.teamCode)
            .orderBy('date', 'desc')
            .limit(1)
            .onSnapshot(() => {
                // Refresh dashboard when new runs are added
                this.renderCoachDashboard();
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
            modeDisplay.textContent = `Current Mode: ${this.mode === 'coach' ? 'Coach' : 'Student'}`;
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
                teamCodeDisplay.textContent = `Team Code: ${this.teamCode || 'Not set'}`;
            }
        } else {
            if (studentSettings) studentSettings.style.display = 'none';
            if (coachSettings) coachSettings.style.display = 'block';
            
            const coachTeamCode = document.getElementById('coachTeamCodeSettings');
            if (coachTeamCode) {
                coachTeamCode.textContent = `Team Code: ${this.teamCode || 'Not set'}`;
            }
        }

        modal.style.display = 'block';
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'none';
    }

    switchMode() {
        if (confirm('Switch mode? You will need to set up your team code again.')) {
            localStorage.removeItem('xcountryMode');
            localStorage.removeItem('xcountryTeamCode');
            this.closeSettings();
            location.reload();
        }
    }

    // Removed changeTeamCode() and changeStudentName() - students can't change these

    generateTestData() {
        if (!this.teamCode) {
            alert('Please create a team first.');
            return;
        }

        if (!confirm('This will generate sample test data for 5 students with various runs. Continue?')) {
            return;
        }

        const testRuns = [];
        const studentNames = ['Alex Johnson', 'Sam Martinez', 'Jordan Lee', 'Taylor Brown', 'Casey Davis'];
        const baseDate = new Date();
        
        // Generate runs for 5 students
        for (let i = 0; i < 5; i++) {
            const studentId = `test_student_${i + 1}`;
            const studentName = studentNames[i];
            
            // Each student gets 8-12 runs over the past 30 days
            const numRuns = 8 + Math.floor(Math.random() * 5);
            
            for (let j = 0; j < numRuns; j++) {
                // Random date within last 30 days
                const daysAgo = Math.floor(Math.random() * 30);
                const runDate = new Date(baseDate);
                runDate.setDate(runDate.getDate() - daysAgo);
                const dateStr = runDate.toISOString().split('T')[0];
                
                // Vary distances (2-5 miles)
                const distance = 2 + Math.random() * 3;
                
                // Vary times based on distance (faster students get better times)
                // Student 0 is fastest, student 4 is slowest
                const basePace = 7.5 + (i * 0.5); // 7:30 to 9:30 pace range
                const paceVariation = (Math.random() - 0.5) * 1.5; // ±45 seconds
                const pace = basePace + paceVariation;
                const timeInMinutes = distance * pace;
                
                const minutes = Math.floor(timeInMinutes);
                const seconds = Math.floor((timeInMinutes - minutes) * 60);
                const score = this.calculateScore(distance, timeInMinutes);
                
                testRuns.push({
                    id: Date.now() + (i * 1000) + j,
                    date: dateStr,
                    distance: parseFloat(distance.toFixed(2)),
                    timeInMinutes: parseFloat(timeInMinutes.toFixed(2)),
                    minutes: minutes,
                    seconds: seconds,
                    score: parseFloat(score.toFixed(1)),
                    pace: parseFloat(pace.toFixed(2)),
                    studentId: studentId,
                    studentName: studentName || 'Student',
                    teamCode: this.teamCode
                });
            }
        }

        // Sort by date (newest first)
        testRuns.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Store in localStorage
        const testDataKey = `xcountry_test_data_${this.teamCode}`;
        localStorage.setItem(testDataKey, JSON.stringify(testRuns));

        alert(`Generated ${testRuns.length} test runs for 5 students!`);
        
        // Refresh the dashboard
        this.renderCoachDashboard();
    }
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

