var ExportModule = {

	player_files: [
		"player.html",
		"js/extra/gl-matrix-min.js",
		"js/extra/litegl.js",
		"js/extra/litegraph.js",
		"js/extra/Canvas2DtoWebGL.js",
		"js/extra/litescene.js",
		"data/shaders.xml"
	],

	init: function()
	{
		LiteGUI.menubar.add("Project/Export/to OBJ", { callback: function() { 
			ExportModule.exportToOBJ();
		}});

		LiteGUI.menubar.add("Project/Export/to ZIP", { callback: function() { 
			ExportModule.exportToZIP();
		}});

		LiteGUI.menubar.add("Project/Export/to ZIP (include Player)", { callback: function() { 
			ExportModule.exportToZIP(true);
		}});

		LiteGUI.requireScript("js/extra/jszip.min.js");
	},

	exportToOBJ: function()
	{
		var meshes = [];
		for(var i = 0; i < LS.Renderer._visible_instances.length; i++)
		{
			var ri = LS.Renderer._visible_instances[i];
			meshes.push( { mesh: ri.mesh, vertices_matrix: ri.matrix, normals_matrix: ri.normal_matrix } );
		}
		if(!meshes.length)
			return;
		var final_mesh = GL.Mesh.mergeMeshes( meshes );
		LS.RM.registerResource( "export.obj", final_mesh );
		var data = final_mesh.encode("obj");
		LiteGUI.downloadFile("export.OBJ", data );
	},

	exportToZIP: function( include_player )
	{
		if(!window.JSZip)
		{
			LiteGUI.alert("JSZIP.js not found.");
			return;
		}

		//get all resource names
		var resources = [];
		var resource_names = LS.GlobalScene.getResources( null, true, true );
		for(var i in resource_names)
		{
			var res = LS.RM.getResource( resource_names[i] );
			if(res)
				resources.push(res);
		}

		var zip = new JSZip();

		//scene info
		zip.file("scene.json", JSON.stringify( LS.GlobalScene.serialize() ) );

		//resources
		var res_data = LS.RM.getResourcesData( resource_names );
		for(var i in res_data)
			zip.file(i, res_data[i]);

		var filename = "scene.zip";

		if( include_player )
			this.loadPlayerFiles( zip, inner_ready );
		else
			inner_ready();

		function inner_ready()
		{
			//create ZIP file
			zip.generateAsync({type:"blob"}).then(function(content) {
				LiteGUI.downloadFile( filename, content );
			});
		}
	},

	loadPlayerFiles: function( zip, on_complete )
	{
		//it could be nice to add a dialog to config the player options here
		var player_options = { 
			resources: "./",
			scene_url: "scene.json"
		};
		zip.file( "config.json", JSON.stringify( player_options ) );

		var files = this.player_files.concat();
		var filename = files.pop();
		LS.Network.requestFile( filename, inner );

		function inner( file )
		{
			//change player to index
			if(filename == "player.html")
				filename = "index.html";
			//add to zip
			zip.file( filename, file );

			if(!files.length)
				on_complete();
			//seek another file
			filename = files.pop();
			LS.Network.requestFile( filename, inner );
		}
	}
}

CORE.registerModule( ExportModule );