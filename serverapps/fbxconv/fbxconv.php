<?php

	function deleteDir($dirPath) {
		if (! is_dir($dirPath)) {
			throw new InvalidArgumentException("$dirPath must be a directory");
		}
		if (substr($dirPath, strlen($dirPath) - 1, 1) != '/') {
			$dirPath .= '/';
		}
		$files = glob($dirPath . '*', GLOB_MARK);
		foreach ($files as $file) {
			if (is_dir($file)) {
				deleteDir($file);
			} else {
				unlink($file);
			}
		}
		rmdir($dirPath);
	}


	$tempfilename = "";

	if(isset($_REQUEST["done"]))
	{
		$filebasename = $_REQUEST["done"];
		if(strpos($filebasename,"..") !== false || $filebasename[0] == "/")
			die('{"status": 0 }');

		unlink( $filebasename );
		unlink( $filebasename . ".fbx" );
		unlink( $filebasename . ".g3dj" );
		if(is_dir( $filebasename . ".fbm"))
			deleteDir( $filebasename . ".fbm" );
		die('{"status": 1 }');
	}


	if(!isset($_FILES["fbx"]))
	{
		$postmaxsize = ini_get("post_max_size");
		$uploadmaxsize = ini_get("upload_max_size");
		die ('{"error": "FBX not found in request, maybe it was too big. Max size is: '. $postmaxsize .'"}');
	}

	$file = $_FILES["fbx"];
	$filename = $file["tmp_name"]; 
	$data = file( $file["tmp_name"] ); //read content
	$tempfilename = "temp/" . basename($filename); //  "temp/phpSomething.fbx"
	file_put_contents( $tempfilename, $data ); //store it in temp/

	$program = "./fbx-conv-lin64";
	putenv("LD_LIBRARY_PATH=" . __DIR__ );

	if( !is_file( $tempfilename ) )
		die ('{"error": "FBX not stored in disk", "filename":"'.$tempfilename.'"}' );

	$cmd = $program . " -o G3DJ -b 64 " . $tempfilename . " 2>&1";
	$str = exec($cmd, $out);
	$output = join($out,"|");
	//echo $output;
	//die($output);

	header("Content-type: application/json");
	//header("X-command-output: " . $output );
	header("X-file-length: " . count($data) );
	header("X-debug: " . $file["tmp_name"] );

	$filebasename = "temp/" . (basename( $tempfilename, ".fbx" ));


	if( !is_file( $filebasename . ".g3dj" ) )
	{
		//http_response_code(400); //bad request
		die('{"error": "error parsing FBX"}' );
	}

	$result = Array();
	$result["status"] = 1;
	$result["scene_path"] = $filebasename . ".g3dj";
	$result["scene_name"] = $filebasename;

	$mediafolder = $filebasename . ".fbm";
	if( is_dir( $mediafolder ) )
	{
		$result["images"] = Array();
		if ($handle = opendir($mediafolder))
		{
			while (false !== ($file = readdir($handle)))
			{
				if ('.' === $file) continue;
				if ('..' === $file) continue;
				$result["images"][] = $mediafolder . "/" . $file;
			}
			closedir($handle);
		}
	}

	if(isset($_REQUEST["immediate"]))
		$result["scene"] = file_get_contents( $filebasename . ".g3dj" );

	$str = json_encode( $result );
	header("Content-length: " . strlen($str) );

	echo $str;

	//echo file_get_contents( $filebasename . ".g3dj" );

	//what about pictures?
	//TODO

	//erase all files
	if(0)
	{
		unlink( $filebasename );
		unlink( $filebasename . ".fbx" );
		unlink( $filebasename . ".g3dj" );
		if(is_dir( $filebasename . ".fbm"))
			deleteDir( $filebasename . ".fbm" );
	}
?>