// ===== CONSTANTS =====
const SELECTORS = {
  results: '#results',
  reloadBtn: '#reloadBtn',
  downloadBtn: '#downloadBtn'
};

const MESSAGES = {
  noData: 'No data found! Make sure you\'re on the results page and click "Reload Data".',
  loading: 'Loading...',
  reloading: 'Reloading...',
  reloaded: '✓ Reloaded',
  reloadFailed: 'Reload Failed',
  notOnResultsPage: 'Please navigate to the results page first.',
  pdfError: 'PDF generation failed. Please try again.'
};

// ===== DOM ELEMENTS =====
let elements = {};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
  cacheDOMElements();
  attachEventListeners();
  loadInitialResults();
}

function cacheDOMElements() {
  elements.results = document.querySelector(SELECTORS.results);
  elements.reloadBtn = document.querySelector(SELECTORS.reloadBtn);
  elements.downloadBtn = document.querySelector(SELECTORS.downloadBtn);
}

function attachEventListeners() {
  elements.reloadBtn.addEventListener('click', handleReloadData);
  elements.downloadBtn.addEventListener('click', handleDownloadPDF);
}

// ===== DATA LOADING =====
function loadInitialResults() {
  chrome.storage.local.get(['semesterResults'], (result) => {
    displayResults(result.semesterResults);
  });
}

function displayResults(semesterResults) {
  elements.results.innerHTML = '';

  if (!semesterResults || Object.keys(semesterResults).length === 0) {
    showMessage(MESSAGES.noData, 'error');
    return;
  }

  // Store semester data globally for PDF
  window.semesterResults = semesterResults;

  for (let sem in semesterResults) {
    elements.results.appendChild(createSemesterElement(sem, semesterResults[sem]));
  }
}

function createSemesterElement(semesterName, semesterData) {
  const semDiv = document.createElement('div');
  semDiv.className = 'semester';

  // Semester header
  const header = document.createElement('h3');
  header.textContent = `${semesterName}: CGPA ${semesterData.cgpa}`;
  semDiv.appendChild(header);

  // Course table
  semDiv.appendChild(createCourseTable(semesterData.courses));
  
  return semDiv;
}

function createCourseTable(courses) {
  const table = document.createElement('table');
  table.className = 'course-table';
  
  table.innerHTML = `
    <tr>
      <th>Course</th>
      <th>Credit</th>
      <th>Grade</th>
      <th>Point</th>
    </tr>
  `;

  courses.forEach(course => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${course.course}</td>
      <td>${course.credit}</td>
      <td>${course.gradeLetter}</td>
      <td>${course.gradePoint}</td>
    `;
    table.appendChild(row);
  });

  return table;
}

// ===== RELOAD FUNCTIONALITY =====
async function handleReloadData() {
  const originalText = elements.reloadBtn.textContent;
  
  setButtonState('loading', MESSAGES.reloading);
  
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    if (!isResultsPage(currentTab.url)) {
      showMessage(MESSAGES.notOnResultsPage, 'error');
      resetButtonState(originalText);
      return;
    }
    
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'reloadData' });
    
    if (response?.success) {
      await chrome.storage.local.set({
        grades: response.data.grades,
        semesterResults: response.data.semesterResults
      });
      
      displayResults(response.data.semesterResults);
      setButtonState('success', MESSAGES.reloaded);
      setTimeout(() => resetButtonState(originalText), 1000);
    } else {
      throw new Error('No response from content script');
    }
  } catch (error) {
    // Fallback to stored data
    loadInitialResults();
    setButtonState('error', MESSAGES.reloadFailed);
    setTimeout(() => resetButtonState(originalText), 1000);
  }
}

function setButtonState(state, text) {
  elements.reloadBtn.disabled = state === 'loading';
  elements.reloadBtn.textContent = text;
  
  // Remove all state classes
  elements.reloadBtn.classList.remove('loading', 'success', 'error');
  // Add current state class
  if (state !== 'loading') {
    elements.reloadBtn.classList.add(state);
  }
}

function resetButtonState(originalText) {
  elements.reloadBtn.disabled = false;
  elements.reloadBtn.textContent = originalText;
  elements.reloadBtn.classList.remove('success', 'error');
}

// ===== PDF DOWNLOAD =====
function handleDownloadPDF() {
  try {
    // Check if jsPDF is available
    if (typeof window.jspdf === 'undefined') {
      showMessage(MESSAGES.pdfError, 'error');
      console.error('jsPDF library not loaded');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPosition = 15;
    
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Semester-wise CGPA Report', 105, yPosition, { align: 'center' });
    yPosition += 15;
    
    if (!window.semesterResults || Object.keys(window.semesterResults).length === 0) {
      doc.text('No data available', 105, yPosition, { align: 'center' });
      doc.save('cgpa_report.pdf');
      return;
    }
    
    // Content
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    for (let sem in window.semesterResults) {
      const semesterData = window.semesterResults[sem];
      
      // Check if we need a new page
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 15;
      }
      
      // Semester header
      doc.setFont('helvetica', 'bold');
      doc.text(`${sem}: CGPA ${semesterData.cgpa}`, 14, yPosition);
      yPosition += 8;
      
      // Table headers
      doc.setFont('helvetica', 'bold');
      doc.text('Course', 14, yPosition);
      doc.text('Credit', 100, yPosition);
      doc.text('Grade', 130, yPosition);
      doc.text('Point', 160, yPosition);
      yPosition += 5;
      
      // Horizontal line
      doc.line(14, yPosition, 190, yPosition);
      yPosition += 6;
      
      // Course data
      doc.setFont('helvetica', 'normal');
      semesterData.courses.forEach(course => {
        // Check if we need a new page for this course
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 15;
          // Redraw headers on new page
          doc.setFont('helvetica', 'bold');
          doc.text('Course', 14, yPosition);
          doc.text('Credit', 100, yPosition);
          doc.text('Grade', 130, yPosition);
          doc.text('Point', 160, yPosition);
          yPosition += 5;
          doc.line(14, yPosition, 190, yPosition);
          yPosition += 6;
          doc.setFont('helvetica', 'normal');
        }
        
        // Split course name if too long
        const courseName = doc.splitTextToSize(course.course, 80);
        const courseHeight = courseName.length * 4;
        
        doc.text(courseName, 14, yPosition);
        doc.text(course.credit.toString(), 100, yPosition);
        doc.text(course.gradeLetter, 130, yPosition);
        doc.text(course.gradePoint.toString(), 160, yPosition);
        
        yPosition += Math.max(6, courseHeight);
      });
      
      yPosition += 10;
    }
    
    doc.save('cgpa_report.pdf');
    
  } catch (error) {
    console.error('PDF generation error:', error);
    showMessage(MESSAGES.pdfError, 'error');
  }
}

// ===== UTILITY FUNCTIONS =====
function isResultsPage(url) {
  return url.includes('result_published.php');
}

function showMessage(message, type = 'info') {
  elements.results.innerHTML = `<div class="message ${type}">${message}</div>`;
}