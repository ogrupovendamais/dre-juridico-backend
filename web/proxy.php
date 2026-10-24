<?php
/**
 * DRE Jurídico Scientist — Proxy Transparente Hostinger (PHP 8.x / LiteSpeed)
 * Permite que a hospedagem compartilhada da Hostinger se comunique com o Backend FastAPI.
 */

// URL do Backend FastAPI centralizado (Render, Railway, Fly.io ou VPS)
$BACKEND_BASE = getenv('DRE_BACKEND_URL') ?: 'https://dre-juridico-backend.onrender.com';

// Verifica se a URL do backend ainda é o marcador de exemplo
if (empty($BACKEND_BASE) || strpos($BACKEND_BASE, 'SEU-BACKEND-API.com') !== false) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'detail' => 'Backend da API ainda não vinculado. Edite a linha 8 do proxy.php na Hostinger com o endereço do seu servidor FastAPI.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Captura a rota solicitada e preserva query string
$endpoint = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';
$query_params = $_GET;
unset($query_params['endpoint']);
$qs = http_build_query($query_params);
$target_url = rtrim($BACKEND_BASE, '/') . '/api/' . ltrim($endpoint, '/') . ($qs !== '' ? ('?' . $qs) : '');

// Captura o método HTTP e corpo da requisição
$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');

// Prepara cabeçalhos para repassar ao FastAPI
$headers = [];
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    // Ignora headers que o cURL reconstrói ou que causam duplo gzip
    if (in_array($lower, ['host', 'content-length', 'accept-encoding'])) continue;
    $headers[] = "$name: $value";
}

// Inicializa cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target_url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_ENCODING, ''); // Decomprime automaticamente qualquer gzip retornado pelo Render
curl_setopt($ch, CURLOPT_TIMEOUT, 12);

// Repassa o corpo se existir
if (!empty($body)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

// Executa a requisição ao backend
$response = curl_exec($ch);
$error = curl_error($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['detail' => 'Falha de comunicação com o servidor backend: ' . $error], JSON_UNESCAPED_UNICODE);
    exit;
}

// Define código HTTP e tipo de conteúdo
http_response_code($http_code);
if ($content_type) {
    header('Content-Type: ' . $content_type);
} else {
    header('Content-Type: application/json; charset=utf-8');
}

// Retorna o corpo da resposta descomprimido
echo $response;
