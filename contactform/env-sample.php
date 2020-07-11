<?php
//  Environment sample file by Kanyesigye Akbr - 16 Oct 2018

 $variables = [
      'var_name' => 'var_value'
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