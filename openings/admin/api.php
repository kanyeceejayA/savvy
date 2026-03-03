<?php
/**
 * CapitalSavvy - Admin API
 * Handles: login, list/filter applications, update status, add notes, download files, export CSV.
 */
session_start();
require_once __DIR__ . '/../api/config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'logout':
        $_SESSION = [];
        session_destroy();
        jsonResponse(['success' => true]);
        break;
    case 'check':
        // Ensure DB is initialized on first dashboard visit
        getDB();
        jsonResponse(['logged_in' => !empty($_SESSION['admin_logged_in'])]);
        break;
    case 'list':
        requireAdminSession();
        listApplications();
        break;
    case 'get':
        requireAdminSession();
        getApplication();
        break;
    case 'update_status':
        requireAdminSession();
        updateStatus();
        break;
    case 'add_note':
        requireAdminSession();
        addNote();
        break;
    case 'download':
        requireAdminSession();
        downloadFile();
        break;
    case 'export':
        requireAdminSession();
        exportCSV();
        break;
    case 'delete':
        requireAdminSession();
        deleteApplication();
        break;
    default:
        jsonResponse(['error' => 'Unknown action'], 400);
}

function requireAdminSession() {
    if (empty($_SESSION['admin_logged_in'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}

function handleLogin() {
    global $ADMIN_USER, $ADMIN_PASS;
    $user = $_POST['username'] ?? '';
    $pass = $_POST['password'] ?? '';

    // If password is not hashed yet (first run), do plain comparison
    if ($ADMIN_PASS === '$2y$10$YourHashedPasswordHere') {
        // Default not set — allow admin/admin for initial setup
        if ($user === 'admin' && $pass === 'admin') {
            $_SESSION['admin_logged_in'] = true;
            jsonResponse(['success' => true, 'message' => 'Warning: Change default admin credentials in config.php']);
            return;
        }
    } else {
        if ($user === $ADMIN_USER && password_verify($pass, $ADMIN_PASS)) {
            $_SESSION['admin_logged_in'] = true;
            jsonResponse(['success' => true]);
            return;
        }
    }

    jsonResponse(['error' => 'Invalid credentials'], 401);
}

function listApplications() {
    $db = getDB();
    $status = $_GET['status'] ?? '';
    $search = $_GET['search'] ?? '';
    $page = max(1, intval($_GET['page'] ?? 1));
    $limit = 25;
    $offset = ($page - 1) * $limit;

    $where = [];
    $params = [];

    if ($status && $status !== 'All') {
        $where[] = "status = ?";
        $params[] = $status;
    }
    if ($search) {
        $where[] = "(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR reference_number LIKE ?)";
        $searchParam = '%' . $search . '%';
        $params = array_merge($params, [$searchParam, $searchParam, $searchParam, $searchParam]);
    }

    $whereStr = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

    // Count
    $countStmt = $db->prepare("SELECT COUNT(*) as total FROM applications" . $whereStr);
    foreach ($params as $i => $p) {
        $countStmt->bindValue($i + 1, $p);
    }
    $total = $countStmt->execute()->fetchArray(SQLITE3_ASSOC)['total'];

    // Fetch
    $sql = "SELECT id, reference_number, first_name, last_name, email, phone, status, created_at,
                   education_level, years_experience, salary_range, heard_about
            FROM applications" . $whereStr . " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $stmt = $db->prepare($sql);
    $idx = 1;
    foreach ($params as $p) {
        $stmt->bindValue($idx++, $p);
    }
    $stmt->bindValue($idx++, $limit, SQLITE3_INTEGER);
    $stmt->bindValue($idx++, $offset, SQLITE3_INTEGER);

    $results = $stmt->execute();
    $apps = [];
    while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
        $apps[] = $row;
    }

    jsonResponse([
        'applications' => $apps,
        'total' => $total,
        'page' => $page,
        'pages' => ceil($total / $limit)
    ]);
}

function getApplication() {
    $db = getDB();
    $id = intval($_GET['id'] ?? 0);
    if (!$id) jsonResponse(['error' => 'Missing ID'], 400);

    $stmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);

    if (!$row) jsonResponse(['error' => 'Not found'], 404);

    jsonResponse(['application' => $row]);
}

function updateStatus() {
    $db = getDB();
    $id = intval($_POST['id'] ?? 0);
    $status = sanitize($_POST['status'] ?? '');
    $allowed = ['New', 'Reviewed', 'Stage 1', 'Stage 2', 'Stage 3', 'Offered', 'Rejected'];

    if (!$id || !in_array($status, $allowed)) {
        jsonResponse(['error' => 'Invalid parameters'], 400);
    }

    $stmt = $db->prepare("UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $stmt->bindValue(1, $status);
    $stmt->bindValue(2, $id, SQLITE3_INTEGER);
    $stmt->execute();

    jsonResponse(['success' => true]);
}

function addNote() {
    $db = getDB();
    $id = intval($_POST['id'] ?? 0);
    $note = sanitize($_POST['note'] ?? '');

    if (!$id) jsonResponse(['error' => 'Missing ID'], 400);

    // Append note with timestamp
    $stmt = $db->prepare("SELECT internal_notes FROM applications WHERE id = ?");
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $existing = $stmt->execute()->fetchArray(SQLITE3_ASSOC)['internal_notes'] ?? '';

    $timestamp = date('Y-m-d H:i');
    $newNotes = $existing ? $existing . "\n\n[" . $timestamp . "] " . $note : "[" . $timestamp . "] " . $note;

    $update = $db->prepare("UPDATE applications SET internal_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $update->bindValue(1, $newNotes);
    $update->bindValue(2, $id, SQLITE3_INTEGER);
    $update->execute();

    jsonResponse(['success' => true, 'notes' => $newNotes]);
}

function downloadFile() {
    global $UPLOAD_DIR;
    $path = $_GET['path'] ?? '';
    if (!$path || strpos($path, '..') !== false) {
        jsonResponse(['error' => 'Invalid path'], 400);
    }

    $fullPath = $UPLOAD_DIR . $path;
    if (!file_exists($fullPath)) {
        jsonResponse(['error' => 'File not found'], 404);
    }

    $filename = basename($fullPath);
    $mime = mime_content_type($fullPath);
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($fullPath));
    header_remove('X-Powered-By');
    readfile($fullPath);
    exit;
}

function exportCSV() {
    $db = getDB();
    $status = $_GET['status'] ?? '';

    $where = '';
    $params = [];
    if ($status && $status !== 'All') {
        $where = ' WHERE status = ?';
        $params[] = $status;
    }

    $stmt = $db->prepare("SELECT * FROM applications" . $where . " ORDER BY created_at DESC");
    foreach ($params as $i => $p) {
        $stmt->bindValue($i + 1, $p);
    }
    $results = $stmt->execute();

    $rows = [];
    while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
        $rows[] = $row;
    }

    if (empty($rows)) {
        jsonResponse(['error' => 'No data to export'], 404);
    }

    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="applications_export_' . date('Y-m-d') . '.csv"');

    $output = fopen('php://output', 'w');
    // Header row
    fputcsv($output, array_keys($rows[0]));
    foreach ($rows as $row) {
        fputcsv($output, $row);
    }
    fclose($output);
    exit;
}

function deleteApplication() {
    global $UPLOAD_DIR;
    $db = getDB();
    $id = intval($_POST['id'] ?? 0);
    if (!$id) jsonResponse(['error' => 'Missing ID'], 400);

    // Get reference for file cleanup
    $stmt = $db->prepare("SELECT reference_number FROM applications WHERE id = ?");
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$row) jsonResponse(['error' => 'Not found'], 404);

    // Delete files
    $dir = $UPLOAD_DIR . $row['reference_number'];
    if (is_dir($dir)) {
        $files = glob($dir . '/*');
        foreach ($files as $f) { if (is_file($f)) unlink($f); }
        rmdir($dir);
    }

    // Delete DB record
    $del = $db->prepare("DELETE FROM applications WHERE id = ?");
    $del->bindValue(1, $id, SQLITE3_INTEGER);
    $del->execute();

    jsonResponse(['success' => true]);
}
