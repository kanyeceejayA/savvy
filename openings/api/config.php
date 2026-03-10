<?php
// CapitalSavvy Openings - Configuration & Database Setup

loadEnvFiles([
    __DIR__ . '/../.env',
    dirname(__DIR__, 2) . '/.env',
]);

// --- Configuration ---
$RESEND_API_KEY  = getenv('RESEND_API_KEY')   ?: 'YOUR_RESEND_API_KEY_HERE';
$ADMIN_EMAIL     = getenv('ADMIN_EMAIL')      ?: 'info@capitalsavvy.pro';
$FROM_EMAIL      = getenv('FROM_EMAIL')       ?: (getenv('ADMIN_EMAIL') ?: 'CapitalSavvy Careers <careers@capitalsavvy.pro>');
$REPLY_TO_EMAIL  = getenv('REPLY_TO_EMAIL')   ?: '';
$CURL_CA_BUNDLE  = getenv('CURL_CA_BUNDLE')   ?: '';
$SITE_URL = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

// Paths
$DB_PATH = getenv('OPENINGS_DB_PATH') ?: (__DIR__ . '/../db/applications.sqlite');
$UPLOAD_DIR = __DIR__ . '/../uploads/';

function loadEnvFiles($paths) {
    foreach ($paths as $path) {
        if (!is_readable($path)) {
            continue;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            continue;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
                continue;
            }
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            $value = trim($value, "\"'");
            if ($key !== '' && getenv($key) === false) {
                putenv($key . '=' . $value);
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
            }
        }
    }
}

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
        education_level TEXT NOT NULL,
        institution TEXT NOT NULL,
        field_of_study TEXT NOT NULL,
        field_other TEXT,
        graduation_year TEXT NOT NULL,
        expected_graduation TEXT,
        years_experience TEXT NOT NULL,
        employment_status TEXT NOT NULL,
        current_role TEXT,
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
        why_capitalsavvy TEXT NOT NULL,
        learn_new_tech TEXT NOT NULL,
        good_design TEXT,
        handle_feedback TEXT NOT NULL,
        future_fintech TEXT,
        hybrid_preference TEXT NOT NULL,
        start_date TEXT NOT NULL,
        salary_range TEXT NOT NULL,
        cv_path TEXT,
        cover_letter_path TEXT,
        design_portfolio_path TEXT,
        additional_samples_path TEXT,
        privacy_consent INTEGER NOT NULL DEFAULT 0,
        accuracy_declaration INTEGER NOT NULL DEFAULT 0,
        communication_consent INTEGER NOT NULL DEFAULT 0,
        assessment_consent INTEGER DEFAULT 0,
        internal_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS admin_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS application_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        draft_token TEXT UNIQUE NOT NULL,
        email TEXT,
        reference_hint TEXT,
        current_step INTEGER NOT NULL DEFAULT 1,
        draft_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS application_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        template TEXT NOT NULL DEFAULT 'custom',
        subject TEXT,
        personal_note TEXT,
        sent_by TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    ensureColumnExists($db, 'applications', 'updated_at', "ALTER TABLE applications ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    ensureColumnExists($db, 'admin_accounts', 'active', "ALTER TABLE admin_accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    ensureColumnExists($db, 'applications', 'position', "ALTER TABLE applications ADD COLUMN position TEXT NOT NULL DEFAULT 'Frontend Developer'");
    seedDefaultAdmin($db);
}

function ensureColumnExists($db, $table, $column, $alterSql) {
    $res = $db->query("PRAGMA table_info($table)");
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
        if (isset($row['name']) && $row['name'] === $column) {
            return;
        }
    }
    $db->exec($alterSql);
}

function seedDefaultAdmin($db) {
    $countRes = $db->querySingle("SELECT COUNT(*) FROM admin_accounts");
    if (intval($countRes) > 0) {
        return;
    }
    $stmt = $db->prepare("INSERT INTO admin_accounts (username, password_hash, email, role, active) VALUES (?, ?, ?, 'admin', 1)");
    $stmt->bindValue(1, 'admin', SQLITE3_TEXT);
    $stmt->bindValue(2, password_hash('Kampala2Masaka', PASSWORD_DEFAULT), SQLITE3_TEXT);
    $stmt->bindValue(3, $GLOBALS['ADMIN_EMAIL'], SQLITE3_TEXT);
    $stmt->execute();
}

// --- Helpers ---
function getAllowedStatuses() {
    return ['New', 'Reviewed', 'Stage 1', 'Stage 2', 'Stage 3', 'Offered', 'Rejected', 'Archived'];
}

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
    return htmlspecialchars(trim((string) $input), ENT_QUOTES, 'UTF-8');
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requireAdmin() {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    if (empty($_SESSION['admin_logged_in']) || empty($_SESSION['admin_user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}
