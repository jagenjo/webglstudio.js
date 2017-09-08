<?php
/* 
	Deployer.php by Javi Agenjo (2017) is a script that enabled to deploy a series of remote files to a folder in this machine.
	Created for WebGLStudio, it can be used in any project. It requires a json with a list of files to download.
 */

	if(file_exists('config.php'))
		require('config.php');
	else
		die('{"status":-1,"msg":"config.php not found. remember to copy config.sample.php to config.php as you edit the content."}');
	
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

		$now = microtime();

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
			//CURLOPT_RETURNTRANSFER => 1,
			CURLOPT_FILE           => $file,
			CURLOPT_TIMEOUT        => 50,
			CURLOPT_USERAGENT      => 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)'
		]);

		$result = curl_exec($curl);

		if($result === false) {
			echo 'Curl error: ' . curl_error($curl);
			curl_close($curl);
			return false;
		}

		//check if there was an error
		$code = curl_getinfo( $curl, CURLINFO_HTTP_CODE );
		curl_close($curl);

		if($code !== 200)
		{
			echo "[STATUS:". strval($code). "]";
			//echo print_r(curl_getinfo( $curl ),true);
			return false;
		}

		$elapsed = microtime() - $now;
		echo " " . number_format( ($elapsed * 0.001), 2, '.', '') ."ms ";

		return true;
	}

	//read data
	if(!$from_console)
	{
		//allow to deploy from any remote server
		header("Access-Control-Allow-Origin: *");
		header('Content-Type: application/json');

		if( isset($_REQUEST["action"]) )
		{
			$action = $_REQUEST["action"];
			if($action == "test")
				die('{"status":1,"msg":"ready"}');
			else if($action == "report")
			{
				if( !isset($_REQUEST["token"]) )
					die('{"status":-1,"msg":"params missing"}');
				$token = $_REQUEST["token"];
				if( !file_exists( "deploy_" . $token . ".log") )
					die('{"status":-1,"msg":"deploy not found"}');
				$content = file_get_contents( "deploy_" . $token . ".log" );
				$content = str_replace( "\n","\\n", $content );
				$content = addslashes( $content );
				die('{"status":1,"msg":"report","log":"'.$content.'"}');
			}
			else if($action == "end")
			{
				if( !isset($_REQUEST["token"]) )
					die('{"status":-1,"msg":"params missing"}');
				$token = $_REQUEST["token"];
				if( !ctype_alnum( $token ) )
					die('{"status":-1,"msg":"incorrect token"}');

				if( !file_exists( "deploy_" . $token . ".log") )
					die('{"status":-1,"msg":"deploy not found"}');
				unlink( "deploy_" . $token . ".log" ); //delete
				die('{"status":1,"msg":"end"}');
			}
			else
				die('{"status":0,"msg":"unknown action"}');
		}

		if( empty($KEY) )
			die('{"status":-1,"msg":"local key not set, remember to change the local key in the top of the deployer.php file"}');

		if( !isset($_REQUEST["key"]) )
			die('{"status":-1,"msg":"params missing"}');

		$key = $_REQUEST["key"];

		if( strlen($key) > 0 && !ctype_alnum( $key ) ) //avoid using the key to hack the system
			die('{"status":-1,"msg":"incorrect key"}');

		if( isset($_REQUEST["info"]) )
		{
			if( $key !== $KEY )
			{
				die('{"status":-1,"msg":"wrong key"}');
			}

			$token = md5(uniqid(rand(), true));
			$log_file = "deploy_" . $token . ".log";
			$info_filename = $BASE_DEPLOY_FOLDER . "/" . $token . ".json";
			$data = $_REQUEST["info"];
			mkdir( $BASE_DEPLOY_FOLDER, 0774, true );
			$temp = fopen( $info_filename, "w" );
			fwrite( $temp, $data );
			fclose( $temp );
			if(!file_exists( $info_filename ))
				die('{"status":-1,"msg":"error, no writing privileges in destination folder"}');
			$output = shell_exec('nohup php -q deployer.php '.$info_filename.' 2>&1 >> '.$log_file.' &');
			die('{"status":1,"msg":"processing","token":"'.$token.'"}');
		}
		die('{"status":0,"msg":"nothing"}');
	}

	if( count($argv) < 2 )
		die("missing info\nDONE\n");

	$input_filename = $argv[1];
	echo "Input file: ". $input_filename ."\n";
	if(!file_exists( $input_filename ))
		die("file info not found\nDONE\n");
	$info_data = file_get_contents( $input_filename );
	//unlink( $input_filename ); //remove json
	$info = json_decode($info_data);
	if($info == null)
		die("ERROR: file is not a valid json: ".$input_filename."\nDONE\n");

	$files_to_download = $info->files;
	$base_path = $info->base_path;

	//avoid weird hacks to store files outside of deploy folder
	if( strpos( $info->project_folder, ".." ) != false )
		die("ERROR: project folder not valid: ".$info->project_folder."\nDONE\n");
	
	$project_folder = $BASE_DEPLOY_FOLDER . "/" . $info->project_folder;

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

	echo "DONE\n";
?>
