<?php
// CapitalSavvy Openings - Configuration & Database Setup

// --- Configuration ---
$RESEND_API_KEY = getenv('RESEND_API_KEY') ?: 'YOUR_RESEND_API_KEY_HERE';
$ADMIN_EMAIL = 'info@capitalsavvy.pro';
$FROM_EMAIL = 'CapitalSavvy Careers <careers@capitalsavvy.pro>';
$SITE_URL = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

// Admin credentials (change these!)
$ADMIN_USER = 'admin';
$ADMIN_PASS = '$2y$10$YourHashedPasswordHere'; // Use password_hash('your_password', PASSWORD_DEFAULT)

// Paths
$DB_PATH = __DIR__ . '/../db/applications.sqlite';
$UPLOAD_DIR = __DIR__ . '/../uploads/';

// --- Database ---
function getDB() {
    global $DB_PATH;
    $dir = dirname($DB_PATH);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $db = new SQLite3($DB_PATH);
    $db->busyTimeout(5000);
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA foreign_keys = ON');
    initDB($db);
    return $db;
}

function initDB($db) {
    $db->exec("CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_number TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'New',

        -- Step 1: Personal Information
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        country TEXT NOT NULL,
        city TEXT NOT NULL,
        gender TEXT,
        heard_about TEXT NOT NULL,
        referral_name TEXT,
        heard_other TEXT,

        -- Step 2: Education & Background
        education_level TEXT NOT NULL,
        institution TEXT NOT NULL,
        field_of_study TEXT NOT NULL,
        field_other TEXT,
        graduation_year TEXT NOT NULL,
        expected_graduation TEXT,
        years_experience TEXT NOT NULL,
        employment_status TEXT NOT NULL,
        current_role TEXT,

        -- Step 3: Technical Skills & Portfolio
        skill_figma TEXT,
        skill_react TEXT,
        skill_javascript TEXT,
        skill_html_css TEXT,
        skill_typescript TEXT,
        skill_nextjs TEXT,
        skill_tailwind TEXT,
        skill_git TEXT,
        skill_rest_api TEXT,
        skill_state_mgmt TEXT,
        github_url TEXT NOT NULL,
        figma_url TEXT,
        portfolio_url TEXT,
        linkedin_url TEXT,
        best_project_url TEXT,
        best_project_desc TEXT NOT NULL,

        -- Step 4: Motivation & Culture Fit
        why_capitalsavvy TEXT NOT NULL,
        learn_new_tech TEXT NOT NULL,
        good_design TEXT,
        handle_feedback TEXT NOT NULL,
        future_fintech TEXT,
        hybrid_preference TEXT NOT NULL,
        start_date TEXT NOT NULL,
        salary_range TEXT NOT NULL,

        -- Step 5: Uploads
        cv_path TEXT,
        cover_letter_path TEXT,
        design_portfolio_path TEXT,
        additional_samples_path TEXT,

        -- Step 6: Agreements
        privacy_consent INTEGER NOT NULL DEFAULT 0,
        accuracy_declaration INTEGER NOT NULL DEFAULT 0,
        communication_consent INTEGER NOT NULL DEFAULT 0,
        assessment_consent INTEGER DEFAULT 0,

        -- Meta
        internal_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
}

// --- Helpers ---
function generateReference() {
    $prefix = 'CS-FD';
    $date = date('ymd');
    $rand = strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));
    return "$prefix-$date-$rand";
}

function sanitize($input) {
    if (is_array($input)) {
        return array_map('sanitize', $input);
    }
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requireAdmin() {
    session_start();
    if (empty($_SESSION['admin_logged_in'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}
