<?php
// Синхронизация картотеки «Речевые карты» (личный кабинет: почта + пароль).
// Данные хранятся вне public_html, в соседней папке ../data.
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }
if ($_SERVER["REQUEST_METHOD"] !== "POST") { http_response_code(405); exit; }

// Данные хранятся вне public_html: public_html/api -> ../../data
$root = dirname(dirname(__DIR__));
$dataDir = $root . "/data";
if (!is_dir($dataDir)) { @mkdir($dataDir, 0750, true); }

$in = json_decode((string)file_get_contents("php://input"), true);
if (!is_array($in)) { $in = array(); }
$action = (string)(isset($in["action"]) ? $in["action"] : "");
$email = strtolower(trim((string)(isset($in["email"]) ? $in["email"] : "")));
$password = (string)(isset($in["password"]) ? $in["password"] : "");
$token = (string)(isset($in["token"]) ? $in["token"] : "");

function out($arr) { echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }
function loadJson($file, $fallback) {
  if (!is_file($file)) { return $fallback; }
  $j = json_decode((string)file_get_contents($file), true);
  return is_array($j) ? $j : $fallback;
}
function saveJson($file, $value) {
  file_put_contents($file, json_encode($value, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

$accountsFile = $dataDir . "/accounts.json";
$accounts = loadJson($accountsFile, array());
$slug = md5($email);
$dbFile = $dataDir . "/db-" . $slug . ".json";
$histDir = $dataDir . "/hist-" . $slug;

function account() {
  global $accounts, $email;
  return isset($accounts[$email]) ? $accounts[$email] : null;
}
function checkToken() {
  global $accounts, $email, $token;
  $a = account();
  return $a && in_array($token, isset($a["tokens"]) ? $a["tokens"] : array(), true);
}
function issueToken() {
  global $accounts, $accountsFile, $email;
  $t = bin2hex(random_bytes(24));
  $accounts[$email]["tokens"][] = $t;
  if (count($accounts[$email]["tokens"]) > 8) {
    $accounts[$email]["tokens"] = array_slice($accounts[$email]["tokens"], -8);
  }
  saveJson($accountsFile, $accounts);
  return $t;
}

if ($action === "register") {
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { out(array("ok" => false, "error" => "bademail")); }
  if (strlen($password) < 6) { out(array("ok" => false, "error" => "shortpass")); }
  if (isset($accounts[$email])) { out(array("ok" => false, "error" => "exists")); }
  $accounts[$email] = array(
    "hash" => password_hash($password, PASSWORD_DEFAULT),
    "tokens" => array(),
    "created" => time(),
  );
  $t = issueToken();
  out(array("ok" => true, "email" => $email, "token" => $t));
}

if ($action === "login") {
  $a = account();
  if (!$a || !password_verify($password, $a["hash"])) {
    usleep(1500000);
    out(array("ok" => false, "error" => "badlogin"));
  }
  $t = issueToken();
  out(array("ok" => true, "email" => $email, "token" => $t));
}

if ($action === "logout") {
  $a = account();
  if ($a) {
    $accounts[$email]["tokens"] = array_values(array_diff(isset($a["tokens"]) ? $a["tokens"] : array(), array($token)));
    saveJson($accountsFile, $accounts);
  }
  out(array("ok" => true));
}

if ($action === "whoami") {
  if (!checkToken()) { out(array("ok" => false, "error" => "badtoken")); }
  out(array("ok" => true, "email" => $email));
}

if ($action === "get") {
  if (!checkToken()) { out(array("ok" => false, "error" => "badtoken")); }
  if (!is_file($dbFile)) { out(array("ok" => true, "db" => null)); }
  $db = json_decode((string)file_get_contents($dbFile), true);
  out(array("ok" => true, "db" => $db));
}

if ($action === "save") {
  if (!checkToken()) { out(array("ok" => false, "error" => "badtoken")); }
  $db = isset($in["db"]) ? $in["db"] : null;
  if (!is_array($db) || !isset($db["children"]) || !is_array($db["children"])) {
    out(array("ok" => false, "error" => "baddata"));
  }
  if (strlen(json_encode($db)) > 8 * 1024 * 1024) {
    out(array("ok" => false, "error" => "toobig"));
  }
  $savedAt = isset($db["savedAt"]) && is_numeric($db["savedAt"]) ? (int)$db["savedAt"] : time();
  $db["savedAt"] = $savedAt;

  // Автобэкап: не чаще раза в 10 минут, 30 последних копий.
  if (is_file($dbFile)) {
    if (!is_dir($histDir)) { @mkdir($histDir, 0750, true); }
    $newest = 0;
    foreach ((array)glob($histDir . "/*.json") as $f) {
      $newest = max($newest, (int)basename($f, ".json"));
    }
    if (time() - $newest > 600) {
      copy($dbFile, $histDir . "/" . time() . ".json");
      $files = (array)glob($histDir . "/*.json");
      if (count($files) > 30) {
        sort($files);
        foreach (array_slice($files, 0, count($files) - 30) as $old) { @unlink($old); }
      }
    }
  }

  saveJson($dbFile, $db);
  out(array("ok" => true, "savedAt" => $savedAt));
}

out(array("ok" => false, "error" => "badaction"));
