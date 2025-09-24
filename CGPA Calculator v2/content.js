// ===== CONSTANTS =====
const GRADE_MAP = {
  'A+': 4.0,
  'A': 3.75,
  'A-': 3.5,
  'B+': 3.25,
  'B': 3.0,
  'B-': 2.75,
  'C+': 2.5,
  'C': 2.25,
  'D': 2.0,
  'F': 0.0
};

// ===== MAIN FUNCTION =====
function initializeContentScript() {
  // Process grades automatically on page load
  const initialResults = processGrades();
  
  // Listen for reload requests from popup
  chrome.runtime.onMessage.addListener(handleMessage);
}

// ===== MESSAGE HANDLER =====
function handleMessage(request, sender, sendResponse) {
  if (request.action === 'reloadData') {
    const results = processGrades();
    sendResponse({ success: true, data: results });
    return true; // Indicates we wish to send a response asynchronously
  }
}

// ===== DATA PROCESSING =====
function processGrades() {
  const grades = extractGradesFromPage();
  const semesterResults = groupBySemester(grades);
  
  // Save to storage
  chrome.storage.local.set({ grades, semesterResults });
  
  return { grades, semesterResults };
}

function extractGradesFromPage() {
  const rows = document.querySelectorAll('table tbody tr');
  const data = [];
  
  rows.forEach((row) => {
    const cols = row.querySelectorAll('td');
    if (cols.length >= 6) {
      const courseData = parseCourseData(cols);
      if (isValidCourseData(courseData)) {
        data.push(courseData);
      }
    }
  });
  
  return data;
}

function parseCourseData(columns) {
  return {
    course: columns[0].innerText.trim(),
    credit: parseFloat(columns[1].innerText.trim()),
    levelTerm: columns[2].innerText.trim(),
    gradeLetter: columns[4].innerText.trim(),
    gradePoint: GRADE_MAP[columns[4].innerText.trim()]
  };
}

function isValidCourseData(courseData) {
  return !isNaN(courseData.credit) && 
         courseData.gradePoint !== undefined && 
         courseData.credit > 0;
}

function groupBySemester(data) {
  const semesters = {};
  
  data.forEach(item => {
    if (!semesters[item.levelTerm]) {
      semesters[item.levelTerm] = [];
    }
    semesters[item.levelTerm].push(item);
  });
  
  const semesterResults = {};
  for (let sem in semesters) {
    semesterResults[sem] = {
      cgpa: calculateCGPA(semesters[sem]),
      courses: semesters[sem]
    };
  }
  
  return semesterResults;
}

function calculateCGPA(courses) {
  let totalPoints = 0;
  let totalCredits = 0;
  
  courses.forEach(course => {
    totalPoints += course.credit * course.gradePoint;
    totalCredits += course.credit;
  });
  
  return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : 'N/A';
}

// ===== INITIALIZATION =====
initializeContentScript();