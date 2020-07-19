<?php
 $variables = [
      'secret' => '6LePM7AZAAAAANAB-CeSJvkiGDMGltHmc3xEIchF',
  ];

  foreach ($variables as $key => $value) {
    putenv("$key=$value");
}

if(!function_exists('env')) {
    function env($key, $default = null)
    {
        $value = getenv($key);
        if ($value === false) {
            return $default;
        }
        return $value;
    }
}