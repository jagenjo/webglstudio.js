LS.fbxconv_folder = window.location.origin + window.location.pathname + "../serverapps/fbxconv/";
LS.fbxconv_path = LS.fbxconv_folder + "/fbxconv.php";

LS.ResourcesManager.registerResourcePreProcessor("fbx", function( filename, data, options ) {

	var formdata = new FormData();
	formdata.append("fbx", new Blob([data]));
	formdata.append("immediate","true");

	var notify_id = "res-msg-" + filename.hashCode();
	var notification = NotifyModule.show("Uploading FBX: " + filename, { id: notify_id, closable: true, time: 0, left: 60, top: 30, parent: "#visor" } );

	LS.Network.request({
		url: LS.fbxconv_path,
		dataType: "json",
		data: formdata,
		success: function(d)
		{
			if(!d)
			{
				var log = this.getResponseHeader("X-command-output");
				if( log )
					log = log.split("|").join("\n");
				else
					log = "empty response";
				console.error("Empty result from FBXCONV:", log );
				return;
			}

			if(d.error)
			{
				console.error("Error parsing FBX:",d.error);
				return null;
			}

			var path = d.scene_name;
			console.log(d);
			if(d.scene)
			{
				LS.ResourcesManager.processResource( filename + ".g3dj", d.scene, options, function(fullpath, res){
				if(res)
					LS.GlobalScene.root.addChild( res );
				});
			}

			//load images
			if(d.images)
			{
				for(var i in d.images)
					LS.ResourcesManager.load( LS.fbxconv_folder + d.images[i], { filename: LS.RM.getFilename( d.images[i] ), is_local: true } );
			}

			//request free space in disk
			if(path)
				setTimeout( function(){
					LS.Network.requestJSON( LS.fbxconv_path + "?done=" + path );
				}, 20000 );
		},
		uploadProgress: function(e,v)
		{
			notification.setProgress( v );
		},
		progress: function(e, v)
		{
			notification.setContent( "Downloading Data: " + filename );
			notification.setProgress( v );
		}
	});

	return true;
},"binary");

