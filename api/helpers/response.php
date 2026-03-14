<?php
class Response {
    public static function success($data = null, string $message = 'OK', int $code = 200): void {
        http_response_code($code);
        echo json_encode([
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ]);
        exit();
    }
    public static function error(string $message, int $code = 400, $errors = null): void {
        http_response_code($code);
        echo json_encode(array_filter([
            'success' => false,
            'message' => $message,
            'errors'  => $errors,
        ]));
        exit();
    }
    public static function paginated(array $data, int $total, int $page, int $perPage): void {
        http_response_code(200);
        echo json_encode([
            'success'     => true,
            'data'        => $data,
            'pagination'  => [
                'total'    => $total,
                'page'     => $page,
                'per_page' => $perPage,
                'pages'    => (int) ceil($total / $perPage),
            ],
        ]);
        exit();
    }
}
