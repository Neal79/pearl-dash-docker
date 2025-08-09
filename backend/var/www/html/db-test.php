<?php
try {
    $pdo = new PDO('mysql:host=db;port=3306;dbname=pearl_dash', 'pearldashuser', 'LaneChicago1997!');
    echo "Database connected successfully\n";
    exit(0);
} catch (PDOException $e) {
    echo "Database connection failed: " . $e->getMessage() . "\n";
    exit(1);
}
