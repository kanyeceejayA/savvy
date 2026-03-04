<?php
/**
 * CapitalSavvy - Admin API
 */
session_start();
require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/resend.php';

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
        getDB();
        jsonResponse(['logged_in' => !empty($_SESSION['admin_logged_in'])]);
        break;
    case 'stats':
        requireAdminSession();
        getStats();
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
    case 'bulk_update_status':
        requireAdminSession();
        bulkUpdateStatus();
        break;
    case 'add_note':
        requireAdminSession();
        addNote();
        break;
    case 'preview':
        requireAdminSession();
        previewFile();
        break;
    case 'download':
        requireAdminSession();
        downloadFile();
        break;
    case 'bulk_email':
        requireAdminSession();
        bulkEmail();
        break;
    case 'accounts_list':
        requireAdminSession();
        listAccounts();
        break;
    case 'accounts_create':
        requireAdminSession();
        createAccount();
        break;
    case 'change_password':
        requireAdminSession();
        changePassword();
        break;
    case 'export':
        requireAdminSession();
        exportCSV();
        break;
    case 'roles':
        requireAdminSession();
        getRoles();
        break;
    case 'role_stats':
        requireAdminSession();
        getRoleStats();
        break;
    case 'delete':
        requireAdminSession();
        deleteApplication();
        break;
    case 'email_log':
        requireAdminSession();
        getEmailLog();
        break;
    default:
        jsonResponse(['error' => 'Unknown action'], 400);
}

function requireAdminSession() {
    if (empty($_SESSION['admin_logged_in']) || empty($_SESSION['admin_user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}

function handleLogin() {
    $db = getDB();
    $user = trim($_POST['username'] ?? '');
    $pass = $_POST['password'] ?? '';
    if ($user === '' || $pass === '') {
        jsonResponse(['error' => 'Username and password are required'], 400);
    }

    $stmt = $db->prepare("SELECT id, username, password_hash, role, active FROM admin_accounts WHERE username = ? LIMIT 1");
    $stmt->bindValue(1, $user, SQLITE3_TEXT);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$row || intval($row['active']) !== 1 || !password_verify($pass, $row['password_hash'])) {
        jsonResponse(['error' => 'Invalid credentials'], 401);
    }

    session_regenerate_id(true);
    $_SESSION['admin_logged_in'] = true;
    $_SESSION['admin_user_id'] = intval($row['id']);
    $_SESSION['admin_username'] = $row['username'];
    $_SESSION['admin_role'] = $row['role'];

    jsonResponse([
        'success' => true,
        'username' => $row['username'],
        'role' => $row['role']
    ]);
}

function getStats() {
    $db = getDB();
    $position     = trim($_GET['position'] ?? '');
    $showArchived = intval($_GET['show_archived'] ?? 0);
    $statuses     = getAllowedStatuses();

    $posWhere = '';
    $posParam = null;
    if ($position && $position !== 'All') {
        $posWhere = ' AND COALESCE(position,\'Frontend Developer\') = ?';
        $posParam = $position;
    }
    $archWhere = $showArchived ? '' : " AND status != 'Archived'";

    // "All" count
    $stmt = $db->prepare("SELECT COUNT(*) FROM applications WHERE 1=1" . $posWhere . $archWhere);
    if ($posParam) $stmt->bindValue(1, $posParam, SQLITE3_TEXT);
    $counts = ['All' => intval($stmt->execute()->fetchArray(SQLITE3_NUM)[0] ?? 0)];

    // Per-status counts
    foreach ($statuses as $status) {
        if ($status === 'Archived' && !$showArchived) continue;
        $stmt = $db->prepare("SELECT COUNT(*) FROM applications WHERE status = ?" . $posWhere);
        $stmt->bindValue(1, $status, SQLITE3_TEXT);
        if ($posParam) $stmt->bindValue(2, $posParam, SQLITE3_TEXT);
        $counts[$status] = intval($stmt->execute()->fetchArray(SQLITE3_NUM)[0] ?? 0);
    }
    jsonResponse(['counts' => $counts]);
}

function listApplications() {
    $db = getDB();
    $status       = trim($_GET['status'] ?? '');
    $search       = trim($_GET['search'] ?? '');
    $position     = trim($_GET['position'] ?? '');
    $sort_by      = trim($_GET['sort_by'] ?? 'created_at');
    $sort_dir     = strtoupper(trim($_GET['sort_dir'] ?? 'DESC'));
    $showArchived = intval($_GET['show_archived'] ?? 0);
    $page         = max(1, intval($_GET['page'] ?? 1));
    $limit        = 25;
    $offset       = ($page - 1) * $limit;

    $allowed_sorts = ['created_at', 'first_name', 'last_name', 'status', 'years_experience', 'salary_range', 'updated_at'];
    if (!in_array($sort_by, $allowed_sorts)) $sort_by = 'created_at';
    if ($sort_dir !== 'ASC') $sort_dir = 'DESC';

    $where = [];
    $params = [];

    if (!$showArchived) {
        $where[] = "status != 'Archived'";
    }
    if ($status && $status !== 'All') {
        $where[] = "status = ?";
        $params[] = $status;
    }
    if ($position && $position !== 'All') {
        $where[] = "COALESCE(position, 'Frontend Developer') = ?";
        $params[] = $position;
    }
    if ($search) {
        $where[] = "(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR reference_number LIKE ?)";
        $sp = '%' . $search . '%';
        $params = array_merge($params, [$sp, $sp, $sp, $sp]);
    }
    $whereStr = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';
    $orderStr = ' ORDER BY ' . $sort_by . ' ' . $sort_dir;

    $countStmt = $db->prepare("SELECT COUNT(*) FROM applications" . $whereStr);
    foreach ($params as $i => $p) {
        $countStmt->bindValue($i + 1, $p, SQLITE3_TEXT);
    }
    $total = intval($countStmt->execute()->fetchArray(SQLITE3_NUM)[0] ?? 0);

    $sql = "SELECT id, reference_number, first_name, last_name, email, phone, status, created_at,
                   education_level, years_experience, salary_range, heard_about, updated_at,
                   github_url, portfolio_url, linkedin_url,
                   COALESCE(position, 'Frontend Developer') as position
            FROM applications" . $whereStr . $orderStr . " LIMIT ? OFFSET ?";
    $stmt = $db->prepare($sql);
    $idx = 1;
    foreach ($params as $p) {
        $stmt->bindValue($idx++, $p, SQLITE3_TEXT);
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
        'pages' => max(1, ceil($total / $limit))
    ]);
}

function getRoles() {
    $db = getDB();
    $res = $db->query("SELECT DISTINCT COALESCE(position, 'Frontend Developer') as p FROM applications ORDER BY p ASC");
    $roles = [];
    while ($row = $res->fetchArray(SQLITE3_NUM)) {
        if ($row[0] !== '') $roles[] = $row[0];
    }
    jsonResponse(['roles' => $roles]);
}

function getRoleStats() {
    $db = getDB();
    $res = $db->query("
        SELECT COALESCE(position, 'Frontend Developer') as pos, status, COUNT(*) as cnt
        FROM applications
        GROUP BY pos, status
        ORDER BY pos, status
    ");
    $map = [];
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
        $pos = $row['pos'];
        if (!isset($map[$pos])) {
            $map[$pos] = ['name' => $pos, 'total' => 0, 'active' => 0,
                          'new' => 0, 'stages' => 0, 'offered' => 0, 'rejected' => 0, 'archived' => 0];
        }
        $cnt = intval($row['cnt']);
        $st  = $row['status'];
        $map[$pos]['total'] += $cnt;
        switch ($st) {
            case 'New':      $map[$pos]['new'] = $cnt;    $map[$pos]['active'] += $cnt; break;
            case 'Reviewed': case 'Stage 1': case 'Stage 2': case 'Stage 3':
                             $map[$pos]['stages'] += $cnt; $map[$pos]['active'] += $cnt; break;
            case 'Offered':  $map[$pos]['offered'] = $cnt; $map[$pos]['active'] += $cnt; break;
            case 'Rejected': $map[$pos]['rejected'] = $cnt; break;
            case 'Archived': $map[$pos]['archived'] = $cnt; break;
        }
    }
    jsonResponse(['roles' => array_values($map)]);
}

function getApplication() {
    $db = getDB();
    $id = intval($_GET['id'] ?? 0);
    if (!$id) {
        jsonResponse(['error' => 'Missing ID'], 400);
    }

    $stmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$row) {
        jsonResponse(['error' => 'Not found'], 404);
    }
    jsonResponse(['application' => $row]);
}

function updateStatus() {
    $db = getDB();
    $id = intval($_POST['id'] ?? 0);
    $status = sanitize($_POST['status'] ?? '');
    $allowed = getAllowedStatuses();
    if (!$id || !in_array($status, $allowed, true)) {
        jsonResponse(['error' => 'Invalid parameters'], 400);
    }

    $stmt = $db->prepare("UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $stmt->bindValue(1, $status, SQLITE3_TEXT);
    $stmt->bindValue(2, $id, SQLITE3_INTEGER);
    $stmt->execute();

    jsonResponse(['success' => true]);
}

function bulkUpdateStatus() {
    $db = getDB();
    $idsRaw = $_POST['ids'] ?? '[]';
    $status = sanitize($_POST['status'] ?? '');
    $allowed = getAllowedStatuses();
    $ids = json_decode($idsRaw, true);
    if (!is_array($ids) || empty($ids) || !in_array($status, $allowed, true)) {
        jsonResponse(['error' => 'Invalid parameters'], 400);
    }
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (empty($ids)) {
        jsonResponse(['error' => 'No valid IDs provided'], 400);
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare("UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN ($placeholders)");
    $stmt->bindValue(1, $status, SQLITE3_TEXT);
    foreach ($ids as $i => $id) {
        $stmt->bindValue($i + 2, $id, SQLITE3_INTEGER);
    }
    $stmt->execute();
    jsonResponse(['success' => true, 'updated' => count($ids)]);
}

function addNote() {
    $db = getDB();
    $id = intval($_POST['id'] ?? 0);
    $note = sanitize($_POST['note'] ?? '');
    if (!$id) {
        jsonResponse(['error' => 'Missing ID'], 400);
    }
    if ($note === '') {
        jsonResponse(['error' => 'Note is empty'], 400);
    }

    $stmt = $db->prepare("SELECT internal_notes FROM applications WHERE id = ?");
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $existing = $stmt->execute()->fetchArray(SQLITE3_ASSOC)['internal_notes'] ?? '';

    $timestamp = date('Y-m-d H:i');
    $author = $_SESSION['admin_username'] ?? 'admin';
    $newNotes = $existing ? ($existing . "\n\n[" . $timestamp . ' ' . $author . '] ' . $note) : ('[' . $timestamp . ' ' . $author . '] ' . $note);

    $update = $db->prepare("UPDATE applications SET internal_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $update->bindValue(1, $newNotes, SQLITE3_TEXT);
    $update->bindValue(2, $id, SQLITE3_INTEGER);
    $update->execute();

    jsonResponse(['success' => true, 'notes' => $newNotes]);
}

function resolveUploadPath($relativePath) {
    global $UPLOAD_DIR;
    if (!$relativePath || strpos($relativePath, '..') !== false || strpos($relativePath, "\0") !== false) {
        return null;
    }
    $base = realpath($UPLOAD_DIR);
    if ($base === false) {
        return null;
    }
    $candidate = realpath($UPLOAD_DIR . $relativePath);
    if ($candidate === false || strpos($candidate, $base) !== 0 || !is_file($candidate)) {
        return null;
    }
    return $candidate;
}

function previewFile() {
    $relativePath = $_GET['path'] ?? '';
    $fullPath = resolveUploadPath($relativePath);
    if (!$fullPath) {
        jsonResponse(['error' => 'File not found'], 404);
    }

    $mime = mime_content_type($fullPath) ?: 'application/octet-stream';
    $allowedPreview = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!in_array($mime, $allowedPreview, true)) {
        jsonResponse(['error' => 'Preview not supported for this file type'], 400);
    }

    header('Content-Type: ' . $mime);
    header('Content-Disposition: inline; filename="' . basename($fullPath) . '"');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($fullPath));
    readfile($fullPath);
    exit;
}

function downloadFile() {
    $relativePath = $_GET['path'] ?? '';
    $fullPath = resolveUploadPath($relativePath);
    if (!$fullPath) {
        jsonResponse(['error' => 'File not found'], 404);
    }

    $filename = basename($fullPath);
    $mime = mime_content_type($fullPath) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($fullPath));
    readfile($fullPath);
    exit;
}

function bulkEmail() {
    $db = getDB();
    $ids = json_decode($_POST['ids'] ?? '[]', true);
    $template = trim($_POST['template'] ?? 'next_stage');
    $customSubject = trim($_POST['subject'] ?? '');
    $customBody = trim($_POST['body'] ?? '');
    $personalNote = trim($_POST['personal_note'] ?? '');

    if (!is_array($ids) || empty($ids)) {
        jsonResponse(['error' => 'No recipients selected'], 400);
    }
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (empty($ids)) {
        jsonResponse(['error' => 'No valid recipients selected'], 400);
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare("SELECT id, first_name, last_name, email, status, reference_number FROM applications WHERE id IN ($placeholders)");
    foreach ($ids as $i => $id) {
        $stmt->bindValue($i + 1, $id, SQLITE3_INTEGER);
    }
    $results = $stmt->execute();

    $sentBy = $_SESSION['admin_username'] ?? 'admin';
    $sent = 0;
    $failed = [];
    while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
        $emailData = buildEmailTemplate($template, $row, $customSubject, $customBody, $personalNote);
        if (sendViaResend($row['email'], $emailData['subject'], $emailData['html'])) {
            $sent++;
            $log = $db->prepare("INSERT INTO application_emails (application_id, template, subject, personal_note, sent_by) VALUES (?, ?, ?, ?, ?)");
            $log->bindValue(1, intval($row['id']), SQLITE3_INTEGER);
            $log->bindValue(2, $template, SQLITE3_TEXT);
            $log->bindValue(3, $emailData['subject'], SQLITE3_TEXT);
            $log->bindValue(4, $personalNote, SQLITE3_TEXT);
            $log->bindValue(5, $sentBy, SQLITE3_TEXT);
            $log->execute();
        } else {
            $failed[] = $row['email'];
        }
    }

    jsonResponse([
        'success' => true,
        'sent' => $sent,
        'failed' => $failed
    ]);
}

function getEmailLog() {
    $db = getDB();
    $id = intval($_GET['id'] ?? 0);
    if (!$id) jsonResponse(['error' => 'Missing ID'], 400);
    $stmt = $db->prepare("SELECT template, subject, personal_note, sent_by, sent_at FROM application_emails WHERE application_id = ? ORDER BY sent_at DESC");
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $res = $stmt->execute();
    $logs = [];
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) $logs[] = $row;
    jsonResponse(['logs' => $logs]);
}

function buildEmailTemplate($template, $app, $customSubject, $customBody, $personalNote = '') {
    $name = trim(($app['first_name'] ?? '') . ' ' . ($app['last_name'] ?? ''));
    $ref = $app['reference_number'] ?? '';

    $noteHtml = ($personalNote !== '') ? '<p>' . nl2br(htmlspecialchars($personalNote, ENT_QUOTES, 'UTF-8')) . '</p>' : '';

    if ($template === 'custom') {
        $subject = $customSubject !== '' ? $customSubject : 'Update on your CapitalSavvy application';
        $safe = nl2br(htmlspecialchars($customBody !== '' ? $customBody : 'Thank you for applying to CapitalSavvy.', ENT_QUOTES, 'UTF-8'));
        $html = '<p>Dear ' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . ',</p><p>' . $safe . '</p>' . $noteHtml . '<p>Reference: <strong>' . htmlspecialchars($ref, ENT_QUOTES, 'UTF-8') . '</strong></p><p>Regards,<br>CapitalSavvy Team</p>';
        return ['subject' => $subject, 'html' => $html];
    }

    $templates = [
        'next_stage' => [
            'subject' => 'Next Step: CapitalSavvy Application (' . $ref . ')',
            'body' => 'We are pleased to invite you to the next stage of our process. We will be in touch with details shortly.'
        ],
        'on_hold' => [
            'subject' => 'Update: CapitalSavvy Application (' . $ref . ')',
            'body' => 'Your application is still under review. We appreciate your patience and continued interest in CapitalSavvy.'
        ],
        'rejection' => [
            'subject' => 'CapitalSavvy Application Outcome (' . $ref . ')',
            'body' => 'Thank you for the time and effort you put into your application. After careful consideration, we are not moving forward at this stage. We value your interest in CapitalSavvy and encourage you to apply in the future.'
        ]
    ];
    $selected = $templates[$template] ?? $templates['next_stage'];
    $html = '<p>Dear ' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . ',</p><p>' . htmlspecialchars($selected['body'], ENT_QUOTES, 'UTF-8') . '</p>' . $noteHtml . '<p>Reference: <strong>' . htmlspecialchars($ref, ENT_QUOTES, 'UTF-8') . '</strong></p><p>Regards,<br>CapitalSavvy Team</p>';
    return ['subject' => $selected['subject'], 'html' => $html];
}

function listAccounts() {
    $db = getDB();
    $res = $db->query("SELECT id, username, email, role, active, created_at, updated_at FROM admin_accounts ORDER BY created_at ASC");
    $accounts = [];
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
        $accounts[] = $row;
    }
    jsonResponse(['accounts' => $accounts, 'current_user_id' => intval($_SESSION['admin_user_id'])]);
}

function createAccount() {
    $db = getDB();
    $username = trim($_POST['username'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $role = trim($_POST['role'] ?? 'admin');

    if ($username === '' || strlen($username) < 3) {
        jsonResponse(['error' => 'Username must be at least 3 characters'], 400);
    }
    if ($password === '' || strlen($password) < 8) {
        jsonResponse(['error' => 'Password must be at least 8 characters'], 400);
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => 'Invalid email address'], 400);
    }
    if (!in_array($role, ['admin'], true)) {
        jsonResponse(['error' => 'Invalid role'], 400);
    }

    $stmt = $db->prepare("INSERT INTO admin_accounts (username, password_hash, email, role, active, updated_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)");
    $stmt->bindValue(1, $username, SQLITE3_TEXT);
    $stmt->bindValue(2, password_hash($password, PASSWORD_DEFAULT), SQLITE3_TEXT);
    $stmt->bindValue(3, $email, SQLITE3_TEXT);
    $stmt->bindValue(4, $role, SQLITE3_TEXT);
    $ok = @$stmt->execute();
    if (!$ok) {
        jsonResponse(['error' => 'Account creation failed. Username may already exist.'], 400);
    }
    jsonResponse(['success' => true]);
}

function changePassword() {
    $db = getDB();
    $current = $_POST['current_password'] ?? '';
    $next = $_POST['new_password'] ?? '';
    if ($current === '' || $next === '') {
        jsonResponse(['error' => 'Both current and new passwords are required'], 400);
    }
    if (strlen($next) < 8) {
        jsonResponse(['error' => 'New password must be at least 8 characters'], 400);
    }

    $userId = intval($_SESSION['admin_user_id']);
    $stmt = $db->prepare("SELECT password_hash FROM admin_accounts WHERE id = ?");
    $stmt->bindValue(1, $userId, SQLITE3_INTEGER);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$row || !password_verify($current, $row['password_hash'])) {
        jsonResponse(['error' => 'Current password is incorrect'], 401);
    }

    $up = $db->prepare("UPDATE admin_accounts SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $up->bindValue(1, password_hash($next, PASSWORD_DEFAULT), SQLITE3_TEXT);
    $up->bindValue(2, $userId, SQLITE3_INTEGER);
    $up->execute();

    jsonResponse(['success' => true]);
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
        $stmt->bindValue($i + 1, $p, SQLITE3_TEXT);
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
    if (!$id) {
        jsonResponse(['error' => 'Missing ID'], 400);
    }

    $stmt = $db->prepare("SELECT reference_number FROM applications WHERE id = ?");
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$row) {
        jsonResponse(['error' => 'Not found'], 404);
    }

    $dir = $UPLOAD_DIR . $row['reference_number'];
    if (is_dir($dir)) {
        $files = glob($dir . '/*');
        foreach ($files as $f) {
            if (is_file($f)) {
                unlink($f);
            }
        }
        rmdir($dir);
    }

    $del = $db->prepare("DELETE FROM applications WHERE id = ?");
    $del->bindValue(1, $id, SQLITE3_INTEGER);
    $del->execute();

    jsonResponse(['success' => true]);
}
