<?php
/**
 * DRE Jurídico — Proxy Transparente Hostinger (PHP 8.x / LiteSpeed)
 * Permite que a hospedagem compartilhada da Hostinger se comunique com o Backend FastAPI,
 * com suporte completo a Single Sign-On (SSO) e Acesso Integrado de Administradores no Time Studio.
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
$incoming_headers = function_exists('getallheaders') ? getallheaders() : [];
$has_auth = false;
$auth_bearer_token = '';

foreach ($incoming_headers as $name => $value) {
    $lower = strtolower($name);
    if ($lower === 'authorization') {
        $has_auth = true;
        if (stripos($value, 'Bearer ') === 0) {
            $auth_bearer_token = trim(substr($value, 7));
        }
    }
    // Ignora headers que o cURL reconstrói ou que causam duplo gzip
    if (in_array($lower, ['host', 'content-length', 'accept-encoding'])) continue;
    $headers[] = "$name: $value";
}

// Fallback crítico caso o Apache/LiteSpeed retire o Authorization de getallheaders()
if (!$has_auth) {
    $env_auth = null;
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $env_auth = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $env_auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if ($env_auth) {
        $headers[] = "Authorization: $env_auth";
        if (stripos($env_auth, 'Bearer ') === 0) {
            $auth_bearer_token = trim(substr($env_auth, 7));
        }
    }
}

// Função auxiliar para fazer requisições internas ao backend FastAPI
function backend_curl($url, $method = 'GET', $post_data = null, $token = null) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_ENCODING, '');
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $h = ['Content-Type: application/json; charset=utf-8'];
    if ($token) {
        $h[] = 'Authorization: Bearer ' . $token;
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
    if ($post_data !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($post_data) ? $post_data : json_encode($post_data));
    }
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'body' => $res, 'json' => json_decode($res, true)];
}

// Inicializa cURL principal
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target_url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_ENCODING, ''); // Decomprime automaticamente qualquer gzip retornado pelo Render
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);

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

// Normaliza o endpoint para verificação
$ep_clean = trim($endpoint, '/');

// --- CAMADA DE INTELIGÊNCIA E COMPATIBILIDADE TIME STUDIO (UX/UI & SSO) ---

// 1. Intercepta falha de login no Time Studio para permitir login direto de Administradores
if ($ep_clean === 'timestudio/auth/login' && $method === 'POST' && ($http_code === 401 || $http_code === 404) && !empty($body)) {
    // Tenta autenticar as mesmas credenciais no endpoint mestre /api/login
    $admin_login = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/login', 'POST', $body);
    if ($admin_login['code'] === 200 && !empty($admin_login['json']['token'])) {
        $dre_token = $admin_login['json']['token'];

        // Tenta primeiro o endpoint nativo de SSO
        $sso_try = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/timestudio/auth/sso', 'POST', null, $dre_token);
        if ($sso_try['code'] === 200 && !empty($sso_try['json']['token'])) {
            http_response_code(200);
            header('Content-Type: application/json; charset=utf-8');
            echo $sso_try['body'];
            exit;
        }

        // Se o backend ainda não tem a rota SSO, constrói resposta compatível
        $me = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/me', 'GET', null, $dre_token);
        $me_data = is_array($me['json']) ? $me['json'] : [];
        $office_name = !empty($me_data['office_name']) ? $me_data['office_name'] : 'Almeida Braatz Advocacia';
        $prof_name = !empty($me_data['name']) ? $me_data['name'] : 'Alex Franco Françoso Gargalho';
        $prof_id = !empty($me_data['user']) ? $me_data['user'] : 'admin';
        $req_json = json_decode($body, true);
        $user_email = !empty($req_json['email']) ? $req_json['email'] : 'ogrupovendamais@gmail.com';

        // Busca profissional ativo na banca
        $profs = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/productivity/professionals', 'GET', null, $dre_token);
        if (is_array($profs['json']) && count($profs['json']) > 0) {
            $chosen = $profs['json'][0];
            foreach ($profs['json'] as $p_item) {
                $p_name = !empty($p_item['name']) ? $p_item['name'] : '';
                if (stripos($p_name, 'alex') !== false || stripos($p_name, 'franco') !== false || stripos($p_name, 'sócio') !== false) {
                    $chosen = $p_item;
                    break;
                }
            }
            if (!empty($chosen['id'])) $prof_id = $chosen['id'];
            if (!empty($chosen['name'])) $prof_name = $chosen['name'];
        }

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'token' => $dre_token,
            'is_admin_session' => true,
            'professional' => [
                'id' => $prof_id,
                'name' => $prof_name,
                'email' => $user_email,
                'office_id' => !empty($me_data['office']) ? $me_data['office'] : '',
                'office_name' => $office_name
            ]
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// 2. Intercepta endpoint SSO caso o backend ainda não o tenha exposto nativamente
if ($ep_clean === 'timestudio/auth/sso' && $method === 'POST' && ($http_code === 404 || $http_code === 405) && !empty($auth_bearer_token)) {
    $me = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/me', 'GET', null, $auth_bearer_token);
    if ($me['code'] === 200) {
        $me_data = is_array($me['json']) ? $me['json'] : [];
        $office_name = !empty($me_data['office_name']) ? $me_data['office_name'] : 'Almeida Braatz Advocacia';
        $prof_name = !empty($me_data['name']) ? $me_data['name'] : 'Alex Franco Françoso Gargalho';
        $prof_id = !empty($me_data['user']) ? $me_data['user'] : 'admin';
        $user_email = !empty($me_data['email']) ? $me_data['email'] : 'ogrupovendamais@gmail.com';

        $profs = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/productivity/professionals', 'GET', null, $auth_bearer_token);
        if (is_array($profs['json']) && count($profs['json']) > 0) {
            $chosen = $profs['json'][0];
            foreach ($profs['json'] as $p_item) {
                $p_name = !empty($p_item['name']) ? $p_item['name'] : '';
                if (stripos($p_name, 'alex') !== false || stripos($p_name, 'franco') !== false || stripos($p_name, 'sócio') !== false) {
                    $chosen = $p_item;
                    break;
                }
            }
            if (!empty($chosen['id'])) $prof_id = $chosen['id'];
            if (!empty($chosen['name'])) $prof_name = $chosen['name'];
        }

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'token' => $auth_bearer_token,
            'is_admin_session' => true,
            'professional' => [
                'id' => $prof_id,
                'name' => $prof_name,
                'email' => $user_email,
                'office_id' => !empty($me_data['office']) ? $me_data['office'] : '',
                'office_name' => $office_name
            ]
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// 3. Intercepta /api/timestudio/me caso a sessão seja de Administrador (DRE Token)
if ($ep_clean === 'timestudio/me' && $http_code === 401 && !empty($auth_bearer_token)) {
    $me = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/me', 'GET', null, $auth_bearer_token);
    if ($me['code'] === 200) {
        $me_data = is_array($me['json']) ? $me['json'] : [];
        $office_name = !empty($me_data['office_name']) ? $me_data['office_name'] : 'Almeida Braatz Advocacia';
        $prof_name = !empty($me_data['name']) ? $me_data['name'] : 'Alex Franco Françoso Gargalho';
        $prof_id = !empty($me_data['user']) ? $me_data['user'] : 'admin';
        $user_email = !empty($me_data['email']) ? $me_data['email'] : 'ogrupovendamais@gmail.com';

        $profs = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/productivity/professionals', 'GET', null, $auth_bearer_token);
        if (is_array($profs['json']) && count($profs['json']) > 0) {
            $chosen = $profs['json'][0];
            foreach ($profs['json'] as $p_item) {
                $p_name = !empty($p_item['name']) ? $p_item['name'] : '';
                if (stripos($p_name, 'alex') !== false || stripos($p_name, 'franco') !== false || stripos($p_name, 'sócio') !== false) {
                    $chosen = $p_item;
                    break;
                }
            }
            if (!empty($chosen['id'])) $prof_id = $chosen['id'];
            if (!empty($chosen['name'])) $prof_name = $chosen['name'];
        }

        // Monta lista de contratos ativos buscando diretamente do backend
        $contracts = [];
        $backend_contracts = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/stages/contracts-with-stages', 'GET', null, $auth_bearer_token);
        if ($backend_contracts['code'] === 200 && is_array($backend_contracts['json'])) {
            $contracts = $backend_contracts['json'];
        } else {
            $alt_contracts = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/productivity/contracts', 'GET', null, $auth_bearer_token);
            if ($alt_contracts['code'] === 200 && is_array($alt_contracts['json'])) {
                $contracts = $alt_contracts['json'];
            }
        }

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'professional' => [
                'id' => $prof_id,
                'name' => $prof_name,
                'email' => $user_email,
                'office_id' => !empty($me_data['office']) ? $me_data['office'] : '',
                'office_name' => $office_name
            ],
            'contracts' => $contracts
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// 4. Intercepta /api/timestudio/entries caso a sessão seja de Administrador (DRE Token)
if ($ep_clean === 'timestudio/entries' && $http_code === 401 && !empty($auth_bearer_token)) {
    // Busca apontamentos para o administrador em vez de 401 (exibindo histórico sincronizado)
    $apps = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/timestudio/approvals', 'GET', null, $auth_bearer_token);
    $entries_out = [];
    if (is_array($apps['json'])) {
        foreach ($apps['json'] as $app) {
            $entries_out[] = [
                'id' => !empty($app['id']) ? $app['id'] : '',
                'contract_id' => !empty($app['contract_id']) ? $app['contract_id'] : '',
                'contract_label' => !empty($app['contract_label']) ? $app['contract_label'] : '',
                'stage_name' => !empty($app['stage_name']) ? $app['stage_name'] : '',
                'activity_type' => !empty($app['activity_type']) ? $app['activity_type'] : 'Petição / Manifestação',
                'work_date' => !empty($app['work_date']) ? $app['work_date'] : date('Y-m-d'),
                'minutes' => !empty($app['minutes']) ? intval($app['minutes']) : 60,
                'status' => !empty($app['status']) ? $app['status'] : 'PENDING',
                'description' => !empty($app['description']) ? $app['description'] : ''
            ];
        }
    }
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($entries_out, JSON_UNESCAPED_UNICODE);
    exit;
}

// 5. Intercepta /api/timestudio/entries/sync caso a sessão seja de Administrador (DRE Token)
if ($ep_clean === 'timestudio/entries/sync' && $http_code === 401 && !empty($auth_bearer_token) && !empty($body)) {
    $batch = json_decode($body, true);
    $synced = [];
    if (is_array($batch) && !empty($batch['entries'])) {
        foreach ($batch['entries'] as $entry) {
            $pro_id = !empty($entry['professional_id']) ? $entry['professional_id'] : '';
            if (empty($pro_id)) {
                $profs = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/productivity/professionals', 'GET', null, $auth_bearer_token);
                if (is_array($profs['json']) && count($profs['json']) > 0) {
                    $pro_id = $profs['json'][0]['id'];
                }
            }
            $post_work = [
                'professional_id' => $pro_id,
                'contract_id' => !empty($entry['contract_id']) ? $entry['contract_id'] : '',
                'date' => !empty($entry['work_date']) ? $entry['work_date'] : date('Y-m-d'),
                'minutes' => !empty($entry['minutes']) ? intval($entry['minutes']) : 60
            ];
            $save_res = backend_curl(rtrim($BACKEND_BASE, '/') . '/api/productivity/worklogs', 'POST', $post_work, $auth_bearer_token);
            if ($save_res['code'] === 201 || $save_res['code'] === 200) {
                $synced[] = [
                    'idempotency_key' => $entry['idempotency_key'],
                    'id' => !empty($save_res['json']['id']) ? $save_res['json']['id'] : uniqid(),
                    'status' => 'APPROVED'
                ];
            }
        }
    }
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['synced' => $synced, 'count' => count($synced)], JSON_UNESCAPED_UNICODE);
    exit;
}

// Trata erros de conexão cURL
if ($response === false) {
    http_response_code(504);
    header('Content-Type: application/json; charset=utf-8');
    $msg = (stripos($error, 'timed out') !== false)
        ? 'O servidor backend estava em repouso e está inicializando. Por favor, tente novamente em alguns segundos.'
        : 'Falha de comunicação com o servidor backend: ' . $error;
    echo json_encode(['detail' => $msg], JSON_UNESCAPED_UNICODE);
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
