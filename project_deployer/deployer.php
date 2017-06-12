<?php

	//CONFIGURE HERE *****************

	$KEY = "";
	$BASE_DEPLOY_FOLDER = "deploy/";
	$LOG_FILE = "log.txt";
	$IGNORE_EXTENSIONS = "php,asp,jsp,vbs,exe";

	//*************************************


	$from_console = php_sapi_name() == 'cli';
	$ignore_extensions = explode( $IGNORE_EXTENSIONS, "," );


	function downloadFile( $url, $output_filename )
	{
		global $ignore_extensions;

		set_time_limit(0);

		$url_path = parse_url($url)["path"];
		$filename = basename($url_path);
		$extension = strtolower( pathinfo($filename)["extension"] );
		if( array_search( $extension, $ignore_extensions ) != false )
		{
			echo "[File type forbidden:" . $extension . "]";
			return false;		
		}

		$file = fopen( $output_filename, 'w+');
		if(!$file)
		{
			echo "[cannot create file]";
			return false;
		}
		$curl = curl_init($url);

		// Update as of PHP 5.4 array() can be written []
		curl_setopt_array( $curl, [
			CURLOPT_URL            => $url,
			CURLOPT_FOLLOWLOCATION => true, 
			CURLOPT_RETURNTRANSFER => 1,
			CURLOPT_FILE           => $file,
			CURLOPT_TIMEOUT        => 50,
			CURLOPT_USERAGENT      => 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)'
		]);

		$content = curl_exec($curl);
		curl_close($curl);

		if($content === false) {
			// Update as of PHP 5.3 use of Namespaces Exception() becomes \Exception()
			throw new \Exception('Curl error: ' . curl_error($curl));
		}

		return true;
	}

	//read data
	if(!$from_console)
	{
		if( empty($KEY) )
		{
			die('{"status":-1,"msg":"key not set"}');
		}

		if( !isset($_REQUEST["key"]) )
		{
			die('{"status":-1,"msg":"params missing"}');
		}

		if( isset($_REQUEST["info"]) )
		{
			if( $_REQUEST["key"] !== $KEY )
			{
				die('{"status":-1,"msg":"wrong key"}');
			}

			$token = md5(uniqid(rand(), true));
			$info_filename = $BASE_DEPLOY_FOLDER . $token . ".json";
			$data = $_REQUEST["info"];
			$temp = fopen( $info_filename, "w" );
			fwrite( $temp, $data );
			fclose( $temp );
			if(!file_exists( $info_filename ))
				die('{"status":-1,"msg":"error, no writing privileges in folder"}');
			$output = shell_exec('nohup php -q deployer.php '.$info_filename.' 2>&1 >> '.$LOG_FILE.' &');
			//	die('{"status":-1,"msg":"error executing command"}');
			die('{"status":1,"msg":"processing","id":"'.$token.'"}');
		}
		else if( isset($_REQUEST["action"])  && $_REQUEST["action"] == "state" )
		{
			//...
		}
		die('{"status":0,"msg":"nothing"}');
	}

	if( count($argv) < 2 )
		die("missing info\n");

	$input_filename = $argv[1];
	echo "Input file: ". $input_filename ."\n";
	if(!file_exists( $input_filename ))
		die("file info not found\n");
	$info_data = file_get_contents( $input_filename );
	//unlink( $input_filename );
	$info = json_decode($info_data);
	if($info == null)
	{
		die("ERROR: file is not a valid json: ".$input_filename."\n");
	}

	$files_to_download = $info->files;
	$base_path = $info->base_path;
	$project_folder = $BASE_DEPLOY_FOLDER . "/" . $info->project_folder;

	//VALIDATE DATA
	//...

	//DOWNLOAD DATA
	mkdir( $project_folder, 0774, true );
	echo " - Downloading SCENE: " . $info->scene . "...";
	if( downloadFile( $base_path . "/" . $info->scene, $project_folder . "/scene.json" ) )
		echo " [OK]\n";
	else
		echo " [ERROR]\n";

	for( $i = 0; $i < count( $files_to_download ); $i++ )
	{
		$filename = $files_to_download[$i];
		$folder = $project_folder . "/" . dirname( $filename );
		mkdir( $folder, 0774, true );
		echo " - Downloading: " . $filename . "...";
		if(!downloadFile( $base_path . "/" . $filename,  $project_folder . "/" . $filename ))
			echo " [ERROR]\n";
		else
			echo " [OK]\n";
	}

	echo "deploy done\n";
?>
