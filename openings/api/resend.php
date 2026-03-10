<?php
/**
 * CapitalSavvy - Resend Email Helper
 * Sends emails via the Resend API (https://resend.com/docs/api-reference/emails/send-email)
 */

/**
 * Returns ['ok' => true] on success or ['ok' => false, 'error' => 'HTTP 422: message'] on failure.
 */
function sendViaResend($to, $subject, $htmlBody) {
    global $RESEND_API_KEY, $FROM_EMAIL, $REPLY_TO_EMAIL;

    if ($RESEND_API_KEY === 'YOUR_RESEND_API_KEY_HERE') {
        error_log('[CapitalSavvy] Resend API key not configured. Email to ' . $to . ' not sent.');
        return ['ok' => false, 'error' => 'Resend API key not configured'];
    }

    $data = [
        'from'    => $FROM_EMAIL,
        'to'      => [$to],
        'subject' => $subject,
        'html'    => $htmlBody
    ];
    if (!empty($REPLY_TO_EMAIL)) {
        $data['reply_to'] = [$REPLY_TO_EMAIL];
    }

    return _resendPost('https://api.resend.com/emails', $data);
}

/**
 * Sends multiple emails in one request via the Resend batch API.
 * $messages = [['to'=>'...', 'subject'=>'...', 'html'=>'...'], ...]
 * Returns ['ok' => true] on success or ['ok' => false, 'error' => '...'] on failure.
 */
function sendBatchViaResend($messages) {
    global $RESEND_API_KEY, $FROM_EMAIL, $REPLY_TO_EMAIL;

    if ($RESEND_API_KEY === 'YOUR_RESEND_API_KEY_HERE') {
        return ['ok' => false, 'error' => 'Resend API key not configured'];
    }

    $batch = array_map(function ($m) use ($FROM_EMAIL, $REPLY_TO_EMAIL) {
        $item = [
            'from'    => $FROM_EMAIL,
            'to'      => [$m['to']],
            'subject' => $m['subject'],
            'html'    => $m['html']
        ];
        if (!empty($REPLY_TO_EMAIL)) {
            $item['reply_to'] = [$REPLY_TO_EMAIL];
        }
        return $item;
    }, $messages);

    return _resendPost('https://api.resend.com/emails/batch', $batch);
}

/** Internal: POST JSON to a Resend endpoint and return a result array. */
function _resendPost($url, $body) {
    global $RESEND_API_KEY, $CURL_CA_BUNDLE;

    $payload = json_encode($body);
    $ch      = curl_init($url);
    $opts    = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $RESEND_API_KEY,
            'Content-Type: application/json'
        ],
        CURLOPT_TIMEOUT        => 15
    ];
    // On Windows/WAMP, curl has no built-in CA bundle.
    if (!empty($CURL_CA_BUNDLE) && file_exists($CURL_CA_BUNDLE)) {
        // Explicit path set via CURL_CA_BUNDLE in .env
        $opts[CURLOPT_CAINFO] = $CURL_CA_BUNDLE;
    } elseif (PHP_OS_FAMILY === 'Windows') {
        // Auto-detect WAMP's bundled cacert.pem — no manual config needed
        $wampCerts = glob('C:/wamp64/bin/php/php*/extras/ssl/cacert.pem') ?: [];
        if (!empty($wampCerts)) {
            $opts[CURLOPT_CAINFO] = $wampCerts[0];
        }
    }
    curl_setopt_array($ch, $opts);

    $response  = curl_exec($ch);
    $curlErr   = curl_error($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curlErr) {
        error_log('[CapitalSavvy] Resend curl error: ' . $curlErr);
        return ['ok' => false, 'error' => 'Network error: ' . $curlErr];
    }

    if ($httpCode >= 200 && $httpCode < 300) {
        return ['ok' => true];
    }

    $decoded = json_decode($response, true);
    $msg     = $decoded['message'] ?? $response;
    $name    = isset($decoded['name']) ? ' [' . $decoded['name'] . ']' : '';
    $detail  = 'HTTP ' . $httpCode . $name . ': ' . $msg;
    error_log('[CapitalSavvy] Resend API error — ' . $detail);
    return ['ok' => false, 'error' => $detail];
}

/**
 * Branded email wrapper — tables + inline styles for broad email client support.
 * Logo sits on the white header (teal/gold logo on light bg as intended).
 */
function emailWrapper($contentHtml) {
    global $SITE_URL;
    $logo = $SITE_URL . '/img/logo-new.png';
    $year = date('Y');
    return '<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#EFF1F6;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EFF1F6" style="background-color:#EFF1F6;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

        <!-- Header: white bg so teal/gold logo reads correctly -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:24px 32px;border-radius:10px 10px 0 0;border-bottom:3px solid #B9915B;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">
                  <img src="' . $logo . '" alt="CapitalSavvy" width="44" height="44" style="display:block;width:44px;height:44px;">
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:700;color:#1E2540;letter-spacing:-0.3px;">CapitalSavvy</span><br>
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#1C6572;letter-spacing:2px;text-transform:uppercase;">CAREERS</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:32px 32px 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#3D4456;">
            ' . $contentHtml . '
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td bgcolor="#EFF1F6" style="background-color:#EFF1F6;padding:20px 32px;border-radius:0 0 10px 10px;border-top:1px solid #DDE2ED;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6B7B99;line-height:1.6;">
                  <span>CapitalSavvy Ltd &middot; Suite 2C Ecobank Plaza, Plot 4, Parliament Avenue &middot; Kampala, Uganda</span><br>
                  <span>&copy; ' . $year . ' CapitalSavvy Ltd. All Rights Reserved.</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>';
}

function sendConfirmationEmail($email, $name, $reference) {
    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeRef  = htmlspecialchars($reference, ENT_QUOTES, 'UTF-8');

    $body = '
<p style="margin:0 0 18px;">Dear <strong style="color:#1E2540;">' . $safeName . '</strong>,</p>
<p style="margin:0 0 18px;">Thank you for applying for the <strong>Frontend Developer</strong> position at CapitalSavvy. We have successfully received your application.</p>

<!-- Reference box -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 24px;">
  <tr>
    <td bgcolor="#FBF7F1" style="background-color:#FBF7F1;border-left:4px solid #B9915B;padding:16px 20px;">
      <p style="margin:0 0 5px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#9A7A47;text-transform:uppercase;letter-spacing:1.2px;">Your Reference Number</p>
      <p style="margin:0;font-family:\'Courier New\',Courier,monospace;font-size:22px;font-weight:700;color:#B9915B;letter-spacing:2px;">' . $safeRef . '</p>
    </td>
  </tr>
</table>

<p style="margin:0 0 18px;">Please save this reference number — quote it in any future correspondence with us.</p>

<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1E2540;">What Happens Next?</p>
<p style="margin:0 0 16px;">We aim to respond within <strong>5 business days</strong>. Our process has three stages:</p>

<!-- Steps -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
  <tr>
    <td width="32" valign="top" style="padding-top:2px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="24" height="24" align="center" bgcolor="#1C6572" style="background-color:#1C6572;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#ffffff;">1</td>
      </tr></table>
    </td>
    <td style="padding-left:10px;padding-bottom:12px;font-size:14px;color:#3D4456;"><strong>Application Review</strong> &mdash; We review your application, portfolio, and CV.</td>
  </tr>
  <tr>
    <td width="32" valign="top" style="padding-top:2px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="24" height="24" align="center" bgcolor="#1C6572" style="background-color:#1C6572;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#ffffff;">2</td>
      </tr></table>
    </td>
    <td style="padding-left:10px;padding-bottom:12px;font-size:14px;color:#3D4456;"><strong>Technical Assessment</strong> &mdash; A take-home challenge combining Figma design and React/Next.js development.</td>
  </tr>
  <tr>
    <td width="32" valign="top" style="padding-top:2px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="24" height="24" align="center" bgcolor="#1C6572" style="background-color:#1C6572;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#ffffff;">3</td>
      </tr></table>
    </td>
    <td style="padding-left:10px;padding-bottom:12px;font-size:14px;color:#3D4456;"><strong>Culture &amp; Values Conversation</strong> &mdash; A conversation with the team to assess mutual fit.</td>
  </tr>
</table>

<p style="margin:0 0 24px;font-size:14px;color:#3D4456;">Questions? Reply to this email or write to <a href="mailto:info@capitalsavvy.pro" style="color:#1C6572;text-decoration:none;font-weight:600;">info@capitalsavvy.pro</a>.</p>
<p style="margin:0;">Best regards,<br><strong style="color:#1E2540;">The CapitalSavvy Team</strong></p>';

    return sendViaResend($email, 'Application Received – CapitalSavvy Frontend Developer', emailWrapper($body));
}

function sendAdminNotification($applicantName, $applicantEmail, $reference) {
    global $ADMIN_EMAIL, $SITE_URL;

    $safeName  = htmlspecialchars($applicantName, ENT_QUOTES, 'UTF-8');
    $safeEmail = htmlspecialchars($applicantEmail, ENT_QUOTES, 'UTF-8');
    $safeRef   = htmlspecialchars($reference, ENT_QUOTES, 'UTF-8');
    $dashUrl   = $SITE_URL . '/openings/admin/';

    $body = '
<p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1E2540;">New Application Received</p>

<!-- Detail table -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;border-collapse:collapse;">
  <tr>
    <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#6B7B99;background-color:#F5F6FA;border-bottom:1px solid #E2E7F0;width:120px;">Name</td>
    <td style="padding:10px 16px;font-size:14px;color:#1E2540;background-color:#FAFBFD;border-bottom:1px solid #E2E7F0;">' . $safeName . '</td>
  </tr>
  <tr>
    <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#6B7B99;background-color:#F5F6FA;border-bottom:1px solid #E2E7F0;">Email</td>
    <td style="padding:10px 16px;font-size:14px;color:#1E2540;background-color:#FAFBFD;border-bottom:1px solid #E2E7F0;"><a href="mailto:' . $safeEmail . '" style="color:#1C6572;text-decoration:none;">' . $safeEmail . '</a></td>
  </tr>
  <tr>
    <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#6B7B99;background-color:#F5F6FA;">Reference</td>
    <td style="padding:10px 16px;font-family:\'Courier New\',Courier,monospace;font-size:14px;font-weight:700;color:#B9915B;background-color:#FAFBFD;">' . $safeRef . '</td>
  </tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#B9915B" style="background-color:#B9915B;border-radius:6px;">
      <a href="' . $dashUrl . '" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">View in Dashboard &rarr;</a>
    </td>
  </tr>
</table>';

    return sendViaResend($ADMIN_EMAIL, 'New Application: ' . $applicantName . ' [' . $reference . ']', emailWrapper($body));
}
