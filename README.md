# Peer Evaluation System

## Overview
Complete peer evaluation system with professor dashboard and evaluation status monitoring. Professors can login, view student rosters, and track peer evaluation submissions and feedback analytics.

## Pages

### Login (`login.html`)
- Users authenticate with email and password
- Professors redirected to `pDash.html` (Professor Dashboard)
- Students redirected to `index.html` (Student Evaluation Form)

### Professor Dashboard (`pDash.html`)
- Four action cards: Import Roster, Edit Groups, Create Schedule, Evaluation Status
- Overview statistics: Total Students, Active Evaluations, Completion Rate
- Accessible only to authenticated professors

### Evaluation Status (`evaluation-status.html`) ⭐ NEW
- Professional dashboard showing peer evaluation analytics
- **Student Roster**: Click any student to view their evaluation details
- **Overview Stats**: Total evaluations submitted, groups with data, average scores
- **Peer Feedback Table**: Shows all feedback comments by criterion
- **Average Score Chart**: Bar chart of average scores by rubric criterion
- **Pending Evaluations Table**: Students awaiting evaluations
- **Group Status Chart**: Submitted vs pending evaluations by group

### Student Evaluation Form (`index.html`)
- Rubric-based peer evaluation form
- Evaluates teamwork, communication, technical skills, leadership
- Submits data to Supabase

## Features

### Authentication
- Custom password-based authentication via Supabase
- Role-based redirects (professor → pDash, student → evaluation form)
- Stores user session in localStorage

### Data Visualization
- Chart.js integration for interactive charts
- Real-time data fetching from Supabase
- Responsive design for all screen sizes

### Database
- Supabase backend with the following tables:
  - `student`: Student records
  - `professor`: Professor records
  - `enrollment`: Course enrollments
  - `course`: Course information
  - `grouptable`: Student groups
  - `evaluationschedule`: Evaluation timelines
  - `peerevaluation`: Evaluation records
  - `rubricscore`: Individual rubric scores
  - `learningoutcome`: Evaluation criteria

## Getting Started

### Setup
1. Open `login.html` in your browser
2. Log in with a professor account (email/password)
3. You'll be redirected to `pDash.html`
4. Click "Evaluation Status" to view analytics

### Test Data
To test the evaluation status page, ensure you have:
- At least one student in the database
- At least one peer evaluation with rubric scores
- Course and group assignments

### Running Locally
```bash
python3 -m http.server 8080
# Open http://localhost:8080/login.html
```

## SMU Branding
- Color scheme: Navy (#0e1b63) and Blue (#4c69b7)
- Logo integrated in header
- Professional gradient styling

## URL Parameters (Student Evaluation Form)
Pass student names and IDs:
```
index.html?from=Alex%20Tan&to=Priya%20Shah&evaluatorStudentId=1&evaluateeStudentId=2&scheduleId=1
```
