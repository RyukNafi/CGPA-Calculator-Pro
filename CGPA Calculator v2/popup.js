// ===== CONSTANTS & CONFIG =====
const CONFIG = {
    THEMES: ['light', 'dark', 'auto'],
    ENCRYPTION_KEY: 'cgpa-calculator-secret-2024'
};

const SELECTORS = {
    settingsBtn: '#settingsBtn',
    results: '#results',
    reloadBtn: '#reloadBtn',
    downloadBtn: '#downloadBtn',
    copyBtn: '#copyBtn',
    overallCGPA: '#overallCGPA',
    totalCredits: '#totalCredits',
    totalSemesters: '#totalSemesters',
    themeSelect: '#themeSelect',
    encryptionToggle: '#encryptionToggle',
    settingsModal: '#settingsModal'
};

// ===== STATE MANAGEMENT =====
let state = {
    semesterResults: null,
    overallCGPA: 0,
    totalCredits: 0,
    theme: 'auto',
    encryptionEnabled: false,
    settings: {}
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    await loadSettings();
    initializeTheme();
    initializeEventListeners();
    loadInitialData();
    initializeTabs();
}

// ===== THEME MANAGEMENT =====
function initializeTheme() {
    const savedTheme = state.theme;
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    const actualTheme = theme === 'auto' ? getSystemTheme() : theme;
    document.body.setAttribute('data-theme', actualTheme);
    state.theme = theme;
}

function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ===== SETTINGS MANAGEMENT =====
async function loadSettings() {
    const result = await chrome.storage.local.get(['settings']);
    state.settings = result.settings || {
        theme: 'auto',
        encryptionEnabled: false
    };
    state.theme = state.settings.theme;
    state.encryptionEnabled = state.settings.encryptionEnabled;
}

async function saveSettings() {
    state.settings = {
        theme: state.theme,
        encryptionEnabled: state.encryptionEnabled
    };
    await chrome.storage.local.set({ settings: state.settings });
    applyTheme(state.theme); // Re-apply theme after saving
}

// ===== DATA ENCRYPTION =====
function encryptData(data) {
    if (!state.encryptionEnabled) return data;
    
    try {
        const jsonString = JSON.stringify(data);
        let result = '';
        for (let i = 0; i < jsonString.length; i++) {
            result += String.fromCharCode(jsonString.charCodeAt(i) ^ CONFIG.ENCRYPTION_KEY.charCodeAt(i % CONFIG.ENCRYPTION_KEY.length));
        }
        return btoa(result);
    } catch (error) {
        console.error('Encryption failed:', error);
        return data;
    }
}

function decryptData(encryptedData) {
    if (!state.encryptionEnabled) return encryptedData;
    
    try {
        const decoded = atob(encryptedData);
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            result += String.fromCharCode(decoded.charCodeAt(i) ^ CONFIG.ENCRYPTION_KEY.charCodeAt(i % CONFIG.ENCRYPTION_KEY.length));
        }
        return JSON.parse(result);
    } catch (error) {
        console.error('Decryption failed:', error);
        return encryptedData;
    }
}

// ===== DATA MANAGEMENT =====
async function loadInitialData() {
    const result = await chrome.storage.local.get(['semesterResults']);
    
    if (result.semesterResults) {
        state.semesterResults = state.encryptionEnabled ? 
            decryptData(result.semesterResults) : result.semesterResults;
        updateDisplay();
    } else {
        showMessage('No data found. Please reload from results page.', 'error');
    }
}

function calculateOverallMetrics() {
    if (!state.semesterResults) return { cgpa: 0, credits: 0, semesters: 0 };
    
    let totalPoints = 0;
    let totalCredits = 0;
    let semesters = 0;
    
    Object.values(state.semesterResults).forEach(semester => {
        semester.courses.forEach(course => {
            totalPoints += course.credit * course.gradePoint;
            totalCredits += course.credit;
        });
        semesters++;
    });
    
    return {
        cgpa: totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00',
        credits: totalCredits,
        semesters: semesters
    };
}

// ===== DISPLAY UPDATES =====
function updateDisplay() {
    const metrics = calculateOverallMetrics();
    
    // Update overview cards
    document.querySelector(SELECTORS.overallCGPA).textContent = metrics.cgpa;
    document.querySelector(SELECTORS.totalCredits).textContent = metrics.credits;
    document.querySelector(SELECTORS.totalSemesters).textContent = metrics.semesters;
    
    // Update results tab
    updateResultsTab();
    
    // Update graph tab
    updateGraphTab();
    
    // Update summary tab
    updateSummaryTab();
}

function updateResultsTab() {
    const resultsDiv = document.querySelector(SELECTORS.results);
    resultsDiv.innerHTML = '';
    
    if (!state.semesterResults) return;
    
    // Find best and worst semesters for highlighting
    const semesterGPAs = Object.entries(state.semesterResults).map(([name, data]) => ({
        name,
        cgpa: parseFloat(data.cgpa)
    }));
    
    const bestSemester = [...semesterGPAs].sort((a, b) => b.cgpa - a.cgpa)[0];
    const worstSemester = [...semesterGPAs].sort((a, b) => a.cgpa - b.cgpa)[0];
    
    Object.entries(state.semesterResults).forEach(([semName, semData]) => {
        const semDiv = document.createElement('div');
        semDiv.className = 'semester';
        
        // Add highlighting for best/worst semesters
        if (semName === bestSemester.name) {
            semDiv.classList.add('highlight-best');
        } else if (semName === worstSemester.name) {
            semDiv.classList.add('highlight-worst');
        }
        
        semDiv.innerHTML = `
            <div class="semester-header">
                <div class="semester-title">${semName}</div>
                <div class="semester-cgpa">CGPA: ${semData.cgpa}</div>
            </div>
            <table class="course-table">
                <tr>
                    <th>Course</th>
                    <th>Credit</th>
                    <th>Grade</th>
                    <th>Point</th>
                </tr>
                ${semData.courses.map(course => `
                    <tr>
                        <td>${course.course}</td>
                        <td>${course.credit}</td>
                        <td>${course.gradeLetter}</td>
                        <td>${course.gradePoint}</td>
                    </tr>
                `).join('')}
            </table>
        `;
        
        resultsDiv.appendChild(semDiv);
    });
}

function updateGraphTab() {
    if (!state.semesterResults) return;
    
    const semesters = Object.keys(state.semesterResults);
    const gpas = semesters.map(sem => parseFloat(state.semesterResults[sem].cgpa));
    
    const ctx = document.getElementById('gpaChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.gpaChartInstance) {
        window.gpaChartInstance.destroy();
    }
    
    window.gpaChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: semesters,
            datasets: [{
                label: 'Semester GPA',
                data: gpas,
                borderColor: getComputedStyle(document.body).getPropertyValue('--accent-primary'),
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 4.0,
                    ticks: {
                        stepSize: 0.5
                    }
                }
            }
        }
    });
    
    // Update graph stats
    updateGraphStats(gpas);
}

function updateGraphStats(gpas) {
    const statsDiv = document.getElementById('graphStats');
    if (!gpas.length) return;
    
    const average = (gpas.reduce((a, b) => a + b, 0) / gpas.length).toFixed(2);
    const trend = gpas.length > 1 ? (gpas[gpas.length - 1] - gpas[0]).toFixed(2) : 0;
    
    statsDiv.innerHTML = `
        <div class="stat-item">
            <div>Average</div>
            <div class="stat-value">${average}</div>
        </div>
        <div class="stat-item">
            <div>Trend</div>
            <div class="stat-value" style="color: ${trend >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">
                ${trend >= 0 ? '+' : ''}${trend}
            </div>
        </div>
    `;
}

function updateSummaryTab() {
    updateCreditSummary();
    updatePerformanceHighlights();
}

function updateCreditSummary() {
    const summaryDiv = document.getElementById('creditSummary');
    if (!state.semesterResults) return;
    
    let html = '';
    Object.entries(state.semesterResults).forEach(([semName, semData]) => {
        const credits = semData.courses.reduce((sum, course) => sum + course.credit, 0);
        html += `
            <div class="summary-item">
                <span>${semName}</span>
                <span>${credits} credits</span>
            </div>
        `;
    });
    
    summaryDiv.innerHTML = html;
}

function updatePerformanceHighlights() {
    const highlightsDiv = document.getElementById('performanceHighlights');
    if (!state.semesterResults) return;
    
    const semesters = Object.entries(state.semesterResults);
    const bestSemester = [...semesters].sort((a, b) => parseFloat(b[1].cgpa) - parseFloat(a[1].cgpa))[0];
    const worstSemester = [...semesters].sort((a, b) => parseFloat(a[1].cgpa) - parseFloat(b[1].cgpa))[0];
    
    // Calculate trend
    const semesterGPAs = semesters.map(([_, data]) => parseFloat(data.cgpa));
    const trend = semesterGPAs.length > 1 ? semesterGPAs[semesterGPAs.length - 1] - semesterGPAs[0] : 0;
    
    highlightsDiv.innerHTML = `
        <div class="highlight-item">
            Best Performance: ${bestSemester[0]} (CGPA: ${bestSemester[1].cgpa})
        </div>
        <div class="highlight-item worst">
            Needs Improvement: ${worstSemester[0]} (CGPA: ${worstSemester[1].cgpa})
        </div>
        <div class="highlight-item ${trend >= 0 ? 'trend-up' : 'trend-down'}">
            Overall Trend: ${trend >= 0 ? 'Improving' : 'Declining'} (${trend >= 0 ? '+' : ''}${trend.toFixed(2)})
        </div>
    `;
}

// ===== EVENT HANDLERS =====
function initializeEventListeners() {
    // Settings modal
    document.querySelector(SELECTORS.settingsBtn).addEventListener('click', openSettings);
    document.querySelector('.close-modal').addEventListener('click', closeSettings);
    
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    // Main actions
    document.querySelector(SELECTORS.reloadBtn).addEventListener('click', reloadData);
    document.querySelector(SELECTORS.downloadBtn).addEventListener('click', downloadPDF);
    document.querySelector(SELECTORS.copyBtn).addEventListener('click', copySummary);
    
    // Projection calculator
    document.getElementById('calculateProjection').addEventListener('click', calculateProjection);
    
    // Settings form
    document.getElementById('themeSelect').addEventListener('change', updateThemeFromSelect);
    document.getElementById('encryptionToggle').addEventListener('change', updateEncryptionSetting);
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabName}-tab`);
    });
    
    // Refresh graph when switching to graph tab
    if (tabName === 'graph') {
        setTimeout(() => {
            if (window.gpaChartInstance) {
                window.gpaChartInstance.update();
            }
        }, 100);
    }
}

// ===== MAIN FEATURES =====
async function reloadData() {
    const reloadBtn = document.querySelector(SELECTORS.reloadBtn);
    const originalText = reloadBtn.textContent;
    
    reloadBtn.textContent = 'Reloading...';
    reloadBtn.disabled = true;
    
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        
        if (!currentTab.url.includes('result_published.php')) {
            showMessage('Please navigate to results page first.', 'error');
            return;
        }
        
        const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'reloadData' });
        
        if (response?.success) {
            const encryptedData = state.encryptionEnabled ? 
                encryptData(response.data.semesterResults) : response.data.semesterResults;
            
            await chrome.storage.local.set({ 
                semesterResults: encryptedData 
            });
            
            state.semesterResults = response.data.semesterResults;
            updateDisplay();
            showMessage('Data reloaded successfully!', 'success');
        }
    } catch (error) {
        showMessage('Failed to reload data.', 'error');
        console.error('Reload error:', error);
    } finally {
        reloadBtn.textContent = originalText;
        reloadBtn.disabled = false;
    }
}

function downloadPDF() {
    if (!window.jspdf) {
        showMessage('PDF library not loaded.', 'error');
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.text('CGPA Report', 20, 20);
        doc.text(`Overall CGPA: ${calculateOverallMetrics().cgpa}`, 20, 30);
        
        let y = 50;
        Object.entries(state.semesterResults).forEach(([semName, semData]) => {
            doc.text(`${semName}: CGPA ${semData.cgpa}`, 20, y);
            y += 10;
            
            semData.courses.forEach(course => {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`  ${course.course} - ${course.gradeLetter} (${course.gradePoint})`, 20, y);
                y += 7;
            });
            y += 5;
        });
        
        doc.save('cgpa_report.pdf');
        showMessage('PDF downloaded successfully!', 'success');
    } catch (error) {
        showMessage('PDF generation failed.', 'error');
        console.error('PDF error:', error);
    }
}

async function copySummary() {
    if (!state.semesterResults) return;
    
    const metrics = calculateOverallMetrics();
    let summary = `CGPA Summary\n`;
    summary += `Overall CGPA: ${metrics.cgpa}\n`;
    summary += `Total Credits: ${metrics.credits}\n`;
    summary += `Semesters: ${metrics.semesters}\n\n`;
    
    Object.entries(state.semesterResults).forEach(([semName, semData]) => {
        summary += `${semName}: CGPA ${semData.cgpa}\n`;
    });
    
    try {
        await navigator.clipboard.writeText(summary);
        showMessage('Summary copied to clipboard!', 'success');
    } catch (error) {
        showMessage('Failed to copy summary.', 'error');
    }
}

function calculateProjection() {
    if (!state.semesterResults) {
        showMessage('Load your data first.', 'error');
        return;
    }
    
    const targetCGPA = parseFloat(document.getElementById('targetCGPA').value);
    const remainingCredits = parseFloat(document.getElementById('remainingCredits').value);
    
    if (!targetCGPA || !remainingCredits) {
        showMessage('Please enter valid values.', 'error');
        return;
    }
    
    const currentMetrics = calculateOverallMetrics();
    const currentTotalPoints = parseFloat(currentMetrics.cgpa) * currentMetrics.credits;
    const requiredTotalPoints = targetCGPA * (currentMetrics.credits + remainingCredits);
    const requiredPoints = requiredTotalPoints - currentTotalPoints;
    const requiredGPA = requiredPoints / remainingCredits;
    
    const resultDiv = document.getElementById('projectionResult');
    const gradeNeeded = getGradeFromGPA(requiredGPA);
    
    resultDiv.innerHTML = `
        <p>To achieve <strong>${targetCGPA}</strong> CGPA:</p>
        <p>You need <strong>${requiredGPA.toFixed(2)}</strong> GPA in remaining ${remainingCredits} credits</p>
        <p>Average grade needed: <span class="projection-grade">${gradeNeeded}</span></p>
    `;
}

function getGradeFromGPA(gpa) {
    const gradeScale = [
        { min: 3.75, grade: 'A+' },
        { min: 3.5, grade: 'A' },
        { min: 3.25, grade: 'A-' },
        { min: 3.0, grade: 'B+' },
        { min: 2.75, grade: 'B' },
        { min: 2.5, grade: 'B-' },
        { min: 2.25, grade: 'C+' },
        { min: 2.0, grade: 'C' },
        { min: 0, grade: 'D' }
    ];
    
    return gradeScale.find(scale => gpa >= scale.min)?.grade || 'F';
}

// ===== SETTINGS MODAL =====
function openSettings() {
    document.getElementById(SELECTORS.settingsModal.slice(1)).style.display = 'block';
    document.getElementById('themeSelect').value = state.theme;
    document.getElementById('encryptionToggle').checked = state.encryptionEnabled;
}

function closeSettings() {
    document.getElementById(SELECTORS.settingsModal.slice(1)).style.display = 'none';
    saveSettings();
}

function updateThemeFromSelect() {
    const newTheme = document.getElementById('themeSelect').value;
    state.theme = newTheme;
}

function updateEncryptionSetting() {
    state.encryptionEnabled = document.getElementById('encryptionToggle').checked;
}

// ===== UTILITY FUNCTIONS =====
function showMessage(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

function initializeTabs() {
    // Initialize first tab as active
    switchTab('results');
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') {
        closeSettings();
    }
});

// System theme change listener
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (state.theme === 'auto') {
        applyTheme('auto');
    }
});